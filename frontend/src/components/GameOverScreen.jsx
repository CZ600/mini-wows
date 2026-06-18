export default function GameOverScreen({ score, enemies, level, multiplayerResults, teamMode, teamResult, onContinue, onRestart, onBackToLobby }) {
  if (teamMode) {
    const win = teamResult === 'win';
    return (
      <div id="gameover-screen">
        <div className="gameover-container">
          <h1 style={{ color: win ? 'var(--success, #4caf50)' : 'var(--danger, #ff5e5e)' }}>
            {win ? '胜利' : '失败'}
          </h1>
          <p>{win ? '敌方舰队已被全歼!' : '我方全军覆没。'}</p>
          <p>击毁敌方: <strong>{enemies}</strong></p>
          <button className="menu-btn" onClick={onRestart}>再战一场</button>
        </div>
      </div>
    );
  }

  if (multiplayerResults) {
    const sorted = [...multiplayerResults].sort((a, b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0));
    return (
      <div id="gameover-screen">
        <div className="gameover-container">
          <h1>对局结束</h1>
          <div style={{ margin: '16px 0', textAlign: 'left' }}>
            {sorted.map((r, i) => (
              <div key={r.id} style={{
                padding: '8px 12px',
                margin: '4px 0',
                background: r.alive ? 'rgba(106,255,164,0.14)' : 'rgba(255,122,122,0.14)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>
                  <strong>#{i + 1}</strong> {r.name}
                  {r.team && <span style={{ marginLeft: 8, fontSize: 12, color: r.team === 'red' ? 'var(--danger)' : 'var(--accent)' }}>{r.team === 'red' ? '红队' : '蓝队'}</span>}
                </span>
                <span style={{ fontSize: 14, color: r.alive ? 'var(--success)' : 'var(--danger)' }}>
                  {r.alive ? '存活' : '击沉'}
                </span>
              </div>
            ))}
          </div>
          <button className="menu-btn" onClick={onBackToLobby}>返回大厅</button>
        </div>
      </div>
    );
  }

  return (
    <div id="gameover-screen">
      <div className="gameover-container">
        <h1>战舰沉没</h1>
        <p>最终分数: <strong>{score}</strong></p>
        <p>击毁敌人: <strong>{enemies}</strong></p>
        <p>达到等级: <strong>{level}</strong></p>
        <button className="menu-btn" onClick={onContinue}>继续 (等级 {level})</button>
        <button className="menu-btn secondary" onClick={onRestart}>从1级重新开始</button>
      </div>
    </div>
  );
}
