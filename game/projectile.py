import math
import numpy as np
from game.config import GRAVITY, PROJECTILE_INITIAL_SPEED, PROJECTILE_MAX_LIFETIME


class ServerProjectile:
    __slots__ = [
        "proj_id", "owner", "damage", "x", "y", "z",
        "vx", "vy", "vz", "lifetime", "alive",
    ]

    def __init__(self, proj_id, owner, damage, origin, direction):
        self.proj_id = proj_id
        self.owner = owner
        self.damage = damage
        self.x, self.y, self.z = origin
        speed = PROJECTILE_INITIAL_SPEED
        self.vx = direction[0] * speed
        self.vy = direction[1] * speed
        self.vz = direction[2] * speed
        self.lifetime = 0.0
        self.alive = True

    def update(self, dt):
        self.lifetime += dt
        self.vy -= GRAVITY * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.z += self.vz * dt

        if self.y <= 0:
            self.alive = False
            return
        if self.lifetime > PROJECTILE_MAX_LIFETIME:
            self.alive = False

    def to_snapshot(self):
        return {
            "id": self.proj_id,
            "x": round(self.x, 2),
            "y": round(self.y, 2),
            "z": round(self.z, 2),
            "owner": self.owner,
        }


class ProjectileManager:
    def __init__(self):
        self.projectiles = []
        self._next_id = 0

    def fire(self, owner, damage, origin, direction):
        proj = ServerProjectile(self._next_id, owner, damage, origin, direction)
        self._next_id += 1
        self.projectiles.append(proj)
        return proj

    def update(self, dt, terrain, ships):
        events = []

        # Update all projectiles
        for p in self.projectiles:
            if p.alive:
                p.update(dt)

        # Terrain collision
        if terrain:
            for p in self.projectiles:
                if p.alive and terrain.is_land(p.x, p.z):
                    th = terrain.get_height_at(p.x, p.z)
                    if p.y <= th:
                        p.alive = False

        # Ship collision using numpy vectorized detection
        # Transform projectile into each ship's local space for rotation-correct AABB
        alive_ships = [(pid, s) for pid, s in ships.items() if s.alive]
        if alive_ships and self.projectiles:
            ship_ids = [pid for pid, _ in alive_ships]
            ship_positions = np.array([[s.pos_x, s.pos_z] for _, s in alive_ships])
            ship_headings = np.array([s.heading for _, s in alive_ships])
            ship_half_w = np.array([s.ship_width / 2 + 0.5 for _, s in alive_ships])
            ship_half_l = np.array([s.ship_length / 2 + 0.5 for _, s in alive_ships])
            ship_heights = np.array([2.5] * len(alive_ships))

            cos_h = np.cos(ship_headings)
            sin_h = np.sin(ship_headings)

            for p in self.projectiles:
                if not p.alive:
                    continue
                # Vector from ship center to projectile
                rel_x = p.x - ship_positions[:, 0]
                rel_z = p.z - ship_positions[:, 1]
                # Rotate into ship local space (inverse of heading)
                local_x = rel_x * cos_h + rel_z * sin_h
                local_z = -rel_x * sin_h + rel_z * cos_h
                dy = abs(p.y)

                hit_mask = (np.abs(local_x) < ship_half_w) & (np.abs(local_z) < ship_half_l) & (dy < ship_heights)
                hit_indices = np.where(hit_mask)[0]

                for idx in hit_indices:
                    pid = ship_ids[idx]
                    ship = alive_ships[idx][1]

                    # Don't hit self
                    if p.owner == pid:
                        continue

                    # In team mode, don't hit teammates
                    if ship.team and p.owner in ships:
                        owner_ship = ships.get(p.owner)
                        if owner_ship and owner_ship.team == ship.team:
                            continue

                    ship.take_damage(p.damage)
                    p.alive = False
                    events.append({
                        "type": "hit",
                        "target": pid,
                        "damage": p.damage,
                        "attacker": p.owner,
                    })
                    if not ship.alive:
                        events.append({
                            "type": "entity_destroyed",
                            "target": pid,
                            "destroyed_by": p.owner,
                        })
                    break

        # Clean up dead projectiles
        self.projectiles = [p for p in self.projectiles if p.alive]
        return events

    def get_snapshots(self):
        return [p.to_snapshot() for p in self.projectiles]
