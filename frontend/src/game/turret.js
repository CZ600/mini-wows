import * as THREE from 'three';

const GRAVITY = 9.8;
const INITIAL_SPEED = 200;
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

export function calcBallisticAngles(origin, target, shipHeading) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const dy = target.y - origin.y;
  const horizDist = Math.sqrt(dx * dx + dz * dz);

  if (horizDist < 1) {
    return { yaw: 0, pitch: Math.PI / 4 };
  }

  const v2 = INITIAL_SPEED * INITIAL_SPEED;
  const v4 = v2 * v2;
  const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);

  let pitch;
  if (disc < 0) {
    pitch = Math.PI / 4;
  } else {
    pitch = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
  }

  pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, pitch));

  pitch = compensateDragPitch(pitch, horizDist, INITIAL_SPEED);

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

export function getTurretFireData(turret, shipHeading) {
  const totalYaw = shipHeading + turret.currentYaw;
  const pitch = turret.currentPitch;
  const dirX = Math.sin(totalYaw) * Math.cos(pitch);
  const dirY = Math.sin(pitch);
  const dirZ = Math.cos(totalYaw) * Math.cos(pitch);

  const muzzle = new THREE.Vector3(0, 0, turret.barrelLen);
  turret.barrelPivot.localToWorld(muzzle);

  return { origin: muzzle, direction: { x: dirX, y: dirY, z: dirZ } };
}
