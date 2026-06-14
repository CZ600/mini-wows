import math
import random
from game.config import (
    GRAVITY, ENEMY_FIRE_COOLDOWN, ENEMY_DETECT_RANGE, ENEMY_FIRE_SPEED,
    ENEMY_SCALE, ENEMY_SHIP_SCALE, AI_DT, get_ship_config,
)
from game.projectile import apply_cannon_spread, compensate_drag_pitch


class ServerTurret:
    def __init__(self, enemy_id, x, z, size, hp, damage, score_value):
        self.enemy_id = enemy_id
        self.type = "turret"
        self.x = x
        self.z = z
        self.size = size
        self.hp = hp
        self.max_hp = hp
        self.damage = damage
        self.score_value = score_value
        self.alive = True
        self.cooldown = ENEMY_FIRE_COOLDOWN * (0.5 + random.random() * 0.5)

    def take_damage(self, amount):
        self.hp -= amount
        if self.hp < 0:
            self.hp = 0
        if self.hp <= 0:
            self.alive = False

    def update(self, dt, ships, game_state):
        if not self.alive:
            return
        self.cooldown -= dt

        # Find closest alive player
        target = self._find_closest_player(ships)
        if not target:
            return

        dist = target[1]
        if dist > ENEMY_DETECT_RANGE:
            return

        if self.cooldown <= 0:
            self._fire(target[0], game_state)
            self.cooldown = ENEMY_FIRE_COOLDOWN

    def _find_closest_player(self, ships):
        closest = None
        closest_dist = float('inf')
        for pid, ship in ships.items():
            if not ship.alive:
                continue
            dx = ship.pos_x - self.x
            dz = ship.pos_z - self.z
            dist = math.sqrt(dx * dx + dz * dz)
            if dist < closest_dist:
                closest_dist = dist
                closest = (ship, dist)
        return closest

    def _fire(self, target_ship, game_state):
        # Lead prediction: aim at where the target will be when the projectile arrives
        raw_dx = target_ship.pos_x - self.x
        raw_dz = target_ship.pos_z - self.z
        raw_dist = math.sqrt(raw_dx * raw_dx + raw_dz * raw_dz)
        flight_time = raw_dist / ENEMY_FIRE_SPEED if ENEMY_FIRE_SPEED > 0 else 0
        lead_x = target_ship.pos_x + math.sin(target_ship.heading) * target_ship.speed * flight_time
        lead_z = target_ship.pos_z + math.cos(target_ship.heading) * target_ship.speed * flight_time

        dx = lead_x - self.x
        dz = lead_z - self.z
        dist = math.sqrt(dx * dx + dz * dz)
        fire_origin_y = self.size / 2 + 2

        if dist < 1:
            pitch = math.pi / 6
        else:
            v2 = ENEMY_FIRE_SPEED * ENEMY_FIRE_SPEED
            v4 = v2 * v2
            dy = 0 - fire_origin_y
            disc = v4 - GRAVITY * (GRAVITY * dist * dist + 2 * dy * v2)
            if disc < 0:
                pitch = math.pi / 6
            else:
                pitch = math.atan((v2 - math.sqrt(disc)) / (GRAVITY * dist))
            pitch = max(math.radians(-20), min(math.radians(80), pitch))

        pitch = compensate_drag_pitch(pitch, dist, ENEMY_FIRE_SPEED)

        yaw = math.atan2(dx, dz)
        direction = (
            math.sin(yaw) * math.cos(pitch),
            math.sin(pitch),
            math.cos(yaw) * math.cos(pitch),
        )

        direction = apply_cannon_spread(direction, dist)

        game_state.projectile_mgr.fire(
            f"e_{self.enemy_id}", self.damage,
            (self.x, fire_origin_y, self.z),
            direction,
        )

    def to_snapshot(self):
        return {
            "id": f"e_{self.enemy_id}",
            "type": "turret",
            "x": round(self.x, 2),
            "z": round(self.z, 2),
            "hp": round(self.hp, 1),
            "mhp": self.max_hp,
            "size": self.size,
            "alive": self.alive,
        }


