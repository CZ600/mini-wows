"""Test AI enemy ship stat parity with player ships and multi-turret salvo firing."""
import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import (
    get_ship_config, ENEMY_SHIP_SCALE, PROJECTILE_INITIAL_SPEED,
    ENEMY_FIRE_SPEED, ENEMY_FIRE_COOLDOWN,
)
from game.enemy import ServerEnemyShip, ServerTurret, EnemyManager
from game.terrain import Terrain


def _make_terrain():
    return Terrain(42, [])


class TestEnemyShipStatsParity:
    """AI enemy ships should fully inherit player ship stats for their level."""

    @pytest.mark.parametrize("level", [1, 2, 3, 4, 5, 6, 7, 8])
    def test_hp_matches_player_config_no_class(self, level):
        """Enemy ship HP should match player ship HP for the same level."""
        ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
        player_cfg = get_ship_config(level, None)
        assert ship.hp == player_cfg["hp"]
        assert ship.max_hp == player_cfg["hp"]

    @pytest.mark.parametrize("level,ship_type", [
        (4, "destroyer"), (4, "cruiser"), (4, "battleship"),
        (6, "destroyer"), (6, "cruiser"), (6, "battleship"),
        (8, "destroyer"), (8, "cruiser"), (8, "battleship"),
    ])
    def test_hp_matches_player_config_with_class(self, level, ship_type):
        """Enemy ship with class should match player class-modified HP."""
        ship = ServerEnemyShip(1, 0, 0, level, ship_type=ship_type)
        player_cfg = get_ship_config(level, ship_type)
        assert ship.hp == player_cfg["hp"]
        assert ship.max_hp == player_cfg["hp"]

    @pytest.mark.parametrize("level", [1, 3, 5, 8])
    def test_damage_matches_player_config(self, level):
        """Enemy ship damage should match player ship damage."""
        ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
        player_cfg = get_ship_config(level, None)
        assert ship.damage == player_cfg["damage"]

    @pytest.mark.parametrize("level,ship_type", [
        (4, "destroyer"), (4, "cruiser"), (4, "battleship"),
    ])
    def test_damage_matches_player_config_with_class(self, level, ship_type):
        """Enemy ship with class should match player class-modified damage."""
        ship = ServerEnemyShip(1, 0, 0, level, ship_type=ship_type)
        player_cfg = get_ship_config(level, ship_type)
        assert ship.damage == player_cfg["damage"]

    def test_max_speed_matches_player_config(self):
        """Enemy ship max_speed should match player max_speed."""
        from game.config import BASE_MAX_SPEED
        # Non-class ships use BASE_MAX_SPEED
        for level in [1, 5, 8]:
            ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
            assert ship.max_speed == BASE_MAX_SPEED
        # Class ships use class-specific speed multiplier
        for cls_name in ["destroyer", "cruiser", "battleship"]:
            ship = ServerEnemyShip(1, 0, 0, 5, ship_type=cls_name)
            player_cfg = get_ship_config(5, cls_name)
            assert ship.max_speed == player_cfg["max_speed"]

    def test_fire_cooldown_matches_player_config(self):
        """Enemy ship fire_cooldown should match player fire_cooldown."""
        for level in [1, 5, 8]:
            ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
            player_cfg = get_ship_config(level, None)
            assert ship.fire_cooldown == player_cfg["fire_cooldown"]

    def test_turret_count_matches_player_config(self):
        """Enemy ship should have same turret count as player ship."""
        for level in [1, 3, 6, 8]:
            ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
            player_cfg = get_ship_config(level, None)
            expected = player_cfg["front_turrets"] + player_cfg["back_turrets"]
            assert len(ship.turret_cooldowns) == expected

    def test_score_value_from_enemy_ship_scale(self):
        """Score value should still come from ENEMY_SHIP_SCALE."""
        for level in [1, 4, 7, 8]:
            ship = ServerEnemyShip(1, 0, 0, level, ship_type=None)
            expected = ENEMY_SHIP_SCALE[level]["score"]
            assert ship.score_value == expected


