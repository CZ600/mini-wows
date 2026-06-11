import { useState } from 'react';
import { register, saveToken } from '../api.js';

export default function RegisterScreen({ onRegister, onSwitchToLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      const data = await register(username.trim(), password);
      saveToken(data.token);
      onRegister(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">3D 海战</h1>
        <p className="menu-subtitle">注册新账号</p>
        <form onSubmit={handleSubmit}>
          <div className="menu-input">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名 (2-20个字符)"
              maxLength={20}
              autoComplete="username"
            />
          </div>
          <div className="menu-input">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码 (至少4个字符)"
              autoComplete="new-password"
            />
          </div>
          <div className="menu-input">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="确认密码"
              autoComplete="new-password"
            />
          </div>
          {error && <div className="menu-error">{error}</div>}
          <button type="submit" className="menu-btn" disabled={loading}>
            {loading ? '注册中...' : '注册'}
          </button>
        </form>
        <button className="menu-btn secondary" onClick={onSwitchToLogin}>
          返回登录
        </button>
      </div>
    </div>
  );
}
