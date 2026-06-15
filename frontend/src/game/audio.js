const FIRE_SOUND = {
  destroyer: '/artillery-shot.mp3',
  cruiser: '/artillery-shot.mp3',
  battleship: '/single-explosion.mp3',
};
const DEFAULT_FIRE_SOUND = '/artillery-shot.mp3';
const EXPLOSION_SOUND = '/bomb-explosion-with-flying-fragments.mp3';
const AMBIENT_SOUND = '/waves-splash-sea-ocean-coast.mp3';
const ENGINE_SOUND = '/auto-volkswagen-engine-at-low-speed-entry-outside.mp3';
const TORPEDO_HIT_SOUND = '/firecracker-explosion-underwater.mp3';
const TORPEDO_LAUNCH_SOUND = '/splashing-sound-a-man-fell-into-the-water.mp3';
const BGM_SOUND = '/Riptide%20Armada.mp3';
const GEAR_SHIFT_SOUND = '/freesound_community-wind-up3-89578.mp3';
const SCOPE_ADJUST_SOUND = '/freesound_community-wind-up2-106350.mp3';

const AMBIENT_VOLUME = 0.12;
const BGM_VOLUME = 0.1;
const ENGINE_MIN_VOLUME = 0.2;
const ENGINE_MAX_VOLUME = 0.6;
const FIRE_VOLUME = 0.7;
const EXPLOSION_VOLUME = 0.25;
const TORPEDO_HIT_VOLUME = 0.6;
const TORPEDO_LAUNCH_VOLUME = 0.4;
const GEAR_SHIFT_VOLUME = 0.5;
const SCOPE_ADJUST_VOLUME = 0.5;
const EXPLOSION_THROTTLE_MS = 250;
const ENGINE_START_SPEED = 0.5;
const TORPEDO_HIT_START = 1;
const TORPEDO_HIT_END = 3;
const TORPEDO_LAUNCH_END = 1.5;

