"""Server-authoritative carrier aircraft (stage 3).

A carrier player toggles to "squadron view" and flies a squadron directly.
The squadron is a single moving entity (lead + cosmetic wingmen). Movement is
authoritative: the client sends fly inputs (keys), the server integrates
position, and the snapshot carries the squadron back to all clients for visual
sync. Ordinance drops spawn torpedoes/bombs via the existing managers.

Two air groups share the squadron: torpedo bombers (鱼雷机) and dive bombers
(轰炸机), each with its own ammo pool, cooldown and salvo size — see
AIR_GROUP in game/config.py. Mirrors frontend/src/game/aircraft.js Squadron.
"""
import math
import random
from game.config import CARRIER, GRAVITY, get_air_group_config


class ServerSquadron:
    __slots__ = [
        "squad_id", "owner", "heading", "speed",
        "pos_x", "pos_z", "altitude", "alive", "level",
        # per-group: {ammo, max_ammo, cd, regen_accum}
        "torpedo", "bomber",
        # auto-pilot state
        "auto_pilot", "_auto_target", "_auto_phase", "_rearm_accum", "_orbit_dir",
        # Survivability. Depleted by AA flak; at 0 hp the squadron is destroyed.
        # Mirrors frontend aircraft.js Squadron.hp/maxHp.
        "hp", "max_hp",
    ]

    def __init__(self, squad_id, owner, x, z, level=4):
        self.squad_id = squad_id
        self.owner = owner
        self.level = level
        self.heading = 0.0
        self.speed = float(CARRIER["aircraft_speed"])
        self.pos_x = float(x)
        self.pos_z = float(z)
        self.altitude = float(CARRIER["aircraft_altitude"])
        self.alive = True
        self.hp = self.max_hp = float(CARRIER["aircraft_hp"])
        g = get_air_group_config(level)
        self.torpedo = {"ammo": g["torpedo"]["ammo"], "max_ammo": g["torpedo"]["ammo"], "cd": 0.0, "regen_accum": 0.0}
        self.bomber = {"ammo": g["bomber"]["ammo"], "max_ammo": g["bomber"]["ammo"], "cd": 0.0, "regen_accum": 0.0}
        self.auto_pilot = False
        self._auto_target = None
        self._auto_phase = "idle"
        self._rearm_accum = 0.0
        # Loiter direction around the carrier during the re-arm phase.
        self._orbit_dir = 1.0

    def take_damage(self, amount):
        """Apply AA flak damage. Returns True if this hit destroyed the squadron.

        Mirrors frontend aircraft.js Squadron.takeDamage(): a destroyed squadron
        is marked dead (it stops dropping + the mesh hides on clients).
        """
        if not self.alive or amount <= 0:
            return False
        self.hp -= amount
        if self.hp <= 0:
            self.hp = 0
            self.alive = False
            return True
        return False

    def update(self, dt, keys, carrier_pos=None, enemies=None):
        """Drive the lead aircraft from player keys (or auto-pilot).

        keys: dict with w/a/s/d. When self.auto_pilot is set, keys are ignored
        and the squadron steers itself (engage/attack/return/rearm). carrier_pos
        is the owning carrier's {x,z}; enemies is a list of ships to target.
        """
        if not self.alive:
            return

        auto_drop = None
        if self.auto_pilot:
            keys, auto_drop = self._ai_keys(dt, carrier_pos, enemies)

        # Turning — direct, no drift.
        if keys.get("a"):
            self.heading += CARRIER["aircraft_turn_rate"] * dt
        if keys.get("d"):
            self.heading -= CARRIER["aircraft_turn_rate"] * dt

        # Throttle.
        if keys.get("w"):
            self.speed += 20 * dt
        if keys.get("s"):
            self.speed -= 20 * dt
        base = CARRIER["aircraft_speed"]
        self.speed = max(base * 0.4, min(base * 1.4, self.speed))

        # Integrate on the horizontal plane.
        self.pos_x += math.sin(self.heading) * self.speed * dt
        self.pos_z += math.cos(self.heading) * self.speed * dt

        # Clamp to map.
        half = 5000.0
        self.pos_x = max(-half, min(half, self.pos_x))
        self.pos_z = max(-half, min(half, self.pos_z))

        # Tick both cooldowns.
        if self.torpedo["cd"] > 0:
            self.torpedo["cd"] = max(0.0, self.torpedo["cd"] - dt)
        if self.bomber["cd"] > 0:
            self.bomber["cd"] = max(0.0, self.bomber["cd"] - dt)

        # Re-arm only while close to the carrier (no airborne regen otherwise).
        self._rearmer(dt, carrier_pos)

        return auto_drop

    def _rearmer(self, dt, carrier_pos):
        if not carrier_pos:
            return
        dx = self.pos_x - carrier_pos["x"]
        dz = self.pos_z - carrier_pos["z"]
        if dx * dx + dz * dz > CARRIER["rearm_range"] * CARRIER["rearm_range"]:
            return
        self._rearm_accum += CARRIER["rearm_rate"] * dt
        while self._rearm_accum >= 1.0:
            self._rearm_accum -= 1.0
            if self.torpedo["ammo"] < self.torpedo["max_ammo"]:
                self.torpedo["ammo"] += 1
            elif self.bomber["ammo"] < self.bomber["max_ammo"]:
                self.bomber["ammo"] += 1
            else:
                break

    def _ai_keys(self, dt, carrier_pos, enemies):
        """Auto-pilot decision tree. Returns (keys, auto_drop).

        - Out of ammo or no target -> return to carrier & re-arm. Once home,
          the squadron commits to the FULL re-arm: it keeps circling the
          carrier until BOTH pools are topped off (the old exit let it
          sortie again after a single round came back). Mirrors frontend
          aircraft.js Squadron._autoPilotKeys.
        - Has ammo + target -> engage: turn to intercept, drop when in range.
        """
        enemies = enemies or []
        has_ammo = self.torpedo["ammo"] > 0 or self.bomber["ammo"] > 0
        range2 = CARRIER["auto_acquire_range"] ** 2

        # Refresh target.
        if self._auto_target is not None and not getattr(self._auto_target, "alive", False):
            self._auto_target = None
        if has_ammo and self._auto_target is None:
            best = None
            best_d2 = range2
            for e in enemies:
                if not getattr(e, "alive", False):
                    continue
                ex = getattr(e, "pos_x", None)
                ez = getattr(e, "pos_z", None)
                if ex is None or ez is None:
                    continue
                dx = ex - self.pos_x
                dz = ez - self.pos_z
                d2 = dx * dx + dz * dz
                if d2 < best_d2:
                    best_d2 = d2
                    best = e
            self._auto_target = best

        auto_drop = None
        goal = None
        full = (self.torpedo["ammo"] >= self.torpedo["max_ammo"]
                and self.bomber["ammo"] >= self.bomber["max_ammo"])
        homing = (not has_ammo) or self._auto_target is None
        topping = self._auto_phase in ("return", "rearm")
        if homing or (topping and not full):
            # Head home (and stay) until fully re-armed.
            if not carrier_pos:
                self._auto_phase = "idle"
                return {"w": True, "a": False, "s": False, "d": False}, None
            d2 = (self.pos_x - carrier_pos["x"]) ** 2 + (self.pos_z - carrier_pos["z"]) ** 2
            if d2 <= CARRIER["rearm_range"] ** 2:
                self._auto_phase = "rearm"
                # Loiter on a circle inside the re-arm ring — mirrors the
                # frontend's rearm orbit, so refill runs at full rate.
                return self._orbit_keys(carrier_pos), None
            self._auto_phase = "return"
            return self._steer_to(carrier_pos), None
        else:
            e = self._auto_target
            ex, ez = e.pos_x, e.pos_z
            d2 = (ex - self.pos_x) ** 2 + (ez - self.pos_z) ** 2
            self._auto_phase = "attack" if d2 <= CARRIER["auto_attack_range"] ** 2 else "engage"
            goal = {"x": ex, "z": ez}
            if d2 <= CARRIER["auto_attack_range"] ** 2:
                desired = math.atan2(ex - self.pos_x, ez - self.pos_z)
                if abs(self._heading_err(desired)) <= CARRIER["auto_aim_tolerance"]:
                    if self.torpedo["cd"] <= 0 and self.torpedo["ammo"] > 0:
                        auto_drop = "torpedo"
                    elif self.bomber["cd"] <= 0 and self.bomber["ammo"] > 0:
                        auto_drop = "bomber"

        keys = self._steer_to(goal)
        return keys, auto_drop

    def _steer_to(self, goal):
        if not goal:
            return {"w": True, "a": False, "s": False, "d": False}
        desired = math.atan2(goal["x"] - self.pos_x, goal["z"] - self.pos_z)
        err = self._heading_err(desired)
        return {"w": True, "a": err > 0.02, "d": err < -0.02, "s": False}

    def _orbit_keys(self, carrier_pos):
        """Loiter keys for the re-arm phase: hold a circular orbit around the
        carrier at ~55% of the re-arm radius. Must mirror frontend
        aircraft.js Squadron._orbitKeys."""
        radius = CARRIER["rearm_range"] * 0.55
        dx = carrier_pos["x"] - self.pos_x
        dz = carrier_pos["z"] - self.pos_z
        dist = math.sqrt(dx * dx + dz * dz) or 1.0
        tangent = math.atan2(dx, dz) + (math.pi / 2) * self._orbit_dir
        corr = max(-math.pi / 3, min(math.pi / 3, ((dist - radius) / radius) * 1.2))
        desired = tangent - self._orbit_dir * corr
        err = self._heading_err(desired)
        return {"w": True, "a": err > 0.02, "d": err < -0.02, "s": False}

    def _heading_err(self, desired):
        diff = desired - self.heading
        while diff > math.pi:
            diff -= 2 * math.pi
        while diff < -math.pi:
            diff += 2 * math.pi
        return diff

    def drop_torpedo(self):
        """Return list of (x, z, heading, tier) for a torpedo salvo, or []."""
        if not self.alive:
            return []
        g = self.torpedo
        if g["cd"] > 0 or g["ammo"] <= 0:
            return []
        cfg = get_air_group_config(self.level)["torpedo"]
        count = min(cfg["salvo"], g["ammo"])
        spread = math.radians(6) if count > 1 else 0.0
        drops = []
        for i in range(count):
            off = (-spread + (2 * spread * i) / (count - 1)) if count > 1 else 0.0
            drops.append((self.pos_x, self.pos_z, self.heading + off, CARRIER["torpedo_tier"]))
        g["ammo"] -= count
        g["cd"] = cfg["cd"]
        return drops

    def _simulate_bomb(self):
        """Integrate a released bomb's fall (same physics as projectile.py:
        gravity + multiplicative air drag) from the squadron's current state
        until it reaches the water. Returns (impact_x, impact_z, horiz_time)
        where horiz_time converts an initial horizontal velocity into its
        landing offset (drag-decayed) — dividing a desired offset by it yields
        the velocity adjustment that realises it. Mirrors frontend
        Squadron._simulateBomb().
        """
        drag = CARRIER["bomb_drag"]
        h_step = 0.02
        x, y, z = self.pos_x, self.altitude, self.pos_z
        vx = math.sin(self.heading) * self.speed
        vz = math.cos(self.heading) * self.speed
        vy = -CARRIER["bomb_drop_vy"]
        p = 1.0            # drag decay product for horizontal velocity
        horiz_time = 0.0
        for _ in range(600):
            if y <= 0:
                break
            d = 1.0 - drag * h_step
            vx *= d
            vy *= d
            vz *= d
            p *= d
            vy -= GRAVITY * h_step
            x += vx * h_step
            y += vy * h_step
            z += vz * h_step
            horiz_time += p * h_step
        return x, z, horiz_time

    def drop_bomb(self):
        """Return list of (x, y, z, vx, vy, vz, damage, weapon) for a bomb salvo.

        Bombs inherit the plane's forward ground speed plus a small downward
        kick, so they follow a ballistic arc (forward throw + gravity) instead
        of dropping straight down. The salvo is SCATTERED, not a line abreast:
        each bomb is aimed at a random point inside a uniform disc of
        CARRIER["bomb_scatter_radius"] centred on the predicted impact (the
        client's drop reticle), realised as a small initial-velocity
        adjustment. A salvo is many weak bombs (salvo total damage unchanged)
        so a single drop connects far more often. Mirrors frontend
        Squadron.dropBomb().
        """
        if not self.alive:
            return []
        g = self.bomber
        if g["cd"] > 0 or g["ammo"] <= 0:
            return []
        cfg = get_air_group_config(self.level)["bomber"]
        count = min(cfg["salvo"], g["ammo"])
        fwd = self.speed                       # inherit ground speed (m/s)
        vy0 = CARRIER["bomb_drop_vy"]          # initial downward kick (m/s)
        _, _, horiz_time = self._simulate_bomb()
        radius = CARRIER["bomb_scatter_radius"]
        vx = math.sin(self.heading) * fwd
        vz = math.cos(self.heading) * fwd
        drops = []
        for _i in range(count):
            # Uniform random point in the aiming disc -> velocity adjustment.
            ang = random.random() * math.pi * 2
            rad = radius * math.sqrt(random.random())
            drops.append((self.pos_x, self.altitude, self.pos_z,
                          vx + (math.cos(ang) * rad) / horiz_time,
                          -vy0,
                          vz + (math.sin(ang) * rad) / horiz_time,
                          cfg["dmg"], CARRIER["bomb_weapon_type"]))
        g["ammo"] -= count
        g["cd"] = cfg["cd"]
        return drops

    def refill(self):
        """Re-arm both groups (re-launch from carrier).

        Re-launching also repairs and revives a squadron that AA shot down, so
        the player can get a fresh air wing after losing one.
        """
        self.torpedo["ammo"] = self.torpedo["max_ammo"]
        self.torpedo["cd"] = 0.0
        self.bomber["ammo"] = self.bomber["max_ammo"]
        self.bomber["cd"] = 0.0
        self.hp = self.max_hp
        self.alive = True

    def set_level(self, level):
        self.level = level
        g = get_air_group_config(level)
        self.torpedo["max_ammo"] = g["torpedo"]["ammo"]
        self.bomber["max_ammo"] = g["bomber"]["ammo"]
        self.torpedo["ammo"] = min(self.torpedo["ammo"], self.torpedo["max_ammo"])
        self.bomber["ammo"] = min(self.bomber["ammo"], self.bomber["max_ammo"])


