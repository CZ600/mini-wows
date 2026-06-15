"""战舰技能系统。

每个 ServerShip 持有一个 ShipSkills 实例，管理三个技能：
- rapid_fire (F): 装填时间减少 30%，持续 10s，冷却 80s
- damage_control (G): 恢复 30% 最大血量，持续 10s，冷却 40s
- precision (H): 散布减少 30%，持续 10s，冷却 60s

技能可同时激活；死亡时按键忽略；重生后冷却清零。
"""

from game.config import SKILL_CONFIG


class ShipSkills:
    SKILL_NAMES = ("rapid_fire", "damage_control", "precision")

    def __init__(self):
        # active_remain: 剩余生效秒数；>0 表示技能生效中
        # cooldown_remain: 剩余冷却秒数；>0 表示冷却中
        self.active_remain = {name: 0.0 for name in self.SKILL_NAMES}
        self.cooldown_remain = {name: 0.0 for name in self.SKILL_NAMES}
        # damage_control 累计回血量（用于 30% max_hp 上限）
        self._dc_accumulated = 0.0
        self._dc_cap = 0.0

    def is_active(self, name):
        return self.active_remain.get(name, 0.0) > 0.0

    def get_cooldown_remain(self, name):
        return self.cooldown_remain.get(name, 0.0)

    def get_active_remain(self, name):
        return self.active_remain.get(name, 0.0)

    def can_activate(self, name):
        if name not in SKILL_CONFIG:
            return False
        if self.active_remain.get(name, 0.0) > 0.0:
            return False
        if self.cooldown_remain.get(name, 0.0) > 0.0:
            return False
        return True

    def activate(self, name, ship):
        """激活技能。需要传入 ship 以便对当前状态做即时调整。

        rapid_fire: 立即将当前所有炮塔的剩余冷却乘以 fire_cooldown_mult
        damage_control: 重置累计回血为 0，记录 max_hp*0.3 上限
        precision: 无需额外初始化（发射时按需查询）
        """
        if not self.can_activate(name):
            return False
        cfg = SKILL_CONFIG[name]
        self.active_remain[name] = cfg["duration"]
        self.cooldown_remain[name] = cfg["cooldown"]

        if name == "rapid_fire":
            mult = cfg["fire_cooldown_mult"]
            for i in range(len(ship.turret_cooldowns)):
                if ship.turret_cooldowns[i] > 0:
                    ship.turret_cooldowns[i] *= mult
        elif name == "damage_control":
            self._dc_accumulated = 0.0
            self._dc_cap = ship.max_hp * cfg["hp_regen_ratio"]
        return True

    def update(self, dt, ship):
        """每 tick 调用，更新计时与损管回血。仅在 ship.alive 时回血。

        注意：本 tick 内 skill 可能在 dt 中途过期，所以 heal 必须按
        "实际生效时长"（min(剩余生效, dt)）计算，否则 dt 较大时会丢失末段回血。
        """
        for name in self.SKILL_NAMES:
            prev_active = self.active_remain[name]
            if prev_active > 0.0:
                self.active_remain[name] = max(0.0, prev_active - dt)
            if self.cooldown_remain[name] > 0.0:
                self.cooldown_remain[name] = max(0.0, self.cooldown_remain[name] - dt)

            if name == "damage_control":
                active_time = min(prev_active, dt) if prev_active > 0 else 0
                if active_time > 0 and ship.alive:
                    cfg = SKILL_CONFIG["damage_control"]
                    remaining_cap = self._dc_cap - self._dc_accumulated
                    if remaining_cap > 1e-6:
                        rate = self._dc_cap / cfg["duration"]
                        heal = min(rate * active_time, remaining_cap)
                        ship.hp = min(ship.max_hp, ship.hp + heal)
                        self._dc_accumulated += heal

    def reset(self):
        """重生时调用，清空所有冷却与生效状态。"""
        for name in self.SKILL_NAMES:
            self.active_remain[name] = 0.0
            self.cooldown_remain[name] = 0.0
        self._dc_accumulated = 0.0
        self._dc_cap = 0.0

    def to_snapshot(self):
        """序列化为 snapshot 字段。键名缩写以节省带宽。"""
        return {
            "rf": {
                "a": round(self.active_remain["rapid_fire"], 2),
                "c": round(self.cooldown_remain["rapid_fire"], 2),
            },
            "dc": {
                "a": round(self.active_remain["damage_control"], 2),
                "c": round(self.cooldown_remain["damage_control"], 2),
            },
            "ps": {
                "a": round(self.active_remain["precision"], 2),
                "c": round(self.cooldown_remain["precision"], 2),
            },
        }
