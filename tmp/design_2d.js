// Verify a 2D (range x dy) lookup table gives sub-meter accuracy, with the
// same flat-range resolution (50m) and a coarse dy axis (5m steps over -10..+20).

import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];
const DT_BUILD = 0.005;   // fine step for table build (one-time, cached)
const DT_LIVE = 1/60;     // the live integrator step

// y of shell at z=distTarget, with water-hit undershoot returning -1e9.
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

// Binary-search the pitch whose shell.y == dyTarget at z=distTarget.
function solvePitchForHeight(distTarget, dyTarget, m, d, dt) {
  let lo = 0.0001, hi = Math.PI / 2 - 0.0001;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (heightAtZ(mid, m, d, distTarget, dt) < dyTarget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// Simulate flat range (dy=0) to find max range.
function findMaxRange(m, d) {
  let best = 0, bestP = 0;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    let z = 0, y = 0;
    let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
    for (let i = 0; i < 400000; i++) {
      const f = 1 - d * DT_BUILD;
      vz *= f; vy = vy * f - GRAVITY * DT_BUILD;
      z += vz * DT_BUILD; y += vy * DT_BUILD;
      if (y <= 0 && i > 0) break;
    }
    if (z > best) { best = z; bestP = pitch; }
  }
  return { maxRange: best, maxPitch: bestP };
}

// Build a 2D table: rows = dy samples, cols = range samples.
// Stored as Float64Array of size nDy * nRange, each entry = pitch.
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
  for (let i = 0; i < nDy; i++) {
    for (let j = 0; j < nRange; j++) {
      // For dy=0 row, use the standard range solver (faster, monotonic in range).
      // For other rows, solve pitch for (range, dy).
      const dist = ranges[j], dy = dys[i];
      data[i * nRange + j] = solvePitchForHeight(dist, dy, m, d, DT_BUILD);
    }
  }
  return { maxRange, maxPitch, dys, ranges, nDy, nRange, data };
}

// Bilinear interp to look up pitch.
function pitchFrom2DTable(tbl, dist, dy) {
  const { dys, ranges, nDy, nRange, data } = tbl;
  if (dist >= ranges[ranges.length - 1]) {
    // out of range: clamp to envelope peak
    return tbl.maxPitch;
  }
  // clamp dy to table extent
  const dyC = Math.max(dys[0], Math.min(dys[dys.length - 1], dy));
  // find range bracket
  let jr = 0;
  while (jr < nRange - 1 && ranges[jr + 1] < dist) jr++;
  const jr1 = Math.min(jr + 1, nRange - 1);
  const tr = (dist - ranges[jr]) / (ranges[jr1] - ranges[jr] || 1);
  // find dy bracket
  let id = 0;
  while (id < nDy - 1 && dys[id + 1] < dyC) id++;
  const id1 = Math.min(id + 1, nDy - 1);
  const td = (dyC - dys[id]) / (dys[id1] - dys[id] || 1);
  const p00 = data[id * nRange + jr];
  const p10 = data[id * nRange + jr1];
  const p01 = data[id1 * nRange + jr];
  const p11 = data[id1 * nRange + jr1];
  const p0 = p00 + tr * (p10 - p00);
  const p1 = p01 + tr * (p11 - p01);
  return p0 + td * (p1 - p0);
}

// Live integrator height-at-dist for verification.
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

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('2D table accuracy test (interp pitch -> live integrator height at aim dist)');
console.log('==========================================================================');
let worst = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const tbl = build2DTable(m, d);
  console.log(`\n[${cls}]  maxRange=${tbl.maxRange.toFixed(0)}m  maxPitch=${deg(tbl.maxPitch)}°  table=${tbl.nDy}dy x ${tbl.nRange}range`);
  console.log('  dist    dy     pitch(from table)  shellY@dist   yErr');
  // Probe at NON-grid points to test interpolation
  for (const dist of [350, 850, 1500, Math.round(tbl.maxRange * 0.9)]) {
    for (const dy of [0, 4, 7, 11, 18]) {
      const pitch = pitchFrom2DTable(tbl, dist, dy);
      const yAt = liveHeightAtDist(pitch, m, d, dist);
      const err = yAt == null ? null : yAt - dy;
      worst = Math.max(worst, Math.abs(err || 0));
      console.log(`  ${String(dist).padStart(5)}  ${String(dy).padStart(3)}   ${deg(pitch).padStart(10)}°  ${(yAt==null?'SHORT':yAt.toFixed(2)).padStart(10)}   ${(err==null?'NaN':(err>=0?'+':'')+err.toFixed(2))}`);
    }
  }
}
console.log(`\n>> Worst y-error across all classes/dist/dy: ${worst.toFixed(2)} m`);

console.log('\nOut-of-range behaviour (dist > maxRange):');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const tbl = build2DTable(m, d);
  for (const dist of [tbl.maxRange + 500, tbl.maxRange + 1500]) {
    const pitch = pitchFrom2DTable(tbl, dist, 0);
    let z = 0, y = 0;
    let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
    for (let i = 0; i < 600000; i++) {
      const f = 1 - d * DT_LIVE;
      vz *= f; vy = vy * f - GRAVITY * DT_LIVE;
      z += vz * DT_LIVE; y += vy * DT_LIVE;
      if (y <= 0 && i > 0) break;
    }
    console.log(`  ${cls.padEnd(10)} aim=${String(dist).padStart(5)}  pitch=${deg(pitch).padStart(7)}° (=maxPitch ${deg(tbl.maxPitch)}°)  lands=${z.toFixed(0)}m (=maxRange ${tbl.maxRange.toFixed(0)})`);
  }
}
