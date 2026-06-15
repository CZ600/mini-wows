---
name: bug-fix-log
description: 联机模式 bug 修复记录
type: project
---

# Bug 修复记录

## 2026-06-13

### Bug 1: 联机模式炮塔冷却不递减

**问题**: 开火后装填倒计时不变化，第二次及之后点击无反应，只发射一枚炮弹

**原因**: `multiplayer_engine.js` 的 `_loop` 方法中，`_fireGuns` 设置了客户端炮塔冷却时间但从未递减。联机模式不调用 `Ship.update()`（该方法会递减冷却）。

**修复**: 在 `_loop` 炮塔瞄准代码后添加冷却递减循环

### Bug 2: 联机模式看不到其他玩家船只

**问题**: 两个玩家进入游戏后看不到对方的船

**原因**: JavaScript `Set` 与 `Object` 类型不一致。msgpack 解码后 `snap.id` 是数字，`activeIds` Set 存数字；但 `for...in` 遍历 Object key 得到字符串。`Set.has("2")` 在 Set 存的是数字 `2` 时返回 `false`，导致船刚创建就被清理代码立即删除。

**修复**: `_syncOtherShipMeshes` 清理循环中 `activeIds.has(id)` 改为 `activeIds.has(Number(id))`

### Bug 3: 联机鱼雷不显示

**问题**: 发射鱼雷后，红色倒三角、尾迹、圆柱体本体均不显示

**原因**: 与 Bug 2 同根因。`_updateTorpedoVisuals` 中 `activeIds` 存数字类型 torpedo ID，但 `for...in` 遍历 `_torpedoVisuals` 对象得到字符串 key。`Set.has("5")` 与 `Set.has(5)` 不匹配，导致鱼雷每帧被清除。

**修复**: `_updateTorpedoVisuals` 清理循环中 `activeIds.has(id)` 改为 `activeIds.has(Number(id))`

### Bug 4: 火炮无论多少门只发射一个炮弹

**问题**: 多炮塔舰船开火时只看到一个炮弹

**原因**: 服务端 `process_fire` 中所有炮弹从 `(ship.pos_x, 3.0, ship.pos_z)` 同一点、同方向发射，完全重叠。

**修复**: 新增 `_get_turret_offsets` 和 `_turret_world_pos` 方法，根据炮塔在船体上的前后位置计算各自发射点，发射时按船体朝向旋转到世界坐标。

### Bug 5: 炮弹命中判定不考虑船体旋转

**问题**: 船体转向后，炮弹判定使用世界坐标 AABB，与实际船体形状不符。

**修复**: 将炮弹位置变换到船体局部坐标系（旋转 -heading），再进行 AABB 判定。同时修复了鱼雷的同类问题。

### Bug 6: 联机游戏结束流程错误

**问题**: (1) 玩家被击毁后双方都结束游戏 (2) 结束后开启单人游戏而非关闭房间显示结算

**原因**: (1) 缺少单玩家淘汰通知机制，死亡玩家无反馈 (2) GameOverScreen 只有单人模式的"继续/重新开始"按钮

**修复**: 服务端在玩家死亡但游戏未结束时发送 `player_eliminated` 消息；前端新增 `onEliminated` 回调显示"已淘汰"观战遮罩；GameOverScreen 增加联机结算模式显示所有玩家排名和"返回大厅"按钮。

### Bug 7: 炮弹视觉仍只有一个

**问题**: 即使服务端发射多颗炮弹，视觉上仍然只看到一个

**原因**: (1) 后炮塔 `currentYaw` 初始为 π（朝后），`getTurretFireData` 用此值算方向导致后炮塔炮弹向后飞 (2) 桥楼船后炮塔 `yawRange=2.2 < π`，无法向前瞄准 (3) 炮弹颜色 0x333333 过暗

**修复**: (1) `_fireGuns` 改用统一瞄准方向（所有炮塔瞄准同一目标），仅发射起点按各炮塔世界坐标区分 (2) 炮弹颜色改为 0xffaa00（橙色）更易辨识 (3) `_updateProjectileVisuals` 仅在 `_localProjMgr` 有效时过滤本地玩家炮弹，否则回退渲染全部

### Bug 8: 快速匹配重开后画面黑屏

**问题**: 联机对局结束后再次快速匹配，画面一片漆黑

**原因**: (1) `GAME_OVER` 状态下 React 卸载 `<canvas>`，但 WebGL renderer 仍绑定旧 canvas，重新挂载后 renderer 失效 (2) `_startGame` 不清理旧游戏资源（terrain、water、ships等），导致内存泄漏和渲染异常

