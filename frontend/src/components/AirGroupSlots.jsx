// Carrier air-group slots shared by the solo HUD and MultiplayerHUD. A carrier
// fields TWO squadrons at once (鱼雷机 + 轰炸机); both are shown with their own
// ammo pool / cooldown, and the ACTIVE one (the one the player flies) is
// highlighted. Keys: 5 launches/activates 鱼雷机, 6 launches/activates 轰炸机,
// Tab swaps the active squadron. While airborne the active slot doubles as the
// "currently flying" indicator.
//
// Each slot also carries an explicit AUTO-ATTACK badge (自动 / 手动) — the
// Y key toggles the ACTIVE squadron's auto-pilot, so switch to a group (5/6/Tab)
// then press Y to change its state. In multiplayer the server runs one
// auto-pilot for the whole squadron, so both badges mirror the same state.
//
// `squadron` is the engine's HUD block:
//   { carrier, activeType, torpedo:{ammo,maxAmmo,cd,maxCd,salvo,autoPilot},
//     bomber:{...} }
export default function AirGroupSlots({ squadron }) {
  if (!squadron || !squadron.carrier) return null;

  const mk = (group, def) => {
    const cd = group.cd > 0;
    const ready = !cd && group.ammo > 0;
    const cdPct = group.maxCd > 0 ? Math.max(0, Math.min(100, ((group.maxCd - group.cd) / group.maxCd) * 100)) : 100;
    const auto = !!group.autoPilot;
    return (
      <div
        key={def.k}
        className={`weapon-slot air ${squadron.activeType === def.id ? 'selected' : ''}${cd ? ' air-cooldown' : ''}${auto ? ' air-auto' : ''}`}
        title={`${def.name}：${ready ? '就绪' : cd ? '装填中' : '弹药不足'}${squadron.activeType === def.id ? '（当前机队）' : ''}；自动攻击：${auto ? '开启' : '关闭'}（切到该机队后按 Y 切换）`}
      >
        <span className="weapon-slot-key">{def.k}</span>
        <span className={`air-auto-badge${auto ? ' on' : ''}`}>{auto ? '自动' : '手动'}</span>
        <div className="weapon-slot-name">{def.name}</div>
        {cd ? (
          <>
            <div className="weapon-slot-desc">CD {group.cd.toFixed(1)}s</div>
            <div className="air-cd-track"><div className="air-cd-fill" style={{ width: cdPct + '%' }} /></div>
          </>
        ) : (
          <div className="weapon-slot-desc">{group.ammo}/{group.maxAmmo} {group.salvo > 1 ? `×${group.salvo}` : ''}</div>
        )}
      </div>
    );
  };

  return (
    <>
      {mk(squadron.torpedo, { k: '5', id: 'torpedo', name: '鱼雷机' })}
      {mk(squadron.bomber, { k: '6', id: 'bomber', name: '轰炸机' })}
      <div className="weapon-slot air-tab-hint" title="Tab 在两个机队间切换操控；Y 切换当前机队自动攻击">
        <span className="weapon-slot-key">Tab</span>
        <div className="weapon-slot-name">切换机队</div>
        <div className="weapon-slot-desc">当前：{squadron.activeType === 'bomber' ? '轰炸机' : '鱼雷机'}</div>
      </div>
    </>
  );
}
