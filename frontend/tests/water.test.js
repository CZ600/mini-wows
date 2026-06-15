import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWater } from '../src/game/water.js';

function makeScene() {
  return new THREE.Scene();
}

describe('createWater vertex shader', () => {
  const mesh = createWater(makeScene());
  const vs = mesh.material.vertexShader;

  it('declares a hash function for value noise', () => {
    expect(vs).toMatch(/float\s+hash\w*\s*\([^)]*\)\s*\{/);
  });

  it('declares a value-noise function (Perlin-like)', () => {
    expect(vs).toMatch(/float\s+(valueNoise|noise2D|pnoise|perlin)\s*\([^)]*\)\s*\{/);
  });

  it('declares an fbm function combining octaves of noise', () => {
    expect(vs).toMatch(/float\s+fbm\s*\([^)]*\)\s*\{/);
  });

  it('samples noise and adds it to wave height h', () => {
    expect(vs).toMatch(/h\s*\+=/);
    expect(vs).toMatch(/fbm\s*\(/);
  });

  it('applies a strong noise amplitude (>= 0.4) for visible perturbation', () => {
    const m = vs.match(/nAmp\s*=\s*([0-9.]+)/);
    expect(m).not.toBeNull();
    expect(parseFloat(m[1])).toBeGreaterThanOrEqual(0.4);
  });

  it('updates height gradient dhx/dhz from noise to keep normals coherent', () => {
    expect(vs).toMatch(/dhx\s*\+=/);
    expect(vs).toMatch(/dhz\s*\+=/);
  });

  it('modulates at least one wave parameter with sin(time * factor)', () => {
    expect(vs).toMatch(/sin\s*\(\s*time\s*\*/);
  });

  it('keeps the original addWave call structure intact', () => {
    expect(vs).toMatch(/addWave\s*\(/);
  });

  it('still compiles into a ShaderMaterial with time uniform', () => {
    expect(mesh.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mesh.material.uniforms.time).toBeDefined();
  });
});
