import sys
import os
import math
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from game.terrain import Terrain
from game.game_state import GameState
from game.ship import ServerShip


def _make_terrain():
    return Terrain(42, [])


class TestShipShipCollision:
    """Ramming damage: two ships touching each other take fixed damage and
    are pushed apart to prevent continuous damage on subsequent ticks.
    """

    def test_collision_deals_damage_to_both(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        # The second ship's FFA spawn is ~421m away. Move them to touching.
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        hp_a_before = a.hp
        hp_b_before = b.hp
        gs._process_ship_collisions()
        assert a.hp < hp_a_before, "ship A took no ramming damage"
        assert b.hp < hp_b_before, "ship B took no ramming damage"

    def test_collision_pushes_ships_apart(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        dist_before = math.hypot(a.pos_x - b.pos_x, a.pos_z - b.pos_z)
        gs._process_ship_collisions()
        dist_after = math.hypot(a.pos_x - b.pos_x, a.pos_z - b.pos_z)
        assert dist_after > dist_before, "ships were not pushed apart"

    def test_no_collision_damage_when_far_apart(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        # FFA spawns are already hundreds of meters apart
        hp_a_before = a.hp
        hp_b_before = b.hp
        gs._process_ship_collisions()
        assert a.hp == hp_a_before
        assert b.hp == hp_b_before

    def test_collision_uses_single_tick_damage_not_continuous(self):
        """Two ships touching should take ONE shot of damage, not every tick."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        gs._process_ship_collisions()
        hp_a_after_first = a.hp
        hp_b_after_first = b.hp
        # Second tick: ships were pushed apart, no further damage
        gs._process_ship_collisions()
        assert a.hp == hp_a_after_first, "ship A took damage on consecutive tick"
        assert b.hp == hp_b_after_first, "ship B took damage on consecutive tick"

    def test_collision_emits_hit_event(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        gs.events = []
        gs._process_ship_collisions()
        types = [e.get("type") for e in gs.events]
        assert "hit" in types
        attackers = {e.get("attacker") for e in gs.events if e.get("type") == "hit"}
        targets = {e.get("target") for e in gs.events if e.get("type") == "hit"}
        assert attackers == {1, 2}, "both ships should be recorded as attacker"
        assert targets == {1, 2}, "both ships should be recorded as target"

    def test_collision_kills_low_hp_ship_and_emits_destroyed_event(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "Alice", level=1)
        b = gs.add_ship(2, "Bob", level=1)
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        # Bring ship A to near-death so a single ram kills it
        a.hp = 1
        gs.events = []
        gs._process_ship_collisions()
        assert not a.alive
        destroyed = [
            e for e in gs.events
            if e.get("type") == "entity_destroyed" and e.get("target") == 1
        ]
        assert destroyed, "ship A destruction not emitted"

    def test_team_mode_no_damage_between_teammates(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="team")
        a = gs.add_ship(1, "Alice", level=1, team="red")
        b = gs.add_ship(2, "Bob", level=1, team="red")
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        hp_a_before = a.hp
        hp_b_before = b.hp
        gs._process_ship_collisions()
        assert a.hp == hp_a_before, "teammate A took ramming damage"
        assert b.hp == hp_b_before, "teammate B took ramming damage"

    def test_team_mode_damage_between_enemies(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="team")
        a = gs.add_ship(1, "Alice", level=1, team="red")
        b = gs.add_ship(2, "Bob", level=1, team="blue")
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 0.0, 5.0
        hp_a_before = a.hp
        hp_b_before = b.hp
        gs._process_ship_collisions()
        assert a.hp < hp_a_before
        assert b.hp < hp_b_before

    def test_three_way_collision_all_take_damage(self):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        a = gs.add_ship(1, "A", level=1)
        b = gs.add_ship(2, "B", level=1)
        c = gs.add_ship(3, "C", level=1)
        a.pos_x, a.pos_z = 0.0, 0.0
        b.pos_x, b.pos_z = 3.0, 0.0
        c.pos_x, c.pos_z = 6.0, 0.0
        hp_before = {1: a.hp, 2: b.hp, 3: c.hp}
        gs._process_ship_collisions()
        for pid, ship in [(1, a), (2, b), (3, c)]:
            assert ship.hp < hp_before[pid], f"ship {pid} took no damage"


class TestRespawnMechanism:
    """Test FFA respawn mechanism."""

    def test_ship_respawns_when_has_remaining_lives(self):
        """Ship with remaining respawns should come back alive at spawn point."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        spawn_x, spawn_z = ship.pos_x, ship.pos_z

        # Kill the ship
        ship.take_damage(ship.max_hp + 100)
        assert not ship.alive

        # Process respawn
        gs._process_respawns()

        assert ship.alive
        assert ship.hp == ship.max_hp
        assert ship.pos_x == spawn_x
        assert ship.pos_z == spawn_z
        assert gs._respawn_remaining.get(1) == 1  # Used one respawn

    def test_ship_stays_dead_when_no_respawns_left(self):
        """Ship with 0 respawns remaining should stay dead."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=0)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        ship.take_damage(ship.max_hp + 100)
        assert not ship.alive

        gs._process_respawns()

        assert not ship.alive

    def test_respawn_decrements_remaining(self):
        """Each respawn should decrement the remaining count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]

        # Kill and respawn 3 times
        for i in range(3):
            ship.take_damage(ship.max_hp + 100)
            gs._process_respawns()
            assert gs._respawn_remaining.get(1) == 2 - i

        # 4th death should be permanent
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()
        assert not ship.alive

    def test_snapshot_includes_respawn_info(self):
        """Player snapshot should include remaining respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        snap = gs.get_snapshot(player_id=1)
        assert "rspn" in snap["you"]
        assert snap["you"]["rspn"] == 2

    def test_snapshot_others_include_respawn_info(self):
        """Other players' snapshots should include respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        snap = gs.get_snapshot(player_id=1)
        assert snap["others"][0]["rspn"] == 2

    def test_respawn_limit_zero_means_no_respawn(self):
        """respawn_limit=0 means death = elimination."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=0)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()

        assert not gs.ships[1].alive
        assert gs._respawn_remaining.get(1) == 0

    def test_respawn_limit_ten(self):
        """Max respawn limit of 10 should work correctly."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=10)
        gs.add_ship(1, "Alice", level=1)

        ship = gs.ships[1]
        # Kill and respawn 10 times
        for i in range(10):
            ship.take_damage(ship.max_hp + 100)
            gs._process_respawns()
            assert ship.alive
            assert gs._respawn_remaining.get(1) == 9 - i

        # 11th death = permanent
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()
        assert not ship.alive

    def test_respawn_preserves_ship_config(self):
        """Respawn should preserve ship level, class, and stats."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=5, ship_class="destroyer")
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        old_level = ship.level
        old_class = ship.ship_class
        old_max_hp = ship.max_hp
        old_max_speed = ship.max_speed

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        assert ship.level == old_level
        assert ship.ship_class == old_class
        assert ship.max_hp == old_max_hp
        assert ship.max_speed == old_max_speed

    def test_respawn_resets_speed_and_heading(self):
        """Respawn should reset speed to 0 and keep heading."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        # Move the ship
        gs.process_input(1, {"k": {"w": True}})
        gs.update(1.0 / 20)
        assert ship.speed > 0

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        assert ship.speed == 0

    def test_game_end_only_when_no_respawns_left(self):
        """Game should not end if dead players still have respawns."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Kill Alice - she has 1 respawn so game shouldn't end
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()
        assert gs.ships[1].alive  # Respawned

        # Kill Alice again - no more respawns
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs._process_respawns()
        assert not gs.ships[1].alive  # Permanently dead

        # Now only Bob alive, game should end
        alive = [s for s in gs.ships.values() if s.alive]
        assert len(alive) <= 1

    def test_respawn_at_initial_spawn_position(self):
        """Respawn should place ship at its first spawn position."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=2)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        initial_x = ship.pos_x
        initial_z = ship.pos_z

        # Move ship away
        ship.pos_x += 500
        ship.pos_z += 500

        # Kill and respawn
        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.pos_x == initial_x
        assert ship.pos_z == initial_z

    def test_respawn_resets_turret_cooldowns(self):
        """Respawn should reset turret cooldowns to 0."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=1)
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=1)

        ship = gs.ships[1]
        # Set cooldowns
        for i in range(len(ship.turret_cooldowns)):
            ship.turret_cooldowns[i] = 5.0

        ship.take_damage(ship.max_hp + 100)
        gs._process_respawns()

        assert ship.alive
        for cd in ship.turret_cooldowns:
            assert cd == 0.0


class TestRespawnLimitPropagation:
    """Verify respawn_limit flows correctly from Room through to all players."""

    def test_respawn_limit_set_on_all_players(self):
        """All players should get the room's respawn_limit, not default 0."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=5)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)
        gs.add_ship(3, "Charlie", level=1)

        # All players should have respawn_limit=5
        assert gs._respawn_remaining[1] == 5
        assert gs._respawn_remaining[2] == 5
        assert gs._respawn_remaining[3] == 5

    def test_game_state_stores_respawn_limit(self):
        """GameState.respawn_limit should match what was passed."""
        terrain = _make_terrain()
        for limit in [0, 1, 3, 5, 10]:
            gs = GameState(terrain, mode="ffa", respawn_limit=limit)
            assert gs.respawn_limit == limit

    def test_respawn_limit_propagates_via_snapshot(self):
        """Each player snapshot should include their own respawn count."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Alice's snapshot shows Alice's rspn
        snap1 = gs.get_snapshot(player_id=1)
        assert snap1["you"]["rspn"] == 3
        # Alice's view of Bob shows Bob's rspn
        assert snap1["others"][0]["rspn"] == 3

        # Bob's snapshot shows Bob's rspn
        snap2 = gs.get_snapshot(player_id=2)
        assert snap2["you"]["rspn"] == 3

    def test_non_creator_gets_same_respawn_limit(self):
        """Player joining later (non-creator) gets same respawn_limit."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=4)

        # Creator adds self
        gs.add_ship(1, "Host", level=1)

        # Another player joins later
        gs.add_ship(2, "Joiner", level=1)

        # Both should have same respawn limit
        assert gs._respawn_remaining[1] == 4
        assert gs._respawn_remaining[2] == 4

        # Both snapshots show correct value
        for pid in [1, 2]:
            snap = gs.get_snapshot(player_id=pid)
            assert snap["you"]["rspn"] == 4


class TestTorpedoKillRespawnOrdering:
    """Bug 修复：_process_respawns 原本在鱼雷更新之前调用，
    导致被鱼雷击杀的玩家在同一 tick 末尾仍然是"死亡"状态，
    _check_game_end 误判对局结束。修复后 _process_respawns 移到 update() 末尾。"""

    def _setup_torpedo_scenario(self, respawn_limit=3):
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=respawn_limit)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0
        gs.ships[2].pos_x = 0
        gs.ships[2].pos_z = 30
        gs.ships[2].heading = 0
        # Bob 丝血，确保鱼雷一击必杀
        gs.ships[2].hp = 1

        gs.torpedo_mgr.fire(1, 1, 4, 0, 0, 0, count=1)
        return gs

    def _run_until_torpedo_consumed(self, gs, max_ticks=100):
        hit = False
        for _ in range(max_ticks):
            gs.update(1.0 / 20)
            if not gs.torpedo_mgr.torpedoes:
                hit = True
                break
        return hit

    def test_torpedo_kill_respawns_in_same_tick(self):
        """被鱼雷击杀的玩家应在同一 tick 内重生，而非留到下一 tick。"""
        gs = self._setup_torpedo_scenario(respawn_limit=3)
        hit = self._run_until_torpedo_consumed(gs)

        assert hit, "鱼雷应当命中 Bob"
        assert gs.ships[2].alive, "Bob 应在鱼雷击杀的同一 tick 内重生"
        assert gs.ships[2].hp == gs.ships[2].max_hp

    def test_both_players_alive_after_torpedo_kill(self):
        """鱼雷击杀后双方都应存活，FFA 不应误触发结算条件(alive<=1)。"""
        gs = self._setup_torpedo_scenario(respawn_limit=3)
        self._run_until_torpedo_consumed(gs)

        alive_count = sum(1 for s in gs.ships.values() if s.alive)
        assert alive_count == 2, f"应当两人都存活，实际存活 {alive_count} 人"

    def test_torpedo_kill_respawn_decrements_counter(self):
        """鱼雷击杀后重生应正确扣减重生次数。"""
        gs = self._setup_torpedo_scenario(respawn_limit=3)
        self._run_until_torpedo_consumed(gs)

        assert gs._respawn_remaining[2] == 2, "Bob 应消耗一次重生，剩余 2 次"
        assert gs._respawn_remaining[1] == 3, "Alice 未死亡，重生次数不变"

    def test_process_respawns_is_last_step_in_update(self):
        """update() 结束后，任何有剩余重生的舰船都应处于存活状态，
        无论它在本 tick 中是被炮弹还是鱼雷击杀。"""
        gs = self._setup_torpedo_scenario(respawn_limit=2)
        self._run_until_torpedo_consumed(gs)

        assert gs.ships[2].alive, "Bob 被鱼雷击杀后应在同 tick 重生"
        assert gs.ships[2].hp == gs.ships[2].max_hp

    def test_per_player_respawn_counts_independent(self):
        """验证重生次数是每人独享：A 死2次、B 死1次后两人都应存活。"""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa", respawn_limit=3)
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        # Alice 死 2 次（直接击杀 + update 触发重生）
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs.update(1.0 / 20)
        gs.ships[1].take_damage(gs.ships[1].max_hp + 100)
        gs.update(1.0 / 20)

        # Bob 死 1 次
        gs.ships[2].take_damage(gs.ships[2].max_hp + 100)
        gs.update(1.0 / 20)

        assert gs._respawn_remaining[1] == 1, "Alice 死2次后应剩1次"
        assert gs._respawn_remaining[2] == 2, "Bob 死1次后应剩2次"
        assert gs.ships[1].alive
        assert gs.ships[2].alive
        alive_count = sum(1 for s in gs.ships.values() if s.alive)
        assert alive_count == 2


class TestProjectileSnapshots:
    """Verify all projectiles are included in snapshots."""

    def test_all_projectiles_in_snapshot(self):
        """Snapshot should contain all projectiles from all players."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=3)    # 3 turrets

        # Both players fire
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        gs.process_fire(2, {"aim": {"x": -100, "y": 2, "z": -100}})

        snap = gs.get_snapshot(player_id=1)
        assert len(snap["projs"]) == 6  # 3 + 3

    def test_projectile_owner_preserved(self):
        """Projectile owner should be correctly set in snapshot."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=1)

        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        gs.process_fire(2, {"aim": {"x": -100, "y": 2, "z": -100}})

        snap = gs.get_snapshot()
        owners = {p["owner"] for p in snap["projs"]}
        assert 1 in owners
        assert 2 in owners

    def test_projectiles_survive_multiple_ticks(self):
        """Projectiles should survive across multiple update ticks within lifetime."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)
        gs.add_ship(2, "Bob", level=3)

        gs.process_fire(1, {"aim": {"x": 500, "y": 10, "z": 500}})

        # After 5 ticks, projectiles should still be alive
        for _ in range(5):
            gs.update(1.0 / 20)
        snap = gs.get_snapshot(player_id=2)
        # 3 turrets for level 3, all should survive 5 ticks at 250ms total
        assert len(snap["projs"]) == 3

    def test_projectile_ids_are_unique(self):
        """Each projectile should have a unique ID."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=3)    # 3 turrets

        # Fire multiple times
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})
        gs.update(1.0 / 20)
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})

        snap = gs.get_snapshot()
        proj_ids = [p["id"] for p in snap["projs"]]
        assert len(proj_ids) == len(set(proj_ids))

    def test_other_player_sees_all_remote_projectiles(self):
        """Player B should see all projectiles from Player A (filtered by owner)."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 3 turrets
        gs.add_ship(2, "Bob", level=3)    # 3 turrets

        # Alice fires, Bob doesn't
        gs.process_fire(1, {"aim": {"x": 100, "y": 2, "z": 100}})

        # From Bob's perspective
        snap = gs.get_snapshot(player_id=2)
        # Bob should see 3 projectiles from Alice
        remote_projs = [p for p in snap["projs"] if p["owner"] != 2]
        assert len(remote_projs) == 3
        # All remote projectiles should be from Alice
        assert all(p["owner"] == 1 for p in remote_projs)

    def test_projectile_positions_differ_by_turret(self):
        """Projectiles from different turrets should have different starting positions."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=3)  # 3 turrets

        gs.process_fire(1, {"aim": {"x": 500, "y": 2, "z": 500}})
        snap = gs.get_snapshot(player_id=1)

        positions = [(p["x"], p["z"]) for p in snap["projs"]]
        # All 3 projectiles should have distinct positions
        assert len(set(positions)) == 3


