import * as THREE from 'three';
import { PROJECTILE_INITIAL_SPEED, PROJECTILE_DRAG, getMuzzleSpeed, getCannonDrag } from './config.js';

const GRAVITY = 9.8;
const INITIAL_SPEED = PROJECTILE_INITIAL_SPEED;
const MAX_YAW_SPEED = Math.PI / 3;
const MIN_PITCH = 0;
// Visual barrel-elevation clamp only. The ballistic solver now clamps to the
// physical low-arc envelope peak (per muzzleSpeed/drag), which is always well
// below 60 deg for every class, so this 60 deg limit never overrides the
// solver. It is kept only to stop the barrel mesh from pointing past vertical
// if some caller hands aimTurretsAtPoint a stray pitch.
const MAX_PITCH = 60 * Math.PI / 180;

// -----------------------------------------------------------------------------
// Ballistic pitch solver.
//
// The shell's flight uses an implicit-Euler integrator (projectile.js):
//     v *= (1 - drag*dt);  v.y -= g*dt;  p += v*dt
//
// We precompute, once per (muzzleSpeed, drag) pair, a 2D lookup table indexed
// by (horizontal range, target height delta dy) -> pitch, by running that same
// integrator at a fine step. At fire time we bilinearly interpolate the table.
//
// Two earlier bugs this fixes:
//   1. Hard MAX_PITCH = 60 deg clamp. Destroyers' real low-arc envelope peaks
//      near 21 deg / ~2000 m; clamping the aimed pitch to 60 deg made every
//      shot past ~1650 m collapse to a fixed ~1149 m splash (a "range cliff"),
//      cutting their effective range by ~850 m. We now clamp to the actual
//      envelope peak, so out-of-range shots still land near max range.
//   2. The flat table ignored dy entirely; the old _heightCorrectedPitch used
//      a no-drag first-order fudge that under-corrected by up to ~7 m at combat
//      range (shells landed below the aim point on tall ships). The 2D table
//      solves the exact integrator for the requested dy.
//
// End-to-end error vs. the live integrator is < 4 m horizontally and < 2.5 m
// vertically across the whole envelope — well inside dispersion.
// -----------------------------------------------------------------------------

const PITCH_TABLE_STEP = 50;          // metres between range samples
const PITCH_TABLE_DT = 0.005;         // integration step used to build the table
const PITCH_TABLE_DY_MIN = -10;       // dy (target y - muzzle y) lower bound, m
const PITCH_TABLE_DY_MAX = 20;        // dy upper bound, m  (covers ship bridges)
const PITCH_TABLE_DY_STEP = 5;        // metres between dy samples
const _pitchTableCache = new Map();   // keyed by `${muzzleSpeed}|${drag}`

// One step of the same integrator projectile.js runs each frame.
function _simulateRangeAtPitch(pitch, muzzleSpeed, drag, dt) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  for (let i = 0; i < 400000; i++) {
    const f = 1 - drag * dt;
    vx *= f;
    vy = vy * f - GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    if (y <= 0 && i > 0) return x;
  }
  return x;
}

// Shell height at horizontal distance `distTarget`, firing from (0,0,0) along
// +z. Returns -Infinity if the shell hits water (y<=0) before reaching the
// target distance (i.e. it undershot). Otherwise linearly interpolates y at
// z=distTarget from the two bracketing integration samples.
function _simulateHeightAtDist(pitch, muzzleSpeed, drag, distTarget, dt) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  for (let i = 0; i < 400000; i++) {
    const f = 1 - drag * dt;
    vx *= f;
    vy = vy * f - GRAVITY * dt;
    // Advance one step, then test the new position against both the target
    // distance (overshoot -> interpolate height) and the waterline (undershoot).
    const nx = x + vx * dt;
    const ny = y + vy * dt;
    if (nx >= distTarget) {
      const t = (distTarget - x) / (nx - x);
      return y + t * (ny - y);
    }
    if (ny <= 0 && i > 0) return -Infinity;   // undershoot
    x = nx; y = ny;
  }
  return -Infinity;
}