class ServerEnemyShip:
    SHIP_TURN_RATE = math.pi / 3

    def __init__(self, enemy_id, x, z, enemy_level, ship_type=None):
        self.enemy_id = enemy_id
        self.type = "ship"
        self.x = x
        self.z = z
        self.enemy_level = enemy_level
        self.ship_type = ship_type
        self.alive = True

        scale = ENEMY_SHIP_SCALE.get(enemy_level, ENEMY_SHIP_SCALE[8])
        self.hp = scale["hp"]
        self.max_hp = scale["hp"]
        self.damage = scale["damage"]
        self.max_speed = scale["speed"]
        self.score_value = scale["score"]

        cfg = get_ship_config(enemy_level, ship_type)
        self.ship_length = cfg["length"]
        self.ship_width = cfg["width"]

        self.heading = random.random() * math.pi * 2
        self.speed = 0
        self.state = "idle"
        self.spawn_x = x
        self.spawn_z = z
        self.patrol_x = x
        self.patrol_z = z
        self.orbit_dir = 1 if random.random() < 0.5 else -1
        self.cooldown = ENEMY_FIRE_COOLDOWN * (0.5 + random.random() * 0.5)
        self.torpedo_cooldown = 10 + random.random() * 10

        self._pick_patrol_target()

    def take_damage(self, amount):
        self.hp -= amount
        if self.hp < 0:
            self.hp = 0
        if self.hp <= 0:
            self.alive = False

    def _pick_patrol_target(self):
        angle = random.random() * math.pi * 2
        r = random.random() * 300
        self.patrol_x = self.spawn_x + math.cos(angle) * r
        self.patrol_z = self.spawn_z + math.sin(angle) * r

    def _rotate_toward(self, target, dt):
        diff = target - self.heading
        while diff > math.pi:
            diff -= 2 * math.pi
        while diff < -math.pi:
            diff += 2 * math.pi
        max_delta = self.SHIP_TURN_RATE * dt
        if abs(diff) < max_delta:
            self.heading = target
        else:
            self.heading += math.copysign(max_delta, diff)
        while self.heading > math.pi:
            self.heading -= 2 * math.pi
        while self.heading < -math.pi:
            self.heading += 2 * math.pi

    def update(self, dt, ships, game_state):
        if not self.alive:
            return

        self.cooldown -= dt
        self.torpedo_cooldown -= dt

        # Find closest alive player
        closest_ship = None
        closest_dist = float('inf')
        for pid, ship in ships.items():
            if not ship.alive:
                continue
            dx = ship.pos_x - self.x
            dz = ship.pos_z - self.z
            dist = math.sqrt(dx * dx + dz * dz)
            if dist < closest_dist:
                closest_dist = dist
                closest_ship = ship

        if closest_ship is None:
            return

        if closest_dist < 50:
            self.state = "orbit"
        elif closest_dist < ENEMY_DETECT_RANGE:
            self.state = "chase"
        elif self.state != "idle":
            self.state = "idle"

        if self.state == "idle":
            pt_dx = self.patrol_x - self.x
            pt_dz = self.patrol_z - self.z
            pt_dist = math.sqrt(pt_dx * pt_dx + pt_dz * pt_dz)
            if pt_dist < 20:
                self._pick_patrol_target()
            target_h = math.atan2(pt_dx, pt_dz)
            target_speed = self.max_speed * 0.3
        elif self.state == "chase":
            target_h = math.atan2(
                closest_ship.pos_x - self.x,
                closest_ship.pos_z - self.z,
            )
            target_speed = self.max_speed * 0.7
        else:  # orbit
            dx = closest_ship.pos_x - self.x
            dz = closest_ship.pos_z - self.z
            nx = dx / closest_dist
            nz = dz / closest_dist
            tx = -nz * self.orbit_dir
            tz = nx * self.orbit_dir
            if closest_dist > 60:
                tx += nx * 0.3
                tz += nz * 0.3
            elif closest_dist < 40:
                tx -= nx * 0.3
                tz -= nz * 0.3
            target_h = math.atan2(tx, tz)
            target_speed = self.max_speed * 0.5

        self._rotate_toward(target_h, dt)
        self.speed = target_speed

        new_x = self.x + math.sin(self.heading) * self.speed * dt
        new_z = self.z + math.cos(self.heading) * self.speed * dt

        if game_state.terrain and game_state.terrain.is_land(new_x, new_z):
            self.heading += math.pi * 0.5
            if self.state == "idle":
                self._pick_patrol_target()
        else:
            self.x = max(-5000, min(5000, new_x))
            self.z = max(-5000, min(5000, new_z))

        # Fire at player
        if (self.state in ("chase", "orbit") and closest_dist < ENEMY_DETECT_RANGE
                and self.cooldown <= 0):
            self._fire_at(closest_ship, closest_dist, game_state)
            self.cooldown = ENEMY_FIRE_COOLDOWN

        # Torpedo for cruiser AI
        if (self.ship_type == "cruiser"
                and self.state in ("chase", "orbit")
                and closest_dist < 400
                and self.torpedo_cooldown <= 0):
            aim_h = math.atan2(
                closest_ship.pos_x - self.x,
                closest_ship.pos_z - self.z,
            )
            game_state.torpedo_mgr.fire(
                f"e_{self.enemy_id}", 1, self.enemy_level,
                self.x, self.z, aim_h, count=2, spread="narrow",
            )
            self.torpedo_cooldown = 15

    def _fire_at(self, target, dist, game_state):
        fire_origin_y = 3.0

        # Lead prediction
        flight_time = dist / ENEMY_FIRE_SPEED if ENEMY_FIRE_SPEED > 0 else 0
        lead_x = target.pos_x + math.sin(target.heading) * target.speed * flight_time
        lead_z = target.pos_z + math.cos(target.heading) * target.speed * flight_time
        lead_dx = lead_x - self.x
        lead_dz = lead_z - self.z
        lead_dist = math.sqrt(lead_dx * lead_dx + lead_dz * lead_dz)

        dy = 0 - fire_origin_y

        if lead_dist < 1:
            pitch = math.pi / 6
        else:
            v2 = ENEMY_FIRE_SPEED * ENEMY_FIRE_SPEED
            v4 = v2 * v2
            disc = v4 - GRAVITY * (GRAVITY * lead_dist * lead_dist + 2 * dy * v2)
            if disc < 0:
                pitch = math.pi / 6
            else:
                pitch = math.atan((v2 - math.sqrt(disc)) / (GRAVITY * lead_dist))
            pitch = max(math.radians(-20), min(math.radians(80), pitch))

        pitch = compensate_drag_pitch(pitch, lead_dist, ENEMY_FIRE_SPEED)

        yaw = math.atan2(lead_dx, lead_dz)
        direction = (
            math.sin(yaw) * math.cos(pitch),
            math.sin(pitch),
            math.cos(yaw) * math.cos(pitch),
        )

        direction = apply_cannon_spread(direction, lead_dist)

        game_state.projectile_mgr.fire(
            f"e_{self.enemy_id}", self.damage,
            (self.x, fire_origin_y, self.z),
            direction,
        )

    def to_snapshot(self):
        return {
            "id": f"e_{self.enemy_id}",
            "type": "ship",
            "x": round(self.x, 2),
            "z": round(self.z, 2),
            "h": round(self.heading, 4),
            "hp": round(self.hp, 1),
            "mhp": self.max_hp,
            "size": self.ship_length,
            "alive": self.alive,
            "shipType": self.ship_type,
        }


