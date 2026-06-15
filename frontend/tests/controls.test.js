// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Controls, GEAR_RATIOS } from '../src/game/controls.js';

function mockCanvas() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    requestPointerLock: vi.fn(),
  };
}

describe('Controls weapon state', () => {
  it('defaults to gun mode', () => {
    const c = new Controls(mockCanvas());
    expect(c.weaponMode).toBe('gun');
    expect(c.torpedoTier).toBe(1);
    expect(c.torpedoSpread).toBe('narrow');
    c.destroy();
  });

  it('switches to torpedo mode on key 2', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c._onKeyDown({ key: '2', preventDefault: () => {} });
    expect(c.weaponMode).toBe('torpedo');
    expect(c.torpedoTier).toBe(1);
    c.destroy();
  });

  it('switches to gun mode on key 1', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c.weaponMode = 'torpedo';
    c._onKeyDown({ key: '1', preventDefault: () => {} });
    expect(c.weaponMode).toBe('gun');
    c.destroy();
  });

  it('switches torpedo tier to 2 on key 3', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c._onKeyDown({ key: '3', preventDefault: () => {} });
    expect(c.weaponMode).toBe('torpedo');
    expect(c.torpedoTier).toBe(2);
    c.destroy();
  });

  it('switches torpedo tier to 3 on key 4', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c._onKeyDown({ key: '4', preventDefault: () => {} });
    expect(c.weaponMode).toBe('torpedo');
    expect(c.torpedoTier).toBe(3);
    c.destroy();
  });

  it('double-tap key 3 toggles spread mode', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c._onKeyDown({ key: '3', preventDefault: () => {} });
    expect(c.torpedoSpread).toBe('narrow');
    c._onKeyDown({ key: '3', preventDefault: () => {} });
    expect(c.torpedoSpread).toBe('wide');
    c._onKeyDown({ key: '3', preventDefault: () => {} });
    expect(c.torpedoSpread).toBe('narrow');
    c.destroy();
  });

  it('keys 2/3/4 have no effect when not locked', () => {
    const c = new Controls(mockCanvas());
    c.locked = false;
    c._onKeyDown({ key: '2', preventDefault: () => {} });
    expect(c.weaponMode).toBe('gun');
    c.destroy();
  });

  it('exposes setTorpedoCapabilities for restricting tiers', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c.setTorpedoCapabilities({ availableTiers: [1] });
    c._onKeyDown({ key: '3', preventDefault: () => {} });
    expect(c.torpedoTier).toBe(1);
    c._onKeyDown({ key: '4', preventDefault: () => {} });
    expect(c.torpedoTier).toBe(1);
    c.destroy();
  });
});

describe('Controls canvas swap', () => {
  it('rebinds listeners to the new canvas on attachCanvas', () => {
    const canvasA = mockCanvas();
    const c = new Controls(canvasA);
    expect(canvasA.addEventListener).toHaveBeenCalledWith('click', c._onClick);
    expect(canvasA.addEventListener).toHaveBeenCalledWith('contextmenu', c._onContextMenu);

    const canvasB = mockCanvas();
    c.attachCanvas(canvasB);

    // Old canvas listeners removed
    expect(canvasA.removeEventListener).toHaveBeenCalledWith('click', c._onClick);
    expect(canvasA.removeEventListener).toHaveBeenCalledWith('contextmenu', c._onContextMenu);
    // New canvas listeners added
    expect(canvasB.addEventListener).toHaveBeenCalledWith('click', c._onClick);
    expect(canvasB.addEventListener).toHaveBeenCalledWith('contextmenu', c._onContextMenu);
    // Internal canvas reference updated
    expect(c.canvas).toBe(canvasB);
    c.destroy();
  });

  it('uses the new canvas for pointer lock after attachCanvas', () => {
    const canvasA = mockCanvas();
    const c = new Controls(canvasA);
    const canvasB = mockCanvas();
    c.attachCanvas(canvasB);

    c.locked = false;
    c._onClick();
    expect(canvasB.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(canvasA.requestPointerLock).not.toHaveBeenCalled();
    c.destroy();
  });

  it('lock check compares against the current canvas after attachCanvas', () => {
    const canvasA = mockCanvas();
    const c = new Controls(canvasA);
    const canvasB = mockCanvas();
    c.attachCanvas(canvasB);

    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => canvasB,
    });
    c._onLockChange();
    expect(c.locked).toBe(true);

    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => canvasA,
    });
    c._onLockChange();
    expect(c.locked).toBe(false);

    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => null,
    });
    c.destroy();
  });

  it('destroy removes listeners from the current (post-swap) canvas', () => {
    const canvasA = mockCanvas();
    const c = new Controls(canvasA);
    const canvasB = mockCanvas();
    c.attachCanvas(canvasB);
    c.destroy();
    expect(canvasB.removeEventListener).toHaveBeenCalledWith('click', c._onClick);
  });
});

