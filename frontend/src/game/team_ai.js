// Team-battle AI (4v10). Two specialised subclasses of EnemyShip that reuse the
// shared mesh, turret system and fire mechanics from enemy.js and only override
// the decision core (_decideAI) plus target selection.
//
//   FriendlyAIShip  - the player's 3 wingmen (faction 'player').
//                     Roles: follow the player in a loose formation, engage the
//                     nearest threat, peel threats off the player, and kite when
//                     something gets too close.
//   EnemyTeamShip   - the 10 red-side ships (faction 'enemy').
//                     Roles: approach as a group, focus-fire the player while a
//                     few peel off to intercept wingmen, suppress by orbiting at
//                     ~100m, and reposition (fall back) when badly damaged.
//
// Friendly-fire is handled at the projectile layer (engine.js) by reading the
// shooter's `faction`; same-faction hits are ignored.

import { EnemyShip, ENEMY_ORBIT_RANGE, ENEMY_ORBIT_MIN, ENEMY_ORBIT_MAX } from './enemy.js';

// ---- Tunables --------------------------------------------------------------
const ENGAGE_RANGE = 1200;       // wingmen actively engage any foe within this
const CHASE_RANGE = 1600;        // wingmen will chase a target out to this far
const FOLLOW_MIN = 300;          // wingmen hold this distance from the player
const KITE_DIST = 150;           // wingman kites away when a foe is closer than this

const APPROACH_RANGE = 1000;     // red ships group-advance until within this of player
const DETECT_RANGE = 900;        // reds detect friendlies within this and leave patrol
const REPOSITION_HP_FRAC = 0.40; // below this hp fraction a red ship falls back
const REPOSITION_MIN = 400;      // fall-back distance band
const REPOSITION_MAX = 600;

// How many of the 10 red ships are assigned to "intercept" wingmen instead of
// focusing the player. The rest stack on the player.
const INTERCEPT_COUNT = 3;

// Read a unit's world X/Z. AI ships store position under mesh.position; the
// player adapter exposes it via {x,z} getters. Handle both.
function unitX(u) { return u.mesh ? u.mesh.position.x : u.x; }
function unitZ(u) { return u.mesh ? u.mesh.position.z : u.z; }

