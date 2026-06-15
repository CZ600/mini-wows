import sys
import os
import math

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import (
    LEVEL_CONFIG, CLASS_CONFIG, ENEMY_SCALE, ENEMY_SHIP_SCALE,
    get_class_config, get_ship_config,
)
from game.torpedo import TorpedoManager


class TestShipHP:
    """所有舰船所有等级血量*3"""

    def test_level_config_hp_tripled(self):
        original_hp = {
            1: 100, 2: 150, 3: 220, 4: 300, 5: 400,
            6: 520, 7: 650, 8: 800, 9: 950, 10: 1100,
        }
        for lv, orig in original_hp.items():
            assert LEVEL_CONFIG[lv]["hp"] == orig * 3, \
                f"Level {lv}: expected hp {orig * 3}, got {LEVEL_CONFIG[lv]['hp']}"

    def test_destroyer_hp_tripled(self):
        """驱逐舰血量 = base hp * 0.6 (hp_mul不变，但base已*3)"""
        for lv in range(4, 11):
            cfg = get_class_config("destroyer", lv)
            base = LEVEL_CONFIG[lv]
            expected = round(base["hp"] * 0.6)
            assert cfg["hp"] == expected, \
                f"Destroyer Lv{lv}: expected hp {expected}, got {cfg['hp']}"

    def test_cruiser_hp_tripled(self):
        """巡洋舰血量 = base hp * 1.0"""
        for lv in range(4, 11):
            cfg = get_class_config("cruiser", lv)
            base = LEVEL_CONFIG[lv]
            expected = round(base["hp"] * 1.0)
            assert cfg["hp"] == expected, \
                f"Cruiser Lv{lv}: expected hp {expected}, got {cfg['hp']}"

    def test_battleship_hp_tripled(self):
        """战列舰血量 = base hp * 1.4"""
        for lv in range(4, 11):
            cfg = get_class_config("battleship", lv)
            base = LEVEL_CONFIG[lv]
            expected = round(base["hp"] * 1.4)
            assert cfg["hp"] == expected, \
                f"Battleship Lv{lv}: expected hp {expected}, got {cfg['hp']}"


class TestBattleshipGunDamage:
    """战列舰火炮伤害*1.5 — damage_mul 从 2.05 变为 3.075"""

    def test_battleship_damage_mul(self):
        for lv in range(4, 11):
            mul = CLASS_CONFIG["battleship"][lv]["damage_mul"]
            assert mul == 3.075, \
                f"Battleship Lv{lv}: expected damage_mul 3.075, got {mul}"

    def test_battleship_per_shot_damage(self):
        """每发伤害 = base * damage_mul * (原塔数 / (新塔数 * 炮管数))"""
        for lv in range(4, 11):
            cfg = get_class_config("battleship", lv)
            base = LEVEL_CONFIG[lv]
            cc = CLASS_CONFIG["battleship"][lv]
            new_turrets = cfg["front_turrets"] + cfg["back_turrets"]
            base_shots = base["front_turrets"] + base["back_turrets"]
            dmg_scale = base_shots / (new_turrets * cfg["barrels"])
            expected = round(base["damage"] * cc["damage_mul"] * dmg_scale)
            assert cfg["damage"] == expected, \
                f"Battleship Lv{lv}: expected per-shot damage {expected}, got {cfg['damage']}"

    def test_battleship_salvo_dpm_preserved(self):
        """改炮管/布局后齐射总伤害应近似不变 (DPM 恒定)"""
        for lv in range(4, 11):
            cfg = get_class_config("battleship", lv)
            base = LEVEL_CONFIG[lv]
            new_salvo = (cfg["front_turrets"] + cfg["back_turrets"]) * cfg["barrels"] * cfg["damage"]
            old_salvo = (base["front_turrets"] + base["back_turrets"]) * round(base["damage"] * 3.075)
            assert abs(new_salvo - old_salvo) <= 6, \
                f"Battleship Lv{lv}: salvo drifted old={old_salvo} new={new_salvo}"


