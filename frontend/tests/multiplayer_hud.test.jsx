// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import MultiplayerHUD from '../src/components/MultiplayerHUD.jsx';

describe('MultiplayerHUD top-left toolbar', () => {
  const baseData = {
    hp: 100, maxHp: 100, speed: 30, level: 5,
    turrets: [], weaponMode: 'gun', torpedoTubes: [],
    torpedoMaxCooldown: 8, availableTorpedoTiers: [],
    gear: 1, ping: 20, shipClass: 'destroyer', respawns: 3,
  };

  it('渲染左上角工具栏 #game-top-toolbar', () => {
    const { container } = render(<MultiplayerHUD data={baseData} />);
    expect(container.querySelector('#game-top-toolbar')).toBeTruthy();
  });

  it('未传回调时不显示任何按钮', () => {
    const { container } = render(<MultiplayerHUD data={baseData} />);
    const btns = container.querySelectorAll('#game-top-toolbar button');
    expect(btns.length).toBe(0);
  });

  it('传入所有回调时显示三个按钮', () => {
    const { container } = render(
      <MultiplayerHUD data={baseData} onExit={() => {}} onOpenSettings={() => {}} onToggleMute={() => {}} />
    );
    const btns = container.querySelectorAll('#game-top-toolbar button');
    expect(btns.length).toBe(3);
  });

  it('传 onExit 时点击退出按钮触发回调', () => {
    const onExit = vi.fn();
    const { container } = render(<MultiplayerHUD data={baseData} onExit={onExit} />);
    const exitBtn = container.querySelector('.toolbar-exit-btn');
    expect(exitBtn).toBeTruthy();
    fireEvent.click(exitBtn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('传 onOpenSettings 时点击设置按钮触发回调', () => {
    const onOpenSettings = vi.fn();
    const { container } = render(<MultiplayerHUD data={baseData} onOpenSettings={onOpenSettings} />);
    const settingsBtn = container.querySelector('.toolbar-settings-btn');
    fireEvent.click(settingsBtn);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('传 onToggleMute 时点击静音按钮触发回调', () => {
    const onToggleMute = vi.fn();
    const { container } = render(<MultiplayerHUD data={baseData} onToggleMute={onToggleMute} />);
    const muteBtn = container.querySelector('.toolbar-mute-btn');
    fireEvent.click(muteBtn);
    expect(onToggleMute).toHaveBeenCalledTimes(1);
  });

  it('静音状态时按钮显示为 active', () => {
    const { container } = render(<MultiplayerHUD data={baseData} onToggleMute={() => {}} muted={true} />);
    const muteBtn = container.querySelector('.toolbar-mute-btn');
    expect(muteBtn.classList.contains('active')).toBe(true);
  });
});
