// Numerical simulator mirroring projectile.js's actual integration:
//   v *= (1 - drag*dt)
//   v.y -= g*dt
//   p += v*dt
// Used to (a) measure where the current aim pitch actually lands, and
// (b) find the pitch that really hits the target, so we can fix the
// drag-compensation without guessing.

const GRAVITY = 9.8;
const MUZZLE = {
  destroyer:  346.85,
  cruiser:    284.44,
  battleship: 227.45,
};
const DRAG = {
  destroyer:  0.150,
  cruiser:    0.060,
  battleship: 0.030,
};

// Integrate the shell fired at `pitch` (radians) over flat ground (target y == origin y).
// Returns the horizontal distance where the shell first goes below y=0, i.e. its range.
function simulateRange(pitch, muzzleSpeed, drag, dt = 0.01) {
  let x = 0;
  let y = 0;
  let vx = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  // Cap iterations to avoid infinite loops on pathological inputs.
  for (let i = 0; i < 200000; i++) {
    const f = 1 - drag * dt;
    vx *= f;
    vy = vy * f - GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    if (y <= 0 && i > 0) return x;
  }
  return x;
}

// Binary search the pitch that yields the desired range.
function solvePitchForRange(targetDist, muzzleSpeed, drag, dt = 0.01) {
  let lo = 0.0001;
  let hi = Math.PI / 2 - 0.0001;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = simulateRange(mid, muzzleSpeed, drag, dt);
    if (r < targetDist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The CURRENT code path: ballistic pitch + compensateDragPitch extra elevation.
function currentCodePitch(targetDist, muzzleSpeed, drag) {
  // calcBallisticAngles (closed-form, no-drag) -> low arc
  const v2 = muzzleSpeed * muzzleSpeed;
  const v4 = v2 * v2;
  const disc = v4 - GRAVITY * (GRAVITY * targetDist * targetDist + 0);
  let pitch;
  if (disc < 0) {
    pitch = Math.PI / 4;
  } else {
    pitch = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * targetDist));
  }
  // compensateDragPitch (after our first fix uses the real per-class drag)
  const flightTimeEst = targetDist / muzzleSpeed;
  const dragLoss = drag * flightTimeEst * 0.5;
  pitch += dragLoss * 0.4;
  return pitch;
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('class,      target,   correctPitch, currentPitch, actualRange@current, overshoot');
for (const cls of ['battleship', 'cruiser', 'destroyer']) {
  const m = MUZZLE[cls];
  const d = DRAG[cls];
  for (const target of [500, 1000, 1500, 2000, 2500]) {
    const correctPitch = solvePitchForRange(target, m, d);
    const currentPitch = currentCodePitch(target, m, d);
    const actualRange = simulateRange(currentPitch, m, d);
    const over = actualRange - target;
    console.log(
      `${cls.padEnd(10)}, ${String(target).padStart(5)}, ${deg(correctPitch).padStart(11)}, ${deg(currentPitch).padStart(12)}, ${actualRange.toFixed(1).padStart(18)}, ${(over >= 0 ? '+' : '') + over.toFixed(1)}`
    );
  }
  console.log('');
}

// Max range check (does the shell even reach 2.5/3km for each class?)
console.log('Max range @ 45deg:');
for (const cls of ['battleship', 'cruiser', 'destroyer']) {
  const m = MUZZLE[cls];
  const d = DRAG[cls];
  console.log(`  ${cls.padEnd(10)}: ${simulateRange(Math.PI/4, m, d).toFixed(1)} m`);
}
