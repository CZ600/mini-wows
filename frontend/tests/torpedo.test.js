import { describe, it, expect } from 'vitest';
import {
  TORPEDO_TIERS,
  getTorpedoStats,
  calcSpreadAngles,
} from '../src/game/torpedo.js';

describe('TORPEDO_TIERS', () => {
  it('defines tiers 1, 2, 3', () => {
    expect(TORPEDO_TIERS[1]).toBeDefined();
    expect(TORPEDO_TIERS[2]).toBeDefined();
    expect(TORPEDO_TIERS[3]).toBeDefined();
  });

  it('tier 1 is fastest and shortest', () => {
    expect(TORPEDO_TIERS[1].speed).toBeGreaterThan(TORPEDO_TIERS[2].speed);
    expect(TORPEDO_TIERS[1].range).toBeLessThan(TORPEDO_TIERS[2].range);
  });

  it('tier 3 is slowest and longest', () => {
    expect(TORPEDO_TIERS[3].speed).toBeLessThan(TORPEDO_TIERS[2].speed);
    expect(TORPEDO_TIERS[3].range).toBeGreaterThan(TORPEDO_TIERS[2].range);
  });
});

describe('getTorpedoStats', () => {
  it('applies level scaling to range and speed', () => {
    const base = getTorpedoStats(1, 4);
    const higher = getTorpedoStats(1, 8);
    expect(higher.range).toBeGreaterThan(base.range);
    expect(higher.speed).toBeGreaterThan(base.speed);
  });

  it('returns null for invalid tier', () => {
    expect(getTorpedoStats(0, 4)).toBeNull();
    expect(getTorpedoStats(4, 4)).toBeNull();
  });

  it('includes cooldown', () => {
    const stats = getTorpedoStats(1, 4);
    expect(stats.cooldown).toBeGreaterThan(0);
  });

  it('cooldown decreases with level', () => {
    const low = getTorpedoStats(1, 4);
    const high = getTorpedoStats(1, 10);
    expect(high.cooldown).toBeLessThan(low.cooldown);
  });
});

describe('calcSpreadAngles', () => {
  it('returns empty array for 0 tubes', () => {
    expect(calcSpreadAngles(0, 'narrow')).toEqual([]);
  });

  it('single tube returns [0]', () => {
    const angles = calcSpreadAngles(1, 'narrow');
    expect(angles).toEqual([0]);
  });

  it('narrow spread is within ±5°', () => {
    const angles = calcSpreadAngles(4, 'narrow');
    const maxAngle = 5 * Math.PI / 180;
    for (const a of angles) {
      expect(Math.abs(a)).toBeLessThanOrEqual(maxAngle + 0.001);
    }
  });

  it('wide spread is within ±15°', () => {
    const angles = calcSpreadAngles(4, 'wide');
    const maxAngle = 15 * Math.PI / 180;
    for (const a of angles) {
      expect(Math.abs(a)).toBeLessThanOrEqual(maxAngle + 0.001);
    }
  });

  it('returns correct count of angles', () => {
    expect(calcSpreadAngles(3, 'narrow').length).toBe(3);
    expect(calcSpreadAngles(6, 'wide').length).toBe(6);
  });
});
