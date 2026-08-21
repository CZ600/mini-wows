// Flak air-burst behaviour: an AA shell that reaches the top of its arc
// without connecting self-destructs there (silent black puff) instead of
// flying the full parabola into the sea; a hit bursts at the hit position
// with sound for the player's own flak.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ProjectileManager } from '../projectile.js';

const AA_SPEED = 220;
const AA_DRAG = 0.10;

function makeManager() {
  const scene = new THREE.Scene();
  const calls = { playExplosion: 0 };
  const audio = { playExplosion: () => { calls.playExplosion++; } };
  const mgr = new ProjectileManager(scene, null, audio);
  return { mgr, calls };
}

// A hostile squadron duck-type: owner 'enemy' so player flak may hit it.
function makeSquadron(x, y, z) {
  const sq = {
    alive: true,
    owner: 'enemy',
    position: new THREE.Vector3(x, y, z),
    damageTaken: [],
    takeDamage(d) { this.damageTaken.push(d); },
  };
  return sq;
}

// Step until every shell is gone (or a step cap hits), like the game loop.
function runUntilClear(mgr, squadrons, maxSteps = 1000) {
  let steps = 0;
  while (mgr.projectiles.length > 0 && steps < maxSteps) {
    mgr.update(0.05, null, [], squadrons);
    steps++;
  }
  return steps;
}

describe('Flak air-burst', () => {
  it('a missed flak shell bursts at the apex instead of splashing into the sea', () => {
    const { mgr } = makeManager();
    // Arcing shot: apex comes well before the shell could ever reach water.
    mgr.fire(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0.6, 0.8, 0), 8, 'player', AA_SPEED, AA_DRAG, 'flak');
    runUntilClear(mgr, []);

    expect(mgr.projectiles.length).toBe(0);   // died mid-air
    expect(mgr._splashes.length).toBe(0);     // never reached the sea
    expect(mgr.explosions.length).toBe(2);    // flash + lingering smoke puff
  });

  it('a missed flak burst is silent (no explosion sound)', () => {
    const { mgr, calls } = makeManager();
    mgr.fire(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 1, 0), 8, 'player', 100, AA_DRAG, 'flak');
    runUntilClear(mgr, []);

    expect(mgr.projectiles.length).toBe(0);
    expect(calls.playExplosion).toBe(0);
  });

  it('a flak hit on a squadron bursts at the hit position with sound', () => {
    const { mgr, calls } = makeManager();
    const sq = makeSquadron(0, 80, 0);
    mgr.fire(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 1, 0), 8, 'player', 100, AA_DRAG, 'flak');
    runUntilClear(mgr, [sq]);

    expect(sq.damageTaken.length).toBe(1);    // proximity fuse connected
    expect(calls.playExplosion).toBeGreaterThanOrEqual(1);
    expect(mgr.explosions.length).toBe(2);    // burst visuals at the hit point
  });
});
