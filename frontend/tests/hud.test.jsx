// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HUD from '../src/components/HUD.jsx';

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
  };

  it('should display unified torpedo cooldown in weapon box', () => {
    render(<HUD data={baseData} />);

    // 不应该显示单独的鱼雷管标签
    expect(screen.queryByText('左1')).toBeNull();
    expect(screen.queryByText('左2')).toBeNull();
    expect(screen.queryByText('右1')).toBeNull();

    // 应该显示鱼雷武器框和装填信息
    expect(screen.getByText(/鱼雷/)).toBeTruthy();
    expect(screen.getByText('装填')).toBeTruthy();
  });

  it('should show unified cooldown time as max of all tubes', () => {
    render(<HUD data={baseData} />);

    // 应该显示最大冷却时间（5秒）
    expect(screen.getByText('5.0s')).toBeTruthy();
  });

  it('should show ready when all tubes are ready', () => {
    const readyData = {
      ...baseData,
      torpedoTubes: [
        { index: 0, cooldown: 0, side: 'port', ready: true },
        { index: 1, cooldown: 0, side: 'port', ready: true },
      ],
    };

    render(<HUD data={readyData} />);
    // 应该有多个"就绪"文本（火炮和鱼雷）
    const readyElements = screen.getAllByText('就绪');
    expect(readyElements.length).toBeGreaterThan(0);
  });

  it('should not show torpedo section when in gun mode', () => {
    const gunData = {
      ...baseData,
      weaponMode: 'gun',
    };

    render(<HUD data={gunData} />);

    // 在火炮模式下，不应该显示鱼雷装填信息
    expect(screen.queryByText('装填')).toBeNull();
  });

  it('should display individual turret cooldown in gun mode', () => {
    const gunData = {
      ...baseData,
      weaponMode: 'gun',
    };

    render(<HUD data={gunData} />);

    // 应该显示每门火炮的装填状态
    expect(screen.getByText('前1')).toBeTruthy();
    expect(screen.getByText('后1')).toBeTruthy();
    // 前1冷却时间为0，应该显示"就绪"
    // 后1冷却时间为2，应该显示"2.0s"
    expect(screen.getByText('2.0s')).toBeTruthy();
  });
});