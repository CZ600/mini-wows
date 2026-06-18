// 精确界定驱逐/巡洋在"接近最远射程"vs"超过最远射程"时的偏差。
// 目的:回答用户问题——是射程限制导致接近最远射程时偏离吗?

import * as THREE from '../frontend/node_modules/three/build/three.module.js';
import { calcBallisticAngles } from '../frontend/src/game/turret.js';
import { getMuzzleSpeed, getCannonDrag, GRAVITY } from '../frontend/src/game/config.js';

const CLASSES = ['battleship', 'cruiser', 'destroyer'];

// 找出每级的真实最远射程(低弹道包络峰值对应的pitch)
function findMaxRange(m, d) {
  let bestR = 0, bestP = 0;
  for (let p = 1; p <= 45; p++) {
    const pitch = p * Math.PI / 180;
    let x = 0, y = 0;
    let vx = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
    const dt = 0.005;
    for (let i = 0; i < 400000; i++) {
      const f = 1 - d * dt;
      vx *= f; vy = vy * f - GRAVITY * dt;
      x += vx * dt; y += vy * dt;
      if (y <= 0 && i > 0) break;
    }
    if (x > bestR) { bestR = x; bestP = pitch; }
  }
  return { maxRange: bestR, maxPitch: bestP };
}

// 用实时积分器(1/60步,同projectile.js)求shell落在水面(y<=0)处的水平距离
function liveRange(pitch, m, d) {
  let z = 0, y = 0;
  let vz = Math.cos(pitch) * m, vy = Math.sin(pitch) * m;
  const dt = 1/60;
  for (let i = 0; i < 600000; i++) {
    const f = 1 - d * dt;
    vz *= f; vy = vy * f - GRAVITY * dt;
    z += vz * dt; y += vy * dt;
    if (y <= 0 && i > 0) return z;
  }
  return z;
}

function deg(r) { return (r * 180 / Math.PI).toFixed(2); }

console.log('逐级扫描:瞄准距离从近到远,看落点偏差如何变化(dy=0,只看射程问题)');
console.log('================================================================');
for (const cls of CLASSES) {
  const m = getMuzzleSpeed(cls), d = getCannonDrag(cls);
  const { maxRange, maxPitch } = findMaxRange(m, d);
  console.log(`\n[${cls}]  真实最远射程≈${maxRange.toFixed(0)}m (对应pitch≈${deg(maxPitch)}°)  muzzle=${m} drag=${d}`);
  console.log('  瞄准距离  |  pitch(代码算出)  |  实际落点  |  偏差  |  状态');
  // 从maxRange的60%扫到maxRange的140%
  const start = Math.round(maxRange * 0.6 / 100) * 100;
  const end = Math.round(maxRange * 1.4 / 100) * 100;
  for (let aim = start; aim <= end; aim += 100) {
    const origin = new THREE.Vector3(0, 0, 0);
    const tgt = new THREE.Vector3(0, 0, aim);
    const { pitch } = calcBallisticAngles(origin, tgt, 0, m, d);
    const landed = liveRange(pitch, m, d);
    const err = landed - aim;
    const clamped = Math.abs(pitch - 60 * Math.PI / 180) < 1e-4;
    let status;
    if (clamped) status = '❌pitch被钳到60°(超过射程)';
    else if (aim <= maxRange) status = '✅射程内';
    else status = '⚠超射程但未钳';
    console.log(`  ${String(aim).padStart(6)}m  |  ${deg(pitch).padStart(7)}°  |  ${landed.toFixed(0).padStart(6)}m  |  ${(err>=0?'+':'')+err.toFixed(0)}  |  ${status}`);
  }
}
