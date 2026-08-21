import * as THREE from 'three';
import { applyHalfLambert } from './scene.js';
import { CARRIER, getAirGroupConfig } from './config.js';
import { GRAVITY } from './config.js';

// A carrier fields TWO independent squadrons that fly at the same time:
//   - 鱼雷机 (torpedo bombers): drop torpedoes.
//   - 轰炸机 (dive bombers): drop bombs on a ballistic arc.
// Each squadron is its OWN moving entity with its own ammo pool + cooldown.
// The player flies the ACTIVE squadron directly (WASD); the other squadron
// keeps cruising straight (or runs its own auto-pilot when engaged). Pressing
// Tab (handled by the engine via CarrierAirWing.switchActive) hands camera +
// control to the other squadron.
//
// A Squadron therefore represents a SINGLE air group: it has exactly one type
// ('torpedo' | 'bomber') and only that type's ammo/cooldown. The CarrierAirWing
// class (below) owns the pair and tracks which is active.
//
// Movement model: aircraft steer directly (no drift). `heading` is the nose
// direction; A/D turn it at aircraftTurnRate, W/S scale speed. Altitude is
// fixed. Turning banks the hull (roll) proportional to rudder input for feel.
export class Squadron {
  // type: 'torpedo' (鱼雷机) | 'bomber' (轰炸机).
  constructor(scene, originX, originZ, owner = 'player', level = 4, type = 'torpedo') {
    this.scene = scene;
    this.owner = owner;
    this.level = level;
    this.type = type;            // single air-group type
    this.heading = 0;
    this.speed = CARRIER.aircraftSpeed;
    this.position = new THREE.Vector3(originX, CARRIER.aircraftAltitude, originZ);
    this.altitude = CARRIER.aircraftAltitude;   // tracked height, clamped to [min,max]
    this.pitch = 0;                             // nose pitch (rad): +down(dive)/-up(climb)
    this.alive = true;
    // Set when AA fire (not a crash) destroyed the squadron — the solo engine
    // auto re-launches shot-down squadrons from the carrier on a timer
    // (CARRIER.squadronRespawnDelay); crashed ones still need a manual T.
    this.shotDown = false;

    // Survivability: HP pool depleted by AA fire; a terrain/water crash is
    // instant death (see update()).
    this.hp = CARRIER.aircraftHp;
    this.maxHp = CARRIER.aircraftHp;

    // Single per-type ammo pool. Torpedo bombers carry torpedoes; dive bombers
    // carry bombs. Salvo/cd/dmg come from the level's air-group table for THIS
    // type only.
    const g = getAirGroupConfig(level)[type];
    this.ammo = g.ammo;
    this.maxAmmo = g.ammo;
    this.cd = 0;

    // Banking visual state (roll, rad).
    this._bank = 0;
    this._lastTurnInput = 0;

    // Auto-pilot state. When enabled this squadron flies itself: finds the
    // nearest enemy, drops on it, and returns to the carrier to re-arm.
    this.autoPilot = false;
    this._rearmAccum = 0;
    this._autoTarget = null;
    this._autoPhase = 'idle';
    // Loiter direction around the carrier during the re-arm phase (the two
    // air groups orbit opposite ways so they don't stack on one circle).
    this._orbitDir = this.type === 'bomber' ? -1 : 1;
    // Per-type drop request surfaced to the engine (set during auto-pilot).
    this.autoDrop = false;

    this._buildMesh();
    this.scene.add(this.mesh);
    this._buildGuides();
  }

  // Convenience: the ammo "pool" shaped like the old {ammo,maxAmmo,cd} object,
  // for HUD consumers that read squadron.torpedo / squadron.bomber.
  get pool() { return { ammo: this.ammo, maxAmmo: this.maxAmmo, cd: this.cd }; }

