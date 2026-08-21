// @vitest-environment jsdom
// LoadingScreen contract: no load timeout, and the transfer readout shows
// loaded/total bytes, percent and speed driven by loadEngines' onProgress.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoadingScreen from '../src/components/LoadingScreen.jsx';

const { mockLoadEngines, mockEnginesError } = vi.hoisted(() => ({
  mockLoadEngines: vi.fn(),
  mockEnginesError: { value: null },
}));

vi.mock('../src/context/GameContext.jsx', () => ({
  useGame: () => ({ loadEngines: mockLoadEngines, enginesError: mockEnginesError.value }),
}));

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={['/loading?next=/']}>
      <LoadingScreen />
    </MemoryRouter>,
  );
}

describe('LoadingScreen', () => {
  beforeEach(() => {
    mockLoadEngines.mockReset();
    mockEnginesError.value = null;
  });
  afterEach(() => vi.useRealTimers());

  it('renders loading UI before loadEngines reports any progress', () => {
    mockLoadEngines.mockImplementation(() => new Promise(() => {}));
    renderScreen();
    expect(screen.getByText('正在加载游戏资源...')).toBeTruthy();
    expect(screen.getByText('0 KB / 0 KB')).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
    expect(screen.getByText('0 KB/s')).toBeTruthy();
  });

  it('shows transferred/total bytes, percent and speed from onProgress', () => {
    mockLoadEngines.mockImplementation((onProgress) => new Promise(() => {
      onProgress({ loaded: 512 * 1024, total: 1024 * 1024, speed: 256 * 1024 });
    }));
    renderScreen();
    expect(screen.getByText('512 KB / 1.00 MB')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('256 KB/s')).toBeTruthy();
  });

  it('has no load timeout: still loading after the old 20s limit', () => {
    vi.useFakeTimers();
    mockLoadEngines.mockImplementation(() => new Promise(() => {}));
    renderScreen();
    vi.advanceTimersByTime(60_000);
    expect(screen.getByText('正在加载游戏资源...')).toBeTruthy();
    expect(screen.queryByText('加载游戏资源超时，请检查网络后重试。')).toBeNull();
    expect(screen.queryByText('重试')).toBeNull();
  });

  it('shows the retry UI when enginesError is set', () => {
    mockLoadEngines.mockImplementation(() => new Promise(() => {}));
    mockEnginesError.value = new Error('boom');
    renderScreen();
    expect(screen.getByText('加载游戏资源失败，请检查网络后重试。')).toBeTruthy();
    expect(screen.getByText('重试')).toBeTruthy();
  });
});
