// End-to-end verification of the REAL turret.js after the fix.
// Imports calcBallisticAngles from the actual module and feeds its pitch into
// the same integrator projectile.js runs. Reports both horizontal landing
// error (dy=0) and shell height at the aim distance (dy!=0), plus the
// out-of-range cliff behaviour.

import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { calcBallisticAngles } from '../frontend/src/game/turret.js';
import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];
const DT_LIVE = 1/60;

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

// Each class's physical max range (from a 1..45 deg scan) for the cliff test.
function findMaxRange(m, d) {
  let best = 0;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    const r = liveFlatRange(pitch, m, d);
    if (r > best) best = r;
  }
  return best;
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

let worstX = 0, worstY = 0;
console.log('===== FIX VERIFICATION: real turret.js =====\n');

console.log('TEST 1: flat-water aim (dy=0) — horizontal landing error');
let header = true;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const maxRange = findMaxRange(m, d);
  if (header) { console.log(`class        | aim    | pitch     | landed   | err     |  vs old`); header = false; }
  for (const dist of [300, 800, 1500, Math.round(maxRange*0.95)]) {
    const { pitch } = calcBallisticAngles(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,dist), 0, m, d);
    const landed = liveFlatRange(pitch, m, d);
    const err = landed - dist;
    worstX = Math.max(worstX, Math.abs(err));
    console.log(`  ${cls.padEnd(10)} | ${String(dist).padStart(5)} | ${deg(pitch).padStart(8)}° | ${landed.toFixed(0).padStart(7)} | ${(err>=0?'+':'')+err.toFixed(1).padStart(6)} |  (was ~${dist<=1500?'-3 to -5':'+0 to -4'} m in range)`);
  }
}
console.log(`\n>> Worst horizontal error: ${worstX.toFixed(1)} m  (was up to 2956 m near max range)\n`);

console.log('TEST 2: elevated aim (dy>0) — shell height at the aim distance');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const maxRange = findMaxRange(m, d);
  console.log(`\n  [${cls}]`);
  for (const dist of [350, 850, 1500, Math.round(maxRange*0.9)]) {
    for (const dy of [4, 7, 11, 18]) {
      const { pitch } = calcBallisticAngles(new THREE.Vector3(0,0,0), new THREE.Vector3(0,dy,dist), 0, m, d);
      const yAt = liveHeightAtDist(pitch, m, d, dist);
      const err = yAt == null ? null : yAt - dy;
      worstY = Math.max(worstY, Math.abs(err || 0));
      console.log(`    aim=${String(dist).padStart(5)} dy=${String(dy).padStart(3)}  pitch=${deg(pitch).padStart(8)}°  shellY=${(yAt==null?'SHORT':yAt.toFixed(2)).padStart(7)}  err=${(err==null?'NaN':(err>=0?'+':'')+err.toFixed(2))}`);
    }
  }
}
console.log(`\n>> Worst height error: ${worstY.toFixed(2)} m  (was up to 11.7 m)\n`);

console.log('TEST 3: out-of-range cliff — shells should now land near max range, not collapse');
console.log('  class       | aim    | pitch     | landed   | physicalMaxRange');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const maxRange = findMaxRange(m, d);
  for (const dist of [maxRange + 500, maxRange + 2000]) {
    const { pitch } = calcBallisticAngles(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,dist), 0, m, d);
    const landed = liveFlatRange(pitch, m, d);
    console.log(`  ${cls.padEnd(11)} | ${String(Math.round(dist)).padStart(5)} | ${deg(pitch).padStart(8)}° | ${landed.toFixed(0).padStart(7)} | ${maxRange.toFixed(0)}`);
  }
}

console.log(`\n===== SUMMARY =====`);
console.log(`Max horizontal landing error (dy=0): ${worstX.toFixed(1)} m`);
console.log(`Max shell-height error (dy!=0):      ${worstY.toFixed(2)} m`);
console.log(`Both should be within typical dispersion (several metres).`);
