const KEYS = {
  bgm: 'wow_bgm_volume',
  sfx: 'wow_sfx_volume',
  muted: 'wow_muted',
};

const DEFAULTS = { bgmVolume: 1, sfxVolume: 1, muted: false };

function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function readNumber(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return clamp01(v);
  } catch {
    return fallback;
  }
}

function readBool(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const v = JSON.parse(raw);
    return v === true;
  } catch {
    return fallback;
  }
}

function writeValue(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage 不可用或配额超限 — 静默降级
  }
}

export function loadAudioSettings() {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  return {
    bgmVolume: readNumber(KEYS.bgm, DEFAULTS.bgmVolume),
    sfxVolume: readNumber(KEYS.sfx, DEFAULTS.sfxVolume),
    muted: readBool(KEYS.muted, DEFAULTS.muted),
  };
}

export function saveAudioSettings(partial) {
  if (typeof localStorage === 'undefined') return;
  if (!partial) return;
  if (partial.bgmVolume != null) writeValue(KEYS.bgm, clamp01(partial.bgmVolume));
  if (partial.sfxVolume != null) writeValue(KEYS.sfx, clamp01(partial.sfxVolume));
  if (partial.muted != null) writeValue(KEYS.muted, !!partial.muted);
}

export function applyAudioSettingsToManager(manager, settings) {
  if (!manager) return;
  if (settings.bgmVolume != null) manager.setBgmVolume(settings.bgmVolume);
  if (settings.sfxVolume != null) manager.setSfxVolume(settings.sfxVolume);
  if (settings.muted != null) manager.setMuted(settings.muted);
}
