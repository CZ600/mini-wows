export class AudioManager {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  _noise(duration, volume) {
    const ctx = this.ctx;
    const size = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * volume;
    return buffer;
  }

  playFire() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const ns = ctx.createBufferSource();
    ns.buffer = this._noise(0.15, 0.5);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.6, now);
    ng.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1000;
    ns.connect(hp).connect(ng).connect(ctx.destination);
    ns.start(now);
    ns.stop(now + 0.15);

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, now);
    og.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(og).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playExplosion() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const ns = ctx.createBufferSource();
    ns.buffer = this._noise(0.6, 0.4);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(200, now + 0.6);
    ns.connect(lp).connect(ng).connect(ctx.destination);
    ns.start(now);
    ns.stop(now + 0.6);

    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.8);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.6, now);
    og.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
    osc.connect(og).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.8);
  }
}
