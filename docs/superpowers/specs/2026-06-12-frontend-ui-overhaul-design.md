# Frontend UI Overhaul Design

Date: 2026-06-12

## Overview

Modernize the mini-wows frontend UI with three goals:
1. Separate mode selection from detailed settings (page-based navigation)
2. Modernize the visual style while keeping the deep-sea theme
3. Build a full admin dashboard for room/user management

## Architecture: Approach A — Extended State Machine

No new routing library. Extend the existing `gameState` state machine with new states.

### New States

```
SINGLE_SETUP   — Single-player setup page (level + ship class selection)
MULTI_SETUP    — Multiplayer setup page (room list / create room / quick match)
ADMIN          — Full-screen admin dashboard (replaces overlay)
```

### Navigation Flow

```
MENU → "Single Player" → SINGLE_SETUP → select level + ship → PLAYING
MENU → "Multiplayer"   → MULTI_SETUP  → 3 entries:
    ├→ Room List  → select room → ROOM
    ├→ Create Room → configure → ROOM
    └→ Quick Match → auto-match → LOBBY
MENU → "Admin" → ADMIN (full screen, no longer overlay)
```

### App.jsx Changes

- Add 3 new state constants: `SINGLE_SETUP`, `MULTI_SETUP`, `ADMIN`
- `MenuScreen` simplified: only mode selection cards + leaderboard + logout
- `SINGLE_SETUP` renders new `SingleSetupScreen` component
- `MULTI_SETUP` renders new `MultiSetupScreen` component
- `ADMIN` renders new `AdminDashboard` component
- Remove `showAdmin` overlay toggle, replace with `ADMIN` state

## UI Design System

### Color Palette (CSS Variables)

```css
--bg-primary: #0a1628
--bg-secondary: #0f2035
--bg-elevated: #162d4a
--accent: #4da6ff
--accent-glow: rgba(77,166,255,0.3)
--gold: #ffd700
--danger: #ff4d4d
--success: #4dff88
--text-primary: #e8f0ff
--text-secondary: #8aa4c8
--border: rgba(77,166,255,0.15)
--radius: 8px
--radius-lg: 12px
```

### Component Patterns

- **Cards**: `bg-secondary` + `border` + `radius` + subtle `box-shadow`
- **Buttons**: gradient blue primary (hover glow), translucent secondary, danger red
- **Inputs**: dark bg + blue focus border + rounded
- **Tables**: dark rows + alternating colors + hover highlight
- **Transitions**: all interactive elements `transition: 0.2s ease`

### Typography

- Sans-serif font, line-height 1.6
- Titles with subtle `text-shadow` glow
- 8px grid spacing system

## Pages

### Homepage (MENU) — Simplified

```
┌─────────────────────────────────────┐
│          ⚓ 3D 海战 ⚓              │
│                                     │
│     ┌───────────┐ ┌───────────┐    │
│     │  单人模式  │ │  多人模式  │    │
│     │  ⚔️ PvE   │ │  🌐 PvP   │    │
│     └───────────┘ └───────────┘    │
│                                     │
│       [ 排行榜 ]  [ 管理后台 ]      │
│              [ 登出 ]               │
└─────────────────────────────────────┘
```

- Two large cards as main entry with hover glow effect
- Leaderboard, Admin, Logout as bottom buttons
- Admin only visible to admin users

### Single Setup (SINGLE_SETUP)

- Back button (top-left) returns to MENU
- Level grid: unlocked levels highlighted, locked levels grayed with lock icon
- Ship class selection: only shown when selected level >= 4
- Three ship class cards: Destroyer (torpedo), Cruiser (balanced), Battleship (heavy guns)
- "Start Battle" button at bottom

### Multi Setup (MULTI_SETUP)

- Back button (top-left) returns to MENU
- Three entry cards as a list:
  - **Room List**: browse available rooms, show ID/mode/player count/status, click to join
  - **Create Room**: select mode (FFA/Team/PvE) + level + ship class → create
  - **Quick Match**: select mode + level + ship class → auto-match

## In-Game HUD

### Bottom Bar: Three-Column Layout

```
┌────────┬──────────────────────────┬────────┐
│ LEFT   │         MIDDLE           │ RIGHT  │
│ narrow │         wide             │ narrow │
├────────┼──────────────────────────┼────────┤
│        │                          │        │
│ Kill   │   [Main Gun] [Torpedo]   │  XP    │
│ Feed   │   ██████░░   ██░░░░     │  bar   │
│ (MP    │   3/3       2/2          │        │
│ only)  │                          │ Player │
│--------│   Selected: blue glow    │ List   │
│ Speed  │   border + box-shadow    │ (MP)   │
│ 25.3kn │   Unselected: dim border │ or     │
│        │   Battleship: 1 weapon   │ Level  │
│        │   only, permanent select │ Info   │
└────────┴──────────────────────────┴────────┘
```

### Weapon Selection Visual (no text/arrows)

