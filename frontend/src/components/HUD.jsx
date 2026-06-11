export default function HUD({ data }) {
  if (!data) return null;

  const { hp, maxHp, speed, level, score, enemyCount, wave, turrets, currentThreshold, nextThreshold } = data;
  const hpPercent = (hp / maxHp) * 100;
  const hpColor = hpPercent > 60 ? '#4caf50' : hpPercent > 30 ? '#ff9800' : '#f44336';

  const frontTurrets = turrets ? turrets.filter(t => t.isFront) : [];
  const backTurrets = turrets ? turrets.filter(t => !t.isFront) : [];

  const levelProgress = nextThreshold != null
    ? ((score - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;
  const nextLevelDist = nextThreshold != null ? nextThreshold - score : 0;

  const renderTurret = (label, t, idx) => {
    const progress = 1 - Math.max(0, t.cooldown) / t.maxCooldown;
    const ready = t.cooldown <= 0;
    return (
      <div key={idx} className="turret-indicator">
        <span className="turret-label">{label}{idx + 1}</span>
        <div className="turret-bar-outer">
          <div className="turret-bar-inner" style={{
            width: (progress * 100) + '%',
            backgroundColor: ready ? '#4caf50' : '#2a7fff',
          }} />
        </div>
        <span className="turret-time">{ready ? '就绪' : Math.max(0, t.cooldown).toFixed(1) + 's'}</span>
      </div>
    );
  };

  return (
    <div id="hud">
      <div id="crosshair">
        <div className="cross-h" />
        <div className="cross-v" />
      </div>

      <div id="hud-left">
        <div className="hud-row">
          <span className="hud-label">血量</span>
          <div className="health-bar-outer">
            <div className="health-bar-inner" style={{ width: hpPercent + '%', backgroundColor: hpColor }} />
          </div>
          <span>{Math.ceil(hp)}</span>
        </div>
        <div className="hud-row">
          <span className="hud-label">速度</span>
          <span>{Math.round(speed)} km/h</span>
        </div>
      </div>

      <div id="hud-right">
        <div className="hud-row"><span className="hud-label">等级</span><span>{level}</span></div>
        <div className="hud-row">
          <span className="hud-label">经验</span>
          <div className="level-bar-outer">
            <div className="level-bar-inner" style={{ width: Math.min(100, levelProgress) + '%' }} />
          </div>
        </div>
        <div className="hud-row hud-row-small">
          <span className="hud-label"></span>
          <span className="level-progress-text">
            {nextThreshold != null ? `距下一级: ${nextLevelDist} 分` : '已满级'}
          </span>
        </div>
        <div className="hud-row"><span className="hud-label">波次</span><span>{wave || 1}</span></div>
        <div className="hud-row"><span className="hud-label">分数</span><span>{score}</span></div>
        <div className="hud-row"><span className="hud-label">敌人</span><span>{enemyCount}</span></div>
      </div>

      <div id="turret-bar-container">
        <div className="turret-group">
          {frontTurrets.map((t, i) => renderTurret('前', t, i))}
        </div>
        <div className="turret-group">
          {backTurrets.map((t, i) => renderTurret('后', t, i))}
        </div>
      </div>
    </div>
  );
}
