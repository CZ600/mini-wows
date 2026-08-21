"""Tests for the anti-air (AA) and anti-submarine (ASW) weapon systems.

These cover the core gameplay loops the feature adds:
  - AA flak damages/destroys aircraft squadrons (server-authoritative).
  - Depth charges are a CLOSE-RANGE delayed weapon: the drop point is clamped
    into the ship's [min, range] band, charges splash and float for
    ASW_FUSE_DELAY seconds, then detonate with a large AoE that ONLY damages
    submarines (surface ships are untouched) — including fully-submerged ones
    via the `weapon="depth_charge"` shell-immunity bypass (projectile.py).
  - Battleship ASW is an air strike: a plane flies to the marked rectangle and
    scatters fused charges across it.
  - Submerged submarines are only vulnerable to depth charges and torpedoes.
"""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.config import (
    CARRIER, GRAVITY, get_class_aa, get_class_asw, get_asw_tier, get_air_group_config,
    ASW_TIER, ASW_BLAST_RADIUS, ASW_FUSE_DELAY, AA_DRAG,
)
from game.terrain import Terrain
from game.ship import ServerShip
from game.aircraft import ServerSquadron
from game.game_state import GameState
from game.projectile import ProjectileManager


def _terrain():
    return Terrain(None, None)

def _make_ship(pid, ship_class, level=7, x=0.0, z=0.0, team=None):
    s = ServerShip(pid, f"p{pid}", level=level, ship_class=ship_class, team=team)
    s.pos_x, s.pos_z = x, z
    return s


# --------------------------------------------------------------------------- #
# Class loadouts
# --------------------------------------------------------------------------- #
class TestClassLoadouts:
    def test_battleship_has_air_dropped_asw(self):
        """战列舰的反潜是飞机空投(用户需求)。"""
        asw = get_class_asw("battleship")
        assert asw is not None, "battleship should have an ASW fit"
        assert asw["tier"] >= 1
        assert asw["range"] > 0
        assert asw["air"] is True

    def test_destroyer_is_asw_specialist(self):
        """驱逐舰是反潜专精(tier 2),近程投掷。"""
        asw = get_class_asw("destroyer")
        assert asw["tier"] == 2
        assert asw["air"] is False
        assert 0 < asw["min"] < asw["range"]

    def test_cruiser_uses_close_range_drop(self):
        asw = get_class_asw("cruiser")
        assert asw["tier"] == 1
        assert asw["air"] is False
        assert 0 < asw["min"] < asw["range"]

    def test_submarine_has_no_asw(self):
        assert get_class_asw("submarine") is None

    def test_carrier_has_no_asw(self):
        assert get_class_asw("carrier") is None

    def test_all_combat_classes_have_aa_except_submarine(self):
        for cls in ("destroyer", "cruiser", "battleship", "carrier"):
            assert get_class_aa(cls) is not None, f"{cls} should field AA"
        assert get_class_aa("submarine") is None

    def test_asw_tier_damage_falls_off_with_tier(self):
        """反潜 tier 越高伤害越大。"""
        assert get_asw_tier(2)["damage"] > get_asw_tier(1)["damage"]


# --------------------------------------------------------------------------- #
# Squadron HP model
# --------------------------------------------------------------------------- #
class TestSquadronHp:
    def test_squadron_starts_full_hp(self):
        sq = ServerSquadron(0, owner=1, x=0, z=0, level=6)
        assert sq.hp == CARRIER["aircraft_hp"]
        assert sq.alive is True

    def test_take_damage_destroys_at_zero(self):
        sq = ServerSquadron(0, owner=1, x=0, z=0, level=6)
        killed = sq.take_damage(sq.hp)
        assert killed is True
        assert sq.alive is False
        assert sq.hp == 0

    def test_snapshot_carries_hp(self):
        from game.aircraft import AircraftManager
        mgr = AircraftManager()
        mgr.spawn(1, 0, 0, level=6)
        snaps = mgr.get_snapshots()
        assert snaps and "hp" in snaps[0] and "mhp" in snaps[0]


