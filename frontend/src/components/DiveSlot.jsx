// Submarine dive slot for the bottom weapon bar: an explicit indicator for the
// B-key dive toggle showing its current state —
//   surfaced          -> 按B下潜
//   diving (过渡中)   -> 正在下潜
//   fully submerged   -> 按B上浮
//   surfacing (过渡中)-> 正在上浮
// Shared by the solo HUD and MultiplayerHUD; purely informational (the B key
// drives the action). `dive` is the engine's HUD block:
//   { target: bool, transition: 0..1 }   (target = wants to be submerged)
export default function DiveSlot({ dive }) {
  if (!dive) return null;
  const t = Math.max(0, Math.min(1, dive.transition || 0));
  let label;
  let cls = 'weapon-slot dive';
  if (dive.target && t < 0.999) {
    label = '正在下潜';
    cls += ' transitioning';
  } else if (dive.target) {
    label = '按B上浮';
    cls += ' submerged';
  } else if (t > 0.001) {
    label = '正在上浮';
    cls += ' transitioning';
  } else {
    label = '按B下潜';
  }
  return (
    <div
      className={cls}
      title="B 键切换下潜/上浮（约1.5秒过渡）；潜没后免疫炮弹但甲板炮无法开火"
    >
      <span className="weapon-slot-key">B</span>
      <div className="weapon-slot-name">下潜/上浮</div>
      <div className="weapon-slot-desc">{label}</div>
    </div>
  );
}