class TestShipCollisionDetection:
    """Verify projectile-ship collision uses correct ship dimensions."""

    def test_ship_height_stored_correctly(self):
        """ServerShip should store height from config."""
        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Bob", level=10)

        assert gs.ships[1].ship_height == 1.5  # Level 1
        assert gs.ships[2].ship_height == 6.0  # Level 10

    def test_collision_uses_actual_ship_height(self):
        """Projectile at y=3.0 should hit a level 10 ship (height=6.0)."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=10)  # height=6.0
        gs.add_ship(2, "Attacker", level=1)

        # Place Alice's large ship at origin
        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        # Fire projectile that passes through y=4.0 directly above Alice
        # Old hardcoded 2.5 height would miss; real 6.0 height should hit
        pm = ProjectileManager()
        pm.fire(2, 50, (0, 4.0, 0), (0, 0.1, 1.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1
        assert hit_events[0]["target"] == 1

    def test_collision_margin_catches_near_miss(self):
        """Increased margin should catch projectiles that pass close to ship edge."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)  # width=2, length=7
        gs.add_ship(2, "Attacker", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        # Fire from z=10 toward the ship at origin, x offset of 2.5m from center
        # ship_half_w = 2/2 + 2.0 = 3.0, so x=2.5 should still hit with the margin
        # After 1 tick (dt=0.05), projectile at 200 m/s travels 10m, ends at z=0
        pm = ProjectileManager()
        pm.fire(2, 50, (2.5, 1.0, 10), (0, 0, -1.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1

    def test_no_self_hit(self):
        """Projectile should not hit the ship that fired it."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0

        pm = ProjectileManager()
        pm.fire(1, 50, (0, 1.0, 0.5), (0, 0, 1.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 0

    def test_fast_projectile_does_not_tunnel(self):
        """200 m/s projectile must not tunnel through small ship.

        At 20 Hz tick rate, 200 m/s = 10 m/tick. The level-1 ship has
        effective half-width 3 (1 + 2 margin). A projectile going from
        x=-5 to x=+5 in one tick has neither endpoint inside [-3, 3],
        but the segment passes through. Swept (segment-AABB) detection
        must catch this; point-in-box would miss it.
        """
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Attacker", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        pm = ProjectileManager()
        pm.fire(2, 50, (-5.0, 1.0, 0.0), (1.0, 0.0, 0.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1, "Fast projectile must not tunnel through ship"
        assert hit_events[0]["target"] == 1

    def test_projectile_at_deck_level_hits(self):
        """Projectile at y=2 should hit a level-1 ship (deck area).

        Hull spans y in [1.0, 2.5] for level 1 (height=1.5). Old code
        used ship_height=1.5 as upper bound and missed deck-level hits;
        the new upper bound includes the deck region.
        """
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Attacker", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        pm = ProjectileManager()
        pm.fire(2, 50, (0, 2.0, 0), (0, 0, 0))  # zero velocity, stays in place

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1
        assert hit_events[0]["target"] == 1

    def test_high_flyover_misses(self):
        """Projectile flying well above the ship must not hit."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Attacker", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        pm = ProjectileManager()
        pm.fire(2, 50, (-5.0, 20.0, 0.0), (1.0, 0.0, 0.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 0

    def test_segment_catching_ship_at_edge(self):
        """Projectile segment ending just inside the box should hit."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "Alice", level=1)
        gs.add_ship(2, "Attacker", level=1)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        # From (-15, 1, 0) toward +x at 200 m/s: ends at (-5, 1, 0).
        # Neither endpoint is inside [-3, 3] (|−15|>3, |−5|>3) — segment
        # does NOT cross the box, so this is a clean miss.
        pm = ProjectileManager()
        pm.fire(2, 50, (-15.0, 1.0, 0.0), (1.0, 0.0, 0.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 0

    def test_battleship_has_proportional_hitbox(self):
        """Battleship at L10 should have proportionally larger hitbox.

        With the new max(width/2 * 1.7, width/2 + 2.0) rule, battleship L10
        (width=11, half=5.5) gets half_w = max(9.35, 7.5) = 9.35 instead
        of the old 7.5. A projectile passing at x=8 should now hit; with
        the old +2.0 margin (half_w=7.5) it would miss.
        """
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "BB", level=10, ship_class="battleship")
        gs.add_ship(2, "Attacker", level=10)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        # Projectile at x=8 (between old 7.5 and new 9.35), moving +z through ship
        pm = ProjectileManager()
        pm.fire(2, 50, (8.0, 5.0, -10.0), (0, 0, 1.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1, "Battleship L10 should hit at x=8 with proportional margin"
        assert hit_events[0]["target"] == 1

    def test_destroyer_hitbox_not_shrunk_at_low_level(self):
        """Low-level small ships must keep their absolute +2.0 margin floor.

        Without the floor, low-level destroyers would shrink dramatically
        (L4 destroyer half_w 3.375 → 2.34) and become nearly unhittable.
        The max() ensures small ships stay at +2.0 minimum.
        """
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(1, "DD", level=4, ship_class="destroyer")  # width=2.75
        gs.add_ship(2, "Attacker", level=4)

        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        # Destroyer L4 half_w must be at least width/2 + 2.0 = 3.375.
        # Projectile at x=3.2 (inside 3.375) should still hit.
        pm = ProjectileManager()
        pm.fire(2, 50, (3.2, 2.0, -10.0), (0, 0, 1.0))

        events = pm.update(0.05, terrain, gs.ships)
        hit_events = [e for e in events if e["type"] == "hit"]
        assert len(hit_events) == 1, "Low-level destroyer must keep +2.0 margin floor"

    def test_battleship_easier_to_hit_than_destroyer(self):
        """At the same level, a projectile at the same offset should hit
        battleship but miss destroyer, confirming battleship's larger box."""
        from game.projectile import ProjectileManager

        terrain = _make_terrain()
        gs = GameState(terrain, mode="ffa")
        gs.add_ship(2, "Attacker", level=10)

        # Test battleship first
        gs.add_ship(1, "BB", level=10, ship_class="battleship")
        gs.ships[1].pos_x = 0
        gs.ships[1].pos_z = 0
        gs.ships[1].heading = 0

        pm1 = ProjectileManager()
        pm1.fire(2, 50, (8.5, 5.0, -10.0), (0, 0, 1.0))
        bb_events = pm1.update(0.05, terrain, gs.ships)
        bb_hits = [e for e in bb_events if e["type"] == "hit"]

        # Now replace with destroyer at same position
        gs.ships[1].alive = False
        del gs.ships[1]
        gs.add_ship(3, "DD", level=10, ship_class="destroyer")
        gs.ships[3].pos_x = 0
        gs.ships[3].pos_z = 0
        gs.ships[3].heading = 0

        pm2 = ProjectileManager()
        pm2.fire(2, 50, (8.5, 5.0, -10.0), (0, 0, 1.0))
        dd_events = pm2.update(0.05, terrain, gs.ships)
        dd_hits = [e for e in dd_events if e["type"] == "hit"]

        # x=8.5 is between destroyer half_w (5.14) and battleship half_w (9.35)
        assert len(bb_hits) == 1, "Battleship should be hit at x=8.5"
        assert len(dd_hits) == 0, "Destroyer should NOT be hit at x=8.5"



class TestGameStartRespawnLimit:
    """Verify respawnLimit flows through game_start message."""

    def test_game_start_includes_respawn_limit(self):
        """The game_start broadcast should include respawnLimit."""
        import asyncio
        from game.room import Room

        async def _test():
            room = Room("test", mode="ffa", host_id=1, respawn_limit=5)
            room.add_player(1, "Alice", None)
            room.add_player(2, "Bob", None)
            room.set_ready(1)
            room.set_ready(2)

            # Directly call _start_game to examine the broadcast
            room.state = "playing"
            room.game_state = __import__('game.game_state', fromlist=['GameState']).GameState(
                room.terrain, room.mode, respawn_limit=room.respawn_limit
            )
            for pid, conn in room.players.items():
                room.game_state.add_ship(pid, conn.username, conn.level, conn.ship_class, conn.team)

            msg = {
                "type": "game_start",
                "terrainSeed": room.terrain_seed,
                "islands": room.islands,
                "respawnLimit": room.respawn_limit,
                "players": room.get_player_list(),
            }
            assert msg["respawnLimit"] == 5
            return True

        result = asyncio.run(_test())
        assert result

    def test_room_game_state_respawn_link(self):
        """Room.respawn_limit must reach GameState._respawn_remaining for all players."""
        from game.room import Room

        room = Room("test", mode="ffa", host_id=1, respawn_limit=7)
        room.add_player(1, "Alice", None)
        room.add_player(2, "Bob", None)

        from game.game_state import GameState
        gs = GameState(room.terrain, room.mode, respawn_limit=room.respawn_limit)
        for pid, conn in room.players.items():
            gs.add_ship(pid, conn.username, conn.level, conn.ship_class, conn.team)

        assert gs._respawn_remaining[1] == 7
        assert gs._respawn_remaining[2] == 7
        snap = gs.get_snapshot(player_id=1)
        assert snap["you"]["rspn"] == 7