# --------------------------------------------------------------------------- #
# AA end-to-end: a ship's auto-AA shoots down a hostile squadron
# --------------------------------------------------------------------------- #
class TestAaDefense:
    def test_cruiser_aa_destroys_hostile_squadron(self):
        gs = GameState(_terrain(), mode="ffa")
        cru = _make_ship(1, "cruiser", level=7, x=0, z=0)
        gs.ships = {1: cru}

        sq = ServerSquadron(0, owner=99, x=0, z=0, level=6)  # owner 99 => hostile
        sq.pos_x, sq.pos_z, sq.altitude = 0, 0, 80
        gs.aircraft_mgr.squadrons.append(sq)

        for _ in range(600):
            gs.update(0.05)
            if not sq.alive:
                break
        assert not sq.alive, "cruiser AA should have shot the hostile squadron down"

    def test_aa_does_not_fire_on_empty_skies(self):
        """无飞机时 AA 不应产生任何 flak 投射物。"""
        gs = GameState(_terrain(), mode="ffa")
        gs.ships = {1: _make_ship(1, "cruiser", level=7)}
        for _ in range(10):
            gs.update(0.05)
        flak = [p for p in gs.projectile_mgr.projectiles if p.weapon == "flak"]
        assert flak == []


# --------------------------------------------------------------------------- #
# Flak air-burst: AA shells self-destruct at the top of their arc
# --------------------------------------------------------------------------- #
class TestFlakAirburst:
    def test_missed_flak_bursts_at_apex(self):
        """未命中的防空炮弹应在弹道最高点空爆（flak_burst 事件），而不是飞完整个抛物线坠海。"""
        mgr = ProjectileManager()
        mgr.fire(1, 8, (0, 3, 0), (0.6, 0.8, 0.0),
                 muzzle_speed=220.0, drag=AA_DRAG, weapon="flak")
        events = []
        for _ in range(400):
            events.extend(mgr.update(0.05, None, {}))
            if not mgr.projectiles:
                break
        bursts = [e for e in events if e["type"] == "flak_burst"]
        assert bursts, "a missed flak shell must air-burst at the apex"
        # The burst happens high up (the arc's peak), never at the waterline.
        assert bursts[0]["y"] > 20
        assert mgr.projectiles == [], "the shell must despawn at the burst"

    def test_burst_position_is_the_highest_point(self):
        """空爆位置就是抛物线最高点（vy 翻负的那一拍，误差不超过一个 tick 的下沉）。"""
        mgr = ProjectileManager()
        p = mgr.fire(1, 8, (0, 3, 0), (0.0, 1.0, 0.0),
                     muzzle_speed=100.0, drag=AA_DRAG, weapon="flak")
        peak = p.y
        while mgr.projectiles:
            mgr.update(0.05, None, {})
            peak = max(peak, p.y)
        assert not p.alive
        assert peak - p.y <= 3.0, "shell should die within one tick of the apex"


# --------------------------------------------------------------------------- #
# Dive-bomber scatter: more, weaker bombs randomly spread inside the aiming
# circle instead of a line abreast (same salvo total damage)
# --------------------------------------------------------------------------- #
class TestBomberScatter:
    def _simulate_impact(self, drop):
        """Integrate one bomb descriptor (drag + gravity) to its landing point."""
        x, y, z, vx, vy, vz = drop[:6]
        h = 0.02
        for _ in range(2000):
            if y <= 0:
                break
            d = 1.0 - CARRIER["bomb_drag"] * h
            vx *= d
            vy *= d
            vz *= d
            vy -= GRAVITY * h
            x += vx * h
            y += vy * h
            z += vz * h
        return x, z

    def test_bomb_salvo_scatters_inside_the_aiming_circle(self):
        """一次投 8 颗弱炸弹（总伤不变），随机散布在瞄准圈内而非一字排开。"""
        sq = ServerSquadron(0, owner=1, x=0, z=0, level=6)
        sq.speed = 50.0
        cfg = get_air_group_config(6)["bomber"]
        assert cfg["salvo"] == 8
        ix, iz, _ = sq._simulate_bomb()

        drops = sq.drop_bomb()
        assert len(drops) == 8
        assert sq.bomber["ammo"] == cfg["ammo"] - 8

        impacts = [self._simulate_impact(d) for d in drops]
        for (x, z) in impacts:
            dist = math.hypot(x - ix, z - iz)
            assert dist <= CARRIER["bomb_scatter_radius"] + 1.0, \
                f"bomb landed outside the aiming circle ({dist:.1f} m)"
        # Random scatter: not every bomb lands on the same point.
        assert len(set(impacts)) > 1
        # Bombs release from the squadron itself (no line-abreast offsets).
        for d in drops:
            assert d[0] == sq.pos_x and d[2] == sq.pos_z
        # Per-salvo total damage is unchanged (8 x half damage).
        assert sum(d[6] for d in drops) == cfg["salvo"] * cfg["dmg"]


