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
    "submarine":  {"recovery_base": 2.0, "speed_factor": 0.08, "max_angle": 0.30},
    "carrier":    {"recovery_base": 1.8, "speed_factor": 0.04, "max_angle": 0.20},
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
    "submarine":  180.0,
    "carrier":    260.0,
}
CANNON_DRAG = {
    "destroyer":  0.150,
    "cruiser":    0.060,
    "battleship": 0.030,
    "submarine":  0.200,
    "carrier":    0.080,
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
    # Submarine: single deck gun, short range — tight at close range, falls off
    # fast (it's not a gunnery platform).
    "submarine":   {"base": 0.0001,  "growth": 0.9},
    # Carrier: self-defense secondaries, mediocre accuracy.
    "carrier":     {"base": 0.0010,  "growth": 0.5},
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

# ---- Submarine dive mechanic (stage 2) ----
# Submarines toggle between surfaced (depth 0) and submerged (depth > 0).
# While submerged they are invisible to surface units and immune to ordinary
# shells, but cannot fire their deck gun. Must mirror frontend/src/game/config.js
SUBMARINE = {
    "underwater_speed_mul": 1.0,   # applied on top of class speed_mul
    "underwater_turn_mul":  0.75,  # tighter turning while submerged
    "dive_depth":           4.0,   # m below surface when fully submerged
    "transition_time":      1.5,   # s to complete a surface<->dive transition
    "shell_immunity_depth": 1.5,   # immune to shells once deeper than this (m)
}

# ---- Carrier aircraft (stage 3) ----
# A carrier player toggles between steering the ship and flying a squadron.
# Must mirror frontend/src/game/config.js CARRIER. Two air groups share one
# squadron: torpedo bombers (鱼雷机) and dive bombers (轰炸机), each with its
# own ammo pool, cooldown and per-drop salvo size (see AIR_GROUP below).
CARRIER = {
    "squadron_size":     4,    # aircraft per active squadron
    "aircraft_speed":    50,   # m/s — ~3x a destroyer
    "aircraft_turn_rate": 1.2, # rad/s — direct steering, agile
    "aircraft_altitude": 80,   # m — fixed cruise height
    # Aircraft survivability. AA flak depletes this; a squadron at 0 hp is
    # destroyed. Mirror frontend CARRIER.aircraftHp.
    "aircraft_hp":       100,  # hit points per squadron
    # Re-arm at the carrier + auto-attack behaviour (mirror frontend CARRIER).
    "rearm_range":       250,  # m — must be this close to re-arm
    "rearm_rate":        2.0,  # ammo points / second while in range
    "auto_acquire_range": 2500, # m — auto-target search radius
    "auto_attack_range": 350,  # m — drop when within this of the target
    "auto_aim_tolerance": 0.25, # rad — max heading error for a drop
    "torpedo_tier":      2,
    "bomb_weapon_type":  "bomb",
    "bomb_muzzle_speed": 60.0, # (legacy) bomb fall speed — kept for compat
    "bomb_drag":         0.02, # bomb air drag
    "bomb_drop_vy":      30.0, # m/s initial downward kick on a released bomb.
                               # Bombs ALSO inherit the plane's forward ground
                               # speed, so together this yields a ballistic arc
                               # (forward throw + gravity) instead of a drop.
    # Bomb scatter: each bomb of a salvo is aimed at a random point inside a
    # uniform disc of this radius (m) centred on the predicted impact — the
    # drop reticle the client draws. More, weaker bombs scattered across the
    # circle connect far more often than a tight line that either all hits or
    # all misses. Must mirror frontend CARRIER.bombScatterRadius.
    "bomb_scatter_radius": 8.0,
    # Aircraft-torpedo damage multiplier: air-dropped torpedoes hit harder than
    # ship-launched ones of the same tier (bombs were tuned to 60% in the same
    # rebalance). Must mirror frontend CARRIER.airTorpedoDamageMul.
    "air_torpedo_damage_mul": 1.5,
    # Auto-respawn delay for a squadron shot down by AA (mirrors frontend
    # CARRIER.squadronRespawnDelay; kept for config parity — the server keeps
    # re-launches manual/player-driven).
    "squadron_respawn_delay": 12,  # s
    "view_switch_time":  0.8,  # s — client-side camera blend
}

# Per-level air-group balance. Torpedo bombers fire a 4-ordnance salvo per
# drop. Dive bombers drop a SCATTERED salvo: 8 bombs at reduced per-bomb
# damage, each aimed at a random point inside the drop reticle (see
# bomb_scatter_radius) — many small hits instead of the old all-or-
# nothing line abreast, so a single drop connects far more often. Bomber
# per-bomb damage was rebalanced to 60% of the pre-flak value (aircraft now
# face enemy AA fire; the damage moved to the torpedo group via
# CARRIER["air_torpedo_damage_mul"] = 1.5). Bomber ammo pools are counted in
# bombs and doubled to keep the number of drops unchanged. lvl ->
# {torpedo, bomber} where each group is {salvo, cd, dmg, ammo}. Must mirror
# frontend airGroup exactly.
AIR_GROUP = {
    4:  {"torpedo": {"salvo": 4, "cd": 3.5, "dmg": 150, "ammo": 16}, "bomber": {"salvo": 8, "cd": 4.0, "dmg": 150, "ammo": 32}},
    5:  {"torpedo": {"salvo": 4, "cd": 3.3, "dmg": 165, "ammo": 18}, "bomber": {"salvo": 8, "cd": 3.8, "dmg": 168, "ammo": 36}},
    6:  {"torpedo": {"salvo": 4, "cd": 3.0, "dmg": 180, "ammo": 20}, "bomber": {"salvo": 8, "cd": 3.6, "dmg": 186, "ammo": 40}},
    7:  {"torpedo": {"salvo": 4, "cd": 2.8, "dmg": 195, "ammo": 22}, "bomber": {"salvo": 8, "cd": 3.4, "dmg": 207, "ammo": 44}},
    8:  {"torpedo": {"salvo": 4, "cd": 2.6, "dmg": 210, "ammo": 24}, "bomber": {"salvo": 8, "cd": 3.2, "dmg": 228, "ammo": 48}},
    9:  {"torpedo": {"salvo": 4, "cd": 2.4, "dmg": 230, "ammo": 26}, "bomber": {"salvo": 8, "cd": 3.0, "dmg": 252, "ammo": 52}},
    10: {"torpedo": {"salvo": 4, "cd": 2.2, "dmg": 250, "ammo": 28}, "bomber": {"salvo": 8, "cd": 2.8, "dmg": 276, "ammo": 56}},
}


def get_air_group_config(level):
    """Resolve the air-group balance row for a carrier level (clamped 4..10)."""
    lvl = max(4, min(10, int(level or 4)))
    best = 4
    for l in sorted(AIR_GROUP.keys()):
        if l <= lvl:
            best = l
    return AIR_GROUP[best]

# ---- Secondary battery (side guns) ----
# Small-calibre dual turrets along both beams of cruisers/battleships: a
# player-switchable (Q) damage supplement to the main battery. Lower per-shell
# damage & faster reload than the main guns, flatter faster shell.
# Must mirror frontend config.js SECONDARY / CLASS_SECONDARY.
SECONDARY = {
    "muzzle_speed": 320.0,
    "drag": 0.09,
    "damage": 40,
    "cooldown": 3.0,
}

# Per-class secondary fit. mounts = total side turrets (split evenly along
# both beams); barrels = guns per turret. Destroyers carry none (their beam
# turrets stay AA mounts).
CLASS_SECONDARY = {
    "cruiser":     {"mounts": 4, "barrels": 2},
    "battleship":  {"mounts": 6, "barrels": 2},
}

def get_class_secondary(ship_class):
    """Resolve a ship class's secondary fit. Returns None when absent."""
    if not ship_class:
        return None
    fit = CLASS_SECONDARY.get(ship_class)
    if not fit or not fit.get("mounts"):
        return None
    return fit

# ---- Anti-air (AA) flak ----
# AA is an automatic point-defense: each tick every ship with AA mounts fires
# `weapon="flak"` shells at the nearest enemy squadron within `range`. AA only
# matters once enemy aircraft exist (carrier squadrons). Must mirror frontend
# config.js AA / AA_TIER / CLASS_AA.
#
# Per-tier balance: range, muzzle speed, per-shell damage and fire cooldown per
# mount. AA damage is light per shell (squadrons have aircraft_hp=100); the
# threat comes from sustained fire across several mounts. Deliberately weak
# per-shell (2026-08 rebalance): aircraft kept dying on the way in, so damage
# and mount tempo were cut and the proximity radius tightened — squadrons now
# survive the approach and only bleed hp to close-in, sustained fire.
AA_TIER = {
    1: {"range": 700,  "muzzle_speed": 180.0, "damage": 6,  "cooldown": 1.5},
    2: {"range": 1000, "muzzle_speed": 220.0, "damage": 8,  "cooldown": 1.2},
}
# Shell drag for flak (heavier than main guns so it stays short-ranged).
AA_DRAG = 0.10
# Hit radius: a flak shell detonates within this distance (m) of a squadron's
# lead position. Kept tight (15 m ≈ the gravity droop of a short-range shot) so
# long-range flak mostly bursts harmlessly and only the point-defense envelope
# connects — that's the dodge window attacking aircraft are meant to have.
AA_HIT_RADIUS = 15.0

def get_aa_tier(tier):
    """Resolve an AA tier's stats (tier 0 / None -> no AA, returns None)."""
    if not tier:
        return None
    return AA_TIER.get(tier)

# Per-class AA fit. tier selects the AA_TIER row above; mounts is how many AA
# barrels the ship fields (each fires independently on its own cooldown).
#   cruiser  = 防空专精 (tier 2, many mounts)
#   battleship = heavy AA (tier 2)
#   carrier  = strong AA (tier 2, defends the air wing's home)
#   destroyer = medium AA (tier 1)
#   submarine = none
# Must mirror frontend config.js CLASS_AA.
CLASS_AA = {
    "destroyer":   {"tier": 1, "mounts": 4},
    "cruiser":     {"tier": 2, "mounts": 8},
    "battleship":  {"tier": 2, "mounts": 10},
    "carrier":     {"tier": 2, "mounts": 8},
    "submarine":   {"tier": 0, "mounts": 0},
}

def get_class_aa(ship_class):
    """Resolve a ship class's AA fit. Returns None when the class has no AA."""
    if not ship_class:
        return None
    fit = CLASS_AA.get(ship_class)
    if not fit or not fit.get("tier"):
        return None
    return fit

# ---- Anti-submarine warfare (ASW) depth charges ----
# ASW is a CLOSE-RANGE drop. Destroyers/cruisers lob a spread of depth charges
# into a nearby water band (the aim point is clamped to [min, range] from the
# hull — a fan/sector indicator mirrors this band on the client). Charges
# splash into the water, then sink for ASW_FUSE_DELAY seconds before
# detonating with a large AoE that ONLY damages submarines (surface ships are
# untouched). Battleships instead call an air strike: the player marks a target
# rectangle on the water, a plane flies out from over the battleship and
# scatters its charges across that rectangle (same fuse + AoE rules).
# Must mirror frontend config.js ASW / ASW_TIER / CLASS_ASW / ASW_AIR.
ASW_TIER = {
    1: {"damage": 320, "cooldown": 6.0, "salvo": 6,  "spread": 35},
    2: {"damage": 460, "cooldown": 5.0, "salvo": 8,  "spread": 40},
}
# Charge ballistics: a fast, flat-ish lob so a band-edge drop (~450 m) lands
# in ~4 s — depth charging is a close-range, quick-reaction tool.
ASW_MUZZLE_SPEED = 110.0
ASW_DRAG = 0.06
# Fuse delay (s): a charge floats/sinks at its splash point for this long
# before detonating, giving submerged subs a window to evade.
ASW_FUSE_DELAY = 3.0
# Detonation AoE radius (m). A charge deals full damage to every submarine
# (surfaced or submerged) whose horizontal distance from the detonation point
# is within this. Surface ships of other classes are never damaged.
ASW_BLAST_RADIUS = 100.0
# Battleship air-delivered ASW strike parameters.
ASW_AIR = {
    "range":    900,   # m — max distance of the target rectangle centre from the ship
    "box":      40,    # m — half-size of the target rectangle the charges scatter in
    "speed":    60,    # m/s — strike plane cruise speed
    "altitude": 80,    # m — release altitude
    "interval": 0.25,  # s between individual charge releases
    "leave":    5.0,   # s the plane keeps flying off-map before despawning
}
# Per-class ASW fit. tier selects the ASW_TIER row. Surface ships (destroyer,
# cruiser) use the close-range hull drop: `min`/`range` clamp the aim band.
# The battleship uses air=true: `range` caps the target rectangle distance
# instead. tier 0 = no ASW.
#   destroyer    = 反潜专精 (tier 2, close-range hull racks)
#   cruiser      = light ASW (tier 1, close-range hull racks)
#   battleship   = air-dropped ASW strike (tier 1)
#   carrier      = none
#   submarine    = none
# Must mirror frontend config.js CLASS_ASW.
CLASS_ASW = {
    "destroyer":   {"tier": 2, "range": 450, "min": 60,  "air": False},
    "cruiser":     {"tier": 1, "range": 320, "min": 50,  "air": False},
    "battleship":  {"tier": 1, "range": 900, "min": 120, "air": True},
    "carrier":     {"tier": 0, "range": 0,   "min": 0,   "air": False},
    "submarine":   {"tier": 0, "range": 0,   "min": 0,   "air": False},
}

def get_class_asw(ship_class):
    """Resolve a ship class's ASW fit. Returns None when the class has no ASW."""
    if not ship_class:
        return None
    fit = CLASS_ASW.get(ship_class)
    if not fit or not fit.get("tier"):
        return None
    return fit

# ---- Per-class submarine detection (对潜索敌) ----
# When an AI ship's target is a submarine, this table replaces the generic
# ENEMY_DETECT_RANGE, so stealth depends on who is looking:
#   destroyer  = 反潜特化：声纳优势，对潜索敌距离加大
#   cruiser    = 削弱：只在较近的距离上才发现潜艇
#   battleship = 削弱：对潜几乎盲目，潜艇可贴身雷击
# Classes not listed (and class-less hulls) fall back to the caller's base
# detection range (get_sub_detect_range returns None).
# Must mirror frontend config.js SUB_DETECT_RANGE.
SUB_DETECT_RANGE = {
    "destroyer":  1000,
    "cruiser":    400,
    "battleship": 300,
}

def get_sub_detect_range(ship_class):
    """对潜索敌距离；该舰种无专门配置时返回 None（调用方回退基础索敌距离）。"""
    if not ship_class:
        return None
    return SUB_DETECT_RANGE.get(ship_class)

def get_asw_tier(tier):
    """Resolve an ASW tier's stats (tier 0 / None -> no ASW, returns None)."""
    if not tier:
        return None
    return ASW_TIER.get(tier)

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
        4:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 4, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 1},
        5:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 4, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 1},
        6:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 5, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        7:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 5, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        8:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 6, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        9:  {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 6, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
        10: {"hp_mul": 0.6,  "speed_mul": 1.4, "turn_mul": 0.7, "damage_mul": 0.7, "cooldown_mul": 1.0, "torpedo_tiers": [1, 2, 3], "torpedo_tubes": 8, "size_mul": 0.55, "length_mul": 1.28, "turret_mul": 0.75, "spacing_mul": 0.7, "barrels": 2},
    },
    "cruiser": {
        4:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 1},
        5:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 1},
        6:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 2, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        7:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 3, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        8:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 3, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        9:  {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 4, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
        10: {"hp_mul": 1.0, "speed_mul": 1.0, "turn_mul": 1.0, "damage_mul": 1.3, "cooldown_mul": 0.7, "torpedo_tiers": [1], "torpedo_tubes": 4, "size_mul": 0.85, "length_mul": 1.22, "turret_mul": 1.0, "spacing_mul": 0.85, "barrels": 2},
    },
    # Battleship: Lv6-7 double turrets; Lv8-10 triple turrets in A-B-X layout
    # (2 front + 1 back). The layout override keeps total DPM constant via the
    # equivalent-barrels factor applied in get_class_config().
    "battleship": {
        4:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 1},
        5:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 1},
        6:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 2},
        7:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 2},
        8:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 1},
        9:  {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 1},
        10: {"hp_mul": 1.4, "speed_mul": 0.7, "turn_mul": 1.4, "damage_mul": 3.075, "cooldown_mul": 1.2, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.0, "length_mul": 1.18, "turret_mul": 1.0, "spacing_mul": 1.0, "barrels": 3, "front_turrets": 2, "back_turrets": 2},
    },
    # Submarine: very fragile, slow on the surface, relies on torpedoes.
    # A single deck gun (front_turrets=1, back_turrets=0) keeps DPM low.
    # Note: get_class_config() holds salvo DPM constant vs the BASE_TURRET_COUNT
    # reference (4 single barrels at Lv4), so a 1-turret ship gets a 4x per-shot
    # damage multiplier. damage_mul is set low (0.1) so the resulting single-gun
    # DPM (~0.4x of a base destroyer gun) stays clearly inferior — the deck gun
    # is a defensive peashooter, not a main weapon. Mid/long-range torpedo tiers
    # only. Surface speed is the class multiplier here; underwater speed is
    # handled in stage 2 (dive mechanic) — stage 1 uses surface speed only.
    "submarine": {
        4:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 4, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        5:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 4, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        6:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 4, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        7:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 5, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        8:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 5, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        9:  {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 6, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
        10: {"hp_mul": 0.4, "speed_mul": 0.6, "turn_mul": 0.6, "damage_mul": 0.1, "cooldown_mul": 1.0, "torpedo_tiers": [2, 3], "torpedo_tubes": 6, "size_mul": 0.5, "turret_mul": 0.5, "spacing_mul": 0.7, "barrels": 1, "front_turrets": 1, "back_turrets": 0},
    },
    # Carrier: tough hull (2nd to battleship), slow & unwieldy, weak
    # self-defense guns, no torpedoes. Its real power is aircraft (stage 3);
    # stage 1 ships it as a heavy, under-armed platform so it can be picked and
    # fought while the aircraft system is built out.
    "carrier": {
        4:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        5:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        6:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        7:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        8:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        9:  {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
        10: {"hp_mul": 1.2, "speed_mul": 0.6, "turn_mul": 1.5, "damage_mul": 0.4, "cooldown_mul": 1.0, "torpedo_tiers": [], "torpedo_tubes": 0, "size_mul": 1.1, "turret_mul": 0.8, "spacing_mul": 1.0, "barrels": 1},
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

LEVEL_THRESHOLDS = [0, 5, 15, 43, 103, 207, 343, 532, 740, 1028]


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
        # length_mul stretches the hull (width/height untouched) — slim, long
        # destroyer/cruiser hulls; mirrors frontend CLASS_CONFIG lengthMul.
        "length": round(base["length"] * sm * cc.get("length_mul", 1.0)),
        "width": round(base["width"] * sm, 1),
        "height": round(base["height"] * sm, 1),
        "torpedo_tiers": cc["torpedo_tiers"],
        "torpedo_tubes": cc["torpedo_tubes"],
        "turret_mul": cc.get("turret_mul", 1.0),
        "barrels": barrels,
        # AA/ASW/secondary fit for this class. Resolved here so callers
        # (ServerShip, game_state fire loops, snapshots) read one place. Each
        # is a {tier, mounts/range} dict or None.
        "aa": get_class_aa(ship_class),
        "asw": get_class_asw(ship_class),
        "secondary": get_class_secondary(ship_class),
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
