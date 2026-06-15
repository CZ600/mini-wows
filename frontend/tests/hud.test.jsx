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

  it('shows 0% fill right after firing (cooldown == maxCooldown)', () => {
    const justFired = {
      ...baseData,
      weaponMode: 'gun',
      turrets: [
        { cooldown: 5, maxCooldown: 5, isFront: true },
        { cooldown: 4.5, maxCooldown: 5, isFront: false },
      ],
    };
    const { container } = render(<HUD data={justFired} />);
    const widths = fillWidths(container);
    expect(widths[0]).toBeCloseTo(0, 1);       // just fired → 0%
    expect(widths[1]).toBeCloseTo(10, 1);      // 0.5s elapsed of 5s → 10%
    expect(container.querySelectorAll('.reload-bar-fill.ready').length).toBe(0);
  });

  it('clamps cooldown above maxCooldown to 0% (defensive)', () => {
    const overflow = {
      ...baseData,
      weaponMode: 'gun',
      turrets: [
        { cooldown: 8, maxCooldown: 5, isFront: true },  // cd > maxCd → 0%
      ],
    };
    const { container } = render(<HUD data={overflow} />);
    const widths = fillWidths(container);
    expect(widths[0]).toBeCloseTo(0, 1);
  });

  it('clamps negative cooldown to 100% (defensive)', () => {
    const negative = {
      ...baseData,
      weaponMode: 'gun',
      turrets: [
        { cooldown: -0.4, maxCooldown: 5, isFront: true },  // cd < 0 → ready, 100%
      ],
    };
    const { container } = render(<HUD data={negative} />);
    const widths = fillWidths(container);
    expect(widths[0]).toBeCloseTo(100, 1);
    expect(container.querySelectorAll('.reload-bar-fill.ready').length).toBe(1);
  });

  it('shows full reload 0→100 progression across frames', () => {
    const maxCd = 5;
    const samples = [5, 4, 3, 2, 1, 0];
    const expected = [0, 20, 40, 60, 80, 100];
    samples.forEach((cd, i) => {
      const data = {
        ...baseData,
        weaponMode: 'gun',
        turrets: [{ cooldown: cd, maxCooldown: maxCd, isFront: true }],
      };
      const { container, unmount } = render(<HUD data={data} />);
      const widths = fillWidths(container);
      expect(widths[0]).toBeCloseTo(expected[i], 1);
      unmount();
    });
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

describe('HUD gear display', () => {
  const baseData = {
    hp: 100,
    maxHp: 100,
    speed: 30,
    level: 5,
    score: 200,
    enemyCount: 5,
    wave: 3,
    turrets: [{ cooldown: 0, maxCooldown: 5, isFront: true }],
    currentThreshold: 150,
    nextThreshold: 250,
    weaponMode: 'gun',
    torpedoTubes: [],
    torpedoMaxCooldown: 8,
    shipClass: 'destroyer',
    availableTorpedoTiers: [],
    gear: 3,
  };

  it('renders 6 gear rows in fixed top-to-bottom order', () => {
    const { container } = render(<HUD data={baseData} />);
    const names = Array.from(container.querySelectorAll('.gear-name')).map(el => el.textContent);
    expect(names).toEqual(['前进4', '前进3', '前进2', '前进1', '停车', '倒退']);
  });

  it('highlights exactly one gear row matching data.gear', () => {
    const { container } = render(<HUD data={{ ...baseData, gear: 4 }} />);
    const active = container.querySelectorAll('.gear-row.active');
    expect(active.length).toBe(1);
    expect(active[0].querySelector('.gear-name').textContent).toBe('前进3');
  });

  it('shows current speed only on the active gear row', () => {
    const { container } = render(<HUD data={{ ...baseData, gear: 2, speed: 42 }} />);
    const speeds = Array.from(container.querySelectorAll('.gear-speed')).map(el => el.textContent);
    expect(speeds.length).toBe(1);
    // 42 km/h, rounded
    expect(speeds[0]).toContain('42');
    // on the 前进1 row
    const active = container.querySelector('.gear-row.active');
    expect(active.querySelector('.gear-name').textContent).toBe('前进1');
    expect(active.querySelector('.gear-speed').textContent).toContain('42');
  });

  it('speed text moves with active gear', () => {
    const r1 = render(<HUD data={{ ...baseData, gear: 0, speed: 5 }} />);
    const active1 = r1.container.querySelector('.gear-row.active');
    expect(active1.querySelector('.gear-name').textContent).toBe('倒退');
    r1.unmount();

    const r2 = render(<HUD data={{ ...baseData, gear: 5, speed: 60 }} />);
    const active2 = r2.container.querySelector('.gear-row.active');
    expect(active2.querySelector('.gear-name').textContent).toBe('前进4');
  });
});
