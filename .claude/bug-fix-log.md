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