# --------------------------------------------------------------------------- #
# ASW end-to-end: delayed depth charges damage submarines (and only them)
# --------------------------------------------------------------------------- #
class TestAswDepthCharges:
    def _fully_submerged_sub(self, pid=2, x=0.0, z=0.0):
        sub = _make_ship(pid, "submarine", level=7, x=x, z=z)
        sub.submerged = True
        # Run the dive transition to full depth.
        for _ in range(60):
            sub.update_dive_transition(0.05)
        assert sub.fully_submerged, "sub fixture should be fully submerged"
        return sub

    def test_depth_charge_damages_submerged_sub_after_fuse_delay(self):
        """深水炸弹入水后延迟 ASW_FUSE_DELAY 秒才引爆,引爆后伤及下潜潜艇。"""
        gs = GameState(_terrain(), mode="ffa")
        sub = self._fully_submerged_sub(pid=2, x=0, z=0)
        dd = _make_ship(1, "destroyer", level=7, x=0, z=50)
        gs.ships = {1: dd, 2: sub}
        hp_before = sub.hp

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 0}})
        # The aim point (50 m away) is inside the min band (60 m), so it is
        # pushed out to ~60 m from the destroyer: flight is well under a second
        # at 110 m/s. Before the fuse expires the sub must be untouched.
        for _ in range(int((ASW_FUSE_DELAY - 0.5) / 0.05)):
            gs.update(0.05)
        assert sub.hp == hp_before, "charge must NOT detonate before its fuse expires"

        for _ in range(200):
            gs.update(0.05)
        assert sub.hp < hp_before, "depth charges should damage the submerged sub after the fuse"

    def test_depth_charge_never_damages_surface_ships(self):
        """深水炸弹只对潜艇有伤害,对水面舰船(即使贴脸)无伤害。"""
        gs = GameState(_terrain(), mode="ffa")
        sub = self._fully_submerged_sub(pid=2, x=0, z=0)
        dd = _make_ship(1, "destroyer", level=7, x=0, z=50)
        # An enemy cruiser parked right in the blast area.
        cru = _make_ship(3, "cruiser", level=7, x=5, z=5)
        gs.ships = {1: dd, 2: sub, 3: cru}
        cru_hp = cru.hp

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 0}})
        for _ in range(200):
            gs.update(0.05)

        assert cru.hp == cru_hp, "depth charges must not damage surface ships"
        assert sub.hp < sub.max_hp, "the sub in the same blast should take damage"

    def test_submerged_sub_is_immune_to_ordinary_shells(self):
        """普通炮弹(非深水炸弹)打不到完全下潜的潜艇——这是 ASW 存在的理由。"""
        gs = GameState(_terrain(), mode="ffa")
        sub = self._fully_submerged_sub(pid=2, x=0, z=0)
        shooter = _make_ship(1, "cruiser", level=7, x=0, z=50)
        gs.ships = {1: shooter, 2: sub}
        hp_before = sub.hp
        # Fire an ordinary shell straight at the sub from above.
        gs.projectile_mgr.fire(1, 100, (0, 50, 0), (0, -1, 0))
        for _ in range(60):
            gs.update(0.05)
        assert sub.hp == hp_before, "ordinary shells must miss a fully-submerged sub"

    def test_torpedo_still_hits_submerged_sub(self):
        """下潜潜艇仍可被鱼雷击中(下潜后只能被深水炸弹和鱼雷伤害)。"""
        gs = GameState(_terrain(), mode="ffa")
        sub = self._fully_submerged_sub(pid=2, x=0, z=-100)
        dd = _make_ship(1, "destroyer", level=7, x=0, z=0)
        gs.ships = {1: dd, 2: sub}
        hp_before = sub.hp
        # Tier-1 torpedo: ~22 m/s over 100 m ≈ 4.5 s.
        gs.torpedo_mgr.fire(1, 1, 7, 0, 0, math.atan2(0.0, -100.0), count=1, spread="narrow")
        for _ in range(240):
            gs.update(0.05)
        assert sub.hp < hp_before, "torpedoes must still hit a submerged sub"

    def test_asw_respects_range_limit(self):
        """深水炸弹的投弹点应被限制在该舰种的 ASW 射程内。"""
        gs = GameState(_terrain(), mode="ffa")
        dd = _make_ship(1, "destroyer", level=7, x=0, z=0)
        gs.ships = {1: dd}
        asw_range = get_class_asw("destroyer")["range"]
        # Place a sub well beyond range + spread + blast: it must NOT be hit.
        sub = self._fully_submerged_sub(pid=2, x=0, z=asw_range + ASW_BLAST_RADIUS + 150)
        gs.ships[2] = sub
        gs.process_asw_fire(1, {"aim": {"x": 0, "z": sub.pos_z}})
        hp_before = sub.hp
        for _ in range(400):
            gs.update(0.05)
        assert sub.hp == hp_before, "a sub beyond range + blast must not be hit"

    def test_asw_aim_clamped_not_rejected(self):
        """投弹点超出射程时应被夹紧而非拒发(否则远程瞄准无响应)。"""
        gs = GameState(_terrain(), mode="ffa")
        dd = _make_ship(1, "destroyer", level=7, x=0, z=0)
        gs.ships = {1: dd}
        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 99999}})
        charges = [p for p in gs.projectile_mgr.projectiles if p.weapon == "depth_charge"]
        assert len(charges) == ASW_TIER[2]["salvo"], "a full salvo should still fire (clamped)"

    def test_asw_min_range_pushes_drop_off_own_deck(self):
        """投掷点太近时被推出到最小距离(不许炸自己甲板)。"""
        gs = GameState(_terrain(), mode="ffa")
        dd = _make_ship(1, "destroyer", level=7, x=0, z=0)
        gs.ships = {1: dd}
        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 5}})
        charges = [p for p in gs.projectile_mgr.projectiles if p.weapon == "depth_charge"]
        assert charges, "a salvo should fire even with a too-close aim"
        # Every charge's sub-point sits at >= min_range from the ship, so its
        # launch direction has a substantial horizontal component.
        for p in charges:
            horiz = (p.vx * p.vx + p.vz * p.vz) ** 0.5
            assert horiz > 1.0, "charges should be thrown outward, not dropped on the deck"

    def test_submerged_player_sub_cannot_fire_asw(self):
        """下潜潜艇的发射管在水下,不能投深水炸弹。"""
        gs = GameState(_terrain(), mode="ffa")
        sub = self._fully_submerged_sub(pid=1, x=0, z=0)
        gs.ships = {1: sub}
        # A submarine has no ASW fit anyway, so nothing fires.
        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 0}})
        charges = [p for p in gs.projectile_mgr.projectiles if p.weapon == "depth_charge"]
        assert charges == []


