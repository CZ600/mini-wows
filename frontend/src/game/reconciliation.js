import { SNAP_THRESHOLD, SNAP_LERP_SPEED } from './config.js';

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

  if (Math.abs(ship.speed) > 0.5) {
    const turnRate = ship.speed / ship.turn_radius;
    if (keys.a) ship.heading += turnRate * dt;
    if (keys.d) ship.heading -= turnRate * dt;
  }

  ship.pos_x += Math.sin(ship.heading) * ship.speed * dt;
  ship.pos_z += Math.cos(ship.heading) * ship.speed * dt;
  ship.pos_x = Math.max(-MAP_HALF, Math.min(MAP_HALF, ship.pos_x));
  ship.pos_z = Math.max(-MAP_HALF, Math.min(MAP_HALF, ship.pos_z));
}
