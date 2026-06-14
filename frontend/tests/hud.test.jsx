// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HUD from '../src/components/HUD.jsx';

function slotKeys(container) {
  return Array.from(container.querySelectorAll('.weapon-slot-key')).map(el => el.textContent);
}

function slotNames(container) {
  return Array.from(container.querySelectorAll('.weapon-slot .weapon-slot-name')).map(el => el.textContent);
}

function fillWidths(container) {
  return Array.from(container.querySelectorAll('.reload-bar-fill')).map(el => parseFloat(el.style.width));
}

describe('HUD torpedo display', () => {
  const baseData = {
    hp: 100,
    maxHp: 100,
    speed: 50,
    level: 5,
    score: 200,
    enemyCount: 5,
    wave: 3,
    turrets: [
      { cooldown: 0, maxCooldown: 5, isFront: true },
      { cooldown: 2, maxCooldown: 5, isFront: false },
    ],
    currentThreshold: 150,
    nextThreshold: 250,
    weaponMode: 'torpedo',
    torpedoTier: 1,
    torpedoSpread: 'narrow',
    torpedoTubes: [
      { index: 0, cooldown: 0, side: 'port', ready: true },
      { index: 1, cooldown: 3, side: 'port', ready: false },
      { index: 2, cooldown: 5, side: 'starboard', ready: false },
    ],
    torpedoMaxCooldown: 8,
    shipClass: 'destroyer',
    availableTorpedoTiers: [1, 2, 3],
  };

  it('renders reload bar (not weapon-box) for current weapon', () => {
    render(<HUD data={baseData} />);
    expect(screen.queryByText('左1')).toBeNull();
    expect(screen.queryByText('左2')).toBeNull();
    expect(screen.queryByText('右1')).toBeNull();

    expect(screen.getAllByText(/鱼雷/).length).toBeGreaterThan(0);
    expect(screen.getByText('装填')).toBeTruthy();
  });

  it('shows unified cooldown progress as max of all tubes', () => {
    const { container } = render(<HUD data={baseData} />);
    // torpedoMaxCooldown=8, max remaining=5 → fill = (8-5)/8 ≈ 37.5%
    const widths = fillWidths(container);
    expect(widths.length).toBeGreaterThan(0);
    expect(widths[0]).toBeCloseTo(37.5, 1);
  });

  it('shows ready when all tubes are ready', () => {
    const readyData = {
      ...baseData,
      torpedoTubes: [
        { index: 0, cooldown: 0, side: 'port', ready: true },
        { index: 1, cooldown: 0, side: 'port', ready: true },
      ],
    };
    const { container } = render(<HUD data={readyData} />);
    expect(container.querySelectorAll('.reload-bar-fill.ready').length).toBeGreaterThan(0);
  });

  it('does not show 装填 reload bar when in gun mode', () => {
    const gunData = { ...baseData, weaponMode: 'gun' };
    render(<HUD data={gunData} />);
    expect(screen.queryByText('装填')).toBeNull();
  });

  it('renders one reload bar per turret in gun mode', () => {
    const gunData = { ...baseData, weaponMode: 'gun' };
    const { container } = render(<HUD data={gunData} />);
    expect(screen.getByText('前1')).toBeTruthy();
    expect(screen.getByText('后1')).toBeTruthy();
    // 前1 cooldown=0/max=5 → 100% (ready); 后1 cooldown=2/max=5 → 60%
    const widths = fillWidths(container);
    expect(widths.length).toBe(2);
    expect(widths[0]).toBeCloseTo(100, 1);
    expect(widths[1]).toBeCloseTo(60, 1);
  });

  it('shows weapon slot key hints (1 for gun, 2/3/4 for torpedo tiers)', () => {
    const { container } = render(<HUD data={baseData} />);
    expect(slotKeys(container)).toEqual(['1', '2', '3', '4']);
    expect(slotNames(container)).toEqual(['火炮', '鱼雷', '鱼雷', '鱼雷']);
  });

  it('only shows torpedo slots for available tiers', () => {
    const cruiserData = {
      ...baseData,
      availableTorpedoTiers: [1],
    };
    const { container } = render(<HUD data={cruiserData} />);
    expect(slotKeys(container)).toEqual(['1', '2']);
  });

  it('hides all torpedo slots when no tier available (battleship)', () => {
    const battleshipData = {
      ...baseData,
      availableTorpedoTiers: [],
      torpedoTubes: [],
    };
    const { container } = render(<HUD data={battleshipData} />);
    expect(slotKeys(container)).toEqual(['1']);
  });
});
