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
                room, err = room_manager.create_room(
                    mode, player_id, username, ws, level, ship_class
                )
                if err:
                    await ws.send_bytes(encode({"type": "error", "msg": err}))
                else:
                    current_room_id = room.room_id
                    await ws.send_bytes(encode({
                        "type": "room_created",
                        "roomId": room.room_id,
                        "mode": room.mode,
                        "players": room.get_player_list(),
                        "terrainSeed": room.terrain_seed,
                        "islands": room.islands,
                    }))

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
                    await ws.send_bytes(encode({
                        "type": "room_joined",
                        "roomId": room.room_id,
                        "mode": room.mode,
                        "players": room.get_player_list(),
                        "terrainSeed": room.terrain_seed,
                        "islands": room.islands,
                    }))
                    # Notify others
                    await room._broadcast_room_update()

            elif msg_type == "quick_match":
                mode = msg.get("mode", "ffa")
                level = msg.get("level", 1)
                ship_class = msg.get("shipClass")
                room, err = room_manager.find_quick_match(
                    mode, player_id, username, ws, level, ship_class
                )
                if room:
                    current_room_id = room.room_id
                    await ws.send_bytes(encode({
                        "type": "room_joined",
                        "roomId": room.room_id,
                        "mode": room.mode,
                        "players": room.get_player_list(),
                        "terrainSeed": room.terrain_seed,
                        "islands": room.islands,
                    }))
                    await room._broadcast_room_update()
                else:
                    # Create a new room
                    room, err = room_manager.create_room(
                        mode, player_id, username, ws, level, ship_class
                    )
                    if room:
                        current_room_id = room.room_id
                        await ws.send_bytes(encode({
                            "type": "room_created",
                            "roomId": room.room_id,
                            "mode": room.mode,
                            "players": room.get_player_list(),
                            "terrainSeed": room.terrain_seed,
                            "islands": room.islands,
                        }))

            elif msg_type == "ready":
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
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

            elif msg_type in ("input", "fire", "fire_torpedo"):
                room = room_manager.get_room(current_room_id) if current_room_id else None
                if room:
                    # Calculate ping from timestamp
                    ts = msg.get("ts", 0)
                    if ts:
                        import time
                        conn = room.players.get(player_id)
                        if conn:
                            conn.ping = int((time.time() * 1000 - ts) / 2)
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
