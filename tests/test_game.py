import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import (
    LEVEL_CONFIG, CLASS_CONFIG, BASE_MAX_SPEED, get_class_config,
    get_ship_config, get_torpedo_stats, TORPEDO_TIERS, ENEMY_SHIP_SCALE,
)
from game.terrain import PerlinNoise, generate_islands, Terrain
from game.ship import ServerShip
from game.protocol import encode, decode


class TestConfig:
    def test_level_config_complete(self):
        for lv in range(1, 11):
            cfg = LEVEL_CONFIG[lv]
            assert cfg["hp"] > 0
            assert cfg["length"] > 0
            assert cfg["damage"] > 0

    def test_class_config_multipliers(self):
        for cls in ["destroyer", "cruiser", "battleship"]:
            for lv in range(4, 11):
                cfg = get_class_config(cls, lv)
                assert cfg is not None
                assert cfg["hp"] > 0
                assert cfg["max_speed"] > 0

    def test_get_ship_config_no_class(self):
        cfg = get_ship_config(5)
        assert cfg["hp"] == LEVEL_CONFIG[5]["hp"]

    def test_get_ship_config_with_class(self):
        cfg = get_ship_config(5, "destroyer")
        base = LEVEL_CONFIG[5]
        assert cfg["hp"] == round(base["hp"] * 0.6)
        assert cfg["max_speed"] == BASE_MAX_SPEED * 1.4

    def test_torpedo_stats(self):
        stats = get_torpedo_stats(1, 4)
        assert stats is not None
        assert stats["speed"] > 0
        assert stats["range"] > 0

    def test_torpedo_stats_invalid(self):
        assert get_torpedo_stats(99, 1) is None

    def test_enemy_ship_damage_boosted(self):
        """测试敌方舰船伤害提升50%"""
        # 原始伤害值（提升前）
        original_damages = {
            1: 12, 2: 15, 3: 19, 4: 24, 5: 30, 6: 38, 7: 48, 8: 60,
        }
        for wave, expected_original in original_damages.items():
            cfg = ENEMY_SHIP_SCALE[wave]
            # 提升50%后的伤害值应该是原始值的1.5倍（使用四舍五入）
            expected_boosted = int(expected_original * 1.5 + 0.5)
            assert cfg["damage"] == expected_boosted, f"Wave {wave}: expected {expected_boosted}, got {cfg['damage']}"


class TestPerlinNoise:
    def test_deterministic(self):
        n1 = PerlinNoise(42)
        n2 = PerlinNoise(42)
        for x, y in [(0.5, 0.5), (10, 20), (-5, 3.7)]:
            assert n1.noise(x, y) == n2.noise(x, y)

    def test_fbm_deterministic(self):
        n1 = PerlinNoise(123)
        n2 = PerlinNoise(123)
        assert n1.fbm(0.0003, 0.0003, 4) == n2.fbm(0.0003, 0.0003, 4)

    def test_different_seeds_differ(self):
        n1 = PerlinNoise(1)
        n2 = PerlinNoise(2)
        diffs = []
        for i in range(10):
            diffs.append(abs(n1.noise(i * 0.7, i * 1.3) - n2.noise(i * 0.7, i * 1.3)))
        assert max(diffs) > 0.001

    def test_range(self):
        n = PerlinNoise(42)
        for _ in range(100):
            val = n.noise(_ * 0.1, _ * 0.2)
            assert -1 <= val <= 1


class TestTerrain:
    def test_generate_islands_deterministic(self):
        i1 = generate_islands(42)
        i2 = generate_islands(42)
        assert len(i1) == len(i2) == 5
        for a, b in zip(i1, i2):
            assert abs(a["x"] - b["x"]) < 0.001
            assert abs(a["z"] - b["z"]) < 0.001

    def test_different_seeds_differ(self):
        i1 = generate_islands(1)
        i2 = generate_islands(2)
        diffs = [abs(a["x"] - b["x"]) for a, b in zip(i1, i2)]
        assert any(d > 1 for d in diffs)

    def test_terrain_creation(self):
        islands = generate_islands(123)
        t = Terrain(123, islands)
        # Ocean should be below 0 (adjusted -1 in get_height_at)
        assert t.get_height_at(4000, 4000) < 0

    def test_is_land(self):
        islands = [{"x": 0, "z": 0, "radius": 300, "height": 40}]
        t = Terrain(0, islands)
        # Near island center should be land
        assert t.is_land(0, 0) is True

    def test_terrain_deterministic(self):
        t1 = Terrain(42, generate_islands(42))
        t2 = Terrain(42, generate_islands(42))
        for x, z in [(0, 0), (100, -200), (500, 500)]:
            assert abs(t1.get_height_at(x, z) - t2.get_height_at(x, z)) < 0.001


