import { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, Outlet, useLocation } from 'react-router-dom';
import { useGame, NavigationHelper } from './context/GameContext.jsx';
import { AuthRoute, AdminRoute } from './components/AuthRoute.jsx';
import { GameProvider } from './context/GameContext.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import MenuScreen from './components/MenuScreen.jsx';
import SingleSetupScreen from './components/SingleSetupScreen.jsx';
import MultiSetupScreen from './components/MultiSetupScreen.jsx';
import AdminDashboard from './components/AdminDashboard.jsx';
import RoomScreen from './components/RoomScreen.jsx';
import GameCanvas from './components/GameCanvas.jsx';
import HUD from './components/HUD.jsx';
import MultiplayerHUD from './components/MultiplayerHUD.jsx';
import Minimap from './components/Minimap.jsx';
import ShipLabels from './components/ShipLabels.jsx';
import GameOverScreen from './components/GameOverScreen.jsx';
import LeaderboardPanel from './components/LeaderboardPanel.jsx';
import ClassSelectScreen from './components/ClassSelectScreen.jsx';
import './App.css';

const MENU_BGM_SOUND = '/Riptide%20Armada%202.mp3';
const MENU_BGM_VOLUME = 0.1;
const PREP_PATHS = new Set(['/', '/single', '/multi', '/multi/room', '/class-select', '/gameover']);

