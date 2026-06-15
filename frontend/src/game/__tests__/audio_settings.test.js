import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const STORAGE = new Map();

beforeEach(() => {
  STORAGE.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k) => (STORAGE.has(k) ? STORAGE.get(k) : null),
    setItem: (k, v) => { STORAGE.set(k, String(v)); },
    removeItem: (k) => { STORAGE.delete(k); },
    clear: () => { STORAGE.clear(); },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const reload = () => {
  vi.resetModules();
  return import('../audio_settings.js');
};

describe('audio_settings localStorage persistence', () => {
  it('loadAudioSettings 返回默认值（无 localStorage 数据）', async () => {
    const { loadAudioSettings } = await reload();
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBe(1);
    expect(s.sfxVolume).toBe(1);
    expect(s.muted).toBe(false);
  });

  it('saveAudioSettings + loadAudioSettings 往返', async () => {
    const { saveAudioSettings, loadAudioSettings } = await reload();
    saveAudioSettings({ bgmVolume: 0.4, sfxVolume: 0.7, muted: true });
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBeCloseTo(0.4, 4);
    expect(s.sfxVolume).toBeCloseTo(0.7, 4);
    expect(s.muted).toBe(true);
  });

  it('saveAudioSettings 支持部分更新', async () => {
    const { saveAudioSettings, loadAudioSettings } = await reload();
    saveAudioSettings({ bgmVolume: 0.3 });
    saveAudioSettings({ sfxVolume: 0.8 });
    saveAudioSettings({ muted: true });
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBeCloseTo(0.3, 4);
    expect(s.sfxVolume).toBeCloseTo(0.8, 4);
    expect(s.muted).toBe(true);
  });

  it('loadAudioSettings 容错损坏的 JSON', async () => {
    STORAGE.set('wow_bgm_volume', 'not-a-json');
    STORAGE.set('wow_sfx_volume', '{bad');
    STORAGE.set('wow_muted', 'undefined');
    const { loadAudioSettings } = await reload();
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBe(1);
    expect(s.sfxVolume).toBe(1);
    expect(s.muted).toBe(false);
  });

  it('loadAudioSettings 容错越界数值', async () => {
    STORAGE.set('wow_bgm_volume', '2');
    STORAGE.set('wow_sfx_volume', '-1');
    const { loadAudioSettings } = await reload();
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBe(1);
    expect(s.sfxVolume).toBe(0);
  });

  it('loadAudioSettings 容错非布尔静音值', async () => {
    STORAGE.set('wow_muted', '"yes"');
    const { loadAudioSettings } = await reload();
    const s = loadAudioSettings();
    expect(s.muted).toBe(false);

    STORAGE.set('wow_muted', 'true');
    const s2 = (await reload()).loadAudioSettings();
    expect(s2.muted).toBe(true);
  });

  it('saveAudioSettings 越界值会被 clamp', async () => {
    const { saveAudioSettings, loadAudioSettings } = await reload();
    saveAudioSettings({ bgmVolume: 5 });
    saveAudioSettings({ sfxVolume: -2 });
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBe(1);
    expect(s.sfxVolume).toBe(0);
  });

  it('localStorage.setItem 失败时 saveAudioSettings 不抛异常', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota'); },
      removeItem: () => {},
      clear: () => {},
    });
    const { saveAudioSettings } = await reload();
    expect(() => saveAudioSettings({ bgmVolume: 0.5 })).not.toThrow();
  });

  it('localStorage 不可用时 loadAudioSettings 返回默认', async () => {
    vi.stubGlobal('localStorage', undefined);
    const { loadAudioSettings } = await reload();
    const s = loadAudioSettings();
    expect(s.bgmVolume).toBe(1);
    expect(s.sfxVolume).toBe(1);
    expect(s.muted).toBe(false);
  });
});
