export default function MultiplayerHUD({ data, events }) {
  if (!data) return null;

  const hpPercent = Math.max(0, (data.hp / data.maxHp) * 100);
  const hpColor = hpPercent > 60 ? 'var(--success)' : hpPercent > 30 ? 'var(--warning)' : 'var(--danger)';
  const speed = data.speed || 0;
  const ping = data.ping || 0;
  const level = data.level || 1;
  const shipClass = data.shipClass;
  const respawns = data.respawns ?? null;

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

  const allTubesReady = hasTorpedoes && torpedoTubes.every(t => t.ready);
  const torpedoMaxRemaining = hasTorpedoes
    ? (allTubesReady ? 0 : Math.max(...torpedoTubes.map(t => t.cooldown)))
    : 0;
  const torpedoFillPct = torpedoMaxCooldown > 0
    ? Math.max(0, Math.min(100, ((torpedoMaxCooldown - torpedoMaxRemaining) / torpedoMaxCooldown) * 100))
    : 100;

  return (
    <>
      {/* Crosshair */}
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
            <span>{Math.ceil(data.hp)}</span>
          </div>
        </div>

        {/* Top Right - Level, Respawn & Ping */}
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
          <div className="hud-row hud-row-boxed">
            <span className="hud-label">延迟</span>
            <span className="hud-value" style={{ color: ping < 50 ? 'var(--success)' : ping < 100 ? 'var(--warning)' : 'var(--danger)' }}>
              {ping}ms
            </span>
          </div>
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
          <div className="speed-display">
            <span className="hud-label">速度</span>
            <span className="speed-value">{speed.toFixed(1)}</span>
            <span className="speed-unit">km/h</span>
          </div>
        </div>

        {/* Middle - Reload bars + Weapon slots */}
        <div className="hud-bottom-middle hud-weapon-stack">
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
