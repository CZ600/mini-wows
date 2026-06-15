const GEAR_ROWS = [
  { name: '前进4', gear: 5 },
  { name: '前进3', gear: 4 },
  { name: '前进2', gear: 3 },
  { name: '前进1', gear: 2 },
  { name: '停车', gear: 1 },
  { name: '倒退', gear: 0 },
];

function TopToolbar({ onOpenSettings, onExit, onToggleMute, muted }) {
  return (
    <div id="game-top-toolbar">
      {onOpenSettings && (
        <button
          className="toolbar-btn toolbar-settings-btn"
          style={{ pointerEvents: 'auto' }}
          onClick={onOpenSettings}
          title="设置"
        >
          ⚙
        </button>
      )}
      {onToggleMute && (
        <button
          className={`toolbar-btn toolbar-mute-btn${muted ? ' active' : ''}`}
          style={{ pointerEvents: 'auto' }}
          onClick={onToggleMute}
          title={muted ? '取消静音' : '静音'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
      {onExit && (
        <button
          className="toolbar-btn toolbar-exit-btn"
          style={{ pointerEvents: 'auto' }}
          onClick={onExit}
          title="退出"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export default function HUD({ data, onOpenSettings, onExit, onToggleMute, muted }) {
  if (!data) return null;

  const { hp, maxHp, speed, level, score, enemyCount, wave, fps, turrets, currentThreshold, nextThreshold,
          weaponMode, torpedoTier, torpedoTubes, torpedoMaxCooldown, shipClass,
          availableTorpedoTiers, gear } = data;
  const gearIdx = gear == null ? 1 : gear;
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

  const torpedoMaxRemaining = hasTorpedoes
    ? Math.max(0, Math.min(torpedoMaxCooldown, Math.max(...torpedoTubes.map(t => t.cooldown))))
    : 0;
  const allTubesReady = hasTorpedoes && torpedoTubes.every(t => t.ready);
  const torpedoFillPct = torpedoMaxCooldown > 0
    ? ((torpedoMaxCooldown - torpedoMaxRemaining) / torpedoMaxCooldown) * 100
    : 100;

  return (
    <>
      <TopToolbar
        onOpenSettings={onOpenSettings}
        onExit={onExit}
        onToggleMute={onToggleMute}
        muted={muted}
      />
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
          <div className="hud-row"><span className="hud-label">FPS</span><span>{fps || 0}</span></div>
        </div>
      </div>

      {/* Bottom Bar - Three Column Layout */}
      <div id="hud-bottom-bar">
        {/* Left Column - Gear Lever + Speed */}
        <div className="hud-bottom-left">
          <div className="gear-display">
            {GEAR_ROWS.map((row, idx) => (
              <div key={idx} className={`gear-row${row.gear === gearIdx ? ' active' : ''}`}>
                <span className="gear-name">{row.name}</span>
                {row.gear === gearIdx && (
                  <span className="gear-speed">
                    <span className="gear-speed-value">{Math.round(speed)}</span>
                    <span className="gear-speed-unit">km/h</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Middle Column - Reload Bars + Weapon Slots */}
        <div className="hud-bottom-middle hud-weapon-stack">
          {/* Reload bars above weapon slots */}
          <div className="reload-bar-container">
            {weaponMode === 'gun' ? (
              <>
                {frontTurrets.map((t, i) => {
                  const cd = Math.max(0, Math.min(t.maxCooldown, t.cooldown));
                  const ready = cd <= 0;
                  const pct = t.maxCooldown > 0
                    ? ((t.maxCooldown - cd) / t.maxCooldown) * 100
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
                  const cd = Math.max(0, Math.min(t.maxCooldown, t.cooldown));
                  const ready = cd <= 0;
                  const pct = t.maxCooldown > 0
                    ? ((t.maxCooldown - cd) / t.maxCooldown) * 100
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
            {/* Skill slots */}
            {['rf', 'dc', 'ps'].map(id => {
              const s = (data.skills && data.skills[id]) || { a: 0, c: 0 };
              const active = s.a > 0;
              const cooling = s.c > 0;
              const defs = { rf: { key: 'F', name: '速射', desc: '装填-30%' }, dc: { key: 'G', name: '损管', desc: '回血30%' }, ps: { key: 'H', name: '精准', desc: '散步-30%' } };
              const d = defs[id];
              let className = 'weapon-slot skill';
              if (active) className += ' skill-active';
              else if (cooling) className += ' skill-cooldown';
              return (
                <div key={id} className={className}>
                  <span className="weapon-slot-key">{d.key}</span>
                  <div className="weapon-slot-name">{d.name}</div>
                  {active && <div className="weapon-slot-desc">{s.a.toFixed(1)}s</div>}
                  {cooling && <div className="weapon-slot-desc">CD {Math.ceil(s.c)}s</div>}
                  {!active && !cooling && <div className="weapon-slot-desc">{d.desc}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