class TestCruiserGunDamage:
    """巡洋舰火炮伤害*1.3 — damage_mul 从 1.0 变为 1.3"""

    def test_cruiser_damage_mul(self):
        for lv in range(4, 11):
            mul = CLASS_CONFIG["cruiser"][lv]["damage_mul"]
            assert mul == 1.3, \
                f"Cruiser Lv{lv}: expected damage_mul 1.3, got {mul}"

    def test_cruiser_per_shot_damage(self):
        """每发伤害 = base * damage_mul * (原塔数 / (新塔数 * 炮管数))"""
        for lv in range(4, 11):
            cfg = get_class_config("cruiser", lv)
            base = LEVEL_CONFIG[lv]
            cc = CLASS_CONFIG["cruiser"][lv]
            new_turrets = cfg["front_turrets"] + cfg["back_turrets"]
            base_shots = base["front_turrets"] + base["back_turrets"]
            dmg_scale = base_shots / (new_turrets * cfg["barrels"])
            expected = round(base["damage"] * cc["damage_mul"] * dmg_scale)
            assert cfg["damage"] == expected, \
                f"Cruiser Lv{lv}: expected per-shot damage {expected}, got {cfg['damage']}"

    def test_cruiser_salvo_dpm_preserved(self):
        """改炮管后齐射总伤害应近似不变 (DPM 恒定)"""
        for lv in range(4, 11):
            cfg = get_class_config("cruiser", lv)
            base = LEVEL_CONFIG[lv]
            new_salvo = (cfg["front_turrets"] + cfg["back_turrets"]) * cfg["barrels"] * cfg["damage"]
            old_salvo = (base["front_turrets"] + base["back_turrets"]) * round(base["damage"] * 1.3)
            assert abs(new_salvo - old_salvo) <= 6, \
                f"Cruiser Lv{lv}: salvo drifted old={old_salvo} new={new_salvo}"


class TestDestroyerGunDamage:
    """驱逐舰火炮伤害*0.7 — damage_mul 0.7"""

    def test_destroyer_per_shot_damage(self):
        for lv in range(4, 11):
            cfg = get_class_config("destroyer", lv)
            base = LEVEL_CONFIG[lv]
            cc = CLASS_CONFIG["destroyer"][lv]
            new_turrets = cfg["front_turrets"] + cfg["back_turrets"]
            base_shots = base["front_turrets"] + base["back_turrets"]
            dmg_scale = base_shots / (new_turrets * cfg["barrels"])
            expected = round(base["damage"] * cc["damage_mul"] * dmg_scale)
            assert cfg["damage"] == expected, \
                f"Destroyer Lv{lv}: expected per-shot damage {expected}, got {cfg['damage']}"


class TestMultiBarrelConfig:
    """多管炮塔配置规则 (6级起双联装；BB 8-10级三联装 + A-B-X)"""

    def test_double_turret_from_level_6(self):
        for cls in ["destroyer", "cruiser", "battleship"]:
            for lv in range(4, 6):
                assert get_class_config(cls, lv)["barrels"] == 1, \
                    f"{cls} Lv{lv} should have single barrel"
            for lv in range(6, 8):
                assert get_class_config(cls, lv)["barrels"] == 2, \
                    f"{cls} Lv{lv} should have double barrels"

    def test_battleship_triple_turret_and_abx_layout(self):
        # Lv8-9: triple barrels in A-B-X layout (2 front + 1 back).
        for lv in range(8, 10):
            cfg = get_class_config("battleship", lv)
            assert cfg["barrels"] == 3, f"BB Lv{lv} should have triple barrels"
            assert cfg["front_turrets"] == 2, f"BB Lv{lv} A-B-X layout: 2 front"
            assert cfg["back_turrets"] == 1, f"BB Lv{lv} A-B-X layout: 1 back"

    def test_battleship_level10_four_triple_turrets(self):
        """BB Lv10: 4 triple-barrel turrets (2 front + 2 back), DPM unchanged."""
        cfg = get_class_config("battleship", 10)
        assert cfg["barrels"] == 3, "BB Lv10 should have triple barrels"
        assert cfg["front_turrets"] == 2, "BB Lv10 layout: 2 front"
        assert cfg["back_turrets"] == 2, "BB Lv10 layout: 2 back"

    def test_cruiser_destroyer_stay_double_at_high_level(self):
        for cls in ["destroyer", "cruiser"]:
            for lv in range(8, 11):
                assert get_class_config(cls, lv)["barrels"] == 2, \
                    f"{cls} Lv{lv} should remain double barrels"