**Selected mode** — blue glowing border:
```
border: 2px solid #4da6ff
box-shadow: 0 0 12px rgba(77,166,255,0.5)
```

**Unselected mode** — dim border:
```
border: 1px solid rgba(255,255,255,0.15)
opacity: 0.6
```

- Destroyer/Cruiser: two boxes side by side, switch with 1/2 keys
- Battleship: single main gun box filling middle column, permanent select

### Left Column

- **Multiplayer**: kill feed (top) + speed (bottom)
- **Single player**: empty (top) + speed (bottom)

### Right Column

- **Multiplayer**: XP bar + player list (name + kills)
- **Single player**: XP bar + level/wave info

### New HUD Elements

- **Compass**: top-center, N/S/E/W indicators
- **Enemy bearing indicator**: right side, shows nearby enemy direction + distance

### HUD Style

- HP bar: rounded, glowing border, color transitions (green→orange→red)
- Compass: semi-transparent background, clean text
- All HUD elements `pointer-events: none` (except weapon panel)
- Enemy bearing: triangle arrows + distance numbers
- Cooldown bars: animated fill effect

## Admin Dashboard

Full-screen page with sidebar navigation.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  ← 返回     管理后台                      admin      │
├────────┬─────────────────────────────────────────────┤
│        │                                             │
│ 用户管理│    (content area switches based on          │
│        │     sidebar selection)                      │
│ 房间管理│                                             │
│        │                                             │
│ 数据统计│                                             │
│        │                                             │
│ 系统公告│                                             │
│        │                                             │
│ 服务器  │                                             │
│        │                                             │
├────────┴─────────────────────────────────────────────┤
│  narrow        wide content area                     │
│  sidebar                                             │
└──────────────────────────────────────────────────────┘
```

### 1. User Management (enhanced existing)

- Search bar for filtering by username
- Table: ID, Username, Role, Status, Game Count, Actions
- Actions dropdown: Toggle role, Ban/Unban, View stats, Delete

### 2. Room Management (new)

- Refresh button
- Table: Room ID, Mode, Level, Players, Status, Actions
- Actions: View details (player list, game duration), Kick player, Force close

### 3. Data Statistics (new)

- Summary cards: Total Users, Online Count, Active Rooms, Today's Games
- User leaderboard by game count with win rate and high score

### 4. System Announcement (new)

- Text input for announcement content
- Send button (broadcasts to all online users via WebSocket)
- History of sent announcements

### 5. Server Status (new)

- CPU, Memory, Uptime summary cards
- Active connections, active rooms, WebSocket connections count

## Backend Changes Required

### New API Endpoints

```
GET  /api/rooms                — List available rooms (any authenticated user, for MULTI_SETUP room list)
GET  /api/admin/stats          — Summary stats (total users, online, rooms, today's games)
GET  /api/admin/rooms          — List all active rooms with full details (admin only)
POST /api/admin/rooms/{id}/close   — Force close a room
POST /api/admin/rooms/{id}/kick/{uid} — Kick player from room
POST /api/admin/broadcast      — Send announcement to all online users
GET  /api/admin/server-status  — Server metrics (connections, rooms, uptime)
```

Note: `/api/rooms` and `/api/admin/rooms` are separate endpoints. The user-facing one returns limited info (mode, player count, status). The admin one returns full details (player list, game duration, etc.).

### Room Manager Extensions

- Add method to list all active rooms with metadata
- Add method to force-close a room
- Add method to kick a player from a room

### WebSocket Extensions

- New message type `system_announcement` for broadcast
- Admin broadcast endpoint sends to all connected clients

### Database Extensions

- New `announcements` table: id, content, created_at (for storing announcement history)

## Files to Create/Modify

### New Files
- `frontend/src/components/SingleSetupScreen.jsx`
- `frontend/src/components/MultiSetupScreen.jsx`
- `frontend/src/components/AdminDashboard.jsx`

### Modified Files
- `frontend/src/App.jsx` — new states, simplified MENU, navigation logic
- `frontend/src/App.css` — CSS variables, modernized styles, new component styles
- `frontend/src/components/MenuScreen.jsx` — simplified to mode selection only
- `frontend/src/components/HUD.jsx` — three-column bottom bar, compass, enemy bearing
- `frontend/src/components/MultiplayerHUD.jsx` — same HUD structure as single-player
- `frontend/src/components/AdminPanel.jsx` — replaced by AdminDashboard
- `frontend/src/api.js` — new admin API functions
- `main.py` — new admin endpoints
- `game/room_manager.py` — room listing and management methods

## Testing

- Unit tests for new admin API endpoints
- Component tests for SingleSetupScreen, MultiSetupScreen, AdminDashboard
- Verify navigation flow: MENU → SINGLE_SETUP → PLAYING, MENU → MULTI_SETUP → ROOM
- Verify admin permissions: non-admin cannot access ADMIN state
- Verify HUD weapon selection visual feedback
