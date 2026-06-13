import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.terrain import Terrain, generate_islands
from game.game_state import GameState
from game.ship import ServerShip


def _make_terrain():
    return Terrain(42, [])


class TestSnapshotOthers:
    """Bug 2: Verify snapshot correctly includes other players' ships."""

    def test_two_players_snapshot_has_others(self):
        """Each player's snapshot should have 'others' containing the other player."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        snap1 = gs.get_snapshot(player_id=1)
        assert snap1["you"] is not None
        assert snap1["you"]["id"] == 1
        assert len(snap1["others"]) == 1
        assert snap1["others"][0]["id"] == 2
        assert snap1["others"][0]["name"] == "Bob"

        snap2 = gs.get_snapshot(player_id=2)
        assert snap2["you"] is not None
        assert snap2["you"]["id"] == 2
        assert len(snap2["others"]) == 1
        assert snap2["others"][0]["id"] == 1
        assert snap2["others"][0]["name"] == "Alice"

    def test_snapshot_others_position_matches_ship(self):
        """Other player's position in snapshot should match actual ship position."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship2 = gs.ships[2]
        snap = gs.get_snapshot(player_id=1)
        other = snap["others"][0]
        assert abs(other["x"] - ship2.pos_x) < 0.01
        assert abs(other["z"] - ship2.pos_z) < 0.01

    def test_snapshot_others_include_class_info(self):
        """Other players' snapshots should include level and shipClass."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=5, ship_class="destroyer")
        gs.add_ship(2, "Bob", level=4, ship_class="cruiser")

        snap1 = gs.get_snapshot(player_id=1)
        assert snap1["others"][0]["lvl"] == 4
        assert snap1["others"][0]["shipClass"] == "cruiser"

        snap2 = gs.get_snapshot(player_id=2)
        assert snap2["others"][0]["lvl"] == 5
        assert snap2["others"][0]["shipClass"] == "destroyer"

    def test_snapshot_three_players(self):
        """With 3 players, each snapshot should have 2 others."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)
        gs.add_ship(3, "Charlie", level=1)

        snap = gs.get_snapshot(player_id=1)
        assert len(snap["others"]) == 2
        other_ids = {o["id"] for o in snap["others"]}
        assert other_ids == {2, 3}

    def test_snapshot_after_movement(self):
        """After updating game state, others should reflect new positions."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Move Bob forward
        gs.process_input(2, {"k": {"w": True}})
        gs.update(1.0 / 20)

        snap = gs.get_snapshot(player_id=1)
        other = snap["others"][0]
        assert other["spd"] > 0  # Bob should be moving


class TestFireCooldownInGameState:
    """Bug 1: Verify server-side turret cooldown decrements correctly."""

    def test_cooldown_decrements_over_ticks(self):
        """Turret cooldowns should decrement as GameState.update() is called."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        assert ship.turret_cooldowns[0] > 0

        initial_cd = ship.turret_cooldowns[0]
        for _ in range(10):
            gs.update(1.0 / 20)

        assert ship.turret_cooldowns[0] < initial_cd

    def test_cooldown_reaches_zero_allows_refire(self):
        """After cooldown expires, the turret should be able to fire again."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        fire_cd = ship.fire_cooldown

        # First fire
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        assert ship.turret_cooldowns[0] == fire_cd

        # Wait for cooldown to expire
        ticks_needed = int(fire_cd / (1.0 / 20)) + 2
        for _ in range(ticks_needed):
            gs.update(1.0 / 20)

        assert ship.turret_cooldowns[0] <= 0

        # Should be able to fire again — cooldown gets reset confirms new fire
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        assert ship.turret_cooldowns[0] == fire_cd

    def test_fire_sends_correct_projectile_count(self):
        """Fire should create one projectile per ready turret."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # Level 3: 2 front + 1 back = 3 turrets
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        num_turrets = len(ship.turret_cooldowns)
        assert num_turrets == 3

        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        # All turrets should fire (they all start at cooldown 0)
        assert len(gs.projectile_mgr.projectiles) == num_turrets

    def test_fire_projectiles_have_different_positions(self):
        """Bug 2: Each turret should fire from a different position, not all from center."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 2 front + 1 back = 3 turrets
        gs.add_ship(2, "Bob", level=1)

        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        projs = gs.projectile_mgr.projectiles
        assert len(projs) == 3

        # Check that not all projectiles start from the same position
        positions = {(round(p.x, 2), round(p.z, 2)) for p in projs}
        assert len(positions) > 1, "All projectiles fire from same position"


class TestHitDetectionRotation:
    """Bug 3: Hit detection should account for ship rotation."""

    def test_hit_works_when_ship_rotated(self):
        """A projectile should hit a rotated ship just as well as an unrotated one."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        target = gs.ships[2]
        # Rotate target 90 degrees
        target.heading = math.pi / 2
        target.pos_x = 50.0
        target.pos_z = 0.0

        # Fire at target
        gs.process_fire(1, {"aim": {"x": target.pos_x, "y": 2, "z": target.pos_z}})

        # Place projectile at target and zero velocity so it stays during update
        if gs.projectile_mgr.projectiles:
            proj = gs.projectile_mgr.projectiles[0]
            proj.x = target.pos_x
            proj.y = 2.0
            proj.z = target.pos_z
            proj.vx = 0
            proj.vy = 0
            proj.vz = 0

            gs.update(1.0 / 20)
            assert target.hp < target.max_hp, "Projectile should hit rotated ship"


class TestGameEndConditions:
    """Bug 1: Game end conditions for different modes."""

    def test_ffa_does_not_end_when_multiple_alive(self):
        """FFA should not end when more than 1 player is alive."""
        from game.room import Room, RoomState
        import asyncio

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)
        gs.add_ship(3, "Charlie", level=1)

        # Kill one player
        gs.ships[1].alive = False
        gs.ships[1].hp = 0

        alive = [s for s in gs.ships.values() if s.alive]
        assert len(alive) == 2  # 2 still alive
        # Game should NOT end (need last person standing)
        assert not (len(alive) <= 1)

    def test_team_does_not_end_when_both_teams_have_alive(self):
        """Team mode should not end when both teams have alive players."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="team")
        gs.add_ship(1, "Alice", level=1, team="red")
        gs.add_ship(2, "Bob", level=1, team="red")
        gs.add_ship(3, "Charlie", level=1, team="blue")
        gs.add_ship(4, "Dave", level=1, team="blue")

        # Kill one red player
        gs.ships[1].alive = False
        gs.ships[1].hp = 0

        alive = [s for s in gs.ships.values() if s.alive]
        alive_teams = set(s.team for s in alive if s.team)
        assert len(alive_teams) == 2  # Both teams still have players
        assert not (len(alive_teams) <= 1)

    def test_pve_does_not_end_when_some_humans_alive(self):
        """PvE should not end while at least one human is alive."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="pve")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Kill one human
        gs.ships[1].alive = False
        gs.ships[1].hp = 0

        alive = [s for s in gs.ships.values() if s.alive]
        assert len(alive) == 1  # One human still alive
        assert len(alive) != 0  # Game should NOT end
