export default function SettingsPanel({
  visible,
  bgmVolume,
  sfxVolume,
  muted,
  onBgmVolumeChange,
  onSfxVolumeChange,
  onMutedChange,
  onClose,
}) {
  if (!visible) return null;

  const pct = (v) => `${Math.round(v * 100)}%`;

  return (
    <div id="settings-panel" className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="settings-close-btn" onClick={onClose} aria-label="关闭">×</button>
        <h2 className="modal-title">设置</h2>

        <div className="settings-row settings-mute-row">
          <span className="settings-label">{muted ? '🔇 已静音' : '🔊 静音'}</span>
          <button
            className={`menu-btn secondary ${muted ? 'active' : ''}`}
            onClick={() => onMutedChange(!muted)}
          >
            {muted ? '取消静音' : '静音'}
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span className="settings-label">🎵 背景音</span>
            <span className="settings-value">{muted ? '0%' : pct(bgmVolume)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={bgmVolume}
            disabled={muted}
            onChange={(e) => onBgmVolumeChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="settings-row">
          <div className="settings-row-header">
            <span className="settings-label">💥 游戏音效</span>
            <span className="settings-value">{muted ? '0%' : pct(sfxVolume)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={sfxVolume}
            disabled={muted}
            onChange={(e) => onSfxVolumeChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="modal-actions">
          <button className="menu-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
