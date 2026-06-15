// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsPanel from '../src/components/SettingsPanel.jsx';

describe('SettingsPanel', () => {
  const baseProps = {
    visible: true,
    bgmVolume: 0.6,
    sfxVolume: 0.8,
    muted: false,
    onBgmVolumeChange: () => {},
    onSfxVolumeChange: () => {},
    onMutedChange: () => {},
    onClose: () => {},
  };

  it('visible=false 时不渲染', () => {
    const { container } = render(<SettingsPanel {...baseProps} visible={false} />);
    expect(container.querySelector('#settings-panel')).toBeNull();
  });

  it('渲染背景音与游戏音效两组滑块', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText(/背景音/)).toBeTruthy();
    expect(screen.getByText(/游戏音效/)).toBeTruthy();
  });

  it('渲染静音开关按钮', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText('静音')).toBeTruthy();
  });

  it('滑块初始值与 props 同步', () => {
    const { container } = render(<SettingsPanel {...baseProps} />);
    const ranges = container.querySelectorAll('input[type="range"]');
    expect(ranges.length).toBe(2);
    expect(parseFloat(ranges[0].value)).toBeCloseTo(0.6, 4);
    expect(parseFloat(ranges[1].value)).toBeCloseTo(0.8, 4);
  });

  it('改变背景音滑块触发 onBgmVolumeChange', () => {
    const onBgm = vi.fn();
    const { container } = render(<SettingsPanel {...baseProps} onBgmVolumeChange={onBgm} />);
    const ranges = container.querySelectorAll('input[type="range"]');
    fireEvent.change(ranges[0], { target: { value: '0.3' } });
    expect(onBgm).toHaveBeenCalledWith(0.3);
  });

  it('改变游戏音效滑块触发 onSfxVolumeChange', () => {
    const onSfx = vi.fn();
    const { container } = render(<SettingsPanel {...baseProps} onSfxVolumeChange={onSfx} />);
    const ranges = container.querySelectorAll('input[type="range"]');
    fireEvent.change(ranges[1], { target: { value: '0.5' } });
    expect(onSfx).toHaveBeenCalledWith(0.5);
  });

  it('点击静音按钮触发 onMutedChange(true) 切换为静音', () => {
    const onMuted = vi.fn();
    render(<SettingsPanel {...baseProps} muted={false} onMutedChange={onMuted} />);
    fireEvent.click(screen.getByText('静音'));
    expect(onMuted).toHaveBeenCalledWith(true);
  });

  it('muted=true 时再次点击触发 onMutedChange(false)', () => {
    const onMuted = vi.fn();
    render(<SettingsPanel {...baseProps} muted={true} onMutedChange={onMuted} />);
    fireEvent.click(screen.getByText('取消静音'));
    expect(onMuted).toHaveBeenCalledWith(false);
  });

  it('静音状态下两组滑块禁用', () => {
    const { container } = render(<SettingsPanel {...baseProps} muted={true} />);
    const ranges = container.querySelectorAll('input[type="range"]');
    for (const r of ranges) {
      expect(r.disabled).toBe(true);
    }
  });

  it('显示当前音量百分比', () => {
    render(<SettingsPanel {...baseProps} />);
    expect(screen.getByText(/60%/)).toBeTruthy();
    expect(screen.getByText(/80%/)).toBeTruthy();
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    const { container } = render(<SettingsPanel {...baseProps} onClose={onClose} />);
    const btn = container.querySelector('.settings-close-btn');
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
