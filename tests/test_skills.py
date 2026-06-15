"""战舰技能系统测试。

覆盖三个技能：
- rapid_fire (F): 装填 -30%，10s，冷却 80s
- damage_control (G): 恢复 30% max_hp，10s，冷却 40s
- precision (H): 散布 -30%，10s，冷却 60s

测试场景：
- 激活/生效/冷却/重激活
- 效果作用于正在装填的炮塔（rapid_fire）
- 损管匀速回血且封顶
- precision 影响 process_fire 的 spread_mult
- 三技能可同时激活
- 死亡时无法激活
- 重生后冷却清零
- snapshot 字段正确
- 无效技能名/未知玩家/未死亡安全忽略
"""
import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import SKILL_CONFIG
from game.skills import ShipSkills
from game.ship import ServerShip
from game.terrain import Terrain, generate_islands
from game.game_state import GameState


def _make_gs(level=1, ship_class=None):
    terrain = Terrain(12345, generate_islands(12345))
    gs = GameState(terrain)
    gs.add_ship(1, "player1", level=level, ship_class=ship_class)
    gs.add_ship(2, "player2", level=1)
    return gs


class TestSkillConfig:
    def test_config_keys_present(self):
        for name in ("rapid_fire", "damage_control", "precision"):
            assert name in SKILL_CONFIG

    def test_rapid_fire_values(self):
        c = SKILL_CONFIG["rapid_fire"]
        assert c["duration"] == 10.0
        assert c["cooldown"] == 80.0
        assert c["fire_cooldown_mult"] == pytest.approx(0.7)

    def test_damage_control_values(self):
        c = SKILL_CONFIG["damage_control"]
        assert c["duration"] == 10.0
        assert c["cooldown"] == 40.0
        assert c["hp_regen_ratio"] == pytest.approx(0.3)

    def test_precision_values(self):
        c = SKILL_CONFIG["precision"]
        assert c["duration"] == 10.0
        assert c["cooldown"] == 60.0
        assert c["spread_mult"] == pytest.approx(0.7)


