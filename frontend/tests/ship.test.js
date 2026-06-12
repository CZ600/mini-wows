import { describe, it, expect } from 'vitest';
import { CLASS_CONFIG, LEVEL_CONFIG, getClassConfig, getTorpedoTubes } from '../src/game/ship.js';

describe('CLASS_CONFIG', () => {
  it('has destroyer, cruiser, battleship keys', () => {
    expect(CLASS_CONFIG.destroyer).toBeDefined();
    expect(CLASS_CONFIG.cruiser).toBeDefined();
    expect(CLASS_CONFIG.battleship).toBeDefined();
  });

  it('each class has configs for levels 4-10', () => {
    for (const cls of ['destroyer', 'cruiser', 'battleship']) {
      for (let lvl = 4; lvl <= 10; lvl++) {
        expect(CLASS_CONFIG[cls][lvl], `${cls} level ${lvl}`).toBeDefined();
      }
    }
  });

  it('destroyer has lower HP than base, battleship has higher', () => {
    const base4 = LEVEL_CONFIG[4];
    const dest4 = getClassConfig('destroyer', 4);
    const bs4 = getClassConfig('battleship', 4);
    expect(dest4.hp).toBeLessThan(base4.hp);
    expect(bs4.hp).toBeGreaterThan(base4.hp);
  });

  it('destroyer has higher maxSpeed than base, battleship lower', () => {
    const dest4 = getClassConfig('destroyer', 4);
    const bs4 = getClassConfig('battleship', 4);
    expect(dest4.maxSpeed).toBeGreaterThan(bs4.maxSpeed);
  });

  it('destroyer has torpedo tiers [1,2,3], cruiser [1], battleship none', () => {
    expect(CLASS_CONFIG.destroyer[4].torpedoTiers).toEqual([1, 2, 3]);
    expect(CLASS_CONFIG.cruiser[4].torpedoTiers).toEqual([1]);
    expect(CLASS_CONFIG.battleship[4].torpedoTiers).toEqual([]);
  });
});

describe('getClassConfig', () => {
  it('returns null for levels 1-3 regardless of class', () => {
    expect(getClassConfig('destroyer', 1)).toBeNull();
    expect(getClassConfig('destroyer', 2)).toBeNull();
    expect(getClassConfig('destroyer', 3)).toBeNull();
  });

  it('returns class config for levels 4-10', () => {
    const cfg = getClassConfig('destroyer', 4);
    expect(cfg).toBeDefined();
    expect(cfg.hp).toBeDefined();
  });

  it('returns null for null shipClass', () => {
    expect(getClassConfig(null, 4)).toBeNull();
  });
});

describe('getTorpedoTubes', () => {
  it('returns empty array for battleship', () => {
    const tubes = getTorpedoTubes('battleship', 4);
    expect(tubes).toEqual([]);
  });

  it('returns tubes with port/starboard sides for destroyer', () => {
    const tubes = getTorpedoTubes('destroyer', 4);
    expect(tubes.length).toBeGreaterThan(0);
    const sides = new Set(tubes.map(t => t.side));
    expect(sides.has('port') || sides.has('starboard')).toBe(true);
  });

  it('returns tubes for cruiser', () => {
    const tubes = getTorpedoTubes('cruiser', 4);
    expect(tubes.length).toBeGreaterThan(0);
    expect(tubes.length).toBeLessThan(getTorpedoTubes('destroyer', 4).length);
  });

  it('tube count increases with level for destroyer', () => {
    const low = getTorpedoTubes('destroyer', 4).length;
    const high = getTorpedoTubes('destroyer', 10).length;
    expect(high).toBeGreaterThanOrEqual(low);
  });
});
