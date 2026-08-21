// Depth-charge (深水炸弹) client logic tests: the band clamp shared by the
// aim indicator and the release path, plus the config mirror of the server's
// ASW tables.
import { describe, it, expect } from 'vitest';
import {
  CLASS_ASW, ASW_BLAST_RADIUS, ASW_FUSE_DELAY, getClassAsw, getAswTier, clampAswAim,
} from '../config.js';

describe('depth-charge class fits (mirror game/config.py CLASS_ASW)', () => {
  it('gives destroyer/cruiser close-range hull drops with a min band', () => {
    const dd = getClassAsw('destroyer');
    expect(dd.tier).toBe(2);
    expect(dd.air).toBe(false);
    expect(dd.min).toBeGreaterThan(0);
    expect(dd.min).toBeLessThan(dd.range);

    const ca = getClassAsw('cruiser');
    expect(ca.tier).toBe(1);
    expect(ca.air).toBe(false);
    expect(ca.min).toBeLessThan(ca.range);
  });

  it('gives the battleship an air-dropped strike instead', () => {
    const bb = getClassAsw('battleship');
    expect(bb.air).toBe(true);
    expect(bb.range).toBeGreaterThan(0);
  });

  it('denies ASW to submarines and carriers', () => {
    expect(getClassAsw('submarine')).toBeNull();
    expect(getClassAsw('carrier')).toBeNull();
  });

  it('uses a delayed large blast', () => {
    expect(ASW_FUSE_DELAY).toBeGreaterThan(0);
    expect(ASW_BLAST_RADIUS).toBeGreaterThanOrEqual(100);
    expect(getAswTier(2).damage).toBeGreaterThan(getAswTier(1).damage);
  });
});

describe('clampAswAim', () => {
  const ship = { x: 0, z: 0 };

  it('clamps an over-range aim onto the band edge along the same bearing', () => {
    const fit = CLASS_ASW.destroyer;
    const out = clampAswAim(ship, { x: 0, z: 99999 }, fit);
    expect(out.z).toBeCloseTo(fit.range, 6);
    expect(out.x).toBeCloseTo(0, 6);
  });

  it('pushes a too-close aim out to the min band edge (never own deck)', () => {
    const fit = CLASS_ASW.destroyer;
    const out = clampAswAim(ship, { x: 0, z: 5 }, fit);
    expect(out.z).toBeCloseTo(fit.min, 6);
  });

  it('keeps an in-band aim untouched', () => {
    const fit = CLASS_ASW.cruiser;
    const out = clampAswAim(ship, { x: 30, z: 40 }, fit); // dist 50 = fit.min..range
    expect(out.x).toBeCloseTo(30, 6);
    expect(out.z).toBeCloseTo(40, 6);
  });

  it('air fits only clamp distance to range (no min push)', () => {
    const fit = CLASS_ASW.battleship;
    const near = clampAswAim(ship, { x: 0, z: 10 }, fit);
    expect(near.z).toBeCloseTo(10, 6);
    const far = clampAswAim(ship, { x: 0, z: 99999 }, fit);
    expect(far.z).toBeCloseTo(fit.range, 6);
  });

  it('preserves bearing when clamping diagonally', () => {
    const fit = CLASS_ASW.destroyer;
    const out = clampAswAim(ship, { x: 3000, z: 4000 }, fit); // bearing ~36.9°
    const dist = Math.hypot(out.x, out.z);
    expect(dist).toBeCloseTo(fit.range, 6);
    expect(out.x / out.z).toBeCloseTo(3000 / 4000, 4);
  });
});
