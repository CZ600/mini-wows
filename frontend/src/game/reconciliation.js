import { SNAP_THRESHOLD, SNAP_LERP_SPEED } from './config.js';
import { getDriftConfig } from './ship.js';

const _tmpVec = { x: 0, z: 0 };

export function reconcile(localShip, serverSnap, pendingInputs) {
  const dx = serverSnap.x - localShip.pos_x;
  const dz = serverSnap.z - localShip.pos_z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  if (dist <= SNAP_THRESHOLD) {
    // Within tolerance, keep local prediction
    return;
  }

  // Reset to server state
  localShip.pos_x = serverSnap.x;
  localShip.pos_z = serverSnap.z;
  localShip.heading = serverSnap.h;
  localShip.velocityHeading = serverSnap.vh ?? serverSnap.h;
  localShip.speed = serverSnap.spd;
  localShip.hp = serverSnap.hp;

  // Re-apply all unconfirmed inputs
  for (const input of pendingInputs) {
    if (input.type === 'input') {
      applyInput(localShip, input.k, 1.0 / 20); // DT = 0.05
    }
  }
}

function applyInput(ship, keys, dt) {
  const ACCEL = 16.67 / 20;
  const DECEL_FRICTION = 0.98;
  const MAP_HALF = 5000;

  if (keys.w) ship.speed += ACCEL * dt;
  if (keys.s) ship.speed -= ACCEL * dt;
  if (!keys.w && !keys.s) {
    ship.speed *= DECEL_FRICTION;
    if (Math.abs(ship.speed) < 0.1) ship.speed = 0;
  }
  ship.speed = Math.max(-ship.max_speed * 0.3, Math.min(ship.max_speed, ship.speed));

  if (typeof ship.velocityHeading !== 'number') {
    ship.velocityHeading = ship.heading;
  }

  if (Math.abs(ship.speed) > 0.5) {
    const turnRate = ship.speed / ship.turn_radius;
    if (keys.a) ship.heading += turnRate * dt;
    if (keys.d) ship.heading -= turnRate * dt;
  }

  // Drift
  const driftCfg = getDriftConfig(ship.shipClass);
  let diff = ship.heading - ship.velocityHeading;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;

  const speedRatio = Math.abs(ship.speed) <= 0.5 ? 0 : Math.abs(ship.speed) / ship.max_speed;
  const recovery = driftCfg.recovery_base * (1 - speedRatio * (1 - driftCfg.speed_factor));
  const maxStep = recovery * dt;

  if (Math.abs(diff) <= maxStep) {
    ship.velocityHeading = ship.heading;
  } else {
    ship.velocityHeading += Math.sign(diff) * maxStep;
  }

  let finalDiff = ship.heading - ship.velocityHeading;
  while (finalDiff > Math.PI) finalDiff -= 2 * Math.PI;
  while (finalDiff < -Math.PI) finalDiff += 2 * Math.PI;
  if (Math.abs(finalDiff) > driftCfg.max_angle) {
    ship.velocityHeading = ship.heading - Math.sign(finalDiff) * driftCfg.max_angle;
  }

  ship.pos_x += Math.sin(ship.velocityHeading) * ship.speed * dt;
  ship.pos_z += Math.cos(ship.velocityHeading) * ship.speed * dt;
  ship.pos_x = Math.max(-MAP_HALF, Math.min(MAP_HALF, ship.pos_x));
  ship.pos_z = Math.max(-MAP_HALF, Math.min(MAP_HALF, ship.pos_z));
}
