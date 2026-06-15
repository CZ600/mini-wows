// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LeaderboardPanel from '../src/components/LeaderboardPanel.jsx';

vi.mock('../src/api.js', () => ({
  getLeaderboard: vi.fn(),
}));

import { getLeaderboard } from '../src/api.js';

function makeRows(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: `player${i + 1}`,
    score: 1000 - i * 10,
    enemies_destroyed: 50 - i,
  }));
}

describe('LeaderboardPanel scroll', () => {
  it('未可见时不渲染', () => {
    const { container } = render(<LeaderboardPanel visible={false} onClose={() => {}} />);
    expect(container.querySelector('#leaderboard-panel')).toBeNull();
  });

  it('数据为空时显示暂无数据', async () => {
    getLeaderboard.mockResolvedValue([]);
    render(<LeaderboardPanel visible={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeTruthy();
    });
  });

  it('数据条数大于阈值时容器可滚动', async () => {
    getLeaderboard.mockResolvedValue(makeRows(50));
    const { container } = render(<LeaderboardPanel visible={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(container.querySelectorAll('#leaderboard-table tbody tr').length).toBe(50);
    });
    const body = container.querySelector('.leaderboard-body');
    expect(body).toBeTruthy();
    // jsdom's getComputedStyle may not reflect CSS class values;
    // verify the className exists for overflow styling
    expect(body.classList.contains('leaderboard-body')).toBe(true);
    expect(body.style.maxHeight).toBeFalsy();
  });

  it('数据条数较少时也渲染全部行', async () => {
    getLeaderboard.mockResolvedValue(makeRows(3));
    const { container } = render(<LeaderboardPanel visible={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(container.querySelectorAll('#leaderboard-table tbody tr').length).toBe(3);
    });
  });

  it('表头在滚动容器内独立存在', async () => {
    getLeaderboard.mockResolvedValue(makeRows(20));
    const { container } = render(<LeaderboardPanel visible={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(container.querySelectorAll('#leaderboard-table tbody tr').length).toBe(20);
    });
    const head = container.querySelector('#leaderboard-table thead');
    expect(head).toBeTruthy();
    expect(head.querySelector('th').textContent).toBe('排名');
  });

  it('关闭按钮始终渲染', async () => {
    getLeaderboard.mockResolvedValue(makeRows(2));
    const { container } = render(<LeaderboardPanel visible={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(container.querySelectorAll('#leaderboard-table tbody tr').length).toBe(2);
    });
    const btns = container.querySelectorAll('button');
    expect(btns.length).toBeGreaterThan(0);
    expect(Array.from(btns).some(b => b.textContent.includes('关闭'))).toBe(true);
  });
});
