import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.terrain import Terrain, generate_islands
from game.game_state import GameState
from game.ship import ServerShip


def _make_terrain():
    """Create a simple terrain with no islands (all water)."""
    return Terrain(42, [])


class TestSpawnPositions:
    """Test that spawn positions respect game mode constraints."""

    def test_ffa_spawns_not_overlapping(self):
        """FFA: players should spawn 400-1000m apart."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        positions = []
        for i in range(6):
            ship = gs.add_ship(f"p{i}", f"Player{i}", level=1, ship_class=None, team=None)
            positions.append((ship.pos_x, ship.pos_z))

        # Check all pairs have distance >= 400
        for i in range(len(positions)):
            for j in range(i + 1, len(positions)):
                dx = positions[i][0] - positions[j][0]
                dz = positions[i][1] - positions[j][1]
                dist = math.sqrt(dx * dx + dz * dz)
                assert dist >= 350, f"Players {i},{j} too close: {dist:.1f}m"

    def test_team_spawns_two_groups(self):
        """Team mode: red team and blue team should be ~500m apart."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="team")
        red_positions = []
        blue_positions = []
        for i in range(5):
            team = "red" if i < 3 else "blue"
            ship = gs.add_ship(f"p{i}", f"Player{i}", level=1, ship_class=None, team=team)
            if team == "red":
                red_positions.append((ship.pos_x, ship.pos_z))
            else:
                blue_positions.append((ship.pos_x, ship.pos_z))

        # Red center and blue center should be ~500m apart
        red_cx = sum(p[0] for p in red_positions) / len(red_positions)
        red_cz = sum(p[1] for p in red_positions) / len(red_positions)
        blue_cx = sum(p[0] for p in blue_positions) / len(blue_positions)
        blue_cz = sum(p[1] for p in blue_positions) / len(blue_positions)
        dist = math.sqrt((red_cx - blue_cx) ** 2 + (red_cz - blue_cz) ** 2)
        assert 300 < dist < 800, f"Team centers too close/far: {dist:.1f}m"

    def test_team_teammates_near_each_other(self):
        """Team mode: teammates should be within ~300m of each other."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="team")
        red_positions = []
        for i in range(4):
            team = "red" if i < 2 else "blue"
            ship = gs.add_ship(f"p{i}", f"Player{i}", level=1, ship_class=None, team=team)
            if team == "red":
                red_positions.append((ship.pos_x, ship.pos_z))

        # Red teammates should be near each other
        if len(red_positions) >= 2:
            dx = red_positions[0][0] - red_positions[1][0]
            dz = red_positions[0][1] - red_positions[1][1]
            dist = math.sqrt(dx * dx + dz * dz)
            assert dist < 400, f"Teammates too far apart: {dist:.1f}m"

    def test_snapshot_includes_ship_class(self):
        """Snapshot should include ship_class for client rendering."""
        terrain = _make_terrain()
        ship = ServerShip("p1", "Test", level=5, ship_class="destroyer")
        ship.pos_x = 100
        ship.pos_z = 200
        snap = ship.to_snapshot()
        assert snap["shipClass"] == "destroyer"
        assert snap["lvl"] == 5

    def test_snapshot_no_class(self):
        """Snapshot with no class should have null shipClass."""
        ship = ServerShip("p1", "Test", level=3)
        snap = ship.to_snapshot()
        assert snap["shipClass"] is None
        assert snap["lvl"] == 3

    def test_pve_spawns_humans_in_line(self):
        """PvE: human players should spawn in a line, ~300m apart."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="pve")
        positions = []
        for i in range(4):
            ship = gs.add_ship(f"p{i}", f"Player{i}", level=1, ship_class=None, team=None)
            positions.append((ship.pos_x, ship.pos_z))

        # Check spacing between consecutive players
        for i in range(1, len(positions)):
            dx = positions[i][0] - positions[i - 1][0]
            dz = positions[i][1] - positions[i - 1][1]
            dist = math.sqrt(dx * dx + dz * dz)
            assert 200 < dist < 500, f"PvE players {i-1},{i} spacing wrong: {dist:.1f}m"


