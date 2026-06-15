import math
import random
from collections import deque
from game.config import (
    DT, SNAPSHOT_HISTORY_SIZE, GRAVITY, PROJECTILE_INITIAL_SPEED,
    ENEMY_DETECT_RANGE, ENEMY_FIRE_SPEED, ENEMY_FIRE_COOLDOWN,
    RAMMING_DAMAGE,
)
from game.ship import ServerShip
from game.terrain import Terrain
from game.projectile import ProjectileManager, apply_cannon_spread, compensate_drag_pitch
from game.torpedo import TorpedoManager
from game.enemy import EnemyManager


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
        self.wave = 0
        self.level = 1
        self._spawn_index = 0
        self.respawn_limit = respawn_limit
        self._respawn_remaining = {}  # player_id -> remaining respawns
        self._initial_spawns = {}     # player_id -> (x, z)

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
        ship.update(DT, keys, self.terrain)

    def _get_turret_offsets(self, ship):
        """Return list of (dx, dz) offsets for each turret relative to ship center."""
        from game.config import get_ship_config
        cfg = get_ship_config(ship.level, ship.ship_class)
        n_front = cfg["front_turrets"]
        n_back = cfg["back_turrets"]
        length = ship.ship_length
        spacing = max(1.5, ship.ship_width * 0.85)

        offsets = []
        front_center = length * 0.2
        for i in range(n_front):
            offset = (i - (n_front - 1) / 2) * spacing
            offsets.append((0, front_center + offset))

        back_center = -length * 0.2
        for i in range(n_back):
            offset = (i - (n_back - 1) / 2) * spacing
            offsets.append((0, back_center + offset))

        return offsets

    def _turret_world_pos(self, ship, local_dx, local_dz):
        """Convert turret local offset to world position based on ship heading."""
        cos_h = math.cos(ship.heading)
        sin_h = math.sin(ship.heading)
        wx = ship.pos_x + sin_h * local_dz + cos_h * local_dx
        wz = ship.pos_z + cos_h * local_dz - sin_h * local_dx
        return wx, wz

    YAW_RANGE_FULL = math.pi
    YAW_RANGE_BRIDGE = 2.2

    def _get_turret_yaw_caps(self, ship):
        """Return list of (yaw_center, yaw_range) per turret, mirroring client buildTurretDefs."""
        from game.config import get_ship_config
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

    def process_fire(self, player_id, msg):
        """Server-authoritative fire: client sends aim target, server creates projectile."""
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return

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
        dx = aim_x - ship.pos_x
        dz = aim_z - ship.pos_z
        dy = aim_y - origin_y
        horiz_dist = math.sqrt(dx * dx + dz * dz)

        if horiz_dist < 1:
            pitch = math.pi / 4
            yaw = ship.heading
        else:
            v2 = PROJECTILE_INITIAL_SPEED ** 2
            v4 = v2 * v2
            disc = v4 - GRAVITY * (GRAVITY * horiz_dist * horiz_dist + 2 * dy * v2)
            if disc < 0:
                pitch = math.pi / 4
            else:
                pitch = math.atan((v2 - math.sqrt(disc)) / (GRAVITY * horiz_dist))
            pitch = max(0, min(math.radians(60), pitch))
            yaw = math.atan2(dx, dz)

        pitch = compensate_drag_pitch(pitch, horiz_dist, PROJECTILE_INITIAL_SPEED)

        direction = (
            math.sin(yaw) * math.cos(pitch),
            math.sin(pitch),
            math.cos(yaw) * math.cos(pitch),
        )

        direction = apply_cannon_spread(
            direction, horiz_dist, ship.ship_class,
            spread_mult=0.7 if ship.skills.is_active("precision") else 1.0,
        )

        local_aim_yaw = yaw - ship.heading
        turret_caps = self._get_turret_yaw_caps(ship)

        fireable = [
            i for i in ready_turrets
            if i < len(turret_caps)
            and self._turret_can_aim(turret_caps[i][0], turret_caps[i][1], local_aim_yaw)
        ]
        if not fireable:
            return

        turret_offsets = self._get_turret_offsets(ship)

        for i in fireable:
            if i < len(turret_offsets):
                ldx, ldz = turret_offsets[i]
                ox, oz = self._turret_world_pos(ship, ldx, ldz)
            else:
                ox, oz = ship.pos_x, ship.pos_z
            self.projectile_mgr.fire(
                player_id, ship.damage,
                (ox, origin_y, oz),
                direction,
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

    def update(self, dt):
        self.tick += 1
        self.events = []

        # Update ship turret cooldowns
        for ship in self.ships.values():
            if ship.alive:
                for i in range(len(ship.turret_cooldowns)):
                    if ship.turret_cooldowns[i] > 0:
                        ship.turret_cooldowns[i] -= dt
                ship.skills.update(dt, ship)

        # Update enemy turret cooldowns every tick
        for enemy in self.enemy_mgr.enemies:
            if enemy.alive and enemy.type == "ship":
                for i in range(len(enemy.turret_cooldowns)):
                    if enemy.turret_cooldowns[i] > 0:
                        enemy.turret_cooldowns[i] = max(0.0, enemy.turret_cooldowns[i] - dt)

        # Update projectiles
        proj_events = self.projectile_mgr.update(dt, self.terrain, self.ships)
        self.events.extend(proj_events)

        # Update torpedoes
        torp_events = self.torpedo_mgr.update(dt, self.ships)
        self.events.extend(torp_events)

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

                # Teammates don't damage each other but still push apart
                same_team = (
                    ship_a.team is not None and ship_a.team == ship_b.team
                )
                if not same_team:
                    ship_a.take_damage(RAMMING_DAMAGE)
                    ship_b.take_damage(RAMMING_DAMAGE)
                    events.append({
                        "type": "hit",
                        "target": pid_a,
                        "damage": RAMMING_DAMAGE,
                        "attacker": pid_b,
                        "weapon": "ram",
                    })
                    events.append({
                        "type": "hit",
                        "target": pid_b,
                        "damage": RAMMING_DAMAGE,
                        "attacker": pid_a,
                        "weapon": "ram",
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

        snapshot = {
            "type": "snapshot",
            "tick": self.tick,
            "you": you,
            "others": others,
            "projs": self.projectile_mgr.get_snapshots(),
            "torps": self.torpedo_mgr.get_snapshots(),
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
        }

    def get_snapshot_at(self, tick):
        for snap in self.snapshot_history:
            if snap.get("tick") == tick:
                return snap
        return None