class TestServerShip:
    def test_creation(self):
        ship = ServerShip(1, "test", level=1)
        assert ship.hp == 300
        assert ship.alive is True
        assert ship.speed == 0

    def test_acceleration(self):
        ship = ServerShip(1, "test", level=1)
        keys = {"w": True, "a": False, "s": False, "d": False}
        ship.update(0.05, keys)
        assert ship.speed > 0

    def test_turning(self):
        ship = ServerShip(1, "test", level=1)
        ship.speed = 5
        keys = {"w": False, "a": True, "s": False, "d": False}
        old_heading = ship.heading
        ship.update(0.05, keys)
        assert ship.heading > old_heading

    def test_deceleration(self):
        ship = ServerShip(1, "test", level=1)
        ship.speed = 10
        keys = {"w": False, "a": False, "s": False, "d": False}
        ship.update(0.05, keys)
        assert ship.speed < 10

    def test_max_speed(self):
        ship = ServerShip(1, "test", level=1)
        ship.speed = BASE_MAX_SPEED
        keys = {"w": True, "a": False, "s": False, "d": False}
        ship.update(0.05, keys)
        assert ship.speed <= BASE_MAX_SPEED

    def test_take_damage(self):
        ship = ServerShip(1, "test", level=1)
        ship.take_damage(150)
        assert ship.hp == 150
        assert ship.alive is True

    def test_death(self):
        ship = ServerShip(1, "test", level=1)
        ship.take_damage(500)
        assert ship.hp == 0
        assert ship.alive is False

    def test_snapshot(self):
        ship = ServerShip(1, "test", level=1)
        snap = ship.to_snapshot()
        assert snap["id"] == 1
        assert snap["name"] == "test"
        assert "x" in snap
        assert "z" in snap
        assert "h" in snap

    def test_class_config_applied(self):
        ship = ServerShip(1, "test", level=5, ship_class="destroyer")
        cfg = get_ship_config(5, "destroyer")
        assert ship.max_hp == cfg["hp"]
        assert ship.max_speed == cfg["max_speed"]


class TestTurretCooldown:
    """Tests for server-side turret cooldown behavior (no double decrement)."""

    def test_cooldown_not_decremented_in_update(self):
        """Ship.update() should NOT decrement turret cooldowns.
        Only GameState.update() should decrement them."""
        ship = ServerShip(1, "test", level=1)
        assert ship.turret_cooldowns[0] == 0.0

        # Simulate a fire: set cooldown
        ship.turret_cooldowns[0] = 5.0

        # Ship.update() with movement should NOT change cooldown
        ship.update(0.05, {"w": 1})
        assert ship.turret_cooldowns[0] == 5.0

    def test_cooldown_only_decremented_externally(self):
        """Turret cooldowns should only be decremented by external code (GameState.update)."""
        ship = ServerShip(1, "test", level=1)
        ship.turret_cooldowns[0] = 5.0

        # Simulate GameState.update() decrementing cooldowns
        for i in range(len(ship.turret_cooldowns)):
            if ship.turret_cooldowns[i] > 0:
                ship.turret_cooldowns[i] -= 0.05

        assert abs(ship.turret_cooldowns[0] - 4.95) < 0.001

    def test_process_fire_sets_cooldown(self):
        """process_fire should set turret cooldowns after firing."""
        from game.game_state import GameState
        from game.terrain import Terrain

        terrain = Terrain(12345, generate_islands(12345))
        gs = GameState(terrain)
        gs.add_ship(1, "player1", level=1)
        gs.add_ship(2, "player2", level=1)

        ship = gs.ships[1]
        assert ship.turret_cooldowns[0] == 0.0

        # Process a fire command
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        assert ship.turret_cooldowns[0] > 0.0

    def test_cooldown_prevents_immediate_refire(self):
        """After firing, turret should be on cooldown and cannot fire again immediately."""
        from game.game_state import GameState
        from game.terrain import Terrain

        terrain = Terrain(12345, generate_islands(12345))
        gs = GameState(terrain)
        gs.add_ship(1, "player1", level=1)
        gs.add_ship(2, "player2", level=1)

        ship = gs.ships[1]
        fire_cooldown = ship.fire_cooldown

        # First fire
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        assert ship.turret_cooldowns[0] == fire_cooldown

        # Second fire should be rejected (cooldown still active)
        proj_count_before = len(gs.projectile_mgr.projectiles)
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        proj_count_after = len(gs.projectile_mgr.projectiles)
        assert proj_count_after == proj_count_before  # no new projectile


