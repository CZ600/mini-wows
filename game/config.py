import math

# Map
MAP_SIZE = 10000
MAP_HALF = MAP_SIZE / 2.0
TERRAIN_SEGMENTS = 256
TERRAIN_NOISE_SEED = 123
ISLAND_COUNT = 10

# Tick
TICK_RATE = 20
DT = 1.0 / TICK_RATE
AI_TICK_RATE = 5
AI_DT = 1.0 / AI_TICK_RATE

# Snapshot history for reconnection
SNAPSHOT_HISTORY_SECONDS = 10
SNAPSHOT_HISTORY_SIZE = TICK_RATE * SNAPSHOT_HISTORY_SECONDS

# Ship physics
BASE_MAX_SPEED = 16.67

# Drift: velocity_heading chases heading, recovery slows at high speed
DRIFT_CONFIG = {
    "default":    {"recovery_base": 2.5, "speed_factor": 0.14, "max_angle": 0.40},
    "destroyer":  {"recovery_base": 2.5, "speed_factor": 0.10, "max_angle": 0.65},
    "cruiser":    {"recovery_base": 2.5, "speed_factor": 0.14, "max_angle": 0.45},
    "battleship": {"recovery_base": 2.0, "speed_factor": 0.05, "max_angle": 0.25},
}

def get_drift_config(ship_class):
    if not ship_class:
        return DRIFT_CONFIG["default"]
    return DRIFT_CONFIG.get(ship_class, DRIFT_CONFIG["default"])

ACCEL = BASE_MAX_SPEED / 15.0
DECEL_FRICTION = 0.98

# Projectiles
GRAVITY = 9.8
PROJECTILE_INITIAL_SPEED = 200
PROJECTILE_MAX_LIFETIME = 20
PROJECTILE_DRAG = 0.06        # speed decay per second (6%/s)

# Per-class main-gun muzzle speed and per-second drag.
# A shell's range is governed ballistically by muzzle speed, gravity, drag and
# lifetime — there is no hard "range" cap. Each class gets its own (v0, drag) so
# that range falls out of the trajectory naturally:
#   battleship: slowest muzzle, lightest drag  -> ~3 km, retains energy far
#   cruiser:    middle muzzle,   middle drag    -> ~3 km, balanced
#   destroyer:  fastest muzzle,  heaviest drag  -> ~2 km, bleeds speed quickly
# The values were reverse-engineered by simulating the discrete-tick trajectory
# the server actually uses (DT=0.05, multiplicative drag, gravity, terminates on
# y<=0 or lifetime>PROJECTILE_MAX_LIFETIME). Drag here is the per-second decay
# rate, applied per tick as `v *= (1 - drag * DT)` — same model as the global
# PROJECTILE_DRAG above.
# Static coastal turrets (ServerTurret) keep using ENEMY_FIRE_SPEED/PROJECTILE_DRAG.
CANNON_MUZZLE_SPEED = {
    "destroyer":  346.85,
    "cruiser":    284.44,
    "battleship": 227.45,
}
CANNON_DRAG = {
    "destroyer":  0.150,
    "cruiser":    0.060,
    "battleship": 0.030,
}


def get_muzzle_speed(ship_class):
    """Main-gun muzzle speed for a ship class (defaults to the shared baseline)."""
    if not ship_class:
        return PROJECTILE_INITIAL_SPEED
    return CANNON_MUZZLE_SPEED.get(ship_class, PROJECTILE_INITIAL_SPEED)


def get_cannon_drag(ship_class):
    """Main-gun per-second drag for a ship class (defaults to the shared baseline)."""
    if not ship_class:
        return PROJECTILE_DRAG
    return CANNON_DRAG.get(ship_class, PROJECTILE_DRAG)

# Cannon spread: elliptical scatter centered on aim point.
# Long axis (sigma_v) is along the aim direction (pitch perturbation → range error).
# Short axis (sigma_h) is perpendicular (yaw perturbation → lateral error).
# sigma_v = sigma_h * VERT_MULT  (long axis = perpendicular * mult)
CANNON_SPREAD_BASE = 0.00001     # radians per meter (horizontal sigma)
CANNON_SPREAD_VERTICAL_MULT = 3.0
CANNON_SPREAD_MAX_SIGMA = 3.0    # clamp random at ±N sigma

# Per-class params: sigma_h = base + distance * SPREAD_BASE * growth
# Destroyer: tightest at close range, degrades fastest with distance
# Cruiser: balanced
# Battleship: looser up close, flattest curve (best at long range)
CANNON_SPREAD_CLASS = {
    "destroyer":   {"base": 0.00005, "growth": 0.8},
    "cruiser":     {"base": 0.0008,  "growth": 0.4},
    "battleship":  {"base": 0.0015,  "growth": 0.15},
}

# Enemy
ENEMY_FIRE_COOLDOWN = 8.0
ENEMY_DETECT_RANGE = 600
ENEMY_FIRE_SPEED = 150

