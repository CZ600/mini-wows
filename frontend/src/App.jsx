import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, Outlet } from 'react-router-dom';
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
import CarrierMap from './components/CarrierMap.jsx';
import TutorialPage from './components/TutorialPage.jsx';
import ExitConfirmModal from './components/ExitConfirmModal.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import LoadingScreen from './components/LoadingScreen.jsx';
import ChatBox from './components/ChatBox.jsx';
import './App.css';

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
      {/* 左侧按键提示：Q/E 调整观察高度（controls.js 仅在开镜时响应） */}
      <div className="scope-hints">
        <div className="scope-hint"><kbd>Q</kbd>提升视角</div>
        <div className="scope-hint"><kbd>E</kbd>降低视角</div>
      </div>
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

// Floating hit/kill feedback for the single-player & multiplayer modes. The
// engine pushes {type:'damage',amount} / {type:'kill',score} events; here we
// render them as short-lived pop-ups. Damage numbers rise + fade near the
// crosshair (multiple in a burst stagger horizontally); kills flash a gold
// banner across the top.
//
// Lifecycle: each pop-up is purely CSS-animated (animationDuration = TTL) and
// mounts fresh per event id, so the animation always runs from 0%. The parent
// (GameContext) owns the events array; this layer requests a prune once every
// pop-up would have expired so the array never grows unbounded. Crucially, we
// only ever render entries whose TTL has NOT elapsed — keeping a stale entry
// in the list would reuse its DOM node (same key) and leave the pop-up frozen
// at its final "forwards" keyframe (invisible), which is what previously made
// damage numbers vanish.
const HIT_DAMAGE_TTL = 900;   // ms a damage number lives
const HIT_KILL_TTL = 1500;    // ms a kill banner lives

function HitFeedbackLayer({ events, onPrune }) {
  // Drive expiry from an effect (not during render): once the oldest pop-up
  // would have expired, ask the parent to prune stale entries. We re-schedule
  // on every change to `events` so a fresh hit always resets the timer and a
  // burst never gets pruned mid-animation. The parent's pruner drops entries
  // whose TTL elapsed, which unmounts the DOM node — keeping a stale node
  // around would leave it frozen at its CSS "forwards" end keyframe (invisible)
  // and, worse, its id could be reused by a new hit that then never animates.
  const count = events ? events.length : 0;
  useEffect(() => {
    if (count === 0 || !onPrune) return;
    const id = setTimeout(onPrune, HIT_KILL_TTL + 50);
    return () => clearTimeout(id);
  }, [count, onPrune]);

  if (!events || events.length === 0) return null;

  // Keep only the most recent 12. The events array is already pruned of expired
  // entries by the parent (see onPrune), so everything left here is live.
  const list = events.length > 12 ? events.slice(events.length - 12) : events;

  // Index-within-type so overlapping damage numbers fan out horizontally.
  const visible = [];
  let dmgIdx = 0;
  let killIdx = 0;
  for (const e of list) {
    if (e.type === 'kill') {
      visible.push({ ...e, ttl: HIT_KILL_TTL, idxWithinType: killIdx++ });
    } else {
      visible.push({ ...e, ttl: HIT_DAMAGE_TTL, idxWithinType: dmgIdx++ });
    }
  }

  return (
    <div id="hit-feedback-layer">
      {visible.map((e) => {
        if (e.type === 'kill') {
          return (
            <div
              key={e.id}
              className="hit-kill"
              style={{ animationDuration: `${e.ttl}ms` }}
            >
              <span className="hit-kill-icon">💥</span>
              <span className="hit-kill-text">击沉敌舰</span>
              <span className="hit-kill-score">+{e.score}</span>
            </div>
          );
        }
        // Damage: stagger horizontally by within-type index, oldest furthest.
        const offset = (e.idxWithinType % 5) - 2;   // -2..2 → -40px..40px
        return (
          <div
            key={e.id}
            className="hit-damage"
            style={{
              animationDuration: `${e.ttl}ms`,
              '--hit-offset': `${offset * 20}px`,
            }}
          >
            -{e.amount}
          </div>
        );
      })}
    </div>
  );
}

