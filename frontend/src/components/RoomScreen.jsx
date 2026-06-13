import { useState } from 'react';

const SHIP_CLASSES = [
  { id: 'destroyer', name: '驱逐舰', icon: '⚡' },
  { id: 'cruiser', name: '巡洋舰', icon: '🛡️' },
  { id: 'battleship', name: '战列舰', icon: '🏰' },
];

export default function RoomScreen({ roomInfo, userId, onReady, onLeave, onSelectClass }) {
  const [readied, setReadied] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);

  const players = roomInfo?.players || [];
  const roomId = roomInfo?.roomId || '';
  const mode = roomInfo?.mode || 'ffa';
  const roomLevel = roomInfo?.roomLevel || 1;
  const countdown = roomInfo?.countdown;

  const modeNames = { ffa: 'PvP 乱斗', team: '5v5 组队', pve: '联机 PvE', solo: '单人 PvE' };
  const needsClassSelect = roomLevel >= 4;

  const handleReady = () => {
    if (needsClassSelect && !selectedClass) return;
    setReadied(true);
    if (onSelectClass && selectedClass) {
      onSelectClass(selectedClass);
    }
    onReady();
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">房间</h1>
        <p style={{ color: '#aaa', marginBottom: '8px' }}>
          模式: {modeNames[mode] || mode} | 等级: <strong style={{ color: '#ffaa00' }}>Lv.{roomLevel}</strong> | 房间号: <strong style={{ color: '#fff', fontSize: '18px' }}>{roomId}</strong>
        </p>

        {countdown != null && (
          <div style={{
            fontSize: '48px', color: '#ffaa00', fontWeight: 'bold',
            textAlign: 'center', margin: '16px 0', animation: 'pulse 1s infinite',
          }}>
            {countdown}
          </div>
        )}

        <div style={{
          background: '#1a1a2e', borderRadius: '8px', padding: '12px',
          marginBottom: '16px', minHeight: '120px',
        }}>
          <p style={{ color: '#aaa', marginBottom: '8px' }}>玩家列表 ({players.length})</p>
          {players.map(p => (
            <div key={p.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 8px', borderBottom: '1px solid #333',
            }}>
              <span style={{ color: p.connected ? '#fff' : '#666' }}>
                {p.name} {p.id === userId ? '(你)' : ''} {!p.connected ? '(断线)' : ''}
                {p.shipClass && <span style={{ color: '#aaa', marginLeft: 8 }}>[{SHIP_CLASSES.find(c => c.id === p.shipClass)?.name || p.shipClass}]</span>}
              </span>
              <span style={{
                padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                background: p.ready ? '#2e7d32' : '#555',
                color: p.ready ? '#fff' : '#aaa',
              }}>
                {p.ready ? '已准备' : '未准备'}
              </span>
            </div>
          ))}
        </div>

        {/* Ship class selection for level 4+ rooms */}
        {needsClassSelect && !readied && (
          <div style={{ marginBottom: '16px' }}>
            <p style={{ color: '#ffaa00', marginBottom: '8px' }}>等级4+房间，请选择舰船类型：</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              {SHIP_CLASSES.map(cls => (
                <div
                  key={cls.id}
                  className={`ship-class-card ${selectedClass === cls.id ? 'active' : ''}`}
                  onClick={() => setSelectedClass(cls.id)}
                  style={{ flex: 1, cursor: 'pointer' }}
                >
                  <div className="class-icon">{cls.icon}</div>
                  <div className="class-name">{cls.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
          分享房间号 <strong>{roomId}</strong> 给好友即可加入
        </p>

        {!readied ? (
          <button
            className="menu-btn"
            onClick={handleReady}
            disabled={needsClassSelect && !selectedClass}
            style={needsClassSelect && !selectedClass ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {needsClassSelect && !selectedClass ? '请先选择舰船类型' : '准备'}
          </button>
        ) : (
          <button className="menu-btn" disabled style={{ opacity: 0.6 }}>已准备，等待其他玩家...</button>
        )}
        <button className="menu-btn secondary" onClick={onLeave} style={{ marginTop: '8px' }}>离开房间</button>
      </div>
    </div>
  );
}
