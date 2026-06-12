import { useState } from 'react';

const SHIP_CLASSES = [
  {
    id: 'destroyer',
    name: '驱逐舰',
    icon: '⚡',
    traits: ['低血量 / 高航速', '灵活转弯', '鱼雷: 3档', '火炮伤害较低'],
    color: '#4caf50',
  },
  {
    id: 'cruiser',
    name: '巡洋舰',
    icon: '🛡️',
    traits: ['均衡属性', '快速装填', '鱼雷: 仅短程', '标准火炮伤害'],
    color: '#2196f3',
  },
  {
    id: 'battleship',
    name: '战列舰',
    icon: '🏰',
    traits: ['高血量 / 低航速', '重甲厚血', '无鱼雷', '火炮伤害最高'],
    color: '#ff9800',
  },
];

export default function SingleSetupScreen({ user, onStart, onBack }) {
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedClass, setSelectedClass] = useState(null);

  const needsClass = selectedLevel >= 4;
  const canStart = !needsClass || selectedClass;

  const handleStart = () => {
    if (canStart) {
      onStart(user.username, selectedLevel, selectedClass);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <button className="setup-back-btn" onClick={onBack}>← 返回</button>
        <div className="setup-title">单人模式</div>
      </div>
      <div className="setup-body">
        <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>选择初始等级</h3>
        <div className="level-grid">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(lv => (
            <div
              key={lv}
              className={`level-grid-item ${selectedLevel === lv ? 'active' : ''}`}
              onClick={() => {
                setSelectedLevel(lv);
                if (lv < 4) setSelectedClass(null);
              }}
            >
              <div className="level-num">{lv}</div>
              <div className="level-label">{lv === 1 ? '初始' : `等级 ${lv}`}</div>
            </div>
          ))}
        </div>

        {needsClass && (
          <>
            <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>选择技术路线</h3>
            <div className="ship-class-cards">
              {SHIP_CLASSES.map(cls => (
                <div
                  key={cls.id}
                  className={`ship-class-card ${selectedClass === cls.id ? 'active' : ''}`}
                  onClick={() => setSelectedClass(cls.id)}
                >
                  <div className="class-icon">{cls.icon}</div>
                  <div className="class-name">{cls.name}</div>
                  <ul className="class-traits">
                    {cls.traits.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          className="start-battle-btn"
          disabled={!canStart}
          onClick={handleStart}
        >
          开始战斗
        </button>
      </div>
    </div>
  );
}
