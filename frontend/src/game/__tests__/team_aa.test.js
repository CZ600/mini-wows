// Team-mode AA wiring regression: the team loop must drive BOTH sides'
// automatic AA — the red ships flak the player's live carrier squadrons, and
// the wingmen flak the engine-spawned enemy strike planes. Before the fix the
// team loop never called any unit's updateAaDefense.
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine.js';

function makeUnit(isWingman = false) {
  return {
    isWingman,
    calls: [],
    updateAaDefense(dt, hostiles, pm) { this.calls.push({ hostiles, pm }); },
  };
}

function makeCtx() {
  const pm = { fired: [] };
  const red = makeUnit(false);
  const wing = makeUnit(true);
  const wing2 = makeUnit(true);
  const torpedo = { alive: true };
  const bomber = { alive: false };            // dead: must be filtered out
  const strike = { alive: true };
  const ctx = {
    reds: [red],
    teamUnits: [wing, wing2, red],            // mixed list; wingmen picked by flag
    airWing: { torpedo, bomber },
    _enemySquadrons: [strike],
    projectileManager: pm,
    _red: red, _wing: wing, _wing2: wing2, _torpedo: torpedo, _strike: strike,
  };
  // The engine method calls its siblings off `this` — bind them onto the stub.
  ctx._runAaDefense = GameEngine.prototype._runAaDefense.bind(ctx);
  ctx._playerWingSquadrons = GameEngine.prototype._playerWingSquadrons.bind(ctx);
  return ctx;
}

describe('engine _updateTeamAaDefense', () => {
  it('reds target the player wing; wingmen target enemy strike planes', () => {
    const ctx = makeCtx();
    GameEngine.prototype._updateTeamAaDefense.call(ctx, 0.05);

    // Red ship: hostile list = live player squadrons only.
    expect(ctx._red.calls.length).toBe(1);
    expect(ctx._red.calls[0].hostiles).toEqual([ctx._torpedo]);
    expect(ctx._red.calls[0].pm).toBe(ctx.projectileManager);

    // Both wingmen: hostile list = the enemy strike squadron.
    for (const w of [ctx._wing, ctx._wing2]) {
      expect(w.calls.length).toBe(1);
      expect(w.calls[0].hostiles).toEqual([ctx._strike]);
    }
  });

  it('is a no-op with empty lists', () => {
    const ctx = { reds: [], teamUnits: [], airWing: null, _enemySquadrons: [], projectileManager: {} };
    ctx._runAaDefense = GameEngine.prototype._runAaDefense.bind(ctx);
    ctx._playerWingSquadrons = GameEngine.prototype._playerWingSquadrons.bind(ctx);
    expect(() => GameEngine.prototype._updateTeamAaDefense.call(ctx, 0.05)).not.toThrow();
  });
});