class TestEnemyTurretDamage:
    """敌方炮塔伤害*2 — ENEMY_SCALE damage * 2"""

    def test_turret_damage_doubled(self):
        original_damage = {
            1: 10, 2: 12, 3: 15, 4: 18, 5: 22,
            6: 29, 7: 38, 8: 49, 9: 62, 10: 77,
        }
        for lv, orig in original_damage.items():
            assert ENEMY_SCALE[lv]["damage"] == orig * 2, \
                f"Turret Lv{lv}: expected damage {orig * 2}, got {ENEMY_SCALE[lv]['damage']}"

    def test_turret_hp_unchanged(self):
        """炮塔血量不变"""
        original_hp = {
            1: 100, 2: 130, 3: 170, 4: 220, 5: 280,
            6: 350, 7: 430, 8: 520, 9: 630, 10: 750,
        }
        for lv, orig in original_hp.items():
            assert ENEMY_SCALE[lv]["hp"] == orig, \
                f"Turret Lv{lv}: hp should be unchanged {orig}, got {ENEMY_SCALE[lv]['hp']}"

    def test_enemy_ship_damage_unchanged(self):
        """敌方舰船伤害不变"""
        unchanged = {
            1: 18, 2: 23, 3: 29, 4: 36, 5: 45,
            6: 57, 7: 72, 8: 90,
        }
        for lv, expected in unchanged.items():
            assert ENEMY_SHIP_SCALE[lv]["damage"] == expected, \
                f"Enemy ship Lv{lv}: damage should be {expected}, got {ENEMY_SHIP_SCALE[lv]['damage']}"


class TestTorpedoDamage:
    """鱼雷伤害在原 *2 基础上再 *1.5 — 公式 (50 + tier * 20) * 3"""

    def test_torpedo_damage_values(self):
        expected = {1: 210.0, 2: 270.0, 3: 330.0}
        mgr = TorpedoManager()
        for tier, exp in expected.items():
            # 直接调用 fire 创建鱼雷，检查 damage 值
            result = mgr.fire("test_owner", tier, 4, 0, 0, 0, count=1)
            assert len(result) == 1
            assert result[0].damage == exp, \
                f"Torpedo tier {tier}: expected damage {exp}, got {result[0].damage}"


class TestOtherUnchanged:
    """确保不该变的东西没变"""

    def test_destroyer_damage_mul_unchanged(self):
        for lv in range(4, 11):
            mul = CLASS_CONFIG["destroyer"][lv]["damage_mul"]
            assert mul == 0.7, \
                f"Destroyer Lv{lv}: damage_mul should be 0.7, got {mul}"

    def test_hp_mul_unchanged(self):
        """hp_mul 不变，血量变化仅来自 base hp"""
        for cls_name, expected_mul in [("destroyer", 0.6), ("cruiser", 1.0), ("battleship", 1.4)]:
            for lv in range(4, 11):
                mul = CLASS_CONFIG[cls_name][lv]["hp_mul"]
                assert mul == expected_mul, \
                    f"{cls_name} Lv{lv}: hp_mul should be {expected_mul}, got {mul}"

    def test_speed_mul_unchanged(self):
        for cls_name in ["destroyer", "cruiser", "battleship"]:
            for lv in range(4, 11):
                cfg = CLASS_CONFIG[cls_name][lv]
                assert cfg["speed_mul"] > 0  # just verify it exists and hasn't been zeroed

    def test_other_base_stats_unchanged(self):
        """LEVEL_CONFIG 中除 hp 外其他属性不变"""
        for lv in range(1, 11):
            cfg = LEVEL_CONFIG[lv]
            assert cfg["length"] > 0
            assert cfg["width"] > 0
            assert cfg["damage"] > 0
            assert cfg["turn_radius"] > 0
            assert cfg["fire_cooldown"] > 0
            # 验证 damage 没被意外修改（等级1 damage 仍为30）
        assert LEVEL_CONFIG[1]["damage"] == 30
        assert LEVEL_CONFIG[10]["damage"] == 80