class TestEnemyShipSalvoFiring:
    """AI enemy ships should fire salvos from multiple turrets, not single shots."""

    def _make_game_state(self):
        from game.game_state import GameState
        terrain = _make_terrain()
        return GameState(terrain, mode="pve")

    def test_fire_creates_multiple_projectiles(self):
        """Firing an enemy ship should create one projectile per turret."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        # Level 3 ship has 3 turrets (2 front + 1 back)
        enemy = ServerEnemyShip(1, 0, 0, 3, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        # Place player directly in front of enemy ship so all front turrets can aim
        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 200
        gs.ships[1].heading = 0

        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        initial_projectile_count = len(gs.projectile_mgr.projectiles)

        # Fire at the player
        enemy._fire_at(gs.ships[1], 200, gs)

        created = len(gs.projectile_mgr.projectiles) - initial_projectile_count
        # Level 3: 2 front turrets can aim forward, 1 back turret aims backward
        # Player is in front, so only front turrets should fire
        assert created >= 2, f"Expected at least 2 projectiles (front turrets), got {created}"

    def test_turret_cooldowns_set_after_fire(self):
        """After firing, turrets should have non-zero cooldowns."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        enemy = ServerEnemyShip(1, 0, 0, 3, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 200
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        # All turret cooldowns should start at 0
        assert all(cd == 0.0 for cd in enemy.turret_cooldowns)

        enemy._fire_at(gs.ships[1], 200, gs)

        # Front turrets should now have cooldowns set
        fired_turrets = [cd for cd in enemy.turret_cooldowns if cd > 0]
        assert len(fired_turrets) >= 2  # At least front turrets fired

    def test_fire_uses_projectile_initial_speed(self):
        """Enemy projectiles should use PROJECTILE_INITIAL_SPEED, not ENEMY_FIRE_SPEED."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        enemy = ServerEnemyShip(1, 0, 0, 1, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 200
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        initial_count = len(gs.projectile_mgr.projectiles)
        enemy._fire_at(gs.ships[1], 200, gs)

        # Check the created projectile's speed
        for p in gs.projectile_mgr.projectiles[initial_count:]:
            speed = math.sqrt(p.vx ** 2 + p.vy ** 2 + p.vz ** 2)
            # Speed should be close to PROJECTILE_INITIAL_SPEED (200)
            assert abs(speed - PROJECTILE_INITIAL_SPEED) < 1.0, \
                f"Expected speed ~{PROJECTILE_INITIAL_SPEED}, got {speed:.1f}"

    def test_back_turrets_dont_fire_when_target_in_front(self):
        """Back turrets should not fire when the target is in front of a bridged ship."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        # Level 4 ship has bridge: 2 front + 2 back turrets with limited yaw range
        enemy = ServerEnemyShip(1, 0, 0, 4, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        # Target directly in front
        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 200
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        enemy._fire_at(gs.ships[1], 200, gs)

        # Front turrets (indices 0, 1) should have fired
        # Back turrets (indices 2, 3) should NOT have fired (bridge limits yaw)
        assert enemy.turret_cooldowns[0] > 0, "Front turret 0 should have fired"
        assert enemy.turret_cooldowns[1] > 0, "Front turret 1 should have fired"
        assert enemy.turret_cooldowns[2] == 0, "Back turret 2 should NOT have fired"
        assert enemy.turret_cooldowns[3] == 0, "Back turret 3 should NOT have fired"

    def test_all_turrets_fire_when_broadside(self):
        """All turrets should fire when target is at ~90 degrees (within yaw range)."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        # Level 1: 1 front turret, no bridge → full yaw range (PI)
        enemy = ServerEnemyShip(1, 0, 0, 1, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        # Target at 90 degrees to the right
        gs.ships[1].pos_x = 200
        gs.ships[1].pos_z = 0
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        enemy._fire_at(gs.ships[1], 200, gs)

        # Level 1 has 1 turret with full yaw range → should fire
        assert enemy.turret_cooldowns[0] > 0, "Turret with full yaw should fire at 90 degrees"

    def test_turret_fire_cooldown_uses_ship_fire_cooldown(self):
        """Turret cooldown should be set to ship.fire_cooldown, not ENEMY_FIRE_COOLDOWN."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        enemy = ServerEnemyShip(1, 0, 0, 1, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 200
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        enemy._fire_at(gs.ships[1], 200, gs)

        player_cfg = get_ship_config(1, None)
        expected_cd = player_cfg["fire_cooldown"]
        assert enemy.fire_cooldown != ENEMY_FIRE_COOLDOWN, \
            "Enemy ship should not use ENEMY_FIRE_COOLDOWN"
        assert enemy.turret_cooldowns[0] == expected_cd, \
            f"Turret CD should be {expected_cd}, got {enemy.turret_cooldowns[0]}"

    def test_fire_uses_cannon_spread_with_ship_class(self):
        """Enemy fire should use apply_cannon_spread with ship_class parameter."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        # Ship with class should use class-specific spread
        enemy = ServerEnemyShip(1, 0, 0, 5, ship_type="battleship")
        gs.enemy_mgr.enemies.append(enemy)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 500
        enemy.x = 0
        enemy.z = 0
        enemy.heading = 0

        # Should not raise any errors
        enemy._fire_at(gs.ships[1], 500, gs)
        assert len(gs.projectile_mgr.projectiles) > 0


class TestEnemyShipTurretUpdate:
    """Turret cooldowns should update independently via GameState.update."""

    def _make_game_state(self):
        from game.game_state import GameState
        terrain = _make_terrain()
        return GameState(terrain, mode="pve")

    def test_turret_cooldowns_decrease_over_time(self):
        """Turret cooldowns should decrease when GameState.update is called."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        enemy = ServerEnemyShip(1, 0, 0, 3, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        for i in range(len(enemy.turret_cooldowns)):
            enemy.turret_cooldowns[i] = 2.0

        gs.update(0.05)  # one tick

        for cd in enemy.turret_cooldowns:
            assert cd < 2.0
            assert cd >= 0

    def test_turret_cooldowns_reset_after_expiry(self):
        """Turret cooldowns should reach 0 after enough time passes."""
        gs = self._make_game_state()
        gs.add_ship(1, "Player", level=1)
        enemy = ServerEnemyShip(1, 0, 0, 1, ship_type=None)
        gs.enemy_mgr.enemies.append(enemy)

        enemy.turret_cooldowns[0] = 0.5

        for _ in range(10):
            gs.update(0.05)

        assert enemy.turret_cooldowns[0] < 1e-10


class TestEnemyShipSnapshot:
    """Enemy ship snapshot should include correct info."""

    def test_snapshot_includes_hp_and_max_hp(self):
        """Snapshot should reflect player-equivalent HP."""
        ship = ServerEnemyShip(1, 0, 0, 5, ship_type=None)
        snap = ship.to_snapshot()
        player_cfg = get_ship_config(5, None)
        assert snap["hp"] == player_cfg["hp"]
        assert snap["mhp"] == player_cfg["hp"]
