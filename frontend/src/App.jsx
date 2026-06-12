import { useState, useRef, useCallback, useEffect } from 'react';
import LoginScreen from './components/LoginScreen.jsx';
import RegisterScreen from './components/RegisterScreen.jsx';
import MenuScreen from './components/MenuScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import RoomScreen from './components/RoomScreen.jsx';
import GameCanvas from './components/GameCanvas.jsx';
import HUD from './components/HUD.jsx';
import MultiplayerHUD from './components/MultiplayerHUD.jsx';
import Minimap from './components/Minimap.jsx';
import GameOverScreen from './components/GameOverScreen.jsx';
import LeaderboardPanel from './components/LeaderboardPanel.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import ClassSelectScreen from './components/ClassSelectScreen.jsx';
import { GameEngine } from './game/engine.js';
import { MultiplayerEngine } from './game/multiplayer_engine.js';
import { createPlayer, createGame, finishGame, getMe, clearToken, getPlayerProgress, savePlayerProgress, resetPlayerProgress, getPlayerClass, setPlayerClass } from './api.js';
import './App.css';

function ScopeOverlay() {
  return (
    <div id="scope-overlay">
      <svg id="scope-crosshair" viewBox="0 0 400 400" width="100%" height="100%">
        <circle cx="200" cy="200" r="180" fill="none" stroke="rgba(0,0,0,0.7)" strokeWidth="120" />
        <circle cx="200" cy="200" r="140" fill="none" stroke="rgba(180,180,180,0.3)" strokeWidth="1.5" />
        <line x1="200" y1="40" x2="200" y2="185" stroke="rgba(200,200,200,0.7)" strokeWidth="1" />
        <line x1="200" y1="215" x2="200" y2="260" stroke="rgba(200,200,200,0.7)" strokeWidth="1" />
        <line x1="40" y1="200" x2="185" y2="200" stroke="rgba(200,200,200,0.7)" strokeWidth="1" />
        <line x1="215" y1="200" x2="260" y2="200" stroke="rgba(200,200,200,0.7)" strokeWidth="1" />
        <line x1="72" y1="72" x2="155" y2="155" stroke="rgba(200,200,200,0.35)" strokeWidth="0.8" />
        <line x1="328" y1="72" x2="245" y2="155" stroke="rgba(200,200,200,0.35)" strokeWidth="0.8" />
        <line x1="72" y1="328" x2="155" y2="245" stroke="rgba(200,200,200,0.35)" strokeWidth="0.8" />
        <line x1="328" y1="328" x2="245" y2="245" stroke="rgba(200,200,200,0.35)" strokeWidth="0.8" />
        <circle cx="200" cy="200" r="3" fill="rgba(255,60,60,0.8)" />
        <text x="200" y="22" textAnchor="middle" fill="rgba(200,200,200,0.5)" fontSize="10" fontFamily="monospace">N</text>
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

export default function App() {
  const [authState, setAuthState] = useState('CHECKING');
  const [user, setUser] = useState(null);
  const [gameState, setGameState] = useState('MENU');
  const [hudData, setHudData] = useState(null);
  const [minimapData, setMinimapData] = useState(null);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [gameResult, setGameResult] = useState({ score: 0, enemies: 0, level: 1 });
  const [scoped, setScoped] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const [showClassSelect, setShowClassSelect] = useState(false);

  // Multiplayer state
  const [roomInfo, setRoomInfo] = useState(null);
  const [mpHudData, setMpHudData] = useState(null);
  const [mpCountdown, setMpCountdown] = useState(null);

  const engineRef = useRef(null);
  const mpEngineRef = useRef(null);
  const playerIdRef = useRef(null);
  const gameIdRef = useRef(null);
  const levelUpTimerRef = useRef(null);
  const mpCanvasRef = useRef(null);
  const mpInitializedRef = useRef(false);

  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }
  if (!mpEngineRef.current) {
    mpEngineRef.current = new MultiplayerEngine();
  }
  const engine = engineRef.current;
  const mpEngine = mpEngineRef.current;

  engine.onHudUpdate = setHudData;
  engine.onMinimapUpdate = setMinimapData;
  engine.onScopeChange = setScoped;
  engine.onLevelUp = useCallback((info) => {
    setLevelUpInfo(info);
    if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
    levelUpTimerRef.current = setTimeout(() => setLevelUpInfo(null), 6000);
    if (playerIdRef.current) {
      savePlayerProgress(playerIdRef.current, info.newLevel).catch(() => {});
    }
  }, []);
  engine.onGameOver = useCallback((score, level, enemies) => {
    setGameResult({ score, enemies, level });
    setGameState('GAME_OVER');
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameIdRef.current) {
      finishGame(gameIdRef.current, score, level, enemies, 'sunk').catch(() => {});
    }
  }, []);
  engine.onClassSelect = useCallback(() => {
    setShowClassSelect(true);
    setGameState('CLASS_SELECT');
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const userData = await getMe();
        if (userData) {
          setUser(userData);
          setAuthState('AUTHENTICATED');
        } else {
          setAuthState('LOGIN');
        }
      } catch {
        setAuthState('LOGIN');
      }
    })();
  }, []);

  // Init mpEngine when canvas is available in multiplayer states
  useEffect(() => {
    const isMpState = gameState === 'LOBBY' || gameState === 'ROOM' || gameState === 'MULTIPLAYER';
    if (isMpState && mpCanvasRef.current && !mpInitializedRef.current) {
      mpEngine.init(mpCanvasRef.current);
      mpInitializedRef.current = true;
    }
  }, [gameState, mpEngine]);

  const handleLogin = (userData) => {
    setUser(userData);
    setAuthState('AUTHENTICATED');
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setAuthState('LOGIN');
    setGameState('MENU');
    setShowLeaderboard(false);
    setShowAdmin(false);
  };

  const handleStart = async (name, initialLevel = 1, initialClass = null) => {
    try {
      const p = await createPlayer(name);
      playerIdRef.current = p.id;
      const g = await createGame(p.id);
      gameIdRef.current = g.id;
    } catch {
      console.warn('API unavailable, playing offline');
    }
    if (playerIdRef.current && initialLevel > 1) {
      savePlayerProgress(playerIdRef.current, initialLevel).catch(() => {});
    }
    if (playerIdRef.current && initialClass) {
      setPlayerClass(playerIdRef.current, initialClass).catch(() => {});
    }
    engine.start(initialLevel, initialClass);
    setGameState('PLAYING');
    setShowLeaderboard(false);
    setShowAdmin(false);
  };

  const handleContinue = async () => {
    let startLevel = 1;
    let shipClass = null;
    if (playerIdRef.current) {
      try {
        const progress = await getPlayerProgress(playerIdRef.current);
        startLevel = progress.level || 1;
        shipClass = progress.shipClass || null;
      } catch { /* offline */ }
    }
    engine.start(startLevel, shipClass);
    setGameState('PLAYING');
    if (playerIdRef.current) {
      try {
        const g = await createGame(playerIdRef.current);
        gameIdRef.current = g.id;
      } catch { /* offline */ }
      savePlayerProgress(playerIdRef.current, startLevel).catch(() => {});
    }
  };

  const handleRestart = async () => {
    if (playerIdRef.current) {
      resetPlayerProgress(playerIdRef.current).catch(() => {});
    }
    engine.start(1, null);
    setGameState('PLAYING');
    if (playerIdRef.current) {
      try {
        const g = await createGame(playerIdRef.current);
        gameIdRef.current = g.id;
      } catch { /* offline */ }
    }
  };

  const handleClassSelect = async (shipClass) => {
    engine.selectClass(shipClass);
    setShowClassSelect(false);
    setGameState('PLAYING');
    if (playerIdRef.current) {
      setPlayerClass(playerIdRef.current, shipClass).catch(() => {});
      savePlayerProgress(playerIdRef.current, 4).catch(() => {});
    }
  };

  // Multiplayer handlers
  mpEngine.onHudUpdate = setMpHudData;
  mpEngine.onRoomUpdate = (info) => {
    setRoomInfo(info);
  };
  mpEngine.onCountdown = (seconds) => {
    setMpCountdown(seconds);
  };
  mpEngine.onGameStart = () => {
    setGameState('MULTIPLAYER');
  };
  mpEngine.onGameOver = (results) => {
    setGameState('GAME_OVER');
    setGameResult({ score: 0, enemies: 0, level: 1, multiplayerResults: results });
  };
  mpEngine.onError = (msg) => {
    console.error('MP Error:', msg);
    alert(msg);
  };

  const handleMultiplayer = () => {
    const token = localStorage.getItem('token');
    // Init will happen in useEffect when canvas mounts
    mpEngine.connect(token, user.id);
    setGameState('LOBBY');
  };

  const handleQuickMatch = (mode, level, shipClass) => {
    mpEngine.quickMatch(mode, level, shipClass);
    setGameState('ROOM');
  };

  const handleCreateRoom = (mode, level, shipClass) => {
    mpEngine.createRoom(mode, level, shipClass);
    setGameState('ROOM');
  };

  const handleJoinRoom = (roomId, level, shipClass) => {
    mpEngine.joinRoom(roomId, level, shipClass);
    setGameState('ROOM');
  };

  const handleReady = () => {
    mpEngine.ready();
  };

  const handleLeaveRoom = () => {
    mpEngine.leaveRoom();
    setRoomInfo(null);
    setMpCountdown(null);
    setGameState('LOBBY');
  };

  const handleBackToMenu = () => {
    mpEngine.disconnect();
    if (mpInitializedRef.current) {
      mpEngine.destroy();
      mpInitializedRef.current = false;
    }
    setRoomInfo(null);
    setMpCountdown(null);
    setGameState('MENU');
  };

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

  if (authState === 'LOGIN') {
    return <LoginScreen onLogin={handleLogin} onSwitchToRegister={() => setAuthState('REGISTER')} />;
  }

  if (authState === 'REGISTER') {
    return <RegisterScreen onRegister={handleLogin} onSwitchToLogin={() => setAuthState('LOGIN')} />;
  }

  return (
    <>
      {gameState === 'MENU' && (
        <MenuScreen
          user={user}
          onStart={handleStart}
          onMultiplayer={handleMultiplayer}
          onShowLeaderboard={() => setShowLeaderboard(v => !v)}
          onShowAdmin={() => setShowAdmin(v => !v)}
          onLogout={handleLogout}
        />
      )}

      {gameState === 'LOBBY' && (
        <LobbyScreen
          user={user}
          onQuickMatch={handleQuickMatch}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onBack={handleBackToMenu}
        />
      )}

      {gameState === 'ROOM' && (
        <RoomScreen
          roomInfo={roomInfo ? { ...roomInfo, countdown: mpCountdown } : null}
          userId={user.id}
          onReady={handleReady}
          onLeave={handleLeaveRoom}
        />
      )}
      <LeaderboardPanel visible={gameState === 'MENU' && showLeaderboard} onClose={() => setShowLeaderboard(false)} />
      {gameState === 'MENU' && showAdmin && user?.role === 'admin' && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {/* Single-player canvas */}
      {gameState === 'PLAYING' && <GameCanvas engine={engine} />}

      {/* Multiplayer canvas */}
      {(gameState === 'LOBBY' || gameState === 'ROOM' || gameState === 'MULTIPLAYER') && (
        <canvas ref={mpCanvasRef} id="game-canvas" />
      )}

      {gameState === 'PLAYING' && hudData && <HUD data={hudData} />}
      {gameState === 'MULTIPLAYER' && mpHudData && <MultiplayerHUD data={mpHudData} />}
      {levelUpInfo && <LevelUpNotification info={levelUpInfo} />}
      {gameState === 'PLAYING' && minimapData && !scoped && <Minimap data={minimapData} />}
      {gameState === 'PLAYING' && scoped && <ScopeOverlay />}

      {showClassSelect && (
        <ClassSelectScreen onSelect={handleClassSelect} />
      )}

      {gameState === 'GAME_OVER' && (
        <GameOverScreen
          score={gameResult.score}
          enemies={gameResult.enemies}
          level={gameResult.level}
          onContinue={handleContinue}
          onRestart={handleRestart}
        />
      )}
    </>
  );
}
