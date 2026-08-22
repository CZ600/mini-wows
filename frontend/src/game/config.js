export const SNAP_THRESHOLD = 0.5;
export const SNAP_LERP_SPEED = 0.25;
export const INTERP_DELAY = 0.1;
export const BASE_MAX_SPEED = 16.67;
export const MAP_HALF = 5000;

// Projectile physics — must mirror game/config.py exactly so client-predicted
// trajectories and barrel aim match the server-authoritative ones.
export const GRAVITY = 9.8;
export const PROJECTILE_INITIAL_SPEED = 200;   // shared baseline / fallback
export const PROJECTILE_MAX_LIFETIME = 20;
export const PROJECTILE_DRAG = 0.06;           // per-second speed decay

// Per-class main-gun muzzle speed + drag. Range falls out of the trajectory
// ballistically (no hard cap): battleship slowest muzzle / least drag (~3 km),
// cruiser middle / middle (~3 km), destroyer fastest / heaviest drag (~2 km).
// Submarine deck gun is a short-range peashooter (low muzzle, heavy drag);
// carrier self-defense guns are mid-range but weak per shot.
export const CANNON_MUZZLE_SPEED = {
  destroyer:  346.85,
  cruiser:    284.44,
  battleship: 227.45,
  submarine:  180.0,
  carrier:    260.0,
};
export const CANNON_DRAG = {
  destroyer:  0.150,
  cruiser:    0.060,
  battleship: 0.030,
  submarine:  0.200,
  carrier:    0.080,
};

export function getMuzzleSpeed(shipClass) {
  if (!shipClass) return PROJECTILE_INITIAL_SPEED;
  return CANNON_MUZZLE_SPEED[shipClass] ?? PROJECTILE_INITIAL_SPEED;
}

export function getCannonDrag(shipClass) {
  if (!shipClass) return PROJECTILE_DRAG;
  return CANNON_DRAG[shipClass] ?? PROJECTILE_DRAG;
}

// ---- Submarine dive mechanic (stage 2) ----
// Submarines toggle between surfaced (depth 0) and submerged (depth > 0).
// While submerged they are invisible to surface units (mesh hidden, no minimap
// blip) and immune to ordinary shells, but cannot fire their deck gun.
export const SUBMARINE = {
  // Underwater speed multiplier applied on top of the class speedMul.
  // Surface speed = BASE_MAX_SPEED * speedMul (0.6); underwater the hull has
  // less drag so it keeps pace — multiply by this.
  underwaterSpeedMul: 1.0,
  // Underwater turning is tighter (rudder bites water on both sides).
  underwaterTurnMul: 0.75,
  // Depth (m below surface) reached when fully submerged. Used for mesh sink
  // animation and for the shell-immunity threshold.
  diveDepth: 4.0,
  // Seconds to complete a surface<->submerge transition. During the transition
  // the boat is at intermediate depth and counts as "partially exposed".
  transitionTime: 1.5,
  // Submerged boats are immune to ordinary shells once deeper than this (m).
  shellImmunityDepth: 1.5,
};

