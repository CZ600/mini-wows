// Carrier squadron re-arm commitment regression: once an auto-piloted squadron
// heads home to re-arm it CIRCLES the carrier until its pool is completely
// full. The old exit (any ammo + any target) let it sortie again the moment a
// single round came back — the "leaves after a few rounds" bug.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Squadron } from '../aircraft.js';
import { CARRIER } from '../config.js';

function makeScene() {
  return { add() {}, remove() {} };
}

function makeEnemy(x, z) {
  return { alive: true, mesh: { position: new THREE.Vector3(x, 0, z) } };
}

function distToCarrier(sq) {
  return Math.hypot(sq.position.x - 0, sq.position.z - 0);
}

describe('squadron re-arm commitment (auto-pilot)', () => {
  it('keeps circling the carrier until the pool is FULL, then sorties', () => {
    const sq = new Squadron(makeScene(), 150, 0, 'player', 6, 'torpedo');
    sq.autoPilot = true;
    sq.ammo = 0;
    // A live target within acquire range the whole time — the old code left
    // the instant ammo flipped from 0 to 1 with a target available.
    const ctx = { carrierPos: { x: 0, z: 0 }, enemies: [makeEnemy(400, 0)] };
    const dt = 0.05;

    // Run ~60% of the nominal re-arm window: several rounds replenished.
    const steps = Math.round(((sq.maxAmmo / CARRIER.rearmRate) * 0.6) / dt);
    let midAmmo = 0;
    for (let i = 0; i < steps; i++) {
      sq.update(dt, {}, ctx);
      if (sq.ammo > 1 && sq.ammo < sq.maxAmmo) midAmmo = sq.ammo;
    }
    expect(midAmmo).toBeGreaterThan(1);        // partially rearmed…
    expect(sq._autoPhase).toBe('rearm');       // …but still committed to home
    expect(distToCarrier(sq)).toBeLessThanOrEqual(CARRIER.rearmRange);

    // Top the pool off completely.
    for (let i = 0; i < 2000 && sq.ammo < sq.maxAmmo; i++) sq.update(dt, {}, ctx);
    expect(sq.ammo).toBe(sq.maxAmmo);

    // Full pool + live target -> back to the fight.
    sq.update(dt, {}, ctx);
    expect(['engage', 'attack']).toContain(sq._autoPhase);
  });

  it('orbits inside the re-arm ring instead of flying through it', () => {
    const sq = new Squadron(makeScene(), 0, 137, 'player', 6, 'bomber');
    sq.autoPilot = true;
    sq.ammo = 0;
    // No enemies at all: full pool => loiter on the carrier orbit forever.
    const ctx = { carrierPos: { x: 0, z: 0 }, enemies: [] };

    let maxDist = 0;
    for (let i = 0; i < 600; i++) {            // 30 s of loitering
      sq.update(0.05, {}, ctx);
      maxDist = Math.max(maxDist, distToCarrier(sq));
    }
    expect(sq._autoPhase).toBe('rearm');
    expect(maxDist).toBeLessThan(CARRIER.rearmRange);   // never left the ring
    expect(maxDist).toBeGreaterThan(30);                // and really orbits
  });
});