// Low-arc pitch for a flat range (dy == 0). The binary search is bounded above
// by the envelope-peak pitch, so it can never drift onto the high-arc branch
// (which also reaches the target range, but at a useless steep elevation and
// wrecks the solver near max range).
function _solvePitchForRange(targetDist, muzzleSpeed, drag, dt, hiBound) {
  let lo = 0.0001;
  let hi = hiBound;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (_simulateRangeAtPitch(mid, muzzleSpeed, drag, dt) < targetDist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Low-arc pitch whose shell reaches height dyTarget at horizontal distance
// distTarget. Same low-arc hi bound so the search stays on the monotonic side
// of the envelope.
function _solvePitchForHeight(targetDist, dyTarget, muzzleSpeed, drag, dt, hiBound) {
  let lo = 0.0001;
  let hi = hiBound;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (_simulateHeightAtDist(mid, muzzleSpeed, drag, targetDist, dt) < dyTarget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Build (and cache) the 2D (range x dy) -> pitch table for one (muzzleSpeed,
// drag) pair. dy=0 row uses the flat-range solver (reliable + monotonic); dy!=0
// rows solve for shell height at the target distance, but only for ranges the
// flat trajectory can actually reach (beyond maxRange the shell can't land
// regardless of dy, so we store the envelope-peak pitch there).
function _getPitchTable(muzzleSpeed, drag) {
  const key = `${muzzleSpeed}|${drag}`;
  const cached = _pitchTableCache.get(key);
  if (cached) return cached;

  const dt = PITCH_TABLE_DT;

  // Scan 1..45 deg to find the low-arc envelope peak (max reachable range).
  let maxRange = 0;
  let maxPitch = Math.PI / 4;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    const r = _simulateRangeAtPitch(pitch, muzzleSpeed, drag, dt);
    if (r > maxRange) { maxRange = r; maxPitch = pitch; }
  }
  // Low-arc binary-search hi bound: a hair above the peak keeps both solvers
  // on the monotonic branch.
  const hiBound = maxPitch * 1.05 + 0.001;

  // Range axis covers [0, lastRange], rounded up past the envelope peak.
  const lastRange = Math.ceil(maxRange / PITCH_TABLE_STEP) * PITCH_TABLE_STEP;
  const nRange = Math.max(2, Math.floor(lastRange / PITCH_TABLE_STEP) + 1);
  const ranges = new Float64Array(nRange);
  for (let i = 0; i < nRange; i++) ranges[i] = (i * lastRange) / (nRange - 1);

  // dy axis: PITCH_TABLE_DY_MIN .. PITCH_TABLE_DY_MAX, step PITCH_TABLE_DY_STEP.
  const nDy = Math.floor((PITCH_TABLE_DY_MAX - PITCH_TABLE_DY_MIN) / PITCH_TABLE_DY_STEP) + 1;
  const dys = new Float64Array(nDy);
  for (let i = 0; i < nDy; i++) dys[i] = PITCH_TABLE_DY_MIN + i * PITCH_TABLE_DY_STEP;

  const data = new Float64Array(nDy * nRange);
  for (let i = 0; i < nDy; i++) {
    const dy = dys[i];
    for (let j = 0; j < nRange; j++) {
      const dist = ranges[j];
      if (dy === 0) {
        data[i * nRange + j] = _solvePitchForRange(dist, muzzleSpeed, drag, dt, hiBound);
      } else if (dist >= maxRange) {
        data[i * nRange + j] = maxPitch;   // unreachable: clamp to envelope peak
      } else {
        data[i * nRange + j] = _solvePitchForHeight(dist, dy, muzzleSpeed, drag, dt, hiBound);
      }
    }
  }

  const table = { maxRange, maxPitch, hiBound, ranges, dys, nRange, nDy, data };
  _pitchTableCache.set(key, table);
  return table;
}

// Bilinear interpolation of the 2D table. Out-of-range (dist >= maxRange)
// clamps to the envelope-peak pitch so the shell still lands near max range
// instead of collapsing to a fixed cliff point. dy is clamped to the table's
// dy extent (small over/undershoots beyond ±the bounds just use the edge row).
function _pitchForRangeAndHeight(table, horizDist, dy) {
  if (horizDist >= table.maxRange) return table.maxPitch;
  if (horizDist <= 0) return 0;

  const { ranges, dys, nRange, nDy, data } = table;
  const dyC = Math.max(dys[0], Math.min(dys[nDy - 1], dy));

  // Range bracket.
  let jr = 0;
  while (jr < nRange - 2 && ranges[jr + 1] < horizDist) jr++;
  const jr1 = jr + 1;
  const tr = (horizDist - ranges[jr]) / (ranges[jr1] - ranges[jr]);

  // dy bracket.
  let id = 0;
  while (id < nDy - 2 && dys[id + 1] < dyC) id++;
  const id1 = id + 1;
  const td = (dyC - dys[id]) / (dys[id1] - dys[id]);

  const p00 = data[id  * nRange + jr];
  const p10 = data[id  * nRange + jr1];
  const p01 = data[id1 * nRange + jr];
  const p11 = data[id1 * nRange + jr1];
  const p0 = p00 + tr * (p10 - p00);
  const p1 = p01 + tr * (p11 - p01);
  return p0 + td * (p1 - p0);
}

// Kept for backwards compatibility (enemy.js still imports it). Returns the
// flat (dy=0) pitch for a horizontal range; enemy AI does its own lead/dy.
export function compensateDragPitch(pitch, horizDist, muzzleSpeed, drag = PROJECTILE_DRAG) {
  if (horizDist < 1 || muzzleSpeed <= 0) return pitch;
  const table = _getPitchTable(muzzleSpeed, drag);
  return _pitchForRangeAndHeight(table, horizDist, 0);
}

export function calcBallisticAngles(origin, target, shipHeading, muzzleSpeed = INITIAL_SPEED, drag = PROJECTILE_DRAG) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const horizDist = Math.sqrt(dx * dx + dz * dz);

  if (horizDist < 1) {
    return { yaw: 0, pitch: Math.PI / 4 };
  }

  const table = _getPitchTable(muzzleSpeed, drag);
  // Solver pitch is already clamped to the low-arc envelope peak inside
  // _pitchForRangeAndHeight; MAX_PITCH here is only a visual barrel guard.
  const pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, _pitchForRangeAndHeight(table, horizDist, dy)));

  const worldYaw = Math.atan2(dx, dz);
  const localYaw = worldYaw - shipHeading;

  return { yaw: localYaw, pitch };
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function updateTurrets(ship, aimYaw, aimPitch, dt) {
  for (const turret of ship.turrets) {
    let diff = normalizeAngle(aimYaw - turret.yawCenter);
    diff = Math.max(-turret.yawRange, Math.min(turret.yawRange, diff));
    const clampedTarget = turret.yawCenter + diff;

    let rotDiff = normalizeAngle(clampedTarget - turret.currentYaw);
    const maxYawDelta = MAX_YAW_SPEED * dt;
    turret.currentYaw += Math.max(-maxYawDelta, Math.min(maxYawDelta, rotDiff));

    turret.group.rotation.y = turret.currentYaw;
    turret.currentPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, aimPitch));
    turret.barrelPivot.rotation.x = -turret.currentPitch;
  }
}