// ---- Carrier aircraft (stage 3) ----
// A carrier player toggles between steering the ship and flying a squadron.
// While flying, the camera follows the squadron (not the ship) and WASD controls
// the lead aircraft directly (no gears/drift). The player drops torpedoes or
// bombs over a target. Aircraft are fast and turn directly but have limited
// ordnance; the carrier itself keeps cruising on autopilot.
//
// Two independent air groups fly in the same squadron: torpedo bombers (鱼雷机)
// and dive bombers (轰炸机). Each has its OWN ammo pool, cooldown, and per-drop
// salvo size — so the player can launch either (button 5/6) and left-click to
// release that group's ordnance. Pools refill slowly while airborne; returning
// to the ship and re-launching tops them back up.
export const CARRIER = {
  // Squadron composition.
  squadronSize: 4,         // aircraft per active squadron (lead + wingmen)
  // Aircraft flight model. Aircraft fly at a fixed altitude and steer directly
  // (no drift model). Speed in m/s; turnRate is the max heading change per
  // second (rad/s). Pitch is implied by altitude (kept constant for a top-down
  // bombing view).
  aircraftSpeed: 50,       // m/s — ~3x a destroyer, aircraft are fast
  aircraftTurnRate: 1.2,   // rad/s — direct steering, agile
  aircraftAltitude: 80,    // m — default cruise height (spawn altitude)
  // Altitude control: W pitches down (dive), S pitches up (climb). The squadron's
  // height is tracked and clamped to [minAlt, maxAlt]. Diving toward the water
  // or terrain risks a crash (see aircraftHp + crash logic). Pitch (nose) tilts
  // with the climb/dive rate so the model reads as flying, not hovering.
  aircraftMaxAlt: 160,     // m — ceiling; S cannot climb above this
  aircraftMinAlt: 2,       // m — floor; below this the squadron is "crashed"
  aircraftClimbRate: 45,   // m/s — how fast W/S change altitude
  aircraftPitchRate: 1.5,  // rad/s — how fast the nose pitches toward climb/dive
  aircraftPitchMax: 0.5,   // rad — max nose-up/down tilt (~28°) for the dive feel
  // Aircraft survivability. Each squadron has HP; AA fire depletes it and a
  // crash (terrain/water impact) is instant death (HP -> 0, squadron lost).
  aircraftHp: 100,         // hit points per squadron
  aircraftCrashAlt: 2,     // m — at/below this altitude the squadron crashes
  // Banking (roll) model: when the player turns, the lead aircraft and wingmen
  // roll into the turn like a real plane. `bankRate` caps how fast roll chases
  // the commanded turn; `bankMaxAngle` is the peak roll at full rudder. The
  // visual roll is derived from turn input, not from heading delta, so it
  // reacts instantly to A/D.
  bankMaxAngle: 0.6,       // rad — peak roll (~34°) at full rudder
  bankRate: 4.0,           // rad/s — how quickly roll eases toward target
  // Re-arm at the carrier: ammo only replenishes while the squadron is within
  // `rearmRange` of its carrier hull. `rearmRate` is ammo points per second
  // (applied to whichever pool is below max, torpedo first). Returning to the
  // ship and re-launching (T) instantly tops both pools up (see _toggleCarrierView).
  rearmRange: 250,         // m — must be this close to the carrier to re-arm
  rearmRate: 2.0,          // ammo points / second while in range
  // Auto-pilot (auto-attack) behaviour. When engaged the squadron flies itself:
  // find the nearest enemy within `autoAcquireRange`, fly to it, drop when in
  // range, and return to the carrier to re-arm when out of ammo. Works whether
  // the player is steering the ship or flying manually.
  autoAcquireRange: 2500,  // m — search radius for auto-target acquisition
  autoAttackRange: 350,    // m — drop ordnance when within this of the target
  autoReturnRange: 0,      // (unused; uses rearmRange) kept for clarity
  autoAimTolerance: 0.25,  // rad — heading error below which a drop is allowed
  // Drop parameters shared by both groups.
  torpedoTier: 2,          // aircraft torpedoes use tier-2 stats
  bombWeaponType: 'bomb',  // marker so it's not treated as a shell
  bombMuzzleSpeed: 60,     // (legacy) bomb fall speed — kept for server compat
  bombDrag: 0.02,          // bomb air drag
  bombDropVy: 30,          // m/s initial downward kick on a released bomb.
                           // Bombs ALSO inherit the plane's forward ground
                           // speed, so together this yields a ballistic arc
                           // (forward throw + gravity) instead of a straight drop.
  // Bomb scatter: each bomb of a salvo is aimed at a random point inside a
  // uniform disc of this radius (m) centred on the predicted impact — the
  // drop reticle drawn below. Must mirror game/config.py bomb_scatter_radius.
  bombScatterRadius: 8,
  // Aim-assist guide lengths (used by the projection line / drop reticle).
  torpedoGuideRange: 600,  // m — how far ahead the torpedo track preview draws
  // Aircraft-torpedo damage multiplier. Air-dropped torpedoes hit harder than
  // ship-launched ones of the same tier (they must survive AA flak to deliver
  // and the drop run is easy to dodge) — 1.5x rebalance: bombs were tuned down
  // to 60% in the same pass. Must mirror game/config.py CARRIER
  // air_torpedo_damage_mul.
  airTorpedoDamageMul: 1.5,
  // Auto-respawn: a squadron SHOT DOWN by AA fire re-launches from its carrier
  // after this delay (crashes still need a manual T re-launch). The solo
  // engine drives the player's wing; the wave-based enemy air groups respawn
  // on their own spawn timer. Must mirror game/config.py CARRIER
  // squadron_respawn_delay.
  squadronRespawnDelay: 12,  // s
  // View transition.
  viewSwitchTime: 0.8,     // s to blend camera between ship and squadron
  // Per-level air-group balance. Torpedo bombers fire a 4-ordnance salvo per
  // drop. Dive bombers drop a SCATTERED salvo: 8 bombs at reduced per-bomb
  // damage, each aimed at a random point inside the drop reticle (see
  // bombScatterRadius) — many small hits instead of the old all-or-nothing
  // line abreast, so a single drop connects far more often. Bomber per-bomb
  // damage was rebalanced to 60% of the pre-flak value (aircraft now face
  // enemy AA fire; the damage moved to the torpedo group via
  // CARRIER.airTorpedoDamageMul = 1.5). Bomber ammo pools are counted in bombs
  // and doubled to keep the number of drops unchanged. Each group has: salvoSize
  // (how many bombs/torpedoes release per click), cooldown (s between
  // releases), per-shot damage, and ammo pool size. Must mirror
  // game/config.py AIR_GROUP exactly.
  airGroup: {
    // lvl: { torpedo: {salvo, cd, dmg, ammo}, bomber: {salvo, cd, dmg, ammo} }
    4:  { torpedo: { salvo: 4, cd: 3.5, dmg: 150, ammo: 16 }, bomber: { salvo: 8, cd: 4.0, dmg: 150, ammo: 32 } },
    5:  { torpedo: { salvo: 4, cd: 3.3, dmg: 165, ammo: 18 }, bomber: { salvo: 8, cd: 3.8, dmg: 168, ammo: 36 } },
    6:  { torpedo: { salvo: 4, cd: 3.0, dmg: 180, ammo: 20 }, bomber: { salvo: 8, cd: 3.6, dmg: 186, ammo: 40 } },
    7:  { torpedo: { salvo: 4, cd: 2.8, dmg: 195, ammo: 22 }, bomber: { salvo: 8, cd: 3.4, dmg: 207, ammo: 44 } },
    8:  { torpedo: { salvo: 4, cd: 2.6, dmg: 210, ammo: 24 }, bomber: { salvo: 8, cd: 3.2, dmg: 228, ammo: 48 } },
    9:  { torpedo: { salvo: 4, cd: 2.4, dmg: 230, ammo: 26 }, bomber: { salvo: 8, cd: 3.0, dmg: 252, ammo: 52 } },
    10: { torpedo: { salvo: 4, cd: 2.2, dmg: 250, ammo: 28 }, bomber: { salvo: 8, cd: 2.8, dmg: 276, ammo: 56 } },
  },
};

