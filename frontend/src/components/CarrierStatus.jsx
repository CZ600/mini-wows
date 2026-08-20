// Carrier status strip: shows auto-pilot / rearming / patrol chips plus the
// flown squadron's health bar + altimeter, above the weapon bar when the player
// is a carrier. Purely informational (keys drive the actions); reflects the
// engine's `squadron` HUD block.
//
// squadron = { carrier, airborne, autoPilot, autoPhase, rearming, patrol,
//              hp, maxHp, altitude, maxAlt, minAlt }
const PHASE_LABELS = {
  idle: '',
  engage: '接敌',
  attack: '攻击',
  return: '返航',
  rearm: '补给',
};

export default function CarrierStatus({ squadron }) {
  if (!squadron || !squadron.carrier) return null;
  const chips = [];
  if (squadron.autoPilot) {
    chips.push(
      <span key="ap" className="carrier-chip autopilot" title="飞机自动攻击（Y 切换）">
        自动攻击 ON
      </span>
    );
    const phase = PHASE_LABELS[squadron.autoPhase];
    if (phase) {
      chips.push(<span key="ph" className="carrier-chip phase">{phase}</span>);
    }
  }
  if (squadron.rearming) {
    chips.push(
      <span key="rm" className="carrier-chip rearming" title="靠近航母，正在补给弹药">
        补给中
      </span>
    );
  }
  if (squadron.patrol) {
    chips.push(
      <span key="pt" className="carrier-chip patrol" title="航母正沿巡航路径自动驾驶（任意 WASD 取消）">
        巡航中 {squadron.patrol.idx + 1}/{squadron.patrol.count}
      </span>
    );
  }

  // Flown-squadron survivability + altitude, only while actually flying.
  let flightEls = null;
  if (squadron.airborne) {
    const hpPct = squadron.maxHp > 0
      ? Math.max(0, Math.min(100, (squadron.hp / squadron.maxHp) * 100))
      : 0;
    const hpLow = hpPct <= 35;
    // Altimeter: altitude as a fraction of the flight envelope (minAlt..maxAlt).
    const span = (squadron.maxAlt || 1) - (squadron.minAlt || 0);
    const altPct = span > 0
      ? Math.max(0, Math.min(100, ((squadron.altitude - (squadron.minAlt || 0)) / span) * 100))
      : 50;
    flightEls = (
      <div className="squadron-flight-status" title="W 俯冲 / S 拉升；俯冲过低会坠毁">
        <div className="squadron-hp">
          <span className="squadron-hp-label">机群</span>
          <div className="squadron-hp-track">
            <div className={`squadron-hp-fill${hpLow ? ' low' : ''}`} style={{ width: hpPct + '%' }} />
          </div>
          <span className="squadron-hp-text">{Math.round(squadron.hp)}</span>
        </div>
        <div className="squadron-alt" title={`高度 ${Math.round(squadron.altitude)}m`}>
          <span className="squadron-alt-label">高度</span>
          <div className="squadron-alt-track">
            <div className="squadron-alt-fill" style={{ height: altPct + '%' }} />
          </div>
          <span className="squadron-alt-text">{Math.round(squadron.altitude)}</span>
        </div>
      </div>
    );
  }

  if (chips.length === 0 && !flightEls) return null;
  return (
    <div id="carrier-status">
      {chips.length > 0 && <div className="carrier-chips">{chips}</div>}
      {flightEls}
    </div>
  );
}
