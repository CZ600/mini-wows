export default function HUD({ data }) {
  if (!data) return null;

  const { hp, maxHp, speed, level, score, enemyCount, wave, turrets, currentThreshold, nextThreshold,
          weaponMode, torpedoTier, torpedoTubes, torpedoMaxCooldown, shipClass,
          availableTorpedoTiers } = data;
  const hpPercent = (hp / maxHp) * 100;
  const hpColor = hpPercent > 60 ? 'var(--success)' : hpPercent > 30 ? 'var(--warning)' : 'var(--danger)';

  const frontTurrets = turrets ? turrets.filter(t => t.isFront) : [];
  const backTurrets = turrets ? turrets.filter(t => !t.isFront) : [];

  const levelProgress = nextThreshold != null
    ? ((score - currentThreshold) / (nextThreshold - currentThreshold)) * 100
    : 100;
  const nextLevelDist = nextThreshold != null ? nextThreshold - score : 0;

  const tierLabels = { 1: '短/快', 2: '中程', 3: '远/慢' };
  const tierKeys = { 1: '2', 2: '3', 3: '4' };

  const hasTorpedoes = torpedoTubes && torpedoTubes.length > 0 && (availableTorpedoTiers || []).length > 0;
  const sortedTiers = [...(availableTorpedoTiers || [])].sort((a, b) => a - b);

  const allTubesReady = hasTorpedoes && torpedoTubes.every(t => t.ready);
  const torpedoMaxRemaining = hasTorpedoes
    ? (allTubesReady ? 0 : Math.max(...torpedoTubes.map(t => t.cooldown)))
    : 0;
  const torpedoFillPct = torpedoMaxCooldown > 0
    ? Math.max(0, Math.min(100, ((torpedoMaxCooldown - torpedoMaxRemaining) / torpedoMaxCooldown) * 100))
    : 100;

  return (
    <>
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
          <div className="hud-row">
            <span className="hud-label">等级</span>
            <span>{level}</span>
            {nextThreshold == null && <span className="hud-max-tag">满级</span>}
          </div>
          {shipClass && <div className="hud-row"><span className="hud-label">职业</span><span>{{ destroyer:'驱逐舰', cruiser:'巡洋舰', battleship:'战列舰' }[shipClass]}</span></div>}
          <div className="hud-row">
            <span className="hud-label">经验</span>
            <div className="level-bar-outer">
              <div className="level-bar-inner" style={{ width: Math.min(100, levelProgress) + '%' }} />
            </div>
          </div>
          {nextThreshold != null && (
            <div className="hud-row hud-row-small">
              <span className="level-progress-text">距下一级: {nextLevelDist} 分</span>
            </div>
          )}
          <div className="hud-row"><span className="hud-label">波次</span><span>{wave || 1}</span></div>
          <div className="hud-row"><span className="hud-label">分数</span><span>{score}</span></div>
          <div className="hud-row"><span className="hud-label">敌人</span><span>{enemyCount}</span></div>
        </div>
      </div>

      {/* Bottom Bar - Three Column Layout */}
      <div id="hud-bottom-bar">
        {/* Left Column - Speed */}
        <div className="hud-bottom-left">
          <div className="speed-display">
            <span className="hud-label">速度</span>
            <span className="speed-value">{Math.round(speed)}</span>
            <span className="speed-unit">km/h</span>
          </div>
        </div>

        {/* Middle Column - Reload Bars + Weapon Slots */}
        <div className="hud-bottom-middle hud-weapon-stack">
          {/* Reload bars above weapon slots */}
          <div className="reload-bar-container">
            {weaponMode === 'gun' ? (
              <>
                {frontTurrets.map((t, i) => {
                  const ready = t.cooldown <= 0;
                  const pct = t.maxCooldown > 0
                    ? Math.max(0, Math.min(100, ((t.maxCooldown - t.cooldown) / t.maxCooldown) * 100))
                    : 100;
                  return (
                    <div key={`f${i}`} className="reload-bar">
                      <span className="reload-bar-label">前{i + 1}</span>
                      <div className="reload-bar-track">
                        <div className={`reload-bar-fill ${ready ? 'ready' : ''}`} style={{ width: pct + '%' }} />
                      </div>
                    </div>
                  );
                })}
                {backTurrets.map((t, i) => {
                  const ready = t.cooldown <= 0;
                  const pct = t.maxCooldown > 0
                    ? Math.max(0, Math.min(100, ((t.maxCooldown - t.cooldown) / t.maxCooldown) * 100))
                    : 100;
                  return (
                    <div key={`b${i}`} className="reload-bar">
                      <span className="reload-bar-label">后{i + 1}</span>
                      <div className="reload-bar-track">
                        <div className={`reload-bar-fill ${ready ? 'ready' : ''}`} style={{ width: pct + '%' }} />
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="reload-bar">
                <span className="reload-bar-label">装填</span>
                <div className="reload-bar-track">
                  <div className={`reload-bar-fill ${allTubesReady ? 'ready' : ''}`} style={{ width: torpedoFillPct + '%' }} />
                </div>
              </div>
            )}
          </div>

          {/* Weapon slots */}
          <div className="weapon-bar">
            <div className={`weapon-slot ${weaponMode === 'gun' ? 'selected' : ''}`}>
              <span className="weapon-slot-key">1</span>
              <div className="weapon-slot-name">火炮</div>
              <div className="weapon-slot-desc">{frontTurrets.length + backTurrets.length} 门</div>
            </div>
            {hasTorpedoes && sortedTiers.map(tier => (
              <div
                key={tier}
                className={`weapon-slot torpedo ${weaponMode === 'torpedo' && torpedoTier === tier ? 'selected' : ''}`}
              >
                <span className="weapon-slot-key">{tierKeys[tier]}</span>
                <div className="weapon-slot-name">鱼雷</div>
                <div className="weapon-slot-desc">{tierLabels[tier] || ''}{torpedoTubes.length}管</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