**修复**: (1) 联机 `GAME_OVER` 状态下保持 canvas 挂载 (2) 新增 `_cleanupGame()` 方法在 `_startGame` 开头清理全部旧资源（terrain、water、projectiles、torpedoes、ships）

### Bug 9: 玩家船只移动后起始位置留下重复建模

**问题**: 船只移动后，在初始位置 (0,0,0) 留下一个不可交互的重复船体模型

**原因**: (1) `Terrain` 类没有 `destroy()` 方法，`_cleanupGame` 的 `this.terrain.destroy?.()` 无效，旧地形网格永留场景 (2) `_startGame` 创建船在 (0,0,0)，几帧后快照才将其移到出生点，期间在原点短暂渲染

**修复**: (1) 为 `Terrain` 添加 `destroy()` 方法（remove + dispose geometry/material） (2) `_cleanupGame` 中对船体 mesh 的所有 children 做 geometry/material dispose (3) 船体初始 `visible=false`，收到第一个服务器快照设置正确位置后才显示

### Bug 10: 敌方炮弹只显示一颗

**问题**: 多人游戏中敌方玩家发射的炮弹无论多少，只能看到一颗

**原因**: `_updateProjectileVisuals` 使用索引数组追踪炮弹网格，当炮弹从快照中移除时索引错位，导致位置更新不正确。改用 `Map` 以炮弹 ID 为键追踪每个炮弹的网格，避免索引错位。同时增大炮弹球体半径（0.3→0.5）和改用更醒目的颜色（0xffaa00→0xff6644）提高可见性。

### Feature 1: FFA 重生机制

**新增**: 乱斗模式（FFA）添加重生系统。房主创建房间时可设置重生次数上限（0-10），0次表示死亡即淘汰。玩家死亡后在初始出生点重生，血量和炮塔冷却重置。快照中新增 `rspn` 字段传递剩余重生次数。

**变更**:
- 服务端: `GameState` 新增 `respawn_limit`、`_respawn_remaining`、`_initial_spawns`，`_process_respawns()` 在每帧 `update()` 中处理重生
- `Room` 新增 `respawn_limit` 参数，`_tick_loop` 仅在玩家无剩余重生次数时发送 `player_eliminated`
- 客户端: `MultiplayerHUD` 右上角显示剩余重生次数，`_processSnapshot` 处理玩家重生（复活本地/其他玩家船体）

### Feature 2: HUD UI 改进

**新增**:
- 速度显示添加半透明背景边框（`speed-display`），大号数字 + 单位标注
- 右上角 HUD 元素添加统一半透明背景框（`hud-row-boxed`），保持与各种游戏背景的对比度

### Bug 11: 重生次数始终为 0

**问题**: 不管房主创建房间时选择几次重生，实际房间内重生次数始终为 0，死亡一次即淘汰。此外只有创建房间的玩家才会在 HUD 中看到重生次数显示。

**原因**: (1) `LobbyScreen.jsx` 中 `handleQuickMatch` 和 `handleCreateRoom` 传递 `respawnLimit` 作为第 3 个参数，但 `GameContext` 的处理函数期望第 3 个参数是 `shipClass`，这导致 `respawnLimit` 被当作 `shipClass`，真正的 `respawnLimit` 取默认值 0。(2) 服务端 `_broadcast_room_update` 不包含 `respawnLimit` 字段，客户端 `room_update` handler 也未保留它，导致非创建者在房间更新后丢失该值。(3) `RoomScreen` 没有显示重生次数。

**修复**:
- `LobbyScreen.jsx`: 在 `respawnLimit` 前补充 `null` 作为 `shipClass` 参数
- `room.py`: `_broadcast_room_update` 新增 `mode` 和 `respawnLimit` 字段
- `multiplayer_engine.js`: `room_update` handler 保留 `respawnLimit` 和 `mode`
- `RoomScreen.jsx`: FFA 模式房间头部显示重生次数，颜色根据数值变化（>0 绿色，0 红色）
- `test_respawn.py`: 新增 `TestRespawnLimitPropagation` 类，验证 respawn_limit 正确传播到所有玩家

### Bug 12: 快速匹配多余的重生选择器

**问题**: 快速匹配界面向非房主玩家展示重生次数选择器，但快速匹配应只按房间等级匹配，重生次数应由房主决定。

**修复**: `MultiSetupScreen.jsx` 的 `renderRespawnSelector` 新增 `isQuickMatch` 参数，快速匹配模式下不显示重生选择器。

### Bug 13: 敌方炮弹只显示一个球体

**问题**: 敌方玩家发射多发炮弹时，己方只能看到一个球状物体，与真实炮弹数目不匹配。

