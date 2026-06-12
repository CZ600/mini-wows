import math
from collections import deque
from game.config import (
    DT, SNAPSHOT_HISTORY_SIZE, GRAVITY, PROJECTILE_INITIAL_SPEED,
    ENEMY_DETECT_RANGE, ENEMY_FIRE_SPEED, ENEMY_FIRE_COOLDOWN,
)
from game.ship import ServerShip
from game.terrain import Terrain
from game.projectile import ProjectileManager
from game.torpedo import TorpedoManager
from game.enemy import EnemyManager


class GameState:
    def __init__(self, terrain: Terrain, mode="ffa"):
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

    def add_ship(self, player_id, username, level=1, ship_class=None, team=None):
        ship = ServerShip(player_id, username, level, ship_class, team)
        ship.find_safe_spawn(self.terrain)
        self.ships[player_id] = ship
        return ship

    def remove_ship(self, player_id):
        self.ships.pop(player_id, None)

    def process_input(self, player_id, msg):
        ship = self.ships.get(player_id)
        if not ship or not ship.alive:
            return
        keys = msg.get("k", {})
        ship.update(DT, keys, self.terrain)

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

        # Fire from ship position toward aim target (server-authoritative)
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

        direction = (
            math.sin(yaw) * math.cos(pitch),
            math.sin(pitch),
            math.cos(yaw) * math.cos(pitch),
        )

        for i in ready_turrets:
            self.projectile_mgr.fire(
                player_id, ship.damage,
                (ship.pos_x, origin_y, ship.pos_z),
                direction,
            )
            ship.turret_cooldowns[i] = ship.fire_cooldown

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

    def update(self, dt):
        self.tick += 1
        self.events = []

        # Update ship turret cooldowns
        for ship in self.ships.values():
            if ship.alive:
                for i in range(len(ship.turret_cooldowns)):
                    if ship.turret_cooldowns[i] > 0:
                        ship.turret_cooldowns[i] -= dt

        # Update projectiles
        proj_events = self.projectile_mgr.update(dt, self.terrain, self.ships)
        self.events.extend(proj_events)

        # Update torpedoes
        torp_events = self.torpedo_mgr.update(dt, self.ships)
        self.events.extend(torp_events)

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

        # Wave spawning for PvE modes
        if self.mode in ("pve", "solo"):
            alive_count = self.enemy_mgr.get_alive_count()
            alive_players = [s for s in self.ships.values() if s.alive]
            if alive_count == 0 and alive_players:
                self.wave += 1
                positions = [(s.pos_x, s.pos_z) for s in alive_players]
                self.enemy_mgr.spawn(self.level, positions, self.terrain)

    def get_snapshot(self, player_id=None):
        you = None
        others = []
        for pid, ship in self.ships.items():
            snap = ship.to_snapshot()
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
