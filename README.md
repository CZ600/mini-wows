# Mini-WoW

一个基于 Web 的多人在线海战游戏，使用 React + Three.js 前端和 FastAPI 后端。

## 功能特性

- **实时多人对战** - 支持多人在线海战
- **3D 渲染** - 使用 Three.js 实现 3D 游戏画面
- **科技树系统** - 舰船升级和科技研究
- **鱼雷系统** - 多种鱼雷类型
- **排行榜** - 玩家积分排名
- **用户系统** - 注册、登录、个人资料

## 技术栈

**前端:**
- React 19
- Three.js
- Vite
- WebSocket

**后端:**
- FastAPI
- SQLite (aiosqlite)
- WebSocket
- JWT 认证

## 快速开始

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

## 项目结构

```
.
├── main.py              # FastAPI 应用入口
├── ws.py                # WebSocket 处理
├── database.py          # 数据库操作
├── settings.py          # 配置文件
├── game/                # 游戏逻辑
│   ├── config.py        # 游戏配置
│   ├── game_state.py    # 游戏状态
│   ├── room.py          # 房间管理
│   ├── ship.py          # 舰船逻辑
│   ├── enemy.py         # 敌人逻辑
│   ├── projectile.py    # 弹药系统
│   ├── torpedo.py       # 鱼雷系统
│   └── terrain.py       # 地形系统
├── frontend/            # React 前端
│   ├── src/
│   └── dist/            # 构建输出
└── tests/               # 测试文件
```

## 运行测试

```bash
# 后端测试
pytest

# 前端测试
cd frontend && npm test
```

## License

MIT