**原因**: (1) `_updateProjectileVisuals` 中在 `for...of` 迭代 Map 时调用 `.delete()` 修改同一 Map，某些 JavaScript 引擎下可能导致迭代器跳过条目，造成炮弹网格追踪状态错乱。(2) 远程炮弹只有独立球体网格，没有尾迹（trail），多个炮弹以接近平行轨迹飞行、间隔仅 ~1.7 单位时，在远距离视觉上不可区分。

**修复**:
- `multiplayer_engine.js` `_updateProjectileVisuals`: 改用安全的清理模式（先收集待删除 ID，再统一删除），避免迭代中修改 Map
- 远程炮弹新增尾迹渲染（`THREE.Points` 粒子轨迹，60 点历史位置），轨迹颜色 0xff6644，与本地炮弹尾迹风格一致
- `_cleanupGame` 同步更新：清理时释放尾迹的 geometry 和 material
- `_syncOtherShipMeshes` 和 `_updateTorpedoVisuals` 同样修复了 `for...in` / `for...of` 迭代中修改集合的问题，采用安全的"先收集再删除"模式

### Bug 14: 加入房间后被立即重定向到大厅

**问题**: 玩家创建房间后，其他玩家点击"加入"进入 `/multi/room` 页面时，会被瞬间路由回 `/multi`，无法进入准备界面。

**原因**: `RoomPage` 的 `useEffect` 中使用了即时重定向逻辑 `if (!roomInfo && !pendingRoomRef.current) navigate('/multi')`。虽然 `handleJoinRoom` 在导航前同步设置了 `pendingRoomRef.current = true`，但在某些时序场景下（如 WebSocket 连接初始化、组件挂载与 ref 读取之间的微妙交互），`pendingRoomRef.current` 可能在 effect 执行时未被正确读取为 `true`，导致条件满足并触发即时重定向。

**修复**:
- `App.jsx` `RoomPage`: 将即时重定向改为延迟重定向 —— 如果 `pendingRoomRef.current` 为 `true`（正在等待房间信息），则完全不设置重定向定时器；只有当 `pendingRoomRef.current` 为 `false`（用户直接访问 URL 而非通过加入流程）时，才设置 3 秒超时后重定向
- `RoomPage` 加载界面新增"返回大厅"按钮，允许用户在等待超时或 WebSocket 失败时手动返回
- `routing.test.jsx`: 新增 3 个测试用例验证 `pendingRoomRef` 在 `handleJoinRoom`、`handleCreateRoom` 中正确设为 `true`，以及在 `onRoomUpdate` 回调后正确重置为 `false` 并更新 `roomInfo`

### Bug 15: 倒计时结束后游戏无法启动

**问题**: 倒计时到 1 后卡住，游戏无法开始，控制台报错 `TypeError: Cannot read properties of undefined (reading 'remove')`，调用链为 `_startGame` → `_cleanupGame` → `Terrain.destroy`。

**原因**: `Terrain` 类的 `destroy()` 方法中调用 `this.scene.remove(this.mesh)`，但构造函数从未将 `scene` 参数保存为 `this.scene`，导致 `this.scene` 始终为 `undefined`。当 `_startGame` 调用 `_cleanupGame` 清理上一局残留的地形资源时（例如重开游戏、快速匹配第二局），`Terrain.destroy()` 尝试访问 `undefined.remove()` 导致崩溃，`_startGame` 异常退出，游戏无法正常启动。

**修复**:
- `terrain.js` 构造函数: 新增 `this.scene = scene` 保存场景引用
- `terrain.js` `destroy()`: 新增 `if (this.scene)` 防御性检查，即使 scene 未设置也不会崩溃

### Bug 16: 重生次数始终为 0（再次出现）

**问题**: 与 Bug 11 相同症状，问题在修复后再次出现。无论房主设置几次重生限制，进入游戏后 HUD 显示重生次数为 0。

**原因**: `_startGame` 从不初始化 `_myRespawns`，该值只从快照的 `rspn` 字段获取。虽然快照正确携带了该字段，但如果快照处理过程中 `msg.you` 异常为空（例如快照到达时组件尚未完全挂载、重连场景等），`_myRespawns` 保持构造函数中的初始值 0。此外 `game_start` 消息不包含 `respawnLimit`，无法作为后备初始化来源。

**修复**:
- `room.py`: `game_start` 广播消息新增 `respawnLimit` 字段，值为 `self.respawn_limit`
- `multiplayer_engine.js` `_startGame`: 从 `msg.respawnLimit ?? this._respawnLimit ?? 0` 初始化 `_myRespawns`，确保 HUD 在第一个快照到达前就显示正确值
- `test_respawn.py`: 新增 `TestGameStartRespawnLimit` 类，验证 `respawnLimit` 在 `game_start` 消息和 `Room→GameState→snapshot` 链路中的正确传递

