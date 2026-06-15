export default function ExitConfirmModal({ visible, onConfirm, onCancel }) {
  if (!visible) return null;

  return (
    <div id="exit-confirm-modal" className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">退出游戏</h2>
        <p className="modal-message">确定要退出当前游戏吗？</p>
        <p className="modal-message modal-message-secondary">退出后将返回主菜单，当前进度不会保存。</p>
        <div className="modal-actions">
          <button className="menu-btn secondary" onClick={onCancel}>取消</button>
          <button className="menu-btn danger" onClick={onConfirm}>确定退出</button>
        </div>
      </div>
    </div>
  );
}
