import asyncio
import time
from enum import Enum
from collections import deque
from game.config import (
    DT, TICK_RATE, COUNTDOWN_SECONDS, ROOM_CLEANUP_DELAY,
    RECONNECT_GRACE_PERIOD, MODE_CONFIG,
)
from game.terrain import Terrain, generate_islands
from game.game_state import GameState
from game.protocol import encode


class RoomState(Enum):
    WAITING = "waiting"
    COUNTDOWN = "countdown"
    PLAYING = "playing"
    ENDED = "ended"


class PlayerConn:
    def __init__(self, player_id, username, ws):
        self.player_id = player_id
        self.username = username
        self.ws = ws
        self.ready = False
        self.connected = True
        self.disconnect_time = None
        self.level = 1
        self.ship_class = None
        self.team = None
        self.input_seq = 0
        self.last_ping_ts = 0
        self.ping = 0
        self.last_client_ts = 0

    def to_info(self):
        return {
            "id": self.player_id,
            "name": self.username,
            "ready": self.ready,
            "team": self.team,
            "connected": self.connected,
            "level": self.level,
            "shipClass": self.ship_class,
        }

    def to_lobby_info(self):
        """Info sent during lobby/room phase (includes room-level context)."""
        return {
            "id": self.player_id,
            "name": self.username,
            "ready": self.ready,
            "team": self.team,
            "connected": self.connected,
            "shipClass": self.ship_class,
        }


