import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.terrain import Terrain
from game.game_state import GameState
from game.ship import ServerShip


def _make_terrain():
    return Terrain(42, [])


class TestRespawnMechanism:
    """Test FFA respawn mechanism."""

    def test_ship_respawns_when_has_remaining_lives(self):
        """Ship with remaining respawns should come back alive at spawn point."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        spawn_x, spawn_z = ship.pos_x, ship.pos_z

        # Kill the ship
        ship.take_damage(ship.max_hp + 100)
        assert not ship.alive

        # Process respawn
        gs._process_respawns()

        assert ship.alive
        assert ship.hp == ship.max_hp
        assert ship.pos_x == spawn_x
        assert ship.pos_z == spawn_z
        assert gs._respawn_remaining.get(1) == 1  # Used one respawn

    def test_ship_stays_dead_when_no_respawns_left(self):
        """Ship with 0 respawns remaining should stay dead."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=0)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        ship.take_damage(ship.max_hp + 100)
        assert not ship.alive

        gs._process_respawns()

        assert not ship.alive

    def test_respawn_decrements_remaining(self):
        """Each respawn should decrement the remaining count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]

        # Kill and respawn 3 times
        for i in range(3):
            ship.take_damage(ship.max_hp + 100)
            gs._process_respawns()
            assert gs._respawn_remaining.get(1) == 2 - i

        # 4th death should be permanent
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()
        assert not ship.alive

    def test_snapshot_includes_respawn_info(self):
        """Player snapshot should include remaining respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        snap = gs.get_snapshot(player_id=1)
        assert "rspn" in snap["you"]
        assert snap["you"]["rspn"] == 2

    def test_snapshot_others_include_respawn_info(self):
        """Other players' snapshots should include respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        snap = gs.get_snapshot(player_id=1)
        assert snap["others"][0]["rspn"] == 2

    def test_respawn_limit_zero_means_no_respawn(self):
        """respawn_limit=0 means death = elimination."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=0)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()

        assert not gs.ships[1].alive
        assert gs._respawn_remaining.get(1) == 0

    def test_respawn_limit_ten(self):
        """Max respawn limit of 10 should work correctly."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=10)
        gs.add_ship(1, "Alice", level=1)

        ship = gs.ships[1]
        # Kill and respawn 10 times
        for i in range(10):
            ship.take_damage(ship.max_hp + 100)
            gs._process_respawns()
            assert ship.alive
            assert gs._respawn_remaining.get(1) == 9 - i

        # 11th death = permanent
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()
        assert not ship.alive

    def test_respawn_preserves_ship_config(self):
        """Respawn should preserve ship level, class, and stats."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=5, ship_class="destroyer")
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        old_level = ship.level
        old_class = ship.ship_class
        old_max_hp = ship.max_hp
        old_max_speed = ship.max_speed

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        assert ship.level == old_level
        assert ship.ship_class == old_class
        assert ship.max_hp == old_max_hp
        assert ship.max_speed == old_max_speed

    def test_respawn_resets_speed_and_heading(self):
        """Respawn should reset speed to 0 and keep heading."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        # Move the ship
        gs.process_input(1, {"k": {"w": True}})
        gs.update(1.0 / 20)
        assert ship.speed > 0

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        assert ship.speed == 0

    def test_game_end_only_when_no_respawns_left(self):
        """Game should not end if dead players still have respawns."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Kill Alice - she has 1 respawn so game shouldn't end
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()
        assert gs.ships[1].alive  # Respawned

        # Kill Alice again - no more respawns
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()
        assert not gs.ships[1].alive  # Permanently dead

        # Now only Bob alive, game should end
        alive = [s for s in gs.ships.values() if s.alive]
        assert len(alive) <= 1

    def test_respawn_at_initial_spawn_position(self):
        """Respawn should place ship at its first spawn position."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        initial_x = ship.pos_x
        initial_z = ship.pos_z

        # Move ship away
        ship.pos_x += 500
        ship.pos_z += 500

        # Kill and respawn
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.pos_x == initial_x
        assert ship.pos_z == initial_z

    def test_respawn_resets_turret_cooldowns(self):
        """Respawn should reset turret cooldowns to 0."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        # Set cooldowns
        for i in range(len(ship.turret_cooldowns)):
            ship.turret_cooldowns[i] = 5.0

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        for cd in ship.turret_cooldowns:
            assert cd == 0.0


class TestRespawnLimitPropagation:
    """Verify respawn_limit flows correctly from Room through to all players."""

    def test_respawn_limit_set_on_all_players(self):
        """All players should get the room's respawn_limit, not default 0."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=5)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)
        gs.add_ship(3, "Charlie", level=1)

        # All players should have respawn_limit=5
        assert gs._respawn_remaining[1] == 5
        assert gs._respawn_remaining[2] == 5
        assert gs._respawn_remaining[3] == 5

    def test_game_state_stores_respawn_limit(self):
        """GameState.respawn_limit should match what was passed."""
        terrain = _make_terrain()
        for limit in [0, 1, 3, 5, 10]:
            gs = GameState(terrain, mode="ffa", respawn_limit=limit)
            assert gs.respawn_limit == limit

    def test_respawn_limit_propagates_via_snapshot(self):
        """Each player snapshot should include their own respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Alice's snapshot shows Alice's rspn
        snap1 = gs.get_snapshot(player_id=1)
        assert snap1["you"]["rspn"] == 3
        # Alice's view of Bob shows Bob's rspn
        assert snap1["others"][0]["rspn"] == 3

        # Bob's snapshot shows Bob's rspn
        snap2 = gs.get_snapshot(player_id=2)
        assert snap2["you"]["rspn"] == 3

    def test_non_creator_gets_same_respawn_limit(self):
        """Player joining later (non-creator) gets same respawn_limit."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=4)

        # Creator adds self
        gs.add_ship(1, "Host", level=1)

        # Another player joins later
        gs.add_ship(2, "Joiner", level=1)

        # Both should have same respawn limit
        assert gs._respawn_remaining[1] == 4
        assert gs._respawn_remaining[2] == 4

        # Both snapshots show correct value
        for pid in [1, 2]:
            snap = gs.get_snapshot(player_id=pid)
            assert snap["you"]["rspn"] == 4


class TestProjectileSnapshots:
    """Verify all projectiles are included in snapshots."""

    def test_all_projectiles_in_snapshot(self):
        """Snapshot should contain all projectiles from all players."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=3)    # 3 turrets

        # Both players fire
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        gs.process_fire(2, {"aim": {"x": -100, "y": 2, "z": -100}})

        snap = gs.get_snapshot(player_id=1)
        assert len(snap["projs"]) == 6  # 3 + 3

    def test_projectile_owner_preserved(self):
        """Projectile owner should be correctly set in snapshot."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        gs.process_fire(2, {"aim": {"x": -100, "y": 2, "z": -100}})

        snap = gs.get_snapshot()
        owners = {p["owner"] for p in snap["projs"]}
        assert 1 in owners
        assert 2 in owners
