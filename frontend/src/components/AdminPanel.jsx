import { useState, useEffect } from 'react';
import { getAdminUsers, adminUpdateUser, adminDeleteUser } from '../api.js';

export default function AdminPanel({ onClose }) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleActive = async (user) => {
    try {
      await adminUpdateUser(user.id, { is_active: !user.is_active });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleRole = async (user) => {
    try {
      const newRole = user.role === 'admin' ? 'user' : 'admin';
      await adminUpdateUser(user.id, { role: newRole });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (user) => {
    if (!confirm(`确定删除用户 "${user.username}" 吗？`)) return;
    try {
      await adminDeleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div id="admin-panel">
      <h2>账户管理</h2>
      {error && <div className="menu-error">{error}</div>}
      <table id="admin-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>用户名</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.username}</td>
              <td>
                <button className="admin-action-btn" onClick={() => handleToggleRole(u)}>
                  {u.role === 'admin' ? '管理员' : '用户'}
                </button>
              </td>
              <td>
                <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                  {u.is_active ? '正常' : '禁用'}
                </span>
              </td>
              <td>
                <button className="admin-action-btn" onClick={() => handleToggleActive(u)}>
                  {u.is_active ? '禁用' : '启用'}
                </button>
                <button className="admin-action-btn danger" onClick={() => handleDelete(u)}>
                  删除
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr><td colSpan="5">暂无用户</td></tr>
          )}
        </tbody>
      </table>
      <button className="menu-btn secondary" onClick={onClose}>关闭</button>
    </div>
  );
}
