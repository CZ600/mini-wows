// End-to-end check: feed turret.js's calcBallisticAngles pitch into the SAME
// integrator projectile.js runs, measure the landing-point error.

const GRAVITY = 9.8;
const MUZZLE = { destroyer: 346.85, cruiser: 284.44, battleship: 227.45 };
const DRAG   = { destroyer: 0.150,  cruiser: 0.060,  battleship: 0.030 };

const { calcBallisticAngles } = await import('../frontend/src/game/turret.js');

// Mirror projectile.js update() exactly (it uses a fixed-step integration).
function liveIntegratorRange(pitch, muzzleSpeed, drag, dt = 0.016) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  let lastX = 0, lastY = 0;
  for (let i = 0; i < 200000; i++) {
    const f = 1 - drag * dt;
    vx *= f;
    vy = vy * f - GRAVITY * dt;
    lastX = x; lastY = y;
    x += vx * dt;
    y += vy * dt;
    if (y <= 0 && i > 0) {
      // Linear-interp the crossing x (projectile.js just uses y<=0 as the hit
      // trigger; the splash is at the post-step position, so report that x).
      return x;
    }
  }
  return x;
}

console.log('End-to-end: aim distance -> pitch from calcBallisticAngles -> live landing');
console.log('class,      target,  solvedPitch, landedRange,  error');
let worst = 0;
for (const cls of ['battleship', 'cruiser', 'destroyer']) {
  const m = MUZZLE[cls], d = DRAG[cls];
  for (const target of [200, 500, 800, 1200, 1600, 2000, 2400]) {
    const origin = { x: 0, y: 0, z: 0 };
    const tgt = { x: 0, y: 0, z: target };
    const { pitch } = calcBallisticAngles(origin, tgt, 0, m, d);
    const landed = liveIntegratorRange(pitch, m, d);
    const err = landed - target;
    worst = Math.max(worst, Math.abs(err));
    console.log(`  ${cls.padEnd(10)} ${String(target).padStart(5)}  ${(pitch*180/Math.PI).toFixed(3).padStart(8)}deg  ${landed.toFixed(1).padStart(10)}m  ${(err>=0?'+':'')+err.toFixed(1)}`);
  }
  console.log('');
}
console.log(`Worst absolute error across all classes/ranges: ${worst.toFixed(1)} m`);
