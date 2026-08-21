import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';

function fmtBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 KB';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LoadingScreen() {
  const { loadEngines, enginesError } = useGame();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = searchParams.get('next') || '/';
  const [progress, setProgress] = useState({ loaded: 0, total: 0, speed: 0 });

  useEffect(() => {
    let cancelled = false;

    // No timeout: a slow link just takes longer, and the transfer readout
    // below shows how it is going. Errors surface via enginesError.
    loadEngines((p) => {
      if (!cancelled) setProgress(p);
    })
      .then(() => {
        if (cancelled) return;
        navigate(next, { replace: true });
      })
      .catch(() => {
        // enginesError is set in context; the error UI below will surface it.
      });

    return () => {
      cancelled = true;
    };
  }, [loadEngines, navigate, next]);

  if (enginesError) {
    return (
      <div className="loading-screen">
        <div className="loading-container">
          <h1 className="game-title">3D 海战</h1>
          <p className="loading-text">加载游戏资源失败，请检查网络后重试。</p>
          <button className="loading-retry-btn" onClick={() => window.location.reload()}>重试</button>
        </div>
      </div>
    );
  }

  const pct = progress.total > 0 ? Math.min(100, (progress.loaded / progress.total) * 100) : 0;

  return (
    <div className="loading-screen">
      <div className="loading-container">
        <h1 className="game-title">3D 海战</h1>
        <div className="loading-spinner" />
        <p className="loading-text">正在加载游戏资源...</p>
        <div className="loading-progress">
          <div className="loading-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="loading-stats">
          <span>{fmtBytes(progress.loaded)} / {fmtBytes(progress.total)}</span>
          <span>{pct.toFixed(0)}%</span>
          <span>{fmtBytes(progress.speed)}/s</span>
        </div>
      </div>
    </div>
  );
}
