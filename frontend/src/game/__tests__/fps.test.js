// Regression tests for the FPS EMA guard: a single degenerate frame
// (dt = 0 / NaN — duplicated rAF timestamps, a briefly duplicated render
// loop) used to poison the average to Infinity and then NaN permanently,
// which the HUD rendered as "0" forever.
import { describe, it, expect } from 'vitest';
import { updateFpsEMA } from '../fps.js';

describe('updateFpsEMA', () => {
  it('converges toward the measured frame rate', () => {
    let fps = 60;
    for (let i = 0; i < 500; i++) fps = updateFpsEMA(fps, 1 / 144);
    expect(fps).toBeGreaterThan(140);
    expect(fps).toBeLessThan(150);
  });

  it('survives repeated zero-dt frames without becoming NaN/Infinity', () => {
    let fps = 60;
    for (let i = 0; i < 100; i++) fps = updateFpsEMA(fps, 0);
    expect(Number.isFinite(fps)).toBe(true);
    // The previously-broken sequence: dt=0 → 1/0=Infinity folds in, then
    // Infinity - Infinity = NaN poisons the average forever.
    let poisoned = updateFpsEMA(60, 0);
    poisoned = updateFpsEMA(poisoned, 0);
    poisoned = updateFpsEMA(poisoned, 1 / 60);
    expect(Number.isFinite(poisoned)).toBe(true);
  });

  it('ignores NaN dt', () => {
    const fps = updateFpsEMA(60, NaN);
    expect(fps).toBe(60);
  });

  it('skips sub-millisecond (degenerate) samples', () => {
    const fps = updateFpsEMA(60, 0.000001);
    expect(fps).toBe(60);
  });

  it('self-heals a poisoned average', () => {
    expect(updateFpsEMA(NaN, 1 / 60)).toBeGreaterThan(0);
    expect(Number.isFinite(updateFpsEMA(Infinity, 1 / 60))).toBe(true);
    expect(Number.isFinite(updateFpsEMA(-Infinity, 1 / 60))).toBe(true);
  });
});
