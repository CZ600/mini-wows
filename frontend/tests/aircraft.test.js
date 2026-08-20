import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CARRIER, getAirGroupConfig } from '../src/game/config.js';
import { Squadron, CarrierAirWing } from '../src/game/aircraft.js';

// Minimal stub scene: aircraft.js adds/removes meshes via scene.add / scene.remove
// and never reads anything else off the scene, so a plain object is enough.
function makeScene() {
  return {
    add() {},
    remove() {},
  };
}

// Stub terrain: getHeightAt returns a fixed ground height; isLand is derived.
// Used to exercise the crash-on-impact logic without the real Terrain mesh.
function makeTerrain(groundHeight = 0) {
  return {
    getHeightAt() { return groundHeight; },
    isLand(x, z) { return groundHeight > 0; },
  };
}

describe('getAirGroupConfig', () => {
  it('clamps to the nearest defined level', () => {
    expect(getAirGroupConfig(4).torpedo.salvo).toBe(4);
    expect(getAirGroupConfig(5).torpedo.salvo).toBe(4);
    expect(getAirGroupConfig(6).torpedo.salvo).toBe(4);
    expect(getAirGroupConfig(10).torpedo.salvo).toBe(4);
  });

  it('clamps out-of-range levels', () => {
    expect(getAirGroupConfig(1).torpedo.salvo).toBe(4);   // below 4 -> 4
    expect(getAirGroupConfig(99).torpedo.salvo).toBe(4);  // above 10 -> 10
  });

  it('every level fires a 4-ordnance salvo from both groups', () => {
    for (const lvl of [4, 5, 6, 7, 8, 9, 10]) {
      const g = getAirGroupConfig(lvl);
      expect(g.torpedo.salvo).toBe(4);
      expect(g.bomber.salvo).toBe(4);
    }
  });

  it('torpedo group fires more often than bombers (DPS profile)', () => {
    const g = getAirGroupConfig(8);
    expect(g.torpedo.cd).toBeLessThan(g.bomber.cd);
    expect(g.bomber.dmg).toBeGreaterThan(g.torpedo.dmg);
  });
});

describe('Squadron (single-type) ammo + cooldown + salvo', () => {
  it('a torpedo squadron starts fully armed for its type', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    const cfg = getAirGroupConfig(6).torpedo;
    expect(sq.type).toBe('torpedo');
    expect(sq.ammo).toBe(cfg.ammo);
    expect(sq.cd).toBe(0);
  });

  it('a bomber squadron starts fully armed for its type', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    const cfg = getAirGroupConfig(6).bomber;
    expect(sq.type).toBe('bomber');
    expect(sq.ammo).toBe(cfg.ammo);
  });

  it('drops a full torpedo salvo, depletes ammo, and starts the cooldown', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo'); // salvo 4
    const cfg = getAirGroupConfig(6).torpedo;
    const drops = sq.dropTorpedo();
    expect(drops.length).toBe(cfg.salvo);
    expect(sq.ammo).toBe(cfg.ammo - cfg.salvo);
    expect(sq.cd).toBe(cfg.cd);
    // On cooldown -> immediately refused.
    expect(sq.dropTorpedo().length).toBe(0);
  });

  it('drops a full bomb salvo', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 8, 'bomber'); // salvo 4
    const cfg = getAirGroupConfig(8).bomber;
    const drops = sq.dropBomb();
    expect(drops.length).toBe(cfg.salvo);
    expect(sq.ammo).toBe(cfg.ammo - cfg.salvo);
  });

  it('a torpedo squadron CANNOT drop bombs (wrong type -> [])', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    expect(sq.dropBomb().length).toBe(0);
    expect(sq.ammo).toBe(getAirGroupConfig(6).torpedo.ammo); // untouched
  });

  it('a bomber squadron CANNOT drop torpedoes (wrong type -> [])', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    expect(sq.dropTorpedo().length).toBe(0);
  });

  it('cooldown ticks down over time', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.dropTorpedo();
    const cdAfter = sq.cd;
    sq.update(0.5, { w: false, a: false, s: false, d: false });
    expect(sq.cd).toBeCloseTo(Math.max(0, cdAfter - 0.5), 5);
  });

  it('refill() tops up the pool and clears the cooldown', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.dropTorpedo();
    expect(sq.ammo).toBeLessThan(sq.maxAmmo);
    sq.refill();
    expect(sq.ammo).toBe(sq.maxAmmo);
    expect(sq.cd).toBe(0);
  });

  it('salvo is capped by remaining ammo', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.dropTorpedo();            // fire a full salvo
    sq.ammo = 1;                 // force the edge case (less than a full salvo)
    sq.cd = 0;
    expect(sq.ammo).toBe(1);
    // Salvo would be 4, but only 1 ammo left -> single drop.
    const drops = sq.dropTorpedo();
    expect(drops.length).toBe(1);
    expect(sq.ammo).toBe(0);
  });
});

