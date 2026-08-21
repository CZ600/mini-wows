import math
import random
from collections import deque
from game.config import (
    DT, SNAPSHOT_HISTORY_SIZE, GRAVITY, PROJECTILE_INITIAL_SPEED,
    ENEMY_DETECT_RANGE, ENEMY_FIRE_SPEED, ENEMY_FIRE_COOLDOWN,
    RAMMING_DAMAGE, get_ship_config, get_muzzle_speed, get_cannon_drag,
    CARRIER,
    AA_DRAG, get_aa_tier, get_class_aa,
    ASW_MUZZLE_SPEED, ASW_DRAG, ASW_AIR, get_asw_tier, get_class_asw,
    SECONDARY,
)
from game.ship import ServerShip
from game.terrain import Terrain
from game.projectile import ProjectileManager, apply_cannon_spread, compensate_drag_pitch
from game.torpedo import TorpedoManager
from game.enemy import EnemyManager
from game.aircraft import AircraftManager


class GameState:
    def __init__(self, terrain: Terrain, mode="ffa", respawn_limit=0):
        self.terrain = terrain
        self.mode = mode
        self.ships = {}
        self.tick = 0
        self.events = []
        self.snapshot_history = deque(maxlen=SNAPSHOT_HISTORY_SIZE)
        self.projectile_mgr = ProjectileManager()
        self.torpedo_mgr = TorpedoManager()
        self.enemies = []
        self._next_enemy_id = 0
        self.enemy_mgr = EnemyManager()
        self.aircraft_mgr = AircraftManager()
        # Pending fly inputs per carrier owner: {player_id: keys_dict}. Cleared
        # each tick after the aircraft manager consumes them.
        self._fly_inputs = {}
        # Carriers currently in squadron view: {player_id: True}. Drives which
        # ships ignore WASD (autopilot) vs which aircraft receive them.
        self._in_squadron_view = {}
        # Currently-armed air group per carrier: {player_id: 'torpedo'|'bomber'}.
        # Set by launch_squadron / defaulted on toggle_view; read for snapshot.
        self._active_group = {}
        self.wave = 0
        self.level = 1
        self._spawn_index = 0
        self.respawn_limit = respawn_limit
        self._respawn_remaining = {}  # player_id -> remaining respawns
        self._initial_spawns = {}     # player_id -> (x, z)
        # Per-mount AA cooldowns: {player_id: [cd_per_mount, ...]}. Lazily sized
        # to a ship's mount count in _fire_aa_defenses so a level/class change
        # (which can change mount count) is handled automatically.
        self._aa_cooldowns = {}
        # Per-ship ASW release cooldown: {player_id: cd_seconds}. One depth-
        # charge salvo per cooldown window.
        self._asw_cooldowns = {}
        # In-flight battleship ASW strike planes. Each entry simulates a plane
        # cruising from the ship to the marked target rectangle, scattering
        # fused depth charges across it, then flying off and despawning.
        self._asw_planes = []
        self._next_asw_plane_id = 0

    def add_ship(self, player_id, username, level=1, ship_class=None, team=None):
        ship = ServerShip(player_id, username, level, ship_class, team)
        self._assign_spawn(ship, team)
        self.ships[player_id] = ship
        self._initial_spawns[player_id] = (ship.pos_x, ship.pos_z)
        self._respawn_remaining[player_id] = self.respawn_limit
        self._spawn_index += 1
        return ship

    def _assign_spawn(self, ship, team):
        """Assign spawn position based on game mode."""
        mode = self.mode
        idx = self._spawn_index

        if mode == "team":
            self._spawn_team(ship, team, idx)
        elif mode in ("pve", "solo"):
            self._spawn_pve(ship, idx)
        else:
            self._spawn_ffa(ship, idx)

    def _spawn_ffa(self, ship, idx):
        """FFA: players spread 400-1000m apart around a circle."""
        # Radius 550, 8 sectors → min angular sep 45° → min distance ≈ 421m
        sector_count = 8
        sector_angle = 2 * math.pi / sector_count
        angle = idx * sector_angle
        dist = 550
        x = math.cos(angle) * dist
        z = math.sin(angle) * dist
        x, z = self._find_water(x, z, ship.ship_length, ship.ship_width)
        ship.pos_x = x
        ship.pos_z = z

    def _spawn_team(self, ship, team, idx):
        """Team: two groups ~500m apart, teammates within 300m."""
        if team == "red":
            base_x, base_z = -250.0, 0.0
        else:
            base_x, base_z = 250.0, 0.0

        # Offset teammates slightly
        teammates_so_far = sum(
            1 for s in self.ships.values() if s.team == team
        )
        angle = teammates_so_far * math.pi * 2 / 3
        offset_dist = min(teammates_so_far * 100, 250)
        x = base_x + math.cos(angle) * offset_dist
        z = base_z + math.sin(angle) * offset_dist
        x, z = self._find_water(x, z, ship.ship_length, ship.ship_width)
        ship.pos_x = x
        ship.pos_z = z

    def _spawn_pve(self, ship, idx):
        """PvE: humans in a line, 300m spacing."""
        x = (idx - 1.5) * 300
        z = 0.0
        x, z = self._find_water(x, z, ship.ship_length, ship.ship_width)
        ship.pos_x = x
        ship.pos_z = z

    def _is_safe_for_ship(self, x, z, ship_length, ship_width):
        """Return True if the ship's bounding box is all water at (x, z).

        Uses the max of half_length / half_width as a square buffer so the
        check is correct regardless of the ship's heading at spawn.
        """
        if not self.terrain:
            return True
        buffer = max(ship_length, ship_width) / 2
        corners = [
            (x + buffer, z + buffer),
            (x + buffer, z - buffer),
            (x - buffer, z + buffer),
            (x - buffer, z - buffer),
        ]
        return all(not self.terrain.is_land(cx, cz) for cx, cz in corners)

    def _find_water(self, start_x, start_z, ship_length=1.0, ship_width=1.0):
        """Find a water position whose ship bounding box (4 corners) is clear.

        Previous implementation only checked the center point; ships spawned
        with center in water but a corner on land would die on the first
        ServerShip.update() call, eventually exhausting respawns and ending
        the match instantly.
        """
        if self._is_safe_for_ship(start_x, start_z, ship_length, ship_width):
            return start_x, start_z
        for r in range(50, 4001, 50):
            for a_idx in range(24):
                angle = a_idx * math.pi / 12
                x = start_x + math.cos(angle) * r
                z = start_z + math.sin(angle) * r
                if self._is_safe_for_ship(x, z, ship_length, ship_width):
                    return x, z
        return start_x, start_z

    def remove_ship(self, player_id):
        self.ships.pop(player_id, None)

    def _process_respawns(self):
        """Check for dead ships and respawn those with remaining lives."""
        for pid, ship in self.ships.items():
            if ship.alive:
                continue
            remaining = self._respawn_remaining.get(pid, 0)
            if remaining <= 0:
                continue

            spawn_x, spawn_z = self._initial_spawns.get(pid, (0, 0))
            ship.alive = True
            ship.hp = ship.max_hp
            ship.pos_x = spawn_x
            ship.pos_z = spawn_z
            ship.speed = 0
            ship.velocity_heading = 0
            for i in range(len(ship.turret_cooldowns)):
                ship.turret_cooldowns[i] = 0
            ship.skills.reset()
            self._respawn_remaining[pid] = remaining - 1
            self.events.append({
                "type": "player_respawned",
                "target": pid,
                "remaining": remaining - 1,
            })

    def process_input(self, player_id, msg):
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return
        keys = msg.get("k", {})
        # A carrier in squadron view autopilots — its WASD flies the aircraft.
        if self._in_squadron_view.get(player_id, False):
            keys = {}
        ship.update(DT, keys, self.terrain)

    def _get_turret_offsets(self, ship):
        """Return list of (dx, dz, y_step) offsets for each turret relative to
        ship center. y_step is the superfiring height raise. Mirrors the client's
        buildTurretDefs() so muzzle origins line up."""
        cfg = get_ship_config(ship.level, ship.ship_class)
        n_front = cfg["front_turrets"]
        n_back = cfg["back_turrets"]
        has_bridge = cfg.get("has_bridge", False)
        barrels = cfg.get("barrels", 1)
        length = ship.ship_length
        turret_size = (0.8 + ship.ship_width * 0.10) * cfg.get("turret_mul", 1.0)
        # Spacing tracks the widened multi-barrel housing so turrets pack tightly.
        housing_width = turret_size * (1 + (barrels - 1) * 0.45)
        spacing = max(1.2, housing_width * 1.4)
        step_h = turret_size * 0.55

        front_center = length * 0.2
        back_center = -length * 0.2

        if has_bridge:
            bridge_z = 0.0
            bridge_half = length * 0.14
            front_gap = housing_width * 0.35
            back_gap = housing_width * 0.55
            if n_front > 0:
                front_edge = bridge_z + bridge_half
                closest_offset = (n_front - 1) / 2 * spacing
                front_center = max(front_center, front_edge + front_gap + closest_offset)
            if n_back > 0:
                back_edge = bridge_z - bridge_half
                closest_offset = (n_back - 1) / 2 * spacing
                back_center = min(back_center, back_edge - back_gap - closest_offset)

        offsets = []
        for i in range(n_front):
            # Front group fires forward: turret nearest the bridge (lowest i,
            # furthest aft in the group) sits highest to fire over the ones ahead.
            offset = (i - (n_front - 1) / 2) * spacing
            offsets.append((0, front_center + offset, (n_front - 1 - i) * step_h))
        for i in range(n_back):
            # Rear group fires aft: turret nearest the bridge (highest i, furthest
            # forward in the group) sits highest to fire over the ones behind.
            offset = (i - (n_back - 1) / 2) * spacing
            offsets.append((0, back_center + offset, i * step_h))

        return offsets

    def _turret_world_pos(self, ship, local_dx, local_dz):
        """Convert turret local offset to world position based on ship heading."""
        cos_h = math.cos(ship.heading)
        sin_h = math.sin(ship.heading)
        wx = ship.pos_x + sin_h * local_dz + cos_h * local_dx
        wz = ship.pos_z + cos_h * local_dz - sin_h * local_dx
        return wx, wz

    YAW_RANGE_FULL = math.pi
    # Bridge ships (Lv4+) keep a slightly narrower arc than the full 360° of
    # early-game ships — the island blocks dead-ast/fire arcs. Widened from 2.2
    # to 2.6 (≈149°/side) so front and rear groups overlap at the beam and
    # oblique quarters (e.g. ±150°) can still bring a turret group to bear.
    YAW_RANGE_BRIDGE = 2.6

    def _get_turret_yaw_caps(self, ship):
        """Return list of (yaw_center, yaw_range) per turret, mirroring client buildTurretDefs."""
        cfg = get_ship_config(ship.level, ship.ship_class)
        n_front = cfg["front_turrets"]
        n_back = cfg["back_turrets"]
        has_bridge = cfg.get("has_bridge", False)
        yaw_range = self.YAW_RANGE_BRIDGE if has_bridge else self.YAW_RANGE_FULL
        caps = []
        for _ in range(n_front):
            caps.append((0.0, yaw_range))
        for _ in range(n_back):
            caps.append((math.pi, yaw_range))
        return caps

    @staticmethod
    def _turret_can_aim(yaw_center, yaw_range, local_aim_yaw):
        """Mirrors client turretCanAim: check if aim yaw is within turret's arc."""
        diff = (local_aim_yaw - yaw_center + math.pi) % (2 * math.pi) - math.pi
        return abs(diff) <= yaw_range + 0.05

    # ---- Secondary battery / AA mount layouts (mirror ship_model.js) ----
    # The server doesn't simulate turret meshes; it needs the same station
    # math the client uses to build them, so shells leave from the visible
    # mounts. Plane-view hull options mirror frontend hullOptsFor().
    _HULL_OPTS = {
        "battleship": {"bow_start": 0.66, "bow_pow": 1.6, "transom": 0.2, "stern_start": 0.32, "stern_pow": 1.5},
        "cruiser":    {"bow_start": 0.6,  "bow_pow": 1.6, "transom": 0.32, "stern_pow": 1.1},
        "destroyer":  {"bow_start": 0.58, "bow_pow": 1.75, "transom": 0.5, "stern_pow": 1.3},
        "carrier":    {"bow_start": 0.75, "bow_pow": 1.6, "transom": 0.75, "stern_pow": 1.3},
    }

    @classmethod
    def _hull_half_beam(cls, ship_class, t):
        """Mirror ship_model.js hullHalfBeamFraction: plane-view half-beam at
        station t (0=stern, 1=bow) as a fraction of max half-beam."""
        o = cls._HULL_OPTS.get(ship_class)
        if not o:
            return 1.0
        bow_start = o["bow_start"]
        stern_start = o.get("stern_start", 1 - bow_start)
        if t >= bow_start:
            u = (t - bow_start) / (1 - bow_start)
            return max(0.02, 1 - u ** o["bow_pow"])
        if t <= stern_start:
            u = t / stern_start
            return o["transom"] + (1 - o["transom"]) * (1 - (1 - u) ** o["stern_pow"])
        return 1.0

    @classmethod
    def _beam_rail_x(cls, ship, z, keep_out):
        """Safe lateral rail position (mirror ship_model.js beamRailX): inset
        from the local hull half-beam so mounts never hang off a narrow bow/
        stern section."""
        length = ship.ship_length
        width = ship.ship_width
        t = max(0.0, min(1.0, (z + length / 2) / length))
        local_half = cls._hull_half_beam(ship.ship_class, t) * width / 2
        return min(width * 0.36, local_half - keep_out)

    @staticmethod
    def _fore_aft_stations(n, bridge_edge, max_z):
        """Mirror ship_model.js foreAftStations: spread n stations evenly over
        the aft + fore usable deck segments (skipping the bridge)."""
        out = []
        total = 2 * (max_z - bridge_edge)
        for i in range(n):
            s = 0.5 if n == 1 else i / (n - 1)
            u = s * total
            out.append(-max_z + u if u <= max_z - bridge_edge else bridge_edge + (u - (max_z - bridge_edge)))
        return out

    SECONDARY_YAW_RANGE = 2.1

    def _get_secondary_layout(self, ship):
        """Mirror ship_model.js buildSecondaryMounts: beam side turrets fore and
        aft of the bridge. Returns [(dx, dz, yaw_center, yaw_range)] per mount."""
        cfg = get_ship_config(ship.level, ship.ship_class)
        fit = cfg.get("secondary")
        if not fit:
            return []
        barrels = fit.get("barrels", 2)
        turret_size = (0.8 + ship.ship_width * 0.10) * cfg.get("turret_mul", 1.0)
        size = turret_size * 0.55
        housing_width = size * (1 + (barrels - 1) * 0.38)
        sweep = math.sqrt((housing_width / 2) ** 2 + (size * 1.7 / 2) ** 2)
        bl_frac = 0.30 if ship.ship_class == "battleship" else 0.22
        bridge_edge = ship.ship_length * bl_frac / 2 + sweep + 0.15
        max_z = ship.ship_length * 0.37
        per_side = math.ceil(fit["mounts"] / 2)

        layout = []
        for side in (1, -1):
            for z in self._fore_aft_stations(per_side, bridge_edge, max_z):
                rail_x = self._beam_rail_x(ship, z, sweep * 0.8)
                if rail_x < sweep * 0.5:
                    continue
                layout.append((side * rail_x, z, side * math.pi / 2, self.SECONDARY_YAW_RANGE))
        return layout

    def _get_aa_layout(self, ship):
        """Mirror ship_model.js buildAaMounts: stern battery (battleship/
        cruiser — the beams carry secondaries) or the classic beam spread
        (destroyer/carrier). Returns [(dx, dz)] per mount."""
        aa = get_class_aa(ship.ship_class)
        if not aa:
            return []
        cfg = get_ship_config(ship.level, ship.ship_class)
        turret_size = (0.8 + ship.ship_width * 0.10) * cfg.get("turret_mul", 1.0)
        size = max(0.35, turret_size * 0.34)
        sweep = size * 1.15
        half_l = ship.ship_length / 2
        stern_battery = ship.ship_class in ("battleship", "cruiser")

        layout = []
        n = aa["mounts"]
        for i in range(n):
            t = 0.5 if n == 1 else i / (n - 1)
            if stern_battery:
                bl_frac = 0.30 if ship.ship_class == "battleship" else 0.22
                bridge_edge = ship.ship_length * bl_frac / 2 + size + 0.15
                z = -bridge_edge + (bridge_edge - half_l * 0.90) * t
            else:
                z = half_l * 0.62 - t * half_l * 1.05
            side = 1 if i % 2 == 0 else -1
            rail_x = self._beam_rail_x(ship, z, sweep * 0.8)
            if rail_x < sweep * 0.5:
                continue
            layout.append((side * rail_x, z))
        return layout

    def _process_secondary_fire(self, player_id, msg):
        """Server-authoritative secondary battery salvo (mode='secondary' in
        the fire message). Mirrors process_fire but for the beam side turrets:
        per-mount cooldowns, per-barrel muzzles, own ballistics."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return
        layout = self._get_secondary_layout(ship)
        if not layout or not ship.secondary_cooldowns:
            return

        aim = msg.get("aim", {})
        aim_x = aim.get("x", ship.pos_x)
        aim_y = aim.get("y", 2)
        aim_z = aim.get("z", ship.pos_z)

        ship_dx = aim_x - ship.pos_x
        ship_dz = aim_z - ship.pos_z
        if math.sqrt(ship_dx * ship_dx + ship_dz * ship_dz) < 1:
            local_aim_yaw = 0.0
        else:
            local_aim_yaw = math.atan2(ship_dx, ship_dz) - ship.heading

        ready = [
            i for i in range(len(layout))
            if i < len(ship.secondary_cooldowns)
            and ship.secondary_cooldowns[i] <= 0
            and self._turret_can_aim(layout[i][2], layout[i][3], local_aim_yaw)
        ]
        if not ready:
            return

        cfg = get_ship_config(ship.level, ship.ship_class)
        barrels = cfg.get("secondary", {}).get("barrels", 2)
        turret_size = (0.8 + ship.ship_width * 0.10) * cfg.get("turret_mul", 1.0)
        barrel_gap = turret_size * 0.55 * 0.55
        spread_mult = 0.7 if ship.skills.is_active("precision") else 1.0
        muzzle_speed = SECONDARY["muzzle_speed"]
        cannon_drag = SECONDARY["drag"]

        for i in ready:
            ldx, ldz, _, _ = layout[i]
            for b in range(barrels):
                barrel_ldx = ldx + (b - (barrels - 1) / 2) * barrel_gap
                ox, oz = self._turret_world_pos(ship, barrel_ldx, ldz)
                direction = self._ballistic_direction(
                    ox, 3.0, oz, aim_x, aim_y, aim_z,
                    muzzle_speed=muzzle_speed,
                )
                barrel_dist = math.sqrt((aim_x - ox) ** 2 + (aim_z - oz) ** 2)
                spread_dir = apply_cannon_spread(
                    direction, barrel_dist, ship.ship_class,
                    spread_mult=spread_mult,
                )
                self.projectile_mgr.fire(
                    player_id, SECONDARY["damage"],
                    (ox, 3.0, oz),
                    spread_dir,
                    muzzle_speed=muzzle_speed,
                    drag=cannon_drag,
                    weapon="secondary",
                )
            cd = SECONDARY["cooldown"]
            if ship.skills.is_active("rapid_fire"):
                cd *= 0.7
            ship.secondary_cooldowns[i] = cd

    @staticmethod
    def _ballistic_direction(origin_x, origin_y, origin_z, aim_x, aim_y, aim_z, muzzle_speed=PROJECTILE_INITIAL_SPEED):
        """Compute a launch direction (unit vector) from a muzzle origin toward
        a world aim point, using the same low-angle solution as the client.

        Each turret fires along its own line to the aim point instead of every
        turret sharing one ship-centred direction, so a salvo converges on the
        target rather than flying in parallel. Returns (dir_x, dir_y, dir_z).
        """
        dx = aim_x - origin_x
        dz = aim_z - origin_z
        dy = aim_y - origin_y
        horiz_dist = math.sqrt(dx * dx + dz * dz)

        if horiz_dist < 1:
            pitch = math.pi / 4
            yaw = 0.0
        else:
            v2 = muzzle_speed ** 2
            v4 = v2 * v2
            disc = v4 - GRAVITY * (GRAVITY * horiz_dist * horiz_dist + 2 * dy * v2)
            if disc < 0:
                pitch = math.pi / 4
            else:
                pitch = math.atan((v2 - math.sqrt(disc)) / (GRAVITY * horiz_dist))
            pitch = max(0, min(math.radians(60), pitch))
            yaw = math.atan2(dx, dz)

        pitch = compensate_drag_pitch(pitch, horiz_dist, muzzle_speed)
        return (
            math.sin(yaw) * math.cos(pitch),
            math.sin(pitch),
            math.cos(yaw) * math.cos(pitch),
        )

    def process_fire(self, player_id, msg):
        """Server-authoritative fire: client sends aim target, server creates projectile."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return

        # Secondary battery salvo: separate layout, cooldowns and ballistics.
        if msg.get("mode") == "secondary":
            return self._process_secondary_fire(player_id, msg)

        # Check turret cooldowns
        ready_turrets = [
            i for i in range(len(ship.turret_cooldowns))
            if ship.turret_cooldowns[i] <= 0
        ]
        if not ready_turrets:
            return

        aim = msg.get("aim", {})
        aim_x = aim.get("x", ship.pos_x)
        aim_y = aim.get("y", 2)
        aim_z = aim.get("z", ship.pos_z)

        origin_y = 3.0  # turret height

        # Aim arc check still uses the ship-centred yaw: the front/rear group
        # split (yawCenter 0 vs π) is a hull-layout property, not a per-turret
        # geometric one, so we keep it independent of each turret's small lateral
        # offset. Only the *launch direction* below is computed per turret, so a
        # salvo converges on the aim point instead of every shell flying parallel.
        ship_dx = aim_x - ship.pos_x
        ship_dz = aim_z - ship.pos_z
        if math.sqrt(ship_dx * ship_dx + ship_dz * ship_dz) < 1:
            local_aim_yaw = 0.0
        else:
            local_aim_yaw = math.atan2(ship_dx, ship_dz) - ship.heading

        turret_caps = self._get_turret_yaw_caps(ship)
        fireable = [
            i for i in ready_turrets
            if i < len(turret_caps)
            and self._turret_can_aim(turret_caps[i][0], turret_caps[i][1], local_aim_yaw)
        ]
        if not fireable:
            return

        turret_offsets = self._get_turret_offsets(ship)
        cfg = get_ship_config(ship.level, ship.ship_class)
        barrels = cfg.get("barrels", 1)
        # Lateral spacing between barrels within a turret (mirrors the client's
        # barrelGap = turretSize * 0.35), used to give each barrel its own muzzle.
        turret_size = (0.8 + ship.ship_width * 0.10) * cfg.get("turret_mul", 1.0)
        barrel_gap = turret_size * 0.35
        spread_mult = 0.7 if ship.skills.is_active("precision") else 1.0

        # Per-class ballistic params: muzzle speed + drag govern the shell's
        # range. Fetched once per salvo and reused for every turret/barrel so
        # the whole salvo shares one trajectory model.
        muzzle_speed = get_muzzle_speed(ship.ship_class)
        cannon_drag = get_cannon_drag(ship.ship_class)

        for i in fireable:
            if i < len(turret_offsets):
                ldx, ldz, y_step = turret_offsets[i]
            else:
                ldx, ldz, y_step = 0.0, 0.0, 0.0
            muzzle_y = origin_y + y_step
            # Multi-barrel turrets fire one projectile per barrel. Each barrel
            # fires from its own muzzle (lateral offset on the turret's local x),
            # and each projectile gets its own spread so a double/triple turret
            # scatters like a salvo rather than a single shot.
            for b in range(barrels):
                barrel_ldx = ldx + (b - (barrels - 1) / 2) * barrel_gap
                ox, oz = self._turret_world_pos(ship, barrel_ldx, ldz)
                # Per-turret (per-barrel) direction: each muzzle aims at the
                # target along its own line, so a fore/aft salvo converges.
                direction = self._ballistic_direction(
                    ox, muzzle_y, oz, aim_x, aim_y, aim_z,
                    muzzle_speed=muzzle_speed,
                )
                # Spread sigma scales with this barrel's range to the aim point.
                barrel_dist = math.sqrt((aim_x - ox) ** 2 + (aim_z - oz) ** 2)
                spread_dir = apply_cannon_spread(
                    direction, barrel_dist, ship.ship_class,
                    spread_mult=spread_mult,
                )
                self.projectile_mgr.fire(
                    player_id, ship.damage,
                    (ox, muzzle_y, oz),
                    spread_dir,
                    muzzle_speed=muzzle_speed,
                    drag=cannon_drag,
                )
            cd = ship.fire_cooldown
            if ship.skills.is_active("rapid_fire"):
                cd *= 0.7
            ship.turret_cooldowns[i] = cd

    def process_torpedo(self, player_id, msg):
        """Server-authoritative torpedo fire."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return

        tier = msg.get("tier", 1)
        heading = msg.get("h", ship.heading)
        spread_val = msg.get("sp", 0)
        spread = "wide" if spread_val == 1 else "narrow"

        from game.config import get_torpedo_stats, get_ship_config
        cfg = get_ship_config(ship.level, ship.ship_class)
        tube_count = cfg.get("torpedo_tubes", 0) if ship.level >= 4 else 0
        if tube_count <= 0:
            return

        # Check torpedo tier availability
        available_tiers = cfg.get("torpedo_tiers", [])
        if tier not in available_tiers:
            return

        self.torpedo_mgr.fire(
            player_id, tier, ship.level,
            ship.pos_x, ship.pos_z,
            heading, count=tube_count, spread=spread,
        )

    def process_skill(self, player_id, msg):
        """Server-authoritative skill activation."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return
        name = msg.get("skill")
        if not ship.skills.can_activate(name):
            return
        ship.skills.activate(name, ship)

    def process_dive(self, player_id, msg):
        """Server-authoritative submarine dive toggle."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return
        ship.toggle_dive()

    def process_fly_input(self, player_id, msg):
        """Carrier squadron flight keys (held each tick)."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        self._fly_inputs[player_id] = {
            "w": bool(msg.get("w")),
            "a": bool(msg.get("a")),
            "s": bool(msg.get("s")),
            "d": bool(msg.get("d")),
        }

    def process_toggle_view(self, player_id, msg):
        """Carrier ship<->squadron view toggle. Spawns the squadron on entry."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        in_view = self._in_squadron_view.get(player_id, False)
        if in_view:
            # Returning to ship view; keep the squadron alive for re-launch.
            self._in_squadron_view[player_id] = False
        else:
            self._enter_squadron_view(player_id)

    def process_launch_squadron(self, player_id, msg):
        """Carrier air-group launch / switch (keys 5/6).

        While steering the ship this launches the squadron (entering squadron
        view) and arms the requested group; while already flying it just switches
        the active group. The group is stored per-player so process_drop knows
        which air group to release; the client mirrors this via the snapshot.
        """
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        group = msg.get("group", "torpedo")
        if group not in ("torpedo", "bomber"):
            group = "torpedo"
        in_view = self._in_squadron_view.get(player_id, False)
        if not in_view:
            self._enter_squadron_view(player_id)
        self._active_group[player_id] = group

    def process_toggle_autopilot(self, player_id, msg):
        """Toggle carrier squadron auto-pilot (auto-attack)."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        if not self.aircraft_mgr.get_by_owner(player_id):
            self._enter_squadron_view(player_id)
        sq = self.aircraft_mgr.get_by_owner(player_id)
        if sq is not None:
            sq.auto_pilot = not getattr(sq, "auto_pilot", False)
            sq._auto_target = None

    def _enter_squadron_view(self, player_id):
        """Enter squadron view: spawn if none, else re-launch (reposition+refill)."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        sq = self.aircraft_mgr.get_by_owner(player_id)
        if not sq:
            self.aircraft_mgr.spawn(player_id, ship.pos_x, ship.pos_z, level=ship.level)
        else:
            # Reposition an existing squadron to the carrier (re-launch) and
            # fully re-arm both groups.
            sq.pos_x = ship.pos_x
            sq.pos_z = ship.pos_z
            sq.heading = ship.heading
            sq.alive = True
            sq.set_level(ship.level)
            sq.refill()
        self._in_squadron_view[player_id] = True
        # Default the active group to torpedo bombers if unset (T-key launch).
        self._active_group.setdefault(player_id, "torpedo")

    def process_drop(self, player_id, msg):
        """Carrier ordinance drop (torpedo or bomb salvo).

        `kind` selects the air group ('torpedo' = torpedo bombers, 'bomb' =
        dive bombers). Each release spawns the whole salvo (1..N torpedoes or
        bombs depending on carrier level) and starts that group's cooldown.
        The squadron's drop methods are authoritative for ammo/cooldown gating.
        """
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or ship.ship_class != "carrier":
            return
        if not self._in_squadron_view.get(player_id, False):
            return
        sq = self.aircraft_mgr.get_by_owner(player_id)
        if sq is None:
            return
        kind = msg.get("kind", "torpedo")
        if kind == "bomb":
            drops = sq.drop_bomb()
            for (x, y, z, vx, vy, vz, damage, weapon) in drops:
                # Bombs carry an absolute velocity (forward throw + downward
                # kick); convert to a unit direction + speed for the projectile
                # manager so the ballistic arc reproduces.
                speed = math.sqrt(vx * vx + vy * vy + vz * vz) or 1.0
                self.projectile_mgr.fire(
                    player_id, damage, (x, y, z), (vx / speed, vy / speed, vz / speed),
                    muzzle_speed=speed, drag=CARRIER["bomb_drag"],
                    weapon=weapon,
                )
        else:
            drops = sq.drop_torpedo()
            for (x, z, heading, tier) in drops:
                # Aircraft torpedoes hit harder than hull-launched ones of the
                # same tier (mirrors frontend CARRIER.airTorpedoDamageMul).
                self.torpedo_mgr.fire(
                    player_id, tier, ship.level, x, z, heading,
                    count=1, spread="narrow",
                    damage_mul=CARRIER["air_torpedo_damage_mul"],
                )

    def process_asw_fire(self, player_id, msg):
        """Server-authoritative ASW (depth-charge) release.

        Destroyers/cruisers make a CLOSE-RANGE hull drop: the aim point
        (`msg["aim"]={x,z}`, a last-known sub position) is clamped into the
        [min, range] band around the hull, and a salvo of charges arcs out
        there. Charges splash, float for ASW_FUSE_DELAY seconds, then detonate
        with a large AoE that only damages submarines (projectile.py).

        Battleships call an air strike instead: the aim point (clamped to the
        air range) becomes the centre of a target rectangle; _update_asw_planes
        flies a plane out from over the ship and scatters the salvo across it.
        Only ships with an ASW fit (get_class_asw) may release; submerged subs
        can't fire (their launchers are underwater).
        """
        ship = self.ships.get(player_id)
        if not ship or not ship.alive or not ship.ship_class:
            return
        asw = get_class_asw(ship.ship_class)
        if not asw:
            return
        if getattr(ship, "fully_submerged", False):
            return
        tier_cfg = get_asw_tier(asw["tier"])
        if not tier_cfg:
            return

        # Gating: per-ship ASW cooldown (one release per cooldown window).
        now_cd = self._asw_cooldowns.get(player_id, 0.0)
        if now_cd > 0:
            return

        aim = msg.get("aim", {})
        aim_x = float(aim.get("x", ship.pos_x))
        aim_z = float(aim.get("z", ship.pos_z))

        dx = aim_x - ship.pos_x
        dz = aim_z - ship.pos_z
        dist = math.sqrt(dx * dx + dz * dz)

        if asw.get("air"):
            # ---- Battleship air strike: clamp the target-rectangle centre to
            # the air range and launch a strike plane from over the ship.
            if dist > asw["range"] and dist > 0:
                scale = asw["range"] / dist
                aim_x = ship.pos_x + dx * scale
                aim_z = ship.pos_z + dz * scale
            self._asw_planes.append({
                "id": self._next_asw_plane_id,
                "owner": player_id,
                "x": ship.pos_x,
                "z": ship.pos_z,
                "heading": math.atan2(aim_x - ship.pos_x, aim_z - ship.pos_z),
                "target_x": aim_x,
                "target_z": aim_z,
                "damage": tier_cfg["damage"],
                "drops_left": tier_cfg["salvo"],
                "drop_timer": 0.0,
                "leave_timer": ASW_AIR["leave"],
                "state": "cruise",   # cruise -> drop -> leave
            })
            self._next_asw_plane_id += 1
            self._asw_cooldowns[player_id] = tier_cfg["cooldown"]
            return

        # ---- Surface hull drop: clamp the aim point into the [min, range]
        # close-drop band around the hull.
        min_range = asw.get("min", 0.0)
        max_range = asw["range"]
        if dist > max_range:
            scale = max_range / dist if dist > 0 else 0.0
            aim_x = ship.pos_x + dx * scale
            aim_z = ship.pos_z + dz * scale
        elif dist < min_range:
            # Push the drop point out to the near edge of the band along the
            # same bearing (never drop onto own decks).
            if dist > 0:
                aim_x = ship.pos_x + dx / dist * min_range
                aim_z = ship.pos_z + dz / dist * min_range
            else:
                aim_x = ship.pos_x
                aim_z = ship.pos_z + min_range

        # Fire a salvo of depth charges spread around the clamped aim point.
        # Each charge flies a short ballistic arc toward its sub-point, splashes
        # and starts its fuse (see projectile.py).
        origin_y = 3.0
        salvo = tier_cfg["salvo"]
        spread = tier_cfg["spread"]
        for i in range(salvo):
            # Spread sub-points in a small disc around the aim point.
            if salvo > 1:
                ang = (i / salvo) * 2 * math.pi
                rad = spread * (0.4 + 0.6 * ((i * 7) % 5) / 4.0)
            else:
                ang = 0.0
                rad = 0.0
            tx = aim_x + math.cos(ang) * rad
            tz = aim_z + math.sin(ang) * rad
            # Direction from the ship's deck toward this sub-point, pitched up
            # enough for a short arc (the low ASW muzzle speed keeps it short).
            sdx = tx - ship.pos_x
            sdz = tz - ship.pos_z
            horiz = math.sqrt(sdx * sdx + sdz * sdz)
            if horiz < 1:
                pitch = math.pi / 4
                yaw = 0.0
            else:
                v2 = ASW_MUZZLE_SPEED ** 2
                v4 = v2 * v2
                disc = v4 - GRAVITY * (GRAVITY * horiz * horiz + 2 * (0.0 - origin_y) * v2)
                pitch = math.pi / 6 if disc < 0 else math.atan(
                    (v2 - math.sqrt(disc)) / (GRAVITY * horiz))
                pitch = max(0, min(math.radians(60), pitch))
                yaw = math.atan2(sdx, sdz)
            direction = (
                math.sin(yaw) * math.cos(pitch),
                math.sin(pitch),
                math.cos(yaw) * math.cos(pitch),
            )
            self.projectile_mgr.fire(
                player_id, tier_cfg["damage"],
                (ship.pos_x, origin_y, ship.pos_z),
                direction,
                muzzle_speed=ASW_MUZZLE_SPEED,
                drag=ASW_DRAG,
                weapon="depth_charge",
            )

        self._asw_cooldowns[player_id] = tier_cfg["cooldown"]

    def _update_asw_planes(self, dt):
        """Advance battleship ASW strike planes.

        cruise: fly from over the owning ship toward the marked rectangle.
        drop: once over it, release one fused depth charge every ASW_AIR
        interval at a random point inside the rectangle until the salvo runs
        out. leave: keep flying straight for a few seconds, then despawn.
        """
        for plane in self._asw_planes:
            if plane["state"] != "leave":
                # Steer straight at the rectangle centre while approaching.
                desired = math.atan2(plane["target_x"] - plane["x"], plane["target_z"] - plane["z"])
                diff = desired - plane["heading"]
                while diff > math.pi:
                    diff -= 2 * math.pi
                while diff < -math.pi:
                    diff += 2 * math.pi
                plane["heading"] += max(-2.0 * dt, min(2.0 * dt, diff))
            plane["x"] += math.sin(plane["heading"]) * ASW_AIR["speed"] * dt
            plane["z"] += math.cos(plane["heading"]) * ASW_AIR["speed"] * dt

            if plane["state"] == "cruise":
                dx = plane["target_x"] - plane["x"]
                dz = plane["target_z"] - plane["z"]
                if dx * dx + dz * dz <= (ASW_AIR["box"] * 0.5) ** 2:
                    plane["state"] = "drop"
            elif plane["state"] == "drop":
                plane["drop_timer"] -= dt
                if plane["drop_timer"] <= 0 and plane["drops_left"] > 0:
                    plane["drop_timer"] = ASW_AIR["interval"]
                    plane["drops_left"] -= 1
                    # Random point inside the target rectangle.
                    ox = random.uniform(-ASW_AIR["box"], ASW_AIR["box"])
                    oz = random.uniform(-ASW_AIR["box"], ASW_AIR["box"])
                    self.projectile_mgr.fire(
                        plane["owner"], plane["damage"],
                        (plane["target_x"] + ox, ASW_AIR["altitude"], plane["target_z"] + oz),
                        (0.0, -1.0, 0.0),
                        muzzle_speed=40.0,
                        drag=0.02,
                        weapon="depth_charge",
                    )
                    if plane["drops_left"] <= 0:
                        plane["state"] = "leave"
            elif plane["state"] == "leave":
                plane["leave_timer"] -= dt

        self._asw_planes = [
            p for p in self._asw_planes
            if not (p["state"] == "leave" and p["leave_timer"] <= 0)
        ]

    def _fire_aa_defenses(self, dt):
        """Automatic AA point-defense pass.

        Each alive ship with an AA fit (`get_class_aa`) independently targets
        the nearest enemy squadron within AA range per mount, firing a flak
        shell on that mount's cooldown from that mount's actual deck position
        (mirror of the client's AA turret layout — shells leave the visible
        mounts, not the ship centre). Friendly aircraft (same owner, or same
        team in team mode) are skipped. No-op when no aircraft are airborne.
        """
        squads = [sq for sq in self.aircraft_mgr.squadrons if sq.alive]
        if not squads:
            return
        for pid, ship in self.ships.items():
            if not ship.alive or not ship.ship_class:
                continue
            aa = get_class_aa(ship.ship_class)
            if not aa:
                continue
            tier_cfg = get_aa_tier(aa["tier"])
            if not tier_cfg:
                continue
            layout = self._get_aa_layout(ship)
            mounts = len(layout)
            if mounts == 0:
                continue
            cds = self._aa_cooldowns.get(pid)
            if cds is None or len(cds) != mounts:
                cds = [0.0] * mounts
                self._aa_cooldowns[pid] = cds

            aa_range2 = tier_cfg["range"] ** 2
            # Friendly-owner set: skip own aircraft + teammates' aircraft.
            friend_owners = {pid}
            if ship.team:
                for opid, os in self.ships.items():
                    if os.team == ship.team:
                        friend_owners.add(opid)

            for m in range(mounts):
                if cds[m] > 0:
                    cds[m] = max(0.0, cds[m] - dt)
                    continue
                # Acquire nearest hostile squadron in range.
                best_sq = None
                best_d2 = aa_range2
                for sq in squads:
                    if sq.owner in friend_owners:
                        continue
                    dx = sq.pos_x - ship.pos_x
                    dz = sq.pos_z - ship.pos_z
                    d2 = dx * dx + dz * dz
                    if d2 < best_d2:
                        best_d2 = d2
                        best_sq = sq
                if best_sq is None:
                    continue
                # Lead the target slightly by aiming at the squadron's current
                # position; flak hit radius is generous, so a direct intercept
                # calc isn't needed.
                aim_x = best_sq.pos_x
                aim_y = best_sq.altitude
                aim_z = best_sq.pos_z
                # Origin: this mount's deck position (turret height above it).
                ldx, ldz = layout[m]
                ox, oz = self._turret_world_pos(ship, ldx, ldz)
                oy = 3.0
                # Direction toward the squadron (unit vector).
                dx = aim_x - ox
                dy = aim_y - oy
                dz = aim_z - oz
                d = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
                self.projectile_mgr.fire(
                    pid, tier_cfg["damage"], (ox, oy, oz),
                    (dx / d, dy / d, dz / d),
                    muzzle_speed=tier_cfg["muzzle_speed"],
                    drag=AA_DRAG, weapon="flak",
                )
                cds[m] = tier_cfg["cooldown"]

    def update(self, dt):
        self.tick += 1
        self.events = []

        # Update ship turret cooldowns
        for ship in self.ships.values():
            if ship.alive:
                for i in range(len(ship.turret_cooldowns)):
                    if ship.turret_cooldowns[i] > 0:
                        ship.turret_cooldowns[i] -= dt
                for i in range(len(ship.secondary_cooldowns)):
                    if ship.secondary_cooldowns[i] > 0:
                        ship.secondary_cooldowns[i] = max(0.0, ship.secondary_cooldowns[i] - dt)
                ship.skills.update(dt, ship)
        # Decay ASW release cooldowns.
        for pid in list(self._asw_cooldowns.keys()):
            if self._asw_cooldowns[pid] > 0:
                self._asw_cooldowns[pid] = max(0.0, self._asw_cooldowns[pid] - dt)
            else:
                del self._asw_cooldowns[pid]

        # Advance battleship ASW strike planes (cruise -> scatter charges -> leave).
        self._update_asw_planes(dt)

        # Update enemy turret cooldowns every tick
        for enemy in self.enemy_mgr.enemies:
            if enemy.alive and enemy.type == "ship":
                for i in range(len(enemy.turret_cooldowns)):
                    if enemy.turret_cooldowns[i] > 0:
                        enemy.turret_cooldowns[i] = max(0.0, enemy.turret_cooldowns[i] - dt)

        # Update projectiles (pass the aircraft manager so flak can hit
        # squadrons and depth charges can AoE submarines).
        proj_events = self.projectile_mgr.update(dt, self.terrain, self.ships, aircraft_mgr=self.aircraft_mgr)
        self.events.extend(proj_events)

        # Update torpedoes
        torp_events = self.torpedo_mgr.update(dt, self.ships)
        self.events.extend(torp_events)

        # Update carrier aircraft (authoritative flight + ordinance regen +
        # auto-pilot). Carriers map each squadron to its owning ship (for
        # re-arm + level); enemies are every other ship (autopilot targets).
        carrier_map = {}
        for pid, ship in self.ships.items():
            if ship.ship_class == "carrier" and ship.alive:
                carrier_map[pid] = ship
        auto_drops = self.aircraft_mgr.update(
            dt, self._fly_inputs,
            carriers=carrier_map,
            enemies=[s for s in self.ships.values() if s.alive],
        )
        self._fly_inputs.clear()

        # Execute auto-pilot releases (server-authoritative, mirror process_drop).
        for owner_id, kind in auto_drops:
            ship = self.ships.get(owner_id)
            if not ship or not ship.alive:
                continue
            sq = self.aircraft_mgr.get_by_owner(owner_id)
            if sq is None:
                continue
            if kind == "bomb":
                for (x, y, z, vx, vy, vz, damage, weapon) in sq.drop_bomb():
                    speed = math.sqrt(vx * vx + vy * vy + vz * vz) or 1.0
                    self.projectile_mgr.fire(
                        owner_id, damage, (x, y, z), (vx / speed, vy / speed, vz / speed),
                        muzzle_speed=speed,
                        drag=CARRIER["bomb_drag"], weapon=weapon,
                    )
            else:
                for (x, z, heading, tier) in sq.drop_torpedo():
                    self.torpedo_mgr.fire(
                        owner_id, tier, ship.level, x, z, heading,
                        count=1, spread="narrow",
                    )

        # ---- Automatic AA point-defense ----
        # Each ship with AA mounts fires `weapon="flak"` shells at the nearest
        # enemy squadron within AA range, independently per mount on its own
        # cooldown. Friendly aircraft (same owner) are never targeted. Flak hit
        # detection happens in ProjectileManager.update (next tick). Only
        # matters once aircraft exist (carrier squadrons / enemy wings).
        self._fire_aa_defenses(dt)

        # Ship-to-ship ramming damage (single-shot per contact + push apart)
        self._process_ship_collisions()

        # Update enemies (AI tick at 5Hz for performance)
        if self.tick % 4 == 0:
            for enemy in self.enemy_mgr.enemies:
                if enemy.alive:
                    enemy.update(dt * 4, self.ships, self)

        # Check enemy deaths
        for enemy in self.enemy_mgr.enemies:
            if enemy.alive and enemy.hp <= 0:
                enemy.alive = False
                self.events.append({
                    "type": "entity_destroyed",
                    "target": f"e_{enemy.enemy_id}",
                    "destroyed_by": "player",
                    "score": getattr(enemy, "score_value", 0),
                })

        # Process respawns — must run AFTER all damage sources so that
        # ships killed by torpedoes/enemies this tick respawn immediately,
        # preventing _check_game_end from seeing them as dead.
        self._process_respawns()

        # Wave spawning for PvE modes
        if self.mode in ("pve", "solo"):
            alive_count = self.enemy_mgr.get_alive_count()
            alive_players = [s for s in self.ships.values() if s.alive]
            if alive_count == 0 and alive_players:
                self.wave += 1
                positions = [(s.pos_x, s.pos_z) for s in alive_players]
                self.enemy_mgr.spawn(self.level, positions, self.terrain)

    def _process_ship_collisions(self):
        """Detect ship-to-ship overlap, deal flat ramming damage, push apart.

        Damage model (option B from the design discussion):
        - Each contact deals a single fixed RAMMING_DAMAGE to both ships.
        - Both ships are then separated so subsequent ticks don't re-trigger
          damage (prevents "stick and melt" gameplay).
        - In team mode, teammates push each other but take no damage.
        - Returns the list of events appended (also extends self.events).
        """
        events = []
        alive_ships = [(pid, s) for pid, s in self.ships.items() if s.alive]
        if len(alive_ships) < 2:
            return events

        for i in range(len(alive_ships)):
            pid_a, ship_a = alive_ships[i]
            radius_a = max(ship_a.ship_length, ship_a.ship_width) / 2
            for j in range(i + 1, len(alive_ships)):
                pid_b, ship_b = alive_ships[j]
                if not ship_b.alive or not ship_a.alive:
                    continue

                radius_b = max(ship_b.ship_length, ship_b.ship_width) / 2
                min_dist = radius_a + radius_b

                dx = ship_b.pos_x - ship_a.pos_x
                dz = ship_b.pos_z - ship_a.pos_z
                dist = math.hypot(dx, dz)

                if dist >= min_dist:
                    continue

                # A fully-submerged submarine passes UNDER surface hulls — no
                # ramming contact at all. (Submerged subs may only be damaged
                # by depth charges and torpedoes.)
                if getattr(ship_a, "fully_submerged", False) or getattr(ship_b, "fully_submerged", False):
                    continue

                # Teammates don't damage each other but still push apart
                same_team = (
                    ship_a.team is not None and ship_a.team == ship_b.team
                )
                if not same_team:
                    ship_a.take_damage(RAMMING_DAMAGE)
                    ship_b.take_damage(RAMMING_DAMAGE)
                    # Ramming impact point: midpoint between the two hulls at
                    # roughly deck height, for client-side explosion rendering.
                    mid_x = round((ship_a.pos_x + ship_b.pos_x) / 2, 2)
                    mid_z = round((ship_a.pos_z + ship_b.pos_z) / 2, 2)
                    events.append({
                        "type": "hit",
                        "target": pid_a,
                        "damage": RAMMING_DAMAGE,
                        "attacker": pid_b,
                        "weapon": "ram",
                        "x": mid_x,
                        "y": 2.0,
                        "z": mid_z,
                    })
                    events.append({
                        "type": "hit",
                        "target": pid_b,
                        "damage": RAMMING_DAMAGE,
                        "attacker": pid_a,
                        "weapon": "ram",
                        "x": mid_x,
                        "y": 2.0,
                        "z": mid_z,
                    })
                    for pid, ship, attacker_id in (
                        (pid_a, ship_a, pid_b),
                        (pid_b, ship_b, pid_a),
                    ):
                        if not ship.alive:
                            events.append({
                                "type": "entity_destroyed",
                                "target": pid,
                                "destroyed_by": attacker_id,
                                "weapon": "ram",
                                "x": mid_x,
                                "y": 2.0,
                                "z": mid_z,
                            })

                # Push both ships apart along the line between their centers
                # so they end up exactly at non-overlapping distance. This
                # prevents damage from re-triggering on the next tick.
                if dist > 1e-6:
                    nx, nz = dx / dist, dz / dist
                else:
                    # Exactly overlapping — pick an arbitrary axis
                    nx, nz = 1.0, 0.0
                overlap = min_dist - dist + 1.0  # +1m clearance buffer
                push = overlap / 2
                ship_a.pos_x -= nx * push
                ship_a.pos_z -= nz * push
                ship_b.pos_x += nx * push
                ship_b.pos_z += nz * push

        self.events.extend(events)
        return events

    def get_snapshot(self, player_id=None):
        you = None
        others = []
        for pid, ship in self.ships.items():
            snap = ship.to_snapshot()
            snap["rspn"] = self._respawn_remaining.get(pid, 0)
            if pid == player_id:
                you = snap
            else:
                others.append(snap)

        # Tell the local player whether they're in carrier squadron view.
        if you is not None:
            you["squadView"] = self._in_squadron_view.get(player_id, False)
            you["squadGroup"] = self._active_group.get(player_id, "torpedo")

        snapshot = {
            "type": "snapshot",
            "tick": self.tick,
            "you": you,
            "others": others,
            "projs": self.projectile_mgr.get_snapshots(),
            "torps": self.torpedo_mgr.get_snapshots(),
            "airs": self.aircraft_mgr.get_snapshots(),
            "aswPlanes": [
                {
                    "id": p["id"],
                    "owner": p["owner"],
                    "x": round(p["x"], 2),
                    "z": round(p["z"], 2),
                    "h": round(p["heading"], 4),
                    "alt": ASW_AIR["altitude"],
                }
                for p in self._asw_planes
            ],
            "enemies": self.enemy_mgr.get_snapshots(),
            "evts": self.events,
        }
        self.snapshot_history.append(snapshot)
        return snapshot

    def get_full_snapshot(self):
        return {
            "type": "full_snapshot",
            "tick": self.tick,
            "ships": [s.to_snapshot() for s in self.ships.values()],
            "projs": self.projectile_mgr.get_snapshots(),
            "torps": self.torpedo_mgr.get_snapshots(),
            "enemies": self.enemy_mgr.get_snapshots(),
            "aswPlanes": [
                {
                    "id": p["id"],
                    "owner": p["owner"],
                    "x": round(p["x"], 2),
                    "z": round(p["z"], 2),
                    "h": round(p["heading"], 4),
                    "alt": ASW_AIR["altitude"],
                }
                for p in self._asw_planes
            ],
        }

    def get_snapshot_at(self, tick):
        for snap in self.snapshot_history:
            if snap.get("tick") == tick:
                return snap
        return None
