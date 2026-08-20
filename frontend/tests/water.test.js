import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWater } from '../src/game/water.js';

function makeScene() {
  return new THREE.Scene();
}

// v3 海面架构的结构性回归测试：
//   顶点层 = 多向 Gerstner 涌浪 + 相位扰动/波群包络(消除机械平行波列)
//   片元层 = 逐像素细浪法线(锐利感) + 折叠白沫 + 光影
// 只断言结构不变量，不锁具体数值，避免阻碍参数调优。

describe('createWater material contract', () => {
  const scene = makeScene();
  const mesh = createWater(scene);

  it('compiles into a ShaderMaterial with engine-facing uniforms', () => {
    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mesh.material.uniforms.time).toBeDefined();
    expect(mesh.material.uniforms.uSunDir).toBeDefined();
    expect(mesh.material.uniforms.uCameraPos).toBeDefined();
  });

  it('adds the water mesh to the scene', () => {
    expect(scene.children).toContain(mesh);
  });
});

describe('createWater vertex shader (swell layer)', () => {
  const mesh = createWater(makeScene());
  const vs = mesh.material.vertexShader;

  it('declares hash / value-noise for phase warp and wave groups', () => {
    expect(vs).toMatch(/float\s+hash\w*\s*\([^)]*\)\s*\{/);
    expect(vs).toMatch(/float\s+valueNoise\s*\([^)]*\)\s*\{/);
  });

  it('sums multiple Gerstner swell waves (>= 6)', () => {
    const calls = (vs.match(/gw\s*\(/g) || []).length - 1; // 去掉函数定义
    expect(calls).toBeGreaterThanOrEqual(6);
  });

  it('perturbs wave phases with noise so crests curve and break', () => {
    expect(vs).toMatch(/warp1\s*=/);
    expect(vs).toMatch(/warp2\s*=/);
    expect(vs).toMatch(/gw\([^;]*warp[12]\s*\*/);
  });

  it('modulates amplitudes with a wave-group envelope (no global pulse)', () => {
    expect(vs).toMatch(/modA\s*=/);
    expect(vs).toMatch(/modB\s*=/);
    expect(vs).not.toMatch(/sin\s*\(\s*time\s*\*/); // 全局同步脉动 = 机械感的来源
  });

  it('computes the folding Jacobian for whitecap detection', () => {
    expect(vs).toMatch(/vFold\s*=/);
    expect(vs).toMatch(/jac\b/);
  });
});

describe('createWater fragment shader (detail + lighting)', () => {
  const mesh = createWater(makeScene());
  const fs = mesh.material.fragmentShader;

  it('adds per-pixel chop octaves (>= 6) for crisp detail', () => {
    const calls = (fs.match(/chop\s*\(/g) || []).length - 1;
    expect(calls).toBeGreaterThanOrEqual(6);
  });

  it('fades chop octaves by distance to avoid moire', () => {
    expect(fs).toMatch(/chop\([^;]*smoothstep\([^)]*dist/);
  });

  it('derives foam from folding, wave height and chop steepness', () => {
    expect(fs).toMatch(/crestFold/);
    expect(fs).toMatch(/chopBreak/);
    expect(fs).toMatch(/vFold/);
  });

  it('shades with Fresnel reflection and sun specular', () => {
    expect(fs).toMatch(/pow\(\s*1\.0\s*-\s*ndv\s*,\s*5\.0\s*\)/);
    expect(fs).toMatch(/specSharp/);
    expect(fs).toMatch(/sampleSky\s*\(/);
  });

  it('keeps horizon fog matched to scene.fog', () => {
    expect(fs).toMatch(/fogColor/);
    expect(fs).toMatch(/0\.00000004/);
  });
});