  _buildMesh() {
    this.mesh = new THREE.Group();

    // Hull colour by type so the two squadrons read as distinct units on screen:
    // torpedo bombers stay blue (player faction), dive bombers are a warm gold.
    const color = this._hullColor();
    const planeMat = new THREE.MeshPhongMaterial({ color });
    applyHalfLambert(planeMat);

    // Lead aircraft, wrapped in a pivot so we can roll (bank) it independently.
    this._leadPivot = new THREE.Group();
    const lead = this._makeAircraft(color);
    this._leadPivot.add(lead);
    this.mesh.add(this._leadPivot);

    // Wingmen in a V behind the lead, each with its own bank pivot.
    const size = CARRIER.squadronSize;
    this._wingPivots = [];
    for (let i = 1; i < size; i++) {
      const pivot = new THREE.Group();
      const wing = this._makeAircraft(color);
      const side = (i % 2 === 1) ? 1 : -1;
      const row = Math.ceil(i / 2);
      wing.position.set(side * row * 4, 0, -row * 5);
      pivot.add(wing);
      this.mesh.add(pivot);
      this._wingPivots.push({ pivot, bank: 0 });
    }

    // Shadow marker on the water.
    const shadowShape = new THREE.Shape();
    shadowShape.moveTo(0, -2);
    shadowShape.lineTo(2, 2);
    shadowShape.lineTo(-2, 2);
    shadowShape.closePath();
    const shadow = new THREE.Mesh(
      new THREE.ShapeGeometry(shadowShape),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -CARRIER.aircraftAltitude + 0.5;
    this.mesh.add(shadow);
    this._shadow = shadow;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;
  }

  _hullColor() {
    if (this.owner !== 'player') return 0xff4444;     // enemy faction
    return this.type === 'bomber' ? 0xffc14a : 0x4488ff;
  }

  _makeAircraft(color) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color });
    applyHalfLambert(bodyMat);
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 3, 6), bodyMat);
    fus.rotation.x = Math.PI / 2;
    g.add(fus);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(4, 0.1, 1), bodyMat);
    g.add(wings);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.5), bodyMat);
    tail.position.z = -1.3;
    g.add(tail);
    return g;
  }

  // Aim-assist guides (drawn on the water, below the squadron). A torpedo
  // guide is a straight projected track ahead along heading; a bomb guide is a
  // drop reticle (ring + crosshair) placed at the PREDICTED ballistic impact
  // point (not directly below the plane). Only the squadron's own-type guide is
  // shown. `show` lets the engine hide a non-active squadron's guide.
  // PLAYER-OWNED squadrons only: enemy/remote squadrons never show aim guides —
  // nothing drives updateGuides for them, so their reticle would sit stuck at
  // the world origin (right on the player's spawn point) instead.
  _buildGuides() {
    if (this.owner !== 'player') return;
    if (this.type === 'torpedo') {
      const torpMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });
      const torpGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
      this._torpGuide = new THREE.Line(torpGeo, torpMat);
      this._torpGuide.frustumCulled = false;
      this.scene.add(this._torpGuide);
    } else {
      // Bomb drop reticle: a bright outer ring + pulsing inner ring + crosshair
      // + center dot, all on the water, positioned at the predicted impact point.
      this._bombReticle = new THREE.Group();
      const ringOuter = new THREE.Mesh(
        new THREE.RingGeometry(8, 9.5, 40),
        new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
      );
      ringOuter.rotation.x = -Math.PI / 2;
      this._bombReticle.add(ringOuter);
      this._bombRingOuter = ringOuter;
      // Pulsing inner ring (scale animated in updateGuides).
      const ringInner = new THREE.Mesh(
        new THREE.RingGeometry(2.6, 3.2, 32),
        new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      ringInner.rotation.x = -Math.PI / 2;
      this._bombReticle.add(ringInner);
      this._bombRingInner = ringInner;
      // Crosshair bars.
      const crossMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      const barH = new THREE.Mesh(new THREE.PlaneGeometry(18, 0.9), crossMat);
      barH.rotation.x = -Math.PI / 2;
      this._bombReticle.add(barH);
      const barV = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 18), crossMat);
      barV.rotation.x = -Math.PI / 2;
      this._bombReticle.add(barV);
      // Center dot.
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(1.1, 20),
        new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 1.0, side: THREE.DoubleSide, depthWrite: false })
      );
      dot.rotation.x = -Math.PI / 2;
      this._bombReticle.add(dot);
      this.scene.add(this._bombReticle);
    }
  }

  // Refresh the aim guide. `show` hides it (e.g. non-active squadron). Uses a
  // wall-clock so the pulse animates even while the plane sits still.
  updateGuides(show) {
    // Guides were never built (non-player-owned squadron) — nothing to drive.
    if (!this._torpGuide && !this._bombReticle) return;
    if (!this.alive || !show) {
      if (this._torpGuide) this._torpGuide.visible = false;
      if (this._bombReticle) this._bombReticle.visible = false;
      return;
    }
    const onWater = (x, z) => new THREE.Vector3(x, 1.5, z);
    if (this.type === 'torpedo') {
      const len = CARRIER.torpedoGuideRange;
      const sx = this.position.x, sz = this.position.z;
      const ex = sx + Math.sin(this.heading) * len;
      const ez = sz + Math.cos(this.heading) * len;
      this._torpGuide.geometry.setFromPoints([onWater(sx, sz), onWater(ex, ez)]);
      this._torpGuide.visible = true;
    } else {
      // Place the reticle at the predicted ballistic impact point.
      const impact = this._predictBombImpact();
      this._bombReticle.position.set(impact.x, 1.5, impact.z);
      // Pulse the inner ring to draw the eye.
      const t = (performance.now() % 1000) / 1000;       // 0..1, 1s cycle
      const pulse = 0.8 + 0.4 * Math.sin(t * Math.PI * 2);
      this._bombRingInner.scale.set(pulse, pulse, pulse);
      this._bombRingOuter.material.opacity = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
      this._bombReticle.visible = true;
    }
  }

  // Numerically integrate a bomb's trajectory (same physics as projectile.js:
  // gravity + multiplicative air drag) from the squadron's current position and
  // forward ground speed, until it hits the water (y<=0). Returns the impact
  // {x, z} plus horizTime — the drag-decayed flight time that converts an
  // initial horizontal velocity into its landing offset (dividing a desired
  // offset by it yields the velocity adjustment that realises it). Used by the
  // drop reticle (where bombs WILL land) and by dropBomb (aiming the scatter).
  _simulateBomb() {
    const drag = CARRIER.bombDrag;
    const hStep = 0.02;
    let x = this.position.x;
    let y = this.position.y;
    let z = this.position.z;
    // Initial velocity mirrors dropBomb(): forward ground speed + a small
    // downward kick (see dropBomb for the exact composition).
    const fwd = this.speed;
    const vy0 = CARRIER.bombDropVy;
    let vx = Math.sin(this.heading) * fwd;
    let vz = Math.cos(this.heading) * fwd;
    let vy = -vy0;
    let p = 1.0;          // drag decay product for horizontal velocity
    let horizTime = 0.0;
    for (let i = 0; i < 600 && y > 0; i++) {
      const d = 1.0 - drag * hStep;
      vx *= d; vy *= d; vz *= d;
      p *= d;
      vy -= GRAVITY * hStep;
      x += vx * hStep;
      y += vy * hStep;
      z += vz * hStep;
      horizTime += p * hStep;
    }
    return { x, z, horizTime };
  }

  _predictBombImpact() {
    const s = this._simulateBomb();
    return { x: s.x, z: s.z };
  }

  // Drive the lead aircraft. keys: {w,a,s,d}. dt seconds. ctx is optional
  // { carrierPos: {x,z}, enemies: [...] } — needed for re-arm + auto-pilot.
  // When autoPilot is on the keys are overridden and `autoDrop` is set.
  update(dt, keys, ctx = {}) {
    if (!this.alive) return;

    let eff = keys;
    this.autoDrop = false;
    if (this.autoPilot) {
      eff = this._autoPilotKeys(dt, ctx) || { w: true, a: false, s: false, d: false };
    }

    let turnInput = 0;
    if (eff.a) { this.heading += CARRIER.aircraftTurnRate * dt; turnInput += 1; }
    if (eff.d) { this.heading -= CARRIER.aircraftTurnRate * dt; turnInput -= 1; }
    const bankTarget = -turnInput * CARRIER.bankMaxAngle;
    const bankStep = CARRIER.bankRate * dt;
    if (this._bank < bankTarget) this._bank = Math.min(bankTarget, this._bank + bankStep);
    else this._bank = Math.max(bankTarget, this._bank - bankStep);
    this._lastTurnInput = turnInput;
    this._leadPivot.rotation.z = this._bank;
    for (let i = 0; i < this._wingPivots.length; i++) {
      const w = this._wingPivots[i];
      const lag = 1 / (1 + (i + 1) * 0.6);
      const t = this._bank * lag + bankTarget * (1 - lag) * 0.5;
      if (w.bank < t) w.bank = Math.min(t, w.bank + bankStep * lag);
      else w.bank = Math.max(t, w.bank - bankStep * lag);
      w.pivot.rotation.z = w.bank;
    }

    // Altitude control: W dives (pitch down + lose altitude), S climbs (pitch up
    // + gain altitude). Replaces the old W/S speed throttle — speed is now a
    // steady cruise. Pitch eases toward the commanded tilt so the nose reads as
    // pitching rather than snapping. Auto-pilot keeps level flight.
    let pitchCmd = 0;
    if (!this.autoPilot) {
      if (eff.w) pitchCmd += CARRIER.aircraftPitchMax;   // dive
      if (eff.s) pitchCmd -= CARRIER.aircraftPitchMax;   // climb
    }
    const pitchStep = CARRIER.aircraftPitchRate * dt;
    if (this.pitch < pitchCmd) this.pitch = Math.min(pitchCmd, this.pitch + pitchStep);
    else this.pitch = Math.max(pitchCmd, this.pitch - pitchStep);
    this._leadPivot.rotation.x = this.pitch;
    for (let i = 0; i < this._wingPivots.length; i++) {
      const w = this._wingPivots[i];
      w.pivot.rotation.x = this.pitch * (1 / (1 + (i + 1) * 0.6));
    }
    // Altitude follows pitch: a positive (down) pitch loses height, negative
    // (up) gains it. Clamped to the flight envelope.
    this.altitude -= Math.sin(this.pitch) * CARRIER.aircraftClimbRate * dt;
    this.altitude = Math.max(CARRIER.aircraftMinAlt, Math.min(CARRIER.aircraftMaxAlt, this.altitude));
    this.position.y = this.altitude;

    this.position.x += Math.sin(this.heading) * this.speed * dt;
    this.position.z += Math.cos(this.heading) * this.speed * dt;

    const half = 5000;
    this.position.x = Math.max(-half, Math.min(half, this.position.x));
    this.position.z = Math.max(-half, Math.min(half, this.position.z));

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.heading;

    // Crash check: if the squadron is at/below the terrain surface (land or sea
    // floor), it's destroyed. getHeightAt returns the ground height (<=0 over
    // open water), so altitude <= ground means impact.
    if (ctx && ctx.terrain) {
      const ground = ctx.terrain.getHeightAt(this.position.x, this.position.z);
      if (this.altitude <= ground + CARRIER.aircraftCrashAlt) {
        this._crash();
      }
    } else if (this.altitude <= CARRIER.aircraftCrashAlt) {
      // No terrain reference: water floor at 0, so very low = splash.
      this._crash();
    }

    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);

    this._rearmer(dt, ctx);
  }

  // Destroy the squadron from a crash (terrain/water impact). HP -> 0, marked
  // dead, mesh hidden. The engine re-launches it when the player presses T/5/6
  // again (relaunchAt resets HP + altitude).
  _crash() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.autoPilot = false;
    this.mesh.visible = false;
    if (this._torpGuide) this._torpGuide.visible = false;
    if (this._bombReticle) this._bombReticle.visible = false;
  }

  // Apply damage (from AA fire). Returns true if this hit destroyed the squadron.
  takeDamage(amount) {
    if (!this.alive || amount <= 0) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.shotDown = true;   // AA kill (vs. a crash) → eligible for auto respawn
      this._crash();
      return true;
    }
    return false;
  }

  _rearmer(dt, ctx) {
    if (!ctx || !ctx.carrierPos) return;
    const dx = this.position.x - ctx.carrierPos.x;
    const dz = this.position.z - ctx.carrierPos.z;
    if (dx * dx + dz * dz > CARRIER.rearmRange * CARRIER.rearmRange) return;
    this._rearmAccum += CARRIER.rearmRate * dt;
    while (this._rearmAccum >= 1) {
      this._rearmAccum -= 1;
      if (this.ammo < this.maxAmmo) this.ammo++;
      else break;
    }
  }

  // Auto-pilot decision tree. Returns synthetic {w,a,s,d} keys and sets
  // this.autoDrop (a drop is requested for THIS squadron's type).
  _autoPilotKeys(dt, ctx) {
    const enemies = (ctx && ctx.enemies) || [];
    const carrier = ctx && ctx.carrierPos;
    const range2 = CARRIER.autoAcquireRange * CARRIER.autoAcquireRange;

    if (this._autoTarget && (!this._autoTarget.alive)) this._autoTarget = null;
    if (!this._autoTarget) {
      let best = null, bestD2 = range2;
      for (const e of enemies) {
        if (!e || !e.alive) continue;
        const ep = e.mesh ? e.mesh.position : e.position;
        if (!ep) continue;
        const dx = ep.x - this.position.x;
        const dz = ep.z - this.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = e; }
      }
      this._autoTarget = best;
    }

    let goal = null;
    // Once a squadron heads home it commits to the FULL re-arm: it keeps
    // circling the carrier until the pool is topped off. The old exit (any
    // ammo + any target) let it sortie again after a single round came back.
    const homing = !this.ammo || !this._autoTarget;
    const topping = this._autoPhase === 'return' || this._autoPhase === 'rearm';
    if (homing || (topping && this.ammo < this.maxAmmo)) {
      if (!carrier) { this._autoPhase = 'idle'; return { w: true, a: false, s: false, d: false }; }
      const inRearm = this._dist2(carrier) <= CARRIER.rearmRange * CARRIER.rearmRange;
      this._autoPhase = inRearm ? 'rearm' : 'return';
      // Inside the ring: loiter on a circle instead of flying through the
      // carrier and out the far side — the orbit stays within rearmRange so
      // the pool refills at full rate the whole time.
      return inRearm ? this._orbitKeys(carrier) : this._steerTo(carrier);
    }
    {
      const ep = this._autoTarget.mesh ? this._autoTarget.mesh.position : this._autoTarget.position;
      const d2 = this._dist2(ep);
      this._autoPhase = d2 <= CARRIER.autoAttackRange * CARRIER.autoAttackRange ? 'attack' : 'engage';
      goal = ep;
      if (d2 <= CARRIER.autoAttackRange * CARRIER.autoAttackRange) {
        const desired = Math.atan2(goal.x - this.position.x, goal.z - this.position.z);
        if (Math.abs(this._headingErr(desired)) <= CARRIER.autoAimTolerance) {
          if (this.cd <= 0 && this.ammo > 0) this.autoDrop = true;
        }
      }
    }

    return this._steerTo(goal);
  }

  // Loiter keys for the re-arm phase: hold a circular orbit around the carrier
  // at ~55% of the re-arm radius. The tangent heading keeps the plane flying
  // around the ring; the radial error term steers back onto the hold radius.
  _orbitKeys(center) {
    const radius = CARRIER.rearmRange * 0.55;
    const dx = center.x - this.position.x;
    const dz = center.z - this.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const tangent = Math.atan2(dx, dz) + (Math.PI / 2) * this._orbitDir;
    const corr = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, ((dist - radius) / radius) * 1.2));
    const desired = tangent - this._orbitDir * corr;
    const err = this._headingErr(desired);
    return { w: true, a: err > 0.02, d: err < -0.02, s: false };
  }

  _steerTo(goal) {
    if (!goal) return { w: true, a: false, s: false, d: false };
    const desired = Math.atan2(goal.x - this.position.x, goal.z - this.position.z);
    const err = this._headingErr(desired);
    return { w: true, a: err > 0.02, d: err < -0.02, s: false };
  }

  _headingErr(desired) {
    let diff = desired - this.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
  }

  _dist2(p) {
    const dx = this.position.x - p.x;
    const dz = this.position.z - p.z;
    return dx * dx + dz * dz;
  }

  // ---- Per-type drops. A torpedo squadron drops torpedoes; a bomber squadron
  // drops bombs. Each depletes its own ammo and starts its own cooldown. ----

  // Torpedo salvo (torpedo squadron only). Returns drop descriptors or [].
  dropTorpedo() {
    if (!this.alive || this.type !== 'torpedo') return [];
    if (this.cd > 0 || this.ammo <= 0) return [];
    const cfg = getAirGroupConfig(this.level).torpedo;
    const count = Math.min(cfg.salvo, this.ammo);
    const drops = [];
    const spread = count > 1 ? 6 * Math.PI / 180 : 0;
    for (let i = 0; i < count; i++) {
      const off = count > 1 ? (-spread + (2 * spread * i) / (count - 1)) : 0;
      drops.push({
        origin: { x: this.position.x, z: this.position.z },
        heading: this.heading + off,
        tier: CARRIER.torpedoTier,
      });
    }
    this.ammo -= count;
    this.cd = cfg.cd;
    return drops;
  }

  // Bomb salvo (bomber squadron only). Bombs inherit the plane's forward ground
  // speed plus a small downward kick, so they fly a real ballistic arc (forward
  // throw + gravity) instead of dropping straight down. The salvo is SCATTERED,
  // not a line abreast: each bomb is aimed at a random point inside a uniform
  // disc of CARRIER.bombScatterRadius centred on the predicted impact (the drop
  // reticle), realised as a small initial-velocity adjustment — the bombs fan
  // out from the release point and land spread across the circle. A salvo is
  // many weak bombs (salvo total damage unchanged) so a single drop connects
  // far more often. Each descriptor carries an absolute initial velocity so
  // the engine's projectile manager can launch it without recomputing.
  dropBomb() {
    if (!this.alive || this.type !== 'bomber') return [];
    if (this.cd > 0 || this.ammo <= 0) return [];
    const cfg = getAirGroupConfig(this.level).bomber;
    const count = Math.min(cfg.salvo, this.ammo);
    const fwd = this.speed;                 // inherit ground speed (m/s)
    const vy0 = CARRIER.bombDropVy;         // initial downward kick (m/s)
    const { horizTime } = this._simulateBomb();
    const vx = Math.sin(this.heading) * fwd;
    const vz = Math.cos(this.heading) * fwd;
    const drops = [];
    for (let i = 0; i < count; i++) {
      // Uniform random point in the aiming disc -> velocity adjustment.
      const ang = Math.random() * Math.PI * 2;
      const rad = CARRIER.bombScatterRadius * Math.sqrt(Math.random());
      drops.push({
        origin: new THREE.Vector3(this.position.x, this.position.y, this.position.z),
        velocity: new THREE.Vector3(
          vx + (Math.cos(ang) * rad) / horizTime,
          -vy0,
          vz + (Math.sin(ang) * rad) / horizTime,
        ),
        damage: cfg.dmg,
        weapon: CARRIER.bombWeaponType,
      });
    }
    this.ammo -= count;
    this.cd = cfg.cd;
    return drops;
  }

  // Fully re-arm + repair (called when the squadron returns / re-launches).
  refill() {
    this.ammo = this.maxAmmo;
    this.cd = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.shotDown = false;
    this.altitude = CARRIER.aircraftAltitude;
    this.pitch = 0;
    this.position.y = this.altitude;
    this.mesh.visible = true;
  }

  // Re-launch THIS squadron from the carrier: reposition onto the carrier's
  // deck line, revive + re-arm. Used by the solo engine's auto-respawn after
  // the squadron was shot down by enemy AA (and by nothing else — a manual
  // T goes through CarrierAirWing.relaunchAt for both squadrons).
  relaunchAt(x, z, heading) {
    this.position.set(x, CARRIER.aircraftAltitude, z);
    this.heading = heading;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = heading;
    this.refill();
  }

  // Re-apply the level's ammo caps + stats (after a carrier level-up).
  setLevel(level) {
    this.level = level;
    const g = getAirGroupConfig(level)[this.type];
    this.maxAmmo = g.ammo;
    this.ammo = Math.min(this.ammo, this.maxAmmo);
  }

  // Properties used by the camera subject abstraction.
  get cameraPosition() { return this.position; }
  get cameraHeading() { return this.heading; }
  get shipLength() { return 3; }
  get scopedCameraHeight() { return 0; }

  destroy() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    if (this._torpGuide) {
      this.scene.remove(this._torpGuide);
      this._torpGuide.geometry.dispose();
      this._torpGuide.material.dispose();
    }
    if (this._bombReticle) {
      this.scene.remove(this._bombReticle);
      this._bombReticle.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
  }
}

