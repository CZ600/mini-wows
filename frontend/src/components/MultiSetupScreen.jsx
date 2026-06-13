import { useState, useEffect } from 'react';
import { getRooms } from '../api.js';

const MODES = [
  { id: 'ffa', name: '自由对战', desc: '所有人互相对抗' },
  { id: 'team', name: '团队对战', desc: '分成两队对抗' },
  { id: 'pve', name: '合作模式', desc: '一起对抗AI敌人' },
];

export default function MultiSetupScreen({ user, onQuickMatch, onCreateRoom, onJoinRoom, onBack }) {
  const [view, setView] = useState('main'); // main | rooms | create | quick
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);

  // Create/Quick Match state
  const [selectedMode, setSelectedMode] = useState('ffa');
  const [selectedLevel, setSelectedLevel] = useState(1);

  useEffect(() => {
    if (view === 'rooms') {
      loadRooms();
    }
  }, [view]);

  const loadRooms = async () => {
    setLoading(true);
    try {
      const data = await getRooms();
      setRooms(data);
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
    setLoading(false);
  };

  const handleCreate = () => {
    onCreateRoom(selectedMode, selectedLevel);
  };

  const handleQuickMatch = () => {
    onQuickMatch(selectedMode, selectedLevel);
  };

  const renderMainView = () => (
    <div className="multi-entry-cards">
      <div className="multi-entry-card" onClick={() => setView('rooms')}>
        <div className="entry-icon">📋</div>
        <div className="entry-content">
          <div className="entry-title">房间列表</div>
          <div className="entry-desc">浏览可用房间，点击加入</div>
        </div>
      </div>
      <div className="multi-entry-card" onClick={() => setView('create')}>
        <div className="entry-icon">➕</div>
        <div className="entry-content">
          <div className="entry-title">创建房间</div>
          <div className="entry-desc">选择模式、等级和职业，创建新房间</div>
        </div>
      </div>
      <div className="multi-entry-card" onClick={() => setView('quick')}>
        <div className="entry-icon">⚡</div>
        <div className="entry-content">
          <div className="entry-title">快速匹配</div>
          <div className="entry-desc">自动匹配合适的房间</div>
        </div>
      </div>
    </div>
  );

  const renderRoomList = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ color: 'var(--accent)' }}>可用房间</h3>
        <button className="admin-refresh-btn" onClick={loadRooms}>刷新</button>
      </div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      ) : rooms.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>暂无可用房间</p>
      ) : (
        <table className="room-list-table">
          <thead>
            <tr>
              <th>房间ID</th>
              <th>模式</th>
              <th>等级</th>
              <th>人数</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => (
              <tr key={room.roomId}>
                <td>{room.roomId}</td>
                <td>{{ ffa: '自由对战', team: '团队对战', pve: '合作模式' }[room.mode] || room.mode}</td>
                <td>Lv.{room.roomLevel || 1}</td>
                <td>{room.playerCount}/{room.maxPlayers}</td>
                <td>
                  <span className={`status-badge ${room.status === 'waiting' ? 'active' : 'inactive'}`}>
                    {room.status === 'waiting' ? '等待中' : '游戏中'}
                  </span>
                </td>
                <td>
                  {room.status === 'waiting' && (
                    <button
                      className="room-join-btn"
                      onClick={() => onJoinRoom(room.roomId)}
                    >
                      加入
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const renderSetupForm = (isQuickMatch) => (
    <div>
      <h3 style={{ color: 'var(--accent)', marginBottom: '16px' }}>
        {isQuickMatch ? '快速匹配设置' : '创建房间设置'}
      </h3>

      <div style={{ marginBottom: '16px' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>选择模式</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          {MODES.map(mode => (
            <div
              key={mode.id}
              className={`level-grid-item ${selectedMode === mode.id ? 'active' : ''}`}
              onClick={() => setSelectedMode(mode.id)}
              style={{ flex: 1 }}
            >
              <div className="level-num" style={{ fontSize: '18px' }}>{mode.name}</div>
              <div className="level-label">{mode.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>选择等级</p>
        <div className="level-grid" style={{ maxWidth: '400px' }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(lv => (
            <div
              key={lv}
              className={`level-grid-item ${selectedLevel === lv ? 'active' : ''}`}
              onClick={() => setSelectedLevel(lv)}
            >
              <div className="level-num">{lv}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '24px', color: 'var(--text-secondary)', fontSize: '14px' }}>
        职业选择将在准备阶段进行
      </div>

      <button
        className="start-battle-btn"
        onClick={isQuickMatch ? handleQuickMatch : handleCreate}
      >
        {isQuickMatch ? '开始匹配' : '创建房间'}
      </button>
    </div>
  );

  return (
    <div className="setup-screen">
      <div className="setup-header">
        <button className="setup-back-btn" onClick={view === 'main' ? onBack : () => setView('main')}>
          ← {view === 'main' ? '返回' : '返回'}
        </button>
        <div className="setup-title">
          {view === 'main' && '多人模式'}
          {view === 'rooms' && '房间列表'}
          {view === 'create' && '创建房间'}
          {view === 'quick' && '快速匹配'}
        </div>
      </div>
      <div className="setup-body">
        {view === 'main' && renderMainView()}
        {view === 'rooms' && renderRoomList()}
        {view === 'create' && renderSetupForm(false)}
        {view === 'quick' && renderSetupForm(true)}
      </div>
    </div>
  );
}
