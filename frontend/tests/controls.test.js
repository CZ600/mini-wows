// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Controls } from '../src/game/controls.js';

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
