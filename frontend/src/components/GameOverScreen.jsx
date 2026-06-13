export default function GameOverScreen({ score, enemies, level, multiplayerResults, onContinue, onRestart, onBackToLobby }) {
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
                background: r.alive ? 'rgba(100,200,100,0.2)' : 'rgba(200,100,100,0.2)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span>
                  <strong>#{i + 1}</strong> {r.name}
                  {r.team && <span style={{ marginLeft: 8, fontSize: 12, color: r.team === 'red' ? '#ff6666' : '#6688ff' }}>{r.team === 'red' ? '红队' : '蓝队'}</span>}
                </span>
                <span style={{ fontSize: 14, color: r.alive ? '#88ff88' : '#ff8888' }}>
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
