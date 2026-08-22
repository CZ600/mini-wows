"""Per-class submarine detection (对潜索敌) for AI ships.

巡洋/战列对潜艇的索敌距离被削弱（400/300），驱逐舰（护卫舰，反潜特化）
加大到 1000：圈外的潜艇视同未发现 —— 不会被选为目标、不会被追击或开火。
其它舰种与水面目标维持基础 ENEMY_DETECT_RANGE。
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import ENEMY_DETECT_RANGE, SUB_DETECT_RANGE
from game.enemy import ServerEnemyShip
from game.terrain import Terrain


def _make_game_state():
    from game.game_state import GameState
    return GameState(Terrain(42, []), mode="pve")


def _add_sub(gs, pid, level=5):
    gs.add_ship(pid, f"P{pid}", level=level, ship_class="submarine")
    return gs.ships[pid]


class TestSubDetectConfig:
    def test_mirror_values(self):
        # 与前端 config.js SUB_DETECT_RANGE 镜像：护卫舰加大、巡洋/战列削弱
        assert SUB_DETECT_RANGE["destroyer"] == 1000
        assert SUB_DETECT_RANGE["cruiser"] == 400
        assert SUB_DETECT_RANGE["battleship"] == 300
        # 驱逐舰对潜索敌必须超过基础索敌（加大），巡洋/战列必须低于（削弱）
        assert SUB_DETECT_RANGE["destroyer"] > ENEMY_DETECT_RANGE
        assert SUB_DETECT_RANGE["cruiser"] < ENEMY_DETECT_RANGE
        assert SUB_DETECT_RANGE["battleship"] < ENEMY_DETECT_RANGE


class TestSubDetectState:
    def _update(self, ship_type, dist):
        gs = _make_game_state()
        sub = _add_sub(gs, 1)
        sub.pos_x = 0
        sub.pos_z = dist
        enemy = ServerEnemyShip(1, 0, 0, 5, ship_type=ship_type)
        enemy.update(0.2, gs.ships, gs)
        return enemy

    def test_cruiser_ignores_sub_beyond_reduced_ring(self):
        # 450 m：旧逻辑（600）会追击，现在巡洋对潜只有 400
        enemy = self._update("cruiser", 450)
        assert enemy.state == "idle"

    def test_battleship_ignores_sub_beyond_reduced_ring(self):
        enemy = self._update("battleship", 450)
        assert enemy.state == "idle"

    def test_destroyer_hunts_sub_beyond_base_range(self):
        # 800 m：超过基础 600，但护卫舰对潜索敌 1000 —— 仍应追击
        enemy = self._update("destroyer", 800)
        assert enemy.state == "chase"

    def test_destroyer_loses_sub_outside_sonar_ring(self):
        enemy = self._update("destroyer", 1100)
        assert enemy.state == "idle"

    def test_classless_ship_keeps_base_range_vs_sub(self):
        # 无舰种舰体：对潜索敌回退基础 600
        enemy = self._update(None, 550)
        assert enemy.state == "chase"
        enemy = self._update(None, 650)
        assert enemy.state == "idle"


class TestSubDetectNoFire:
    def test_cruiser_does_not_fire_at_undetected_sub(self):
        gs = _make_game_state()
        _add_sub(gs, 1).pos_z = 500   # 巡洋对潜 400 —— 未发现
        enemy = ServerEnemyShip(1, 0, 0, 5, ship_type="cruiser")
        before = len(gs.projectile_mgr.projectiles)
        enemy.update(0.2, gs.ships, gs)
        assert len(gs.projectile_mgr.projectiles) == before

    def test_destroyer_fires_at_detected_sub(self):
        gs = _make_game_state()
        _add_sub(gs, 1).pos_z = 500   # 护卫舰对潜 1000 —— 已发现
        enemy = ServerEnemyShip(1, 0, 0, 5, ship_type="destroyer")
        before = len(gs.projectile_mgr.projectiles)
        enemy.update(0.2, gs.ships, gs)
        assert len(gs.projectile_mgr.projectiles) > before


class TestSubDetectTargetChoice:
    def test_undetected_sub_loses_to_visible_surface_ship(self):
        """最近的是潜艇但超出对潜索敌圈时应改为索敌圈内的水面舰。"""
        gs = _make_game_state()
        sub = _add_sub(gs, 1)
        sub.pos_x, sub.pos_z = 0, 350      # 战列对潜 300 —— 未发现
        surface = gs.add_ship(2, "P2", level=5, ship_class="destroyer")
        surface.pos_x, surface.pos_z = 0, 550   # 基础 600 内 —— 可见
        enemy = ServerEnemyShip(1, 0, 0, 5, ship_type="battleship")
        enemy.x, enemy.z, enemy.heading = 0, 0, 0
        before = len(gs.projectile_mgr.projectiles)
        enemy.update(0.2, gs.ships, gs)
        assert enemy.state == "chase"
        # 朝可见的水面舰开火（若仍锁定潜艇则不会开火：400 外=idle）
        assert len(gs.projectile_mgr.projectiles) > before