// A carrier's full air wing: TWO squadrons (torpedo + bomber) that exist at the
// same time. `active` is the one the player flies / the camera follows; the
// engine switches it on Tab. Both squadrons update every frame so the inactive
// one keeps cruising (or runs its own auto-pilot).
export class CarrierAirWing {
  constructor(scene, originX, originZ, owner = 'player', level = 4) {
    this.scene = scene;
    this.owner = owner;
    this.level = level;
    // Spawn the two squadrons slightly offset so their V-formations don't
    // overlap visually. Torpedo squadron to port, bomber squadron to starboard.
    const off = 18;
    this.torpedo = new Squadron(scene, originX + off, originZ, owner, level, 'torpedo');
    this.bomber = new Squadron(scene, originX - off, originZ, owner, level, 'bomber');
    this._activeType = 'torpedo';   // which squadron the player controls
  }

  get active() { return this._activeType === 'bomber' ? this.bomber : this.torpedo; }
  get activeType() { return this._activeType; }

  setActive(type) {
    if (type !== 'torpedo' && type !== 'bomber') return;
    this._activeType = type;
  }

  // Swap which squadron is active (Tab). Returns the now-active squadron.
  switchActive() {
    this._activeType = this._activeType === 'torpedo' ? 'bomber' : 'torpedo';
    return this.active;
  }