describe('Squadron banking on turn', () => {
  it('rolls into the turn while A/D held, levels off when released', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 30; i++) sq.update(0.05, { w: false, a: true, s: false, d: false });
    expect(sq._bank).toBeLessThan(-0.1);
    const bankedWhileTurning = sq._bank;
    for (let i = 0; i < 60; i++) sq.update(0.05, { w: false, a: false, s: false, d: false });
    expect(Math.abs(sq._bank)).toBeLessThan(Math.abs(bankedWhileTurning));
    expect(sq.mesh.rotation.y).toBeCloseTo(sq.heading, 5);
  });

  it('D (starboard turn) rolls the hull right (bank > 0)', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 30; i++) sq.update(0.05, { w: false, a: false, s: false, d: true });
    expect(sq._bank).toBeGreaterThan(0.1);
  });

  it('bank magnitude never exceeds the configured max', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 100; i++) sq.update(0.05, { w: false, a: true, s: false, d: false });
    expect(Math.abs(sq._bank)).toBeLessThanOrEqual(CARRIER.bankMaxAngle + 1e-6);
  });
});

describe('Squadron guides (per type)', () => {
  it('torpedo squadron shows its guide when shown, hides when not', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.updateGuides(true);
    expect(sq._torpGuide.visible).toBe(true);
    sq.updateGuides(false);
    expect(sq._torpGuide.visible).toBe(false);
  });

  it('bomber squadron shows its reticle when shown, hides when not', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    sq.updateGuides(true);
    expect(sq._bombReticle.visible).toBe(true);
    sq.updateGuides(false);
    expect(sq._bombReticle.visible).toBe(false);
  });

  it('torpedo guide tracks the squadron heading/position', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.heading = Math.PI / 2;
    sq.position.set(100, CARRIER.aircraftAltitude, 0);
    sq.updateGuides(true);
    expect(sq._torpGuide.visible).toBe(true);
  });
});

describe('Bomb ballistic physics', () => {
  it('dropBomb returns a forward-throw velocity (not straight down)', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    sq.heading = 0;          // facing +z
    sq.speed = 50;
    const drops = sq.dropBomb();
    expect(drops.length).toBeGreaterThan(0);
    const v = drops[0].velocity;
    // Forward (+z) component should match the inherited ground speed; there's
    // also a downward component. So it is NOT a pure vertical drop.
    expect(v.z).toBeGreaterThan(10);
    expect(v.y).toBeLessThan(0);
  });

  it('predicted impact lands ahead of the plane (forward throw)', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    sq.heading = 0;          // +z
    sq.speed = 50;
    sq.position.set(0, CARRIER.aircraftAltitude, 0);
    const impact = sq._predictBombImpact();
    // Impact should be well ahead of the plane in +z, not under it.
    expect(impact.z).toBeGreaterThan(20);
  });
});

describe('Re-arm at carrier (no airborne regen)', () => {
  it('does NOT regen ammo while far from the carrier', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.dropTorpedo();
    const ammoBefore = sq.ammo;
    for (let i = 0; i < 50; i++) sq.update(0.1, { w: false, a: false, s: false, d: false }, { carrierPos: { x: 5000, z: 5000 } });
    expect(sq.ammo).toBe(ammoBefore);
  });

  it('regens ammo while within rearmRange of the carrier', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.dropTorpedo();
    expect(sq.ammo).toBeLessThan(sq.maxAmmo);
    const ctx = { carrierPos: { x: 0, z: 0 } };
    for (let i = 0; i < 200; i++) sq.update(0.1, { w: false, a: false, s: false, d: false }, ctx);
    expect(sq.ammo).toBe(sq.maxAmmo);
  });
});