class EnemyManager:
    def __init__(self):
        self.enemies = []
        self._next_id = 0

    def spawn(self, level, player_positions, terrain):
        """Spawn enemies for a wave. player_positions: list of (x, z)."""
        scale = ENEMY_SCALE.get(level, ENEMY_SCALE[10])
        size = scale["size"]
        player_count = max(1, len(player_positions))
        count = scale["count"] + (player_count - 1) * 2

        # Average player position
        avg_x = sum(p[0] for p in player_positions) / len(player_positions)
        avg_z = sum(p[1] for p in player_positions) / len(player_positions)

        self.enemies.clear()

        if level < 3:
            for _ in range(count):
                x, z = self._find_water_pos(avg_x, avg_z, 100, 500, terrain)
                if x is None:
                    continue
                enemy = ServerTurret(
                    self._next_id, x, z, size,
                    scale["hp"], scale["damage"], scale["score"],
                )
                self._next_id += 1
                self.enemies.append(enemy)
        else:
            # 5 turrets + 10 enemy ships
            for _ in range(5):
                x, z = self._find_water_pos(avg_x, avg_z, 100, 400, terrain)
                if x is None:
                    continue
                enemy = ServerTurret(
                    self._next_id, x, z, size,
                    scale["hp"], scale["damage"], scale["score"],
                )
                self._next_id += 1
                self.enemies.append(enemy)

            enemy_ship_level = max(1, level - 1)
            for _ in range(10):
                x, z = self._find_water_pos(avg_x, avg_z, 200, 1800, terrain)
                if x is None:
                    continue
                ship_type = None
                if enemy_ship_level >= 4:
                    ship_type = "cruiser" if random.random() < 0.5 else "battleship"
                ship = ServerEnemyShip(
                    self._next_id, x, z, enemy_ship_level, ship_type,
                )
                self._next_id += 1
                self.enemies.append(ship)

    def _find_water_pos(self, cx, cz, min_dist, max_dist, terrain, attempts=20):
        for _ in range(attempts):
            angle = random.random() * math.pi * 2
            dist = min_dist + random.random() * (max_dist - min_dist)
            x = cx + math.cos(angle) * dist
            z = cz + math.sin(angle) * dist
            if terrain and terrain.is_land(x, z):
                continue
            # Check not too close to other enemies
            too_close = False
            for e in self.enemies:
                dx = e.x - x
                dz = e.z - z
                if math.sqrt(dx * dx + dz * dz) < 100:
                    too_close = True
                    break
            if too_close:
                continue
            return x, z
        return None, None

    def get_alive_count(self):
        return sum(1 for e in self.enemies if e.alive)

    def get_snapshots(self):
        return [e.to_snapshot() for e in self.enemies if e.alive]