const SCOPE_TICKS = [
  -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0,
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

function ScopeOverlay() {
  return (
    <div id="scope-overlay">
      <svg id="scope-crosshair" viewBox="0 0 400 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
        <defs>
          <mask id="scopeMask">
            <rect width="400" height="400" fill="white" />
            <circle cx="200" cy="200" r="215" fill="black" />
          </mask>
        </defs>
        <rect width="400" height="400" fill="rgba(0,0,0,0.75)" mask="url(#scopeMask)" />
        <circle cx="200" cy="200" r="160" fill="none" stroke="rgba(180,180,180,0.25)" strokeWidth="1.5" />
        <line x1="0" y1="200" x2="400" y2="200" stroke="rgba(200,200,200,0.55)" strokeWidth="1" />
        <line x1="200" y1="20" x2="200" y2="192" stroke="rgba(200,200,200,0.55)" strokeWidth="1" />
        <line x1="200" y1="208" x2="200" y2="380" stroke="rgba(200,200,200,0.55)" strokeWidth="1" />
        {SCOPE_TICKS.map((n) => {
          const x = 200 + n * 18;
          const isMajor = n % 5 === 0;
          const isCenter = n === 0;
          const h = isCenter ? 10 : isMajor ? 9 : 5;
          const color = isCenter
            ? 'rgba(255,60,60,0.8)'
            : isMajor
              ? 'rgba(200,200,200,0.65)'
              : 'rgba(200,200,200,0.35)';
          const sw = isMajor || isCenter ? 1.2 : 0.7;
          return (
            <line key={n} x1={x} y1={200 - h} x2={x} y2={200 + h}
              stroke={color} strokeWidth={sw} />
          );
        })}
        <circle cx="200" cy="200" r="3" fill="rgba(255,60,60,0.8)" />
        <text x="200" y="24" textAnchor="middle" fill="rgba(200,200,200,0.5)" fontSize="10" fontFamily="monospace">N</text>
      </svg>
    </div>
  );
}

function LevelUpNotification({ info }) {
  if (!info) return null;
  const { oldLevel, newLevel, oldShip, newShip, oldEnemy, newEnemy } = info;

  const fmt = (label, o, n, unit = '', goodUp = true) => {
    if (o === n) return '';
    const d = n - o;
    const good = goodUp ? d > 0 : d < 0;
    const sign = d > 0 ? '+' : '';
    const color = good ? '#6fdf6f' : '#ffa040';
    return <span key={label} className="levelup-stat">{label} {o}{unit}→<span style={{ color }}>{n}{unit}</span> <span style={{ color }}>({sign}{d}{unit})</span></span>;
  };

  const shipItems = [
    fmt('HP', oldShip.hp, newShip.hp),
    fmt('伤害', oldShip.damage, newShip.damage),
    fmt('装填', oldShip.fireCooldown, newShip.fireCooldown, 's', false),
    fmt('炮塔', oldShip.frontTurrets + oldShip.backTurrets, newShip.frontTurrets + newShip.backTurrets),
  ].filter(Boolean);

  const enemyItems = [
    fmt('HP', oldEnemy.hp, newEnemy.hp),
    fmt('伤害', oldEnemy.damage, newEnemy.damage),
    fmt('数量', oldEnemy.count, newEnemy.count),
  ].filter(Boolean);

  return (
    <div id="levelup-notification">
      <div className="levelup-title">恭喜升级！等级 {oldLevel} → {newLevel}</div>
      {shipItems.length > 0 && (
        <div className="levelup-row"><span className="levelup-label">舰船</span>{shipItems}</div>
      )}
      {enemyItems.length > 0 && (
        <div className="levelup-row"><span className="levelup-label">敌方</span>{enemyItems}</div>
      )}
    </div>
  );
}

// ── Page Components ──

function LoginPage() {
  const { handleLogin } = useGame();
  const navigate = useNavigate();
  return <LoginScreen onLogin={handleLogin} onSwitchToRegister={() => navigate('/register')} />;
}

function RegisterPage() {
  const { handleLogin } = useGame();
  const navigate = useNavigate();
  return <RegisterScreen onRegister={handleLogin} onSwitchToLogin={() => navigate('/login')} />;
}

function MenuPage() {
  const { user, handleLogout } = useGame();
  const navigate = useNavigate();
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  return (
    <>
      <MenuScreen
        user={user}
        onSinglePlayer={() => navigate('/single')}
        onMultiplayer={() => navigate('/multi')}
        onShowLeaderboard={() => setShowLeaderboard(v => !v)}
        onShowAdmin={() => navigate('/admin')}
        onLogout={handleLogout}
      />
      <LeaderboardPanel visible={showLeaderboard} onClose={() => setShowLeaderboard(false)} />
    </>
  );
}

function SingleSetupPage() {
  const { user, handleStart } = useGame();
  const navigate = useNavigate();
  return <SingleSetupScreen user={user} onStart={handleStart} onBack={() => navigate('/')} />;
}

function MultiSetupPage() {
  const { user, handleQuickMatch, handleCreateRoom, handleJoinRoom } = useGame();
  const navigate = useNavigate();
  return (
    <MultiSetupScreen
      user={user}
      onQuickMatch={handleQuickMatch}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
      onBack={() => navigate('/')}
    />
  );
}

function RoomPage() {
  const { user, roomInfo, mpCountdown, pendingRoomRef, handleReady, handleLeaveRoom, handleSelectClass } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    if (roomInfo) return;
    if (pendingRoomRef.current) return;
    const timeout = setTimeout(() => {
      navigate('/multi', { replace: true });
    }, 3000);
    return () => clearTimeout(timeout);
  }, [roomInfo, navigate, pendingRoomRef]);

  if (!roomInfo) {
    return (
      <div id="menu-screen">
        <div className="menu-container">
          <h1 className="game-title">3D 海战</h1>
          <p className="menu-welcome">正在加入房间...</p>
          <button className="menu-btn secondary" onClick={() => navigate('/multi')} style={{ marginTop: '16px' }}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  return (
    <RoomScreen
      roomInfo={{ ...roomInfo, countdown: mpCountdown }}
      userId={user.id}
      onReady={handleReady}
      onLeave={handleLeaveRoom}
      onSelectClass={handleSelectClass}
    />
  );
}

function SinglePlayPage() {
  const { engine, hudData, minimapData, scoped, levelUpInfo, spInitialized, setSpInitialized, pendingStartRef, spStartedRef } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pendingStartRef.current) {
      navigate('/single', { replace: true });
      return;
    }
    if (spInitialized && pendingStartRef.current && !spStartedRef.current) {
      const { level, shipClass } = pendingStartRef.current;
      spStartedRef.current = true;
      engine.start(level, shipClass);
    }
  }, [spInitialized, engine, pendingStartRef, spStartedRef, navigate]);

  if (!pendingStartRef.current) return null;

  return (
    <>
      <GameCanvas engine={engine} onInit={() => setSpInitialized(true)} />
      {hudData && <HUD data={hudData} />}
      {levelUpInfo && <LevelUpNotification info={levelUpInfo} />}
      {minimapData && !scoped && <Minimap data={minimapData} />}
      {scoped && <ScopeOverlay />}
    </>
  );
}