class TestSpawnSafeFromLand:
    """Spawn must clear the ship's bounding box, not just its center.

    Regression: previously _find_water only checked the center point, so when
    the center sat in water near a shoreline one or more of the ship's four
    corners could overlap land. ServerShip.update() runs a strict corner
    check that instantly sinks the ship. With respawns, the ship kept
    respawning at the same bad spot until respawns ran out, causing the
    match to end immediately — even with respawns remaining.
    """

    def _make_ship(self, level, ship_class=None):
        ship = ServerShip("p", "Test", level=level, ship_class=ship_class)
        ship.heading = 0.0
        return ship

    def test_corners_water_at_safe_spawn(self):
        """Every ship corner must be water at the chosen spawn position."""
        islands = [{
            "x": 550.0, "z": 0.0,
            "radius": 200.0, "height": 50.0,
        }]
        terrain = Terrain(42, islands)
        gs = GameState(terrain, mode="ffa", respawn_limit=0)

        # The first FFA spawn angle is 0 → (550, 0) — inside the island.
        # _find_water must move the ship fully off land including corners.
        ship = gs.add_ship("p1", "Alice", level=4, ship_class="battleship")
        corners = ship._get_corners_at(ship.pos_x, ship.pos_z)
        for cx, cz in corners:
            assert not terrain.is_land(cx, cz), (
                f"corner ({cx:.1f},{cz:.1f}) on land at spawn "
                f"({ship.pos_x:.1f},{ship.pos_z:.1f})"
            )

    def test_find_water_returns_position_with_all_corners_water(self):
        """_find_water(ship, level, ship_class) should clear all 4 corners."""
        islands = [{
            "x": 0.0, "z": 0.0,
            "radius": 300.0, "height": 60.0,
        }]
        terrain = Terrain(42, islands)
        gs = GameState(terrain, mode="ffa")

        # Force a position right at the island center
        x, z = gs._find_water(0.0, 0.0, ship_length=53.0, ship_width=11.0)
        # Simulate the corners check
        cos_h, sin_h = 1.0, 0.0
        half_l, half_w = 53.0 / 2, 11.0 / 2
        corners = [
            (x + sin_h * half_l + cos_h * half_w, z + cos_h * half_l - sin_h * half_w),
            (x + sin_h * half_l - cos_h * half_w, z + cos_h * half_l + sin_h * half_w),
            (x - sin_h * half_l + cos_h * half_w, z - cos_h * half_l - sin_h * half_w),
            (x - sin_h * half_l - cos_h * half_w, z - cos_h * half_l + sin_h * half_w),
        ]
        for cx, cz in corners:
            assert not terrain.is_land(cx, cz), (
                f"corner ({cx:.1f},{cz:.1f}) on land after _find_water"
            )

    def test_ship_does_not_die_on_first_update(self):
        """A freshly-spawned ship must survive its first update() call."""
        islands = [{
            "x": 550.0, "z": 0.0,
            "radius": 200.0, "height": 50.0,
        }]
        terrain = Terrain(42, islands)
        gs = GameState(terrain, mode="ffa")
        ship = gs.add_ship("p1", "Alice", level=4, ship_class="battleship")

        # No keys pressed → ship doesn't move, just corner-checks its own
        # current position. Pre-fix this killed the ship immediately.
        ship.update(0.05, {}, terrain)
        assert ship.alive, (
            f"ship died at spawn ({ship.pos_x:.1f},{ship.pos_z:.1f})"
        )

    def test_spawn_safe_across_many_random_terrains(self):
        """Stress test: 30 random terrains must never spawn a ship on land edges."""
        for seed in range(30):
            terrain = Terrain(seed, generate_islands(seed))
            gs = GameState(terrain, mode="ffa")
            for i in range(8):
                ship = gs.add_ship(f"p{i}", f"P{i}", level=i + 1)
                corners = ship._get_corners_at(ship.pos_x, ship.pos_z)
                for cx, cz in corners:
                    assert not terrain.is_land(cx, cz), (
                        f"seed={seed} player={i} corner ({cx:.1f},{cz:.1f}) on land "
                        f"at spawn ({ship.pos_x:.1f},{ship.pos_z:.1f})"
                    )