class AircraftManager:
    """Owns all squadrons in a room. Updated each server tick."""

    def __init__(self):
        self.squadrons = []
        self._next_id = 0

    def spawn(self, owner, x, z, level=4):
        sq = ServerSquadron(self._next_id, owner, x, z, level=level)
        self._next_id += 1
        self.squadrons.append(sq)
        return sq

    def get_by_owner(self, owner):
        for sq in self.squadrons:
            if sq.owner == owner:
                return sq
        return None

    def update(self, dt, fly_inputs, carriers=None, enemies=None):
        """Advance each squadron.

        fly_inputs: {owner_id: keys_dict} (player WASD while flying manually).
        carriers: {owner_id: ship} so auto-pilot/re-arm know where home is.
        enemies: list of ships the auto-pilot can target.
        Returns a list of (owner_id, drop_kind) auto-pilot drops the game should
        execute this tick (server-authoritative release).
        """
        carriers = carriers or {}
        auto_drops = []
        for sq in self.squadrons:
            if not sq.alive:
                continue
            keys = fly_inputs.get(sq.owner, {})
            carrier_pos = None
            owner_ship = carriers.get(sq.owner)
            if owner_ship is not None:
                carrier_pos = {"x": owner_ship.pos_x, "z": owner_ship.pos_z}
            auto_drop = sq.update(dt, keys, carrier_pos=carrier_pos, enemies=enemies)
            if auto_drop:
                auto_drops.append((sq.owner, auto_drop))
        return auto_drops

    def get_snapshots(self):
        snaps = []
        for sq in self.squadrons:
            if not sq.alive:
                continue
            snaps.append({
                "id": sq.squad_id,
                "owner": sq.owner,
                "x": round(sq.pos_x, 2),
                "z": round(sq.pos_z, 2),
                "h": round(sq.heading, 4),
                "spd": round(sq.speed, 2),
                "alt": round(sq.altitude, 1),
                "tord": sq.torpedo["ammo"],
                "bomd": sq.bomber["ammo"],
                "torcd": round(sq.torpedo["cd"], 2),
                "bomcd": round(sq.bomber["cd"], 2),
                "ap": int(sq.auto_pilot),
                "phase": sq._auto_phase,
                "alive": sq.alive,
                # Squadron HP (depleted by AA flak). Clients render a health bar
                # over the squadron from this.
                "hp": round(sq.hp, 1),
                "mhp": sq.max_hp,
            })
        return snaps
