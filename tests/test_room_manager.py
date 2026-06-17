import pytest
from unittest.mock import MagicMock, AsyncMock

from game.room_manager import RoomManager
from game.room import Room, PlayerConn, RoomState

class TestListAllRooms:
    """Test admin room listing - Bug: dict access on PlayerConn objects."""

    def test_list_all_rooms_with_players(self):
        """list_all_rooms should not crash when rooms have players."""
        rm = RoomManager()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert err is None
        assert room is not None

        # This should NOT raise AttributeError
        result = rm.list_all_rooms()
        assert len(result) == 1
        assert result[0]["roomId"] == room.room_id
        assert result[0]["mode"] == "ffa"
        assert result[0]["state"] == "waiting"
        assert len(result[0]["players"]) == 1
        assert result[0]["players"][0]["id"] == 1
        assert result[0]["players"][0]["username"] == "alice"
        assert result[0]["players"][0]["connected"] is True

    def test_list_all_rooms_disconnected_player(self):
        """list_all_rooms should correctly report disconnected players."""
        rm = RoomManager()
        ws = MagicMock()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=ws)
        assert err is None

        # Disconnect the player
        room.remove_player(1)

        result = rm.list_all_rooms()
        assert len(result) == 1
        assert result[0]["players"][0]["connected"] is False

    def test_list_all_rooms_empty(self):
        """list_all_rooms should return empty list when no rooms exist."""
        rm = RoomManager()
        result = rm.list_all_rooms()
        assert result == []


class TestListRooms:
    """Test public room listing."""

    def test_list_rooms_shows_waiting_rooms(self):
        rm = RoomManager()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert err is None

        result = rm.list_rooms()
        assert len(result) == 1
        assert result[0]["roomId"] == room.room_id
        assert result[0]["playerCount"] == 1
        assert result[0]["status"] == "waiting"

    def test_list_rooms_excludes_playing_rooms(self):
        rm = RoomManager()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert err is None

        # Simulate game in progress
        room.state = RoomState.PLAYING

        result = rm.list_rooms()
        assert len(result) == 0

    def test_list_rooms_excludes_ended_rooms(self):
        rm = RoomManager()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert err is None

        room.state = RoomState.ENDED

        result = rm.list_rooms()
        assert len(result) == 0


