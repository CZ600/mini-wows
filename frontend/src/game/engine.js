import * as THREE from 'three';
import { createScene, createRenderer, createCamera } from './scene.js';
import { createWater } from './water.js';
import { Terrain } from './terrain.js';
import { Ship, LEVEL_CONFIG, CLASS_CONFIG, getClassConfig } from './ship.js';
import { getTurretFireData, turretCanAim, applyCannonSpread, aimTurretsAtPoint } from './turret.js';
import { ProjectileManager } from './projectile.js';
import { TorpedoManager, TORPEDO_TIERS } from './torpedo.js';
import { EnemyManager, ENEMY_SCALE } from './enemy.js';
import { FriendlyAIShip, EnemyTeamShip, pickTeamShipType } from './team_ai.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { ShipSkills } from './skills.js';
import { getMuzzleSpeed, getCannonDrag } from './config.js';

const CAM_DIST = 30;
const CAM_HEIGHT = 15;
const CAM_HEIGHT_SCOPED = 5;
const FOV_NORMAL = 60;
const FOV_SCOPED = 15;
const RAYCASTER = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);

const LEVEL_THRESHOLDS = [0, 10, 50, 85, 150, 250, 380, 560, 780, 1050];

export class GameEngine {
  constructor() {
    this.running = false;
    this.animFrameId = null;
    this.lastTime = 0;
    this.score = 0;
    this.level = 1;
    this.wave = 1;
    this.enemiesDestroyed = 0;
    this.onHudUpdate = null;
    this.onMinimapUpdate = null;
    this.onGameOver = null;
    this.onScopeChange = null;
    this.onLevelUp = null;
    // Single-player hit/kill feedback (solo only). The engine emits
    // { type: 'damage', amount } / { type: 'kill', score } events; the React
    // layer turns them into floating pop-ups.
    this.onHitFeedback = null;
    // Team-mode wingmen HUD labels (projected to screen each frame). Each entry:
    // { id, slot, hp, maxHp, alive, x, y }. Null in solo mode.
    this.onTeamLabelsUpdate = null;
    this._gameOverFired = false;
    this._labelTempVec = new THREE.Vector3();
    this._fps = 60;
    this._aimTarget = new THREE.Vector3();
    this._currentFov = FOV_NORMAL;
    this.shipClass = null;
    this._torpedoCooldowns = [];
    this._waitingForClassSelect = false;
    this.onClassSelect = null;

    // Team-battle (4v10) state.
    this.mode = 'solo';                 // 'solo' | 'team'
    this.teamUnits = [];                // all AI units (friendlies + reds)
    this.friendlies = [];               // player-side units (player adapter + wingmen)
    this.reds = [];                     // 10 EnemyTeamShip
    this.teamResult = null;             // 'win' | 'lose' | null
  }

