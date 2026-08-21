import math
import random
import numpy as np
from game.config import (
    GRAVITY, PROJECTILE_INITIAL_SPEED, PROJECTILE_MAX_LIFETIME, PROJECTILE_DRAG,
    CANNON_SPREAD_BASE, CANNON_SPREAD_VERTICAL_MULT, CANNON_SPREAD_MAX_SIGMA,
    CANNON_SPREAD_CLASS,
    AA_HIT_RADIUS, ASW_BLAST_RADIUS, ASW_FUSE_DELAY,
)


class ServerProjectile:
    __slots__ = [
        "proj_id", "owner", "damage", "weapon",
        "x", "y", "z", "px", "py", "pz",
        "vx", "vy", "vz", "lifetime", "alive", "drag",
        # Depth-charge fuse: None while airborne; counts down from
        # ASW_FUSE_DELAY once the charge splashes into the water. When it
        # reaches 0 the charge is flagged `detonate` and the manager resolves
        # the underwater AoE (submarines only).
        "fuse", "detonate",
        # Flak air-burst: set when a flak shell reaches the top of its arc
        # without a proximity hit. Purely cosmetic — the manager turns it into
        # a `flak_burst` event so clients render the black puff (no sound).
        "airburst",
    ]

    def __init__(self, proj_id, owner, damage, origin, direction, muzzle_speed=PROJECTILE_INITIAL_SPEED, drag=PROJECTILE_DRAG, weapon="shell"):
        self.proj_id = proj_id
        self.owner = owner
        self.damage = damage
        self.weapon = weapon
        self.x, self.y, self.z = origin
        self.px, self.py, self.pz = origin
        speed = muzzle_speed
        self.vx = direction[0] * speed
        self.vy = direction[1] * speed
        self.vz = direction[2] * speed
        self.drag = drag
        self.lifetime = 0.0
        self.alive = True
        self.fuse = None
        self.detonate = False
        self.airburst = False

    def update(self, dt):
        self.lifetime += dt
        self.px, self.py, self.pz = self.x, self.y, self.z

        # Depth charges that have splashed float at the surface while their
        # fuse runs down; they only detonate (via the manager) when it expires.
        if self.fuse is not None:
            self.fuse -= dt
            if self.fuse <= 0:
                self.alive = False
                self.detonate = True
            return

        # Drag: speed decays over time (non-ideal trajectory)
        drag = 1.0 - self.drag * dt
        self.vx *= drag
        self.vy *= drag
        self.vz *= drag

        self.vy -= GRAVITY * dt
        self.x += self.vx * dt
        self.y += self.vy * dt
        self.z += self.vz * dt

        # Flak shells are proximity-fused AA rounds: one that reaches the top
        # of its arc (vy flips negative) without connecting self-destructs
        # there — the classic air burst — instead of flying the full arc down
        # into the sea. Purely cosmetic (the manager emits a `flak_burst`
        # event); it also stops tracking for hits, trimming AA's envelope.
        if self.weapon == "flak" and self.vy <= 0:
            self.alive = False
            self.airburst = True
            return

        if self.y <= 0:
            if self.weapon == "depth_charge":
                # Water entry: park at the surface and arm the fuse. The charge
                # bobs here (snapshot keeps it visible) until it detonates.
                self.y = 0.0
                self.vx = self.vy = self.vz = 0.0
                self.fuse = ASW_FUSE_DELAY
                return
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
            # Weapon kind so clients can render small-calibre tracers (flak /
            # secondary) thinner than main-battery shells.
            "w": self.weapon,
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

    def fire(self, owner, damage, origin, direction, muzzle_speed=PROJECTILE_INITIAL_SPEED, drag=PROJECTILE_DRAG, weapon="shell"):
        proj = ServerProjectile(self._next_id, owner, damage, origin, direction, muzzle_speed=muzzle_speed, drag=drag, weapon=weapon)
        self._next_id += 1
        self.projectiles.append(proj)
        return proj

    def update(self, dt, terrain, ships, aircraft_mgr=None):
        """Advance projectiles, resolve terrain/ship/aircraft collisions.

        aircraft_mgr: the room's AircraftManager, so `weapon='flak'` shells can
        hit squadrons and `weapon='depth_charge'` shells can AoE submarines. May
        be None (e.g. when no aircraft are in play) — flak then does nothing.
        """
        events = []

        # Update all projectiles
        for p in self.projectiles:
            if p.alive:
                p.update(dt)

        # Flak air-bursts: shells flagged by update() exploded at the top of
        # their arc. Visual-only event — clients render a silent black puff
        # (hits keep their own `air_hit` explosions with sound).
        for p in self.projectiles:
            if p.airburst:
                p.airburst = False
                events.append({
                    "type": "flak_burst",
                    "attacker": p.owner,
                    "x": round(p.x, 2),
                    "y": round(p.y, 2),
                    "z": round(p.z, 2),
                })

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

                # Depth charges never resolve as direct hull hits: they lob over
                # the surface, splash, then detonate on their fuse with an AoE
                # that only affects submarines (handled after this loop).
                if p.weapon == "depth_charge":
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

                    # Fully-submerged submarines are immune to ordinary shells
                    # (they pass overhead through the water column). Depth-charge
                    # weapons bypass this. Mirrors frontend projectile.js.
                    if getattr(ship, "fully_submerged", False) and p.weapon != "depth_charge":
                        continue

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
                    # Impact coordinates so the client can render the explosion
                    # at the server-authoritative hit point (no client-side hit
                    # prediction in multiplayer).
                    events.append({
                        "type": "hit",
                        "target": pid,
                        "damage": p.damage,
                        "attacker": p.owner,
                        "x": round(p.x, 2),
                        "y": round(p.y, 2),
                        "z": round(p.z, 2),
                    })
                    if not ship.alive:
                        events.append({
                            "type": "entity_destroyed",
                            "target": pid,
                            "destroyed_by": p.owner,
                            "x": round(p.x, 2),
                            "y": round(p.y, 2),
                            "z": round(p.z, 2),
                        })
                    break

        # ---- Aircraft collisions: `weapon="flak"` AA shells vs squadrons ----
        # Flak detonates within AA_HIT_RADIUS (m) of a squadron's lead position
        # (3D distance), so dense AA still threatens a fast-moving squadron. The
        # owner is the firing ship's player_id; friendly aircraft are skipped
        # (same owner). Mirrors the client projectile.js flak branch.
        if aircraft_mgr is not None:
            squads = [sq for sq in aircraft_mgr.squadrons if sq.alive]
            if squads:
                r2 = AA_HIT_RADIUS * AA_HIT_RADIUS
                for p in self.projectiles:
                    if not p.alive or p.weapon != "flak":
                        continue
                    for sq in squads:
                        # Don't shoot down your own air wing (owner == shooter).
                        if p.owner == sq.owner:
                            continue
                        dx = sq.pos_x - p.x
                        dy = sq.altitude - p.y
                        dz = sq.pos_z - p.z
                        if dx * dx + dy * dy + dz * dz <= r2:
                            killed = sq.take_damage(p.damage)
                            p.alive = False
                            events.append({
                                "type": "air_hit",
                                "target": sq.owner,
                                "squad": sq.squad_id,
                                "damage": p.damage,
                                "attacker": p.owner,
                                "x": round(p.x, 2),
                                "y": round(p.y, 2),
                                "z": round(p.z, 2),
                            })
                            if killed:
                                events.append({
                                    "type": "air_destroyed",
                                    "target": sq.owner,
                                    "squad": sq.squad_id,
                                    "destroyed_by": p.owner,
                                    "x": round(sq.pos_x, 2),
                                    "y": round(sq.altitude, 2),
                                    "z": round(sq.pos_z, 2),
                                })
                            break

        # ---- Depth-charge detonation (ASW) ----
        # A charge splashes into the water, floats for ASW_FUSE_DELAY seconds,
        # then detonates (`detonate` flag set in ServerProjectile.update). The
        # blast damages EVERY alive submarine within ASW_BLAST_RADIUS — surfaced
        # or fully-submerged — and nothing else. This is the ASW payload: it
        # bypasses the fully-submerged shell immunity (see the ship loop above)
        # so submerged subs — otherwise invulnerable to shells — can be hunted.
        # One detonation can hit multiple subs. An `asw_blast` event is always
        # emitted so clients render the underwater burst even on a clean miss.
        if self.projectiles:
            blast2 = ASW_BLAST_RADIUS * ASW_BLAST_RADIUS
            for p in self.projectiles:
                if not p.detonate:
                    continue
                p.detonate = False
                events.append({
                    "type": "asw_blast",
                    "attacker": p.owner,
                    "x": round(p.x, 2),
                    "y": 0.0,
                    "z": round(p.z, 2),
                })
                # Damage every alive submarine within blast radius.
                for pid, ship in ships.items():
                    if not ship.alive or pid == p.owner:
                        continue
                    # Only submarines are ASW targets; other ships shrug the
                    # underwater blast off entirely.
                    if getattr(ship, "ship_class", None) != "submarine":
                        continue
                    # Team mode: don't depth-charge teammates.
                    if ship.team and p.owner in ships:
                        owner_ship = ships.get(p.owner)
                        if owner_ship and owner_ship.team == ship.team:
                            continue
                    dx = ship.pos_x - p.x
                    dz = ship.pos_z - p.z
                    if dx * dx + dz * dz <= blast2:
                        ship.take_damage(p.damage)
                        events.append({
                            "type": "hit",
                            "target": pid,
                            "damage": p.damage,
                            "attacker": p.owner,
                            "weapon": "depth_charge",
                            "x": round(p.x, 2),
                            "y": 0.0,
                            "z": round(p.z, 2),
                        })
                        if not ship.alive:
                            events.append({
                                "type": "entity_destroyed",
                                "target": pid,
                                "destroyed_by": p.owner,
                                "weapon": "depth_charge",
                                "x": round(p.x, 2),
                                "y": 0.0,
                                "z": round(p.z, 2),
                            })

        # Clean up dead projectiles
        self.projectiles = [p for p in self.projectiles if p.alive]
        return events

    def get_snapshots(self):
        return [p.to_snapshot() for p in self.projectiles]