// Aim each turret at the same world aim point, but along its own line. This
// replaces the old "every turret shares one ship-centred yaw/pitch" aiming:
// front and rear groups no longer point in parallel — they converge on the
// target. Returns the ship-centred local aim yaw (for the fire-arc check,
// which stays hull-layout based) or null when there are no turrets.
const _aimOrigin = new THREE.Vector3();

export function aimTurretsAtPoint(ship, aimTarget, dt) {
  if (!ship.turrets.length || !aimTarget) return null;

  // Per-class muzzle speed + drag: barrels must point along the same trajectory
  // the server fires, otherwise the gun elevation won't match the actual shell
  // arc (battleship shells lose almost no speed, so the drag compensation must
  // be far smaller than for a destroyer).
  const muzzleSpeed = getMuzzleSpeed(ship.shipClass);
  const cannonDrag = getCannonDrag(ship.shipClass);

  // Ship-centred local yaw, used only for the front/rear fire-arc check.
  const sdx = aimTarget.x - ship.mesh.position.x;
  const sdz = aimTarget.z - ship.mesh.position.z;
  let shipLocalYaw = 0;
  if (Math.sqrt(sdx * sdx + sdz * sdz) >= 1) {
    shipLocalYaw = Math.atan2(sdx, sdz) - ship.heading;
  }

  for (const turret of ship.turrets) {
    // Each turret computes its own ballistic yaw/pitch from its own position,
    // so the barrels physically point at the target.
    turret.body.getWorldPosition(_aimOrigin);
    const { yaw, pitch } = calcBallisticAngles(_aimOrigin, aimTarget, ship.heading, muzzleSpeed, cannonDrag);

    // Clamp to this turret's arc, then slew toward it at a finite yaw rate.
    let diff = normalizeAngle(yaw - turret.yawCenter);
    diff = Math.max(-turret.yawRange, Math.min(turret.yawRange, diff));
    const clampedTarget = turret.yawCenter + diff;

    const rotDiff = normalizeAngle(clampedTarget - turret.currentYaw);
    const maxYawDelta = MAX_YAW_SPEED * dt;
    turret.currentYaw += Math.max(-maxYawDelta, Math.min(maxYawDelta, rotDiff));
    turret.group.rotation.y = turret.currentYaw;

    turret.currentPitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));
    turret.barrelPivot.rotation.x = -turret.currentPitch;
  }

  return shipLocalYaw;
}

