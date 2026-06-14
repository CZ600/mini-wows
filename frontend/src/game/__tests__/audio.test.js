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