# Torpedoes
TORPEDO_TIERS = {
    1: {"speed": 22.2, "range": 400, "base_cooldown": 8},
    2: {"speed": 16.7, "range": 600, "base_cooldown": 8},
    3: {"speed": 12.5, "range": 800, "base_cooldown": 8},
}
TORPEDO_RANGE_SCALE = 1.05
TORPEDO_SPEED_SCALE = 1.03
TORPEDO_COOLDOWN_SCALE = 0.95
TORPEDO_HIT_RADIUS = 3

# Ship-to-ship ramming
RAMMING_DAMAGE = 50

# Skills: F=rapid_fire, G=damage_control, H=precision
# 激活时长(秒)、冷却时长(秒)、效果系数
SKILL_CONFIG = {
    "rapid_fire": {
        "duration": 10.0,
        "cooldown": 80.0,
        "fire_cooldown_mult": 0.7,   # 装填时间乘 0.7 (减少30%)
    },
    "damage_control": {
        "duration": 10.0,
        "cooldown": 40.0,
        "hp_regen_ratio": 0.3,       # 恢复 max_hp 的 30%
    },
    "precision": {
        "duration": 10.0,
        "cooldown": 60.0,
        "spread_mult": 0.7,          # 散布 σ 乘 0.7 (减少30%)
    },
}

# Room
COUNTDOWN_SECONDS = 10
ROOM_CLEANUP_DELAY = 30
RECONNECT_GRACE_PERIOD = 60

# Reconciliation
SNAP_THRESHOLD = 0.5
SNAP_LERP_SPEED = 0.25

# Interpolation
INTERP_BUFFER_MS = 100
DEAD_RECKONING_MAX_MS = 500

# Modes
MODE_CONFIG = {
    "ffa":  {"min": 2, "max": 8},
    "team": {"min": 10, "max": 10},
    "pve":  {"min": 2, "max": 6},
    "solo": {"min": 1, "max": 1},
}

LEVEL_CONFIG = {
    # Hull height scaled to ~60% of the original freeboard so ships sit lower
    # in the water; the projectile collision upper bound derives from this
    # (ship_height + 3.0 in projectile.py).
    1:  {"length": 7,  "width": 2,  "height": 0.9, "hp": 300,  "turn_radius": 20, "fire_cooldown": 5.0, "damage": 30, "front_turrets": 1, "back_turrets": 0, "has_bridge": False},
    2:  {"length": 13, "width": 3,  "height": 1.2, "hp": 450,  "turn_radius": 30, "fire_cooldown": 4.5, "damage": 35, "front_turrets": 1, "back_turrets": 1, "has_bridge": False},
    3:  {"length": 18, "width": 4,  "height": 1.5, "hp": 660,  "turn_radius": 35, "fire_cooldown": 4.0, "damage": 40, "front_turrets": 2, "back_turrets": 1, "has_bridge": False},
    4:  {"length": 23, "width": 5,  "height": 1.8, "hp": 900,  "turn_radius": 40, "fire_cooldown": 3.5, "damage": 45, "front_turrets": 2, "back_turrets": 2, "has_bridge": True},
    5:  {"length": 28, "width": 6,  "height": 2.1, "hp": 1200, "turn_radius": 45, "fire_cooldown": 3.2, "damage": 50, "front_turrets": 2, "back_turrets": 2, "has_bridge": True},
    6:  {"length": 33, "width": 7,  "height": 2.4, "hp": 1560, "turn_radius": 50, "fire_cooldown": 2.8, "damage": 55, "front_turrets": 3, "back_turrets": 2, "has_bridge": True},
    7:  {"length": 38, "width": 8,  "height": 2.7, "hp": 1950, "turn_radius": 55, "fire_cooldown": 2.5, "damage": 60, "front_turrets": 3, "back_turrets": 2, "has_bridge": True},
    8:  {"length": 43, "width": 9,  "height": 3.0, "hp": 2400, "turn_radius": 60, "fire_cooldown": 2.2, "damage": 65, "front_turrets": 3, "back_turrets": 3, "has_bridge": True},
    9:  {"length": 48, "width": 10, "height": 3.3, "hp": 2850, "turn_radius": 65, "fire_cooldown": 2.0, "damage": 70, "front_turrets": 3, "back_turrets": 3, "has_bridge": True},
    10: {"length": 53, "width": 11, "height": 3.6, "hp": 3300, "turn_radius": 70, "fire_cooldown": 1.8, "damage": 80, "front_turrets": 3, "back_turrets": 3, "has_bridge": True},
}

CLASS_CONFIG = {
    "destroyer": {
        4:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 4, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 1},
        5:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 4, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 1},
        6:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 5, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        7:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 5, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        8:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 6, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        9:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 6, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        10: {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 8, "size_mul": 0.55, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
    },
    "cruiser": {
        4:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 1},
        5:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 1},
        6:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        7:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 3, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        8:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 3, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        9:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 4, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        10: {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 4, "size_mul": 0.85, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
    },
    # Battleship: Lv6-7 double turrets; Lv8-10 triple turrets in A-B-X layout
    # (2 front + 1 back). The layout override keeps total DPM constant via the
    # equivalent-barrels factor applied in get_class_config().
    "battleship": {
        4:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 1},
        5:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 1},
        6:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 2},
        7:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 2},
        8:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 1},
        9:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 1},
        10: {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 2},
    },
}

