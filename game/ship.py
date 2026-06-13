import math
from game.config import (
    BASE_MAX_SPEED, ACCEL, DECEL_FRICTION, MAP_HALF,
    get_ship_config,
)


class ServerShip:
    def __init__(self, player_id, username, level=1, ship_class=None, team=None):
        self.player_id = player_id
        self.username = username
        self.level = level
        self.ship_class = ship_class
        self.team = team
        self.alive = True

        cfg = get_ship_config(level, ship_class)
        self.ship_length = cfg["length"]
        self.ship_width = cfg["width"]
        self.ship_height = cfg["height"]
        self.turn_radius = cfg["turn_radius"]
        self.max_hp = cfg["hp"]
        self.hp = self.max_hp
        self.max_speed = cfg.get("max_speed", BASE_MAX_SPEED)
        self.fire_cooldown = cfg["fire_cooldown"]
        self.damage = cfg["damage"]

        self.pos_x = 0.0
        self.pos_z = 0.0
        self.heading = 0.0
        self.speed = 0.0

        self.turret_cooldowns = [0.0] * (cfg["front_turrets"] + cfg["back_turrets"])

    def update(self, dt, keys, terrain=None):
        if not self.alive:
            return

        # Speed-dependent acceleration: faster at low speed, slower at high speed
        speed_ratio = abs(self.speed) / self.max_speed if self.max_speed > 0 else 0
        accel = ACCEL * (1.5 - speed_ratio)

        if keys.get("w"):
            self.speed += accel * dt
        if keys.get("s"):
            self.speed -= accel * dt
        if not keys.get("w") and not keys.get("s"):
            self.speed *= DECEL_FRICTION
            if abs(self.speed) < 0.1:
                self.speed = 0.0

        self.speed = max(-self.max_speed * 0.3, min(self.max_speed, self.speed))

        if abs(self.speed) > 0.5:
            turn_rate = self.speed / self.turn_radius
            if keys.get("a"):
                self.heading += turn_rate * dt
            if keys.get("d"):
                self.heading -= turn_rate * dt

        new_x = self.pos_x + math.sin(self.heading) * self.speed * dt
        new_z = self.pos_z + math.cos(self.heading) * self.speed * dt
        new_x = max(-MAP_HALF, min(MAP_HALF, new_x))
        new_z = max(-MAP_HALF, min(MAP_HALF, new_z))

        if terrain:
            corners = self._get_corners_at(new_x, new_z)
            for cx, cz in corners:
                if terrain.is_land(cx, cz):
                    self.hp = 0
                    self.alive = False
                    return

        self.pos_x = new_x
        self.pos_z = new_z

    def _get_corners_at(self, x, z):
        half_l = self.ship_length / 2
        half_w = self.ship_width / 2
        cos_h = math.cos(self.heading)
        sin_h = math.sin(self.heading)
        return [
            (x + sin_h * half_l + cos_h * half_w, z + cos_h * half_l - sin_h * half_w),
            (x + sin_h * half_l - cos_h * half_w, z + cos_h * half_l + sin_h * half_w),
            (x - sin_h * half_l + cos_h * half_w, z - cos_h * half_l - sin_h * half_w),
            (x - sin_h * half_l - cos_h * half_w, z - cos_h * half_l + sin_h * half_w),
        ]

    def take_damage(self, amount):
        self.hp -= amount
        if self.hp <= 0:
            self.hp = 0
            self.alive = False

    def find_safe_spawn(self, terrain):
        if terrain and not terrain.is_land(0, 0):
            self.pos_x = 0.0
            self.pos_z = 0.0
            return
        for r in range(100, 2001, 100):
            for a_idx in range(12):
                angle = a_idx * math.pi / 6
                x = math.cos(angle) * r
                z = math.sin(angle) * r
                if terrain and not terrain.is_land(x, z):
                    self.pos_x = x
                    self.pos_z = z
                    return
        self.pos_x = 0.0
        self.pos_z = 0.0

    def to_snapshot(self):
        return {
            "id": self.player_id,
            "name": self.username,
            "x": round(self.pos_x, 2),
            "z": round(self.pos_z, 2),
            "h": round(self.heading, 4),
            "spd": round(self.speed, 2),
            "hp": round(self.hp, 1),
            "mhp": self.max_hp,
            "alive": self.alive,
            "team": self.team,
            "lvl": self.level,
            "shipClass": self.ship_class,
        }
