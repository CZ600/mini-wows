export default function GameOverScreen({ score, enemies, level, onContinue, onRestart }) {
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
