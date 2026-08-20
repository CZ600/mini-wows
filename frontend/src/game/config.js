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

// ---- Submarine homing torpedoes (stage 2) ----
// Submarine-launched torpedoes (tier 2/3) gently steer toward the nearest
// spotted enemy within HOMING_ACQUIRE_RANGE. Turn rate is capped so a skilled
// target can still dodge at close range. Range/damage are slightly weaker than
// straight-running torpedoes to pay for the tracking.
export const HOMING_TORPEDO = {
  acquireRange: 600,     // m — only home on enemies within this radius
  turnRate: 0.35,        // rad/s — max heading correction rate
  damageMul: 0.7,        // homing torpedoes hit softer than dumb ones
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
  // Aim-assist guide lengths (used by the projection line / drop reticle).
  torpedoGuideRange: 600,  // m — how far ahead the torpedo track preview draws
  // View transition.
  viewSwitchTime: 0.8,     // s to blend camera between ship and squadron
  // Per-level air-group balance. Both air groups fire a 4-ordnance salvo per
  // drop and carry a large ammo pool — the carrier's whole point is
  // concentrated alpha from its air wing, so neither per-shot damage nor salvo
  // size is throttled against level. Each group has: salvoSize (how many bombs/
  // torpedoes release per click), cooldown (s between releases), per-shot
  // damage, and ammo pool size. Must mirror game/config.py AIR_GROUP exactly.
  airGroup: {
    // lvl: { torpedo: {salvo, cd, dmg, ammo}, bomber: {salvo, cd, dmg, ammo} }
    4:  { torpedo: { salvo: 4, cd: 3.5, dmg: 150, ammo: 16 }, bomber: { salvo: 4, cd: 4.0, dmg: 500, ammo: 16 } },
    5:  { torpedo: { salvo: 4, cd: 3.3, dmg: 165, ammo: 18 }, bomber: { salvo: 4, cd: 3.8, dmg: 560, ammo: 18 } },
    6:  { torpedo: { salvo: 4, cd: 3.0, dmg: 180, ammo: 20 }, bomber: { salvo: 4, cd: 3.6, dmg: 620, ammo: 20 } },
    7:  { torpedo: { salvo: 4, cd: 2.8, dmg: 195, ammo: 22 }, bomber: { salvo: 4, cd: 3.4, dmg: 690, ammo: 22 } },
    8:  { torpedo: { salvo: 4, cd: 2.6, dmg: 210, ammo: 24 }, bomber: { salvo: 4, cd: 3.2, dmg: 760, ammo: 24 } },
    9:  { torpedo: { salvo: 4, cd: 2.4, dmg: 230, ammo: 26 }, bomber: { salvo: 4, cd: 3.0, dmg: 840, ammo: 26 } },
    10: { torpedo: { salvo: 4, cd: 2.2, dmg: 250, ammo: 28 }, bomber: { salvo: 4, cd: 2.8, dmg: 920, ammo: 28 } },
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

// ---- Anti-air (AA) flak — must mirror game/config.py AA_TIER / AA_DRAG /
// AA_HIT_RADIUS / CLASS_AA ----
// AA is an automatic point-defense: ships with AA mounts fire `weapon='flak'`
// shells at the nearest enemy squadron in range. Values must match the server
// exactly so client-predicted flak hits line up with the authoritative ones.
export const AA_TIER = {
  1: { range: 700,  muzzleSpeed: 180.0, damage: 8,  cooldown: 1.2 },
  2: { range: 1000, muzzleSpeed: 220.0, damage: 12, cooldown: 0.9 },
};
export const AA_DRAG = 0.10;
export const AA_HIT_RADIUS = 25.0;

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
// ASW_TIER / ASW_MUZZLE_SPEED / ASW_DRAG / ASW_BLAST_RADIUS / CLASS_ASW ----
// ASW is an aimed drop: aim at a water point, release a salvo of depth charges
// that arc out and detonate with an AoE that damages submerged submarines (via
// the `weapon='depth_charge'` shell-immunity bypass in projectile.js).
export const ASW_TIER = {
  1: { damage: 320, cooldown: 6.0, salvo: 6, spread: 35 },
  2: { damage: 460, cooldown: 5.0, salvo: 8, spread: 40 },
};
export const ASW_MUZZLE_SPEED = 70.0;
export const ASW_DRAG = 0.06;
export const ASW_BLAST_RADIUS = 60.0;

export function getAswTier(tier) {
  if (!tier) return null;
  return ASW_TIER[tier] ?? null;
}

// Per-class ASW fit. `range` is the max horizontal distance a charge may be
// aimed at (the player's aim point is clamped to it from the ship). mirror
// game/config.py CLASS_ASW. Battleship gets tier-1 ASW so it can defend itself.
export const CLASS_ASW = {
  destroyer:   { tier: 2, range: 700 },
  cruiser:     { tier: 1, range: 550 },
  battleship:  { tier: 1, range: 600 },
  carrier:     { tier: 0, range: 0 },
  submarine:   { tier: 0, range: 0 },
};

export function getClassAsw(shipClass) {
  if (!shipClass) return null;
  const fit = CLASS_ASW[shipClass];
  if (!fit || !fit.tier) return null;
  return fit;
}