### Bug 17: 敌方炮弹同步数量不匹配

**问题**: 玩家看见敌方射出的炮弹只有一个，无论敌方发射多少发。

**原因**: 经过端到端代码审查和服务端测试验证，服务端逻辑完全正确——`process_fire` 为每个就绪炮塔分别创建弹丸，所有弹丸均包含在快照中。客户端 `_updateProjectileVisuals` 的 Map-based 跟踪、远程过滤和网格创建逻辑也正确。但发现了两个可能的潜在问题：(1) msgpack/JavaScript 的数字类型一致性（`p.owner` 与 `this._myId` 比较）在极端情况下可能导致过滤失败。(2) 多个弹丸从不同炮塔以几乎相同的方向发射时，轨迹接近平行，远距离视觉上难以区分。

**修复**:
- `test_respawn.py`: 新增 6 个 `TestProjectileSnapshots` 测试用例，覆盖多弹丸存活、唯一 ID、其他玩家视角过滤、不同炮塔起始位置等场景。所有 24 个测试通过。
- 服务端代码无需修改（已通过完整测试验证）。
- 客户端过滤逻辑保持现有 `!==` 严格比较（MsgPack 正确保留数字类型）。

### Bug 18: 炮弹显示数量翻倍

**问题**: 敌方发射 3 发炮弹，玩家看到 6 发炮弹飞来，显示数量是实际的 2 倍。

**原因**: `_updateProjectileVisuals` 中的远程炮弹过滤使用 `p.owner !== this._myId`。`p.owner` 来自服务端 msgpack 整数，`this._myId` 来自 JWT→JSON API 解析的 number。当两者类型不一致（number vs string）时，`!==` 返回 `true`，本地玩家的炮弹也被当成"远程炮弹"渲染，与 `_localProjMgr` 的本地预测炮弹叠加导致数量翻倍。

**修复**:
- `multiplayer_engine.js` `_updateProjectileVisuals`: 过滤比较改为 `String(p.owner) !== String(this._myId)`，统一转为字符串再比较，消除类型不一致问题

### Bug 19: 炮弹碰撞检测不准确

**问题**: 炮弹命中舰船的碰撞检测不准确，有时炮弹穿过船体也无法造成伤害。高等级舰船（高度 > 2.5m）尤其明显。

**原因**: (1) `projectile.py` 碰撞检测中舰船高度硬编码为 `2.5`，但实际舰船高度随等级变化（Lv1: 1.5m → Lv10: 6.0m），高等级舰船在 y=2.5~6.0 范围内的炮弹无法被检测到。(2) `ServerShip` 未存储高度属性。(3) 碰撞边距仅 0.5m，在 200m/s 弹速、50ms 每帧（10m/帧）条件下，炮弹容易跳过碰撞盒。

**修复**:
- `ship.py` `ServerShip.__init__`: 新增 `self.ship_height = cfg["height"]`
- `projectile.py`: 高度检测从硬编码 `2.5` 改为 `getattr(s, 'ship_height', 2.5)`；碰撞边距从 `0.5` 增加到 `2.0`，减少高速炮弹跳过碰撞盒的概率
- `test_respawn.py`: 新增 `TestShipCollisionDetection` 类（4 个测试），验证高度属性存储、实际高度碰撞检测、边距改进、自弹不命中

### Bug 20: 鱼雷击杀导致对局误结算（重生次数"看似共享"）

**问题**: 双人对局设置重生3次，A死2次、B死1次后对局直接结算。用户怀疑重生次数是所有玩家共享的。

**原因**: 重生次数本身**已经是每人独享**的（`_respawn_remaining` 按 `player_id` 分别存储）。真正的根因是 `GameState.update()` 中 `_process_respawns()` 的调用位置——在炮弹更新之后、鱼雷更新之前。当玩家被鱼雷击杀时（鱼雷更新在 `_process_respawns` 之后执行），该玩家在本 tick 末尾仍然是"死亡"状态。紧接着 `_check_game_end` 检查存活人数 ≤ 1 就误判对局结束，而该玩家本应在下一 tick 重生。

**修复**:
- `game_state.py` `update()`: 将 `_process_respawns()` 调用从"炮弹更新后、鱼雷更新前"移到 `update()` 最末尾（所有伤害源之后），确保同 tick 内被鱼雷/敌方击杀的玩家立即重生，`_check_game_end` 看到正确的存活状态
- `test_respawn.py`: 新增 `TestTorpedoKillRespawnOrdering` 类（5 个测试），验证鱼雷击杀同 tick 重生、双方存活、重生次数扣减、丝血鱼雷击杀、每人独享重生计数

### Bug 21: 联机模式炮弹数量不匹配（其他玩家看到6发）

