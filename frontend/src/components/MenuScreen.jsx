export default function MenuScreen({ user, onSinglePlayer, onMultiplayer, onShowLeaderboard, onShowAdmin, onLogout, onShowTutorial }) {
  return (
    <div id="menu-screen">
      <div className="menu-container">
        <h1 className="game-title">3D 海战</h1>
        <p className="menu-welcome">欢迎, {user.username}{user.role === 'admin' ? ' (管理员)' : ''}</p>

        <div className="menu-mode-cards">
          <div className="menu-mode-card" onClick={onSinglePlayer}>
            <div className="mode-icon">⚔️</div>
            <div className="mode-name">单人模式</div>
            <div className="mode-desc">PvE 战斗</div>
          </div>
          <div className="menu-mode-card" onClick={onMultiplayer}>
            <div className="mode-icon">🌐</div>
            <div className="mode-name">多人模式</div>
            <div className="mode-desc">PvP 对战</div>
          </div>
        </div>

        <button className="menu-btn secondary" onClick={onShowTutorial}>游戏教程</button>
        <button className="menu-btn secondary" onClick={onShowLeaderboard}>排行榜</button>
        {user.role === 'admin' && (
          <button className="menu-btn secondary" onClick={onShowAdmin}>管理后台</button>
        )}
        <button className="menu-btn secondary" onClick={onLogout}>退出登录</button>
      </div>
    </div>
  );
}
