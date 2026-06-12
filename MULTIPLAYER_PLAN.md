# 联机对战改造方案

## Context

当前项目是一个单机海战游戏（FastAPI + React + Three.js），所有游戏逻辑在客户端运行，服务端仅存储认证和战绩。用户要求将其改造为支持 4 种联机模式（PvP乱斗、5v5组队、联机PvE、单人PvE）的多人对战游戏。

## 联机方案：FastAPI WebSocket + 服务端权威 + 延迟优化

### 架构总览

```
客户端A ──WebSocket──→ FastAPI (服务端游戏循环) ←──WebSocket── 客户端B
                           │
                     内存中的游戏状态
                    (物理/碰撞/AI/伤害)
                           │
                        SQLite
                  (账号/战绩/排行榜)
```

### 核心技术

1. **客户端预测（Client-side Prediction）** — 本地立即执行输入，不等服务器确认
2. **服务器调和（Server Reconciliation）** — 收到服务器状态后，从服务器状态重放所有未确认输入
3. **实体插值（Entity Interpolation）** — 其他玩家在两个快照间平滑插值（100ms 缓冲）
4. **航位推算（Dead Reckoning）** — 快照间隔大时，根据速度/方向预测位置（最大500ms）
5. **内存热数据** — 位置/HP/速度等只在内存，DB 只存冷数据（账号/战绩）

### 服务端游戏循环

- **Tick rate: 20Hz**（50ms），战舰移动慢，20Hz 足够
- 固定 dt=0.05 保证确定性
- 每个 Room 一个 asyncio 任务独立运行

```python
async def room_tick_loop(room):
    while room.state == PLAYING:
        process_inputs(room)        # 处理队列中的玩家输入
        update_physics(room, DT)    # 移动战舰/炮弹/鱼雷
        update_ai(room, DT)         # AI行为（PvE模式）
        detect_collisions(room)     # 碰撞/伤害判定
        broadcast_snapshot(room)    # 广播状态快照给所有客户端
        await asyncio.sleep(...)
```

### 房间系统

```
CREATE → WAITING → COUNTDOWN → PLAYING → ENDED → CLEANUP
```

- **WAITING**: 等待玩家加入，房间码邀请或快速匹配
- **COUNTDOWN**: 最少人数达标且全部准备后，10秒倒计时
- **PLAYING**: 服务端 tick 循环运行
- **ENDED**: 胜负判定 → 写入 DB → 30秒后清理

**各模式人数限制**：

| 模式 | 最少 | 最多 | 胜负条件 |
|------|------|------|----------|
| PvP乱斗 | 2 | 8 | 最后存活 / 时间到最高分 |
| 5v5组队 | 10 | 10 | 对方全灭 / 时间到高分队 |
| 联机PvE | 2 | 6 | 全波次清除 / 玩家全灭 |
| 单人PvE | 1 | 1 | 当前逻辑不变 |

### 通信协议（JSON over WebSocket）

**客户端 → 服务端**：
```json
{ "type": "input", "seq": 42, "keys": {"w":true,"a":false,"s":false,"d":true}, "orbitYaw": 0.15, ... }
{ "type": "fire", "seq": 43, "aimTarget": {"x":100,"y":2,"z":-300} }
{ "type": "fire_torpedo", "seq": 44, "heading": 1.57 }
{ "type": "create_room", "mode": "ffa" }
{ "type": "join_room", "roomId": "abc123" }
{ "type": "ready" }
```

**服务端 → 客户端**：
```json
{ "type": "snapshot", "tick": 1050, "lastProcessedInput": 40,
  "yourEntity": { "x":100, "y":0, "z":-300, "heading":1.23, "speed":12.5, "hp":280 },
  "otherPlayers": [...],
  "enemies": [...],
  "projectiles": [...],
  "torpedoes": [...],
  "events": [{"type":"hit","target":"player_1","damage":35}]
}
```

- 快照 ~3-5KB/tick，20Hz 约 60-100KB/s/客户端
- 支持 delta 快照（只发变化的实体）减少 60-80% 带宽

### 数据分层

**内存（热数据）**：所有实体位置/速度/HP、AI状态、输入队列、局内分数
**数据库（冷数据）**：账号密码、玩家档案、对局记录、排行榜（仅登录时读、对局结束时写）

### 单人模式兼容

- 现有 `GameEngine` 保持不变，继续做客户端权威的单人 PvE
- 新增 `MultiplayerEngine`，复用 Three.js 场景/地形/水面渲染，状态来自服务器
- `App.jsx` 根据 mode 选择使用哪个 Engine

---

## 实施阶段

### Phase 1: 基础通信层
**目标**：两个浏览器窗口能看到对方战舰移动

