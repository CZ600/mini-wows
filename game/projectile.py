import math
import random
import numpy as np
from game.config import (
    GRAVITY, PROJECTILE_INITIAL_SPEED, PROJECTILE_MAX_LIFETIME, PROJECTILE_DRAG,
    CANNON_SPREAD_BASE, CANNON_SPREAD_VERTICAL_MULT, CANNON_SPREAD_MAX_SIGMA,
    CANNON_SPREAD_CLASS,
)


class ServerProjectile:
    __slots__ = [
        "proj_id", "owner", "damage",
        "x", "y", "z", "px", "py", "pz",
        "vx", "vy", "vz", "lifetime", "alive",
    ]

    def __init__(self, proj_id, owner, damage, origin, direction):
        self.proj_id = proj_id
        self.owner = owner
        self.damage = damage
        self.x, self.y, self.z = origin
        self.px, self.py, self.pz = origin
        speed = PROJECTILE_INITIAL_SPEED
        self.vx = direction[0] * speed
        self.vy = direction[1] * speed
        self.vz = direction[2] * speed
        self.lifetime = 0.0
        self.alive = True

    def update(self, dt):
        self.lifetime += dt
        self.px, self.py, self.pz = self.x, self.y, self.z

        # Drag: speed decays over time (non-ideal trajectory)
        drag = 1.0 - PROJECTILE_DRAG * dt
        self.vx *= drag
        self.vy *= drag
        self.vz *= drag

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


def apply_cannon_spread(direction, distance, ship_class=None, spread_mult=1.0):
    """Perturb direction with angular spread centered on the original aim.

    Spread model: sigma_h = class_base + distance * SPREAD_BASE * class_growth
    - destroyer: tiny base, high growth → best close, worst far
    - cruiser: medium base, medium growth → balanced
    - battleship: larger base, low growth → best at range
    Vertical sigma = horizontal * VERT_MULT.
    Random values clamped at ±MAX_SIGMA sigma to avoid wild outliers.

    spread_mult: 全局 σ 乘数，例如 precision 技能激活时为 0.7。
    """
    class_cfg = CANNON_SPREAD_CLASS.get(ship_class, {"base": 0.0008, "growth": 0.4})
    sigma_h = (class_cfg["base"] + distance * CANNON_SPREAD_BASE * class_cfg["growth"]) * spread_mult
    sigma_v = sigma_h * CANNON_SPREAD_VERTICAL_MULT

    max_h = CANNON_SPREAD_MAX_SIGMA * sigma_h
    max_v = CANNON_SPREAD_MAX_SIGMA * sigma_v
    delta_yaw = max(-max_h, min(max_h, random.gauss(0, sigma_h)))
    delta_pitch = max(-max_v, min(max_v, random.gauss(0, sigma_v)))

    if abs(delta_yaw) < 1e-9 and abs(delta_pitch) < 1e-9:
        return direction

    dx, dy, dz = direction
    pitch = math.asin(max(-1.0, min(1.0, dy)))
    yaw = math.atan2(dx, dz)

    new_pitch = pitch + delta_pitch
    new_pitch = max(-math.pi / 2 + 0.01, min(math.pi / 2 - 0.01, new_pitch))
    new_yaw = yaw + delta_yaw

    cos_p = math.cos(new_pitch)
    return (
        math.sin(new_yaw) * cos_p,
        math.sin(new_pitch),
        math.cos(new_yaw) * cos_p,
    )


