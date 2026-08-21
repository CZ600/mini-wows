// @vitest-environment jsdom
// HUD indicator regression: the submarine dive slot shows the four dive-toggle
// states (按B下潜 / 正在下潜 / 按B上浮 / 正在上浮), and the carrier air-group
// slots carry explicit auto-attack badges (自动 / 手动).
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DiveSlot from '../src/components/DiveSlot.jsx';
import AirGroupSlots from '../src/components/AirGroupSlots.jsx';

describe('DiveSlot (B-key indicator)', () => {
  it('surfaced -> 按B下潜', () => {
    render(<DiveSlot dive={{ target: false, transition: 0 }} />);
    expect(screen.getByText('按B下潜')).toBeTruthy();
  });

  it('diving transition -> 正在下潜', () => {
    render(<DiveSlot dive={{ target: true, transition: 0.4 }} />);
    expect(screen.getByText('正在下潜')).toBeTruthy();
  });

  it('fully submerged -> 按B上浮', () => {
    render(<DiveSlot dive={{ target: true, transition: 1 }} />);
    expect(screen.getByText('按B上浮')).toBeTruthy();
  });

  it('surfacing transition -> 正在上浮', () => {
    render(<DiveSlot dive={{ target: false, transition: 0.7 }} />);
    expect(screen.getByText('正在上浮')).toBeTruthy();
  });

  it('renders nothing for non-submarines (no dive block)', () => {
    const { container } = render(<DiveSlot dive={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('AirGroupSlots auto-attack badges', () => {
  const base = {
    carrier: true,
    activeType: 'torpedo',
    torpedo: { ammo: 10, maxAmmo: 20, cd: 0, maxCd: 3, salvo: 4, autoPilot: true },
    bomber: { ammo: 8, maxAmmo: 32, cd: 0, maxCd: 4, salvo: 8, autoPilot: false },
  };

  it('shows 自动 on the auto squadron and 手动 on the manual one', () => {
    render(<AirGroupSlots squadron={base} />);
    const badges = screen.getAllByText(/^(自动|手动)$/);
    expect(badges).toHaveLength(2);
    expect(screen.getAllByText('自动')).toHaveLength(1);
    expect(screen.getAllByText('手动')).toHaveLength(1);
  });

  it('defaults both to 手动 when the engine sends no autoPilot field', () => {
    const legacy = {
      ...base,
      torpedo: { ...base.torpedo, autoPilot: undefined },
      bomber: { ...base.bomber, autoPilot: undefined },
    };
    render(<AirGroupSlots squadron={legacy} />);
    expect(screen.getAllByText('手动')).toHaveLength(2);
  });
});