// Team-mode wingmen HUD overlay. Each alive teammate shows a "队友N" tag + HP
// bar above their hull, anchored at the screen position the engine projects.
// Dead teammates are skipped (no floating tombstone). Label x/y come straight
// from the engine's per-frame projection; entries are off-screen when x/y are
// negative sentinels.
function TeamLabels({ labels }) {
  if (!labels || labels.length === 0) return null;
  const shown = labels.filter((lb) => lb.alive && lb.x > -1000 && lb.y > -1000);
  if (shown.length === 0) return null;
  return (
    <div id="team-labels">
      {shown.map((lb) => {
        const ratio = lb.maxHp > 0 ? Math.max(0, Math.min(1, lb.hp / lb.maxHp)) : 0;
        // HP colour: blue family to match the wingman hull, darkening as HP drops.
        const hpColor = ratio > 0.6 ? '#4db8ff'
          : ratio > 0.3 ? '#2a7ad1'
            : '#1a3f6e';
        return (
          <div
            key={lb.id}
            className="team-label"
            style={{ left: lb.x, top: lb.y }}
          >
            <div className="team-label-name">队友{lb.slot + 1}</div>
            <div className="team-label-bar-outer">
              <div
                className="team-label-bar-inner"
                style={{ width: (ratio * 100).toFixed(1) + '%', background: hpColor }}
              />
            </div>
          </div>
        );
      })}
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
        onShowTutorial={() => navigate('/tutorial')}
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
  const {
    engine, hudData, minimapData, scoped, levelUpInfo, spInitialized, setSpInitialized,
    pendingStartRef, spStartedRef,
    hitFeedback, pruneHitFeedback,
    teamLabels,
    classSelectPending, handleClassSelect,
    carrierMapOpen, setCarrierMapOpen,
    bgmVolume, sfxVolume, muted,
    handleBgmVolumeChange, handleSfxVolumeChange, handleMutedChange,
    handleExitSpToMenu,
  } = useGame();
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Team-mode flag comes from the HUD payload (the team loop sets mode:'team')
  // rather than reading the start ref during render.
  const isTeamMode = hudData?.mode === 'team';

  // When the carrier patrol map (M key) opens, release the pointer lock so the
  // cursor is free to click waypoints immediately — otherwise the player has to
  // press Esc first. Closing the map and clicking the canvas re-locks on its own
  // (Controls._onClick -> requestPointerLock), so no matching lock-on-close here.
  useEffect(() => {
    if (carrierMapOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [carrierMapOpen]);

  useEffect(() => {
    if (!pendingStartRef.current) {
      navigate('/single', { replace: true });
      return;
    }
    if (spInitialized && pendingStartRef.current && !spStartedRef.current) {
      const { level, shipClass, mode } = pendingStartRef.current;
      spStartedRef.current = true;
      if (mode === 'team') {
        engine.startTeam(level, shipClass);
      } else {
        engine.start(level, shipClass);
      }
    }
  }, [spInitialized, engine, pendingStartRef, spStartedRef, navigate]);

  if (!pendingStartRef.current) return null;

  return (
    <>
      <GameCanvas engine={engine} onInit={() => setSpInitialized(true)} />
      {hudData && (
        <HUD
          data={hudData}
          onOpenSettings={() => setShowSettings(true)}
          onExit={() => setShowExitConfirm(true)}
          onToggleMute={() => handleMutedChange(!muted)}
          muted={muted}
        />
      )}
      {levelUpInfo && <LevelUpNotification info={levelUpInfo} />}
      <HitFeedbackLayer events={hitFeedback} onPrune={pruneHitFeedback} />
      {isTeamMode && !scoped && <TeamLabels labels={teamLabels} />}
      {minimapData && !scoped && <Minimap data={minimapData} />}
      {scoped && <ScopeOverlay />}
      {/* Solo 3→4 class pick: rendered in-page so the canvas stays mounted and
          the engine resumes cleanly after the pick. */}
      {classSelectPending && <ClassSelectScreen onSelect={handleClassSelect} />}
      {/* Carrier patrol map (M key). Full-screen overlay; only for carriers. */}
      {carrierMapOpen && (
        <CarrierMap
          terrainImage={minimapData?.terrainImage}
          carrierPos={minimapData?.playerPos ? { x: minimapData.playerPos.x, z: minimapData.playerPos.z } : null}
          carrierHeading={minimapData?.playerHeading ?? 0}
          enemies={(minimapData?.enemies || []).filter(e => e && e.alive && e.mesh).map(e => ({ x: e.mesh.position.x, z: e.mesh.position.z }))}
          onConfirm={(points) => {
            engine?.setCarrierPatrol?.(points);
            setCarrierMapOpen(false);
          }}
          onClose={() => setCarrierMapOpen(false)}
        />
      )}
      <ExitConfirmModal
        visible={showExitConfirm}
        onConfirm={handleExitSpToMenu}
        onCancel={() => setShowExitConfirm(false)}
      />
      <SettingsPanel
        visible={showSettings}
        bgmVolume={bgmVolume}
        sfxVolume={sfxVolume}
        muted={muted}
        onBgmVolumeChange={handleBgmVolumeChange}
        onSfxVolumeChange={handleSfxVolumeChange}
        onMutedChange={handleMutedChange}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}

// Shared canvas layout for multiplayer flow (lobby/room/play).
// Keeps canvas and mpEngine initialized across these pages so snapshots
// received during room state don't crash (Ship constructor needs scene).
function MultiCanvasLayout() {
  const {
    mpEngine, mpCanvasRef, mpInitializedRef, mpHudData, mpMinimapData,
    mpScoped, mpEliminated, mpShipLabels,
    mpChat, handleSendMpChat,
    hitFeedback, pruneHitFeedback,
    bgmVolume, sfxVolume, muted,
    handleBgmVolumeChange, handleSfxVolumeChange, handleMutedChange,
    handleExitMpToMenu,
  } = useGame();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (mpCanvasRef.current) {
      mpEngine.init(mpCanvasRef.current);
    }
  }, [mpEngine, mpCanvasRef]);

  return (
    <>
      <canvas ref={mpCanvasRef} id="game-canvas" />
      {mpHudData && (
        <MultiplayerHUD
          data={mpHudData}
          onOpenSettings={() => setShowSettings(true)}
          onExit={() => setShowExitConfirm(true)}
          onToggleMute={() => handleMutedChange(!muted)}
          muted={muted}
        />
      )}
      {mpHudData && (
        <ChatBox messages={mpChat} onSend={handleSendMpChat} />
      )}
      {mpMinimapData && !mpScoped && <Minimap data={mpMinimapData} />}
      {mpShipLabels && !mpScoped && <ShipLabels labels={mpShipLabels} />}
      {mpScoped && <ScopeOverlay />}
      <HitFeedbackLayer events={hitFeedback} onPrune={pruneHitFeedback} />
      {mpEliminated && (
        <div id="gameover-screen">
          <div className="gameover-container">
            <h1>战舰沉没</h1>
            <p>你已被淘汰，正在观战中...</p>
          </div>
        </div>
      )}
      {/** Only show exit/settings modals when actually in game, not in lobby/room **/}
      <ExitConfirmModal
        visible={showExitConfirm}
        onConfirm={handleExitMpToMenu}
        onCancel={() => setShowExitConfirm(false)}
      />
      <SettingsPanel
        visible={showSettings}
        bgmVolume={bgmVolume}
        sfxVolume={sfxVolume}
        muted={muted}
        onBgmVolumeChange={handleBgmVolumeChange}
        onSfxVolumeChange={handleSfxVolumeChange}
        onMutedChange={handleMutedChange}
        onClose={() => setShowSettings(false)}
      />
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
      shipClass={gameResult.shipClass}
      multiplayerResults={gameResult.multiplayerResults}
      teamMode={gameResult.mode === 'team'}
      teamResult={gameResult.result}
      onContinue={handleContinue}
      onRestart={handleRestart}
      onBackToLobby={handleBackToLobby}
    />
  );
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
      <Route path="/loading" element={<AuthRoute><LoadingScreen /></AuthRoute>} />
      <Route path="/tutorial" element={<TutorialPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