class TestShipSkillsActivate:
    def test_initial_state_idle(self):
        s = ShipSkills()
        for name in ShipSkills.SKILL_NAMES:
            assert s.is_active(name) is False
            assert s.get_cooldown_remain(name) == 0.0
            assert s.get_active_remain(name) == 0.0
            assert s.can_activate(name) is True

    def test_activate_sets_timers(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        assert s.activate("rapid_fire", ship) is True
        assert s.is_active("rapid_fire") is True
        assert s.get_active_remain("rapid_fire") == pytest.approx(10.0)
        assert s.get_cooldown_remain("rapid_fire") == pytest.approx(80.0)

    def test_activate_unknown_skill_returns_false(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        assert s.activate("not_a_skill", ship) is False

    def test_cannot_activate_while_active(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        s.activate("rapid_fire", ship)
        assert s.can_activate("rapid_fire") is False
        assert s.activate("rapid_fire", ship) is False

    def test_cannot_activate_during_cooldown(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        s.activate("rapid_fire", ship)
        # 推进生效结束但冷却未结束
        s.update(SKILL_CONFIG["rapid_fire"]["duration"] + 0.01, ship)
        assert s.is_active("rapid_fire") is False
        assert s.get_cooldown_remain("rapid_fire") > 0
        assert s.can_activate("rapid_fire") is False

    def test_can_reactivate_after_cooldown(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        s.activate("rapid_fire", ship)
        total = SKILL_CONFIG["rapid_fire"]["cooldown"] + 0.01
        s.update(total, ship)
        assert s.can_activate("rapid_fire") is True

    def test_update_advances_timers(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        s.activate("damage_control", ship)
        s.update(2.5, ship)
        assert s.get_active_remain("damage_control") == pytest.approx(7.5)
        assert s.get_cooldown_remain("damage_control") == pytest.approx(37.5)

    def test_update_clamps_to_zero(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        s.activate("precision", ship)
        s.update(100.0, ship)
        assert s.get_active_remain("precision") == 0.0
        assert s.get_cooldown_remain("precision") == 0.0

    def test_reset_clears_all(self):
        s = ShipSkills()
        ship = ServerShip(1, "t", level=1)
        for name in ShipSkills.SKILL_NAMES:
            s.activate(name, ship)
        s.reset()
        for name in ShipSkills.SKILL_NAMES:
            assert s.is_active(name) is False
            assert s.get_cooldown_remain(name) == 0.0


class TestRapidFireEffect:
    def test_immediately_shortens_existing_cooldowns(self):
        """激活瞬间，正在装填的炮塔剩余冷却立即乘 0.7。"""
        gs = _make_gs(level=4)
        ship = gs.ships[1]
        # 模拟先开火，进入冷却
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        cd_before = ship.turret_cooldowns[0]
        assert cd_before > 0
        # 激活 rapid_fire
        gs.process_skill(1, {"skill": "rapid_fire"})
        cd_after = ship.turret_cooldowns[0]
        assert cd_after == pytest.approx(cd_before * 0.7, rel=1e-3)

    def test_new_fire_uses_reduced_cooldown(self):
        """rapid_fire 生效期间，新发射的炮塔冷却也是 0.7 倍。"""
        gs = _make_gs(level=4)
        ship = gs.ships[1]
        gs.process_skill(1, {"skill": "rapid_fire"})
        # 等一小段时间让 cooldown 不被重置影响
        gs.update(0.05)
        # 让所有炮塔装填完成
        for i in range(len(ship.turret_cooldowns)):
            ship.turret_cooldowns[i] = 0.0
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        expected = ship.fire_cooldown * 0.7
        assert ship.turret_cooldowns[0] == pytest.approx(expected, rel=1e-3)

    def test_cooldown_normal_after_expire(self):
        """rapid_fire 过期后，新发射的炮塔冷却恢复正常。"""
        gs = _make_gs(level=4)
        ship = gs.ships[1]
        gs.process_skill(1, {"skill": "rapid_fire"})
        # 推进生效结束
        gs.update(SKILL_CONFIG["rapid_fire"]["duration"] + 0.05)
        assert not ship.skills.is_active("rapid_fire")
        for i in range(len(ship.turret_cooldowns)):
            ship.turret_cooldowns[i] = 0.0
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        assert ship.turret_cooldowns[0] == pytest.approx(ship.fire_cooldown)


class TestDamageControlEffect:
    def test_heals_over_time(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        ship.hp = ship.max_hp * 0.5
        hp_before = ship.hp
        gs.process_skill(1, {"skill": "damage_control"})
        # 推进 5s（半段持续时间）
        gs.update(5.0)
        # 应恢复约 15% max_hp
        healed = ship.hp - hp_before
        assert healed == pytest.approx(ship.max_hp * 0.15, rel=0.05)

    def test_total_heal_capped_at_30pct(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        ship.hp = 0  # 完全空血
        gs.process_skill(1, {"skill": "damage_control"})
        # 推进整段持续时间 + 余量
        gs.update(SKILL_CONFIG["damage_control"]["duration"] + 1.0)
        assert ship.hp == pytest.approx(ship.max_hp * 0.3, rel=1e-3)

    def test_heal_does_not_exceed_max_hp(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        # 起始血量 = max_hp - 5，损管会试图恢复 30% max_hp 但被 max_hp 截断
        ship.hp = ship.max_hp - 5
        gs.process_skill(1, {"skill": "damage_control"})
        gs.update(SKILL_CONFIG["damage_control"]["duration"] + 1.0)
        assert ship.hp <= ship.max_hp

    def test_does_not_heal_when_dead(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        ship.hp = ship.max_hp * 0.5
        hp_before = ship.hp
        gs.process_skill(1, {"skill": "damage_control"})
        ship.alive = False
        gs.update(5.0)
        assert ship.hp == hp_before  # 死亡不回血


class TestPrecisionEffect:
    def test_precision_does_not_affect_inflight_projectiles(self):
        """已发射的炮弹方向不变（无法事后修改）。"""
        gs = _make_gs(level=4)
        gs.process_fire(1, {"aim": {"x": 0, "y": 2, "z": 500}})
        dirs_before = [(p.vx, p.vy, p.vz) for p in gs.projectile_mgr.projectiles]
        gs.process_skill(1, {"skill": "precision"})
        dirs_after = [(p.vx, p.vy, p.vz) for p in gs.projectile_mgr.projectiles]
        assert dirs_before == dirs_after

    def test_precision_reduces_spread_for_new_fire(self):
        """precision 激活后，新发射的炮弹散步σ应当减少（统计验证）。"""
        from game.projectile import apply_cannon_spread

        n = 400
        # 基线：无 precision，spread_mult = 1.0
        base_dir = (0.0, 0.5, 1.0)
        norm = math.sqrt(sum(c * c for c in base_dir))
        base_dir = tuple(c / norm for c in base_dir)

        def measure(mult):
            yaw_diffs = []
            for _ in range(n):
                d = apply_cannon_spread(base_dir, 500.0, "cruiser", spread_mult=mult)
                pitch = math.asin(max(-1.0, min(1.0, d[1])))
                yaw = math.atan2(d[0], d[2])
                yaw_diffs.append(abs(yaw))
            return sum(yaw_diffs) / len(yaw_diffs)

        base_mean = measure(1.0)
        precision_mean = measure(0.7)
        # 0.7 倍σ → 平均偏移约 0.7 倍
        ratio = precision_mean / base_mean if base_mean > 0 else 0
        assert 0.55 < ratio < 0.85

    def test_precision_state_in_ship(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        assert ship.skills.is_active("precision") is False
        gs.process_skill(1, {"skill": "precision"})
        assert ship.skills.is_active("precision") is True


class TestSimultaneousActivation:
    def test_all_three_can_be_active_at_once(self):
        gs = _make_gs(level=4)
        ship = gs.ships[1]
        for name in ("rapid_fire", "damage_control", "precision"):
            gs.process_skill(1, {"skill": name})
        assert ship.skills.is_active("rapid_fire")
        assert ship.skills.is_active("damage_control")
        assert ship.skills.is_active("precision")

    def test_independent_cooldowns(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        gs.process_skill(1, {"skill": "damage_control"})
        # 推进到 damage_control 生效结束
        gs.update(SKILL_CONFIG["damage_control"]["duration"] + 0.05)
        assert not ship.skills.is_active("damage_control")
        assert ship.skills.get_cooldown_remain("damage_control") > 0
        # 此时还能激活其他技能
        assert ship.skills.can_activate("rapid_fire") is True
        gs.process_skill(1, {"skill": "rapid_fire"})
        assert ship.skills.is_active("rapid_fire")


class TestDeathAndRespawn:
    def test_dead_ship_cannot_activate(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        ship.alive = False
        gs.process_skill(1, {"skill": "rapid_fire"})
        assert not ship.skills.is_active("rapid_fire")

    def test_unknown_player_ignored(self):
        gs = _make_gs(level=1)
        gs.process_skill(999, {"skill": "rapid_fire"})  # 不抛异常

    def test_respawn_resets_skills(self):
        """重生（_process_respawns）后所有冷却与生效状态清空。"""
        terrain = Terrain(12345, generate_islands(12345))
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "p1", level=1)
        ship = gs.ships[1]
        # 激活所有技能
        for name in ShipSkills.SKILL_NAMES:
            gs.process_skill(1, {"skill": name})
        # 让其死亡
        ship.hp = 0
        ship.alive = False
        # 触发 respawn
        gs._process_respawns()
        for name in ShipSkills.SKILL_NAMES:
            assert ship.skills.is_active(name) is False
            assert ship.skills.get_cooldown_remain(name) == 0.0


class TestSnapshot:
    def test_ship_snapshot_contains_skl(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        snap = ship.to_snapshot()
        assert "skl" in snap
        skl = snap["skl"]
        assert set(skl.keys()) == {"rf", "dc", "ps"}

    def test_snapshot_reflects_active_state(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        gs.process_skill(1, {"skill": "rapid_fire"})
        snap = ship.to_snapshot()
        assert snap["skl"]["rf"]["a"] > 0
        assert snap["skl"]["rf"]["c"] > 0
        assert snap["skl"]["dc"]["a"] == 0

    def test_snapshot_reflects_cooldown_only(self):
        gs = _make_gs(level=1)
        ship = gs.ships[1]
        gs.process_skill(1, {"skill": "precision"})
        gs.update(SKILL_CONFIG["precision"]["duration"] + 0.05)
        snap = ship.to_snapshot()
        assert snap["skl"]["ps"]["a"] == 0
        assert snap["skl"]["ps"]["c"] > 0


class TestProcessSkillEdgeCases:
    def test_missing_skill_field_ignored(self):
        gs = _make_gs(level=1)
        gs.process_skill(1, {})  # 不抛异常

    def test_invalid_skill_name_ignored(self):
        gs = _make_gs(level=1)
        gs.process_skill(1, {"skill": "nonexistent"})
        ship = gs.ships[1]
        for name in ShipSkills.SKILL_NAMES:
            assert not ship.skills.is_active(name)
