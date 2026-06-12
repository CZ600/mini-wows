export default function MultiplayerHUD({ data, events }) {
  if (!data) return null;

  const hpPercent = Math.max(0, (data.hp / data.maxHp) * 100);
  const hpColor = hpPercent > 60 ? '#4dff88' : hpPercent > 30 ? '#ff9800' : '#ff4d4d';
  const speed = data.speed || 0;
  const ping = data.ping || 0;

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
        <div id="hud-left">
          <div className="hud-row">
            <span className="hud-label">血量</span>
            <div className="health-bar-outer">
              <div className="health-bar-inner" style={{ width: hpPercent + '%', backgroundColor: hpColor }} />
            </div>
            <span>{Math.ceil(data.hp)}</span>
          </div>
        </div>

        <div id="hud-right">
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
        <div className="hud-bottom-middle" />
        <div className="hud-bottom-right" />
      </div>
    </>
  );
}
