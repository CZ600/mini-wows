import pytest
import asyncio
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
