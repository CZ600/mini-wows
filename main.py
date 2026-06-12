from fastapi import FastAPI, Depends, HTTPException, Header, Query, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
import jwt
import os

from database import (
    init_db, create_user, authenticate_user, get_user_by_id,
    get_all_users, update_user, delete_user, change_password,
    get_or_create_player, create_game, finish_game,
    get_player_history, get_leaderboard,
    get_player_level, update_player_level, reset_player_level,
    get_player_ship_class, update_player_ship_class,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

from settings import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="未登录")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user = await get_user_by_id(payload.get("id"))
        if not user:
            raise HTTPException(status_code=401, detail="用户不存在")
        if not user["is_active"]:
            raise HTTPException(status_code=401, detail="账号已被禁用")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="登录已过期")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="无效令牌")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


# ── Request models ──

class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    new_password: str


class PlayerRequest(BaseModel):
    name: str


class GameEndRequest(BaseModel):
    score: int
    level: int
    enemies: int
    result: str


class ProgressRequest(BaseModel):
    level: int = Field(ge=1, le=10)


class ShipClassRequest(BaseModel):
    shipClass: str


class AdminUpdateRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None


# ── Auth routes ──

@app.on_event("startup")
async def startup():
    await init_db()
    from game.room_manager import room_manager
    await room_manager.start_cleanup_loop()


@app.websocket("/ws")
async def ws_route(ws: WebSocket, token: str = Query(...)):
    from ws import websocket_endpoint
    await websocket_endpoint(ws, token)


@app.post("/api/auth/register")
async def api_register(req: RegisterRequest):
    if len(req.username) < 2 or len(req.username) > 20:
        raise HTTPException(status_code=400, detail="用户名长度需2-20个字符")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="密码长度至少4个字符")
    user = await create_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=400, detail="用户名已存在")
    token = create_access_token({"id": user["id"], "username": user["username"], "role": user["role"]})
    return {"token": token, "user": user}


@app.post("/api/auth/login")
async def api_login(req: LoginRequest):
    user = await authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token({"id": user["id"], "username": user["username"], "role": user["role"]})
    return {"token": token, "user": user}


@app.get("/api/auth/me")
async def api_me(user: dict = Depends(get_current_user)):
    return {"id": user["id"], "username": user["username"], "role": user["role"]}


@app.put("/api/auth/password")
async def api_change_password(req: ChangePasswordRequest, user: dict = Depends(get_current_user)):
    if len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="密码长度至少4个字符")
    await change_password(user["id"], req.new_password)
    return {"status": "ok"}


# ── Admin routes ──

@app.get("/api/admin/users")
async def api_admin_users(admin: dict = Depends(require_admin)):
    users = await get_all_users()
    return users


@app.put("/api/admin/users/{user_id}")
async def api_admin_update(user_id: int, req: AdminUpdateRequest, admin: dict = Depends(require_admin)):
    await update_user(user_id, role=req.role, is_active=req.is_active)
    return {"status": "ok"}


@app.delete("/api/admin/users/{user_id}")
async def api_admin_delete(user_id: int, admin: dict = Depends(require_admin)):
    await delete_user(user_id)
    return {"status": "ok"}


# ── Game routes (require auth) ──

@app.post("/api/players")
async def api_create_player(req: PlayerRequest, user: dict = Depends(get_current_user)):
    player_id = await get_or_create_player(req.name, user_id=user["id"])
    return {"id": player_id, "name": req.name}


@app.post("/api/games")
async def api_create_game(player_id: int = Query(...), user: dict = Depends(get_current_user)):
    game_id = await create_game(player_id)
    return {"id": game_id}


@app.put("/api/games/{game_id}")
async def api_finish_game(game_id: int, req: GameEndRequest, user: dict = Depends(get_current_user)):
    await finish_game(game_id, req.score, req.level, req.enemies, req.result)
    return {"status": "ok"}


@app.get("/api/players/{player_id}/history")
async def api_player_history(player_id: int, user: dict = Depends(get_current_user)):
    return await get_player_history(player_id)


@app.get("/api/leaderboard")
async def api_leaderboard():
    return await get_leaderboard()


@app.get("/api/players/{player_id}/progress")
async def api_get_progress(player_id: int, user: dict = Depends(get_current_user)):
    level = await get_player_level(player_id)
    ship_class = await get_player_ship_class(player_id)
    return {"level": level, "shipClass": ship_class}


@app.put("/api/players/{player_id}/progress")
async def api_save_progress(player_id: int, req: ProgressRequest, user: dict = Depends(get_current_user)):
    await update_player_level(player_id, req.level)
    return {"status": "ok"}


@app.post("/api/players/{player_id}/reset-progress")
async def api_reset_progress(player_id: int, user: dict = Depends(get_current_user)):
    await reset_player_level(player_id)
    return {"status": "ok"}


VALID_CLASSES = {"destroyer", "cruiser", "battleship"}


@app.get("/api/players/{player_id}/class")
async def api_get_ship_class(player_id: int, user: dict = Depends(get_current_user)):
    ship_class = await get_player_ship_class(player_id)
    return {"shipClass": ship_class}


@app.put("/api/players/{player_id}/class")
async def api_set_ship_class(player_id: int, req: ShipClassRequest, user: dict = Depends(get_current_user)):
    if req.shipClass not in VALID_CLASSES:
        raise HTTPException(status_code=400, detail="无效的职业类型")
    await update_player_ship_class(player_id, req.shipClass)
    return {"shipClass": req.shipClass}


# ── Serve frontend ──

frontend_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