  init(canvas) {
    this.canvas = canvas;
    this.scene = createScene();
    const { renderer, cleanup: rCleanup } = createRenderer(canvas);
    this.renderer = renderer;
    this._rCleanup = rCleanup;
    const { camera, cleanup: cCleanup } = createCamera();
    this.camera = camera;
    this._cCleanup = cCleanup;

    this.water = createWater(this.scene);
    this.terrain = new Terrain(this.scene, null, null);
    this._minimapTerrain = this.terrain.generateMinimapImage();
    this.audio = new AudioManager();
    this.controls = new Controls(canvas);
    this.controls.setAudioManager(this.audio);

    this.ship = null;
    this.projectileManager = null;
    this.enemyManager = null;
    this.torpedoManager = null;

    this.running = true;
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);
  }

  start(initialLevel = 1, shipClass = null) {
    this.mode = 'solo';
    this.score = LEVEL_THRESHOLDS[initialLevel - 1] || 0;
    this.level = initialLevel;
    this.wave = 1;
    this.enemiesDestroyed = 0;
    this.shipClass = shipClass;
    this._waitingForClassSelect = false;
    this.teamResult = null;

    // Reset single-player damage-feedback accumulator.
    this._dmgAccum = 0;
    this._lastDmgEmit = 0;

    if (this.ship) this.ship.destroy();
    if (this.projectileManager) this.projectileManager.destroy();
    if (this.torpedoManager) this.torpedoManager.destroy();
    if (this.enemyManager) this.enemyManager.clear();
    // Clear leftover team-mode units from a previous team battle.
    for (const u of this.teamUnits) {
      if (u.mesh) this.scene.remove(u.mesh);
    }
    this.teamUnits = [];
    this.friendlies = [];
    this.reds = [];

    this.audio.init();
    this.audio.startAmbient();
    this.audio.startBGM();

    this.ship = new Ship(this.scene, initialLevel, shipClass);
    const spawn = this._findSafeSpawn();
    this.ship.position.copy(spawn);
    this.projectileManager = new ProjectileManager(this.scene, this.terrain, this.audio);
    this.torpedoManager = new TorpedoManager(this.scene, this.terrain, this.audio);
    this.enemyManager = new EnemyManager(this.scene, this.terrain);
    this.enemyManager.spawn(this.ship.position, initialLevel);
    this._armEnemyFeedback();

    this.skills = new ShipSkills();
    this._updateControlsCapabilities();
    this._torpedoCooldowns = this.ship.torpedoTubes.map(() => 0);

    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.18;
    this.controls.scopedWorldYaw = 0;
    this.controls._wasScoped = false;
    this.controls.keys = { w: false, a: false, s: false, d: false };
    this.controls.gear = 1;
    this._gameOverFired = false;

    this.camera.position.set(spawn.x, CAM_HEIGHT, spawn.z - CAM_DIST);

    if (document.pointerLockElement) document.exitPointerLock();

    // If the solo loop isn't running (e.g. after a team battle), restart it.
    // The team loop bails out on mode === 'solo', so we need a fresh solo loop.
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.running = true;
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);
  }

  // ---- Team battle (4v10) -------------------------------------------------
  // A live view of the player ship with the {x,z,heading,speed,alive} shape the
  // team AI expects (the player Ship stores position under .position, not .x).
  _makePlayerAdapter() {
    const ship = this.ship;
    return {
      get x() { return ship.position.x; },
      get z() { return ship.position.z; },
      get y() { return ship.position.y; },
      get heading() { return ship.heading; },
      get speed() { return ship.speed; },
      get alive() { return ship.alive; },
      mesh: ship.mesh,
      ref: ship,
    };
  }

  // Team battle (4v10). Player picks level (6-10) and ship class; the three
  // wingmen are a fixed destroyer + cruiser + battleship trio, and the 10 red
  // ships are randomly mixed - all at the player's chosen level.
  startTeam(initialLevel = 6, shipClass = 'battleship') {
    this.mode = 'team';
    this.score = 0;
    this.wave = 1;
    this.enemiesDestroyed = 0;
    this.teamResult = null;
    this._gameOverFired = false;

    this.level = initialLevel;
    this.shipClass = shipClass;

    // Reset damage-feedback accumulator.
    this._dmgAccum = 0;
    this._lastDmgEmit = 0;

    if (this.ship) this.ship.destroy();
    if (this.projectileManager) this.projectileManager.destroy();
    if (this.torpedoManager) this.torpedoManager.destroy();
    // Tear down any prior team units.
    for (const u of this.teamUnits) {
      if (u.mesh) this.scene.remove(u.mesh);
    }
    this.teamUnits = [];
    this.friendlies = [];
    this.reds = [];

    this.audio.init();
    this.audio.startAmbient();
    this.audio.startBGM();

    this.ship = new Ship(this.scene, this.level, this.shipClass);
    // Friendly team spawns in a line, 100m apart, on water.
    const friendlyLine = this._findTeamSpawnLine(4, 100);
    const fp0 = friendlyLine[0];
    this.ship.position.set(fp0.x, 0, fp0.z);
    this.projectileManager = new ProjectileManager(this.scene, this.terrain, this.audio);
    this.torpedoManager = new TorpedoManager(this.scene, this.terrain, this.audio);

    const playerAdapter = this._makePlayerAdapter();
    this.friendlies.push(playerAdapter);

    // Three wingmen: a fixed destroyer + cruiser + battleship trio, all at the
    // player's level. ("护卫" maps to the lightest available class, destroyer.)
    // They line up behind the player at 100m spacing.
    const wingClasses = ['destroyer', 'cruiser', 'battleship'];
    for (let i = 0; i < 3; i++) {
      const wp = friendlyLine[i + 1];
      const wing = new FriendlyAIShip(this.scene, this.terrain, wp.x, wp.z, this.level, wingClasses[i], i, playerAdapter);
      this.friendlies.push(wing);
      this.teamUnits.push(wing);
    }

    // Enemy team spawns in its own region: a patrol area centred >= 500m away
    // from the friendly line, on water. Reds are spread out with a generous
    // minimum spacing so they don't clump and concentrate fire. They patrol
    // here until they detect the friendly team, then engage.
    const enemyArea = this._findEnemyArea(friendlyLine[0], 500, 2200);
    const placedReds = [];
    for (let i = 0; i < 10; i++) {
      const ep = this._findWaterPosInArea(enemyArea.cx, enemyArea.cz, enemyArea.radius, placedReds, 280);
      placedReds.push(ep);
      const shipType = pickTeamShipType(this.level);
      const red = new EnemyTeamShip(this.scene, this.terrain, ep.x, ep.z, this.level, shipType, i, playerAdapter);
      // Each red patrols within this area until it detects a friendly.
      red.setPatrolArea(enemyArea.cx, enemyArea.cz, enemyArea.radius);
      this.reds.push(red);
      this.teamUnits.push(red);
    }

    // Wire up target awareness for each side.
    for (const f of this.friendlies) {
      if (f instanceof FriendlyAIShip) f.setTargets(this.reds);
    }
    for (const r of this.reds) r.setTargets(this.friendlies);
    // Arm red units' damage hooks for the floating feedback pop-ups.
    this._armEnemyFeedback();

    this.skills = new ShipSkills();
    this._updateControlsCapabilities();
    this._torpedoCooldowns = this.ship.torpedoTubes.map(() => 0);

    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.18;
    this.controls.scopedWorldYaw = 0;
    this.controls._wasScoped = false;
    this.controls.keys = { w: false, a: false, s: false, d: false };
    this.controls.gear = 1;

    this.camera.position.set(this.ship.position.x, CAM_HEIGHT, this.ship.position.z - CAM_DIST);
    if (document.pointerLockElement) document.exitPointerLock();

    // Stop the solo loop that init() started, then start the team loop.
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.running = true;
    this.lastTime = performance.now();
    this._loopTeam = this._loopTeam.bind(this);
    this.animFrameId = requestAnimationFrame(this._loopTeam);
  }

  // OBB hit test for a team AI ship (same shape logic as projectile.js uses for
  // enemy ships). Returns true if world point (px,py,pz) is inside the hull box.
  _pointHitsTeamUnit(unit, px, py, pz) {
    const ep = unit.mesh.position;
    const relX = px - ep.x;
    const relZ = pz - ep.z;
    const h = unit.heading;
    const cosH = Math.cos(h);
    const sinH = Math.sin(h);
    const localX = relX * cosH + relZ * sinH;
    const localZ = -relX * sinH + relZ * cosH;
    const sh = unit.shipHeight || 2.5;
    const bridgeTop = 1 + sh * 2.274;
    return Math.abs(localX) < (unit.shipWidth || unit.size) / 2 + 0.5 &&
           Math.abs(localZ) < (unit.shipLength || unit.size) / 2 + 0.5 &&
           py >= ep.y - 1 &&
           py <= ep.y + bridgeTop + 0.5;
  }

  // Deliver team-mode damage that the standard projectile/torpedo collision
  // branches do NOT cover. The standard branches already handle:
  //   - player-tagged shots/torpedoes hitting reds (reds passed as 'enemies')
  //   - enemy-tagged shots/torpedoes hitting the player ship
  // What's still missing and handled here:
  //   - enemy-tagged shots/torpedoes hitting wingmen
  // Same-faction hits (player vs wingman, red vs red) are simply never matched,
  // which gives us friendly-fire immunity for free. Finally, any unit that
  // reached 0 hp is sunk (mesh removed, marked dead).
  _applyTeamDamage() {
    const wingmen = this.friendlies.filter(u => u instanceof FriendlyAIShip && u.alive);

    const tryHit = (px, py, pz, damage) => {
      for (const u of wingmen) {
        if (!u.alive) continue;
        if (this._pointHitsTeamUnit(u, px, py, pz)) {
          u.takeDamage(damage);
          this.projectileManager._explode(new THREE.Vector3(px, py, pz), 0xff4400, 5);
          if (this.audio) this.audio.playExplosion();
          return true;
        }
      }
      return false;
    };

    // Cannons.
    const projs = this.projectileManager.projectiles;
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      if (!p.mesh || !p.mesh.parent) continue;
      if (p.owner !== 'enemy') continue;            // only red shots can hit wingmen
      const px = p.mesh.position.x, py = p.mesh.position.y, pz = p.mesh.position.z;
      if (py <= 0) continue;
      if (tryHit(px, py, pz, p.damage)) {
        this.scene.remove(p.mesh);
        if (p.trail) this.scene.remove(p.trail);
        projs.splice(i, 1);
      }
    }

    // Torpedoes.
    if (this.torpedoManager) {
      const torps = this.torpedoManager.torpedoes || [];
      for (let i = torps.length - 1; i >= 0; i--) {
        const t = torps[i];
        if (!t.mesh || !t.mesh.parent) continue;
        if (t.owner !== 'enemy') continue;
        const px = t.mesh.position.x, py = t.mesh.position.y, pz = t.mesh.position.z;
        if (py > 0.5) continue;                      // torpedoes run at/below the surface
        const dmg = (30 + (t.tier || 1) * 15) * 2;
        if (tryHit(px, py, pz, dmg)) {
          this.scene.remove(t.mesh);
          torps.splice(i, 1);
        }
      }
    }

    // Sink any unit (wingman or red) that just reached 0 hp.
    for (const u of this.teamUnits) {
      if (u.alive && u.hp <= 0) {
        u.alive = false;
        this.scene.remove(u.mesh);
        this.enemiesDestroyed++;
        const pos = u.mesh.position.clone();
        pos.y += (u.size || 10) / 2;
        this.projectileManager._explode(pos, 0xff6600, (u.size || 10));
        // Player-sunk red → kill feedback. (Wingmen deaths are not "kills".)
        if (this.reds.includes(u) && this.onHitFeedback) {
          this.onHitFeedback({ type: 'kill', score: u.scoreValue ?? 0 });
        }
      }
    }
  }

  // Project each alive wingman's position to screen space and emit a label
  // { id, slot, hp, maxHp, alive, x, y } for the React overlay. Mirrors the
  // multiplayer _computeShipLabels projection. Returns [] when there's no
  // canvas / no wingmen, so the React layer cleanly hides the overlay.
  _computeTeamLabels() {
    const labels = [];
    if (!this.canvas || !this.camera) return labels;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return labels;

    const v = this._labelTempVec;
    const wingmen = this.friendlies.filter(u => u instanceof FriendlyAIShip);
    for (const w of wingmen) {
      if (!w.mesh || !w.alive) {
        labels.push({ id: w.slot, slot: w.slot, hp: w.hp, maxHp: w.maxHp, alive: false, x: 0, y: 0 });
        continue;
      }
      // Anchor the label above the ship's superstructure.
      const labelY = (w.shipHeight || 2.5) * 2.5 + 3;
      v.set(w.mesh.position.x, labelY, w.mesh.position.z);
      v.project(this.camera);
      // Behind the camera or beyond clip → off-screen.
      if (v.z > 1 || v.z < -1) {
        labels.push({ id: w.slot, slot: w.slot, hp: w.hp, maxHp: w.maxHp, alive: true, x: -9999, y: -9999 });
        continue;
      }
      const sx = (v.x + 1) / 2 * width;
      const sy = (1 - v.y) / 2 * height;
      labels.push({ id: w.slot, slot: w.slot, hp: w.hp, maxHp: w.maxHp, alive: true, x: sx, y: sy });
    }
    return labels;
  }

  // Team-battle end conditions:
  //   1. All reds dead       -> win   (我方击杀全部敌人)
  //   2. Player dead         -> lose  (玩家被击杀即结束)
  //   3. All friendlies dead -> lose  (敌方击杀全部我方目标)
  _checkTeamEnd() {
    if (this.teamResult) return;
    const redsAlive = this.reds.some(r => r.alive);
    const playerAlive = !!(this.ship && this.ship.alive);
    const anyFriendlyAlive = playerAlive ||
      this.friendlies.some(u => u instanceof FriendlyAIShip && u.alive);

    if (!redsAlive) this.teamResult = 'win';
    else if (!playerAlive) this.teamResult = 'lose';        // player's death ends it
    else if (!anyFriendlyAlive) this.teamResult = 'lose';   // everyone on our side dead
  }

  _loopTeam() {
    if (this.mode !== 'team') return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this._fps = 0.9 * this._fps + 0.1 * (1 / Math.max(dt, 0.001));

    if (this.water && this.water.material && this.water.material.uniforms) {
      this.water.material.uniforms['time'].value += dt * 0.5;
      this.water.material.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    if (!this.ship) {
      this.renderer.render(this.scene, this.camera);
      this.animFrameId = requestAnimationFrame(this._loopTeam);
      return;
    }

    // End-of-game freeze: keep rendering but stop simulating.
    if (this.teamResult) {
      this.renderer.render(this.scene, this.camera);
      if (!this._gameOverFired && this.onGameOver) {
        this._gameOverFired = true;
        this.onGameOver(this.score, this.level, this.enemiesDestroyed, { mode: 'team', result: this.teamResult });
      }
      this.animFrameId = requestAnimationFrame(this._loopTeam);
      return;
    }

    this.controls.updateMotionKeys(this.ship.speed, this.ship.maxSpeed);
    this.ship.update(dt, this.controls.keys, this.terrain);
    this.skills.update(dt, this.ship);
    const skillActs = this.controls.consumeSkillActivations();
    for (const name of skillActs) this.skills.activate(name, this.ship);

    this.audio.updateEngineBySpeed(this.ship.alive ? this.ship.speed : 0, this.ship.maxSpeed);

    this._updateCameraAndScope();

    // Player firing (same flow as solo).
    if (this.ship.alive) {
      this._teamPlayerFire(dt);
    }

    // Projectiles: pass the reds as the enemy list so the player's 'player'
    // shots register hits on red ships via the standard solo collision branch.
    // Cross-faction hits that the standard branch doesn't cover (player shots
    // hitting reds that the OBB already catches, plus wingman-vs-wingman which
    // is same-faction and should be ignored) are resolved centrally in
    // _applyTeamDamage. Enemy-tagged shots still hit the player via the
    // player-hit branch of projectileManager.update.
    this.projectileManager.update(dt, this.ship, this.reds);
    if (this.torpedoManager) {
      this.torpedoManager.update(dt, this.ship, this.reds);
      const isTorpedoMode = this.controls.weaponMode === 'torpedo';
      const aimYaw = this.controls.scoped
        ? this.controls.scopedWorldYaw
        : this.ship.heading + this.controls.orbitYaw;
      const tier = this.controls.torpedoTier;
      const stats = TORPEDO_TIERS[tier];
      this.torpedoManager.updateAimFan(
        isTorpedoMode && this.ship.alive,
        this.ship.position, aimYaw,
        this.ship.torpedoTubes.length, this.controls.torpedoSpread,
        stats ? stats.range : 400
      );
    }
    this._updateTorpedoCooldowns(dt);

    // Drive all team AI units.
    const playerAdapter = this.friendlies[0];
    const ppos = { x: playerAdapter.x, z: playerAdapter.z, y: playerAdapter.y };
    for (const u of this.teamUnits) {
      if (!u.alive) continue;
      u.updateShip(dt, ppos, playerAdapter.heading, playerAdapter.speed, this.projectileManager, this.camera, this.torpedoManager);
    }

    // Central friendly-fire / cross-faction damage resolution.
    this._applyTeamDamage();

    // Ramming: player vs alive reds.
    if (this.ship.alive) {
      for (const r of this.reds) {
        if (!r.alive) continue;
        const ex = r.mesh.position.x - this.ship.position.x;
        const ez = r.mesh.position.z - this.ship.position.z;
        const ed = Math.sqrt(ex * ex + ez * ez);
        if (ed < (this.ship.shipLength + r.size) / 2) {
          this.ship.sink();
          break;
        }
      }
    }

    this._checkTeamEnd();

    if (this.onHudUpdate) {
      const friendliesAlive = (this.ship && this.ship.alive ? 1 : 0) +
        this.friendlies.filter(u => u instanceof FriendlyAIShip && u.alive).length;
      this.onHudUpdate({
        fps: Math.round(this._fps),
        hp: this.ship.hp,
        maxHp: this.ship.maxHp,
        speed: Math.abs(this.ship.speed * 3.6),
        level: this.level,
        score: this.score,
        weaponMode: this.controls.weaponMode,
        torpedoTier: this.controls.torpedoTier,
        torpedoSpread: this.controls.torpedoSpread,
        torpedoTubes: this._torpedoCooldowns.map((cd, i) => ({
          index: i, cooldown: cd,
          side: this.ship.torpedoTubes[i]?.side || 'port', ready: cd <= 0,
        })),
        torpedoMaxCooldown: this._getTorpedoCooldown(),
        shipClass: this.shipClass,
        availableTorpedoTiers: this.controls.availableTorpedoTiers,
        gear: this.controls.gear,
        skills: this.skills.toSnapshot(),
        // Team-specific.
        mode: 'team',
        friendliesAlive,
        friendliesTotal: 4,
        redsAlive: this.reds.filter(r => r.alive).length,
        redsTotal: 10,
        wingmen: this.friendlies
          .filter(u => u instanceof FriendlyAIShip)
          .map(u => ({ alive: u.alive, hp: u.hp, maxHp: u.maxHp })),
      });
    }

    if (this.onMinimapUpdate) {
      this.onMinimapUpdate({
        playerPos: this.ship.position,
        playerHeading: this.ship.heading,
        enemies: this.reds,
        terrainImage: this._minimapTerrain,
      });
    }

    // Wingmen HUD labels: project each teammate to screen for the overlay
    // (编号 + 血条). Hidden while scoped (player is aiming, labels would
    // clutter the scope view) — consistent with how minimap/labels behave.
    if (this.onTeamLabelsUpdate) {
      this.camera.updateMatrixWorld();
      this.onTeamLabelsUpdate(this.controls.scoped ? [] : this._computeTeamLabels());
    }

    // Emit aggregated player-dealt damage feedback (throttled to ≤10/sec).
    this._flushDamageFeedback(performance.now());

    this.renderer.render(this.scene, this.camera);
    this.animFrameId = requestAnimationFrame(this._loopTeam);
  }

  // Player cannon/torpedo firing for team mode. This mirrors the solo player
  // fire flow (aim target -> turret aim -> consumeFire -> salvo) so the handling
  // and feel are identical; only the bookkeeping (level/score) is omitted.
  _teamPlayerFire(dt) {
    const aimTarget = this._findAimTargetTeam();

    let currentAimYaw = 0;
    if (this.ship.turrets.length > 0) {
      currentAimYaw = aimTurretsAtPoint(this.ship, aimTarget, dt) ?? 0;
    }

    if (this.controls.consumeFire()) {
      if (this.controls.weaponMode === 'torpedo' && this.ship.torpedoTubes.length > 0) {
        this._fireTorpedoes();
      } else {
        let anyFired = false;
        const spreadMult = this.skills.isActive('precision') ? 0.7 : 1.0;
        const cdMult = this.skills.isActive('rapid_fire') ? 0.7 : 1.0;
        const barrels = this.ship.barrels || 1;
        const muzzleSpeed = getMuzzleSpeed(this.shipClass);
        const cannonDrag = getCannonDrag(this.shipClass);
        for (const turret of this.ship.turrets) {
          if (turret.cooldown <= 0 && turretCanAim(turret, currentAimYaw)) {
            for (let b = 0; b < barrels; b++) {
              const { origin, direction } = getTurretFireData(turret, this.ship.heading, b);
              const tdx = aimTarget.x - origin.x;
              const tdz = aimTarget.z - origin.z;
              const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
              this.projectileManager.fire(
                origin,
                applyCannonSpread(direction, tdist, this.shipClass, spreadMult),
                this.ship.damage, 'player', muzzleSpeed, cannonDrag,
              );
            }
            turret.cooldown = this.ship.fireCooldown * cdMult;
            anyFired = true;
          }
        }
        if (anyFired) this.audio.playFire(this.shipClass);
      }
    }
  }

  // Aim target for team mode: raycast against red ships first, else the sea/terrain.
  _findAimTargetTeam() {
    RAYCASTER.setFromCamera(SCREEN_CENTER, this.camera);
    const aliveReds = this.reds.filter(r => r.alive);
    if (aliveReds.length > 0) {
      const hits = RAYCASTER.intersectObjects(aliveReds.map(r => r.mesh), true);
      if (hits.length > 0) {
        this._aimTarget.copy(hits[0].point);
        return this._aimTarget;
      }
    }
    const ray = RAYCASTER.ray;
    if (ray.direction.y < 0) {
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0) {
        this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, t);
        if (this.terrain) {
          const th = this.terrain.getHeightAt(this._aimTarget.x, this._aimTarget.z);
          if (th > 0) this._aimTarget.y = th;
        }
        return this._aimTarget;
      }
    }
    this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, 500);
    return this._aimTarget;
  }

  _updateControlsCapabilities() {
    if (!this.shipClass || this.level < 4) {
      this.controls.setTorpedoCapabilities({ availableTiers: [] });
      return;
    }
    const cc = CLASS_CONFIG[this.shipClass]?.[this.level];
    if (cc) {
      this.controls.setTorpedoCapabilities({ availableTiers: cc.torpedoTiers });
    }
  }

  _findSafeSpawn() {
    const pos = new THREE.Vector3(0, 0, 0);
    if (!this.terrain || !this.terrain.isLand(0, 0)) return pos;
    for (let r = 100; r <= 2000; r += 100) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (!this.terrain.isLand(x, z)) return pos.set(x, 0, z);
      }
    }
    return pos;
  }

  // Team-mode friendly spawn: a straight line of `count` water points, `spacing`
  // metres apart along a random heading, all over water. Returns array of {x,z}.
  _findTeamSpawnLine(count, spacing) {
    const terrain = this.terrain;
    const isWater = (x, z) => !terrain || !terrain.isLand(x, z);
    const tryLine = (cx, cz, ang) => {
      const pts = [];
      const dx = Math.sin(ang), dz = Math.cos(ang);
      // Centre the line on (cx,cz): index offsets span both directions.
      const off0 = -((count - 1) / 2) * spacing;
      for (let i = 0; i < count; i++) {
        const t = off0 + i * spacing;
        pts.push({ x: cx + dx * t, z: cz + dz * t });
      }
      return pts.every(p => isWater(p.x, p.z)) ? pts : null;
    };

    // First try around map centre, then sweep outward.
    for (let r = 0; r <= 3000; r += 150) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        const cx = Math.cos(a) * r;
        const cz = Math.sin(a) * r;
        // Try a few line orientations at each candidate centre.
        for (let la = 0; la < Math.PI; la += Math.PI / 4) {
          const pts = tryLine(cx, cz, la);
          if (pts) return pts;
        }
      }
    }
    // Fallback: a degenerate line at the safe spawn.
    const s = this._findSafeSpawn();
    const pts = [];
    for (let i = 0; i < count; i++) pts.push({ x: s.x + i * spacing, z: s.z });
    return pts;
  }

  // Pick an enemy patrol area: a circle of `areaRadius` centred at a water
  // point that is at least `minGap` metres from `friendlyPos`. Returns
  // {cx, cz, radius}.
  _findEnemyArea(friendlyPos, minGap, areaDiameter) {
    const radius = areaDiameter / 2;
    const terrain = this.terrain;
    const isWater = (x, z) => !terrain || !terrain.isLand(x, z);
    // Direction away from origin, then place the area centre at friendly + gap + radius.
    for (let r = minGap + radius; r <= minGap + radius + 3000; r += 200) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const cx = friendlyPos.x + Math.cos(a) * r;
        const cz = friendlyPos.z + Math.sin(a) * r;
        // The area centre and its edge nearest the friendlies must both be water
        // and the centre must keep >= minGap from the friendly line.
        const nearestEdge = Math.hypot(cx - friendlyPos.x, cz - friendlyPos.z) - radius;
        if (nearestEdge < minGap) continue;
        if (!isWater(cx, cz)) continue;
        return { cx, cz, radius };
      }
    }
    // Fallback: straight out from the friendly spawn.
    const ang = Math.atan2(friendlyPos.z, friendlyPos.x) + Math.PI;
    return {
      cx: friendlyPos.x + Math.cos(ang) * (minGap + radius),
      cz: friendlyPos.z + Math.sin(ang) * (minGap + radius),
      radius,
    };
  }

  // Find a water point inside the circle (cx,cz,radius), avoiding land. Falls
  // back to the centre if needed.
  // Find a water point inside the circle (cx,cz,radius), avoiding land and
  // keeping at least minSep from each unit already in `placed` (array of
  // {x,z} or objects with mesh.position). Falls back to the centre if needed.
  _findWaterPosInArea(cx, cz, radius, placed = [], minSep = 0) {
    const terrain = this.terrain;
    const isWater = (x, z) => !terrain || !terrain.isLand(x, z);
    const tooClose = (x, z) => {
      if (!minSep) return false;
      for (const u of placed) {
        const ux = u.x != null ? u.x : (u.mesh && u.mesh.position.x);
        const uz = u.z != null ? u.z : (u.mesh && u.mesh.position.z);
        if (ux == null || uz == null) continue;
        if (Math.hypot(x - ux, z - uz) < minSep) return true;
      }
      return false;
    };

    // Try the centre first only if it satisfies spacing.
    if (isWater(cx, cz) && !tooClose(cx, cz)) return { x: cx, z: cz };
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * radius;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      if (isWater(x, z) && !tooClose(x, z)) return { x, z };
    }
    return { x: cx, z: cz };
  }

  _findAimTarget() {
    RAYCASTER.setFromCamera(SCREEN_CENTER, this.camera);

    const aliveEnemies = this.enemyManager.enemies.filter(e => e.alive);
    if (aliveEnemies.length > 0) {
      const hits = RAYCASTER.intersectObjects(aliveEnemies.map(e => e.mesh), true);
      if (hits.length > 0) {
        this._aimTarget.copy(hits[0].point);
        return this._aimTarget;
      }
    }

    const ray = RAYCASTER.ray;
    if (ray.direction.y < 0) {
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0) {
        this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, t);
        if (this.terrain) {
          const th = this.terrain.getHeightAt(this._aimTarget.x, this._aimTarget.z);
          if (th > 0) this._aimTarget.y = th;
        }
        return this._aimTarget;
      }
    }

    this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, 500);
    return this._aimTarget;
  }

  // Shared camera + scope handling for both solo and team loops.
  _updateCameraAndScope() {
    const scoped = this.controls.scoped;
    // 进入开镜的边沿：把当前世界朝向锚定为绝对方向，之后船身转向
    // 不再带动瞄准镜；只有鼠标移动会改 scopedWorldYaw。
    if (scoped && !this.controls._wasScoped) {
      this.controls.scopedWorldYaw = this.ship.heading + this.controls.orbitYaw;
    }
    this.controls._wasScoped = scoped;
    const worldYaw = scoped
      ? this.controls.scopedWorldYaw
      : this.ship.heading + this.controls.orbitYaw;
    const shipScale = this.ship.shipLength / 10;
    let targetCamPos;
    const hOff = this.controls.heightOffset || 0;
    if (scoped) {
      const scopedH = (this.ship.scopedCameraHeight || CAM_HEIGHT_SCOPED) + hOff;
      targetCamPos = new THREE.Vector3(
        this.ship.position.x,
        this.ship.position.y + scopedH,
        this.ship.position.z
      );
    } else {
      const camDist = CAM_DIST + shipScale * 5;
      const camHeight = CAM_HEIGHT + shipScale * 3 + hOff;
      targetCamPos = new THREE.Vector3(
        this.ship.position.x - Math.sin(worldYaw) * camDist,
        this.ship.position.y + camHeight,
        this.ship.position.z - Math.cos(worldYaw) * camDist
      );
    }
    const camLerp = scoped ? 0.15 : 0.12;
    this.camera.position.lerp(targetCamPos, camLerp);

    const zoom = this.controls.zoomLevel || 1.0;
    const targetFov = scoped ? FOV_SCOPED / zoom : (this.controls.normalFov || FOV_NORMAL);
    this._currentFov += (targetFov - this._currentFov) * (scoped ? 0.18 : 0.12);
    this.camera.fov = this._currentFov;
    this.camera.updateProjectionMatrix();

    if (this.onScopeChange) {
      this.onScopeChange(scoped);
    }

    const pitch = this.controls.orbitPitch;
    const lookDir = new THREE.Vector3(
      Math.sin(worldYaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(worldYaw) * Math.cos(pitch)
    );
    const lookTarget = this.camera.position.clone().add(lookDir.multiplyScalar(1000));
    this.camera.lookAt(lookTarget);
  }

  _loop(time) {
    if (!this.running) return;
    if (this.mode === 'team') return;   // team mode runs its own loop
    this.animFrameId = requestAnimationFrame(this._loop);

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this._fps += ((1 / dt) - this._fps) * 0.05;

    if (this.water) {
      this.water.material.uniforms['time'].value += dt * 0.5;
      this.water.material.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    if (!this.ship) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.controls.updateMotionKeys(this.ship.speed, this.ship.maxSpeed);
    this.ship.update(dt, this.controls.keys, this.terrain);

    // Process skills
    this.skills.update(dt, this.ship);
    const skillActs = this.controls.consumeSkillActivations();
    for (const name of skillActs) {
      this.skills.activate(name, this.ship);
    }

    if (!this.ship.alive) {
      this.audio.updateEngineBySpeed(0, this.ship.maxSpeed);
      this.projectileManager.update(dt, this.ship, this.enemyManager.enemies);
      this.enemyManager.update(dt, this.ship.position, this.ship.heading, this.ship.speed, this.projectileManager, this.camera, this.torpedoManager);
      this.renderer.render(this.scene, this.camera);
      if (!this._gameOverFired && this.onGameOver) {
        this._gameOverFired = true;
        this.onGameOver(this.score, this.level, this.enemiesDestroyed);
      }
      return;
    }

    this.audio.updateEngineBySpeed(this.ship.speed, this.ship.maxSpeed);

    this._updateCameraAndScope();

    const aimTarget = this._findAimTarget();

    // Each turret aims at the aim point along its own line (no more parallel
    // fire). shipLocalYaw is the ship-centred yaw used for the fire-arc check.
    let currentAimYaw = 0;
    if (this.ship.turrets.length > 0) {
      currentAimYaw = aimTurretsAtPoint(this.ship, aimTarget, dt) ?? 0;
    }

    if (this.controls.consumeFire()) {
      if (this.controls.weaponMode === 'torpedo' && this.ship.torpedoTubes.length > 0) {
        this._fireTorpedoes();
      } else {
        let anyFired = false;
        const spreadMult = this.skills.isActive('precision') ? 0.7 : 1.0;
        const cdMult = this.skills.isActive('rapid_fire') ? 0.7 : 1.0;
        const barrels = this.ship.barrels || 1;
        const muzzleSpeed = getMuzzleSpeed(this.shipClass);
        const cannonDrag = getCannonDrag(this.shipClass);
        for (const turret of this.ship.turrets) {
          if (turret.cooldown <= 0 && turretCanAim(turret, currentAimYaw)) {
            // One shell per barrel: each fires from its own muzzle position
            // along the turret's own converged aim direction, with its own
            // spread scaled to that barrel's range to the target.
            for (let b = 0; b < barrels; b++) {
              const { origin, direction } = getTurretFireData(turret, this.ship.heading, b);
              const tdx = aimTarget.x - origin.x;
              const tdz = aimTarget.z - origin.z;
              const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
              this.projectileManager.fire(origin, applyCannonSpread(direction, tdist, this.shipClass, spreadMult), this.ship.damage, 'player', muzzleSpeed, cannonDrag);
            }
            turret.cooldown = this.ship.fireCooldown * cdMult;
            anyFired = true;
          }
        }
        if (anyFired) {
          this.audio.playFire(this.shipClass);
        }
      }
    }

    this.projectileManager.update(dt, this.ship, this.enemyManager.enemies);
    if (this.torpedoManager) {
      this.torpedoManager.update(dt, this.ship, this.enemyManager.enemies);

      const isTorpedoMode = this.controls.weaponMode === 'torpedo';
      const aimYaw = this.controls.scoped
        ? this.controls.scopedWorldYaw
        : this.ship.heading + this.controls.orbitYaw;
      const tier = this.controls.torpedoTier;
      const stats = TORPEDO_TIERS[tier];
      this.torpedoManager.updateAimFan(
        isTorpedoMode && this.ship.alive,
        this.ship.position,
        aimYaw,
        this.ship.torpedoTubes.length,
        this.controls.torpedoSpread,
        stats ? stats.range : 400
      );
    }
    this._updateTorpedoCooldowns(dt);
    this.enemyManager.update(dt, this.ship.position, this.ship.heading, this.ship.speed, this.projectileManager, this.camera, this.torpedoManager);

    for (const enemy of this.enemyManager.enemies) {
      if (enemy.alive && enemy.hp <= 0) {
        this.enemyManager.destroyEnemy(enemy);
        this.audio.playExplosion();
        this.score += enemy.scoreValue;
        this.enemiesDestroyed++;
        if (this.onHitFeedback) this.onHitFeedback({ type: 'kill', score: enemy.scoreValue });
        this._checkLevelUp();
      }
    }

    if (this.ship.alive) {
      for (const enemy of this.enemyManager.enemies) {
        if (!enemy.alive) continue;
        const edx = enemy.mesh.position.x - this.ship.position.x;
        const edz = enemy.mesh.position.z - this.ship.position.z;
        const eDist = Math.sqrt(edx * edx + edz * edz);
        const collisionDist = (this.ship.shipLength + enemy.size) / 2;
        if (eDist < collisionDist) {
          this.ship.sink();
          break;
        }
      }
    }

    if (this.enemyManager.getAliveCount() === 0 && this.ship.alive) {
      this.wave++;
      this.enemyManager.spawn(this.ship.position, this.level);
      this._armEnemyFeedback();
    }

    if (this.onHudUpdate) {
      this.onHudUpdate({
        fps: Math.round(this._fps),
        hp: this.ship.hp,
        maxHp: this.ship.maxHp,
        speed: Math.abs(this.ship.speed * 3.6),
        level: this.level,
        score: this.score,
        enemyCount: this.enemyManager.getAliveCount(),
        wave: this.wave,
        turrets: this.ship.turrets.map(t => ({
          cooldown: t.cooldown,
          maxCooldown: this.ship.fireCooldown,
          isFront: t.isFront,
        })),
        currentThreshold: LEVEL_THRESHOLDS[this.level - 1] || 0,
        nextThreshold: this.level < LEVEL_THRESHOLDS.length ? LEVEL_THRESHOLDS[this.level] : null,
        weaponMode: this.controls.weaponMode,
        torpedoTier: this.controls.torpedoTier,
        torpedoSpread: this.controls.torpedoSpread,
        torpedoTubes: this._torpedoCooldowns.map((cd, i) => ({
          index: i,
          cooldown: cd,
          side: this.ship.torpedoTubes[i]?.side || 'port',
          ready: cd <= 0,
        })),
        torpedoMaxCooldown: this._getTorpedoCooldown(),
        shipClass: this.shipClass,
        availableTorpedoTiers: this.controls.availableTorpedoTiers,
        gear: this.controls.gear,
        skills: this.skills.toSnapshot(),
      });
    }

    if (this.onMinimapUpdate) {
      this.onMinimapUpdate({
        playerPos: this.ship.position,
        playerHeading: this.ship.heading,
        enemies: this.enemyManager.enemies,
        terrainImage: this._minimapTerrain,
      });
    }

    // Emit aggregated player-dealt damage feedback (throttled to ≤10/sec).
    this._flushDamageFeedback(performance.now());

    this.renderer.render(this.scene, this.camera);
  }

  // ---- Single-player hit feedback ---------------------------------------
  // Wire every enemy's onDamaged hook to our accumulator so we can emit a
  // single aggregated damage pop-up per throttle window (multi-barrel salvos
  // deal many hits in one frame; emitting per hit would spam the React layer).
  // Works for BOTH solo mode (EnemyManager.enemies) and team mode (this.reds),
  // since EnemyTeamShip inherits takeDamage from EnemyShip. Called after each
  // spawn / wave / team setup.
  _armEnemyFeedback() {
    const cb = (amount) => { this._dmgAccum += amount; };
    const targets = this.mode === 'team' ? this.reds : this.enemyManager.enemies;
    for (const e of targets) {
      if (e) e.onDamaged = cb;
    }
  }

  // Flush the accumulated player-dealt damage if enough time has passed.
  // Returns true if an event was emitted so the loop can decide whether to
  // render an extra frame (currently unused, just kept explicit).
  _flushDamageFeedback(now) {
    if (this._dmgAccum <= 0) return false;
    if (now - this._lastDmgEmit < 100) return false;  // ≤10 emits/sec
    if (this.onHitFeedback) {
      this.onHitFeedback({ type: 'damage', amount: Math.round(this._dmgAccum) });
    }
    this._dmgAccum = 0;
    this._lastDmgEmit = now;
    return true;
  }

  _checkLevelUp() {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
      if (this.score >= LEVEL_THRESHOLDS[i] && this.level < i + 1) {
        const oldLevel = this.level;
        const newLevel = i + 1;
        this.level = newLevel;

        if (oldLevel === 3 && newLevel === 4 && !this.shipClass) {
          this._waitingForClassSelect = true;
          this.running = false;
          if (this.onClassSelect) {
            this.onClassSelect();
          }
          return;
        }

        this._applyLevelUp(oldLevel, newLevel);
        return;
      }
    }
  }

  _applyLevelUp(oldLevel, newLevel) {
    this.ship.upgradeToLevel(newLevel);
    this._torpedoCooldowns = this.ship.torpedoTubes.map(() => 0);
    this._updateControlsCapabilities();
    if (this.onLevelUp) {
      const oldCfg = getClassConfig(this.shipClass, oldLevel) || LEVEL_CONFIG[oldLevel];
      const newCfg = getClassConfig(this.shipClass, newLevel) || LEVEL_CONFIG[newLevel];
      this.onLevelUp({
        oldLevel,
        newLevel,
        oldShip: oldCfg,
        newShip: newCfg,
        oldEnemy: ENEMY_SCALE[oldLevel],
        newEnemy: ENEMY_SCALE[newLevel],
      });
    }
  }

  selectClass(shipClass) {
    this.shipClass = shipClass;
    this._waitingForClassSelect = false;
    this.running = true;
    this.lastTime = performance.now();
    this._applyLevelUp(3, 4);
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);
  }

  _fireTorpedoes() {
    const tier = this.controls.torpedoTier;
    const spread = this.controls.torpedoSpread;
    const readyTubes = [];
    for (let i = 0; i < this.ship.torpedoTubes.length; i++) {
      if (this._torpedoCooldowns[i] <= 0) readyTubes.push(i);
    }
    if (readyTubes.length === 0) return;

    const stats = TORPEDO_TIERS[tier];
    if (!stats) return;

    this.torpedoManager.fire(
      this.ship.position,
      this.controls.scoped
        ? this.controls.scopedWorldYaw
        : this.ship.heading + this.controls.orbitYaw,
      tier,
      this.level,
      readyTubes.length,
      spread,
      'player'
    );

    const cd = this._getTorpedoCooldown();
    for (const idx of readyTubes) {
      this._torpedoCooldowns[idx] = cd;
    }
    this.audio.playTorpedoLaunch();
  }

  _updateTorpedoCooldowns(dt) {
    for (let i = 0; i < this._torpedoCooldowns.length; i++) {
      if (this._torpedoCooldowns[i] > 0) {
        this._torpedoCooldowns[i] -= dt;
      }
    }
  }

  _getTorpedoCooldown() {
    const tier = this.controls.torpedoTier;
    const base = TORPEDO_TIERS[tier];
    if (!base) return 8;
    const levelsAbove4 = Math.max(0, this.level - 4);
    return base.baseCooldown * Math.pow(0.95, levelsAbove4);
  }

  destroy() {
    this.running = false;
    this.mode = 'solo';
    // Detach callbacks so a queued frame can't fire stale feedback into React.
    this.onHitFeedback = null;
    this.onTeamLabelsUpdate = null;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.audio) this.audio.stopAll();
    if (this.controls) this.controls.destroy();
    if (this._rCleanup) this._rCleanup();
    if (this._cCleanup) this._cCleanup();
    if (this.ship) this.ship.destroy();
    if (this.projectileManager) this.projectileManager.destroy();
    if (this.torpedoManager) this.torpedoManager.destroy();
    if (this.enemyManager) this.enemyManager.clear();
    // Team-mode units aren't owned by EnemyManager; remove their meshes.
    for (const u of this.teamUnits) {
      if (u.mesh) this.scene.remove(u.mesh);
    }
    this.teamUnits = [];
    this.friendlies = [];
    this.reds = [];
    if (this.renderer) this.renderer.dispose();
  }
}
