import { useState, useEffect } from 'react';
import {
  getAdminUsers, updateAdminUser, deleteAdminUser,
  getAdminStats, getAdminRooms, closeAdminRoom, kickAdminPlayer,
  adminBroadcast, getAdminAnnouncements, getAdminServerStatus,
} from '../api.js';

const SECTIONS = [
  { id: 'users', name: '用户管理', icon: '👥' },
  { id: 'rooms', name: '房间管理', icon: '🏠' },
  { id: 'stats', name: '数据统计', icon: '📊' },
  { id: 'broadcast', name: '系统公告', icon: '📢' },
  { id: 'server', name: '服务器', icon: '🖥️' },
];

export default function AdminDashboard({ onClose }) {
  const [activeSection, setActiveSection] = useState('users');
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [stats, setStats] = useState(null);
  const [announcements, setAnnouncements] = useState([]);
  const [serverStatus, setServerStatus] = useState(null);
  const [broadcastContent, setBroadcastContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSectionData(activeSection);
  }, [activeSection]);

  const loadSectionData = async (section) => {
    setLoading(true);
    try {
      switch (section) {
        case 'users':
          const userData = await getAdminUsers();
          setUsers(userData);
          break;
        case 'rooms':
          const roomData = await getAdminRooms();
          setRooms(roomData);
          break;
        case 'stats':
          const statsData = await getAdminStats();
          setStats(statsData);
          break;
        case 'broadcast':
          const annData = await getAdminAnnouncements();
          setAnnouncements(annData);
          break;
        case 'server':
          const serverData = await getAdminServerStatus();
          setServerStatus(serverData);
          break;
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    }
    setLoading(false);
  };

  const handleToggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    await updateAdminUser(userId, { role: newRole });
    loadSectionData('users');
  };

  const handleToggleActive = async (userId, currentActive) => {
    await updateAdminUser(userId, { is_active: !currentActive });
    loadSectionData('users');
  };

  const handleDeleteUser = async (userId) => {
    if (confirm('确定删除该用户？')) {
      await deleteAdminUser(userId);
      loadSectionData('users');
    }
  };

  const handleCloseRoom = async (roomId) => {
    if (confirm('确定关闭该房间？')) {
      await closeAdminRoom(roomId);
      loadSectionData('rooms');
    }
  };

  const handleKickPlayer = async (roomId, playerId) => {
    await kickAdminPlayer(roomId, playerId);
    loadSectionData('rooms');
  };

  const handleBroadcast = async () => {
    if (!broadcastContent.trim()) return;
    await adminBroadcast(broadcastContent);
    setBroadcastContent('');
    loadSectionData('broadcast');
  };

  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderUsers = () => (
    <div>
      <h3>用户管理</h3>
      <div className="admin-search-bar">
        <input
          placeholder="搜索用户名..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button className="admin-refresh-btn" onClick={() => loadSectionData('users')}>刷新</button>
      </div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>角色</th>
                <th>状态</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.username}</td>
                  <td>
                    <span className={`status-badge ${user.role === 'admin' ? 'active' : ''}`}>
                      {user.role === 'admin' ? '管理员' : '用户'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                      {user.is_active ? '正常' : '禁用'}
                    </span>
                  </td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="actions-cell">
                      <button
                        className="admin-action-btn"
                        onClick={() => handleToggleRole(user.id, user.role)}
                      >
                        {user.role === 'admin' ? '降为用户' : '升为管理'}
                      </button>
                      <button
                        className="admin-action-btn"
                        onClick={() => handleToggleActive(user.id, user.is_active)}
                      >
                        {user.is_active ? '禁用' : '启用'}
                      </button>
                      <button
                        className="admin-action-btn danger"
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderRooms = () => (
    <div>
      <h3>房间管理</h3>
      <div className="admin-search-bar">
        <button className="admin-refresh-btn" onClick={() => loadSectionData('rooms')}>刷新</button>
      </div>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      ) : rooms.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)' }}>暂无活跃房间</p>
      ) : (
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>房间ID</th>
                <th>模式</th>
                <th>等级</th>
                <th>人数</th>
                <th>状态</th>
                <th>玩家</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map(room => (
                <tr key={room.roomId}>
                  <td>{room.roomId}</td>
                  <td>{{ ffa: '自由对战', team: '团队对战', pve: '合作模式' }[room.mode] || room.mode}</td>
                  <td>{room.level || 1}</td>
                  <td>{room.playerCount}</td>
                  <td>
                    <span className={`status-badge ${room.state === 'waiting' ? 'active' : 'inactive'}`}>
                      {room.state === 'waiting' ? '等待中' : room.state === 'countdown' ? '倒计时' : '游戏中'}
                    </span>
                  </td>
                  <td>
                    {room.players.map(p => (
                      <span key={p.id} style={{ marginRight: '8px' }}>
                        {p.username}
                        {p.connected ? '' : ' (断线)'}
                      </span>
                    ))}
                  </td>
                  <td>
                    <div className="actions-cell">
                      {room.players.map(p => (
                        <button
                          key={p.id}
                          className="admin-action-btn danger"
                          onClick={() => handleKickPlayer(room.roomId, p.id)}
                        >
                          踢出 {p.username}
                        </button>
                      ))}
                      <button
                        className="admin-action-btn danger"
                        onClick={() => handleCloseRoom(room.roomId)}
                      >
                        关闭房间
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderStats = () => (
    <div>
      <h3>数据统计</h3>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      ) : stats ? (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="stat-value">{stats.totalUsers}</div>
            <div className="stat-label">总用户数</div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-value">{stats.onlineCount}</div>
            <div className="stat-label">在线用户</div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-value">{stats.activeRooms}</div>
            <div className="stat-label">活跃房间</div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-value">{stats.todayGames}</div>
            <div className="stat-label">今日对局</div>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>无法加载统计数据</p>
      )}
    </div>
  );

  const renderBroadcast = () => (
    <div>
      <h3>系统公告</h3>
      <div className="admin-broadcast-area">
        <textarea
          placeholder="输入公告内容..."
          value={broadcastContent}
          onChange={(e) => setBroadcastContent(e.target.value)}
        />
        <button className="admin-broadcast-btn" onClick={handleBroadcast}>
          发送公告
        </button>
      </div>
      <h3 style={{ marginTop: '24px' }}>历史公告</h3>
      <div className="admin-announcement-list">
        {announcements.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>暂无公告</p>
        ) : (
          announcements.map(ann => (
            <div key={ann.id} className="admin-announcement-item">
              <div className="ann-content">{ann.content}</div>
              <div className="ann-time">{new Date(ann.created_at).toLocaleString()}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderServer = () => (
    <div>
      <h3>服务器状态</h3>
      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>加载中...</p>
      ) : serverStatus ? (
        <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <div className="stat-value">{serverStatus.activeConnections}</div>
            <div className="stat-label">活跃连接</div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-value">{serverStatus.activeRooms}</div>
            <div className="stat-label">活跃房间</div>
          </div>
          <div className="admin-stat-card">
            <div className="stat-value">{Math.floor(serverStatus.uptime / 3600)}h</div>
            <div className="stat-label">运行时间</div>
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--text-secondary)' }}>无法加载服务器状态</p>
      )}
    </div>
  );

  return (
    <div id="admin-dashboard">
      <div className="admin-header">
        <div className="admin-header-left">
          <button className="admin-back-btn" onClick={onClose}>← 返回</button>
          <div className="admin-title">管理后台</div>
        </div>
        <div className="admin-user-badge">admin</div>
      </div>
      <div className="admin-body">
        <div className="admin-sidebar">
          {SECTIONS.map(section => (
            <div
              key={section.id}
              className={`admin-sidebar-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <span>{section.icon}</span>
              <span>{section.name}</span>
            </div>
          ))}
        </div>
        <div className="admin-content">
          {activeSection === 'users' && renderUsers()}
          {activeSection === 'rooms' && renderRooms()}
          {activeSection === 'stats' && renderStats()}
          {activeSection === 'broadcast' && renderBroadcast()}
          {activeSection === 'server' && renderServer()}
        </div>
      </div>
    </div>
  );
}
