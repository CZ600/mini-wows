import { useState } from 'react';

export default function RoomScreen({ roomInfo, userId, onReady, onLeave }) {
  const [readied, setReadied] = useState(false);

  const players = roomInfo?.players || [];
  const roomId = roomInfo?.roomId || '';
  const mode = roomInfo?.mode || 'ffa';
  const countdown = roomInfo?.countdown;

  const modeNames = { ffa: 'PvP 乱斗', team: '5v5 组队', pve: '联机 PvE', solo: '单人 PvE' };

  const handleReady = () => {
    setReadied(true);
    onReady();
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">房间</h1>
        <p style={{ color: '#aaa', marginBottom: '8px' }}>
          模式: {modeNames[mode] || mode} | 房间号: <strong style={{ color: '#fff', fontSize: '18px' }}>{roomId}</strong>
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

        <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
          分享房间号 <strong>{roomId}</strong> 给好友即可加入
        </p>

        {!readied ? (
          <button className="menu-btn" onClick={handleReady}>准备</button>
        ) : (
          <button className="menu-btn" disabled style={{ opacity: 0.6 }}>已准备，等待其他玩家...</button>
        )}
        <button className="menu-btn secondary" onClick={onLeave} style={{ marginTop: '8px' }}>离开房间</button>
      </div>
    </div>
  );
}