**问题**: 舰船不论实际射出3发还是6发炮弹，别的玩家视角中都是所有火炮齐射6发。

**原因**: 客户端 `_fireGuns` 只让满足 `turretCanAim` 的炮塔开火（桥楼船后炮塔 `yawRange=2.2`，向前方射击时无法转向），但服务端 `process_fire` **只检查冷却不查瞄准范围**，所有冷却完毕的炮塔都发射。服务端创建多余的炮弹并通过快照广播给其他玩家，导致数量翻倍。

**修复**:
- `game_state.py`: 新增 `_get_turret_yaw_caps(ship)` 返回每门炮塔的 `(yaw_center, yaw_range)`（前炮塔 yawCenter=0，后炮塔 yawCenter=π；有桥楼 yawRange=2.2，无桥楼 yawRange=π），以及 `_turret_can_aim()` 静态方法，镜像客户端 `turretCanAim` 逻辑
- `game_state.py` `process_fire`: 计算目标相对船头的局部偏航角，过滤出冷却完毕 **且** 能瞄准目标的炮塔，只让这些炮塔发射
- `test_game.py`: 新增 `TestTurretAimFilter` 类（7 个测试），验证桥楼船前/后射击只发射对应炮塔、无桥楼船全向发射、等级10/战列舰前射只发3门

### Bug 22: 鱼雷伤害提升（在当前值基础上 ×1.5）

**问题**: 用户要求将鱼雷伤害在当前数值上再 ×1.5。

**修复**:
- `game/torpedo.py` `TorpedoManager.fire`: 伤害公式从 `(50 + tier * 20) * 2` 改为 `(50 + tier * 20) * 3`（tier1: 140→210, tier2: 180→270, tier3: 220→330）
- `test_balance.py` `TestTorpedoDamage`: 更新期望值与文档字符串

### Feature 3: 对战 UI 优化（头顶血条+小地图方位）

**新增**: 联机对战模式下其他玩家舰船头顶显示固定大小的血量条与昵称（HTML Overlay，不随距离变化），删除无用顶部罗盘，改为小地图四边中点标注 N/E/S/W 方位字母。

**变更**:
- `multiplayer_engine.js`:
  - 新增 `onShipLabelsUpdate` 回调、`_localTeam` 字段、`_labelTempVec` 复用向量
  - `_processSnapshot`: 从 `msg.you.team` 同步本地玩家队伍
  - `_syncOtherShipMeshes`: 在 `otherShips[id]` 上保存 `lastSnap`（含 hp/mhp/team/alive/name）
  - 新增 `_computeShipLabels()`: 每帧将其他玩家头顶世界坐标投影到屏幕坐标，输出 `{id,name,hp,maxHp,isFriendly,x,y}` 数组；过滤死亡玩家、相机背后、屏幕外
  - `_loop`: render 前调用回调推送标签；early-return 路径推送空数组以清空状态
- `components/ShipLabels.jsx`（新增）: HTML Overlay 渲染昵称（白色，>12 字符省略）+ 血量条（队友绿/敌人红）+ 血量数值（剩余/总）
- `context/GameContext.jsx`: 新增 `mpShipLabels` state，绑定 `mpEngine.onShipLabelsUpdate`，`handleBackToMenu` 清理
- `App.jsx` `MultiCanvasLayout`: 在非瞄准镜模式下挂载 `<ShipLabels>`
- `components/MultiplayerHUD.jsx` & `components/HUD.jsx`: 删除顶部 `<div id="compass">`
- `components/Minimap.jsx`: 用 `#minimap-wrap` 包裹 canvas，四边中点添加 N/E/S/W 字母
- `App.css`: 新增 `#ship-labels/.ship-label*` 样式与 `#minimap-wrap/.minimap-dir*` 样式；移除原 `#minimap` 的 fixed 定位（改由 wrapper 承担）

**约束**:
- 标签固定屏幕大小，不随距离缩放（HTML 天然特性）
- 死亡玩家（`snap.alive=false`）不显示标签
- 屏幕外/相机背后的玩家不显示标签
- 瞄准镜模式下不显示标签
- FFA 模式（team=null）所有其他玩家显示为敌人
- 队伍模式（team 相同）显示为队友（绿色血条）

**测试**: 项目无前端测试框架；通过 `npm run build`（vite 构建）验证 77 模块无语法错误。前端 UI 行为需在浏览器中手动测试：联机对战中其他玩家头顶应显示标签，队友绿/敌人红，血量减少时血条缩短，死亡时标签消失；小地图四边中点显示 N/E/S/W；顶部罗盘消失。

### Bug 23: 炮弹穿过船身但不判定命中

**问题**: 玩家观察到炮弹视觉上穿过敌舰，但未造成伤害。