def compensate_drag_pitch(pitch, horiz_dist, muzzle_speed):
    """Adjust pitch to compensate for drag-induced range loss.

    Without compensation, drag shortens the trajectory at longer ranges.
    This adds a small empirical bump proportional to estimated flight time.
    """
    if horiz_dist < 1 or muzzle_speed <= 0:
        return pitch
    flight_time_est = horiz_dist / muzzle_speed
    drag_loss = PROJECTILE_DRAG * flight_time_est * 0.5
    return pitch + drag_loss * 0.4


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

        # Ship collision: swept AABB (segment vs box) in each ship's local space.
        # Point-in-box would let fast projectiles (200 m/s = 10 m/tick at 20 Hz)
        # tunnel through small ships. The segment from prev to curr position is
        # tested against the box to catch every crossing.
        #
        # Half-width / half-length are tight to the visual mesh:
        #   Deck is the widest BoxGeometry in ship.js: width * 0.85, length * 0.85
        #   → visual half-extent = width * 0.425, length * 0.425.
        # We use width * 0.45 / length * 0.45 to add a ~6% tolerance so a
        # projectile that visually grazes the deck edge still counts as a hit.
        alive_ships = [(pid, s) for pid, s in ships.items() if s.alive]
        if alive_ships and self.projectiles:
            ship_ids = [pid for pid, _ in alive_ships]
            ship_positions = np.array([[s.pos_x, s.pos_z] for _, s in alive_ships])
            ship_headings = np.array([s.heading for _, s in alive_ships])
            ship_half_w = np.array([s.ship_width * 0.45 for _, s in alive_ships])
            ship_half_l = np.array([s.ship_length * 0.45 for _, s in alive_ships])
            # Upper bound covers hull + deck + small bridge base; without this,
            # projectiles at deck level (y≈2 on a level-1 ship) would miss.
            ship_h_upper = np.array([getattr(s, 'ship_height', 2.5) + 3.0 for _, s in alive_ships])

            cos_h = np.cos(ship_headings)
            sin_h = np.sin(ship_headings)
            EPS = 1e-9

            for p in self.projectiles:
                if not p.alive:
                    continue

                # Transform prev and curr into each ship's local space (inverse heading)
                rel_x_prev = p.px - ship_positions[:, 0]
                rel_z_prev = p.pz - ship_positions[:, 1]
                rel_x_curr = p.x - ship_positions[:, 0]
                rel_z_curr = p.z - ship_positions[:, 1]

                lx_prev = rel_x_prev * cos_h + rel_z_prev * sin_h
                lz_prev = -rel_x_prev * sin_h + rel_z_prev * cos_h
                lx_curr = rel_x_curr * cos_h + rel_z_curr * sin_h
                lz_curr = -rel_x_curr * sin_h + rel_z_curr * cos_h

                dx = lx_curr - lx_prev
                dy = p.y - p.py
                dz = lz_curr - lz_prev

                # Avoid division by zero on axes where the segment is parallel
                dx_s = np.where(np.abs(dx) < EPS, EPS, dx)
                dy_s = np.where(np.abs(dy) < EPS, EPS, dy)
                dz_s = np.where(np.abs(dz) < EPS, EPS, dz)

                # Slab method: t-interval where segment overlaps each axis slab
                tx1 = (-ship_half_w - lx_prev) / dx_s
                tx2 = (ship_half_w - lx_prev) / dx_s
                tx_lo = np.minimum(tx1, tx2)
                tx_hi = np.maximum(tx1, tx2)

                ty1 = (0.0 - p.py) / dy_s
                ty2 = (ship_h_upper - p.py) / dy_s
                ty_lo = np.minimum(ty1, ty2)
                ty_hi = np.maximum(ty1, ty2)

                tz1 = (-ship_half_l - lz_prev) / dz_s
                tz2 = (ship_half_l - lz_prev) / dz_s
                tz_lo = np.minimum(tz1, tz2)
                tz_hi = np.maximum(tz1, tz2)

                t_enter = np.maximum(np.maximum(tx_lo, ty_lo), tz_lo)
                t_exit = np.minimum(np.minimum(tx_hi, ty_hi), tz_hi)

                # Segment crosses the box and overlap intersects [0, 1]
                hits = (t_enter <= t_exit) & (t_exit >= 0.0) & (t_enter <= 1.0)

                # For parallel axes, require prev position inside that slab
                par_x = np.abs(dx) < EPS
                par_y = np.abs(dy) < EPS
                par_z = np.abs(dz) < EPS
                hits &= (~par_x) | (np.abs(lx_prev) < ship_half_w)
                hits &= (~par_y) | ((p.py >= 0.0) & (p.py < ship_h_upper))
                hits &= (~par_z) | (np.abs(lz_prev) < ship_half_l)

                hit_indices = np.where(hits)[0]

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
