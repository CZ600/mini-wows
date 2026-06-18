// Full end-to-end audit of battleship fire accuracy vs the aim point.
// Mirrors the EXACT code path the player's ship uses:
//   1. aimTarget is a 3D world point (from raycast onto sea/terrain/ship mesh)
//   2. aimTurretsAtPoint -> calcBallisticAngles(origin=ship-turret, target=aimTarget)
//      -> _getPitchTable -> _pitchForRange -> _heightCorrectedPitch(dy)
//   3. fire() launches shell with that pitch; projectile.js integrates:
//        v *= (1-drag*dt); v.y -= g*dt; p += v*dt
//   4. Shell is registered as a hit when its mesh crosses the target OBB.
//      A pure water-aim test measures the splash point (y<=0 trigger).
//
// We measure, ignoring spread:
//   - horizontal landing error along the aim line
//   - how much the dy (height) correction actually offsets the shell
//   - the per-barrel muzzle-x offset effect (multi-barrel turrets)

import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { calcBallisticAngles } from '../frontend/src/game/turret.js';
import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];

// Live integrator mirroring projectile.js (fixed dt=1/60), returning the
// horizontal travel when the shell first crosses y=targetY (water hit at y=0).
function liveLanding(pitch, yaw, muzzleSpeed, drag, dt, targetY) {
  const px = 0, py = 0, pz = 0; // fired from local origin
  let x = px, y = py, z = pz;
  let vx = Math.sin(yaw) * Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  let vz = Math.cos(yaw) * Math.cos(pitch) * muzzleSpeed;
  let lx = x, ly = y;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - drag * dt;
    vx *= f; vy = vy * f - GRAVITY * dt; vz *= f;
    lx = x; ly = y;
    x += vx * dt; y += vy * dt; z += vz * dt;
    if (y <= targetY && i > 0) {
      // projectile.js hits at the post-step position, but measure crossing x for accuracy
      const t = (targetY - ly) / (y - ly);
      const crossX = lx + t * (x - lx);
      const crossZ = z - vz * dt + vz * dt * t;
      return { x, z, crossX, crossZ, dist: Math.hypot(crossX, crossZ) };
    }
  }
  return { x, z, crossX: x, crossZ: z, dist: Math.hypot(x, z) };
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('========================================');
console.log('AUDIT 1: flat-water aim (dy=0), no spread — does the shell hit the aim point?');
console.log('========================================');
let worstFlat = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  console.log(`\n[${cls}]  muzzle=${m} drag=${d}`);
  for (const target of [300, 600, 1000, 1400, 1800, 2200, 2600, 3000]) {
    const origin = new THREE.Vector3(0, 0, 0);
    const aim = new THREE.Vector3(0, 0, target); // dead ahead, water level
    const { yaw, pitch } = calcBallisticAngles(origin, aim, 0, m, d);
    const landed = liveLanding(pitch, yaw, m, d, 1/60, 0);
    const err = landed.dist - target;
    worstFlat = Math.max(worstFlat, Math.abs(err));
    console.log(`  target=${String(target).padStart(5)}  pitch=${deg(pitch).padStart(8)}deg  landed=${landed.dist.toFixed(1).padStart(8)}m  err=${(err>=0?'+':'')+err.toFixed(1)}`);
  }
}
console.log(`\n>> Worst flat-water error: ${worstFlat.toFixed(1)} m`);

console.log('\n========================================');
console.log('AUDIT 2: height correction (dy) — target sits on an enemy ship deck.');
console.log('Player muzzle is ~deck+1+0.15+turretSize*0.4 above water.');
console.log('Enemy hit is the OBB box: y in [ep.y-1, ep.y+bridgeTop].');
console.log('Aim point from raycast is wherever the crosshair ray hits the hull mesh.');
console.log('========================================');
let worstDy = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  console.log(`\n[${cls}]`);
  // Simulate firing at a target that sits at various heights (dy = target.y - origin.y)
  for (const target of [500, 1000, 2000]) {
    for (const dy of [-2, 0, 5, 10, 15]) { // ±15m covers deck/bridge hits
      const origin = new THREE.Vector3(0, 0, 0);
      const aim = new THREE.Vector3(0, dy, target);
      const { pitch } = calcBallisticAngles(origin, aim, 0, m, d);
      const landed = liveLanding(pitch, 0, m, d, 1/60, dy);
      const err = landed.dist - target;
      worstDy = Math.max(worstDy, Math.abs(err));
      console.log(`  target=${String(target).padStart(5)} dy=${String(dy).padStart(3)}  pitch=${deg(pitch).padStart(8)}deg  landed=${landed.dist.toFixed(1).padStart(8)}m  err=${(err>=0?'+':'')+err.toFixed(1)}`);
    }
  }
}
console.log(`\n>> Worst dy-corrected error: ${worstDy.toFixed(1)} m`);

console.log('\n========================================');
console.log('AUDIT 3: pitch clamp (MAX_PITCH=60deg) — shells fall short past max range.');
console.log('========================================');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  // find max range via the table
  const origin = new THREE.Vector3(0, 0, 0);
  let maxFound = 0;
  for (let t = 100; t <= 5000; t += 100) {
    const aim = new THREE.Vector3(0, 0, t);
    const { pitch } = calcBallisticAngles(origin, aim, 0, m, d);
    const landed = liveLanding(pitch, 0, m, d, 1/60, 0);
    if (landed.dist > maxFound) maxFound = landed.dist;
  }
  console.log(`  ${cls.padEnd(10)} effective max range (clamped) ≈ ${maxFound.toFixed(0)} m`);
}
