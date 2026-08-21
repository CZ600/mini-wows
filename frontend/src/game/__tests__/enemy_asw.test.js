// Enemy AI anti-submarine warfare regression:
//   - When the fire target is a submarine, ASW-fitted AI ships hold their gun
//     fire and answer with depth charges instead (destroyer/cruiser hull-drop
//     salvo, battleship air strike via AswStrikePlane);
//   - non-submarine targets keep receiving normal cannon fire;
//   - AI ships without an ASW fit (submarines) keep torpedo-only behaviour;
//   - a detonating depth charge skips same-faction submarines (no friendly
//     fire) but still damages hostile ones.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EnemyShip } from '../enemy.js';
import { ProjectileManager } from '../projectile.js';
import { ASW_TIER } from '../config.js';

function makeScene() {
  return { add() {}, remove() {} };
}

function makePmRecorder() {
  return {
    fired: [],
    fire(origin, direction, damage, owner, muzzleSpeed, drag, weapon) {
      this.fired.push({ origin, direction, damage, owner, muzzleSpeed, drag, weapon });
    },
  };
}

function makeTmRecorder() {
  return {
    fired: [],
    fire(origin, heading, tier, level, tubeCount, spread, owner) {
      this.fired.push({ origin, heading, tier, level, tubeCount, spread, owner });
    },
  };
}

// Solo-style player position: x/z plus shipClass (what engine._soloPlayerPos
// feeds the enemy manager each frame).
function subPlayerAt(x, z) {
  return { x, z, heading: 0, speed: 0, shipClass: 'submarine' };
}

// Drive one updateShip frame at the given player position.
function step(enemy, dt, playerPos, pm, tm) {
  enemy.updateShip(dt, playerPos, 0, 0, pm, null, tm);
}

describe('enemy ASW vs submarine targets', () => {
  it('cruiser holds gun fire and drops an enemy depth-charge salvo', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'cruiser');
    enemy.heading = 0;
    const pm = makePmRecorder();
    const tm = makeTmRecorder();
    const player = subPlayerAt(0, 150);

    step(enemy, 0.1, player, pm, tm);
    step(enemy, 0.1, player, pm, tm);   // cooldown blocks an instant re-drop

    const charges = pm.fired.filter(f => f.weapon === 'depth_charge');
    const shells = pm.fired.filter(f => f.weapon !== 'depth_charge');
    expect(shells.length).toBe(0);                       // guns silent vs the sub
    expect(charges.length).toBe(ASW_TIER[1].salvo);      // cruiser = ASW tier 1
    for (const c of charges) {
      expect(c.owner).toBe('enemy');
      expect(c.damage).toBe(ASW_TIER[1].damage);
    }
    expect(enemy.aswCooldown).toBeGreaterThan(0);
  });

  it('battleship answers a sub with an air strike, not guns', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'battleship');
    enemy.heading = 0;
    const pm = makePmRecorder();
    const tm = makeTmRecorder();
    const player = subPlayerAt(0, 150);

    step(enemy, 0.1, player, pm, tm);
    expect(pm.fired.length).toBe(0);            // no guns, no hull drop
    expect(enemy._aswPlanes.length).toBe(1);    // strike plane dispatched

    // Fly the plane out: cruise (~2.5s) + salvo release (~2s).
    for (let i = 0; i < 120; i++) step(enemy, 0.1, player, pm, tm);
    const charges = pm.fired.filter(f => f.weapon === 'depth_charge');
    expect(charges.length).toBeGreaterThanOrEqual(ASW_TIER[1].salvo);
    for (const c of charges) expect(c.owner).toBe('enemy');

    enemy.retire();
    expect(enemy._aswPlanes.length).toBe(0);
  });

  it('non-submarine targets keep drawing cannon fire', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'cruiser');
    enemy.heading = 0;
    const pm = makePmRecorder();
    const tm = makeTmRecorder();

    step(enemy, 0.1, { x: 0, z: 150, heading: 0, speed: 0, shipClass: 'battleship' }, pm, tm);

    const shells = pm.fired.filter(f => f.weapon !== 'depth_charge');
    expect(shells.length).toBeGreaterThan(0);
    for (const s of shells) expect(s.owner).toBe('enemy');
    expect(pm.fired.some(f => f.weapon === 'depth_charge')).toBe(false);
  });

  it('enemy submarine keeps torpedoes only (no ASW fit)', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'submarine');
    enemy.heading = 0;
    enemy.torpedoCooldown = 0;   // ready to launch immediately
    const pm = makePmRecorder();
    const tm = makeTmRecorder();
    const player = subPlayerAt(0, 150);

    step(enemy, 0.1, player, pm, tm);

    expect(tm.fired.length).toBe(1);   // torpedo launched at the player sub
    expect(pm.fired.length).toBe(0);   // no shells, no depth charges
  });
});

describe('depth-charge AoE faction filter', () => {
  it('enemy charges skip enemy subs but damage hostile ones', () => {
    const pm = new ProjectileManager(makeScene(), null, null);
    const redSub = {
      alive: true, shipClass: 'submarine', faction: 'enemy',
      position: new THREE.Vector3(50, 0, 0),
      damageTaken: [], takeDamage(d) { this.damageTaken.push(d); },
    };
    const playerSub = {
      alive: true, shipClass: 'submarine',
      position: new THREE.Vector3(0, 0, 0),
      damageTaken: [], takeDamage(d) { this.damageTaken.push(d); },
    };
    pm.setAswTargets([redSub, playerSub]);

    // Enemy-owned charge dropped straight into the water at the player sub.
    pm.fire(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0), ASW_TIER[1].damage, 'enemy', 40, 0.02, 'depth_charge');
    for (let i = 0; i < 40; i++) pm.update(0.1, null, null);   // outlast the fuse

    expect(redSub.damageTaken.length).toBe(0);
    expect(playerSub.damageTaken).toEqual([ASW_TIER[1].damage]);
  });
});
