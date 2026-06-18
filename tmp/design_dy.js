// Design study: 2D (range x dy) pitch table. For each (muzzle,drag), build a
// table indexed by [flatRange, dy]; at fire time, solve for the pitch that lands
// the shell at (z=horizDist, y=dy). Verify end-to-end error vs the live integrator.

import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];

// Live integrator (1/60, matches projectile.js)
function liveShellTrajectory(pitch, m, d) {
  const dt = 1/60;
  const pts = [];
  let z = 0, y = 0;
  let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - d * dt;
    vz *= f; vy = vy * f - GRAVITY * dt;
    pts.push({ z, y });
    z += vz * dt; y += vy * dt;
    if (y <= 0 && i > 0) { pts.push({ z, y }); break; }
  }
  return pts;
}

// y at z=queryDist via linear interp
function yAtZ(pts, queryDist) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i-1], b = pts[i];
    if (a.z <= queryDist && b.z >= queryDist) {
      const t = (queryDist - a.z) / (b.z - a.z);
      return a.y + t * (b.y - a.y);
    }
  }
  return null; // never reaches
}

// Fine solver: pitch such that shell.y == dyTarget at z = distTarget.
// We integrate the shell and measure its y at z=distTarget (interp between
// samples). The shell is a parabola; y at a given z is monotonic in pitch
// (higher pitch => higher arc => higher y at that z) up to the envelope peak.
function solvePitch(distTarget, dyTarget, m, d, dt = 0.005) {
  const heightAt = (pitch) => {
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
      // shell hit water (y<=0) before reaching target dist: undershoot
      if (y <= 0 && i > 0) return -1e9;
    }
    return -1e9; // never reaches the target dist
  };
  // Binary search: heightAt is monotonically increasing in pitch (low arc).
  let lo = 0.0001, hi = Math.PI / 2 - 0.0001;
  // If even the highest reachable pitch can't get high enough, return hi.
  // If the lowest pitch overshoots (target below ground), return lo.
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (heightAt(mid) < dyTarget) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function findMaxRange(m, d) {
  let best = 0, bestP = 0;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    let z = 0, y = 0;
    let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
    const dt = 0.005;
    for (let i = 0; i < 400000; i++) {
      const f = 1 - d * dt;
      vz *= f; vy = vy * f - GRAVITY * dt;
      z += vz * dt; y += vy * dt;
      if (y <= 0 && i > 0) break;
    }
    if (z > best) { best = z; bestP = pitch; }
  }
  return { maxRange: best, maxPitch: bestP };
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('Verify the per-(dist,dy) solver finds an exact pitch, then live-integrate to confirm.');
console.log('================================================================================');
let worst = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const { maxRange, maxPitch } = findMaxRange(m, d);
  console.log(`\n[${cls}]  maxRange=${maxRange.toFixed(0)}m  maxPitch=${deg(maxPitch)}°`);
  console.log('  dist    dy    solvedPitch   shellY@dist   yErr');
  for (const dist of [300, 800, 1500, Math.round(maxRange * 0.6), Math.round(maxRange * 0.95)]) {
    for (const dy of [0, 3, 6, 10, 15]) {
      const pitch = solvePitch(dist, dy, m, d);
      const pts = liveShellTrajectory(pitch, m, d);
      const yAt = yAtZ(pts, dist);
      const err = yAt == null ? NaN : yAt - dy;
      worst = Math.max(worst, Math.abs(err || 0));
      console.log(`  ${String(dist).padStart(5)}  ${String(dy).padStart(3)}  ${deg(pitch).padStart(9)}°  ${(yAt==null?'SHORT':yAt.toFixed(2)).padStart(10)}   ${(err>=0?'+':'')+(isNaN(err)?'NaN':err.toFixed(2))}`);
    }
  }
}
console.log(`\n>> Worst y-error at aim point: ${worst.toFixed(2)} m`);
