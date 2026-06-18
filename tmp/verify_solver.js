// Verify a runtime solver approach: build a (class -> range->pitch) lookup
// table from the actual integration, then linearly interpolate at fire time.
// Confirms the solved pitch lands the shell exactly on the aim distance.

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

function simulateRange(pitch, muzzleSpeed, drag, dt = 0.01) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
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

function solvePitchForRange(targetDist, muzzleSpeed, drag, dt = 0.01) {
  let lo = 0.0001, hi = Math.PI / 2 - 0.0001;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const r = simulateRange(mid, muzzleSpeed, drag, dt);
    if (r < targetDist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// The proposed runtime helper: clamp to max range, interpolate pitch from a
// coarse precomputed table.
function buildPitchTable(muzzleSpeed, drag, step = 100, dt = 0.01) {
  // Find max range first (search the low-arc envelope up to 45deg).
  let maxRange = 0;
  for (let p = 1; p <= 45; p++) {
    const r = simulateRange(p * Math.PI / 180, muzzleSpeed, drag, dt);
    if (r > maxRange) maxRange = r;
  }
  const table = [];
  for (let dist = 0; dist <= maxRange + step; dist += step) {
    table.push({ dist, pitch: solvePitchForRange(dist, muzzleSpeed, drag, dt) });
  }
  return { maxRange, table };
}

function pitchFromTable(targetDist, tbl) {
  if (targetDist >= tbl.maxRange) {
    // Out of range: return the max-range pitch (shell will fall short).
    return tbl.table[tbl.table.length - 1].pitch;
  }
  // Binary search the bracketing entries.
  let lo = 0, hi = tbl.table.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (tbl.table[mid].dist < targetDist) lo = mid;
    else hi = mid;
  }
  const a = tbl.table[lo], b = tbl.table[hi];
  const t = (targetDist - a.dist) / (b.dist - a.dist);
  return a.pitch + t * (b.pitch - a.pitch);
}

console.log('Verifying table+interpolation lands exactly on target:');
console.log('class,      target,  tablePitch, actualRange,   error');
for (const cls of ['battleship', 'cruiser', 'destroyer']) {
  const m = MUZZLE[cls];
  const d = DRAG[cls];
  const tbl = buildPitchTable(m, d);
  console.log(`  (${cls} max range = ${tbl.maxRange.toFixed(1)} m)`);
  for (const target of [100, 500, 847, 1500, 2031, 2500]) {
    const pitch = pitchFromTable(target, tbl);
    const actual = simulateRange(pitch, m, d);
    const err = actual - target;
    console.log(
      `  ${cls.padEnd(10)} ${String(target).padStart(5)}  ${(pitch*180/Math.PI).toFixed(3).padStart(9)}deg  ${actual.toFixed(1).padStart(9)}m  ${(err>=0?'+':'')+err.toFixed(1)}`
    );
  }
  console.log('');
}
