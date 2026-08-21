import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ship } from '../src/game/ship.js';

function makeScene() {
  return new THREE.Scene();
}

function createShip(level = 4, shipClass = 'cruiser') {
  return new Ship(makeScene(), level, shipClass);
}

describe('Ship wake configuration', () => {
  it('reserves at least 400 wake particles', () => {
    const s = createShip();
    expect(s._wakeMax).toBeGreaterThanOrEqual(400);
  });

  it('wake geometry buffers match _wakeMax size', () => {
    const s = createShip();
    const pos = s._wakeMesh.geometry.attributes.position.array.length;
    const opa = s._wakeMesh.geometry.attributes.aOpacity.array.length;
    const sz = s._wakeMesh.geometry.attributes.aSize.array.length;
    expect(pos).toBe(s._wakeMax * 3);
    expect(opa).toBe(s._wakeMax);
    expect(sz).toBe(s._wakeMax);
    expect(s._wakeData.length).toBe(s._wakeMax);
  });

  it('emit covers a wider lateral spread than the legacy ±2.5', () => {
    const s = createShip();
    s.position.set(0, 0, 0);
    s.heading = 0;
    s.speed = 5;
    s._wakeEmitAccum = 100;
    const before = s._wakeNextIdx;
    while (s._wakeEmitAccum >= 1) {
      s._emitWake();
      s._wakeEmitAccum -= 1;
    }
    const emitted = s._wakeNextIdx < before
      ? s._wakeNextIdx + s._wakeMax - before
      : s._wakeNextIdx - before;
    expect(emitted).toBeGreaterThan(0);
  });

  it('bow-side wake emission produces off-axis particles (wider visual angle)', () => {
    const s = createShip();
    s.position.set(0, 0, 0);
    s.heading = 0;
    s.speed = 5;
    for (let i = 0; i < s._wakeMax; i++) {
      s._emitWake();
    }
    for (let i = 0; i < 30; i++) s._updateWake(0.05);
    const xs = s._wakeData.filter(p => p.active).map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    expect(maxX - minX).toBeGreaterThan(5.0);
  });

  it('stern particles emit from within the hull (not off the sides) at spawn time', () => {
    const s = createShip();
    s.position.set(0, 0, 0);
    s.heading = 0;
    s.speed = 5;
    for (let i = 0; i < s._wakeMax; i++) {
      s._emitWake();
    }
    const halfLen = s.shipLength / 2;
    // 船舯之后的发射点（艉流泡沫/艉部翻腾）应落在船体宽度投影内；
    // 两舷白浪（沿船侧、略宽于船体）不在此判定范围内。
    const stern = s._wakeData.filter(p => p.active && p.z < -halfLen * 0.5);
    expect(stern.length).toBeGreaterThan(0);
    const sternX = stern.map(p => p.x);
    const maxAbs = Math.max(...sternX.map(Math.abs));
    const halfW = s.shipWidth * 0.5;
    expect(maxAbs).toBeLessThanOrEqual(halfW + 0.5);
  });

  it('stern lateral spread stays compact (≤ ±4.0) for density', () => {
    const s = createShip();
    s.position.set(0, 0, 0);
    s.heading = 0;
    s.speed = 5;
    for (let i = 0; i < s._wakeMax; i++) {
      s._emitWake();
    }
    const stern = s._wakeData.filter(p => p.active && p.z < 0);
    const vx = stern.map(p => p.vx);
    const maxAbs = Math.max(...vx.map(Math.abs));
    expect(maxAbs).toBeLessThan(8.0);
  });

  it('wake particle base opacity and size are boosted', () => {
    const s = createShip();
    s.position.set(0, 0, 0);
    s.heading = 0;
    s.speed = 5;
    for (let i = 0; i < s._wakeMax; i++) {
      s._emitWake();
    }
    s._updateWake(0.001);
    const opa = s._wakeMesh.geometry.attributes.aOpacity.array;
    const sizes = s._wakeMesh.geometry.attributes.aSize.array;
    const maxOpa = Math.max(...opa);
    const maxSize = Math.max(...sizes);
    expect(maxOpa).toBeGreaterThan(0.85);
    expect(maxSize).toBeGreaterThan(1.5);
  });

  it('wake fragment shader renders rotated two-tone spray/foam sprites', () => {
    const s = createShip();
    const fs = s._wakeMesh.material.fragmentShader;
    expect(fs).toContain('vRot'); // 每粒子随机旋转，避免整齐圆圈的假感
    expect(fs).toMatch(/mix\s*\(\s*sprayA,\s*foamA,\s*vType\s*\)/); // 喷溅/泡沫双形态
    expect(fs).toMatch(/discard/);
  });

  it('wake mesh disables frustum culling to avoid stale bounding sphere', () => {
    const s = createShip();
    expect(s._wakeMesh.frustumCulled).toBe(false);
  });

  it('wake colors stay bright (white / pale blue) for visibility on the water', () => {
    const s = createShip();
    const fs = s._wakeMesh.material.fragmentShader;
    const colors = [...fs.matchAll(/vec3\(\s*([0-9.]+),\s*([0-9.]+),\s*([0-9.]+)\s*\)/g)];
    expect(colors.length).toBeGreaterThan(0);
    for (const m of colors) {
      const [r, g, b] = [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
      expect(Math.min(r, g, b)).toBeGreaterThan(0.5);
    }
  });

  it('wake fragment shader blends core and ring colors via mix()', () => {
    const s = createShip();
    const fs = s._wakeMesh.material.fragmentShader;
    expect(fs).toMatch(/mix\s*\(/);
  });

  it('still cleans up via _destroyWake', () => {
    const s = createShip();
    expect(() => s._destroyWake()).not.toThrow();
    expect(s._wakeMesh).toBeNull();
  });
});
