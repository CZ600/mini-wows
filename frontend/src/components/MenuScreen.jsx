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
            <div className="mode-intro">
              独自迎战一波波敌方 AI 舰队，击沉敌舰赢取分数与经验，逐步升级解锁各舰种；
              也可选择 4v10 团队战斗，带领 3 位 AI 队友出征。
            </div>
          </div>
          <div className="menu-mode-card" onClick={onMultiplayer}>
            <div className="mode-icon">🌐</div>
            <div className="mode-name">多人模式</div>
            <div className="mode-desc">PvP 对战</div>
            <div className="mode-intro">
              与其他玩家实时同场作战：自由对战混战、团队对战分两队抗衡，
              或合作模式携手清剿 AI 舰队，支持房间创建与快速匹配。
            </div>
          </div>
        </div>

        {/* 基本操作提示（进阶操作见游戏教程） */}
        <div className="menu-controls">
          <div className="menu-controls-title">基本操作</div>
          <div className="menu-controls-row">
            <div className="menu-control-item"><kbd>W</kbd><kbd>S</kbd>前进 / 后退</div>
            <div className="menu-control-item"><kbd>A</kbd><kbd>D</kbd>转向</div>
            <div className="menu-control-item"><kbd>左键</kbd>开火</div>
            <div className="menu-control-item"><kbd>右键</kbd>瞄准</div>
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