describe('Auto-pilot (auto-attack)', () => {
  function enemyAt(x, z) {
    return { alive: true, mesh: { position: { x, z } } };
  }

  it('engages the nearest enemy and requests a drop when in range', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.autoPilot = true;
    sq.position.set(0, CARRIER.aircraftAltitude, 0);
    const enemy = enemyAt(0, 100);
    const ctx = { carrierPos: { x: 5000, z: 5000 }, enemies: [enemy] };
    sq.heading = 0;
    for (let i = 0; i < 3; i++) sq.update(0.05, {}, ctx);
    expect(sq.autoDrop).toBeTruthy();
    expect(sq._autoPhase).toBe('attack');
  });

  it('returns to the carrier when out of ammo', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.autoPilot = true;
    while (sq.ammo > 0) { sq.cd = 0; sq.dropTorpedo(); }
    sq.position.set(0, CARRIER.aircraftAltitude, 0);
    const enemy = enemyAt(200, 200);
    const ctx = { carrierPos: { x: 1000, z: 1000 }, enemies: [enemy] };
    sq.update(0.05, {}, ctx);
    expect(sq._autoPhase).toBe('return');
  });

  it('rearms phase while within rearmRange of the carrier', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.autoPilot = true;
    sq.ammo = 0;
    sq.position.set(0, CARRIER.aircraftAltitude, 0);
    const ctx = { carrierPos: { x: 0, z: 0 }, enemies: [] };
    sq.update(0.05, {}, ctx);
    expect(sq._autoPhase).toBe('rearm');
  });

  it('manual keys are ignored while autoPilot is on', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.autoPilot = true;
    sq.heading = 0;
    const ctx = { carrierPos: { x: 5000, z: 5000 }, enemies: [enemyAt(0, 100)] };
    for (let i = 0; i < 5; i++) sq.update(0.05, { a: true }, ctx);
    expect(Math.abs(sq.heading)).toBeLessThan(0.05);
  });
});

describe('Altitude control (W dive / S climb)', () => {
  it('starts at cruise altitude with full HP', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    expect(sq.altitude).toBe(CARRIER.aircraftAltitude);
    expect(sq.position.y).toBe(CARRIER.aircraftAltitude);
    expect(sq.hp).toBe(CARRIER.aircraftHp);
  });

  it('W (dive) loses altitude, S (climb) gains altitude', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    const start = sq.altitude;
    // Hold S (climb) for 0.5s -> altitude rises.
    for (let i = 0; i < 10; i++) sq.update(0.05, { w: false, a: false, s: true, d: false });
    expect(sq.altitude).toBeGreaterThan(start);
    // Hold W (dive) long enough for the nose to ease through level into a dive
    // (pitch eases, it doesn't snap), then altitude must drop below the climb peak.
    const climbed = sq.altitude;
    for (let i = 0; i < 60; i++) sq.update(0.05, { w: true, a: false, s: false, d: false });
    expect(sq.altitude).toBeLessThan(climbed);
  });

  it('altitude is clamped to the flight envelope', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    // Climb hard — should never exceed the ceiling.
    for (let i = 0; i < 400; i++) sq.update(0.05, { w: false, a: false, s: true, d: false });
    expect(sq.altitude).toBeLessThanOrEqual(CARRIER.aircraftMaxAlt);
  });

  it('dive pitches the nose down, climb pitches it up', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 30; i++) sq.update(0.05, { w: true, a: false, s: false, d: false });
    expect(sq.pitch).toBeGreaterThan(0.05);          // nose down (+)
    for (let i = 0; i < 60; i++) sq.update(0.05, { w: false, a: false, s: true, d: false });
    expect(sq.pitch).toBeLessThan(-0.05);            // nose up (-)
  });

  it('pitch magnitude never exceeds the configured max', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 200; i++) sq.update(0.05, { w: true, a: false, s: false, d: false });
    expect(Math.abs(sq.pitch)).toBeLessThanOrEqual(CARRIER.aircraftPitchMax + 1e-6);
  });
});