// Resolve the air-group balance row for a given carrier level (clamped to the
// nearest defined level; carriers are always level >= 4).
export function getAirGroupConfig(level) {
  const table = CARRIER.airGroup;
  const defined = Object.keys(table).map(Number).sort((a, b) => a - b);
  let lvl = Math.max(4, Math.min(10, level || 4));
  // Clamp to the closest defined level <= lvl (fall back to nearest if above 10).
  let best = defined[0];
  for (const l of defined) {
    if (l <= lvl) best = l;
  }
  return table[best];
}

// ---- Secondary battery (side guns) — must mirror game/config.py SECONDARY /
// CLASS_SECONDARY ----
// Secondaries are small-calibre dual-purpose turrets along both beams of
// cruisers/battleships: a player-switchable (Q) damage supplement to the main
// battery. Lower per-shell damage & faster reload than the main guns, flatter
// faster shell (small calibre), mounted in the side battery positions.
export const SECONDARY = {
  muzzleSpeed: 320.0,
  drag: 0.09,
  damage: 40,
  cooldown: 3.0,
};

// Per-class secondary fit. mounts = total casemate turrets (split evenly fore
// and aft along both beams); barrels = guns per turret. Destroyers carry none
// (their beam turrets stay AA mounts).
export const CLASS_SECONDARY = {
  cruiser:     { mounts: 4, barrels: 2 },
  battleship:  { mounts: 6, barrels: 2 },
};

export function getClassSecondary(shipClass) {
  if (!shipClass) return null;
  const fit = CLASS_SECONDARY[shipClass];
  if (!fit || !fit.mounts) return null;
  return fit;
}

// ---- Anti-air (AA) flak — must mirror game/config.py AA_TIER / AA_DRAG /
// AA_HIT_RADIUS / CLASS_AA ----
// AA is an automatic point-defense: ships with AA mounts fire `weapon='flak'`
// shells at the nearest enemy squadron in range. Values must match the server
// exactly so client-predicted flak hits line up with the authoritative ones.
export const AA_TIER = {
  1: { range: 700,  muzzleSpeed: 180.0, damage: 6,  cooldown: 1.5 },
  2: { range: 1000, muzzleSpeed: 220.0, damage: 8,  cooldown: 1.2 },
};
export const AA_DRAG = 0.10;
// Tight proximity radius (mirrors game/config.py): long-range flak mostly
// misses, keeping the aircraft approach survivable.
export const AA_HIT_RADIUS = 15.0;

export function getAaTier(tier) {
  if (!tier) return null;
  return AA_TIER[tier] ?? null;
}