class Room:
    def __init__(self, room_id, mode="ffa", host_id=None, room_level=1, respawn_limit=0):
        self.room_id = room_id
        self.mode = mode
        self.host_id = host_id
        self.room_level = room_level
        self.respawn_limit = respawn_limit
        self.state = RoomState.WAITING
        self.players = {}
        self.terrain_seed = int(time.time() * 1000) % (2**31)
        self.islands = generate_islands(self.terrain_seed)
        self.terrain = Terrain(self.terrain_seed, self.islands)
        self.game_state = None
        self._input_queue = deque()
        self._tick_task = None
        self._countdown_task = None
        self._tick_count = 0

    def add_player(self, player_id, username, ws, level=1, ship_class=None):
        conn = PlayerConn(player_id, username, ws)
        # All players use the room's level (set by host)
        conn.level = self.room_level
        conn.ship_class = ship_class
        self.players[player_id] = conn
        if self.host_id is None:
            self.host_id = player_id

    def remove_player(self, player_id):
        conn = self.players.get(player_id)
        if conn:
            conn.connected = False
            conn.disconnect_time = time.monotonic()

    def reconnect_player(self, player_id, ws):
        conn = self.players.get(player_id)
        if conn:
            conn.ws = ws
            conn.connected = True
            conn.disconnect_time = None

    def set_ready(self, player_id, ready=True):
        conn = self.players.get(player_id)
        if conn:
            conn.ready = ready

    def get_player_list(self):
        return [p.to_info() for p in self.players.values()]

    def get_lobby_player_list(self):
        return [p.to_lobby_info() for p in self.players.values()]

    def get_room_info(self):
        return {
            "roomId": self.room_id,
            "mode": self.mode,
            "roomLevel": self.room_level,
            "respawnLimit": self.respawn_limit,
            "players": self.get_lobby_player_list(),
            "terrainSeed": self.terrain_seed,
            "islands": self.islands,
        }

    def _connected_count(self):
        return sum(1 for p in self.players.values() if p.connected)

    def _ready_count(self):
        return sum(1 for p in self.players.values() if p.ready and p.connected)

    async def start_countdown(self):
        if self.state != RoomState.WAITING:
            return
        mc = MODE_CONFIG.get(self.mode, MODE_CONFIG["ffa"])
        connected = self._connected_count()
        if connected < mc["min"]:
            return
        # All connected players must be ready
        all_ready = all(p.ready for p in self.players.values() if p.connected)
        if not all_ready:
            return

        self.state = RoomState.COUNTDOWN
        for remaining in range(COUNTDOWN_SECONDS, 0, -1):
            if self.state != RoomState.COUNTDOWN:
                return
            await self._broadcast({
                "type": "countdown",
                "seconds": remaining,
            })
            await asyncio.sleep(1.0)

        await self._start_game()

    async def _start_game(self):
        self.state = RoomState.PLAYING

        # Assign teams for team modes
        if self.mode == "team":
            connected = [p for p in self.players.values() if p.connected]
            for i, conn in enumerate(connected):
                conn.team = "red" if i < len(connected) // 2 else "blue"
        elif self.mode == "ffa":
            for conn in self.players.values():
                conn.team = None

        self.game_state = GameState(self.terrain, self.mode, respawn_limit=self.respawn_limit)

        for pid, conn in self.players.items():
            if conn.connected:
                self.game_state.add_ship(
                    pid, conn.username, conn.level,
                    conn.ship_class, conn.team
                )

        # Send game_start to all
        await self._broadcast({
            "type": "game_start",
            "terrainSeed": self.terrain_seed,
            "islands": self.islands,
            "respawnLimit": self.respawn_limit,
            "players": self.get_player_list(),
        })

        self._tick_task = asyncio.create_task(self._tick_loop())

    async def _tick_loop(self):
        try:
            while self.state == RoomState.PLAYING:
                start = time.monotonic()

                # Process input queue
                while self._input_queue:
                    pid, msg = self._input_queue.popleft()
                    msg_type = msg.get("type", "")
                    if msg_type == "input":
                        self.game_state.process_input(pid, msg)
                        conn = self.players.get(pid)
                        if conn:
                            conn.input_seq = msg.get("seq", 0)
                    elif msg_type == "fire":
                        self.game_state.process_fire(pid, msg)
                    elif msg_type == "fire_torpedo":
                        self.game_state.process_torpedo(pid, msg)
                    elif msg_type == "activate_skill":
                        self.game_state.process_skill(pid, msg)

                self.game_state.update(DT)
                self._tick_count += 1

                # Broadcast per-player snapshots
                for pid, conn in self.players.items():
                    if not conn.connected:
                        continue
                    snap = self.game_state.get_snapshot(pid)
                    snap["lpi"] = conn.input_seq
                    snap["cts"] = conn.last_client_ts
                    try:
                        await conn.ws.send_bytes(encode(snap))
                    except Exception:
                        conn.connected = False
                        conn.disconnect_time = time.monotonic()

                # Check game end conditions
                if self._check_game_end():
                    await self._end_game()
                    return

                # Send elimination notice to newly dead players with no respawns
                respawned_players = set()
                for evt in self.game_state.events:
                    if evt.get("type") == "player_respawned":
                        respawned_players.add(evt.get("target"))
                for evt in self.game_state.events:
                    if evt.get("type") == "entity_destroyed":
                        target = evt.get("target")
                        if target in self.players and target not in respawned_players:
                            await self.send_to(target, {
                                "type": "player_eliminated",
                            })

                # Clean up disconnected players past grace period
                now = time.monotonic()
                for pid, conn in list(self.players.items()):
                    if not conn.connected and conn.disconnect_time:
                        if now - conn.disconnect_time > RECONNECT_GRACE_PERIOD:
                            self.players.pop(pid, None)

                elapsed = time.monotonic() - start
                sleep_time = (1.0 / TICK_RATE) - elapsed
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
        except asyncio.CancelledError:
            pass

    def _check_game_end(self):
        if not self.game_state:
            return False
        alive = [s for s in self.game_state.ships.values() if s.alive]
        connected = self._connected_count()

        if self.mode == "ffa":
            return len(alive) <= 1 and connected > 1
        elif self.mode == "team":
            alive_teams = set(s.team for s in alive if s.team)
            return len(alive_teams) <= 1 and connected > 1
        elif self.mode == "pve":
            return len(alive) == 0
        return False

    async def _end_game(self):
        self.state = RoomState.ENDED
        self._end_time = time.monotonic()
        if self._tick_task:
            self._tick_task.cancel()
            self._tick_task = None

        results = []
        for pid, ship in self.game_state.ships.items():
            results.append({
                "id": pid,
                "name": ship.username,
                "alive": ship.alive,
                "team": ship.team,
            })

        await self._broadcast({
            "type": "game_end",
            "results": results,
        })

        # Write results to DB
        try:
            from database import (
                create_multiplayer_game, finish_multiplayer_game,
                add_multiplayer_game_player, get_or_create_player,
            )
            duration = int(self._tick_count / TICK_RATE) if self._tick_count else 0
            result_str = "completed"
            mg_id = await create_multiplayer_game(self.mode, self.room_id)

            for r in results:
                try:
                    pid = await get_or_create_player(r["name"])
                    await add_multiplayer_game_player(
                        mg_id, pid, team=r.get("team"),
                    )
                except Exception:
                    pass

            await finish_multiplayer_game(mg_id, duration, result_str)
        except Exception as e:
            print(f"DB write error: {e}")

    async def _broadcast_room_update(self):
        await self._broadcast({
            "type": "room_update",
            "mode": self.mode,
            "roomLevel": self.room_level,
            "respawnLimit": self.respawn_limit,
            "players": self.get_lobby_player_list(),
        })

    async def _broadcast(self, msg):
        data = encode(msg)
        for conn in self.players.values():
            if conn.connected:
                try:
                    await conn.ws.send_bytes(data)
                except Exception:
                    conn.connected = False
                    conn.disconnect_time = time.monotonic()

    async def send_to(self, player_id, msg):
        conn = self.players.get(player_id)
        if conn and conn.connected:
            try:
                await conn.ws.send_bytes(encode(msg))
            except Exception:
                conn.connected = False
                conn.disconnect_time = time.monotonic()

    def queue_input(self, player_id, msg):
        if self.state == RoomState.PLAYING and self.game_state:
            self._input_queue.append((player_id, msg))

    async def cleanup(self):
        if self._tick_task:
            self._tick_task.cancel()
            self._tick_task = None
        if self._countdown_task:
            self._countdown_task.cancel()
            self._countdown_task = None
        self.players.clear()