**根因（双重 bug）**:
1. **高速 tunneling**: `PROJECTILE_INITIAL_SPEED=200` 在 20 Hz tick 下每帧位移 10m，比小型舰船的有效碰撞盒还宽。`ProjectileManager.update` 使用点-盒判定（仅检查当前帧位置），当炮弹上一帧在船一侧、本帧已飞到另一侧时，两个端点都不在盒内 → 漏判。
2. **高度上限过严**: Bug 19 的修复将碰撞高度从硬编码 2.5 改为 `ship_height`（L1 仅 1.5m），但实际船体型线延伸到 `1.0 + height`（甲板）甚至更高（桥楼）。结果甲板高度的炮弹（如 y=2 命中 L1 船）反而不判中。

**修复**:
- `game/projectile.py` `ServerProjectile`: 新增 `px/py/pz` 字段记录上一帧位置；`update()` 在位移前先备份当前位置
- `game/projectile.py` `ProjectileManager.update`: 用 **swept AABB（线段-盒求交，slab method）** 替换点-盒判定。对每个炮弹，将其 prev→curr 线段变换到每艘船的局部坐标系，分别计算 x/y/z 三轴 slab 的进入/离开 t 值，取交集；当 `t_enter ≤ t_exit` 且与 `[0,1]` 重叠时判中。对平行线段（某轴方向≈0）额外校验 prev 位置是否在该轴 slab 内
- 高度上限改为 `ship_height + 3.0`，覆盖甲板及小型桥楼基础部分

**约束**:
- 单帧位移无论多大（包括从船一侧瞬移到另一侧）都能被检测
- 自弹仍然不命中 owner
- 队伍模式下队友不互相伤害
- 高空飞过（y 远高于船体型线）不算命中
- 既不引入误判（segment 不与盒相交时不命中），也不漏判（segment 与盒相交必命中）

**测试**: `tests/test_respawn.py::TestShipCollisionDetection` 新增 4 个测试：
- `test_fast_projectile_does_not_tunnel`: 200 m/s 炮弹从 x=-5 到 x=+5（端点都不在 [-3,3] 内），必须命中
- `test_projectile_at_deck_level_hits`: y=2 静止炮弹命中 L1 船（之前因 height=1.5 漏判）
- `test_high_flyover_misses`: y=20 飞过不命中
- `test_segment_catching_ship_at_edge`: 线段未跨过盒时不命中（防误判）

此前会话中失败的 `tests/test_multiplayer.py::TestHitDetectionRotation::test_hit_works_when_ship_rotated` 现在通过。全量 162 个测试全部通过。

### Feature 4: 按船型尺寸比例放大碰撞盒

**问题**: Bug 23 修复后，碰撞盒使用 `width/2 + 2.0` 这种"绝对 + 固定 margin"形式。+2.0m 对小船占 40% 宽度，对大船仅占 27%，导致小船相对"更容易打中"，大船相对"更难打中"——这与"战列舰作为大目标应更容易打"的直觉相反。

**修复**:
- `game/projectile.py` `ProjectileManager.update`: 宽度方向 margin 改为 `max(width/2 * 1.7, width/2 + 2.0)`
  - 大船（battleship）按 1.7x 比例放大判定盒 → L10 half_w 从 7.5 提升到 9.35（+25%）
  - 小船（destroyer、低等级）保底维持 +2.0 绝对值 → 防止小船判定盒大幅缩水
- 长度方向（`+2.0`）和高度方向（`+3.0`）保持不变，因为当前比例差距已经较小

**效果对比（半宽 half_w）**:

| 船型 | 等级 | 当前 | 新 | 变化 |
|------|------|------|-----|------|
| destroyer | L10 | 5.0 | 5.1 | +2% |
| cruiser | L10 | 6.7 | 8.0 | +19% |
| battleship | L10 | 7.5 | **9.35** | **+25%** |
| destroyer | L4 | 3.4 | 3.4 | 0% |
| cruiser | L4 | 4.1 | 4.1 | 0% |
| battleship | L4 | 4.5 | 4.5 | 0% |

**约束**:
- 任何船型的判定盒都不会小于原 `+2.0` 公式的值（保底）
- 高等级大船（width > 5.7m）按 1.7x 比例放大
- 大小船的"相对宽容度"在高等级下接近一致（都约 1.7x）
- 鱼雷判定盒不变（鱼雷有独立的爆炸半径 TORPEDO_HIT_RADIUS=3）

**测试**: `tests/test_respawn.py::TestShipCollisionDetection` 新增 3 个测试：
- `test_battleship_has_proportional_hitbox`: battleship L10 在 x=8（旧 7.5 外，新 9.35 内）应命中
- `test_destroyer_hitbox_not_shrunk_at_low_level`: 低等级 destroyer 保底维持 +2.0
- `test_battleship_easier_to_hit_than_destroyer`: 同一偏移 x=8.5 应命中 battleship 但 miss destroyer

