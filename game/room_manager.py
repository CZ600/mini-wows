import asyncio
import time
from game.config import MODE_CONFIG, ROOM_CLEANUP_DELAY
from game.room import Room
from game.protocol import encode


class RoomManager:
    def __init__(self):
        self.rooms = {}
        self._next_id = 1
        self._cleanup_task = None

    async def start_cleanup_loop(self):
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        while True:
            await asyncio.sleep(30)
            now = time.monotonic()
            to_remove = []
            for rid, room in self.rooms.items():
                if room.state.value == "ended":
                    if not hasattr(room, '_end_time'):
                        room._end_time = now
                    elif now - room._end_time > ROOM_CLEANUP_DELAY:
                        to_remove.append(rid)
                elif room._connected_count() == 0:
                    if not hasattr(room, '_empty_time'):
                        room._empty_time = now
                    elif now - room._empty_time > ROOM_CLEANUP_DELAY:
                        to_remove.append(rid)
            for rid in to_remove:
                # dissolve_room pops the room and cancels its background
                # tasks (countdown / tick loop). Used here as a safety net for
                # rooms that became empty outside the leave_room path.
                await self.dissolve_room(rid)

    async def cleanup(self):
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for room in self.rooms.values():
            await room.cleanup()
        self.rooms.clear()

    def create_room(self, mode="ffa", player_id=None, username=None, ws=None,
                    level=1, ship_class=None, respawn_limit=0):
        if mode not in MODE_CONFIG:
            return None, "Invalid mode"

        mc = MODE_CONFIG[mode]
        room_id = f"r{self._next_id}"
        self._next_id += 1

        room = Room(room_id, mode, host_id=player_id, room_level=level, respawn_limit=respawn_limit)
        self.rooms[room_id] = room

        if player_id and ws:
            room.add_player(player_id, username, ws, level, ship_class)

        return room, None

    def join_room(self, room_id, player_id, username, ws, level=1, ship_class=None):
        room = self.rooms.get(room_id)
        if not room:
            return None, "Room not found"
        if room.state.value not in ("waiting", "countdown"):
            return None, "Game already in progress"

        mc = MODE_CONFIG.get(room.mode, MODE_CONFIG["ffa"])
        connected = room._connected_count()
        if connected >= mc["max"]:
            return None, "Room is full"

        # Check if player is reconnecting
        existing = room.players.get(player_id)
        if existing:
            room.reconnect_player(player_id, ws)
            return room, None

        room.add_player(player_id, username, ws, level, ship_class)
        return room, None

    async def leave_room(self, room_id, player_id):
        room = self.rooms.get(room_id)
        if not room:
            return
        room.remove_player(player_id)
        if room._connected_count() == 0:
            # 最后一名玩家离开 → 立即解散房间，释放资源并从列表移除，
            # 不再等待 _cleanup_loop 的 30s 延迟。
            await self.dissolve_room(room_id)
        else:
            # 房间仍有人在线，清除可能残留的空房计时标记。
            room._empty_time = None

    async def dissolve_room(self, room_id) -> bool:
        """立即从注册表移除房间并取消其后台任务（倒计时/tick 循环）。

        幂等：对不存在的 room_id 返回 False。供 leave_room（空房即时解散）、
        _cleanup_loop（兜底）以及 force_close_room 复用。
        """
        room = self.rooms.pop(room_id, None)
        if not room:
            return False
        await room.cleanup()
        return True

    def get_room(self, room_id):
        return self.rooms.get(room_id)

    def find_quick_match(self, mode, player_id, username, ws, level=1, ship_class=None):
        mc = MODE_CONFIG.get(mode, MODE_CONFIG["ffa"])
        for room in self.rooms.values():
            if room.mode == mode and room.state.value == "waiting":
                connected = room._connected_count()
                if connected < mc["max"]:
                    result = self.join_room(
                        room.room_id, player_id, username, ws, level, ship_class
                    )
                    if result[0]:
                        return result
        return None, "No available room"

    def list_rooms(self) -> list:
        """List available rooms for users (limited info)."""
        result = []
        mc = MODE_CONFIG
        for room in self.rooms.values():
            if room.state.value in ("waiting", "countdown"):
                max_players = mc.get(room.mode, mc["ffa"])["max"]
                result.append({
                    "roomId": room.room_id,
                    "mode": room.mode,
                    "roomLevel": room.room_level,
                    "playerCount": room._connected_count(),
                    "maxPlayers": max_players,
                    "status": room.state.value,
                })
        return result

    def list_all_rooms(self) -> list:
        """List all active rooms with full details (admin only)."""
        result = []
        for room in self.rooms.values():
            players = []
            for pid, p in room.players.items():
                players.append({
                    "id": pid,
                    "username": p.username,
                    "connected": p.connected,
                })
            result.append({
                "roomId": room.room_id,
                "mode": room.mode,
                "level": getattr(room, 'level', 1),
                "state": room.state.value,
                "playerCount": room._connected_count(),
                "players": players,
                "createdAt": getattr(room, '_created_at', None),
            })
        return result

    async def force_close_room(self, room_id: str) -> bool:
        """管理员强制关闭房间：通知房内玩家后立即移除。

        修复：原实现 `room.state.value = "ended"` 对 Enum 成员赋值会抛
        AttributeError，导致接口 500 且房间从未被移除。现在通过 Room.close()
        广播关闭消息并清理，再从注册表删除。
        """
        room = self.rooms.get(room_id)
        if not room:
            return False
        await room.close()
        self.rooms.pop(room_id, None)
        return True

    async def kick_player(self, room_id: str, player_id: int) -> bool:
        """管理员将玩家踢出房间。

        先向被踢者发送提示（走前端已有的 error 处理路径），再复用统一的
        leave_room 流程：房内其他人会收到 room_update；若踢出后房间变空则自动解散。
        """
        room = self.rooms.get(room_id)
        if not room:
            return False
        if player_id not in room.players:
            return False
        conn = room.players[player_id]
        if conn.connected:
            try:
                await conn.ws.send_bytes(
                    encode({"type": "error", "msg": "你已被管理员踢出房间"})
                )
            except Exception:
                pass
        await self.leave_room(room_id, player_id)
        return True


room_manager = RoomManager()
