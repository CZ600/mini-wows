export default function MultiplayerHUD({ data, events }) {
  if (!data) return null;

  const hpPercent = Math.max(0, (data.hp / data.maxHp) * 100);
  const hpColor = hpPercent > 60 ? '#44cc44' : hpPercent > 30 ? '#ccaa22' : '#ff3333';
  const speed = data.speed || 0;
  const ping = data.ping || 0;

  return (
    <div id="hud" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
      {/* HP Bar */}
      <div style={{
        position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        width: '300px', height: '20px', background: '#333', borderRadius: '4px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${hpPercent}%`, height: '100%', background: hpColor,
          transition: 'width 0.2s ease',
        }} />
        <span style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          color: '#fff', fontSize: '12px', fontWeight: 'bold', textShadow: '1px 1px 2px #000',
        }}>
          {Math.round(data.hp)} / {data.maxHp}
        </span>
      </div>

      {/* Speed & Ping */}
      <div style={{
        position: 'absolute', bottom: '50px', left: '20px',
        color: '#ddd', fontSize: '13px', fontFamily: 'monospace',
      }}>
        <div>航速: {speed.toFixed(1)} km/h</div>
        <div style={{ color: ping < 50 ? '#4caf50' : ping < 100 ? '#ff9800' : '#f44336' }}>
          延迟: {ping}ms
        </div>
      </div>

      {/* Kill feed */}
      {events && events.length > 0 && (
        <div style={{
          position: 'absolute', top: '80px', right: '20px',
          color: '#fff', fontSize: '12px', fontFamily: 'monospace',
          textAlign: 'right',
        }}>
          {events.slice(-5).map((evt, i) => (
            <div key={i} style={{
              padding: '2px 6px', marginBottom: '2px',
              background: evt.type === 'entity_destroyed' ? 'rgba(255,0,0,0.3)' : 'rgba(0,0,0,0.3)',
              borderRadius: '3px',
            }}>
              {evt.type === 'hit' && `${evt.attacker} → ${evt.target} (-${evt.damage})`}
              {evt.type === 'entity_destroyed' && `${evt.destroyed_by} 击沉 ${evt.target}`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
