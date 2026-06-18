// Check how much target height (dy) actually matters for the aim pitch.
// If the error from ignoring dy is below spread, we can safely use a flat
// table and skip the dy correction. If not, we need a dy-aware solver.

const GRAVITY = 9.8;
const MUZZLE = { battleship: 227.45, cruiser: 284.44, destroyer: 346.85 };
const DRAG   = { battleship: 0.030,  cruiser: 0.060,  destroyer: 0.150 };

function simulate(pitch, m, d, dt = 0.01) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * m;
  let vy = Math.sin(pitch) * m;
  for (let i = 0; i < 200000; i++) {
    const f = 1 - d * dt;
    vx *= f;
    vy = vy * f - GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    if (y <= 0 && i > 0) return { x, y, vx, vy };
  }
  return { x, y, vx, vy };
}

function solvePitch(distTarget, dyTarget, m, d, dt = 0.01) {
  // Find pitch whose shell crosses y=dyTarget at x=distTarget.
  // Integrate until y <= dyTarget, interpolate x at crossing.
  let lo = 0.0001, hi = Math.PI / 2 - 0.0001;
  const crossX = (pitch) => {
    let x = 0, y = 0, px = 0;
    let vx = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
    for (let i = 0; i < 200000; i++) {
      const f = 1 - d * dt;
      vx *= f; vy = vy * f - GRAVITY * dt;
      px = x; x += vx * dt; const py = y; y += vy * dt;
      if (y <= dyTarget && i > 0) {
        const t = (dyTarget - py) / (y - py);
        return px + t * (x - px);
      }
    }
    return 1e9;
  };
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (crossX(mid) < distTarget) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

console.log('How much does dy shift the required pitch? (flat-table pitch vs true pitch)');
console.log('class,      dist, dy,  flatPitch, truePitch, delta(meters at target)');
for (const cls of ['battleship', 'cruiser', 'destroyer']) {
  const m = MUZZLE[cls], d = DRAG[cls];
  for (const dist of [500, 1500, 2500]) {
    for (const dy of [0, -5, 5]) {  // ±5m covers any sea/hull offset
      const flat = solvePitch(dist, 0, m, d);
      const true_ = solvePitch(dist, dy, m, d);
      // range error if we use flat pitch to aim at a dy target
      const landed = simulate(flat, m, d);
      // rough: how far off horizontally
      console.log(`  ${cls.padEnd(10)} ${String(dist).padStart(4)} dy=${String(dy).padStart(2)}  ${(flat*180/Math.PI).toFixed(3)}deg  ${(true_*180/Math.PI).toFixed(3)}deg   ${( (true_-flat)*180/Math.PI).toFixed(3)}deg`);
    }
  }
  console.log('');
}
