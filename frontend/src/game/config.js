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
export const CANNON_MUZZLE_SPEED = {
  destroyer:  346.85,
  cruiser:    284.44,
  battleship: 227.45,
};
export const CANNON_DRAG = {
  destroyer:  0.150,
  cruiser:    0.060,
  battleship: 0.030,
};

export function getMuzzleSpeed(shipClass) {
  if (!shipClass) return PROJECTILE_INITIAL_SPEED;
  return CANNON_MUZZLE_SPEED[shipClass] ?? PROJECTILE_INITIAL_SPEED;
}

export function getCannonDrag(shipClass) {
  if (!shipClass) return PROJECTILE_DRAG;
  return CANNON_DRAG[shipClass] ?? PROJECTILE_DRAG;
}
