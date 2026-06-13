import math
import numpy as np
from game.config import TORPEDO_HIT_RADIUS, get_torpedo_stats


class ServerTorpedo:
    __slots__ = [
        "torp_id", "owner", "tier", "damage",
        "x", "z", "vx", "vz",
        "speed", "range", "distance", "alive",
    ]

    def __init__(self, torp_id, owner, tier, damage, x, z, heading, speed, range_):
        self.torp_id = torp_id
        self.owner = owner
        self.tier = tier
        self.damage = damage
        self.x = x
        self.z = z
        self.speed = speed
        self.range = range_
        self.vx = math.sin(heading) * speed
        self.vz = math.cos(heading) * speed
        self.distance = 0.0
        self.alive = True

    def update(self, dt):
        self.x += self.vx * dt
        self.z += self.vz * dt
        self.distance += self.speed * dt
        if self.distance >= self.range:
            self.alive = False

    def to_snapshot(self):
        return {
            "id": self.torp_id,
            "x": round(self.x, 2),
            "z": round(self.z, 2),
            "tier": self.tier,
            "owner": self.owner,
        }


class TorpedoManager:
    def __init__(self):
        self.torpedoes = []
        self._next_id = 0

    def fire(self, owner, tier, level, x, z, heading, count=1, spread="narrow"):
        stats = get_torpedo_stats(tier, level)
        if not stats:
            return []

        damage = (50 + tier * 20) * 3
        angles = self._calc_spread(count, spread)
        created = []

        for offset in angles:
            angle = heading + offset
            torp = ServerTorpedo(
                self._next_id, owner, tier, damage,
                x, z, angle, stats["speed"], stats["range"],
            )
            self._next_id += 1
            self.torpedoes.append(torp)
            created.append(torp)
        return created

    def _calc_spread(self, count, spread):
        if count <= 1:
            return [0]
        max_angle = math.radians(15 if spread == "wide" else 5)
        return [
            -max_angle + 2 * max_angle * i / (count - 1)
            for i in range(count)
        ]

    def update(self, dt, ships):
        events = []

        for t in self.torpedoes:
            if t.alive:
                t.update(dt)

        # Collision detection with numpy — rotation-correct
        alive_ships = [(pid, s) for pid, s in ships.items() if s.alive]
        if alive_ships and self.torpedoes:
            ship_ids = [pid for pid, _ in alive_ships]
            ship_pos = np.array([[s.pos_x, s.pos_z] for _, s in alive_ships])
            ship_headings = np.array([s.heading for _, s in alive_ships])
            ship_half_w = np.array([s.ship_width / 2 + TORPEDO_HIT_RADIUS for _, s in alive_ships])
            ship_half_l = np.array([s.ship_length / 2 + TORPEDO_HIT_RADIUS for _, s in alive_ships])

            cos_h = np.cos(ship_headings)
            sin_h = np.sin(ship_headings)

            for t in self.torpedoes:
                if not t.alive:
                    continue
                rel_x = t.x - ship_pos[:, 0]
                rel_z = t.z - ship_pos[:, 1]
                local_x = rel_x * cos_h + rel_z * sin_h
                local_z = -rel_x * sin_h + rel_z * cos_h

                hit_mask = (np.abs(local_x) < ship_half_w) & (np.abs(local_z) < ship_half_l)
                hit_indices = np.where(hit_mask)[0]

                for idx in hit_indices:
                    pid = ship_ids[idx]
                    ship = alive_ships[idx][1]

                    if t.owner == pid:
                        continue
                    if ship.team and t.owner in ships:
                        owner_ship = ships.get(t.owner)
                        if owner_ship and owner_ship.team == ship.team:
                            continue

                    ship.take_damage(t.damage)
                    t.alive = False
                    events.append({
                        "type": "hit",
                        "target": pid,
                        "damage": t.damage,
                        "attacker": t.owner,
                    })
                    if not ship.alive:
                        events.append({
                            "type": "entity_destroyed",
                            "target": pid,
                            "destroyed_by": t.owner,
                        })
                    break

        self.torpedoes = [t for t in self.torpedoes if t.alive]
        return events

    def get_snapshots(self):
        return [t.to_snapshot() for t in self.torpedoes]
