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
  const [mode, setMode] = useState('solo');
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [selectedClass, setSelectedClass] = useState(null);
  // Team battle has its own level (6-10) and class pick, independent of solo.
  const [teamLevel, setTeamLevel] = useState(6);
  const [teamClass, setTeamClass] = useState(null);

  const needsClass = selectedLevel >= 4;
  const canStart = mode === 'team'
    ? !!teamClass                   // team requires a class pick
    : (!needsClass || selectedClass);

  const handleStart = () => {
    if (!canStart) return;
    if (mode === 'team') {
      // Team battle (4v10): player picks level (6-10) and class; wingmen are a
      // fixed destroyer + cruiser + battleship trio, all at the player's level.
      onStart(user.username, teamLevel, teamClass, 'team');
    } else {
      onStart(user.username, selectedLevel, selectedClass, 'solo');
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <button className="setup-back-btn" onClick={onBack}>← 返回</button>
        <div className="setup-title">单人模式</div>
      </div>
      <div className="setup-body">
        <h3 className="section-title">对抗类型</h3>
        <div className="mode-segmented">
          <div
            className={`mode-seg-item ${mode === 'solo' ? 'active' : ''}`}
            onClick={() => setMode('solo')}
          >
            <div className="mode-seg-name">单人对抗</div>
            <div className="mode-seg-desc">独自对抗敌方舰队波次</div>
          </div>
          <div
            className={`mode-seg-item ${mode === 'team' ? 'active' : ''}`}
            onClick={() => setMode('team')}
          >
            <div className="mode-seg-name">团队战斗</div>
            <div className="mode-seg-desc">4v10 · 带领3位AI队友迎战</div>
          </div>
        </div>

        {mode === 'solo' && (
          <>
            <h3 className="section-title">选择初始等级</h3>
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
                <h3 className="section-title">选择技术路线</h3>
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
          </>
        )}

        {mode === 'team' && (
          <>
            <h3 className="section-title">选择等级（6-10）</h3>
            <div className="level-grid">
              {Array.from({ length: 5 }, (_, i) => i + 6).map(lv => (
                <div
                  key={lv}
                  className={`level-grid-item ${teamLevel === lv ? 'active' : ''}`}
                  onClick={() => setTeamLevel(lv)}
                >
                  <div className="level-num">{lv}</div>
                  <div className="level-label">等级 {lv}</div>
                </div>
              ))}
            </div>

            <h3 className="section-title">选择你的战舰</h3>
            <div className="ship-class-cards">
              {SHIP_CLASSES.map(cls => (
                <div
                  key={cls.id}
                  className={`ship-class-card ${teamClass === cls.id ? 'active' : ''}`}
                  onClick={() => setTeamClass(cls.id)}
                >
                  <div className="class-icon">{cls.icon}</div>
                  <div className="class-name">{cls.name}</div>
                  <ul className="class-traits">
                    {cls.traits.map((t, i) => <li key={i}>{t}</li>)}
                  </ul>
                </div>
              ))}
            </div>

            <div className="team-battle-info">
              <div className="team-info-line">阵营：<strong>我方 4</strong>（玩家 + 3 AI 队友）vs <strong>敌方 10</strong></div>
              <div className="team-info-line">队友：驱逐舰 + 巡洋舰 + 战列舰（均等级 {teamLevel}）</div>
              <div className="team-info-line">敌方：10 艘随机搭配舰船（均等级 {teamLevel}）</div>
              <div className="team-info-line">规则：全歼敌方舰队即胜利，我方全员阵亡即失败（阵亡不重生）</div>
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