class TestCreateRoom:
    """Test room creation."""

    def test_create_room_returns_room(self):
        rm = RoomManager()
        room, err = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert err is None
        assert room is not None
        assert room.mode == "ffa"
        assert room.room_id == "r1"

    def test_create_room_invalid_mode(self):
        rm = RoomManager()
        room, err = rm.create_room("invalid", player_id=1, username="alice", ws=MagicMock())
        assert room is None
        assert err == "Invalid mode"

    def test_create_room_auto_increment_id(self):
        rm = RoomManager()
        room1, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        room2, _ = rm.create_room("ffa", player_id=2, username="bob", ws=MagicMock())
        assert room1.room_id == "r1"
        assert room2.room_id == "r2"

    def test_create_room_host_is_first_player(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert room.host_id == 1

    def test_create_room_without_player(self):
        rm = RoomManager()
        room, err = rm.create_room("ffa")
        assert err is None
        assert room is not None
        assert room.host_id is None
        assert len(room.players) == 0


class TestJoinRoom:
    """Test room joining."""

    def test_join_existing_room(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        joined, err = rm.join_room(room.room_id, 2, "bob", MagicMock())
        assert err is None
        assert joined is room
        assert 2 in room.players

    def test_join_nonexistent_room(self):
        rm = RoomManager()
        joined, err = rm.join_room("r999", 1, "alice", MagicMock())
        assert joined is None
        assert err == "Room not found"

    def test_join_full_room(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        # Fill the room (ffa max is 8)
        for i in range(2, 9):
            rm.join_room(room.room_id, i, f"player{i}", MagicMock())

        joined, err = rm.join_room(room.room_id, 9, "player9", MagicMock())
        assert joined is None
        assert err == "Room is full"

    def test_join_reconnects_disconnected_player(self):
        rm = RoomManager()
        ws1 = MagicMock()
        ws2 = MagicMock()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=ws1)
        room.remove_player(1)

        joined, err = rm.join_room(room.room_id, 1, "alice", ws2)
        assert err is None
        assert joined is room
        assert room.players[1].connected is True
        assert room.players[1].ws is ws2


class TestQuickMatch:
    """Test quick match logic."""

    def test_quick_match_finds_existing_room(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())

        result, err = rm.find_quick_match("ffa", 2, "bob", MagicMock())
        assert result is not None
        assert result.room_id == room.room_id

    def test_quick_match_no_room_available(self):
        rm = RoomManager()
        result, err = rm.find_quick_match("ffa", 1, "alice", MagicMock())
        assert result is None
        assert err == "No available room"

    def test_quick_match_skips_full_rooms(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        for i in range(2, 9):
            rm.join_room(room.room_id, i, f"player{i}", MagicMock())

        result, err = rm.find_quick_match("ffa", 9, "player9", MagicMock())
        assert result is None

    def test_quick_match_skips_playing_rooms(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        room.state = RoomState.PLAYING

        result, err = rm.find_quick_match("ffa", 2, "bob", MagicMock())
        assert result is None

    def test_quick_match_mode_mismatch(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())

        result, err = rm.find_quick_match("pve", 2, "bob", MagicMock())
        assert result is None


class TestAutoDissolveEmptyRoom:
    """Feature: 房间内所有玩家退出后立即解散（不再等 30s 清理循环）。"""

    async def test_leave_room_dissolves_when_empty(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        assert rm.list_all_rooms() != []

        # 最后一名玩家离开 → 房间应立即从注册表移除
        await rm.leave_room(room.room_id, 1)

        assert rm.get_room(room.room_id) is None
        assert rm.list_all_rooms() == []

    async def test_leave_room_keeps_room_when_others_remain(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())
        rm.join_room(room.room_id, 2, "bob", MagicMock())

        # 只有部分玩家离开时，房间仍应保留
        await rm.leave_room(room.room_id, 1)

        kept = rm.get_room(room.room_id)
        assert kept is not None
        assert kept._connected_count() == 1
        assert any(r["roomId"] == room.room_id for r in rm.list_all_rooms())

    async def test_dissolve_room_idempotent(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())

        assert await rm.dissolve_room(room.room_id) is True
        # 第二次对同一 room_id 调用应返回 False（已不存在），不抛异常
        assert await rm.dissolve_room(room.room_id) is False


class TestAdminForceCloseRoom:
    """Bug fix: 管理员关闭房间。原实现 `room.state.value = "ended"` 对 Enum
    赋值会抛 AttributeError，导致接口 500 且房间从未被移除。"""

    async def test_force_close_room_removes_room(self):
        rm = RoomManager()
        # close() 会向房内玩家广播 error，ws 的 send_bytes 必须可 await
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=AsyncMock())

        success = await rm.force_close_room(room.room_id)

        assert success is True
        assert rm.get_room(room.room_id) is None
        assert rm.list_all_rooms() == []

    async def test_force_close_room_nonexistent(self):
        rm = RoomManager()
        success = await rm.force_close_room("r999")
        assert success is False


class TestAdminKickPlayer:
    """Fix: 踢出玩家应真正让其离开房间（经 leave_room），且房空时自动解散。"""

    async def test_kick_player_removes_player(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=AsyncMock())
        rm.join_room(room.room_id, 2, "bob", MagicMock())

        # 踢出 alice；房间内仍有 bob，房间应保留
        success = await rm.kick_player(room.room_id, 1)

        assert success is True
        kept = rm.get_room(room.room_id)
        assert kept is not None
        # remove_player 按设计只标记断线（保留重连宽限期），alice 应已断开；
        # 房间在线人数降为 1（只剩 bob）。
        assert kept.players[1].connected is False
        assert kept._connected_count() == 1

    async def test_kick_last_player_dissolves_room(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=AsyncMock())

        success = await rm.kick_player(room.room_id, 1)

        assert success is True
        # 踢出最后一名玩家后房间应自动解散
        assert rm.get_room(room.room_id) is None

    async def test_kick_player_not_in_room(self):
        rm = RoomManager()
        room, _ = rm.create_room("ffa", player_id=1, username="alice", ws=MagicMock())

        success = await rm.kick_player(room.room_id, 999)
        assert success is False
