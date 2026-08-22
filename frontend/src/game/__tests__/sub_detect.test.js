// Per-class submarine detection (对潜索敌) regression:
//   - 巡洋/战列对潜艇的索敌距离削弱（400/300）：圈外的玩家潜艇不触发追击，
//     也不会被开火/投深弹（保持巡逻 idle）；
//   - 驱逐舰（护卫舰，反潜特化）对潜索敌加大到 1000：基础圈外仍会追击；
//   - 非潜艇目标与无舰种舰体维持基础索敌距离不变；
//   - 团队模式红舰：未发现的潜艇不成为目标（继续巡逻），护卫舰在扩大圈
//     内锁定潜艇，approach 状态朝选定目标推进而非“心灵感应”朝玩家。
import { describe, it, expect } from 'vitest';
import { EnemyShip } from '../enemy.js';
import { EnemyTeamShip } from '../team_ai.js';
import { SUB_DETECT_RANGE } from '../config.js';

function makeScene() {
  return { add() {}, remove() {} };
}

function subPlayerAt(x, z) {
  return { x, z, heading: 0, speed: 0, shipClass: 'submarine' };
}

function decide(enemy, playerPos) {
  const dx = playerPos.x - enemy.mesh.position.x;
  const dz = playerPos.z - enemy.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  return enemy._decideAI(0.1, playerPos, dist, dx, dz);
}

describe('config mirror values', () => {
  it('护卫舰加大、巡洋/战列削弱', () => {
    expect(SUB_DETECT_RANGE).toEqual({ destroyer: 1000, cruiser: 400, battleship: 300 });
  });
});

describe('solo AI 对潜索敌', () => {
  it.each([
    ['cruiser', 450, 'idle'],      // 旧基础 600 内会追击，现在 400 圈外
    ['battleship', 350, 'idle'],
    ['destroyer', 800, 'chase'],   // 基础 600 外，护卫舰 1000 圈内
    ['destroyer', 1100, 'idle'],
    [null, 550, 'chase'],          // 无舰种：回退基础 600
    [null, 650, 'idle'],
  ])('%s vs sub at %i -> %s', (shipType, dist, expected) => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, shipType);
    decide(enemy, subPlayerAt(0, dist));
    expect(enemy.state).toBe(expected);
  });

  it('非潜艇目标维持基础索敌距离', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'battleship');
    decide(enemy, { x: 0, z: 550, heading: 0, speed: 0, shipClass: 'destroyer' });
    expect(enemy.state).toBe('chase');
    decide(enemy, { x: 0, z: 650, heading: 0, speed: 0, shipClass: 'destroyer' });
    expect(enemy.state).toBe('idle');
  });

  it('未发现的潜艇不会被打（无炮弹无深弹）', () => {
    const enemy = new EnemyShip(makeScene(), null, 0, 0, 5, 'cruiser');
    const pm = { fired: [], fire(...a) { this.fired.push(a); } };
    const tm = { fired: [], fire(...a) { this.fired.push(a); } };
    enemy.updateShip(0.1, subPlayerAt(0, 450), 0, 0, pm, null, tm);
    expect(enemy.state).toBe('idle');
    expect(pm.fired.length).toBe(0);
    expect(tm.fired.length).toBe(0);
  });
});

// ---- Team mode (reds vs the player's sub) ----

function friendlyUnit(x, z, shipClass = 'submarine') {
  return { x, z, heading: 0, speed: 0, alive: true, shipClass, hp: 100, maxHp: 100 };
}

function redDecide(shipType, friendlies, playerSub) {
  const red = new EnemyTeamShip(makeScene(), null, 0, 0, 6, shipType, 0, playerSub);
  red.setTargets(friendlies);
  const dx = playerSub.x - red.mesh.position.x;
  const dz = playerSub.z - red.mesh.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const res = red._decideAI(0.1, playerSub, dist, dx, dz);
  return { red, res };
}

describe('team AI 对潜索敌', () => {
  it('巡洋在削弱圈外继续巡逻，不锁定潜艇玩家', () => {
    const playerSub = friendlyUnit(0, 500);
    const { red } = redDecide('cruiser', [playerSub], playerSub);
    expect(red.state).toBe('patrol');
    expect(red.target).toBeNull();
    expect(red.fireTarget).toBeNull();
  });

  it('护卫舰在扩大圈内锁定潜艇玩家并接战', () => {
    const playerSub = friendlyUnit(0, 950);   // 基础圈 900 外、护卫舰圈 1000 内
    const { red } = redDecide('destroyer', [playerSub], playerSub);
    expect(red.state).not.toBe('patrol');
    expect(red.state).toBe('focus_fire');
    expect(red.target.ref).toBe(playerSub);
  });

  it('护卫舰在声纳圈外失去潜艇玩家', () => {
    const playerSub = friendlyUnit(0, 1100);
    const { red } = redDecide('destroyer', [playerSub], playerSub);
    expect(red.state).toBe('patrol');
    expect(red.fireTarget).toBeNull();
  });

  it('approach 不朝未探测的潜艇玩家推进（避免心灵感应诱饵）', () => {
    const playerSub = friendlyUnit(0, 1200);            // 巡洋圈 400 外：未发现
    const wingman = friendlyUnit(850, 0, 'destroyer');  // 索敌圈 900 内：已接战
    const { red, res } = redDecide('cruiser', [playerSub, wingman], playerSub);
    expect(red.state).toBe('approach');
    expect(red.target.ref).toBe(wingman);
    // 航向朝翼舰（+x → π/2），而非朝未发现的潜艇玩家（+z → 0）
    expect(res.targetHeading).toBeCloseTo(Math.PI / 2, 5);
  });

  it('普通玩家远处时 approach 仍朝玩家集群推进', () => {
    const player = friendlyUnit(0, 1200, 'destroyer');  // 非潜艇：位置已知
    const wingman = friendlyUnit(850, 0, 'cruiser');    // 更近，成为接战目标
    const { red, res } = redDecide('cruiser', [player, wingman], player);
    expect(red.state).toBe('approach');
    expect(red.target.ref).toBe(wingman);
    // 航向朝玩家（+z → 0），保持原有集群推进行为
    expect(res.targetHeading).toBeCloseTo(0, 5);
  });
});
