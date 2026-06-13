import { Navigate } from 'react-router-dom';
import { useGame } from '../context/GameContext.jsx';

export function AuthRoute({ children }) {
  const { authState } = useGame();

  if (authState === 'CHECKING') {
    return (
      <div id="menu-screen">
        <div className="menu-container">
          <h1 className="game-title">3D 海战</h1>
          <p className="menu-welcome">正在验证登录状态...</p>
        </div>
      </div>
    );
  }

  if (authState !== 'AUTHENTICATED') {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function AdminRoute({ children }) {
  const { user } = useGame();

  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}
