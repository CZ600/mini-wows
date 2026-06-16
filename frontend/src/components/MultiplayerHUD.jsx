const GEAR_ROWS = [
  { name: '前进4', gear: 5 },
  { name: '前进3', gear: 4 },
  { name: '前进2', gear: 3 },
  { name: '前进1', gear: 2 },
  { name: '停车', gear: 1 },
  { name: '倒退', gear: 0 },
];

function TopToolbar({ hp, maxHp, onOpenSettings, onExit, onToggleMute, muted }) {
  const hpPercent = hp != null && maxHp ? (hp / maxHp) * 100 : 0;
  const hpColor = hpPercent > 60 ? 'var(--success)' : hpPercent > 30 ? 'var(--warning)' : 'var(--danger)';
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
      {hp != null && maxHp != null && (
        <div className="toolbar-hp" title={`血量 ${Math.ceil(hp)} / ${maxHp}`}>
          <span className="toolbar-hp-label">血量</span>
          <div className="health-bar-outer">
            <div className="health-bar-inner" style={{ width: hpPercent + '%', backgroundColor: hpColor }} />
          </div>
          <span className="toolbar-hp-value">{Math.ceil(hp)}</span>
        </div>
      )}
    </div>
  );
}

function TopStats({ fps, ping, packetLoss }) {
  const fpsColor = fps >= 55 ? 'var(--success)' : fps >= 30 ? 'var(--warning)' : 'var(--danger)';
  const pingColor = ping < 50 ? 'var(--success)' : ping < 100 ? 'var(--warning)' : 'var(--danger)';
  // Only show packet loss when it's non-trivial to avoid clutter/noise.
  const lossPct = packetLoss != null ? Math.round(packetLoss * 100) : 0;
  const showLoss = lossPct > 0;
  const lossColor = lossPct < 5 ? 'var(--success)' : lossPct < 15 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div id="top-stats">
      {ping != null && (
        <div className="stat-pill">
          <span className="stat-label">延迟</span>
          <span className="stat-value" style={{ color: pingColor }}>{ping}ms</span>
        </div>
      )}
      {showLoss && (
        <div className="stat-pill">
          <span className="stat-label">丢包</span>
          <span className="stat-value" style={{ color: lossColor }}>{lossPct}%</span>
        </div>
      )}
      <div className="stat-pill">
        <span className="stat-label">FPS</span>
        <span className="stat-value" style={{ color: fpsColor }}>{fps || 0}</span>
      </div>
    </div>
  );
}

export default function MultiplayerHUD({ data, events, onOpenSettings, onExit, onToggleMute, muted }) {
  if (!data) return null;

  const speed = data.speed || 0;
  const ping = data.ping || 0;
  const level = data.level || 1;
  const shipClass = data.shipClass;
  const respawns = data.respawns ?? null;
  const gearIdx = data.gear == null ? 1 : data.gear;

  const turrets = data.turrets || [];
  const frontTurrets = turrets.filter(t => t.isFront);
  const backTurrets = turrets.filter(t => !t.isFront);

  const weaponMode = data.weaponMode || 'gun';
  const torpedoTier = data.torpedoTier || 1;
  const torpedoTubes = data.torpedoTubes || [];
  const torpedoMaxCooldown = data.torpedoMaxCooldown || 0;
  const availableTorpedoTiers = data.availableTorpedoTiers || [];

  const tierLabels = { 1: '短/快', 2: '中程', 3: '远/慢' };
  const tierKeys = { 1: '2', 2: '3', 3: '4' };
  const classNames = { destroyer: '驱逐舰', cruiser: '巡洋舰', battleship: '战列舰' };

  const hasTorpedoes = torpedoTubes.length > 0 && availableTorpedoTiers.length > 0;
  const sortedTiers = [...availableTorpedoTiers].sort((a, b) => a - b);

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
        hp={data.hp}
        maxHp={data.maxHp}
        onOpenSettings={onOpenSettings}
        onExit={onExit}
        onToggleMute={onToggleMute}
        muted={muted}
      />
      <TopStats fps={data.fps} ping={ping} packetLoss={data.packetLoss} />
      {/* Crosshair */}
      <div id="hud" style={{ pointerEvents: 'none' }}>
        <div id="crosshair">
          <div className="cross-h" />
          <div className="cross-v" />
        </div>

        {/* Top Right - Level & Respawn */}
        <div id="hud-right">
          <div className="hud-row hud-row-boxed">
            <span className="hud-label">等级</span><span className="hud-value">{level}</span>
          </div>
          {shipClass && (
            <div className="hud-row hud-row-boxed">
              <span className="hud-label">职业</span>
              <span className="hud-value">{classNames[shipClass] || shipClass}</span>
            </div>
          )}
          {respawns !== null && (
            <div className="hud-row hud-row-boxed">
              <span className="hud-label">重生</span>
              <span className="hud-value" style={{ color: respawns > 0 ? 'var(--success)' : 'var(--danger)' }}>
                {respawns}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Kill Feed */}
      {events && events.length > 0 && (
        <div id="kill-feed">
          {events.slice(-5).map((evt, i) => (
            <div key={i} className="kill-feed-item">
              {evt.type === 'hit' && (
                <><span className="killer">{evt.attacker}</span> → <span className="victim">{evt.target}</span> (-{evt.damage})</>
              )}
              {evt.type === 'entity_destroyed' && (
                <><span className="killer">{evt.destroyed_by}</span> 击沉 <span className="victim">{evt.target}</span></>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Bar */}
      <div id="hud-bottom-bar">
        <div className="hud-bottom-left">
          <div className="gear-display">
            {GEAR_ROWS.map((row, idx) => (
              <div key={idx} className={`gear-row${row.gear === gearIdx ? ' active' : ''}`}>
                <span className="gear-name">{row.name}</span>
                {row.gear === gearIdx && (
                  <span className="gear-speed">
                    <span className="gear-speed-value">{speed.toFixed(1)}</span>
                    <span className="gear-speed-unit">km/h</span>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Middle - Reload bars + Weapon slots */}
        <div className="hud-bottom-middle hud-weapon-stack">
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