# --------------------------------------------------------------------------- #
# Battleship air-dropped ASW strike
# --------------------------------------------------------------------------- #
class TestAswAirStrike:
    def _fully_submerged_sub(self, pid=2, x=0.0, z=0.0):
        sub = _make_ship(pid, "submarine", level=7, x=x, z=z)
        sub.submerged = True
        for _ in range(60):
            sub.update_dive_transition(0.05)
        assert sub.fully_submerged
        return sub

    def test_battleship_asw_spawns_strike_plane(self):
        """战列舰的 asw_fire 应生成一架飞机而不是直接投掷深弹。"""
        gs = GameState(_terrain(), mode="ffa")
        bb = _make_ship(1, "battleship", level=8, x=0, z=0)
        gs.ships = {1: bb}

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 300}})
        charges = [p for p in gs.projectile_mgr.projectiles if p.weapon == "depth_charge"]
        assert charges == [], "the strike plane carries the charges, none drop at release"
        assert len(gs._asw_planes) == 1, "one strike plane should be en route"
        snap = gs.get_snapshot(1)
        assert any(p["owner"] == 1 for p in snap["aswPlanes"]), "snapshot should carry the plane"

    def test_battleship_air_strike_damages_sub_in_rectangle(self):
        """飞机飞到目标区后随机散布深弹,延迟引爆杀伤区内潜艇。"""
        gs = GameState(_terrain(), mode="ffa")
        bb = _make_ship(1, "battleship", level=8, x=0, z=0)
        sub = self._fully_submerged_sub(pid=2, x=0, z=300)
        gs.ships = {1: bb, 2: sub}
        hp_before = sub.hp

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 300}})
        # Cruise 300 m at 60 m/s (5 s) + release + fall (~1.5 s) + fuse (3 s)
        # + leave (5 s). 25 s of sim covers the whole sortie.
        saw_charges = False
        for _ in range(500):
            gs.update(0.05)
            if any(p.weapon == "depth_charge" for p in gs.projectile_mgr.projectiles):
                saw_charges = True
        assert saw_charges, "the strike plane should have dropped depth charges"
        assert sub.hp < hp_before, "the sub inside the target rectangle should be damaged"
        assert gs._asw_planes == [], "the plane should despawn after the strike run"

    def test_battleship_air_strike_target_clamped(self):
        """目标方框中心应被限制在空投最大距离内。"""
        gs = GameState(_terrain(), mode="ffa")
        bb = _make_ship(1, "battleship", level=8, x=0, z=0)
        gs.ships = {1: bb}

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 99999}})
        assert len(gs._asw_planes) == 1
        plane = gs._asw_planes[0]
        max_range = get_class_asw("battleship")["range"]
        d = math.hypot(plane["target_x"] - bb.pos_x, plane["target_z"] - bb.pos_z)
        assert d <= max_range + 1e-6

    def test_air_strike_does_not_damage_surface_ships(self):
        """空投深弹同样只伤潜艇。"""
        gs = GameState(_terrain(), mode="ffa")
        bb = _make_ship(1, "battleship", level=8, x=0, z=0)
        cru = _make_ship(3, "cruiser", level=7, x=0, z=300)
        gs.ships = {1: bb, 3: cru}
        cru_hp = cru.hp

        gs.process_asw_fire(1, {"aim": {"x": 0, "z": 300}})
        for _ in range(500):
            gs.update(0.05)
        assert cru.hp == cru_hp, "air-dropped charges must not damage surface ships"


