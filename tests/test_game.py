import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import (
    LEVEL_CONFIG, CLASS_CONFIG, BASE_MAX_SPEED, get_class_config,
    get_ship_config, get_torpedo_stats, TORPEDO_TIERS,
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
        assert ship.hp == 100
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
        ship.take_damage(50)
        assert ship.hp == 50
        assert ship.alive is True

    def test_death(self):
        ship = ServerShip(1, "test", level=1)
        ship.take_damage(200)
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
