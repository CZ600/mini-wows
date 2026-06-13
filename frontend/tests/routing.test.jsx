// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider, useGame } from '../src/context/GameContext.jsx';
import { AuthRoute, AdminRoute } from '../src/components/AuthRoute.jsx';
import { getMe } from '../src/api.js';

// Mock api module
vi.mock('../src/api.js', () => ({
  getMe: vi.fn(),
  clearToken: vi.fn(),
  createPlayer: vi.fn(),
  createGame: vi.fn(),
  finishGame: vi.fn(),
  getPlayerProgress: vi.fn(),
  savePlayerProgress: vi.fn(),
  resetPlayerProgress: vi.fn(),
  getPlayerClass: vi.fn(),
  setPlayerClass: vi.fn(),
}));

// Mock engine modules
vi.mock('../src/game/engine.js', () => ({
  GameEngine: vi.fn(function() {
    this.onHudUpdate = null;
    this.onMinimapUpdate = null;
    this.onScopeChange = null;
    this.onLevelUp = null;
    this.onGameOver = null;
    this.onClassSelect = null;
    this.start = vi.fn();
    this.selectClass = vi.fn();
  }),
}));

vi.mock('../src/game/multiplayer_engine.js', () => ({
  MultiplayerEngine: vi.fn(function() {
    this.onHudUpdate = null;
    this.onMinimapUpdate = null;
    this.onScopeChange = null;
    this.onRoomUpdate = null;
    this.onCountdown = null;
    this.onGameStart = null;
    this.onGameOver = null;
    this.onEliminated = null;
    this.onError = null;
    this.ws = { connected: false, send: vi.fn(), onMessage: null, onDisconnect: null };
    this.init = vi.fn();
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    this.destroy = vi.fn();
    this.quickMatch = vi.fn();
    this.createRoom = vi.fn();
    this.joinRoom = vi.fn();
    this.ready = vi.fn();
    this.leaveRoom = vi.fn();
    this._handleMessage = vi.fn();
  }),
}));

function renderWithRouter(initialPath, ui) {
  return render(
    <GameProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
      </MemoryRouter>
    </GameProvider>
  );
}

describe('GameContext', () => {
  it('provides user as null initially', () => {
    let contextUser = 'NOT_SET';
    function Consumer() {
      const { user } = useGame();
      contextUser = user;
      return null;
    }
    render(
      <GameProvider>
        <Consumer />
      </GameProvider>
    );
    expect(contextUser).toBeNull();
  });

  it('provides engine instances', () => {
    let hasEngine = false;
    let hasMpEngine = false;
    function Consumer() {
      const { engine, mpEngine } = useGame();
      hasEngine = !!engine;
      hasMpEngine = !!mpEngine;
      return null;
    }
    render(
      <GameProvider>
        <Consumer />
      </GameProvider>
    );
    expect(hasEngine).toBe(true);
    expect(hasMpEngine).toBe(true);
  });

  it('provides all required handlers', () => {
    const handlers = [];
    function Consumer() {
      const ctx = useGame();
      handlers.push(
        'handleLogin', 'handleLogout', 'handleStart', 'handleContinue',
        'handleRestart', 'handleClassSelect', 'handleMultiplayer',
        'handleQuickMatch', 'handleCreateRoom', 'handleJoinRoom',
        'handleReady', 'handleSelectClass', 'handleLeaveRoom',
        'handleBackToMenu', 'handleBackToLobby',
      );
      for (const h of handlers) {
        if (typeof ctx[h] !== 'function') {
          throw new Error(`Missing handler: ${h}`);
        }
      }
      return <div data-testid="consumer">ok</div>;
    }
    render(
      <GameProvider>
        <Consumer />
      </GameProvider>
    );
    expect(screen.getByTestId('consumer')).toBeTruthy();
  });
});

describe('Room join flow', () => {
  it('sets pendingRoomRef.current to true when handleJoinRoom is called', async () => {
    getMe.mockResolvedValue({ id: 1, username: 'testuser', role: 'user' });

    let ctxRef = null;
    function Consumer() {
      ctxRef = useGame();
      return null;
    }

    render(
      <GameProvider>
        <MemoryRouter>
          <Consumer />
        </MemoryRouter>
      </GameProvider>
    );

    await vi.waitFor(() => {
      expect(ctxRef.user).not.toBeNull();
    });

    expect(ctxRef.pendingRoomRef.current).toBe(false);

    ctxRef.handleJoinRoom('r1');

    expect(ctxRef.pendingRoomRef.current).toBe(true);
  });

  it('sets pendingRoomRef.current to true when handleCreateRoom is called', async () => {
    getMe.mockResolvedValue({ id: 1, username: 'testuser', role: 'user' });

    let ctxRef = null;
    function Consumer() {
      ctxRef = useGame();
      return null;
    }

    render(
      <GameProvider>
        <MemoryRouter>
          <Consumer />
        </MemoryRouter>
      </GameProvider>
    );

    await vi.waitFor(() => {
      expect(ctxRef.user).not.toBeNull();
    });

    ctxRef.handleCreateRoom('ffa', 1, null, 0);

    expect(ctxRef.pendingRoomRef.current).toBe(true);
  });

  it('sets pendingRoomRef.current to false when onRoomUpdate fires', async () => {
    getMe.mockResolvedValue({ id: 1, username: 'testuser', role: 'user' });

    let ctxRef = null;
    let mpEngineRef = null;
    function Consumer() {
      ctxRef = useGame();
      mpEngineRef = ctxRef.mpEngine;
      return null;
    }

    render(
      <GameProvider>
        <MemoryRouter>
          <Consumer />
        </MemoryRouter>
      </GameProvider>
    );

    await vi.waitFor(() => {
      expect(ctxRef.user).not.toBeNull();
    });

    act(() => {
      ctxRef.handleJoinRoom('r1');
    });
    expect(ctxRef.pendingRoomRef.current).toBe(true);

    await act(async () => {
      mpEngineRef.onRoomUpdate({
        roomId: 'r1',
        mode: 'ffa',
        roomLevel: 1,
        respawnLimit: 0,
        players: [],
      });
    });

    expect(ctxRef.pendingRoomRef.current).toBe(false);
    expect(ctxRef.roomInfo).not.toBeNull();
  });
});

