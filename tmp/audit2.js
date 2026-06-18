// Corrected audit: measure shell height at the aim horizontal distance.
// A hit on a ship's OBB requires the shell's y at x=horizDist to fall within
// [ep.y-1, ep.y+bridgeTop]. For a water-aim target (dy=0) the shell should
// cross y=0 at x=horizDist. For an elevated target, the height-corrected
// pitch should put the shell's y ≈ dy at x=horizDist.

import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { calcBallisticAngles } from '../frontend/src/game/turret.js';
import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];

// Integrate the shell (fired along +z) and return its y at z=horizDist.
function shellHeightAtDist(pitch, muzzleSpeed, drag, dt, queryDist) {
  let z = 0, y = 0;
  let vz = Math.cos(pitch) * muzzleSpeed;
  let vy = Math.sin(pitch) * muzzleSpeed;
  let lz = 0, ly = 0;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - drag * dt;
    vz *= f; vy = vy * f - GRAVITY * dt;
    lz = z; ly = y;
    z += vz * dt; y += vy * dt;
    // stop when shell hits water (y<=0) before reaching target distance
    if (y <= 0 && i > 0) {
      // did we cross queryDist before hitting water? check if lz < queryDist <= z
      if (lz < queryDist && z >= queryDist) {
        const tz = (queryDist - lz) / (z - lz);
        const yAt = ly + tz * (y - ly);
        return { yAtQuery: yAt, landed: false };
      }
      return { yAtQuery: null, landed: true, landZ: z };
    }
    if (z >= queryDist) {
      const tz = (queryDist - lz) / (z - lz);
      const yAt = ly + tz * (y - ly);
      return { yAtQuery: yAt, landed: false };
    }
  }
  return { yAtQuery: null, landed: false };
}

function deg(r) { return (r * 180 / Math.PI).toFixed(3); }

console.log('========================================================');
console.log('AUDIT: shell height at the aim horizontal distance.');
console.log('Target sits at (0, dy, horizDist). Shell fired from (0,0,0) along +z.');
console.log('Desired: shell.y ≈ dy at x = horizDist. Error = shell.y - dy.');
console.log('For a ship hit, dy ∈ [0, ~9] (OBB top). |error| < ~2 m is "on target".');
console.log('========================================================');
let worst = 0;
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  console.log(`\n[${cls}]  muzzle=${m}  drag=${d}`);
  for (const horizDist of [400, 800, 1500, 2500]) {
    for (const dy of [0, 2, 5, 8, 12]) {
      const origin = new THREE.Vector3(0, 0, 0);
      const aim = new THREE.Vector3(0, dy, horizDist);
      const { pitch } = calcBallisticAngles(origin, aim, 0, m, d);
      const r = shellHeightAtDist(pitch, m, d, 1/60, horizDist);
      const yAt = r.yAtQuery;
      const err = yAt == null ? null : yAt - dy;
      worst = Math.max(worst, Math.abs(err ?? 0));
      console.log(
        `  dist=${String(horizDist).padStart(5)} dy=${String(dy).padStart(3)}  pitch=${deg(pitch).padStart(8)}deg  ` +
        (yAt == null ? 'shell landed short of target'
                     : `shellY=${yAt.toFixed(2).padStart(7)}  yErr=${(err>=0?'+':'')+err.toFixed(2)}`)
      );
    }
  }
}
console.log(`\n>> Worst height error at aim point: ${worst.toFixed(2)} m`);
