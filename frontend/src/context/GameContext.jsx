import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createPlayer, createGame, finishGame, getMe, clearToken,
  getPlayerProgress, savePlayerProgress, resetPlayerProgress,
  getPlayerClass, setPlayerClass,
} from '../api.js';
import {
  loadAudioSettings, saveAudioSettings, applyAudioSettingsToManager,
} from '../game/audio_settings.js';

// NOTE: engine.js / multiplayer_engine.js are intentionally NOT imported here.
// They pull in three.js + the entire game module tree. Importing them statically
// would force three.js into the first-screen bundle. They are loaded lazily via
// loadEngines() (dynamic import()) from the loading screen / multiplayer entry,
// so login/menu/setup pages stay light.

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

  // Engine instances mirrored in state so consumers re-render when they become
  // available (refs alone wouldn't trigger a re-render). null until loaded.
  const [engine, setEngine] = useState(null);
  const [mpEngine, setMpEngine] = useState(null);
  const pendingStartRef = useRef(null);
  const spStartedRef = useRef(false);
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
  const [mpShipLabels, setMpShipLabels] = useState(null);

  // Game result
  const [gameResult, setGameResult] = useState({ score: 0, enemies: 0, level: 1 });

  // Audio settings (persisted via audio_settings.js)
  const initialSettings = useRef(loadAudioSettings());
  const [bgmVolume, setBgmVolumeState] = useState(initialSettings.current.bgmVolume);
  const [sfxVolume, setSfxVolumeState] = useState(initialSettings.current.sfxVolume);
  const [muted, setMutedState] = useState(initialSettings.current.muted);

  // Lazy-loaded game engines (three.js etc). Null until loadEngines() resolves.
  const [enginesLoaded, setEnginesLoaded] = useState(false);
  const [enginesError, setEnginesError] = useState(null);

  // Navigate reference (set by NavigationHelper)
  const navigateRef = useRef(null);

  // ── Engine callbacks (defined upfront so they have stable identity) ──
  const onLevelUp = useCallback((info) => {
    setLevelUpInfo(info);
    if (levelUpTimerRef.current) clearTimeout(levelUpTimerRef.current);
    levelUpTimerRef.current = setTimeout(() => setLevelUpInfo(null), 6000);
    if (playerIdRef.current) {
      savePlayerProgress(playerIdRef.current, info.newLevel).catch(() => {});
    }
  }, []);
  const onGameOverSp = useCallback((score, level, enemies) => {
    setGameResult({ score, enemies, level });
    if (document.pointerLockElement) document.exitPointerLock();
    if (gameIdRef.current) {
      finishGame(gameIdRef.current, score, level, enemies, 'sunk').catch(() => {});
    }
    navigateRef.current?.('/gameover');
  }, []);
  const onClassSelect = useCallback(() => {
    navigateRef.current?.('/class-select');
  }, []);

  // Lazily load + instantiate the game engines (three.js etc).
  // Safe to call repeatedly; only runs the heavy work once.
  const loadEngines = useCallback(async () => {
    if (engineRef.current && mpEngineRef.current) return;
    try {
      const [{ GameEngine }, { MultiplayerEngine }] = await Promise.all([
        import('../game/engine.js'),
        import('../game/multiplayer_engine.js'),
      ]);
      const engine = new GameEngine();
      const mpEngine = new MultiplayerEngine();

      // Single-player engine callbacks
      engine.onHudUpdate = setHudData;
      engine.onMinimapUpdate = setMinimapData;
      engine.onScopeChange = setScoped;
      engine.onLevelUp = onLevelUp;
      engine.onGameOver = onGameOverSp;
      engine.onClassSelect = onClassSelect;

      // Multiplayer engine callbacks
      mpEngine.onHudUpdate = setMpHudData;
      mpEngine.onMinimapUpdate = setMpMinimapData;
      mpEngine.onScopeChange = setMpScoped;
      mpEngine.onShipLabelsUpdate = setMpShipLabels;
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

      // Apply current audio settings to the freshly created managers
      applyAudioSettingsToManager(engine.audio, { bgmVolume, sfxVolume, muted });
      applyAudioSettingsToManager(mpEngine.audio, { bgmVolume, sfxVolume, muted });

      engineRef.current = engine;
      mpEngineRef.current = mpEngine;
      setEngine(engine);
      setMpEngine(mpEngine);
      setEnginesError(null);
      setEnginesLoaded(true);
    } catch (e) {
      setEnginesError(e);
      throw e;
    }
  }, [onLevelUp, onGameOverSp, onClassSelect, bgmVolume, sfxVolume, muted]);

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

  // Sync audio settings to engine audio managers whenever they change.
  // Engines may be null before lazy load — guard accordingly.
  useEffect(() => {
    if (engineRef.current) {
      applyAudioSettingsToManager(engineRef.current.audio, { bgmVolume, sfxVolume, muted });
    }
    if (mpEngineRef.current) {
      applyAudioSettingsToManager(mpEngineRef.current.audio, { bgmVolume, sfxVolume, muted });
    }
  }, [bgmVolume, sfxVolume, muted]);

  // Helpers
  const nav = (path) => navigateRef.current?.(path);

  const ensureMpConnected = () => {
    const mp = mpEngineRef.current;
    if (!mp.ws.connected) {
      mp.ws.onMessage = (msg) => mp._handleMessage(msg);
      mp.ws.onDisconnect = () => {
        if (mp.onDisconnect) mp.onDisconnect();
      };
      const token = localStorage.getItem('token');
      mp.connect(token, user.id);
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
    spStartedRef.current = false;
    setSpInitialized(false);
    nav('/loading?next=/play');
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
    spStartedRef.current = false;
    setSpInitialized(false);
    nav('/loading?next=/play');
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
    spStartedRef.current = false;
    setSpInitialized(false);
    nav('/loading?next=/play');
    if (playerIdRef.current) {
      try {
        const g = await createGame(playerIdRef.current);
        gameIdRef.current = g.id;
      } catch { /* offline */ }
    }
  };

  const handleClassSelect = async (shipClass) => {
    engine.selectClass(shipClass);
    pendingStartRef.current = { level: engine.level || 4, shipClass };
    spStartedRef.current = true;
    if (playerIdRef.current) {
      setPlayerClass(playerIdRef.current, shipClass).catch(() => {});
      savePlayerProgress(playerIdRef.current, 4).catch(() => {});
    }
    nav('/loading?next=/play');
  };

  const handleMultiplayer = async () => {
    await loadEngines();
    ensureMpConnected();
    nav('/multi');
  };

  const handleQuickMatch = (mode, level, shipClass, respawnLimit) => {
    ensureMpConnected();
    pendingRoomRef.current = true;
    setRoomInfo(null);
    mpEngine.quickMatch(mode, level, shipClass, respawnLimit);
    nav('/multi/room');
  };

  const handleCreateRoom = (mode, level, shipClass, respawnLimit) => {
    ensureMpConnected();
    pendingRoomRef.current = true;
    setRoomInfo(null);
    mpEngine.createRoom(mode, level, shipClass, respawnLimit);
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
    setMpShipLabels(null);
    nav('/');
  };

  const handleBackToLobby = () => {
    setMpEliminated(false);
    setRoomInfo(null);
    setMpCountdown(null);
    nav('/multi');
  };

  // Audio volume setters (persist + update state)
  const handleBgmVolumeChange = useCallback((v) => {
    setBgmVolumeState(v);
    saveAudioSettings({ bgmVolume: v });
  }, []);

  const handleSfxVolumeChange = useCallback((v) => {
    setSfxVolumeState(v);
    saveAudioSettings({ sfxVolume: v });
  }, []);

  const handleMutedChange = useCallback((m) => {
    setMutedState(m);
    saveAudioSettings({ muted: m });
  }, []);

  // Exit from single-player game to menu
  const handleExitSpToMenu = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    engine.destroy();
    setHudData(null);
    setMinimapData(null);
    setScoped(false);
    setSpInitialized(false);
    pendingStartRef.current = null;
    spStartedRef.current = false;
    nav('/');
  }, [engine]);

  // Exit from multiplayer game to menu
  const handleExitMpToMenu = useCallback(() => {
    handleBackToMenu();
  }, [handleBackToMenu]);

  const value = {
    // Auth
    user, authState, setAuthState,
    handleLogin, handleLogout,

    // Engine refs
    engine, mpEngine,
    playerIdRef, gameIdRef,
    mpCanvasRef, mpInitializedRef, spInitializedRef, pendingStartRef, spStartedRef, pendingRoomRef,

    // Lazy engine loading
    loadEngines, enginesLoaded, enginesError,

    // Single player state
    hudData, minimapData, scoped, levelUpInfo, spInitialized, setSpInitialized,

    // Multiplayer state
    roomInfo, mpHudData, mpCountdown, mpMinimapData, mpScoped, mpEliminated, mpShipLabels,

    // Game result
    gameResult,

    // Audio settings
    bgmVolume, sfxVolume, muted,
    handleBgmVolumeChange, handleSfxVolumeChange, handleMutedChange,
    handleExitSpToMenu, handleExitMpToMenu,

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
