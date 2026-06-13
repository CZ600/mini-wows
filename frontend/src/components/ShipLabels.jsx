const MAX_NAME_LEN = 12;

function formatName(name) {
  if (!name) return '';
  const s = String(name);
  return s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) + '…' : s;
}

export default function ShipLabels({ labels }) {
  if (!labels || labels.length === 0) return null;

  return (
    <div id="ship-labels">
      {labels.map((lb) => {
        const ratio = lb.maxHp > 0 ? Math.max(0, Math.min(1, lb.hp / lb.maxHp)) : 0;
        const barColor = lb.isFriendly ? '#4dff88' : '#ff4d4d';
        return (
          <div
            key={lb.id}
            className="ship-label"
            style={{ left: lb.x, top: lb.y }}
          >
            <div className="ship-label-name">{formatName(lb.name)}</div>
            <div className="ship-label-bar-outer">
              <div
                className="ship-label-bar-inner"
                style={{ width: (ratio * 100).toFixed(1) + '%', background: barColor }}
              />
            </div>
            <div className="ship-label-hp" style={{ color: barColor }}>
              {Math.ceil(lb.hp)} / {Math.ceil(lb.maxHp)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