describe('Controls gear state', () => {
  it('exposes GEAR_RATIOS with 6 entries (reverse → full ahead)', () => {
    expect(GEAR_RATIOS).toHaveLength(6);
    expect(GEAR_RATIOS[0]).toBe(-0.3);  // 倒退：max * 0.3 反向
    expect(GEAR_RATIOS[1]).toBe(0);     // 停车
    expect(GEAR_RATIOS[2]).toBe(0.25);  // 前进1
    expect(GEAR_RATIOS[3]).toBe(0.5);   // 前进2
    expect(GEAR_RATIOS[4]).toBe(0.75);  // 前进3
    expect(GEAR_RATIOS[5]).toBe(1.0);   // 前进4
  });

  it('defaults to gear 1 (停车)', () => {
    const c = new Controls(mockCanvas());
    expect(c.gear).toBe(1);
    c.destroy();
  });

  it('W in locked state raises gear by one per press', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    expect(c.gear).toBe(1);
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(2);
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(3);
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(4);
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(5);
    c.destroy();
  });

  it('W clamps at gear 5 (前进4)', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c.gear = 5;
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(5);
    c.destroy();
  });

  it('S in locked state lowers gear by one per press', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c.gear = 5;
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(4);
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(3);
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(2);
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(1);
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(0);
    c.destroy();
  });

  it('S clamps at gear 0 (倒退)', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c.gear = 0;
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(0);
    c.destroy();
  });

  it('W/S have no effect when not locked', () => {
    const c = new Controls(mockCanvas());
    c.locked = false;
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(1);
    c._onKeyDown({ key: 's', repeat: false, preventDefault: () => {} });
    expect(c.gear).toBe(1);
    c.destroy();
  });

  it('W/S ignored on auto-repeat (e.repeat=true) to prevent rapid gear cycling', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    c._onKeyDown({ key: 'w', repeat: true, preventDefault: () => {} });
    expect(c.gear).toBe(1);
    c.gear = 5;
    c._onKeyDown({ key: 's', repeat: true, preventDefault: () => {} });
    expect(c.gear).toBe(5);
    c.destroy();
  });

  it('W/S do not touch keys.w/keys.s (those are derived from gear + speed)', () => {
    const c = new Controls(mockCanvas());
    c.locked = true;
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c._onKeyDown({ key: 'w', repeat: false, preventDefault: () => {} });
    c._onKeyUp({ key: 'w' });
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('A/D still drive keys.a/keys.d as held state', () => {
    const c = new Controls(mockCanvas());
    c._onKeyDown({ key: 'a', repeat: false, preventDefault: () => {} });
    expect(c.keys.a).toBe(true);
    c._onKeyUp({ key: 'a' });
    expect(c.keys.a).toBe(false);
    c.destroy();
  });
});

describe('Controls updateMotionKeys', () => {
  const MAX = 16.67;

  it('gear 1 (停车) at speed 0 → idle', () => {
    const c = new Controls(mockCanvas());
    c.gear = 1;
    c.updateMotionKeys(0, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 1 (停车) with forward speed → brake (s)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 1;
    c.updateMotionKeys(5, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(true);
    c.destroy();
  });

  it('gear 5 (前进4) at speed 0 → accelerate forward (w)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 5;
    c.updateMotionKeys(0, MAX);
    expect(c.keys.w).toBe(true);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 5 (前进4) at full speed → idle', () => {
    const c = new Controls(mockCanvas());
    c.gear = 5;
    c.updateMotionKeys(MAX, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 5 (前进4) slightly over target → idle (epsilon tolerance)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 5;
    c.updateMotionKeys(MAX + 0.04, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 5 (前进4) clearly over target → slow down (s)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 5;
    c.updateMotionKeys(MAX + 0.5, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(true);
    c.destroy();
  });

  it('gear 0 (倒退) at speed 0 → accelerate backward (s)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 0;
    c.updateMotionKeys(0, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(true);
    c.destroy();
  });

  it('gear 0 (倒退) at -max*0.3 → idle', () => {
    const c = new Controls(mockCanvas());
    c.gear = 0;
    c.updateMotionKeys(-MAX * 0.3, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 2 (前进1, 0.25) at speed 0 → w', () => {
    const c = new Controls(mockCanvas());
    c.gear = 2;
    c.updateMotionKeys(0, MAX);
    expect(c.keys.w).toBe(true);
    expect(c.keys.s).toBe(false);
    c.destroy();
  });

  it('gear 3 (前进2, 0.5) at full speed → slow down (s)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 3;
    c.updateMotionKeys(MAX, MAX);
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(true);
    c.destroy();
  });

  it('switching from ahead gear to reverse: still moving forward → brake first (s)', () => {
    const c = new Controls(mockCanvas());
    c.gear = 0; // 倒退
    c.updateMotionKeys(MAX * 0.8, MAX); // 但当前还在全速前进
    expect(c.keys.w).toBe(false);
    expect(c.keys.s).toBe(true);
    c.destroy();
  });
});
