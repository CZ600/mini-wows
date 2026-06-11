import { useState } from 'react';

export default function MenuScreen({ user, onStart, onShowLeaderboard, onShowAdmin, onLogout }) {
  const handleStart = () => {
    onStart(user.username);
  };

  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">3D 海战</h1>
        <p className="menu-welcome">欢迎, {user.username}{user.role === 'admin' ? ' (管理员)' : ''}</p>
        <button className="menu-btn" onClick={handleStart}>开始游戏</button>
        <button className="menu-btn secondary" onClick={onShowLeaderboard}>排行榜</button>
        {user.role === 'admin' && (
          <button className="menu-btn secondary" onClick={onShowAdmin}>账户管理</button>
        )}
        <button className="menu-btn secondary" onClick={onLogout}>退出登录</button>
      </div>
    </div>
  );
}
