// Behavior tests for the sailing wake system: emission is speed-gated and
// dive-aware, spray particles fly ballistically, foam hugs the surface, and
// the trailing foam ribbon accumulates while underway and drains after the
// ship stops.
import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { Ship } from '../ship.js';

function makeShip() {
  const scene = new THREE.Scene();
  const ship = new Ship(scene, 5, null);
  ship.position.set(0, 0, 0);
  ship.heading = 0;
  ship.velocityHeading = 0;
  return ship;
}

function activeCount(ship) {
  return ship._wakeData.filter((p) => p.active).length;
}

describe('wake emission gating', () => {
  let ship;
  beforeEach(() => { ship = makeShip(); });

  it('emits spray/foam while under way', () => {
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 60; i++) ship.tickWake(1 / 30);
    expect(activeCount(ship)).toBeGreaterThan(10);
  });

  it('emits nothing when stopped', () => {
    ship.speed = 0;
    for (let i = 0; i < 60; i++) ship.tickWake(1 / 30);
    expect(activeCount(ship)).toBe(0);
  });

  it('emits nothing while diving/submerged', () => {
    ship.speed = ship.maxSpeed;
    ship.diveTransition = 1;
    for (let i = 0; i < 60; i++) ship.tickWake(1 / 30);
    expect(activeCount(ship)).toBe(0);
  });
});

describe('wake particle behavior', () => {
  let ship;
  beforeEach(() => { ship = makeShip(); });

  it('emits both spray (ballistic) and foam (surface) particles', () => {
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 120; i++) ship.tickWake(1 / 30);
    const types = new Set(ship._wakeData.filter((p) => p.active).map((p) => p.type));
    expect(types.has(0)).toBe(true);
    expect(types.has(1)).toBe(true);
  });

  it('spray particles fall and die out; foam particles stay at the surface', () => {
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 60; i++) ship.tickWake(1 / 30);
    // Long soak at rest: every particle must eventually retire.
    ship.speed = 0;
    for (let i = 0; i < 400; i++) ship.tickWake(0.05);
    expect(activeCount(ship)).toBe(0);
    // Spray never sinks below the water plane while alive.
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 60; i++) ship.tickWake(1 / 30);
    for (const p of ship._wakeData) {
      if (p.active) expect(p.y).toBeGreaterThanOrEqual(0.18);
    }
  });
});

describe('wake trail ribbon', () => {
  let ship;
  beforeEach(() => { ship = makeShip(); });

  it('accumulates path points while underway and caps the history', () => {
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 200; i++) {
      ship.position.x += Math.sin(ship.velocityHeading) * ship.speed * (1 / 30);
      ship.position.z += Math.cos(ship.velocityHeading) * ship.speed * (1 / 30);
      ship.tickWake(1 / 30);
    }
    expect(ship._trailPts.length).toBeGreaterThan(2);
    expect(ship._trailPts.length).toBeLessThanOrEqual(ship._trailMax);
    expect(ship._trailMesh.visible).toBe(true);
  });

  it('fades out and drains after the ship stops', () => {
    ship.speed = ship.maxSpeed;
    for (let i = 0; i < 100; i++) {
      ship.position.x += ship.speed * (1 / 30);
      ship.tickWake(1 / 30);
    }
    ship.speed = 0;
    for (let i = 0; i < 30; i++) ship.tickWake(0.5); // 15s > trail life
    expect(ship._trailPts.length).toBe(0);
    expect(ship._trailMesh.visible).toBe(false);
  });
});
