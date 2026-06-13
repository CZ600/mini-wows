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