  // Drive both squadrons. `activeKeys` drives the active one; the inactive one
  // gets idle keys (keeps flying straight) unless its own autoPilot is on.
  // `ctx` is forwarded to each squadron for re-arm / auto-pilot.
  update(dt, activeKeys, ctx = {}) {
    this.torpedo.update(dt, this._activeType === 'torpedo' ? activeKeys : { w: true, a: false, s: false, d: false }, ctx);
    this.bomber.update(dt, this._activeType === 'bomber' ? activeKeys : { w: true, a: false, s: false, d: false }, ctx);
  }

  // Show only the active squadron's aim guide; hide the other's.
  updateGuides() {
    this.torpedo.updateGuides(this._activeType === 'torpedo');
    this.bomber.updateGuides(this._activeType === 'bomber');
  }

  // Re-arm both squadrons (re-launch from the carrier).
  refill() {
    this.torpedo.refill();
    this.bomber.refill();
  }

  // Reposition both squadrons to the carrier and re-arm (re-launch).
  relaunchAt(x, z, heading) {
    const off = 18;
    this.torpedo.position.set(x + off, CARRIER.aircraftAltitude, z);
    this.torpedo.heading = heading;
    this.torpedo.mesh.position.copy(this.torpedo.position);
    this.torpedo.mesh.rotation.y = heading;
    this.bomber.position.set(x - off, CARRIER.aircraftAltitude, z);
    this.bomber.heading = heading;
    this.bomber.mesh.position.copy(this.bomber.position);
    this.bomber.mesh.rotation.y = heading;
    this.refill();
  }

  setLevel(level) {
    this.level = level;
    this.torpedo.setLevel(level);
    this.bomber.setLevel(level);
  }

  destroy() {
    this.torpedo.destroy();
    this.bomber.destroy();
  }
}

// Per-engine manager for carrier air wings (solo / team). Multiplayer uses a
// snapshot-driven visual sync instead (the server is authoritative — see
// game/aircraft.py).
export class SquadronManager {
  constructor(scene) {
    this.scene = scene;
    this.wings = [];
  }

  add(wing) {
    this.wings.push(wing);
    return wing;
  }

  destroy() {
    for (const w of this.wings) w.destroy();
    this.wings = [];
  }
}
