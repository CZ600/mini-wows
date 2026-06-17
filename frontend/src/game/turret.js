import * as THREE from 'three';
import { PROJECTILE_INITIAL_SPEED, getMuzzleSpeed } from './config.js';

const GRAVITY = 9.8;
const INITIAL_SPEED = PROJECTILE_INITIAL_SPEED;
const DRAG = 0.06;
const MAX_YAW_SPEED = Math.PI / 3;
const MIN_PITCH = 0;
const MAX_PITCH = 60 * Math.PI / 180;

export function compensateDragPitch(pitch, horizDist, muzzleSpeed) {
  if (horizDist < 1 || muzzleSpeed <= 0) return pitch;
  const flightTimeEst = horizDist / muzzleSpeed;
  const dragLoss = DRAG * flightTimeEst * 0.5;
  return pitch + dragLoss * 0.4;
}

export function calcBallisticAngles(origin, target, shipHeading, muzzleSpeed = INITIAL_SPEED) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const horizDist = Math.sqrt(dx * dx + dz * dz);

  if (horizDist < 1) {
    return { yaw: 0, pitch: Math.PI / 4 };
  }

  const v2 = muzzleSpeed * muzzleSpeed;
  const v4 = v2 * v2;
  const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);

  let pitch;
  if (disc < 0) {
    pitch = Math.PI / 4;
  } else {
    pitch = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
  }

  pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));

  pitch = compensateDragPitch(pitch, horizDist, muzzleSpeed);

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

  // Per-class muzzle speed: barrels must point along the same trajectory the
  // server fires, otherwise the gun elevation won't match the actual shell arc.
  const muzzleSpeed = getMuzzleSpeed(ship.shipClass);

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
    const { yaw, pitch } = calcBallisticAngles(_aimOrigin, aimTarget, ship.heading, muzzleSpeed);

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
