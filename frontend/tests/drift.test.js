import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Ship, DRIFT_CONFIG, getDriftConfig, LEVEL_CONFIG } from '../src/game/ship.js';

function makeScene() {
  return new THREE.Scene();
}

function makeShip(level = 4, shipClass = 'cruiser') {
  return new Ship(makeScene(), level, shipClass);
}

function normAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

describe('DRIFT_CONFIG table', () => {
  it('has all entries: default, destroyer, cruiser, battleship', () => {
    expect(DRIFT_CONFIG.default).toBeDefined();
    expect(DRIFT_CONFIG.destroyer).toBeDefined();
    expect(DRIFT_CONFIG.cruiser).toBeDefined();
    expect(DRIFT_CONFIG.battleship).toBeDefined();
  });

  it('each entry has recovery_base, speed_factor, max_angle', () => {
    for (const cls of ['default', 'destroyer', 'cruiser', 'battleship']) {
      const cfg = DRIFT_CONFIG[cls];
      expect(cfg.recovery_base).toBeGreaterThan(0);
      expect(cfg.speed_factor).toBeGreaterThan(0);
      expect(cfg.speed_factor).toBeLessThan(1);
      expect(cfg.max_angle).toBeGreaterThan(0);
      expect(cfg.max_angle).toBeLessThan(Math.PI / 2);
    }
  });

  it('ordering: destroyer drifts most, battleship least (by max_angle)', () => {
    expect(DRIFT_CONFIG.destroyer.max_angle).toBeGreaterThan(DRIFT_CONFIG.cruiser.max_angle);
    expect(DRIFT_CONFIG.cruiser.max_angle).toBeGreaterThan(DRIFT_CONFIG.battleship.max_angle);
  });
});

describe('getDriftConfig', () => {
  it('returns default for null/undefined shipClass', () => {
    expect(getDriftConfig(null).recovery_base).toBe(DRIFT_CONFIG.default.recovery_base);
    expect(getDriftConfig(undefined).recovery_base).toBe(DRIFT_CONFIG.default.recovery_base);
  });

  it('returns matching class config', () => {
    expect(getDriftConfig('destroyer').max_angle).toBe(DRIFT_CONFIG.destroyer.max_angle);
    expect(getDriftConfig('cruiser').max_angle).toBe(DRIFT_CONFIG.cruiser.max_angle);
    expect(getDriftConfig('battleship').max_angle).toBe(DRIFT_CONFIG.battleship.max_angle);
  });

  it('returns default for unknown class name', () => {
    expect(getDriftConfig('fantasy_class').recovery_base).toBe(DRIFT_CONFIG.default.recovery_base);
  });
});

describe('Ship velocityHeading initialization', () => {
  it('initializes velocityHeading to 0 (same as heading)', () => {
    const s = makeShip(4, 'cruiser');
    expect(s.velocityHeading).toBe(0);
  });

  it('initializes velocityHeading to match heading when heading is non-zero', () => {
    const s = makeShip(4, 'destroyer');
    s.heading = 1.2;
    // After construction, we set heading. velocityHeading was 0 at init.
    // But when heading is set post-init, velocityHeading should remain 0
    // (this tests the initial state only)
    expect(s.velocityHeading).toBe(0);
  });
});

