// Auto-respawn regression: a player squadron SHOT DOWN by enemy AA re-launches
// from the carrier after CARRIER.squadronRespawnDelay seconds (per squadron —
// the surviving wingmate keeps flying), while a CRASHED squadron still needs a
// manual T. Exercises Squadron.shotDown/relaunchAt plus the engine's
// _updateSquadronRespawn decision logic (invoked on a stub engine context).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { GameEngine } from '../engine.js';
import { Squadron } from '../aircraft.js';
import { CARRIER } from '../config.js';

function makeScene() {
  return { add() {}, remove() {} };
}

function makeCtx() {
  const torpedo = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
  const bomber = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
  const ctx = {
    airWing: { torpedo, bomber },
    ship: { alive: true, position: new THREE.Vector3(100, 0, -50), heading: 0.5 },
    respawnEvents: [],
  };
  ctx.onSquadronRespawn = (type) => ctx.respawnEvents.push(type);
  return ctx;
}

// Step the engine respawn logic like the game loop would.
function tick(ctx, seconds, dt = 0.05) {
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    GameEngine.prototype._updateSquadronRespawn.call(ctx, dt);
  }
}

describe('Squadron shot-down bookkeeping', () => {
  it('marks the squadron shotDown only when AA damage destroys it', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'torpedo');
    expect(sq.takeDamage(10)).toBe(false);
    expect(sq.shotDown).toBe(false);
    expect(sq.alive).toBe(true);

    expect(sq.takeDamage(sq.hp)).toBe(true);
    expect(sq.alive).toBe(false);
    expect(sq.shotDown).toBe(true);
  });

  it('relaunchAt revives the squadron at the carrier, fully repaired', () => {
    const sq = new Squadron(makeScene(), 0, 0, 'player', 6, 'bomber');
    sq.takeDamage(sq.hp);
    expect(sq.alive).toBe(false);

    sq.relaunchAt(120, -30, 1.25);
    expect(sq.alive).toBe(true);
    expect(sq.shotDown).toBe(false);
    expect(sq.hp).toBe(sq.maxHp);
    expect(sq.ammo).toBe(sq.maxAmmo);
    expect(sq.mesh.visible).toBe(true);
    expect(sq.position.x).toBe(120);
    expect(sq.position.z).toBe(-30);
    expect(sq.position.y).toBe(CARRIER.aircraftAltitude);
    expect(sq.heading).toBe(1.25);
  });
});

describe('engine _updateSquadronRespawn', () => {
  it('re-launches a shot-down squadron from the carrier after the delay', () => {
    const ctx = makeCtx();
    const sq = ctx.airWing.torpedo;
    sq.takeDamage(sq.hp);   // shot down by AA

    tick(ctx, CARRIER.squadronRespawnDelay - 1);
    expect(sq.alive).toBe(false);            // still gone just before the delay

    tick(ctx, 2);
    expect(sq.alive).toBe(true);             // respawned at/after the delay
    expect(ctx.respawnEvents).toEqual(['torpedo']);
    // Revived at the carrier's CURRENT position/heading, not the death spot.
    expect(sq.position.x).toBeCloseTo(ctx.ship.position.x, 5);
    expect(sq.position.z).toBeCloseTo(ctx.ship.position.z, 5);
    expect(sq.heading).toBe(ctx.ship.heading);
  });

  it('respawns each squadron independently — the wingmate keeps flying', () => {
    const ctx = makeCtx();
    ctx.airWing.torpedo.takeDamage(ctx.airWing.torpedo.hp);

    tick(ctx, CARRIER.squadronRespawnDelay + 2);
    expect(ctx.airWing.torpedo.alive).toBe(true);
    expect(ctx.airWing.bomber.alive).toBe(true);   // never died
    expect(ctx.respawnEvents).toEqual(['torpedo']);
  });

  it('never auto-respawns a crashed squadron (manual T required)', () => {
    const ctx = makeCtx();
    ctx.airWing.bomber._crash();   // terrain/water impact — not an AA kill
    expect(ctx.airWing.bomber.shotDown).toBe(false);

    tick(ctx, CARRIER.squadronRespawnDelay * 3);
    expect(ctx.airWing.bomber.alive).toBe(false);
    expect(ctx.respawnEvents).toEqual([]);
  });

  it('a manual re-launch during the countdown cancels the pending timer', () => {
    const ctx = makeCtx();
    const sq = ctx.airWing.torpedo;
    sq.takeDamage(sq.hp);

    tick(ctx, CARRIER.squadronRespawnDelay / 2);
    sq.relaunchAt(0, 0, 0);        // player pressed T mid-countdown
    const revivedAt = performance.now();

    tick(ctx, CARRIER.squadronRespawnDelay * 2);
    expect(sq.alive).toBe(true);
    expect(ctx.respawnEvents).toEqual([]);  // no second (timer-driven) relaunch
    expect(revivedAt).toBeGreaterThan(0);
  });
});
