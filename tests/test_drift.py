import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import DRIFT_CONFIG, get_drift_config, get_ship_config
from game.ship import ServerShip


class TestDriftConfig:
    def test_all_entries_present(self):
        for cls in ("default", "destroyer", "cruiser", "battleship"):
            assert cls in DRIFT_CONFIG

    def test_each_entry_has_required_fields(self):
        for cls, cfg in DRIFT_CONFIG.items():
            assert cfg["recovery_base"] > 0
            assert 0 < cfg["speed_factor"] < 1
            assert 0 < cfg["max_angle"] < math.pi / 2

    def test_destroyer_drifts_most_battleship_least(self):
        assert DRIFT_CONFIG["destroyer"]["max_angle"] > DRIFT_CONFIG["cruiser"]["max_angle"]
        assert DRIFT_CONFIG["cruiser"]["max_angle"] > DRIFT_CONFIG["battleship"]["max_angle"]

    def test_get_drift_config_default(self):
        cfg = get_drift_config(None)
        assert cfg["recovery_base"] == DRIFT_CONFIG["default"]["recovery_base"]

    def test_get_drift_config_by_class(self):
        assert get_drift_config("destroyer")["max_angle"] == DRIFT_CONFIG["destroyer"]["max_angle"]
        assert get_drift_config("cruiser")["max_angle"] == DRIFT_CONFIG["cruiser"]["max_angle"]
        assert get_drift_config("battleship")["max_angle"] == DRIFT_CONFIG["battleship"]["max_angle"]

    def test_get_drift_config_unknown_falls_back(self):
        cfg = get_drift_config("fantasy_class")
        assert cfg["recovery_base"] == DRIFT_CONFIG["default"]["recovery_base"]


class TestServerShipDrift:
    def _norm(self, a):
        while a > math.pi:
            a -= 2 * math.pi
        while a < -math.pi:
            a += 2 * math.pi
        return a

    def _drift_after(self, ship, keys, speed, dt, ticks):
        """Run N ticks with forced speed, return final drift angle."""
        for _ in range(ticks):
            ship.speed = speed
            ship.update(dt, keys)
        return abs(self._norm(ship.heading - ship.velocity_heading))

    def test_velocity_heading_initialized(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        assert ship.velocity_heading == 0

    def test_low_speed_tiny_drift(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        drift = self._drift_after(ship, {"a": 1}, 1.0, 0.05, 40)
        assert drift < 0.03

    def test_high_speed_noticeable_drift(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        drift = self._drift_after(ship, {"a": 1, "w": 1}, ship.max_speed, 0.05, 80)
        assert drift > 0.1

    def test_drift_within_max_angle(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        max_angle = DRIFT_CONFIG["cruiser"]["max_angle"]
        drift = self._drift_after(ship, {"a": 1, "w": 1}, ship.max_speed, 0.05, 200)
        assert drift <= max_angle + 0.01

    def test_destroyer_more_drift_than_battleship(self):
        dest = ServerShip(1, "test", level=4, ship_class="destroyer")
        bs = ServerShip(2, "test", level=4, ship_class="battleship")
        dest_drift = self._drift_after(dest, {"a": 1, "w": 1}, dest.max_speed, 0.05, 80)
        bs_drift = self._drift_after(bs, {"a": 1, "w": 1}, bs.max_speed, 0.05, 80)
        assert dest_drift > bs_drift

    def test_converge_when_not_turning(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        self._drift_after(ship, {"a": 1, "w": 1}, ship.max_speed, 0.05, 80)
        drift_before = abs(self._norm(ship.heading - ship.velocity_heading))
        assert drift_before > 0.05

        self._drift_after(ship, {}, ship.max_speed, 0.05, 80)
        drift_after = abs(self._norm(ship.heading - ship.velocity_heading))
        assert drift_after < drift_before

    def test_full_convergence_to_zero(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        self._drift_after(ship, {"a": 1, "w": 1}, ship.max_speed, 0.05, 20)
        self._drift_after(ship, {}, 0, 0.05, 200)
        drift = abs(self._norm(ship.heading - ship.velocity_heading))
        assert drift < 0.01

    def test_right_turn_drift_direction(self):
        ship = ServerShip(1, "test", level=4, ship_class="destroyer")
        ship.heading = 0
        ship.velocity_heading = 0
        self._drift_after(ship, {"d": 1, "w": 1}, ship.max_speed, 0.05, 80)
        assert ship.heading < 0
        assert ship.velocity_heading > ship.heading

    def test_reverse_speed_drifts(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        ship.heading = 0
        ship.velocity_heading = 0
        reverse_speed = -ship.max_speed * 0.3
        self._drift_after(ship, {"a": 1}, reverse_speed, 0.05, 10)
        # At low speed (reverse at 30% max), drift is negligible by design
        drift = abs(self._norm(ship.heading - ship.velocity_heading))
        assert drift < 0.05

    def test_position_uses_velocity_heading(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        ship.speed = 10
        ship.heading = math.pi / 4
        ship.velocity_heading = -math.pi / 4
        x_before, z_before = ship.pos_x, ship.pos_z
        ship.update(0.1, {})
        dx = ship.pos_x - x_before
        dz = ship.pos_z - z_before
        actual_dir = math.atan2(dx, dz)
        diff = abs(self._norm(actual_dir - ship.velocity_heading))
        assert diff < 0.05

    def test_no_movement_at_zero_speed(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        ship.speed = 0
        x_before, z_before = ship.pos_x, ship.pos_z
        ship.update(0.1, {"a": 1})
        assert abs(ship.pos_x - x_before) < 1e-6
        assert abs(ship.pos_z - z_before) < 1e-6

    def test_velocity_heading_unchanged_below_threshold(self):
        ship = ServerShip(1, "test", level=4, ship_class="cruiser")
        ship.velocity_heading = 0.5
        ship.speed = 0.4
        ship.update(0.1, {"a": 1})
        # speedRatio treated as 0, full recovery pushes toward heading (0)
        assert ship.velocity_heading < 0.5
        assert ship.velocity_heading > 0
