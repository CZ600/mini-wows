import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GameEngine } from '../game/engine.js';
import { MultiplayerEngine } from '../game/multiplayer_engine.js';
import {
  createPlayer, createGame, finishGame, getMe, clearToken,
  getPlayerProgress, savePlayerProgress, resetPlayerProgress,
  getPlayerClass, setPlayerClass,
} from '../api.js';

const GameContext = createContext(null);

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export function GameProvider({ children }) {
  // Auth
  const [user, setUser] = useState(null);
  const [authState, setAuthState] = useState('CHECKING');

  // Game refs
  const engineRef = useRef(null);
  const mpEngineRef = useRef(null);
  const playerIdRef = useRef(null);
  const gameIdRef = useRef(null);
  const levelUpTimerRef = useRef(null);
  const mpCanvasRef = useRef(null);
  const mpInitializedRef = useRef(false);
  const spInitializedRef = useRef(false);
  const pendingStartRef = useRef(null);
  const pendingRoomRef = useRef(false);

  // Single player state
  const [hudData, setHudData] = useState(null);
  const [minimapData, setMinimapData] = useState(null);
  const [scoped, setScoped] = useState(false);
  const [levelUpInfo, setLevelUpInfo] = useState(null);
  const [spInitialized, setSpInitialized] = useState(false);

  // Multiplayer state
  const [roomInfo, setRoomInfo] = useState(null);
  const [mpHudData, setMpHudData] = useState(null);
  const [mpCountdown, setMpCountdown] = useState(null);
  const [mpMinimapData, setMpMinimapData] = useState(null);
  const [mpScoped, setMpScoped] = useState(false);
  const [mpEliminated, setMpEliminated] = useState(false);

  // Game result
  const [gameResult, setGameResult] = useState({ score: 0, enemies: 0, level: 1 });

  // Navigate reference (set by NavigationHelper)
  const navigateRef = useRef(null);

  if (!engineRef.current) {
    engineRef.current = new GameEngine();
  }
  if (!mpEngineRef.current) {
    mpEngineRef.current = new MultiplayerEngine();
  }

  const engine = engineRef.current;
  const mpEngine = mpEngineRef.current;

  // Engine callbacks
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
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameIdRef.current) {
      finishGame(gameIdRef.current, score, level, enemies, 'sunk').catch(() => {});
    }
    navigateRef.current?.('/gameover');
  }, []);
  engine.onClassSelect = useCallback(() => {
    navigateRef.current?.('/class-select');
  }, []);

  // Multiplayer engine callbacks
  mpEngine.onHudUpdate = setMpHudData;
  mpEngine.onMinimapUpdate = setMpMinimapData;
  mpEngine.onScopeChange = setMpScoped;
  mpEngine.onRoomUpdate = (info) => {
    pendingRoomRef.current = false;
    setRoomInfo(info);
  };
  mpEngine.onCountdown = (seconds) => setMpCountdown(seconds);
  mpEngine.onGameStart = () => {
    setMpEliminated(false);
    navigateRef.current?.('/multi/play');
  };
  mpEngine.onGameOver = (results) => {
    setGameResult({ score: 0, enemies: 0, level: 1, multiplayerResults: results });
    setMpEliminated(false);
    navigateRef.current?.('/gameover');
  };
  mpEngine.onEliminated = () => setMpEliminated(true);
  mpEngine.onError = (msg) => {
    console.error('MP Error:', msg);
    alert(msg);
  };

  // Auth check
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

  // Helpers
  const nav = (path) => navigateRef.current?.(path);

  const ensureMpConnected = () => {
    if (!mpEngine.ws.connected) {
      mpEngine.ws.onMessage = (msg) => mpEngine._handleMessage(msg);
      mpEngine.ws.onDisconnect = () => {
        if (mpEngine.onDisconnect) mpEngine.onDisconnect();
      };
      const token = localStorage.getItem('token');
      mpEngine.connect(token, user.id);
    }
  };

  // Handlers
  const handleLogin = (userData) => {
    setUser(userData);
    setAuthState('AUTHENTICATED');
    nav('/');
  };

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setAuthState('LOGIN');
    nav('/login');
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
    pendingStartRef.current = { level: initialLevel, shipClass: initialClass };
    setSpInitialized(false);
    nav('/play');
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
    pendingStartRef.current = { level: startLevel, shipClass };
    setSpInitialized(false);
    nav('/play');
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
    pendingStartRef.current = { level: 1, shipClass: null };
    setSpInitialized(false);
    nav('/play');
    if (playerIdRef.current) {
      try {
        const g = await createGame(playerIdRef.current);
        gameIdRef.current = g.id;
      } catch { /* offline */ }
    }
  };

  const handleClassSelect = async (shipClass) => {
    engine.selectClass(shipClass);
    if (playerIdRef.current) {
      setPlayerClass(playerIdRef.current, shipClass).catch(() => {});
      savePlayerProgress(playerIdRef.current, 4).catch(() => {});
    }
    nav('/play');
  };

  const handleMultiplayer = () => {
    ensureMpConnected();
    nav('/multi');
  };

  const handleQuickMatch = (mode, level, shipClass) => {
    ensureMpConnected();
    pendingRoomRef.current = true;
    setRoomInfo(null);
    mpEngine.quickMatch(mode, level, shipClass);
    nav('/multi/room');
  };

  const handleCreateRoom = (mode, level, shipClass) => {
    ensureMpConnected();
    pendingRoomRef.current = true;
    setRoomInfo(null);
    mpEngine.createRoom(mode, level, shipClass);
    nav('/multi/room');
  };

  const handleJoinRoom = (roomId) => {
    ensureMpConnected();
    pendingRoomRef.current = true;
    setRoomInfo(null);
    mpEngine.joinRoom(roomId);
    nav('/multi/room');
  };

  const handleReady = () => {
    mpEngine.ready();
  };

  const handleSelectClass = (shipClass) => {
    mpEngine.ws.send({ type: 'set_ship_class', shipClass });
  };

  const handleLeaveRoom = () => {
    mpEngine.leaveRoom();
    setRoomInfo(null);
    setMpCountdown(null);
    nav('/multi');
  };

  const handleBackToMenu = () => {
    mpEngine.disconnect();
    if (mpInitializedRef.current) {
      mpEngine.destroy();
      mpInitializedRef.current = false;
    }
    setRoomInfo(null);
    setMpCountdown(null);
    setMpEliminated(false);
    setMpHudData(null);
    setMpMinimapData(null);
    nav('/');
  };

  const handleBackToLobby = () => {
    setMpEliminated(false);
    setRoomInfo(null);
    setMpCountdown(null);
    nav('/multi');
  };

  const value = {
    // Auth
    user, authState, setAuthState,
    handleLogin, handleLogout,

    // Engine refs
    engine, mpEngine,
    playerIdRef, gameIdRef,
    mpCanvasRef, mpInitializedRef, spInitializedRef, pendingStartRef, pendingRoomRef,

    // Single player state
    hudData, minimapData, scoped, levelUpInfo, spInitialized, setSpInitialized,

    // Multiplayer state
    roomInfo, mpHudData, mpCountdown, mpMinimapData, mpScoped, mpEliminated,

    // Game result
    gameResult,

    // Navigation ref setter
    setNavigateRef: (fn) => { navigateRef.current = fn; },

    // Handlers
    handleStart, handleContinue, handleRestart,
    handleClassSelect,
    handleMultiplayer, handleQuickMatch, handleCreateRoom, handleJoinRoom,
    handleReady, handleSelectClass,
    handleLeaveRoom, handleBackToMenu, handleBackToLobby,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// Component to sync navigate into context
export function NavigationHelper({ children }) {
  const navigate = useNavigate();
  const { setNavigateRef } = useGame();
  setNavigateRef(navigate);
  return children;
}