// Shared canvas layout for multiplayer flow (lobby/room/play).
// Keeps canvas and mpEngine initialized across these pages so snapshots
// received during room state don't crash (Ship constructor needs scene).
function MultiCanvasLayout() {
  const { mpEngine, mpCanvasRef, mpInitializedRef, mpHudData, mpMinimapData, mpScoped, mpEliminated, mpShipLabels } = useGame();

  useEffect(() => {
    if (mpCanvasRef.current) {
      mpEngine.init(mpCanvasRef.current);
    }
  }, [mpEngine, mpCanvasRef]);

  return (
    <>
      <canvas ref={mpCanvasRef} id="game-canvas" />
      {mpHudData && <MultiplayerHUD data={mpHudData} />}
      {mpMinimapData && !mpScoped && <Minimap data={mpMinimapData} />}
      {mpShipLabels && !mpScoped && <ShipLabels labels={mpShipLabels} />}
      {mpScoped && <ScopeOverlay />}
      {mpEliminated && (
        <div id="gameover-screen">
          <div className="gameover-container">
            <h1>战舰沉没</h1>
            <p>你已被淘汰，正在观战中...</p>
          </div>
        </div>
      )}
      <Outlet />
    </>
  );
}

function GameOverPage() {
  const { gameResult, handleContinue, handleRestart, handleBackToLobby } = useGame();
  return (
    <GameOverScreen
      score={gameResult.score}
      enemies={gameResult.enemies}
      level={gameResult.level}
      multiplayerResults={gameResult.multiplayerResults}
      onContinue={handleContinue}
      onRestart={handleRestart}
      onBackToLobby={handleBackToLobby}
    />
  );
}

function ClassSelectPage() {
  const { handleClassSelect } = useGame();
  return <ClassSelectScreen onSelect={handleClassSelect} />;
}

function AdminPage() {
  const navigate = useNavigate();
  return <AdminDashboard onClose={() => navigate('/')} />;
}

// ── App with Routes ──

export default function App() {
  return (
    <GameProvider>
      <NavigationHelper>
        <AppRoutes />
      </NavigationHelper>
    </GameProvider>
  );
}

function AppRoutes() {
  const { authState } = useGame();
  const location = useLocation();
  const menuBgmRef = useRef(null);

  useEffect(() => {
    if (authState !== 'AUTHENTICATED') return;
    if (!menuBgmRef.current) {
      const a = new Audio(MENU_BGM_SOUND);
      a.loop = true;
      a.volume = MENU_BGM_VOLUME;
      menuBgmRef.current = a;
    }
    const a = menuBgmRef.current;
    if (PREP_PATHS.has(location.pathname)) {
      if (a.paused) a.play().catch(() => {});
    } else if (!a.paused) {
      a.pause();
    }
  }, [authState, location.pathname]);

  useEffect(() => () => {
    if (menuBgmRef.current) {
      menuBgmRef.current.pause();
      menuBgmRef.current = null;
    }
  }, []);

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

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<AuthRoute><MenuPage /></AuthRoute>} />
      <Route path="/single" element={<AuthRoute><SingleSetupPage /></AuthRoute>} />
      <Route path="/multi" element={<AuthRoute><MultiSetupPage /></AuthRoute>} />
      <Route element={<AuthRoute><MultiCanvasLayout /></AuthRoute>}>
        <Route path="/multi/room" element={<RoomPage />} />
        <Route path="/multi/play" element={<div />} />
      </Route>
      <Route path="/admin" element={<AuthRoute><AdminRoute><AdminPage /></AdminRoute></AuthRoute>} />
      <Route path="/play" element={<AuthRoute><SinglePlayPage /></AuthRoute>} />
      <Route path="/gameover" element={<AuthRoute><GameOverPage /></AuthRoute>} />
      <Route path="/class-select" element={<AuthRoute><ClassSelectPage /></AuthRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
