import { describe, it, expect, beforeEach, vi } from 'vitest';

const stubAudio = () => ({
  paused: true,
  currentTime: 0,
  volume: 0,
  loop: false,
  readyState: 4,
  play: vi.fn(() => Promise.resolve()),
  pause: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

let created;
let playSpy;

const reload = () => {
  vi.resetModules();
  return import('../audio.js');
};

beforeEach(() => {
  created = [];
  playSpy = vi.fn();
  function FakeAudio(src) {
    const a = stubAudio();
    a._src = src;
    created.push(a);
    return a;
  }
  global.Audio = FakeAudio;
  global.performance = global.performance || { now: () => Date.now() };
});

describe('AudioManager', () => {
  it('init 创建海浪、BGM、引擎三个循环 audio', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    expect(created.length).toBe(3);
    expect(created[0].loop).toBe(true);
    expect(created[1].loop).toBe(true);
    expect(created[2].loop).toBe(true);
    expect(created[0]._src).toBe('/waves-splash-sea-ocean-coast.mp3');
    expect(created[1]._src).toBe('/Riptide%20Armada.mp3');
    expect(created[2]._src).toBe('/auto-volkswagen-engine-at-low-speed-entry-outside.mp3');
  });

  it('init 幂等：重复调用不重复创建', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.init();
    expect(created.length).toBe(3);
  });

  it('startBGM 启动 BGM（第二个 audio 元素）', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startBGM();
    expect(created[1].play).toHaveBeenCalled();
  });

  it('stopBGM 暂停并复位', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startBGM();
    am.stopBGM();
    expect(created[1].pause).toHaveBeenCalled();
    expect(created[1].currentTime).toBe(0);
  });

  it('startAmbient 启动海浪（第一个 audio 元素）', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startAmbient();
    expect(created[0].play).toHaveBeenCalled();
  });

  it('stopAmbient 暂停并复位', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startAmbient();
    am.stopAmbient();
    expect(created[0].pause).toHaveBeenCalled();
    expect(created[0].currentTime).toBe(0);
  });

  it('playFire(battleship) 创建战列舰开火音效元素', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    created.length = 0;
    am.playFire('battleship');
    expect(created.some(a => a._src === '/single-explosion.mp3')).toBe(true);
  });

  it('playFire(destroyer/cruiser) 使用 artillery-shot', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    created.length = 0;
    am.playFire('destroyer');
    expect(created.some(a => a._src === '/artillery-shot.mp3')).toBe(true);
    created.length = 0;
    am.playFire('cruiser');
    expect(created.some(a => a._src === '/artillery-shot.mp3')).toBe(true);
  });

  it('playFire 默认（未选类型）使用 artillery-shot', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    created.length = 0;
    am.playFire(null);
    expect(created.some(a => a._src === '/artillery-shot.mp3')).toBe(true);
  });

  it('playExplosion 节流：250ms 内的第二次调用被忽略', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);

    created.length = 0;
    am.playExplosion();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(1);

    t += 100;
    am.playExplosion();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(1);

    t += 200;
    am.playExplosion();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(2);
  });

  it('updateEngineBySpeed(speed<0.5) 应暂停引擎', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const engine = created[2];
    am.updateEngineBySpeed(10, 20); // 先启动引擎
    engine.pause.mockClear();
    am.updateEngineBySpeed(0.1, 20);
    expect(engine.pause).toHaveBeenCalled();
  });

  it('updateEngineBySpeed 满速时引擎音量约 0.6', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const engine = created[2];
    am.updateEngineBySpeed(20, 20);
    expect(engine.volume).toBeCloseTo(0.6, 2);
  });

  it('updateEngineBySpeed 半速时引擎音量约 0.4', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const engine = created[2];
    am.updateEngineBySpeed(10, 20);
    expect(engine.volume).toBeCloseTo(0.4, 2);
  });

  it('updateEngineBySpeed 启动引擎（之前未播放）', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const engine = created[2];
    am.updateEngineBySpeed(5, 20);
    expect(engine.play).toHaveBeenCalled();
  });

  it('stopAll 同时暂停海浪、BGM 和引擎', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const [ambient, bgm, engine] = created;
    ambient.paused = false;
    bgm.paused = false;
    engine.paused = false;
    am.stopAll();
    expect(ambient.pause).toHaveBeenCalled();
    expect(bgm.pause).toHaveBeenCalled();
    expect(engine.pause).toHaveBeenCalled();
  });

  it('playTorpedoHit 使用 firecracker-explosion-underwater', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    created.length = 0;
    am.playTorpedoHit();
    expect(created.some(a => a._src === '/firecracker-explosion-underwater.mp3')).toBe(true);
  });

  it('playTorpedoHit 受 250ms 节流约束', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    let t = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    created.length = 0;
    am.playTorpedoHit();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(1);
    t += 100;
    am.playTorpedoHit();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(1);
    t += 200;
    am.playTorpedoHit();
    expect(created.filter(a => a.play.mock.calls.length > 0).length).toBe(2);
  });

  it('playTorpedoLaunch 使用 splashing 音效', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    created.length = 0;
    am.playTorpedoLaunch();
    expect(created.some(a => a._src === '/splashing-sound-a-man-fell-into-the-water.mp3')).toBe(true);
  });

  it('playTorpedoLaunch 不受节流约束', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    vi.spyOn(performance, 'now').mockImplementation(() => 1000);
    created.length = 0;
    am.playTorpedoLaunch();
    am.playTorpedoLaunch();
    am.playTorpedoLaunch();
    expect(created.filter(a => a.play.mock.calls.length > 0 || a.addEventListener.mock.calls.length > 0).length).toBe(3);
  });
});