describe('AuthRoute', () => {
  it('shows loading when authState is CHECKING', () => {
    function SetChecking() {
      // GameProvider sets authState to CHECKING initially (getMe mock returns undefined = no user yet)
      return null;
    }
    const { container } = render(
      <GameProvider>
        <MemoryRouter>
          <AuthRoute>
            <div data-testid="protected">Protected</div>
          </AuthRoute>
        </MemoryRouter>
      </GameProvider>
    );
    // Initially CHECKING, should show loading screen
    expect(container.querySelector('.game-title')).toBeTruthy();
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('redirects to /login when not authenticated', async () => {
    // getMe returns null → authState becomes LOGIN
    getMe.mockResolvedValueOnce(null);

    function TestRoutes() {
      return (
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/" element={
            <AuthRoute><div data-testid="protected">Protected</div></AuthRoute>
          } />
        </Routes>
      );
    }

    render(
      <GameProvider>
        <MemoryRouter initialEntries={['/']}>
          <TestRoutes />
        </MemoryRouter>
      </GameProvider>
    );

    // After getMe resolves with null, authState → LOGIN → redirect to /login
    await screen.findByTestId('login-page');
    expect(screen.queryByTestId('protected')).toBeNull();
  });

  it('renders children when authenticated', async () => {
    getMe.mockResolvedValueOnce({ id: 1, username: 'testuser', role: 'user' });

    function TestRoutes() {
      return (
        <Routes>
          <Route path="/login" element={<div data-testid="login-page">Login</div>} />
          <Route path="/" element={
            <AuthRoute><div data-testid="protected">Protected</div></AuthRoute>
          } />
        </Routes>
      );
    }

    render(
      <GameProvider>
        <MemoryRouter initialEntries={['/']}>
          <TestRoutes />
        </MemoryRouter>
      </GameProvider>
    );

    // After getMe resolves with user, authState → AUTHENTICATED → renders children
    await screen.findByTestId('protected');
    expect(screen.queryByTestId('login-page')).toBeNull();
  });
});

describe('AdminRoute', () => {
  it('redirects to / when user is not admin', async () => {
    getMe.mockResolvedValueOnce({ id: 1, username: 'testuser', role: 'user' });

    function TestRoutes() {
      return (
        <Routes>
          <Route path="/" element={<div data-testid="home">Home</div>} />
          <Route path="/admin" element={
            <AuthRoute>
              <AdminRoute><div data-testid="admin">Admin</div></AdminRoute>
            </AuthRoute>
          } />
        </Routes>
      );
    }

    render(
      <GameProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <TestRoutes />
        </MemoryRouter>
      </GameProvider>
    );

    await screen.findByTestId('home');
    expect(screen.queryByTestId('admin')).toBeNull();
  });

  it('renders children when user is admin', async () => {
    getMe.mockResolvedValueOnce({ id: 1, username: 'admin', role: 'admin' });

    function TestRoutes() {
      return (
        <Routes>
          <Route path="/" element={<div data-testid="home">Home</div>} />
          <Route path="/admin" element={
            <AuthRoute>
              <AdminRoute><div data-testid="admin">Admin</div></AdminRoute>
            </AuthRoute>
          } />
        </Routes>
      );
    }

    render(
      <GameProvider>
        <MemoryRouter initialEntries={['/admin']}>
          <TestRoutes />
        </MemoryRouter>
      </GameProvider>
    );

    await screen.findByTestId('admin');
    expect(screen.queryByTestId('home')).toBeNull();
  });
});

describe('Route rendering', () => {
  it('renders content at root path', () => {
    function StubPage() {
      return <div data-testid="stub">Root</div>;
    }
    renderWithRouter('/', (
      <Routes>
        <Route path="/" element={<StubPage />} />
      </Routes>
    ));
    expect(screen.getByTestId('stub')).toBeTruthy();
  });

  it('renders different content at /single', () => {
    renderWithRouter('/single', (
      <Routes>
        <Route path="/" element={<div data-testid="root">Root</div>} />
        <Route path="/single" element={<div data-testid="single">Single</div>} />
      </Routes>
    ));
    expect(screen.getByTestId('single')).toBeTruthy();
    expect(screen.queryByTestId('root')).toBeNull();
  });

  it('renders nested routes like /multi/lobby', () => {
    renderWithRouter('/multi/lobby', (
      <Routes>
        <Route path="/multi" element={<div data-testid="multi">Multi</div>} />
        <Route path="/multi/lobby" element={<div data-testid="lobby">Lobby</div>} />
        <Route path="/multi/room" element={<div data-testid="room">Room</div>} />
      </Routes>
    ));
    expect(screen.getByTestId('lobby')).toBeTruthy();
    expect(screen.queryByTestId('multi')).toBeNull();
  });
});
