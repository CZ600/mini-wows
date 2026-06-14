import sys
import os

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.torpedo import TorpedoManager
from game.projectile import ProjectileManager
from game.ship import ServerShip


def _make_ship(pid=1, hp=1000, level=4):
    s = ServerShip(pid, f"p{pid}", level=level, ship_class="destroyer")
    s.pos_x = 0
    s.pos_z = 30
    s.heading = 0
    s.hp = hp
    s.max_hp = hp
    return s


class TestTorpedoHitEventHasWeapon:
    """鱼雷命中事件必须带 weapon='torpedo' 字段，前端按此分流音效。"""

    def test_torpedo_hit_event_has_weapon_field(self):
        mgr = TorpedoManager()
        ship = _make_ship()
        ships = {1: ship}

        mgr.fire(99, 1, 4, 0, 0, 0, count=1)

        events = []
        for _ in range(200):
            events = mgr.update(1.0 / 20, ships)
            if events:
                break

        assert events, "鱼雷应当命中目标"
        hit_evts = [e for e in events if e["type"] == "hit"]
        assert hit_evts, "应当至少产生一个 hit 事件"
        for e in hit_evts:
            assert e.get("weapon") == "torpedo", f"hit 事件缺少 weapon=torpedo 字段: {e}"

    def test_projectile_hit_event_has_no_weapon_field(self):
        """炮弹 hit 事件保持原样，不带 weapon 字段。"""
        mgr = ProjectileManager()
        ship = _make_ship()
        ships = {1: ship}

        # 炮弹起始位置在目标上方，垂直向下发射，确保命中
        # update 签名: update(dt, terrain, ships)
        mgr.fire(99, 100, (0, 50, ship.pos_z), (0, -1, 0))

        events = []
        for _ in range(200):
            events = mgr.update(1.0 / 60, None, ships)
            if events:
                break

        assert events, "炮弹应当命中目标"
        hit_evts = [e for e in events if e["type"] == "hit"]
        assert hit_evts, "应当至少产生一个 hit 事件"
        for e in hit_evts:
            assert "weapon" not in e, f"炮弹 hit 事件不应带 weapon 字段: {e}"
