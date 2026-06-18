// Refined 2D table:
//   - dy=0 row uses the existing flat-range solver (reliable, monotonic).
//   - dy!=0 rows use the height-at-z solver, but ONLY for ranges within the
//     flat (dy=0) envelope. Beyond that, the shell can't reach regardless of dy.
//   - Out-of-range queries clamp to the envelope peak (no more 90° garbage).
// Verify accuracy with the live integrator.

import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];
const DT_BUILD = 0.005;
const DT_LIVE = 1/60;

function flatRange(pitch, m, d, dt) {
  let x = 0, y = 0;
  let vx = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  for (let i = 0; i < 400000; i++) {
    const f = 1 - d * dt;
    vx *= f; vy = vy * f - GRAVITY * dt;
    x += vx * dt; y += vy * dt;
    if (y <= 0 && i > 0) return x;
  }
  return x;
}

function solveFlatRange(targetDist, m, d, dt, hiBound) {
  // Low-arc only: hi bound stays below the envelope peak so the search can't
  // run into the high-arc branch (which also reaches the target distance but
  // at a much steeper, useless elevation).
  let lo = 0.0001;
  let hi = hiBound != null ? hiBound : (Math.PI / 2 - 0.0001);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (flatRange(mid, m, d, dt) < targetDist) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function heightAtZ(pitch, m, d, distTarget, dt) {
  let z = 0, y = 0, lz = 0, ly = 0;
  let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  for (let i = 0; i < 400000; i++) {
    const f = 1 - d * dt;
    vz *= f; vy = vy * f - GRAVITY * dt;
    lz = z; ly = y;
    z += vz * dt; y += vy * dt;
    if (z >= distTarget) {
      const t = (distTarget - lz) / (z - lz);
      return ly + t * (y - ly);
    }
    if (y <= 0 && i > 0) return -1e9;
  }
  return -1e9;
}

function solvePitchForHeight(distTarget, dyTarget, m, d, dt, hiBound) {
  // Same low-arc-only bound: keeps the binary search on the monotonic branch.
  let lo = 0.0001;
  let hi = hiBound != null ? hiBound : (Math.PI / 2 - 0.0001);
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtZ(mid, m, d, distTarget, dt) < dyTarget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function findMaxRange(m, d) {
  let best = 0, bestP = 0;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    const r = flatRange(pitch, m, d, DT_BUILD);
    if (r > best) { best = r; bestP = pitch; }
  }
  return { maxRange: best, maxPitch: bestP };
}

function build2DTable(m, d) {
  const DY_MIN = -10, DY_MAX = 20, DY_STEP = 5;
  const RANGE_STEP = 50;
  const { maxRange, maxPitch } = findMaxRange(m, d);
  const lastRange = Math.ceil(maxRange / RANGE_STEP) * RANGE_STEP;
  const nRange = Math.max(2, Math.floor(lastRange / RANGE_STEP) + 1);
  const dys = [];
  for (let dy = DY_MIN; dy <= DY_MAX + 1e-6; dy += DY_STEP) dys.push(dy);
  const nDy = dys.length;
  const ranges = [];
  for (let i = 0; i < nRange; i++) ranges.push((i * lastRange) / (nRange - 1));
  const data = new Float64Array(nDy * nRange);
  // Low-arc hi bound: a hair above the envelope-peak pitch keeps both solvers
  // on the monotonic low-arc branch and away from the high-arc mirror solution.
  const hiBound = maxPitch * 1.05 + 0.001;
  for (let i = 0; i < nDy; i++) {
    for (let j = 0; j < nRange; j++) {
      const dist = ranges[j], dy = dys[i];
      if (dy === 0) {
        // Reliable flat solver
        data[i * nRange + j] = solveFlatRange(dist, m, d, DT_BUILD, hiBound);
      } else {
        // dy solver; ranges beyond flat maxRange -> clamp to maxPitch
        if (dist >= maxRange) {
          data[i * nRange + j] = maxPitch;
        } else {
          data[i * nRange + j] = solvePitchForHeight(dist, dy, m, d, DT_BUILD, hiBound);
        }
      }
    }
  }
  return { maxRange, maxPitch, dys, ranges, nDy, nRange, data };
}

function pitchFrom2DTable(tbl, dist, dy) {
  const { dys, ranges, nDy, nRange, data, maxRange, maxPitch } = tbl;
  if (dist >= maxRange) return maxPitch;   // out of range: clamp to envelope peak
  if (dist <= 0) return 0;
  // clamp dy
  const dyC = Math.max(dys[0], Math.min(dys[dys.length - 1], dy));
  let jr = 0;
  while (jr < nRange - 2 && ranges[jr + 1] < dist) jr++;
  const jr1 = jr + 1;
  const tr = (dist - ranges[jr]) / (ranges[jr1] - ranges[jr] || 1);
  let id = 0;
  while (id < nDy - 2 && dys[id + 1] < dyC) id++;
  const id1 = id + 1;
  const td = (dyC - dys[id]) / (dys[id1] - dys[id] || 1);
  const p00 = data[id * nRange + jr];
  const p10 = data[id * nRange + jr1];
  const p01 = data[id1 * nRange + jr];
  const p11 = data[id1 * nRange + jr1];
  const p0 = p00 + tr * (p10 - p00);
  const p1 = p01 + tr * (p11 - p01);
  return p0 + td * (p1 - p0);
}

function liveHeightAtDist(pitch, m, d, queryDist) {
  let z = 0, y = 0, lz = 0, ly = 0;
  let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - d * DT_LIVE;
    vz *= f; vy = vy * f - GRAVITY * DT_LIVE;
    lz = z; ly = y;
    z += vz * DT_LIVE; y += vy * DT_LIVE;
    if (z >= queryDist) {
      const t = (queryDist - lz) / (z - lz);
      return ly + t * (y - ly);
    }
    if (y <= 0 && i > 0) return null;
  }
  return null;
}