全量 165 个测试全部通过。

### Bug 24: 联机重开局鼠标点击/滑动/数字键失效（WASD 仍可用）

**问题**: 第一局打完返回大厅再开第二局时，画面正常、WASD 可移动，但鼠标点击不开火、滑动不转视角、数字键 1/2/3/4 不切换武器。

**原因**: `MultiplayerEngine.init(canvas)` 的"重新初始化"分支（canvas 变化时触发，例如 `MultiCanvasLayout` 重新挂载）只重建了 WebGL renderer，没有更新 `Controls` 实例：
- `Controls` 构造时把 `click`/`contextmenu` 监听器绑在旧 canvas 上 → 新 canvas 点击事件无人响应 → 永远不会调用 `requestPointerLock`
- `_onClick` 和 `_onLockChange` 闭包直接引用构造时的 `canvas` 参数，即使后续改了 `this.canvas`，闭包仍用旧值 → `document.pointerLockElement === canvas` 永远为 `false` → `this.locked` 永远为 `false`
- 鼠标移动/开火/数字键的回调都有 `if (this.locked)` 守卫 → 全部失效；但 WASD 不依赖 `locked`，所以仍能移动

**修复**:
- `controls.js`: 新增 `attachCanvas(newCanvas)` 方法，从旧 canvas 移除监听器后改绑到新 canvas；`_onClick` / `_onLockChange` 闭包内把 `canvas` 改为 `this.canvas`，使其响应动态切换
- `multiplayer_engine.js` `init()`: 重新初始化分支中调用 `this.controls.attachCanvas(canvas)` 把输入通道切到新 canvas
- `tests/controls.test.js`: 新增 4 个测试覆盖 `attachCanvas` 的监听器重绑、`requestPointerLock` 走新 canvas、`pointerLockElement` 比较走新 canvas、`destroy` 从新 canvas 移除

### Bug 25: 联机有时直接判游戏结束（即使有重生次数）

**问题**: 偶发场景下联机一开局立即结算，HUD 显示剩余重生次数 > 0 也无效。

**原因**: `_find_water` 只校验船体中心点是否水域，未校验四角。FFA 出生点在距原点 550m 的圆周上，靠近岛屿边缘时极易出现"中心在水、某角压陆地"。`ServerShip.update()` 用严格四角陆地检测，任意一角压陆地立即 `alive=False`。`_process_respawns` 在同一坏点重生 → 同 tick 又死 → 直到重生次数耗尽 → `_check_game_end` 判负。从用户视角就是"有重生也直接结束"。

**修复**:
- `game/config.py`: 新增 `RAMMING_DAMAGE = 50`（顺手为 Bug 26 引入）
- `game_state.py`: `_find_water` 签名扩展为 `_find_water(start_x, start_z, ship_length, ship_width)`；新增 `_is_safe_for_ship` 用方形缓冲（`max(ship_length, ship_width)/2`）校验四角都在水域；螺旋搜索半径从 2000 扩到 4000、角度细分从 12 提到 24，避免在密集岛屿图找不到合法点
- 三个 spawn 方法（`_spawn_ffa` / `_spawn_team` / `_spawn_pve`）传入船体尺寸
- `tests/test_spawn.py` 新增 `TestSpawnSafeFromLand`，覆盖：岛屿压制下的角点安全、`_find_water` 显式调用四角校验、首帧 `update()` 不死亡、30 个随机种子 × 8 个出生点的压力测试

### Bug 26: 联机模式舰船碰撞无伤害

**问题**: 两舰船对撞不会扣血。

**原因**: 服务端从未实现 ship-ship 碰撞。`ServerShip.update()` 只测地形，`GameState.update()` 也没有调用任何舰船间碰撞逻辑。

**修复（采用方案 B：单次固定伤害 + 推开）**:
- `game_state.py` 新增 `_process_ship_collisions()`：
  - 圆形近似：`radius = max(ship_length, ship_width) / 2`，两船距离 < 半径和即判定碰撞
  - 敌我双方各受 `RAMMING_DAMAGE`（50 点）固定伤害；同队只推开不扣血
  - 沿中心连线把两船推开到正好不重叠（+1m 缓冲），防止下一 tick 再判中
  - 触发 `hit` 事件（`weapon: "ram"`），击沉触发 `entity_destroyed`
  - 三角碰撞逐对处理，每对都独立判定