describe('Crash on terrain/water impact', () => {
  it('crashes when it dives to/below the terrain surface', () => {
    const terrain = makeTerrain(0);               // sea level
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    // Force a dive all the way down to the crash floor.
    for (let i = 0; i < 400; i++) sq.update(0.05, { w: true, a: false, s: false, d: false }, { terrain });
    expect(sq.alive).toBe(false);
    expect(sq.hp).toBe(0);
    expect(sq.mesh.visible).toBe(false);
  });

  it('crashes when flying into a mountain (high ground)', () => {
    const terrain = makeTerrain(120);             // a 120m ridge
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    // Cruise level (80m) into a 120m ridge -> ground is above the plane.
    sq.update(0.05, { w: false, a: false, s: false, d: false }, { terrain });
    expect(sq.alive).toBe(false);
  });

  it('a crashed squadron cannot drop ordinance', () => {
    const terrain = makeTerrain(0);
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    for (let i = 0; i < 400; i++) sq.update(0.05, { w: true, a: false, s: false, d: false }, { terrain });
    expect(sq.alive).toBe(false);
    expect(sq.dropTorpedo().length).toBe(0);
  });
});

describe('Aircraft HP + takeDamage', () => {
  it('takeDamage depletes HP and is non-lethal below zero threshold', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    const killed = sq.takeDamage(30);
    expect(killed).toBe(false);
    expect(sq.hp).toBe(CARRIER.aircraftHp - 30);
    expect(sq.alive).toBe(true);
  });

  it('takeDamage to zero destroys the squadron', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    const killed = sq.takeDamage(CARRIER.aircraftHp);
    expect(killed).toBe(true);
    expect(sq.alive).toBe(false);
    expect(sq.hp).toBe(0);
  });

  it('refill() repairs the squadron and restores altitude', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    sq.takeDamage(50);
    // Dive low first so we can confirm refill restores altitude.
    for (let i = 0; i < 30; i++) sq.update(0.05, { w: true, a: false, s: false, d: false });
    expect(sq.hp).toBeLessThan(sq.maxHp);
    sq.refill();
    expect(sq.hp).toBe(sq.maxHp);
    expect(sq.alive).toBe(true);
    expect(sq.altitude).toBe(CARRIER.aircraftAltitude);
    expect(sq.mesh.visible).toBe(true);
  });
});

describe('CarrierAirWing (two squadrons + Tab switch)', () => {
  it('owns both a torpedo and a bomber squadron', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    expect(wing.torpedo.type).toBe('torpedo');
    expect(wing.bomber.type).toBe('bomber');
  });

  it('starts with the torpedo squadron active', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    expect(wing.activeType).toBe('torpedo');
    expect(wing.active).toBe(wing.torpedo);
  });

  it('switchActive (Tab) toggles between the two squadrons', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    expect(wing.activeType).toBe('torpedo');
    wing.switchActive();
    expect(wing.activeType).toBe('bomber');
    expect(wing.active).toBe(wing.bomber);
    wing.switchActive();
    expect(wing.activeType).toBe('torpedo');
  });

  it('setActive picks a specific squadron', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    wing.setActive('bomber');
    expect(wing.activeType).toBe('bomber');
    wing.setActive('torpedo');
    expect(wing.activeType).toBe('torpedo');
  });

  it('the two squadrons have independent ammo pools', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    const tBefore = wing.torpedo.ammo;
    const bBefore = wing.bomber.ammo;
    wing.torpedo.dropTorpedo();
    expect(wing.torpedo.ammo).toBeLessThan(tBefore);
    expect(wing.bomber.ammo).toBe(bBefore); // untouched
  });

  it('updateGuides shows only the active squadron guide', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    wing.updateGuides();
    expect(wing.torpedo._torpGuide.visible).toBe(true);
    expect(wing.bomber._bombReticle.visible).toBe(false);
    wing.switchActive();
    wing.updateGuides();
    expect(wing.torpedo._torpGuide.visible).toBe(false);
    expect(wing.bomber._bombReticle.visible).toBe(true);
  });

  it('update drives only the active squadron with the player keys', () => {
    const wing = new CarrierAirWing(makeScene(), 0, 0, 'player', 6);
    // Active = torpedo. Hold A (port turn) for a few frames.
    for (let i = 0; i < 20; i++) wing.update(0.05, { w: false, a: true, s: false, d: false });
    expect(wing.torpedo.heading).toBeGreaterThan(0.05);
    // Inactive bomber did NOT turn from the player's A.
    expect(Math.abs(wing.bomber.heading)).toBeLessThan(0.05);
  });
});