function clamp01(v) {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export class AudioManager {
  constructor() {
    this.initialized = false;
    this._ambient = null;
    this._bgm = null;
    this._engine = null;
    this._ambientPlaying = false;
    this._bgmPlaying = false;
    this._enginePlaying = false;
    this._lastExplosionTime = 0;
    this._gearShiftDuration = 0;
    this._lastGearShiftStart = 0;
    this._scopeAdjustDuration = 0;
    this._lastScopeAdjustStart = 0;
    this._lastEngineBaseVolume = ENGINE_MIN_VOLUME;
    this._bgmVolume = 1;
    this._sfxVolume = 1;
    this._muted = false;
  }

  get bgmVolume() { return this._bgmVolume; }
  get sfxVolume() { return this._sfxVolume; }
  get muted() { return this._muted; }

  _bgmScale() {
    return this._muted ? 0 : this._bgmVolume;
  }

  _sfxScale() {
    return this._muted ? 0 : this._sfxVolume;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    this._ambient = new Audio(AMBIENT_SOUND);
    this._ambient.loop = true;
    this._ambient.volume = AMBIENT_VOLUME * this._bgmScale();

    this._bgm = new Audio(BGM_SOUND);
    this._bgm.loop = true;
    this._bgm.volume = BGM_VOLUME * this._bgmScale();

    this._engine = new Audio(ENGINE_SOUND);
    this._engine.loop = true;
    this._engine.volume = ENGINE_MIN_VOLUME * this._sfxScale();
  }

  _applyLoopVolumes() {
    if (!this.initialized) return;
    if (this._ambient) this._ambient.volume = AMBIENT_VOLUME * this._bgmScale();
    if (this._bgm) this._bgm.volume = BGM_VOLUME * this._bgmScale();
    if (this._engine) {
      this._engine.volume = this._lastEngineBaseVolume * this._sfxScale();
    }
  }

  setBgmVolume(scale) {
    this._bgmVolume = clamp01(scale);
    this._applyLoopVolumes();
  }

  setSfxVolume(scale) {
    this._sfxVolume = clamp01(scale);
    this._applyLoopVolumes();
  }

  setMuted(muted) {
    this._muted = !!muted;
    this._applyLoopVolumes();
  }

  startAmbient() {
    if (!this.initialized || !this._ambient) return;
    if (this._ambientPlaying) return;
    this._ambient.currentTime = 0;
    this._ambient.volume = AMBIENT_VOLUME * this._bgmScale();
    this._ambient.play().catch(() => {});
    this._ambientPlaying = true;
  }

  stopAmbient() {
    if (!this._ambient) return;
    this._ambient.pause();
    this._ambient.currentTime = 0;
    this._ambientPlaying = false;
  }

  startBGM() {
    if (!this.initialized || !this._bgm) return;
    if (this._bgmPlaying) return;
    this._bgm.currentTime = 0;
    this._bgm.volume = BGM_VOLUME * this._bgmScale();
    this._bgm.play().catch(() => {});
    this._bgmPlaying = true;
  }

  stopBGM() {
    if (!this._bgm) return;
    this._bgm.pause();
    this._bgm.currentTime = 0;
    this._bgmPlaying = false;
  }

  updateEngineBySpeed(speed, maxSpeed) {
    if (!this.initialized) return;
    const absSpeed = Math.abs(speed);
    const shouldPlay = absSpeed >= ENGINE_START_SPEED && maxSpeed > 0;
    if (shouldPlay) {
      const ratio = Math.max(0, Math.min(1, absSpeed / maxSpeed));
      if (!this._enginePlaying) {
        this._engine.volume = ENGINE_MIN_VOLUME * this._sfxScale();
        this._engine.play().catch(() => {});
        this._enginePlaying = true;
      }
      const baseVol = ENGINE_MIN_VOLUME + (ENGINE_MAX_VOLUME - ENGINE_MIN_VOLUME) * ratio;
      this._lastEngineBaseVolume = baseVol;
      this._engine.volume = baseVol * this._sfxScale();
    } else if (this._enginePlaying) {
      this._engine.pause();
      this._engine.currentTime = 0;
      this._enginePlaying = false;
    }
  }

  playFire(shipClass) {
    if (!this.initialized) return;
    const src = FIRE_SOUND[shipClass] || DEFAULT_FIRE_SOUND;
    const a = new Audio(src);
    a.volume = FIRE_VOLUME * this._sfxScale();
    a.play().catch(() => {});
  }

  playExplosion() {
    if (!this.initialized) return;
    const now = performance.now();
    if (now - this._lastExplosionTime < EXPLOSION_THROTTLE_MS) return;
    this._lastExplosionTime = now;
    const a = new Audio(EXPLOSION_SOUND);
    a.volume = EXPLOSION_VOLUME * this._sfxScale();
    a.play().catch(() => {});
  }

  playTorpedoHit() {
    if (!this.initialized) return;
    const now = performance.now();
    if (now - this._lastExplosionTime < EXPLOSION_THROTTLE_MS) return;
    this._lastExplosionTime = now;
    this._playClip(TORPEDO_HIT_SOUND, TORPEDO_HIT_START, TORPEDO_HIT_END, TORPEDO_HIT_VOLUME * this._sfxScale());
  }

  playTorpedoLaunch() {
    if (!this.initialized) return;
    this._playClip(TORPEDO_LAUNCH_SOUND, 0, TORPEDO_LAUNCH_END, TORPEDO_LAUNCH_VOLUME * this._sfxScale());
  }

  playGearShift() {
    this._playThrottled('GearShift', GEAR_SHIFT_SOUND, GEAR_SHIFT_VOLUME * this._sfxScale());
  }

  playScopeAdjust() {
    this._playThrottled('ScopeAdjust', SCOPE_ADJUST_SOUND, SCOPE_ADJUST_VOLUME * this._sfxScale());
  }

  _playThrottled(key, src, volume) {
    if (!this.initialized) return;
    const now = performance.now();
    const lastStart = this[`_last${key}Start`] || 0;
    const duration = this[`_${key}Duration`] || 0;
    if (duration > 0 && now - lastStart < duration) return;
    this[`_last${key}Start`] = now;
    const a = new Audio(src);
    a.volume = volume;
    a.addEventListener('loadedmetadata', () => {
      this[`_${key}Duration`] = (a.duration || 1) * 1000;
    }, { once: true });
    a.play().catch(() => {});
  }

  _playClip(src, startTime, endTime, volume) {
    const a = new Audio(src);
    a.volume = volume;
    const startClip = () => {
      try { a.currentTime = startTime; } catch (_) {}
      a.play().catch(() => {});
    };
    const onTime = () => {
      if (a.currentTime >= endTime) {
        a.pause();
        a.removeEventListener('timeupdate', onTime);
      }
    };
    a.addEventListener('loadedmetadata', startClip, { once: true });
    a.addEventListener('timeupdate', onTime);
    if (a.readyState >= 1) startClip();
  }

  stopAll() {
    this.stopAmbient();
    this.stopBGM();
    if (this._engine) {
      this._engine.pause();
      this._engine.currentTime = 0;
      this._enginePlaying = false;
    }
  }
}
