import * as THREE from 'three';

const GRAVITY = 9.8;
const INITIAL_SPEED = 200;
const MAX_YAW_SPEED = Math.PI / 3;
const MIN_PITCH = 0;
const MAX_PITCH = 60 * Math.PI / 180;

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