describe('AudioManager volume scales', () => {
  it('默认 bgmVolume/sfxVolume 为 1，muted 为 false', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    expect(am.bgmVolume).toBe(1);
    expect(am.sfxVolume).toBe(1);
    expect(am.muted).toBe(false);
  });

  it('setBgmVolume 立即更新已循环播放的 BGM 和海浪音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startBGM();
    am.startAmbient();
    const [ambient, bgm] = created;
    am.setBgmVolume(0.5);
    expect(am.bgmVolume).toBe(0.5);
    // AMBIENT_VOLUME=0.12 * 0.5 = 0.06
    expect(ambient.volume).toBeCloseTo(0.06, 4);
    // BGM_VOLUME=0.1 * 0.5 = 0.05
    expect(bgm.volume).toBeCloseTo(0.05, 4);
  });

  it('setBgmVolume clamp 到 [0,1] 范围', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setBgmVolume(2);
    expect(am.bgmVolume).toBe(1);
    am.setBgmVolume(-1);
    expect(am.bgmVolume).toBe(0);
  });

  it('setSfxVolume 影响 playFire 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playFire('destroyer');
    // FIRE_VOLUME=0.7 * 0.5 = 0.35
    expect(created[0].volume).toBeCloseTo(0.35, 4);
  });

  it('setSfxVolume 影响 playExplosion 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playExplosion();
    // EXPLOSION_VOLUME=0.25 * 0.5 = 0.125
    expect(created[0].volume).toBeCloseTo(0.125, 4);
  });

  it('setSfxVolume 影响 playTorpedoLaunch 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playTorpedoLaunch();
    // TORPEDO_LAUNCH_VOLUME=0.4 * 0.5 = 0.2
    expect(created[0].volume).toBeCloseTo(0.2, 4);
  });

  it('setSfxVolume 影响 updateEngineBySpeed 计算的引擎音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    const engine = created[2];
    am.updateEngineBySpeed(20, 20); // 满速，正常应为 ENGINE_MAX_VOLUME=0.6
    // 0.6 * 0.5 = 0.3
    expect(engine.volume).toBeCloseTo(0.3, 4);
  });

  it('setSfxVolume 影响 playGearShift 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playGearShift();
    // GEAR_SHIFT_VOLUME=0.5 * 0.5 = 0.25
    expect(created[0].volume).toBeCloseTo(0.25, 4);
  });

  it('setSfxVolume 影响 playScopeAdjust 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playScopeAdjust();
    // SCOPE_ADJUST_VOLUME=0.5 * 0.5 = 0.25
    expect(created[0].volume).toBeCloseTo(0.25, 4);
  });

  it('setSfxVolume 影响 playTorpedoHit 实际音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setSfxVolume(0.5);
    created.length = 0;
    am.playTorpedoHit();
    // TORPEDO_HIT_VOLUME=0.6 * 0.5 = 0.3
    expect(created[0].volume).toBeCloseTo(0.3, 4);
  });

  it('setMuted(true) 立即把 BGM/Ambient/Engine 音量设为 0', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.startBGM();
    am.startAmbient();
    am.updateEngineBySpeed(10, 20);
    const [ambient, bgm, engine] = created;
    am.setMuted(true);
    expect(ambient.volume).toBe(0);
    expect(bgm.volume).toBe(0);
    expect(engine.volume).toBe(0);
  });

  it('setMuted(false) 恢复 BGM/Ambient 到根据 bgmVolume 计算的音量', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setBgmVolume(0.5);
    am.startBGM();
    am.startAmbient();
    const [ambient, bgm] = created;
    am.setMuted(true);
    am.setMuted(false);
    expect(ambient.volume).toBeCloseTo(0.06, 4);
    expect(bgm.volume).toBeCloseTo(0.05, 4);
  });

  it('静音状态下播放事件音实际音量为 0', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setMuted(true);
    created.length = 0;
    am.playFire('destroyer');
    am.playExplosion();
    am.playTorpedoLaunch();
    am.playGearShift();
    am.playScopeAdjust();
    am.playTorpedoHit();
    for (const a of created) {
      expect(a.volume).toBe(0);
    }
  });

  it('静音状态下 updateEngineBySpeed 引擎音量为 0', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setMuted(true);
    const engine = created[2];
    am.updateEngineBySpeed(20, 20);
    expect(engine.volume).toBe(0);
  });

  it('静音优先级高于音量设置：muted=true 时即使 bgmVolume=1 也静音', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    am.setBgmVolume(1);
    am.setSfxVolume(1);
    am.setMuted(true);
    am.startBGM();
    am.startAmbient();
    const [ambient, bgm] = created;
    expect(ambient.volume).toBe(0);
    expect(bgm.volume).toBe(0);
  });

  it('init 之后调用 setBgmVolume 不影响已存 audio 元素的初始音量前状态', async () => {
    const { AudioManager } = await reload();
    const am = new AudioManager();
    am.init();
    const [ambient, bgm] = created;
    // 初始未调用 start，volume 是常量默认
    expect(ambient.volume).toBeCloseTo(0.12, 4);
    expect(bgm.volume).toBeCloseTo(0.1, 4);
    am.setBgmVolume(0.5);
    // setBgmVolume 即使未播放也应该更新元素 volume（用于一旦 play 立即生效）
    expect(ambient.volume).toBeCloseTo(0.06, 4);
    expect(bgm.volume).toBeCloseTo(0.05, 4);
  });
});