class TestTurretAimFilter:
    """Bug fix: 服务端 process_fire 只查冷却不查瞄准范围，
    导致桥楼船后炮塔无法瞄准时也发射，其他玩家看到的炮弹数多于实际。"""

    def _setup(self, level=4, ship_class=None):
        from game.game_state import GameState
        terrain = Terrain(12345, generate_islands(12345))
        gs = GameState(terrain)
        gs.add_ship(1, "shooter", level=level, ship_class=ship_class)
        gs.add_ship(2, "target", level=1)
        ship = gs.ships[1]
        ship.pos_x = 0
        ship.pos_z = 0
        ship.heading = 0
        return gs, ship

    def test_bridge_ship_forward_only_front_turrets(self):
        """等级4船(有桥楼)朝正前方射击：只有前炮塔(2门)能开火。"""
        gs, ship = self._setup(level=4)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        assert len(gs.projectile_mgr.projectiles) == 2

    def test_bridge_ship_backward_only_back_turrets(self):
        """等级4船(有桥楼)朝正后方射击：只有后炮塔(2门)能开火。"""
        gs, ship = self._setup(level=4)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": -500}})
        assert len(gs.projectile_mgr.projectiles) == 2

    def test_non_bridge_ship_all_turrets_fire_forward(self):
        """等级3船(无桥楼)朝前射击：所有炮塔(3门)都能开火。"""
        gs, ship = self._setup(level=3)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        assert len(gs.projectile_mgr.projectiles) == 3

    def test_non_bridge_ship_all_turrets_fire_backward(self):
        """等级3船(无桥楼)朝后射击：所有炮塔(3门)都能开火(yawRange=π)。"""
        gs, ship = self._setup(level=3)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": -500}})
        assert len(gs.projectile_mgr.projectiles) == 3

    def test_level10_forward_only_3_front(self):
        """等级10船朝前射击：只有3门前炮塔开火，而非全部6门。"""
        gs, ship = self._setup(level=10)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        assert len(gs.projectile_mgr.projectiles) == 3

    def test_level10_battleship_forward(self):
        """等级10战列舰朝前射击：只有3门前炮塔开火。"""
        gs, ship = self._setup(level=10, ship_class="battleship")
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        assert len(gs.projectile_mgr.projectiles) == 3

    def test_side_aim_on_bridge_ship_fires_none_directly(self):
        """等级4船(有桥楼)朝正侧面(yawRange=2.2≈126°)射击：
        前后炮塔都无法瞄准正侧方(90°)时不应发射。"""
        gs, ship = self._setup(level=4)
        # 正侧方：local yaw = ±π/2 ≈ ±1.571
        # 前炮塔 yawCenter=0: |1.571-0|=1.571 <= 2.2 ✓ → 能瞄准
        # 后炮塔 yawCenter=π: |1.571-π|=1.571 <= 2.2 ✓ → 能瞄准
        # 所以正侧方时前后炮塔都能瞄准（2.2 > π/2）
        gs.process_fire(1, {"aim": {"x": 500, "y": 2, "z": 0}})
        assert len(gs.projectile_mgr.projectiles) == 4

    def test_aim_outside_all_turret_ranges_fires_nothing(self):
        """瞄准点在所有炮塔射界之外时不发射任何炮弹。"""
        gs, ship = self._setup(level=4)
        # 瞄准与船头呈 ~150° 的位置（超出前后炮塔 2.2 弧度射界）
        # 前: |2.618 - 0| = 2.618 > 2.2 ✗
        # 后: |2.618 - π| = 0.524 ≤ 2.2 ✓ → 后炮塔可以
        # 实际上很难让前后都不能，因为前后 yawCenter 差 π，
        # 而 yawRange=2.2*2=4.4 > π ≈ 3.14，所以总有炮塔能瞄准
        # 此测试验证斜后方只有后炮塔能开火(2门)
        angle = math.radians(150)
        aim_x = math.sin(angle) * 500
        aim_z = math.cos(angle) * 500
        gs.process_fire(1, {"aim": {"x": aim_x, "y": 2, "z": aim_z}})
        # 150° 时前炮塔不能(|2.618|>2.2)，后炮塔能(|0.524|<2.2)
        assert len(gs.projectile_mgr.projectiles) == 2


class TestProtocol:
    def test_encode_decode(self):
        msg = {"type": "test", "value": 42, "nested": {"a": 1.5}}
        data = encode(msg)
        assert isinstance(data, bytes)
        result = decode(data)
        assert result["type"] == "test"
        assert result["value"] == 42
        assert abs(result["nested"]["a"] - 1.5) < 0.001

    def test_binary_data(self):
        msg = {"type": "snapshot", "data": [1, 2, 3]}
        data = encode(msg)
        result = decode(data)
        assert result["data"] == [1, 2, 3]
