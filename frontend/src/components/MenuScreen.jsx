import { useState } from 'react';

const CLASSES = [
  { id: 'destroyer', name: '驱逐舰', icon: '⚡', traits: ['低血量 / 高航速', '灵活转弯', '鱼雷: 3档', '火炮伤害较低'], color: '#4caf50' },
  { id: 'cruiser', name: '巡洋舰', icon: '🛡️', traits: ['均衡属性', '快速装填', '鱼雷: 仅短程', '标准火炮伤害'], color: '#2196f3' },
  { id: 'battleship', name: '战列舰', icon: '🏰', traits: ['高血量 / 低航速', '重甲厚血', '无鱼雷', '火炮伤害最高'], color: '#ff9800' },
];

export default function MenuScreen({ user, onStart, onShowLeaderboard, onShowAdmin, onLogout }) {
  const [initialLevel, setInitialLevel] = useState(1);
  const [shipClass, setShipClass] = useState(null);

  const needsClass = initialLevel >= 4;
  const ready = !needsClass || shipClass;

  const handleStart = () => {
    if (ready) onStart(user.username, initialLevel, shipClass);
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">3D 海战</h1>
        <p className="menu-welcome">欢迎, {user.username}{user.role === 'admin' ? ' (管理员)' : ''}</p>

        <div className="level-select-section">
          <p className="level-select-label">选择初始等级</p>
          <div className="level-buttons">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(lv => (
              <button
                key={lv}
                className={`level-btn ${initialLevel === lv ? 'active' : ''}`}
                onClick={() => { setInitialLevel(lv); if (lv < 4) setShipClass(null); }}
              >
                {lv}
              </button>
            ))}
          </div>
        </div>

        {needsClass && (
          <div className="class-select-section">
            <p className="level-select-label">选择技术路线</p>
            <div className="class-cards-inline">
              {CLASSES.map(cls => (
                <div
                  key={cls.id}
                  className={`class-card-mini ${shipClass === cls.id ? 'selected' : ''}`}
                  style={{ borderColor: shipClass === cls.id ? cls.color : '#555' }}
                  onClick={() => setShipClass(cls.id)}
                >
                  <div style={{ color: cls.color, fontSize: '24px' }}>{cls.icon}</div>
                  <div className="class-name-mini">{cls.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="menu-btn" onClick={handleStart} disabled={!ready}>
          开始游戏 (等级 {initialLevel}{shipClass ? ` - ${CLASSES.find(c => c.id === shipClass).name}` : ''})
        </button>
        <button className="menu-btn secondary" onClick={onShowLeaderboard}>排行榜</button>
        {user.role === 'admin' && (
          <button className="menu-btn secondary" onClick={onShowAdmin}>账户管理</button>
        )}
        <button className="menu-btn secondary" onClick={onLogout}>退出登录</button>
      </div>
    </div>
  );
}