新建文件：
- `wow/game/config.py` — 从前端 JS 复制所有游戏常量
- `wow/game/physics.py` — 战舰移动函数、碰撞检测
- `wow/game/ship.py` — 服务端战舰实体
- `wow/game/room.py` — 房间生命周期
- `wow/game/room_manager.py` — 房间注册表
- `wow/game/protocol.py` — 消息类型定义
- `wow/ws.py` — WebSocket 端点（JWT 认证）
- `wow/game/game_state.py` — 聚合所有实体

修改文件：
- `wow/main.py` — 注册 WebSocket 路由
- `wow/database.py` — 新增 multiplayer_games/multiplayer_game_players 表

前端新建：
- `frontend/src/game/ws_client.js` — WebSocket 连接管理
- `frontend/src/game/input_sender.js` — 输入捕获+发送+队列
- `frontend/src/game/entity_interpolator.js` — 其他玩家插值渲染
- `frontend/src/game/multiplayer_engine.js` — 多人游戏引擎

前端修改：
- `frontend/src/App.jsx` — 新增 LOBBY/ROOM/MULTIPLAYER_PLAYING 状态
- `frontend/src/components/MenuScreen.jsx` — 添加多人模式入口

**验证**：两个浏览器窗口各创建/加入房间，能看到对方战舰移动

### Phase 2: 预测与调和
**目标**：本地玩家体验流畅，无视网络延迟

新建：
- `frontend/src/game/reconciliation.js` — 服务器调和逻辑

实现：
- 输入序列号 + 确认机制
- 本地预测：客户端和服务端跑同样的移动函数
- 调和：收到服务器快照后，从服务器状态重放未确认输入
- `wow/game/game_state.py` — 服务端权威 tick 循环

**验证**：在延迟模拟下（Chrome DevTools 200ms），本地移动依然流畅

### Phase 3: 战斗系统
**目标**：炮弹、鱼雷、伤害、击沉在多人中正常工作

新建：
- `wow/game/projectile.py` — 服务端弹道模拟
- `wow/game/torpedo.py` — 服务端鱼雷模拟
- `wow/game/terrain.py` — 确定性地形（同 seed）

实现：
- 服务端碰撞检测：炮弹 vs 战舰、鱼雷 vs 战舰
- 快照中广播 hit/kill 事件和 HP 变化
- 前端从服务端快照渲染炮弹/鱼雷/爆炸

**验证**：两个玩家能互相射击并造成伤害

### Phase 4: AI 和 PvE 模式
**目标**：多人联机打 AI

新建：
- `wow/game/enemy.py` — 服务端炮塔和敌舰 AI（从 enemy.js 移植）

实现：
- 移植所有 AI 逻辑到 Python（idle/chase/orbit 状态机、弹道计算）
- 波次生成按玩家数量缩放：`base_count + (players - 1) * 2`
- 联机 PvE 房间模式
- 单人 PvE 通过现有 GameEngine 保持不变

**验证**：2-4 人合作对抗 AI 波次

### Phase 5: 组队与游戏模式
**目标**：全部 4 种模式可用

实现：
- 队伍分配（red/blue）、友军免伤判定
- FFA：无队伍，自由对战
- 5v5：红蓝两队，仅敌方有伤害
- 各模式胜负条件（全灭/时间到）
- 计分、击杀/死亡统计

**验证**：5v5 匹配中队伍伤害规则正确

### Phase 6: 大厅与打磨
**目标**：完整的联机体验

新建：
- `frontend/src/components/LobbyScreen.jsx` — 模式选择
- `frontend/src/components/RoomScreen.jsx` — 等待室（玩家列表/准备/聊天）
- `frontend/src/components/MultiplayerHUD.jsx` — 计分板/击杀信息/队伍标识

实现：
- 快速匹配（自动加入或创建房间）
- 房间码邀请
- 断线重连（60秒宽限期）
- 对局结束写入 DB
- 排行榜加入多人统计

**验证**：完整流程：登录→选模式→创建/加入房间→对战→结算

---

## 关键文件引用

| 文件 | 用途 |
|------|------|
| `frontend/src/game/ship.js:3-46,46` | 游戏常量（LEVEL_CONFIG, CLASS_CONFIG, BASE_MAX_SPEED）需移植到 `game/config.py` |
| `frontend/src/game/engine.js` | 当前游戏循环结构，需移植 tick 逻辑到服务端 |
| `frontend/src/game/enemy.js` | AI 逻辑需移植到 `game/enemy.py` |
| `frontend/src/game/turret.js` | 弹道计算 `calcBallisticAngles` 需移植 |
| `frontend/src/App.jsx` | React 状态机需扩展多人流程 |
| `main.py:10-17` | 现有 auth 逻辑可复用于 WebSocket 认证 |
| `main.py:28-29` | SECRET_KEY/ALGORITHM 复用于 WS JWT 验证 |

## 验证方式

每个 Phase 结束后：
1. 启动后端：`conda activate agent && python main.py`
2. 启动前端：`cd frontend && npm run dev`
3. 按该 Phase 的验证标准进行功能测试
4. 服务端单元测试：`pytest tests/`
5. 前端测试：`cd frontend && npm test`
