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
