import { useState } from 'react';

const CLASSES = [
  {
    id: 'destroyer',
    name: '驱逐舰',
    icon: '⚡',
    traits: ['低血量 / 高航速', '灵活转弯', '鱼雷: 3档（短/中/远）', '鱼雷管多（4-8管）', '火炮伤害较低'],
    color: '#4caf50',
  },
  {
    id: 'cruiser',
    name: '巡洋舰',
    icon: '🛡️',
    traits: ['均衡属性', '快速装填（速射炮）', '鱼雷: 仅短程1档', '鱼雷管少（2-4管）', '标准火炮伤害'],
    color: '#2196f3',
  },
  {
    id: 'battleship',
    name: '战列舰',
    icon: '🏰',
    traits: ['高血量 / 低航速', '重甲厚血', '无鱼雷', '火炮伤害最高', '装填较慢'],
    color: '#ff9800',
  },
];

export default function ClassSelectScreen({ onSelect }) {
  const [selected, setSelected] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div id="class-select-screen">
      <div className="class-select-overlay">
        <h1 className="class-select-title">选择你的职业</h1>
        <p className="class-select-subtitle">升级到 4 级！选择后将不可更改（重置进度才可重选）</p>
        <div className="class-cards">
          {CLASSES.map(cls => (
            <div
              key={cls.id}
              className={`class-card ${selected === cls.id ? 'selected' : ''}`}
              style={{ borderColor: selected === cls.id ? cls.color : '#555' }}
              onClick={() => { setSelected(cls.id); setConfirming(false); }}
            >
              <div className="class-icon" style={{ color: cls.color }}>{cls.icon}</div>
              <h2 className="class-name">{cls.name}</h2>
              <ul className="class-traits">
                {cls.traits.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ))}
        </div>
        {selected && (
          <button className="class-confirm-btn" onClick={handleConfirm}>
            确认选择：{CLASSES.find(c => c.id === selected).name}
          </button>
        )}
      </div>
    </div>
  );
}
