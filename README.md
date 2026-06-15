# Mini-WoWs

一个基于 Web 的多人在线海战游戏，使用 React + Three.js 前端和 FastAPI 后端。

## 功能特性

### 游戏模式
- **PvP 乱斗** - 2-8 人自由对战，最后存活者获胜
- **5v5 组队** - 10 人红蓝两队对抗，消灭对方全队获胜
- **联机 PvE** - 2-6 人合作对抗 AI 波次
- **单人 PvE** - 单人闯关模式

### 核心系统
- **3D 渲染** - Three.js 实现海面、地形、舰船渲染
- **实时多人对战** - WebSocket 二进制通信，服务端权威物理模拟
- **科技树系统** - 10 级舰船升级
- **舰船类型** - 驱逐舰(高机动)、巡洋舰(平衡)、战列舰(高火力)
- **鱼雷系统** - 3 种等级鱼雷，不同速度/射程
- **排行榜** - 玩家积分排名
- **管理后台** - 用户管理、房间管理、公告系统

### 网络优化
- **客户端预测** - 本地立即执行输入，不等服务器确认
- **服务器调和** - 收到服务器状态后重放未确认输入
- **实体插值** - 其他玩家在两个快照间平滑插值 (100ms 缓冲)
- **航位推算** - 快照间隔大时预测位置 (最大 500ms)
- **断线重连** - 60 秒宽限期自动重连

## 技术栈

### 后端
- **Python 3.12**
- **FastAPI** - Web 框架
- **SQLite + aiosqlite** - 异步数据库
- **WebSocket** - 实时通信
- **JWT (PyJWT)** - 用户认证
- **bcrypt** - 密码加密
- **msgpack** - 二进制序列化
- **NumPy** - 数值计算

### 前端
- **React 19**
- **Three.js** - 3D 渲染引擎
- **Vite** - 构建工具
- **WebSocket** - 实时通信
- **@msgpack/msgpack** - 二进制序列化

## 快速开始

### 前置要求

- Python 3.12+
- Node.js 18+
- npm 或 yarn

### 后端

```bash
# 安装依赖
pip install -r requirements.txt

# 启动服务器
python main.py
```

服务器运行在 `http://localhost:8000`

### 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端运行在 `http://localhost:5173`

### Docker 部署

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

Docker 模式下：
- 后端: `http://localhost:8000`
- 前端: `http://localhost:30001`

## 默认账户

系统首次启动会自动创建管理员账户：

- **用户名**: `admin`
- **密码**: `admin123`

## 项目结构

```
.
├── main.py                    # FastAPI 应用入口
├── ws.py                      # WebSocket 处理
├── database.py                # 数据库操作
├── settings.py                # 配置文件
├── requirements.txt           # Python 依赖
├── Dockerfile                 # 后端 Docker 配置
├── docker-compose.yml         # Docker Compose 配置
├── game/                      # 游戏逻辑
│   ├── config.py              # 游戏配置 (舰船属性、地图参数等)
│   ├── game_state.py          # 游戏状态管理
│   ├── room.py                # 房间生命周期
│   ├── room_manager.py        # 房间注册表
│   ├── ship.py                # 舰船实体
│   ├── enemy.py               # AI 敌人逻辑
│   ├── projectile.py          # 弹道模拟
│   ├── torpedo.py             # 鱼雷系统
│   ├── terrain.py             # 地形生成
│   └── protocol.py            # 消息协议 (msgpack)
├── frontend/                  # React 前端
│   ├── src/
│   │   ├── App.jsx            # 主应用组件
│   │   ├── main.jsx           # 入口文件
│   │   ├── api.js             # API 客户端
│   │   ├── components/        # React 组件
│   │   ├── context/           # React Context
│   │   └── game/              # 游戏引擎
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── tests/                     # 测试文件
└── game.db                    # SQLite 数据库 (运行时生成)
```

## API 文档

### 认证接口

| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| GET | `/api/auth/me` | 获取当前用户信息 |
| PUT | `/api/auth/password` | 修改密码 |

