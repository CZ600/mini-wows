import asyncio
import time
from game.config import MODE_CONFIG, ROOM_CLEANUP_DELAY
from game.room import Room


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
                room = self.rooms.pop(rid, None)
                if room:
                    await room.cleanup()

    async def cleanup(self):
        if self._cleanup_task:
            self._cleanup_task.cancel()
        for room in self.rooms.values():
            await room.cleanup()
        self.rooms.clear()

    def create_room(self, mode="ffa", player_id=None, username=None, ws=None,
                    level=1, ship_class=None):
        if mode not in MODE_CONFIG:
            return None, "Invalid mode"

        mc = MODE_CONFIG[mode]
        room_id = f"r{self._next_id}"
        self._next_id += 1

        room = Room(room_id, mode, host_id=player_id, room_level=level)
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

    def leave_room(self, room_id, player_id):
        room = self.rooms.get(room_id)
        if not room:
            return
        room.remove_player(player_id)
        if room._connected_count() == 0:
            room._empty_time = time.monotonic()

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

    def force_close_room(self, room_id: str) -> bool:
        """Force close a room."""
        room = self.rooms.get(room_id)
        if not room:
            return False
        room.state.value = "ended"
        return True

    def kick_player(self, room_id: str, player_id: int) -> bool:
        """Kick a player from a room."""
        room = self.rooms.get(room_id)
        if not room:
            return False
        if player_id not in room.players:
            return False
        room.remove_player(player_id)
        return True


room_manager = RoomManager()
