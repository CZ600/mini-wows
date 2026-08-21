// Carrier deck-layout regression: the self-defense battery must hug the
// flight-deck edges (bow group forward, stern group aft, sides alternating)
// so the deck centreline stays clear for aircraft — and the island must not
// bury an AA mount. Runs headless (no DOM — textures degrade to plain colours).
import { describe, it, expect } from 'vitest';
import { buildShipModel, buildTurretDefs } from '../ship_model.js';
import { getClassConfig } from '../ship.js';

const CFGS = {
  lv4: getClassConfig('carrier', 4),
  lv6: getClassConfig('carrier', 6),
  lv10: getClassConfig('carrier', 10),
};

describe('carrier deck-edge self-defense battery', () => {
  it('keeps the turret count and front/back split intact', () => {
    for (const cfg of Object.values(CFGS)) {
      const defs = buildTurretDefs(cfg, 'carrier');
      expect(defs).toHaveLength(cfg.frontTurrets + cfg.backTurrets);
      expect(defs.filter(d => d.isFront).length).toBe(cfg.frontTurrets);
      expect(defs.filter(d => !d.isFront).length).toBe(cfg.backTurrets);
    }
  });

  it('places every gun off the centreline, on the flight-deck edge', () => {
    for (const cfg of Object.values(CFGS)) {
      const model = buildShipModel(cfg, 'carrier');
      expect(model.turrets.length).toBe(cfg.frontTurrets + cfg.backTurrets);
      for (const t of model.turrets) {
        const x = t.group.position.x;
        // Hugging the edge: outside 70% of the flight-deck half-width.
        expect(Math.abs(x)).toBeGreaterThan(cfg.width * 0.98 * 0.5 * 0.7);
        // ...but not hanging past the deck edge.
        expect(Math.abs(x)).toBeLessThanOrEqual(cfg.width * 0.98 * 0.5 + 0.01);
        // Sitting on the flight-deck top (deckY + 0.1 gap + 0.4 slab), plus
        // the tiny sheer rise toward the bow (deckYAt follows the deck line).
        expect(t.group.position.y).toBeGreaterThanOrEqual(model.deckY + 0.5);
        expect(t.group.position.y).toBeLessThan(model.deckY + 0.7);
        // Bow group forward of midships, stern group aft.
        expect(Math.sign(t.group.position.z)).toBe(t.isFront ? 1 : -1);
      }
    }
  });

  it('clears the centreline corridor for aircraft ops', () => {
    for (const cfg of Object.values(CFGS)) {
      const model = buildShipModel(cfg, 'carrier');
      for (const t of model.turrets) {
        // Gunhouse sweep (half-diagonal) never reaches the deck centre strip.
        const size = model.turretSize;
        const sweep = Math.hypot(size / 2, size * 1.7 / 2);
        expect(Math.abs(t.group.position.x) - sweep).toBeGreaterThan(0);
      }
    }
  });

  it('keeps AA mounts out of the starboard island footprint', () => {
    for (const cfg of Object.values(CFGS)) {
      const model = buildShipModel(cfg, 'carrier');
      expect(model.aaMounts.length).toBeGreaterThan(0);
      const islLo = -cfg.length * 0.115, islHi = cfg.length * 0.015;
      const islX = cfg.width * 0.98 * 0.32 - cfg.width * 0.16 / 2;
      for (const m of model.aaMounts) {
        const inIslandZ = m.group.position.z >= islLo && m.group.position.z <= islHi;
        const inIslandX = m.group.position.x >= islX;
        expect(inIslandZ && inIslandX).toBe(false);
      }
    }
  });
});