### 管理接口 (需要 admin 权限)

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/admin/users` | 获取所有用户 |
| PUT | `/api/admin/users/{id}` | 更新用户信息 |
| DELETE | `/api/admin/users/{id}` | 删除用户 |
| GET | `/api/admin/stats` | 获取系统统计 |
| GET | `/api/admin/rooms` | 获取所有房间 |
| POST | `/api/admin/rooms/{id}/close` | 关闭房间 |
| POST | `/api/admin/broadcast` | 发送公告 |

### 游戏接口

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/rooms` | 获取房间列表 |
| POST | `/api/players` | 创建/获取玩家 |
| POST | `/api/games` | 创建游戏记录 |
| PUT | `/api/games/{id}` | 结束游戏记录 |
| GET | `/api/leaderboard` | 获取排行榜 |
| GET | `/api/players/{id}/history` | 获取玩家历史 |
| GET | `/api/players/{id}/progress` | 获取玩家进度 |
| PUT | `/api/players/{id}/progress` | 保存玩家进度 |
| GET | `/api/players/{id}/class` | 获取舰船类型 |
| PUT | `/api/players/{id}/class` | 设置舰船类型 |

### WebSocket 接口

连接地址: `ws://localhost:8000/ws?token={jwt_token}`

**客户端 -> 服务器**:
```json
{"type": "create_room", "mode": "ffa", "level": 1}
{"type": "join_room", "roomId": "r1"}
{"type": "quick_match", "mode": "ffa"}
{"type": "ready"}
{"type": "input", "keys": {"w": true}, "ts": 1234567890}
{"type": "fire", "aimTarget": {"x": 100, "y": 2, "z": -300}}
{"type": "fire_torpedo", "heading": 1.57}
{"type": "chat", "msg": "Hello!"}
```

**服务器 -> 客户端**:
```json
{"type": "snapshot", "tick": 1050, "yourEntity": {...}, "otherPlayers": [...], ...}
{"type": "room_created", "roomId": "r1", ...}
{"type": "room_joined", "roomId": "r1", ...}
{"type": "error", "msg": "Room is full"}
```

## 游戏配置

### 舰船等级 (1-10 级)

| 等级 | 长度 | 宽度 | HP | 转弯半径 | 射速 | 伤害 | 前炮塔 | 后炮塔 |
|------|------|------|-----|---------|------|------|--------|--------|
| 1 | 7 | 2 | 300 | 20 | 5.0s | 30 | 1 | 0 |
| 5 | 28 | 6 | 1200 | 45 | 3.2s | 50 | 2 | 2 |
| 10 | 53 | 11 | 3300 | 70 | 1.8s | 80 | 3 | 3 |

### 舰船类型 (4 级以上可选)

| 类型 | HP | 速度 | 转弯 | 伤害 | 射速 | 鱼雷 |
|------|-----|------|------|------|------|------|
| 驱逐舰 | 0.6x | 1.4x | 0.7x | 0.7x | 1.0x | 多管多级 |
| 巡洋舰 | 1.0x | 1.0x | 1.0x | 1.3x | 0.7x | 少量 |
| 战列舰 | 1.4x | 0.7x | 1.4x | 3.075x | 1.2x | 无 |

### 鱼雷等级

| 等级 | 速度 | 射程 | 冷却 |
|------|------|------|------|
| 1 | 22.2 | 400 | 8s |
| 2 | 16.7 | 600 | 8s |
| 3 | 12.5 | 800 | 8s |

## 运行测试

```bash
# 后端测试
pytest

# 前端测试
cd frontend && npm test
```

## 开发说明

### 服务端游戏循环

- **Tick Rate**: 20Hz (50ms/tick)
- **物理模拟**: 服务端权威，固定 dt=0.05
- **每个房间**: 独立 asyncio 任务

### 数据分层

- **内存 (热数据)**: 实体位置/速度/HP、AI 状态、输入队列
- **数据库 (冷数据)**: 账号、玩家档案、对局记录、排行榜

### 通信协议

- 使用 msgpack 二进制序列化
- 快照约 3-5KB/tick，20Hz 约 60-100KB/s/客户端
- 支持 delta 快照减少 60-80% 带宽

## License

MIT