- `GameState.update()` 在鱼雷更新之后调用 `_process_ship_collisions()`，在 `_process_respawns()` 之前
- `tests/test_respawn.py` 新增 `TestShipShipCollision`，9 个测试覆盖：双向伤害、推开、远距离无伤、单次伤害（非连续）、事件、击沉、队友无伤、敌队有伤、三角碰撞

**测试结果**: 全量后端 193 个测试 + 前端 84 个测试全部通过。

### Feature 5: 船只档位系统（替换按住 W/S 加减速）

**需求**: 把"持续按住 W 加速、按住 S 后退、松开摩擦减速"改为 6 档切换（倒退/停车/前进1-4），W 升档、S 降档，每次按下切一档；当前档位的目标速度通过原有加速度物理自然过渡。后退上限维持 `0.3 * max_speed`（用户最终决定不改为 1/2）。

**档位与目标速度**:
- 0 倒退 → `-0.3 * max_speed`
- 1 停车 → `0`
- 2 前进1 → `0.25 * max_speed`
- 3 前进2 → `0.50 * max_speed`
- 4 前进3 → `0.75 * max_speed`
- 5 前进4 → `1.00 * max_speed`

**协议策略**：客户端把档位在本地映射为虚拟 `keys.w/keys.s` 布尔（当前速度 < 目标速度 → w=true；> 目标速度 → s=true；相等 ±0.05 epsilon → 都 false），**服务器物理代码、`input_sender.js`、`reconciliation.js` 全部不动**。

**变更**:
- `frontend/src/game/controls.js`:
  - 新增 `export const GEAR_RATIOS = [-0.3, 0, 0.25, 0.5, 0.75, 1.0]`
  - 新增 `this.gear = 1`（默认停车）
  - `_onKeyDown`: W/S 在 `this.locked && !e.repeat` 时升降档（`e.repeat` 防按住抖动），A/D 仍维护 `keys.a/keys.d` 持续按住状态；W/S 不再直接写 `keys.w/keys.s`
  - 新增 `updateMotionKeys(currentSpeed, maxSpeed)`：根据档位目标速度和当前速度推导 `keys.w/keys.s`，epsilon=0.05 防止在目标速度处抖动
- `frontend/src/game/engine.js`:
  - `start()` 重置时增加 `this.controls.gear = 1`
  - `ship.update` 前调用 `this.controls.updateMotionKeys(...)`
  - `onHudUpdate` payload 增加 `gear: this.controls.gear`
- `frontend/src/game/multiplayer_engine.js`:
  - `_startGame` 重置时增加 `this.controls.gear = 1`
  - 本地预测物理前调用 `this.controls.updateMotionKeys(...)`
  - `onHudUpdate` payload 增加 `gear: this.controls.gear`
- `frontend/src/components/HUD.jsx` & `MultiplayerHUD.jsx`:
  - 左下角 `.speed-display` 替换为 `.gear-display`（六行档位列：倒退/停车/前进1-4）
  - 当前档位行高亮（`.active`），仅在当前档位行显示速度（位置随档位变化）
- `frontend/src/App.css`: 新增 `.gear-display / .gear-row / .gear-row.active / .gear-speed` 样式

**约束**:
- 档位每次按下只切 1 档，按住不会持续切换（`e.repeat` 过滤）
- 档位 0-5 严格 clamp，超出不再变化
- `keys.w/keys.s` 完全由 `updateMotionKeys` 推导，用户输入不直接修改
- `keys.a/keys.d` 仍是用户按住状态（转向不变）
- 后退上限保持 `-max_speed * 0.3`（不变）
- 服务器物理代码、协议、reconciliation 完全不变
- 多人模式：客户端把档位翻译成 w/s 后通过 `InputSender` 发送，服务器感知的仍是 w/s 布尔
- 档位与目标速度比例的关系是数据驱动的（`GEAR_RATIOS` 数组），加/减档只需改数组
- UI 显示顺序：从上到下为「前进4 → 前进3 → 前进2 → 前进1 → 停车 → 倒退」（与档位数字索引相反，反映"上=加速、下=减速"的视觉直觉）。`GEAR_ROWS` 改为 `{name, gear}` 对象数组，渲染时按 `row.gear === gearIdx` 匹配高亮

**测试**:
- `frontend/tests/controls.test.js` 新增 22 个测试覆盖：`GEAR_RATIOS` 形状、默认 gear=1、W/S 升降档（含边界 clamp）、`locked=false` 不切换、`e.repeat=true` 不切换、W/S 不写 keys、A/D 仍工作、`updateMotionKeys` 在 6 档位 × 多种当前速度下的 w/s 推导
- `frontend/tests/hud.test.jsx` 新增 4 个测试覆盖：六行档位渲染顺序、唯一 active 行、速度仅在 active 行、速度随档位移动
- 全部前端测试 109 个通过