# --------------------------------------------------------------------------- #
# Auto-pilot re-arm commitment: a squadron heading home to re-arm CIRCLES the
# carrier until BOTH pools are full. The old exit (any ammo + any target) let
# it sortie again the moment a single round came back.
# --------------------------------------------------------------------------- #
class TestSquadronRearmCommitment:
    def _ctx(self):
        from types import SimpleNamespace
        enemy = SimpleNamespace(alive=True, pos_x=400.0, pos_z=0.0)
        return enemy, {"x": 0.0, "z": 0.0}

    def test_stays_circling_until_fully_rearmed(self):
        enemy, carrier = self._ctx()
        sq = ServerSquadron(0, owner=1, x=150, z=0, level=6)
        sq.auto_pilot = True
        sq.torpedo["ammo"] = 0
        sq.bomber["ammo"] = 0

        # ~60% of the nominal re-arm window: several rounds replenished, pools
        # still not full — the squadron must remain committed to the carrier.
        total = sq.torpedo["max_ammo"] + sq.bomber["max_ammo"]
        steps = int(((total / CARRIER["rearm_rate"]) * 0.6) / 0.05)
        for _ in range(steps):
            sq.update(0.05, {}, carrier_pos=carrier, enemies=[enemy])
        assert sq.torpedo["ammo"] + sq.bomber["ammo"] > 2
        assert sq._auto_phase == "rearm"
        assert math.hypot(sq.pos_x, sq.pos_z) <= CARRIER["rearm_range"]

        # Top both pools off completely.
        for _ in range(4000):
            sq.update(0.05, {}, carrier_pos=carrier, enemies=[enemy])
            if (sq.torpedo["ammo"] >= sq.torpedo["max_ammo"]
                    and sq.bomber["ammo"] >= sq.bomber["max_ammo"]):
                break
        assert sq.torpedo["ammo"] == sq.torpedo["max_ammo"]
        assert sq.bomber["ammo"] == sq.bomber["max_ammo"]

        # Fully armed + live target -> back to the fight.
        sq.update(0.05, {}, carrier_pos=carrier, enemies=[enemy])
        assert sq._auto_phase in ("engage", "attack")

    def test_orbits_inside_the_rearm_ring(self):
        _, carrier = self._ctx()
        sq = ServerSquadron(0, owner=1, x=0, z=137, level=6)
        sq.auto_pilot = True
        sq.torpedo["ammo"] = 0
        sq.bomber["ammo"] = 0

        max_d = 0.0
        for _ in range(600):   # 30 s of loitering (no enemies: full => stay)
            sq.update(0.05, {}, carrier_pos=carrier, enemies=[])
            max_d = max(max_d, math.hypot(sq.pos_x, sq.pos_z))
        assert sq._auto_phase == "rearm"
        assert max_d < CARRIER["rearm_range"], "the loiter must stay inside the re-arm ring"
        assert max_d > 30, "the squadron should really orbit, not park on the carrier"
