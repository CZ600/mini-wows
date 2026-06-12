export default function HUD({ data }) {
  if (!data) return null;

  const { hp, maxHp, speed, level, score, enemyCount, wave, turrets, currentThreshold, nextThreshold,
          weaponMode, torpedoTier, torpedoSpread, torpedoTubes, torpedoMaxCooldown, shipClass } = data;
  const hpPercent = (hp / maxHp) * 100;
  const hpColor = hpPercent > 60 ? '#4dff88' : hpPercent > 30 ? '#ff9800' : '#ff4d4d';

  const frontTurrets = turrets ? turrets.filter(t => t.isFront) : [];
  const backTurrets = turrets ? turrets.filter(t => !t.isFront) : [];

  const levelProgress = nextThreshold != null
    ? ((score - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;
  const nextLevelDist = nextThreshold != null ? nextThreshold - score : 0;

  const tierLabels = { 1: '短/快', 2: '中程', 3: '远/慢' };

  const renderTurret = (label, t, idx) => {
    const elapsed = Math.max(0, t.maxCooldown - t.cooldown);
    const progress = Math.min(1, elapsed / t.maxCooldown);
    const ready = t.cooldown <= 0;
    return (
      <div key={idx} className="turret-indicator">
        <span className="turret-label">{label}{idx + 1}</span>
        <div className="turret-bar-outer">
          <div className="turret-bar-inner" style={{
            width: '100%',
            background: ready ? '#4dff88' : `linear-gradient(to right, #4dff88 ${(progress * 100).toFixed(1)}%, #2a7fff ${(progress * 100).toFixed(1)}%)`,
          }} />
        </div>
        <span className="turret-time">{ready ? '就绪' : Math.max(0, t.cooldown).toFixed(1) + 's'}</span>
      </div>
    );
  };

  return (
    <>
      {/* Compass */}
      <div id="compass">
        <span className="compass-dir">N</span>
        <span className="compass-dir">E</span>
        <span className="compass-dir">S</span>
        <span className="compass-dir">W</span>
      </div>

      {/* HP Bar - Top Center */}
      <div id="hud" style={{ pointerEvents: 'none' }}>
        <div id="crosshair">
          <div className="cross-h" />
          <div className="cross-v" />
        </div>

        {/* Top Left - HP */}
        <div id="hud-left">
          <div className="hud-row">
            <span className="hud-label">血量</span>
            <div className="health-bar-outer">
              <div className="health-bar-inner" style={{ width: hpPercent + '%', backgroundColor: hpColor }} />
            </div>
            <span>{Math.ceil(hp)}</span>
          </div>
        </div>

        {/* Top Right - Level & Score */}
        <div id="hud-right">
          <div className="hud-row"><span className="hud-label">等级</span><span>{level}</span></div>
          {shipClass && <div className="hud-row"><span className="hud-label">职业</span><span>{{ destroyer:'驱逐舰', cruiser:'巡洋舰', battleship:'战列舰' }[shipClass]}</span></div>}
          <div className="hud-row">
            <span className="hud-label">经验</span>
            <div className="level-bar-outer">
              <div className="level-bar-inner" style={{ width: Math.min(100, levelProgress) + '%' }} />
            </div>
          </div>
          <div className="hud-row hud-row-small">
            <span className="level-progress-text">
              {nextThreshold != null ? `距下一级: ${nextLevelDist} 分` : '已满级'}
            </span>
          </div>
          <div className="hud-row"><span className="hud-label">波次</span><span>{wave || 1}</span></div>
          <div className="hud-row"><span className="hud-label">分数</span><span>{score}</span></div>
          <div className="hud-row"><span className="hud-label">敌人</span><span>{enemyCount}</span></div>
        </div>
      </div>

      {/* Bottom Bar - Three Column Layout */}
      <div id="hud-bottom-bar">
        {/* Left Column - Speed */}
        <div className="hud-bottom-left">
          <div className="hud-row">
            <span className="hud-label">速度</span>
            <span>{Math.round(speed)} km/h</span>
          </div>
        </div>

        {/* Middle Column - Weapon Selection */}
        <div className="hud-bottom-middle">
          {weaponMode === 'gun' ? (
            <>
              <div className="weapon-box selected">
                <div className="weapon-name">火炮</div>
                <div className="weapon-ammo">
                  {frontTurrets.length + backTurrets.length} 门
                </div>
              </div>
              {torpedoTubes && torpedoTubes.length > 0 && (
                <div className="weapon-box unselected">
                  <div className="weapon-name">鱼雷</div>
                  <div className="weapon-ammo">{torpedoTubes.length} 管</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="weapon-box unselected">
                <div className="weapon-name">火炮</div>
                <div className="weapon-ammo">
                  {frontTurrets.length + backTurrets.length} 门
                </div>
              </div>
              <div className="weapon-box selected">
                <div className="weapon-name">鱼雷 {tierLabels[torpedoTier] || ''}</div>
                <div className="weapon-ammo">
                  {torpedoSpread === 'narrow' ? '窄扇' : '宽扇'}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column - XP */}
        <div className="hud-bottom-right">
          <div className="hud-row">
            <span className="hud-label">经验</span>
            <div className="level-bar-outer">
              <div className="level-bar-inner" style={{ width: Math.min(100, levelProgress) + '%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Turret Cooldown Bars */}
      <div id="turret-bar-container" style={{ bottom: '80px' }}>
        <div className="turret-group">
          {frontTurrets.map((t, i) => renderTurret('前', t, i))}
        </div>
        <div className="turret-group">
          {backTurrets.map((t, i) => renderTurret('后', t, i))}
        </div>
      </div>

      {/* Torpedo Tubes */}
      {weaponMode === 'torpedo' && torpedoTubes && torpedoTubes.length > 0 && (
        <div id="torpedo-bar-container">
          <div className="torpedo-group-label">鱼雷管</div>
          {torpedoTubes.map((tube, i) => {
            const elapsed = tube.ready ? torpedoMaxCooldown : Math.max(0, torpedoMaxCooldown - tube.cooldown);
            const progress = Math.min(1, elapsed / torpedoMaxCooldown);
            return (
              <div key={i} className="turret-indicator">
                <span className="turret-label">{tube.side === 'port' ? '左' : '右'}{i + 1}</span>
                <div className="turret-bar-outer">
                  <div className="turret-bar-inner" style={{
                    width: '100%',
                    background: tube.ready ? '#4dff88' : `linear-gradient(to right, #4dff88 ${(progress * 100).toFixed(1)}%, #ff9800 ${(progress * 100).toFixed(1)}%)`,
                  }} />
                </div>
                <span className="turret-time">{tube.ready ? '就绪' : Math.max(0, tube.cooldown).toFixed(1) + 's'}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
