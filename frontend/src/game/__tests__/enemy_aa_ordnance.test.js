// Solo-mode enemy AA + air-ordnance rebalance regression:
//   - EnemyShip.updateAaDefense auto-targets the nearest PLAYER squadron and
//     fires faction-tagged flak (so projectile.js's faction filter makes it
//     hit player aircraft, never enemy ones);
//   - enemy flak really damages a player-owned squadron through the
//     ProjectileManager hit path;
//   - aircraft torpedoes carry CARRIER.airTorpedoDamageMul (1.5x the hull
//     torpedo tier formula).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EnemyShip } from '../enemy.js';
import { ProjectileManager } from '../projectile.js';
import { TorpedoManager } from '../torpedo.js';
import { CARRIER } from '../config.js';

const AA_SPEED = 220;
const AA_DRAG = 0.10;

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

// A player-owned squadron duck-type: alive, positioned, damage-recording.
function makePlayerSquadron(x, y, z) {
  return {
    alive: true,
    owner: 'player',
    position: new THREE.Vector3(x, y, z),
    damageTaken: [],
    takeDamage(d) { this.damageTaken.push(d); },
  };
}

// A hostile ship duck-type for the torpedo hit branch (OBB in local frame).
function makeEnemyShipStub(z, width = 12, length = 50) {
  return {
    alive: true,
    type: 'ship',
    heading: 0,
    mesh: { position: new THREE.Vector3(0, 0, z) },
    shipWidth: width,
    shipLength: length,
    damageTaken: [],
    takeDamage(d) { this.damageTaken.push(d); },
  };
}

describe('enemy AA auto-defense (solo)', () => {
  it('trains on a player squadron in range and fires enemy-tagged flak', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'cruiser');
    enemy.heading = 0;
    const pm = makePmRecorder();
    const sq = makePlayerSquadron(0, 80, 400);   // dead ahead, well inside 1000m

    // Step like the game loop until the battery opens fire (training slew).
    let steps = 0;
    while (pm.fired.length === 0 && steps < 120) {
      enemy.updateAaDefense(0.05, [sq], pm);
      steps++;
    }
    expect(pm.fired.length).toBeGreaterThan(0);
    for (const shot of pm.fired) {
      expect(shot.owner).toBe('enemy');
      expect(shot.weapon).toBe('flak');
      expect(shot.damage).toBe(8);       // cruiser = AA tier 2
      expect(shot.muzzleSpeed).toBe(AA_SPEED);
      expect(shot.drag).toBe(AA_DRAG);
    }
  });

  it('respects the mount cooldown between volleys', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'battleship');
    enemy.heading = 0;
    const pm = makePmRecorder();
    const sq = makePlayerSquadron(0, 80, 300);

    let steps = 0;
    while (pm.fired.length === 0 && steps < 120) {
      enemy.updateAaDefense(0.05, [sq], pm);
      steps++;
    }
    const volleys = pm.fired.length;
    expect(volleys).toBeGreaterThan(0);

    // Immediately after the volley every mount is on cooldown: no extra shots.
    enemy.updateAaDefense(0.05, [sq], pm);
    expect(pm.fired.length).toBe(volleys);
  });

  it('stays silent with no hostiles or out-of-range hostiles', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'cruiser');
    enemy.heading = 0;
    const pm = makePmRecorder();

    for (let i = 0; i < 60; i++) enemy.updateAaDefense(0.05, [], pm);
    const far = makePlayerSquadron(0, 80, 2500);   // beyond AA range
    for (let i = 0; i < 60; i++) enemy.updateAaDefense(0.05, [far], pm);
    expect(pm.fired.length).toBe(0);
  });

  it('submarines carry no AA mounts', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'submarine');
    expect(enemy.aaMounts.length).toBe(0);
    const pm = makePmRecorder();
    const sq = makePlayerSquadron(0, 80, 200);
    for (let i = 0; i < 60; i++) enemy.updateAaDefense(0.05, [sq], pm);
    expect(pm.fired.length).toBe(0);
  });
});

describe('enemy flak vs player aircraft (faction filter)', () => {
  it('enemy-owned flak damages a player squadron', () => {
    const mgr = new ProjectileManager(new THREE.Scene(), null, null);
    const sq = makePlayerSquadron(0, 80, 0);
    mgr.fire(new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 1, 0), 8, 'enemy', 100, AA_DRAG, 'flak');
    let steps = 0;
    while (mgr.projectiles.length > 0 && steps < 1000) {
      mgr.update(0.05, null, [], [sq]);
      steps++;
    }
    expect(sq.damageTaken.length).toBe(1);
    expect(sq.damageTaken[0]).toBe(8);
  });
});

describe('aircraft torpedo damage multiplier', () => {
  it('CARRIER.airTorpedoDamageMul is set to the 1.5x rebalance', () => {
    expect(CARRIER.airTorpedoDamageMul).toBe(1.5);
  });

  function runTorpedoHit(mul) {
    const mgr = new TorpedoManager(makeScene(), null, null);
    const enemy = makeEnemyShipStub(80);   // downrange along +z
    mgr.fire({ x: 0, z: 0 }, 0, CARRIER.torpedoTier, 6, 1, 'narrow', 'player', mul);
    let steps = 0;
    while (mgr.torpedoes.length > 0 && steps < 2000) {
      mgr.update(0.05, null, [enemy], []);
      steps++;
    }
    expect(enemy.damageTaken.length).toBe(1);
    return enemy.damageTaken[0];
  }

  it('aircraft torpedoes hit at 150% of the hull-torpedo tier damage', () => {
    // Tier 2 hull formula: (50 + 2*20) * 2 = 180; aircraft run at 1.5x = 270.
    expect(runTorpedoHit(1.0)).toBe(180);
    expect(runTorpedoHit(CARRIER.airTorpedoDamageMul)).toBe(270);
  });
});
