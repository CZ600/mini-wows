import asyncio
import jwt
from fastapi import WebSocket, WebSocketDisconnect, Query
from game.room_manager import room_manager
from game.protocol import decode, encode
from settings import SECRET_KEY, ALGORITHM


async def authenticate_ws(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {"id": payload["id"], "username": payload["username"]}
    except Exception:
        return None


async def websocket_endpoint(ws: WebSocket, token: str = Query(...)):
    user = await authenticate_ws(token)
    if not user:
        await ws.close(code=4001)
        return

    await ws.accept()
    player_id = user["id"]
    username = user["username"]
    current_room_id = None

    try:
        while True:
            data = await ws.receive_bytes()
            msg = decode(data)
            msg_type = msg.get("type", "")

            if msg_type == "create_room":
                mode = msg.get("mode", "ffa")
                level = msg.get("level", 1)
                ship_class = msg.get("shipClass")
                respawn_limit = msg.get("respawnLimit", 0)
                room, err = room_manager.create_room(
                    mode, player_id, username, ws, level, ship_class, respawn_limit
                )
                if err:
                    await ws.send_bytes(encode({"type": "error", "msg": err}))
                else:
                    current_room_id = room.room_id
                    info = room.get_room_info()
                    info["type"] = "room_created"
                    await ws.send_bytes(encode(info))

            elif msg_type == "join_room":
                room_id = msg.get("roomId", "")
                level = msg.get("level", 1)
                ship_class = msg.get("shipClass")
                room, err = room_manager.join_room(
                    room_id, player_id, username, ws, level, ship_class
                )
                if err:
                    await ws.send_bytes(encode({"type": "error", "msg": err}))
                else:
                    current_room_id = room.room_id
                    info = room.get_room_info()
                    info["type"] = "room_joined"
                    await ws.send_bytes(encode(info))
                    # Notify others
                    await room._broadcast_room_update()

            elif msg_type == "quick_match":
                mode = msg.get("mode", "ffa")
                level = msg.get("level", 1)
                ship_class = msg.get("shipClass")
                respawn_limit = msg.get("respawnLimit", 0)
                room, err = room_manager.find_quick_match(
                    mode, player_id, username, ws, level, ship_class
                )
                if room:
                    current_room_id = room.room_id
                    info = room.get_room_info()
                    info["type"] = "room_joined"
                    await ws.send_bytes(encode(info))
                    await room._broadcast_room_update()
                else:
                    # Create a new room
                    room, err = room_manager.create_room(
                        mode, player_id, username, ws, level, ship_class, respawn_limit
                    )
                    if room:
                        current_room_id = room.room_id
                        info = room.get_room_info()
                        info["type"] = "room_created"
                        await ws.send_bytes(encode(info))

            elif msg_type == "set_ship_class":
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
                    conn = room.players.get(player_id)
                    if conn:
                        conn.ship_class = msg.get("shipClass")
                        await room._broadcast_room_update()

            elif msg_type == "ready":
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
                    # For level 4+ rooms, require ship class selection
                    if room.room_level >= 4:
                        conn = room.players.get(player_id)
                        if conn and not conn.ship_class:
                            await ws.send_bytes(encode({"type": "error", "msg": "请选择舰船类型"}))
                            continue
                    room.set_ready(player_id, True)
                    await room._broadcast_room_update()
                    # Try countdown
                    asyncio.create_task(room.start_countdown())

            elif msg_type == "leave_room":
                if current_room_id:
                    room_manager.leave_room(current_room_id, player_id)
                    room = room_manager.get_room(current_room_id)
                    if room:
                        await room._broadcast_room_update()
                    current_room_id = None

            elif msg_type in ("input", "fire", "fire_torpedo", "activate_skill"):
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
                    # Echo client timestamp back for client-side RTT calculation
                    conn = room.players.get(player_id)
                    if conn:
                        conn.last_client_ts = msg.get("ts", 0)
                    room.queue_input(player_id, msg)

            elif msg_type == "chat":
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
                    await room._broadcast({
                        "type": "chat",
                        "from": username,
                        "msg": msg.get("msg", ""),
                    })

    except WebSocketDisconnect:
        if current_room_id:
            room = room_manager.get_room(current_room_id)
            if room:
                room.remove_player(player_id)
                await room._broadcast_room_update()
    except Exception as e:
        print(f"WS error for {username}: {e}")
    finally:
        if current_room_id:
            room_manager.leave_room(current_room_id, player_id)
            room = room_manager.get_room(current_room_id)
            if room:
                await room._broadcast_room_update()
