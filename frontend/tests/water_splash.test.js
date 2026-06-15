import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ProjectileManager } from '../src/game/projectile.js';

function makeScene() {
  return new THREE.Scene();
}

function makeAudio() {
  const calls = { playExplosion: 0 };
  return {
    playExplosion: () => { calls.playExplosion++; },
    _calls: calls,
  };
}

function makeManager() {
  const scene = makeScene();
  const audio = makeAudio();
  const mgr = new ProjectileManager(scene, null, audio);
  return { mgr, scene, audio };
}

describe('Projectile water-hit splash effect', () => {
  it('creates a splash particle system on water hit (not an explosion sphere)', () => {
    const { mgr } = makeManager();
    mgr.fire(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0), 10, 'player');

    for (let i = 0; i < 15; i++) mgr.update(0.05, null, []);

    expect(mgr._splashes.length).toBe(1);
    const splash = mgr._splashes[0];
    expect(splash.points).toBeInstanceOf(THREE.Points);
  });

  it('each water-hit splash has its own independent particle system', () => {
    const { mgr } = makeManager();
    mgr._createSplash(new THREE.Vector3(0, 0, 0));
    mgr._createSplash(new THREE.Vector3(20, 0, 0));

    expect(mgr._splashes.length).toBe(2);
    expect(mgr._splashes[0].points).not.toBe(mgr._splashes[1].points);
  });

  it('splash particles use water-like colors (white/blue), not fire colors', () => {
    const { mgr } = makeManager();
    mgr._createSplash(new THREE.Vector3(0, 0, 0));

    const fragShader = mgr._splashes[0].points.material.fragmentShader;
    expect(fragShader).toMatch(/1\.0.*1\.0.*1\.0/);
    expect(fragShader).toMatch(/0\.\d+.*0\.\d+.*0\.9\d/);
  });

  it('plays explosion sound on water hit', () => {
    const { mgr, audio } = makeManager();
    mgr.fire(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0), 10, 'player');
    for (let i = 0; i < 15; i++) mgr.update(0.05, null, []);

    expect(audio._calls.playExplosion).toBeGreaterThanOrEqual(1);
  });

  it('does NOT play explosion sound for enemy projectiles hitting water', () => {
    const { mgr, audio } = makeManager();
    mgr.fire(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0), 10, 'enemy');
    for (let i = 0; i < 15; i++) mgr.update(0.05, null, []);

    expect(audio._calls.playExplosion).toBe(0);
    expect(mgr._splashes.length).toBe(1);
  });

  it('cleans up splash after lifetime expires', () => {
    const { mgr } = makeManager();
    mgr._createSplash(new THREE.Vector3(0, 0, 0));
    expect(mgr._splashes.length).toBe(1);

    for (let i = 0; i < 40; i++) mgr.update(0.05, null, []);
    expect(mgr._splashes.length).toBe(0);
  });

  it('splash particles have upward initial velocity for water-column effect', () => {
    const { mgr } = makeManager();
    mgr._createSplash(new THREE.Vector3(0, 0, 0));
    expect(mgr._splashes.length).toBe(1);
    const velocities = mgr._splashes[0].velocities;
    const upwardCount = velocities.filter(v => v.y > 0).length;
    expect(upwardCount).toBeGreaterThan(velocities.length * 0.7);
  });

  it('destroy() cleans up all active splashes', () => {
    const { mgr } = makeManager();
    mgr._createSplash(new THREE.Vector3(0, 0, 0));
    mgr._createSplash(new THREE.Vector3(10, 0, 10));
    expect(mgr._splashes.length).toBe(2);
    mgr.destroy();
    expect(mgr._splashes.length).toBe(0);
  });

  it('water hit does not create explosion sphere (no _explode call)', () => {
    const { mgr } = makeManager();
    mgr.fire(new THREE.Vector3(0, 50, 0), new THREE.Vector3(0, -1, 0), 10, 'player');
    for (let i = 0; i < 15; i++) mgr.update(0.05, null, []);

    expect(mgr.explosions.length).toBe(0);
  });

  it('multiple simultaneous splashes are all independent', () => {
    const { mgr } = makeManager();
    const positions = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(10, 0, 5),
      new THREE.Vector3(-5, 0, 15),
    ];
    for (const p of positions) mgr._createSplash(p);

    expect(mgr._splashes.length).toBe(3);
    const geos = mgr._splashes.map(s => s.points.geometry);
    expect(new Set(geos).size).toBe(3);
  });
});