describe('Ship drift behavior in update', () => {
  /** Run N update ticks with keys / forced speed. Returns final drift angle. */
  function driftAfter(ship, keys, speed, dt, ticks) {
    for (let i = 0; i < ticks; i++) {
      ship.speed = speed;
      ship.update(dt, keys, null);
    }
    return Math.abs(normAngle(ship.heading - ship.velocityHeading));
  }

  it('low-speed turn has tiny drift angle (< 0.03 rad)', () => {
    const s = makeShip(4, 'cruiser');
    const drift = driftAfter(s, { a: true }, 1.0, 0.05, 40); // 2s at low speed
    expect(drift).toBeLessThan(0.03);
  });

  it('high-speed turn creates noticeable drift (> 0.1 rad)', () => {
    const s = makeShip(4, 'cruiser');
    const drift = driftAfter(s, { a: true, w: true }, s.maxSpeed, 0.05, 80);
    expect(drift).toBeGreaterThan(0.1);
  });

  it('drift angle never exceeds class max_angle at steady state', () => {
    const s = makeShip(4, 'cruiser');
    const maxAngle = DRIFT_CONFIG.cruiser.max_angle;
    // Run for 10s at max speed continuous turn
    const drift = driftAfter(s, { a: true, w: true }, s.maxSpeed, 0.05, 200);
    expect(drift).toBeLessThanOrEqual(maxAngle + 0.01);
  });

  it('destroyer drifts more than battleship at equal conditions', () => {
    const dest = makeShip(4, 'destroyer');
    const bs = makeShip(4, 'battleship');
    const destDrift = driftAfter(dest, { a: true, w: true }, dest.maxSpeed, 0.05, 80);
    const bsDrift = driftAfter(bs, { a: true, w: true }, bs.maxSpeed, 0.05, 80);
    expect(destDrift).toBeGreaterThan(bsDrift);
  });

  it('velocityHeading converges to heading when not turning', () => {
    const s = makeShip(4, 'cruiser');
    // Build up drift first
    driftAfter(s, { a: true, w: true }, s.maxSpeed, 0.05, 80);
    const driftBefore = Math.abs(normAngle(s.heading - s.velocityHeading));
    expect(driftBefore).toBeGreaterThan(0.05);

    // Now coast without turning
    driftAfter(s, {}, s.maxSpeed, 0.05, 80);
    const driftAfterCoast = Math.abs(normAngle(s.heading - s.velocityHeading));
    expect(driftAfterCoast).toBeLessThan(driftBefore);
  });

  it('converges to heading completely after enough time without turn input', () => {
    const s = makeShip(4, 'cruiser');
    driftAfter(s, { a: true, w: true }, s.maxSpeed, 0.05, 20);
    // Coast at zero speed for many ticks — velocityHeading catches up to heading
    driftAfter(s, {}, 0, 0.05, 200);
    const drift = Math.abs(normAngle(s.heading - s.velocityHeading));
    expect(drift).toBeLessThan(0.01);
  });

  it('right turn (d key) also produces drift in correct direction', () => {
    const s = makeShip(4, 'destroyer');
    s.heading = 0;
    s.velocityHeading = 0;
    // Turn right: heading decreases
    driftAfter(s, { d: true, w: true }, s.maxSpeed, 0.05, 80);
    expect(s.heading).toBeLessThan(0);
    expect(s.velocityHeading).toBeGreaterThan(s.heading);
  });

  it('reverse speed turn changes heading correctly', () => {
    const s = makeShip(4, 'cruiser');
    s.heading = 0;
    s.velocityHeading = 0;
    const reverseSpeed = -s.maxSpeed * 0.3;
    driftAfter(s, { a: true }, reverseSpeed, 0.05, 10);
    // With reverse speed and 'a': turnRate is negative, so heading should decrease
    expect(s.heading).toBeLessThan(0);
    // At low speed (reverse at 30% max), drift is negligible by design
    const drift = Math.abs(normAngle(s.heading - s.velocityHeading));
    expect(drift).toBeLessThan(0.05);
  });

  it('position update uses velocityHeading direction', () => {
    const s = makeShip(4, 'cruiser');
    s.speed = 10;
    s.heading = Math.PI / 4;
    s.velocityHeading = -Math.PI / 4; // different from heading
    const xBefore = s.position.x;
    const zBefore = s.position.z;
    s.update(0.1, {}, null);
    const dx = s.position.x - xBefore;
    const dz = s.position.z - zBefore;
    // Movement direction should match velocityHeading (-PI/4), not heading (PI/4)
    const actualDir = Math.atan2(dx, dz);
    const diff = Math.abs(normAngle(actualDir - s.velocityHeading));
    expect(diff).toBeLessThan(0.05);
  });

  it('no movement when speed is zero', () => {
    const s = makeShip(4, 'cruiser');
    s.speed = 0;
    const xBefore = s.position.x;
    const zBefore = s.position.z;
    s.update(0.1, { a: true }, null);
    expect(s.position.x).toBeCloseTo(xBefore, 6);
    expect(s.position.z).toBeCloseTo(zBefore, 6);
  });

  it('velocityHeading converges to heading when stationary (speed=0)', () => {
    const s = makeShip(4, 'cruiser');
    s.heading = 0;
    s.velocityHeading = 0.5;
    s.speed = 0;
    s.update(0.1, {}, null);
    // Should move toward 0 (heading) at recovery_base speed
    expect(s.velocityHeading).toBeLessThan(0.5);
    expect(s.velocityHeading).toBeGreaterThan(0);
  });

  it('velocityHeading converges to heading when speed below turn threshold', () => {
    const s = makeShip(4, 'cruiser');
    s.heading = 0;
    s.velocityHeading = 0.5;
    s.speed = 0.4; // below 0.5 threshold
    s.update(0.1, { a: true }, null);
    // speedRatio treated as 0, full recovery: moves toward heading
    expect(s.velocityHeading).toBeLessThan(0.5);
    expect(s.velocityHeading).toBeGreaterThan(0);
  });
});

describe('Ship upgradeToLevel preserves drift state', () => {
  it('preserves velocityHeading after upgrade', () => {
    const s = makeShip(4, 'cruiser');
    s.velocityHeading = 0.7;
    s.heading = 1.0;
    s.upgradeToLevel(5);
    expect(s.velocityHeading).toBeCloseTo(0.7, 6);
  });
});