// Per-class AA fit. mirror game/config.py CLASS_AA.
export const CLASS_AA = {
  destroyer:   { tier: 1, mounts: 4 },
  cruiser:     { tier: 2, mounts: 8 },
  battleship:  { tier: 2, mounts: 10 },
  carrier:     { tier: 2, mounts: 8 },
  submarine:   { tier: 0, mounts: 0 },
};

export function getClassAa(shipClass) {
  if (!shipClass) return null;
  const fit = CLASS_AA[shipClass];
  if (!fit || !fit.tier) return null;
  return fit;
}

// ---- Anti-submarine warfare (ASW) depth charges — must mirror game/config.py
// ASW_TIER / ASW_MUZZLE_SPEED / ASW_DRAG / ASW_FUSE_DELAY / ASW_BLAST_RADIUS /
// ASW_AIR / CLASS_ASW ----
// ASW is a CLOSE-RANGE drop. Destroyers/cruisers release a spread of depth
// charges into a nearby water band (aim clamped to [min, range]; a fan/sector
// indicator mirrors the band on screen). Charges splash, float for
// ASW_FUSE_DELAY seconds, then detonate with a large AoE that ONLY damages
// submarines. Battleships call an air strike instead: mark a rectangle on the
// water, a plane flies out from over the ship and scatters charges across it.
export const ASW_TIER = {
  1: { damage: 320, cooldown: 6.0, salvo: 6, spread: 35 },
  2: { damage: 460, cooldown: 5.0, salvo: 8, spread: 40 },
};
export const ASW_MUZZLE_SPEED = 110.0;
export const ASW_DRAG = 0.06;
export const ASW_FUSE_DELAY = 3.0;   // s a charge floats before detonating
export const ASW_BLAST_RADIUS = 100.0;
export const ASW_AIR = {
  range: 900,     // m — max target-rectangle distance from the ship
  box: 40,        // m — half-size of the target rectangle
  speed: 60,      // m/s — strike plane cruise speed
  altitude: 80,   // m — release altitude
  interval: 0.25, // s between charge releases
  leave: 5.0,     // s the plane flies on before despawning
};

export function getAswTier(tier) {
  if (!tier) return null;
  return ASW_TIER[tier] ?? null;
}

// Per-class ASW fit. Destroyer/cruiser hull racks clamp the aim point into the
// [min, range] close-drop band; the battleship (air=true) marks a target
// rectangle within `range` instead. mirror game/config.py CLASS_ASW.
export const CLASS_ASW = {
  destroyer:   { tier: 2, range: 450, min: 60,  air: false },
  cruiser:     { tier: 1, range: 320, min: 50,  air: false },
  battleship:  { tier: 1, range: 900, min: 120, air: true },
  carrier:     { tier: 0, range: 0,   min: 0,   air: false },
  submarine:   { tier: 0, range: 0,   min: 0,   air: false },
};

export function getClassAsw(shipClass) {
  if (!shipClass) return null;
  const fit = CLASS_ASW[shipClass];
  if (!fit || !fit.tier) return null;
  return fit;
}

// ---- Per-class submarine detection (对潜索敌) — must mirror game/config.py ----
// When an AI ship's target is a submarine, this table replaces the generic
// detection range, so sub stealth depends on who is looking:
//   destroyer  = 反潜特化：声纳优势，对潜索敌距离加大
//   cruiser    = 削弱：只在较近的距离上才发现潜艇
//   battleship = 削弱：对潜几乎盲目，潜艇可贴身雷击
// Classes not listed (and class-less hulls) return null and callers fall back
// to their base detection range (solo ENEMY_DETECT_RANGE / team DETECT_RANGE).
export const SUB_DETECT_RANGE = {
  destroyer:  1000,
  cruiser:    400,
  battleship: 300,
};

export function getSubDetectRange(shipClass) {
  if (!shipClass) return null;
  return SUB_DETECT_RANGE[shipClass] ?? null;
}

// Clamp an aim point into a fit's drop band (surface hull drop): distance from
// the ship lands in [fit.min, fit.range] along the same bearing. Returns the
// clamped point. (Battleship air strikes only clamp to fit.range.)
export function clampAswAim(shipPos, aim, fit) {
  const dx = aim.x - shipPos.x;
  const dz = aim.z - shipPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const max = fit.range;
  const min = fit.min || 0;
  if (dist > max) {
    if (dist === 0) return { x: shipPos.x + max, z: shipPos.z };
    const s = max / dist;
    return { x: shipPos.x + dx * s, z: shipPos.z + dz * s };
  }
  if (!fit.air && dist < min) {
    if (dist === 0) return { x: shipPos.x, z: shipPos.z + min };
    const s = min / dist;
    return { x: shipPos.x + dx * s, z: shipPos.z + dz * s };
  }
  return { x: aim.x, z: aim.z };
}