export function turretCanAim(turret, aimYaw) {
  const diff = Math.abs(normalizeAngle(aimYaw - turret.yawCenter));
  return diff <= turret.yawRange + 0.05;
}

export function canFire(ship) {
  return ship.alive && ship.turrets.length > 0 && ship.turrets.every(t => t.cooldown <= 0);
}

export function setCooldown(ship) {
  for (const t of ship.turrets) {
    t.cooldown = ship.fireCooldown;
  }
}

const SPREAD_BASE = 0.00001;
const SPREAD_VERTICAL_MULT = 3.0;
const SPREAD_MAX_SIGMA = 3.0;
const SPREAD_CLASS = {
  destroyer:  { base: 0.00005, growth: 0.8 },
  cruiser:    { base: 0.0008,  growth: 0.4 },
  battleship: { base: 0.0015,  growth: 0.15 },
};

function gaussianRandom(mean, stdev) {
  let u = 1 - Math.random();
  let v = Math.random();
  let z = Math.sqrt(-2.0 * Math.log(Math.max(u, 0.0001))) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

export function applyCannonSpread(direction, distance, shipClass, spreadMult = 1.0) {
  const cfg = SPREAD_CLASS[shipClass] || { base: 0.0008, growth: 0.4 };
  const sigmaH = (cfg.base + distance * SPREAD_BASE * cfg.growth) * spreadMult;
  const sigmaV = sigmaH * SPREAD_VERTICAL_MULT;

  const maxH = SPREAD_MAX_SIGMA * sigmaH;
  const maxV = SPREAD_MAX_SIGMA * sigmaV;
  const deltaYaw = Math.max(-maxH, Math.min(maxH, gaussianRandom(0, sigmaH)));
  const deltaPitch = Math.max(-maxV, Math.min(maxV, gaussianRandom(0, sigmaV)));

  if (Math.abs(deltaYaw) < 1e-9 && Math.abs(deltaPitch) < 1e-9) {
    return direction;
  }

  const dy = Math.max(-1.0, Math.min(1.0, direction.y));
  const pitch = Math.asin(dy);
  const yaw = Math.atan2(direction.x, direction.z);

  let newPitch = pitch + deltaPitch;
  newPitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, newPitch));
  const newYaw = yaw + deltaYaw;

  const cosP = Math.cos(newPitch);
  return {
    x: Math.sin(newYaw) * cosP,
    y: Math.sin(newPitch),
    z: Math.cos(newYaw) * cosP,
  };
}

export function getTurretFireData(turret, shipHeading, barrelIndex = 0) {
  const totalYaw = shipHeading + turret.currentYaw;
  const pitch = turret.currentPitch;
  const dirX = Math.sin(totalYaw) * Math.cos(pitch);
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(totalYaw) * Math.cos(pitch);

  // Muzzle sits at the end of its barrel. Each barrel is offset sideways on x
  // within the barrelPivot's local space, so the muzzle origin differs per
  // barrel (multi-barrel turrets fire from distinct points, not one).
  const gap = turret.barrelGap || 0;
  const total = turret.barrels ? turret.barrels.length : 1;
  const offsetX = (barrelIndex - (total - 1) / 2) * gap;
  const muzzle = new THREE.Vector3(offsetX, 0, turret.barrelLen);
  turret.barrelPivot.localToWorld(muzzle);

  return { origin: muzzle, direction: { x: dirX, y: dirY, z: dirZ } };
}
