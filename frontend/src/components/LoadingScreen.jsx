import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';

// Upper bound wait (seconds). If engines load faster, we enter immediately.
const MAX_WAIT = 20;

export default function LoadingScreen() {
  const { loadEngines, enginesError } = useGame();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const next = searchParams.get('next') || '/';
  const [remaining, setRemaining] = useState(MAX_WAIT);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Kick off the (dynamic) game-resource load; enter the game as soon as it
    // resolves. Falls back to the timeout UI below if it never resolves.
    loadEngines()
      .then(() => {
        if (cancelled) return;
        setDone(true);
        navigate(next, { replace: true });
      })
      .catch(() => {
        // enginesError is set in context; the timeout UI below will surface it.
      });

    // Countdown display (upper bound), ticks once per second.
    const timer = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [loadEngines, navigate, next]);

  const timedOut = remaining === 0 && !done;

  if (enginesError || timedOut) {
    return (
      <div className="loading-screen">
        <div className="loading-container">
          <h1 className="game-title">3D 海战</h1>
          <p className="loading-text">加载游戏资源超时，请检查网络后重试。</p>
          <button className="loading-retry-btn" onClick={() => window.location.reload()}>重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="loading-screen">
      <div className="loading-container">
        <h1 className="game-title">3D 海战</h1>
        <div className="loading-spinner" />
        <p className="loading-text">正在加载游戏资源...</p>
        <p className="loading-countdown">{remaining}s</p>
      </div>
    </div>
  );
}
