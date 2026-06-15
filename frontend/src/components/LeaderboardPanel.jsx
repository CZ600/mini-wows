import { useState, useEffect } from 'react';
import { getLeaderboard } from '../api.js';

export default function LeaderboardPanel({ visible, onClose }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (visible) {
      getLeaderboard().then(setRows).catch(() => {});
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div id="leaderboard-panel">
      <h2>排行榜</h2>
      <div id="leaderboard-body" className="leaderboard-body">
        <table id="leaderboard-table">
          <thead><tr><th>排名</th><th>玩家</th><th>分数</th><th>击毁</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td>{i + 1}</td><td>{r.name}</td><td>{r.score}</td><td>{r.enemies_destroyed}</td></tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="4">暂无数据</td></tr>}
          </tbody>
        </table>
      </div>
      <button className="menu-btn secondary" onClick={onClose}>关闭</button>
    </div>
  );
}