# Reference turret layout before per-class multi-barrel / A-B-X overrides.
# Used by get_class_config() to hold DPM constant when a battleship's turret
# count changes (6 single-barrel turrets -> 3 triple-barrel turrets).
BASE_TURRET_COUNT = {
    4: 4, 5: 4, 6: 5, 7: 5, 8: 6, 9: 6, 10: 6,
}

ENEMY_SCALE = {
    1:  {"hp": 100,  "damage": 20, "count": 10, "size": 10, "score": 3},
    2:  {"hp": 130,  "damage": 24, "count": 10, "size": 10, "score": 4},
    3:  {"hp": 170,  "damage": 30, "count": 12, "size": 10, "score": 5},
    4:  {"hp": 220,  "damage": 36, "count": 12, "size": 11, "score": 7},
    5:  {"hp": 280,  "damage": 44, "count": 14, "size": 11, "score": 9},
    6:  {"hp": 350,  "damage": 58, "count": 14, "size": 12, "score": 11},
    7:  {"hp": 430,  "damage": 76, "count": 16, "size": 12, "score": 14},
    8:  {"hp": 520,  "damage": 98, "count": 16, "size": 13, "score": 17},
    9:  {"hp": 630,  "damage": 124, "count": 18, "size": 13, "score": 21},
    10: {"hp": 750,  "damage": 154, "count": 20, "size": 14, "score": 25},
}

ENEMY_SHIP_SCALE = {
    1:  {"hp": 120,  "damage": 18, "speed": 8,   "score": 5},
    2:  {"hp": 160,  "damage": 23, "speed": 9,   "score": 7},
    3:  {"hp": 210,  "damage": 29, "speed": 10,  "score": 10},
    4:  {"hp": 270,  "damage": 36, "speed": 10,  "score": 13},
    5:  {"hp": 340,  "damage": 45, "speed": 11,  "score": 17},
    6:  {"hp": 420,  "damage": 57, "speed": 11,  "score": 21},
    7:  {"hp": 520,  "damage": 72, "speed": 12,  "score": 26},
    8:  {"hp": 640,  "damage": 90, "speed": 13,  "score": 32},
}

LEVEL_THRESHOLDS = [0, 10, 50, 85, 150, 250, 380, 560, 780, 1050]


def get_class_config(ship_class, level):
    if not ship_class or level < 4 or level > 10:
        return None
    cc = CLASS_CONFIG.get(ship_class, {}).get(level)
    if not cc:
        return None
    base = LEVEL_CONFIG[level]
    sm = cc.get("size_mul", 1.0)
    barrels = cc.get("barrels", 1)

    # Optional per-class turret layout override (e.g. battleship A-B-X),
    # otherwise fall back to the shared LEVEL_CONFIG layout.
    front_turrets = cc.get("front_turrets", base["front_turrets"])
    back_turrets = cc.get("back_turrets", base["back_turrets"])
    new_turrets = front_turrets + back_turrets

    # Hold DPM constant: the original layout (BASE_TURRET_COUNT single-barrel
    # turrets) had a fixed per-shot damage. The new layout fires more shots
    # (new_turrets * barrels), so each shot's damage scales down so that the
    # total damage per salvo is preserved.
    base_salvo_shots = BASE_TURRET_COUNT.get(level, base["front_turrets"] + base["back_turrets"])
    new_salvo_shots = new_turrets * barrels
    dmg_scale = base_salvo_shots / new_salvo_shots

    return {
        "hp": round(base["hp"] * cc["hp_mul"]),
        "max_speed": BASE_MAX_SPEED * cc["speed_mul"],
        "turn_radius": round(base["turn_radius"] * cc["turn_mul"]),
        "damage": round(base["damage"] * cc["damage_mul"] * dmg_scale),
        "fire_cooldown": round(base["fire_cooldown"] * cc["cooldown_mul"], 2),
        "front_turrets": front_turrets,
        "back_turrets": back_turrets,
        "has_bridge": base["has_bridge"],
        "length": round(base["length"] * sm),
        "width": round(base["width"] * sm, 1),
        "height": round(base["height"] * sm, 1),
        "torpedo_tiers": cc["torpedo_tiers"],
        "torpedo_tubes": cc["torpedo_tubes"],
        "turret_mul": cc.get("turret_mul", 1.0),
        "barrels": barrels,
    }


def get_ship_config(level, ship_class=None):
    class_cfg = get_class_config(ship_class, level)
    return class_cfg if class_cfg else LEVEL_CONFIG[level]


def get_torpedo_stats(tier, level):
    base = TORPEDO_TIERS.get(tier)
    if not base:
        return None
    levels_above_4 = max(0, level - 4)
    return {
        "speed": base["speed"] * (TORPEDO_SPEED_SCALE ** levels_above_4),
        "range": base["range"] * (TORPEDO_RANGE_SCALE ** levels_above_4),
        "cooldown": base["base_cooldown"] * (TORPEDO_COOLDOWN_SCALE ** levels_above_4),
    }
