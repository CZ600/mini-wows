export default function MultiplayerHUD({ data, events }) {
  if (!data) return null;

  const hpPercent = Math.max(0, (data.hp / data.maxHp) * 100);
  const hpColor = hpPercent > 60 ? '#4dff88' : hpPercent > 30 ? '#ff9800' : '#ff4d4d';
  const speed = data.speed || 0;
  const ping = data.ping || 0;
  const level = data.level || 1;
  const shipClass = data.shipClass;

  const turrets = data.turrets || [];
  const frontTurrets = turrets.filter(t => t.isFront);
  const backTurrets = turrets.filter(t => !t.isFront);

  const weaponMode = data.weaponMode || 'gun';
  const torpedoTier = data.torpedoTier || 1;
  const torpedoSpread = data.torpedoSpread || 'narrow';
  const torpedoTubes = data.torpedoTubes || [];

  const tierLabels = { 1: '短/快', 2: '中程', 3: '远/慢' };
  const classNames = { destroyer: '驱逐舰', cruiser: '巡洋舰', battleship: '战列舰' };

  return (
    <>
      {/* Compass */}
      <div id="compass">
        <span className="compass-dir">N</span>
        <span className="compass-dir">E</span>
        <span className="compass-dir">S</span>
        <span className="compass-dir">W</span>
      </div>

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

        {/* Top Right - Level & Ping */}
        <div id="hud-right">
          <div className="hud-row"><span className="hud-label">等级</span><span>{level}</span></div>
          {shipClass && <div className="hud-row"><span className="hud-label">职业</span><span>{classNames[shipClass] || shipClass}</span></div>}
          <div className="hud-row">
            <span className="hud-label">延迟</span>
            <span style={{ color: ping < 50 ? '#4dff88' : ping < 100 ? '#ff9800' : '#ff4d4d' }}>
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
          <div className="hud-row">
            <span className="hud-label">速度</span>
            <span>{speed.toFixed(1)} km/h</span>
          </div>
        </div>

        {/* Middle - Weapon info */}
        <div className="hud-bottom-middle">
          {weaponMode === 'gun' ? (
            <div className="weapon-box selected">
              <div className="weapon-name">火炮</div>
              <div className="weapon-ammo">{frontTurrets.length + backTurrets.length} 门</div>
              <div className="weapon-cooldown">
                {frontTurrets.map((t, i) => {
                  const ready = t.cooldown <= 0;
                  return (
                    <div key={`f${i}`} className="cooldown-item">
                      <span className="cooldown-label">前{i + 1}</span>
                      <span className={`cooldown-time ${ready ? 'ready' : ''}`}>
                        {ready ? '就绪' : t.cooldown.toFixed(1) + 's'}
                      </span>
                    </div>
                  );
                })}
                {backTurrets.map((t, i) => {
                  const ready = t.cooldown <= 0;
                  return (
                    <div key={`b${i}`} className="cooldown-item">
                      <span className="cooldown-label">后{i + 1}</span>
                      <span className={`cooldown-time ${ready ? 'ready' : ''}`}>
                        {ready ? '就绪' : t.cooldown.toFixed(1) + 's'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="weapon-box selected">
              <div className="weapon-name">鱼雷 {tierLabels[torpedoTier] || ''}</div>
              <div className="weapon-ammo">{torpedoSpread === 'narrow' ? '窄扇' : '宽扇'}</div>
              <div className="weapon-cooldown">
                {(() => {
                  const allReady = torpedoTubes.every(t => t.ready);
                  const maxCooldown = allReady ? 0 : Math.max(...torpedoTubes.map(t => t.cooldown));
                  return (
                    <div className="cooldown-item">
                      <span className="cooldown-label">装填</span>
                      <span className={`cooldown-time ${allReady ? 'ready' : ''}`}>
                        {allReady ? '就绪' : maxCooldown.toFixed(1) + 's'}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        <div className="hud-bottom-right" />
      </div>
    </>
  );
}