// Helper: 2D distance from this ship's mesh position to any unit-like object.
function dist2D(self, target) {
  const dx = unitX(target) - self.mesh.position.x;
  const dz = unitZ(target) - self.mesh.position.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Build a lightweight fire-target descriptor from any unit-like object.
// Reads position live (mesh.position for AI units, the getter for the player)
// so lead prediction in updateShip stays accurate each tick.
function toFireTarget(u) {
  if (!u) return null;
  return {
    get x() { return unitX(u); },
    get z() { return unitZ(u); },
    y: u.y ?? 0,
    heading: u.heading ?? 0,
    speed: u.speed ?? 0,
    ref: u,
  };
}

// Hull colour for wingmen so they read as allies at a glance (enemy ships are
// red 0x8b2020). A distinct blue keeps the friendly faction visually obvious
// alongside the player's grey hull.
const FRIENDLY_HULL_COLOR = 0x2a4a8a;

// ============================================================================
// Friendly wingman AI (faction 'player')
// ============================================================================
export class FriendlyAIShip extends EnemyShip {
  // scene, terrain, x, z, enemyLevel, shipType, slot (0..2), playerRef
  constructor(scene, terrain, x, z, enemyLevel, shipType, slot, playerRef) {
    super(scene, terrain, x, z, enemyLevel, shipType);
    this.faction = 'player';
    this._applyFactionColors();   // re-tint HP bar now that faction is 'player'
    this._tintHull(FRIENDLY_HULL_COLOR);  // paint the hull blue to match the friendly faction
    this.slot = slot;
    this.playerRef = playerRef;     // live reference to the player ship/unit
    this.state = 'follow';
    this._interceptTarget = null;   // red ship currently being peeled off
  }

  // enemies = array of EnemyTeamShip (alive ones). Passed in by the engine.
  setTargets(enemies) {
    this._allEnemies = enemies;
  }

  // Signature intentionally omits the unused base-class args (dt, playerPos,
  // dist, dx, dz); JS ignores extra arguments, and FriendlyAIShip derives
  // everything from this.playerRef / this._allEnemies.
  _decideAI() {
    const p = this.playerRef;
    if (!p) {
      this.state = 'idle';
      return { targetHeading: this.heading, targetSpeed: 0 };
    }

    // --- Target selection ---------------------------------------------------
    // Score every alive enemy and pick the best: heavily prefer threats that are
    // attacking the player (peel them off) or attacking us, then nearest, with a
    // bonus for low-HP targets we can finish. This makes wingmen proactive
    // defenders rather than passive followers.
    const enemies = (this._allEnemies || []).filter(e => e.alive);
    let nearestD = Infinity;
    let target = null;
    let bestScore = -Infinity;
    for (const e of enemies) {
      const d = dist2D(this, e);
      if (d < nearestD) nearestD = d;
      if (d > CHASE_RANGE) continue;
      let score = 1000 - d;
      // Peel priority: enemy gunning for the player, or for us.
      if (e.target && e.target.ref === p) score += 400;
      if (e.target && e.target.ref === this) score += 300;
      // Finishing blows on damaged foes.
      if (e.hp != null && e.maxHp) score += (1 - e.hp / e.maxHp) * 250;
      if (score > bestScore) { bestScore = score; target = e; }
    }
    this._interceptTarget = target;
    this.fireTarget = toFireTarget(target);   // shoot at our chosen foe

    // --- State machine -----------------------------------------------------
    let targetHeading;
    let targetSpeed;

    if (target && nearestD < KITE_DIST) {
      // Too close to a foe: back off directly away from it.
      this.state = 'kite';
      const ax = this.mesh.position.x - unitX(target);
      const az = this.mesh.position.z - unitZ(target);
      targetHeading = Math.atan2(ax, az);
      targetSpeed = this.maxSpeed * 0.7;
    } else if (target && nearestD < ENGAGE_RANGE) {
      // Close enough to fight: move toward the target but keep standoff.
      this.state = 'engage';
      const tdx = unitX(target) - this.mesh.position.x;
      const tdz = unitZ(target) - this.mesh.position.z;
      const td = Math.sqrt(tdx * tdx + tdz * tdz) || 1;
      if (td > 250) {
        // Close the gap.
        targetHeading = Math.atan2(tdx, tdz);
        targetSpeed = this.maxSpeed * 0.85;
      } else {
        // Within engagement band: strafe / hold range by orbiting the target.
        const nx = tdx / td;
        const nz = tdz / td;
        const dir = this.slot % 2 === 0 ? 1 : -1; // alternate orbit direction per slot
        let tx = -nz * dir;
        let tz = nx * dir;
        if (td > 230) { tx += nx * 0.3; tz += nz * 0.3; }
        else if (td < 170) { tx -= nx * 0.3; tz -= nz * 0.3; }
        targetHeading = Math.atan2(tx, tz);
        targetSpeed = this.maxSpeed * 0.55;
      }
    } else if (target) {
      // Enemy in sight but out of engagement band: close the distance.
      this.state = 'engage';
      const tdx = unitX(target) - this.mesh.position.x;
      const tdz = unitZ(target) - this.mesh.position.z;
      targetHeading = Math.atan2(tdx, tdz);
      targetSpeed = this.maxSpeed * 0.85;
    } else {
      // No immediate threat: rejoin formation around the player.
      this.state = 'follow';
      // Formation slot: spread wingmen 120deg apart at FOLLOW_MIN..MAX radius.
      const angle = (this.slot / 3) * Math.PI * 2 + Math.PI; // behind/flanks of player
      const wantX = unitX(p) + Math.cos(angle) * FOLLOW_MIN;
      const wantZ = unitZ(p) + Math.sin(angle) * FOLLOW_MIN;
      const fdx = wantX - this.mesh.position.x;
      const fdz = wantZ - this.mesh.position.z;
      const fd = Math.sqrt(fdx * fdx + fdz * fdz);
      targetHeading = Math.atan2(fdx, fdz);
      targetSpeed = fd > 40 ? this.maxSpeed * 0.6 : this.maxSpeed * 0.2;
    }

    return { targetHeading, targetSpeed };
  }
}

// ============================================================================
// Enemy team AI (faction 'enemy') - 10 coordinated red ships vs the player team
// ============================================================================
export class EnemyTeamShip extends EnemyShip {
  // scene, terrain, x, z, enemyLevel, shipType, index (0..9), playerRef
  constructor(scene, terrain, x, z, enemyLevel, shipType, index, playerRef) {
    super(scene, terrain, x, z, enemyLevel, shipType);
    this.faction = 'enemy';
    this.index = index;
    this.playerRef = playerRef;
    this.state = 'patrol';
    this.target = null;            // current fire target (live ref kept for wingmen)
    this.orbitDirection = index % 2 === 0 ? 1 : -1;
    // A few ships are designated interceptors; the rest focus the player.
    this.role = index < INTERCEPT_COUNT ? 'intercept' : 'focus';
    this._repositionUntil = 0;     // timestamp gate for fall-back behaviour
    // Patrol area (assigned by the engine). Reds loiter here, patrolling, until
    // they detect a friendly within DETECT_RANGE, then switch to combat states.
    this._patrolCx = x;
    this._patrolCz = z;
    this._patrolRadius = 750;
    this._patrolTargetX = x;
    this._patrolTargetZ = z;
    this._pickPatrolAreaTarget();
  }

  // friendlies = all player-side units the red team can shoot at (player + wingmen).
  setTargets(friendlies) {
    this._allFriendlies = friendlies;
  }

  // Define the patrol area (centred at cx,cz with given radius).
  setPatrolArea(cx, cz, radius) {
    this._patrolCx = cx;
    this._patrolCz = cz;
    this._patrolRadius = radius;
    this._pickPatrolAreaTarget();
  }

  // Pick a random point inside the patrol area to wander toward.
  _pickPatrolAreaTarget() {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * this._patrolRadius;
    this._patrolTargetX = this._patrolCx + Math.cos(a) * r;
    this._patrolTargetZ = this._patrolCz + Math.sin(a) * r;
  }

  _decideAI(_dt, _playerPos, dist, dx, dz) {
    const p = this.playerRef;
    if (!p) {
      this.state = 'idle';
      return { targetHeading: this.heading, targetSpeed: 0 };
    }

    // --- Target selection (coordination) ----------------------------------
    // --- Target selection (dynamic, spreads fire across the player team) ----
    // Instead of hard-assigning all focus ships to the player, each red scores
    // every alive friendly and picks the best. The player gets a bias (so most
    // pressure still falls on the human), but wingmen that are close, low-HP,
    // or actively shooting get picked too - so the 10 reds don't all tunnel the
    // player and will actually fight the wingmen.
    const friendlies = (this._allFriendlies || []).filter(u => u.alive);
    let target = p;
    if (friendlies.length > 0) {
      let bestScore = -Infinity;
      for (const f of friendlies) {
        const d = dist2D(this, f);
        if (d > 1400) continue;                 // ignore far-away friendlies
        let score = 1000 - d;                   // closer = better
        if (f === p) score += this.role === 'focus' ? 350 : 0;  // player bias
        else score += this.role === 'intercept' ? 250 : 0;      // wingman bias for interceptors
        // Prefer low-HP targets (finishing blows) and those already shooting us.
        if (f.hp != null && f.maxHp) score += (1 - f.hp / f.maxHp) * 200;
        if (f._interceptTarget && f._interceptTarget.ref === this) score += 300;
        if (score > bestScore) { bestScore = score; target = f; }
      }
    }

    this.target = target ? toFireTarget(target) : null;
    this.fireTarget = this.target;

    // --- Patrol gate -------------------------------------------------------
    // Until a friendly comes within DETECT_RANGE, stay in the assigned patrol
    // area wandering on a loose watch. No firing, no chasing - just警戒.
    const nearestFriendlyD = target ? dist2D(this, target) : Infinity;
    if (nearestFriendlyD > DETECT_RANGE) {
      this.state = 'patrol';
      this.fireTarget = null;            // don't shoot while patrolling
      const ptDx = this._patrolTargetX - this.mesh.position.x;
      const ptDz = this._patrolTargetZ - this.mesh.position.z;
      const ptDist = Math.sqrt(ptDx * ptDx + ptDz * ptDz);
      if (ptDist < 60) this._pickPatrolAreaTarget();   // reached waypoint, pick next
      const targetHeading = Math.atan2(ptDx, ptDz);
      const targetSpeed = this.maxSpeed * 0.35;        // leisurely patrol speed
      return { targetHeading, targetSpeed };
    }

    // Distances to both the player and our chosen target.
    const tdx = target ? (unitX(target) - this.mesh.position.x) : dx;
    const tdz = target ? (unitZ(target) - this.mesh.position.z) : dz;
    const td = Math.sqrt(tdx * tdx + tdz * tdz) || 1;

    // --- Reposition (fall back when low) -----------------------------------
    const lowHp = this.hp / this.maxHp < REPOSITION_HP_FRAC;
    if (lowHp && this._repositionUntil <= 0) {
      this._repositionUntil = performance.now() + 6000; // back off for 6s
    }
    if (this._repositionUntil > 0 && performance.now() < this._repositionUntil) {
      // Sail directly away from the player toward the stand-off band.
      this.state = 'reposition';
      const ax = this.mesh.position.x - unitX(p);
      const az = this.mesh.position.z - unitZ(p);
      const ad = Math.sqrt(ax * ax + az * az) || 1;
      const wantR = (REPOSITION_MIN + REPOSITION_MAX) / 2;
      const nx = ax / ad;
      const nz = az / ad;
      // Steer outward if too close, hold if at band.
      const dir = ad < wantR ? 1 : 0;
      let tx = nx * dir;
      let tz = nz * dir;
      // Keep some lateral motion so it doesn't steam in a dead straight line.
      tx += -nz * 0.3 * this.orbitDirection;
      tz += nx * 0.3 * this.orbitDirection;
      const targetHeading = Math.atan2(tx, tz);
      const targetSpeed = this.maxSpeed * 0.7;
      return { targetHeading, targetSpeed };
    }
    if (this._repositionUntil > 0 && performance.now() >= this._repositionUntil) {
      this._repositionUntil = 0; // recovered, rejoin
    }

    // --- Suppression orbit (close range) -----------------------------------
    if (td < ENEMY_ORBIT_RANGE) {
      this.state = 'suppress';
      const nx = tdx / td;
      const nz = tdz / td;
      // Distribute orbit angle by index so 10 ships spread around the ring
      // instead of clumping (the key coordination for "team" feel).
      const indexBias = (this.index / 10) * Math.PI * 2;
      let ox = -nz * this.orbitDirection;
      let oz = nx * this.orbitDirection;
      // Blend a small index-offset radial nudge to spread the ring.
      ox += Math.cos(indexBias) * 0.15;
      oz += Math.sin(indexBias) * 0.15;
      if (td > ENEMY_ORBIT_MAX) { ox += nx * 0.4; oz += nz * 0.4; }
      else if (td < ENEMY_ORBIT_MIN) { ox -= nx * 0.4; oz -= nz * 0.4; }
      const targetHeading = Math.atan2(ox, oz);
      const targetSpeed = this.maxSpeed * 0.5;
      return { targetHeading, targetSpeed };
    }

    // --- Approach / focus-fire --------------------------------------------
    if (dist > APPROACH_RANGE) {
      // Still far from the player: advance as a group.
      this.state = 'approach';
      const targetHeading = Math.atan2(dx, dz);
      const targetSpeed = this.maxSpeed * 0.7;
      return { targetHeading, targetSpeed };
    }

    // Mid-range: chase the chosen target and shoot.
    this.state = 'focus_fire';
    const targetHeading = Math.atan2(tdx, tdz);
    const targetSpeed = this.maxSpeed * 0.7;
    return { targetHeading, targetSpeed };
  }
}

// Convenience: select a ship type for red ships so the 10 aren't all identical.
// At level 4+ all three classes are available - pick uniformly at random for a
// mixed fleet. Below level 4 no class is selected (plain hull).
export function pickTeamShipType(level) {
  if (level >= 4) {
    const types = ['destroyer', 'cruiser', 'battleship'];
    return types[Math.floor(Math.random() * types.length)];
  }
  return null;
}
