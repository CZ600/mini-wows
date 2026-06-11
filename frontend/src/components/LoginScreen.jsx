import { useState } from 'react';
import { login, saveToken } from '../api.js';

export default function LoginScreen({ onLogin, onSwitchToRegister }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(username.trim(), password);
      saveToken(data.token);
      onLogin(data.user);
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
        <form onSubmit={handleSubmit}>
          <div className="menu-input">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              maxLength={20}
              autoComplete="username"
            />
          </div>
          <div className="menu-input">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="menu-error">{error}</div>}
          <button type="submit" className="menu-btn" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <button className="menu-btn secondary" onClick={onSwitchToRegister}>
          注册新账号
        </button>
      </div>
    </div>
  );
}