// Also: horizontal landing for dy=0 water test
function liveFlatRange(pitch, m, d) {
  let z = 0, y = 0;
  let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - d * DT_LIVE;
    vz *= f; vy = vy * f - GRAVITY * DT_LIVE;
    z += vz * DT_LIVE; y += vy * DT_LIVE;
    if (y <= 0 && i > 0) return z;
  }
  return z;
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('Refined 2D table: dy=0 uses flat solver, dy!=0 uses height solver within envelope.');
console.log('================================================================');
let worstY = 0, worstX = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const tbl = build2DTable(m, d);
  console.log(`\n[${cls}]  maxRange=${tbl.maxRange.toFixed(0)}m  maxPitch=${deg(tbl.maxPitch)}°  table=${tbl.nDy}dy x ${tbl.nRange}range`);
  // dy=0 -> horizontal range test
  console.log('  --- dy=0 horizontal range test ---');
  for (const dist of [300, 800, 1500, Math.round(tbl.maxRange * 0.95)]) {
    const pitch = pitchFrom2DTable(tbl, dist, 0);
    const landed = liveFlatRange(pitch, m, d);
    const err = landed - dist;
    worstX = Math.max(worstX, Math.abs(err));
    console.log(`  aim=${String(dist).padStart(5)}  pitch=${deg(pitch).padStart(8)}°  landed=${landed.toFixed(1).padStart(8)}m  err=${(err>=0?'+':'')+err.toFixed(1)}`);
  }
  // dy!=0 -> height-at-dist test
  console.log('  --- dy!=0 height-at-aim test ---');
  for (const dist of [350, 850, 1500, Math.round(tbl.maxRange * 0.9)]) {
    for (const dy of [4, 7, 11, 18]) {
      const pitch = pitchFrom2DTable(tbl, dist, dy);
      const yAt = liveHeightAtDist(pitch, m, d, dist);
      const err = yAt == null ? null : yAt - dy;
      worstY = Math.max(worstY, Math.abs(err || 0));
      console.log(`  aim=${String(dist).padStart(5)} dy=${String(dy).padStart(3)}  pitch=${deg(pitch).padStart(8)}°  shellY=${(yAt==null?'SHORT':yAt.toFixed(2)).padStart(8)}  err=${(err==null?'NaN':(err>=0?'+':'')+err.toFixed(2))}`);
    }
  }
}
console.log(`\n>> Worst horizontal error (dy=0): ${worstX.toFixed(1)} m`);
console.log(`>> Worst height error (dy!=0): ${worstY.toFixed(2)} m`);

console.log('\nOut-of-range clamp (should hit ~maxRange):');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const tbl = build2DTable(m, d);
  for (const dist of [tbl.maxRange + 500, tbl.maxRange + 2000]) {
    const pitch = pitchFrom2DTable(tbl, dist, 0);
    const landed = liveFlatRange(pitch, m, d);
    console.log(`  ${cls.padEnd(10)} aim=${String(Math.round(dist)).padStart(5)}  pitch=${deg(pitch).padStart(7)}°  landed=${landed.toFixed(0)}m (maxRange=${tbl.maxRange.toFixed(0)})`);
  }
}
