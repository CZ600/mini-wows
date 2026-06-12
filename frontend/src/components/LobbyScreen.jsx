import { useState } from 'react';

const MODES = [
  { id: 'ffa',  name: 'PvP 乱斗',  icon: '⚔️', desc: '2-8人自由对战，最后存活者获胜' },
  { id: 'team', name: '5v5 组队',  icon: '🛡️', desc: '10人红蓝对抗，歼灭对方全队' },
  { id: 'pve',  name: '联机 PvE',  icon: '🤖', desc: '2-6人合作对抗AI波次' },
];

const CLASSES = [
  { id: 'destroyer', name: '驱逐舰', icon: '⚡' },
  { id: 'cruiser', name: '巡洋舰', icon: '🛡️' },
  { id: 'battleship', name: '战列舰', icon: '🏰' },
];

export default function LobbyScreen({ user, onQuickMatch, onCreateRoom, onJoinRoom, onBack }) {
  const [selectedMode, setSelectedMode] = useState('ffa');
  const [initialLevel, setInitialLevel] = useState(1);
  const [shipClass, setShipClass] = useState(null);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [showJoinInput, setShowJoinInput] = useState(false);

  const needsClass = initialLevel >= 4;
  const ready = !needsClass || shipClass;

  const handleQuickMatch = () => {
    if (ready) onQuickMatch(selectedMode, initialLevel, shipClass);
  };

  const handleCreateRoom = () => {
    if (ready) onCreateRoom(selectedMode, initialLevel, shipClass);
  };

  const handleJoinRoom = () => {
    if (joinRoomId.trim()) onJoinRoom(joinRoomId.trim(), initialLevel, shipClass);
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">多人对战</h1>
        <p className="menu-welcome">欢迎, {user.username}</p>

        <div className="mode-select-section">
          <p className="level-select-label">选择模式</p>
          <div className="mode-buttons">
            {MODES.map(m => (
              <div
                key={m.id}
                className={`mode-card ${selectedMode === m.id ? 'selected' : ''}`}
                onClick={() => setSelectedMode(m.id)}
              >
                <div style={{ fontSize: '32px' }}>{m.icon}</div>
                <div className="mode-name">{m.name}</div>
                <div className="mode-desc">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="level-select-section">
          <p className="level-select-label">初始等级</p>
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
            <p className="level-select-label">技术路线</p>
            <div className="class-cards-inline">
              {CLASSES.map(cls => (
                <div
                  key={cls.id}
                  className={`class-card-mini ${shipClass === cls.id ? 'selected' : ''}`}
                  onClick={() => setShipClass(cls.id)}
                >
                  <div style={{ fontSize: '24px' }}>{cls.icon}</div>
                  <div className="class-name-mini">{cls.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button className="menu-btn" onClick={handleQuickMatch} disabled={!ready}>
          快速匹配
        </button>
        <button className="menu-btn secondary" onClick={handleCreateRoom} disabled={!ready}>
          创建房间
        </button>

        <div style={{ marginTop: '12px' }}>
          {!showJoinInput ? (
            <button className="menu-btn secondary" onClick={() => setShowJoinInput(true)}>
              加入房间
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="输入房间号"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value)}
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid #555', background: '#1a1a2e', color: '#fff',
                  fontSize: '14px',
                }}
              />
              <button className="menu-btn" onClick={handleJoinRoom} disabled={!joinRoomId.trim()}>
                加入
              </button>
              <button className="menu-btn secondary" onClick={() => setShowJoinInput(false)}>
                取消
              </button>
            </div>
          )}
        </div>

        <button className="menu-btn secondary" onClick={onBack} style={{ marginTop: '12px' }}>
          返回主菜单
        </button>
      </div>
    </div>
  );
}
