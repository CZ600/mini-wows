import * as THREE from 'three';
import { createScene, createRenderer, createCamera } from './scene.js';
import { createWater } from './water.js';
import { Terrain } from './terrain.js';
import { Ship, LEVEL_CONFIG, CLASS_CONFIG, getClassConfig } from './ship.js';
import { getTurretFireData, turretCanAim, applyCannonSpread, aimTurretsAtPoint, aimTurretList, aimAaMountAtPoint } from './turret.js';
import { ProjectileManager } from './projectile.js';
import { TorpedoManager, TORPEDO_TIERS } from './torpedo.js';
import { EnemyManager, ENEMY_SCALE } from './enemy.js';
import { FriendlyAIShip, EnemyTeamShip, pickTeamShipType } from './team_ai.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { ShipSkills } from './skills.js';
import { updateFpsEMA } from './fps.js';
import { getMuzzleSpeed, getCannonDrag } from './config.js';
import { Squadron, CarrierAirWing, SquadronManager } from './aircraft.js';
import { CARRIER, getAirGroupConfig } from './config.js';
import {
  getClassAa, getAaTier, AA_DRAG,
  getClassAsw, getAswTier, clampAswAim, ASW_MUZZLE_SPEED, ASW_DRAG, ASW_AIR, GRAVITY as CFG_GRAVITY,
  SECONDARY,
} from './config.js';
import { AswAimIndicator, AswStrikePlane } from './asw.js';

const CAM_DIST = 30;
const CAM_HEIGHT = 15;
const CAM_HEIGHT_SCOPED = 5;
const FOV_NORMAL = 60;
const FOV_SCOPED = 15;
const RAYCASTER = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);

const LEVEL_THRESHOLDS = [0, 5, 15, 43, 103, 207, 343, 532, 740, 1028];

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
    // Carrier patrol map toggle (M). React renders the full-screen map when
    // this fires. Ignored for non-carriers.
    this.onCarrierMapToggle = null;
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

    // Carrier state: when the player is a carrier and toggles to squadron view,
    // the camera + input route to the air wing instead of the ship. A carrier
    // fields TWO squadrons (torpedo + bomber) at once; the player flies the
    // ACTIVE one and switches with Tab. The ship keeps cruising under autopilot.
    this.playerView = 'ship';           // 'ship' | 'squadron'
    this.airWing = null;                // active CarrierAirWing (aircraft.js) or null
    this.squadronManager = null;        // owns air wings for this engine
    // Carrier patrol path (M-key map). null = manual control; otherwise the
    // carrier autopilots along this closed waypoint loop.
    this.carrierPatrol = null;
    // AA / ASW state. AA mount cooldowns live on ship.aaMounts (ticked in
    // Ship.update); _aswCooldown is the player's depth-charge release cooldown.
    // _enemySquadrons holds hostile squadrons (enemy carriers' wings) that the
    // player's AA + flak-hit detection target. _aswStrikes holds the player's
    // in-flight battleship ASW strike planes (solo/team local simulation).
    this._aswCooldown = 0;
    this._enemySquadrons = [];
    this._aswStrikes = [];
  }

  // The object the camera follows + input routes to. Ship or the active
  // squadron of the air wing.
  _cameraSubject() {
    if (this.playerView === 'squadron' && this.airWing) return this.airWing.active;
    return this.ship;
  }

  // ---- Carrier patrol path (M-key map) ----
  // When set, the carrier autopilots along a closed loop of waypoints,
  // freeing the player to fly aircraft or just observe. Engine feeds synthetic
  // WASD keys toward the next waypoint; any player WASD/gear cancels patrol.
  // API: setCarrierPatrol(points|null) + _carrierPatrolKeys() overrides shipKeys.
  setCarrierPatrol(points) {
    if (!points || points.length === 0) {
      this.carrierPatrol = null;
      return;
    }
    if (this.shipClass !== 'carrier') return;
    this.carrierPatrol = { points: points.map(p => ({ x: p.x, z: p.z })), idx: 0 };
  }
  clearCarrierPatrol() { this.carrierPatrol = null; }

  // Synthetic keys steering the carrier toward its current patrol waypoint.
  // Returns null when not patrolling (caller uses player keys then).
  _carrierPatrolKeys() {
    if (!this.carrierPatrol || !this.ship || !this.ship.alive) return null;
    const pat = this.carrierPatrol;
    const tgt = pat.points[pat.idx];
    const dx = tgt.x - this.ship.position.x;
    const dz = tgt.z - this.ship.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // Reached waypoint -> advance to next (closed loop).
    if (dist < 40) {
      pat.idx = (pat.idx + 1) % pat.points.length;
      return { w: true, a: false, s: false, d: false };
    }
    const desired = Math.atan2(dx, dz);
    let err = desired - this.ship.heading;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    return { w: true, a: err > 0.02, s: false, d: err < -0.02 };
  }

  // Compute the keys that should drive the SHIP this frame, taking patrol mode
  // + squadron view into account. Patrol is cancelled if the player provides
  // manual input (W/A/S/D / gear) so they can retake control instantly.
  _shipKeysForFrame() {
    if (this.playerView === 'squadron') {
      // While flying, the ship autopilots: keep patrol if set, else idle.
      return this._carrierPatrolKeys() || { w: false, a: false, s: false, d: false };
    }
    if (this.carrierPatrol) {
      // Any manual steering input cancels patrol.
      const k = this.controls.keys;
      if (k.w || k.a || k.s || k.d) {
        this.carrierPatrol = null;
      } else {
        return this._carrierPatrolKeys();
      }
    }
    return this.controls.keys;
  }

  // Minimap centre + heading: follows the active squadron while flying so the
  // map is aircraft-centric. Returns { pos, heading, followPos } where followPos
  // is an optional extra blip to draw (the carrier hull, while the player flies).
  _minimapCenter() {
    if (this.playerView === 'squadron' && this.airWing && this.airWing.active.alive) {
      const sq = this.airWing.active;
      return {
        pos: sq.position,
        heading: sq.heading,
        followPos: this.ship ? this.ship.position : null,
      };
    }
    return { pos: this.ship.position, heading: this.ship.heading, followPos: null };
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
    this.aswIndicator = new AswAimIndicator(this.scene);
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
    // Drop any carrier air-wing from the previous round (squadron meshes +
    // view state) so a fresh match starts clean.
    this._resetCarrierState();
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
      // Exposed so AI fire-targets can recognise a submarine player (ASW ships
      // switch from guns to depth charges against it — see enemy.js).
      get shipClass() { return ship.shipClass; },
      mesh: ship.mesh,
      ref: ship,
    };
  }

  // Solo-mode player position for the enemy manager: live x/z plus the ship
  // class, so ASW-fitted enemies can tell when they are hunting the player's
  // submarine (team mode reads the same info off fireTarget.ref).
  _soloPlayerPos() {
    const pos = this.ship.position;
    return {
      get x() { return pos.x; },
      get z() { return pos.z; },
      shipClass: this.ship.shipClass,
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
    // Drop any carrier air-wing from the previous round (squadron meshes +
    // view state) so a fresh match starts clean.
    this._resetCarrierState();
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
    // Friendly team spawns in a forward echelon (inverted-V) with the player as
    // the rear point, all facing the enemy region. The wingmen sit AHEAD of the
    // player (toward the enemy), spread in a shallow arc — this keeps them in
    // the camera's forward view at spawn so their teammate HP labels render.
    // (The earlier "line abreast perpendicular to facing" put them 90° off the
    // camera's view axis → off-screen → labels never showed.)
    // Pick a water centre for the formation, then offset the player and each
    // wingman from it along (forward) / across (beam) the facing heading.
    // All angles use the engine's heading convention (heading=0 → +Z, move via
    // sin(h)*x, cos(h)*z).
    const faceHeading = Math.random() * Math.PI * 2;
    // Formation layout (player + 3 wingmen) in "ahead" / "beam" metres, where
    // ahead>0 is forward (toward the enemy) and beam>0 is to the formation's
    // right. _findTeamFormation resolves these to world coords along faceHeading.
    //   player : ahead 0,   beam 0
    //   wing 0 : ahead 90,  beam 0    (destroyer, centre, slightly ahead)
    //   wing 1 : ahead 130, beam 70   (cruiser, right flank)
    //   wing 2 : ahead 130, beam -70  (battleship, left flank)
    const layout = [
      { ahead: 0,   beam: 0   },   // player
      { ahead: 90,  beam: 0   },   // destroyer
      { ahead: 130, beam: 70  },   // cruiser
      { ahead: 130, beam: -70 },   // battleship
    ];
    const formation = this._findTeamFormation(faceHeading, layout);
    const fp0 = formation.points[0];              // player
    const lineCenter = formation.points[Math.floor(formation.points.length / 2)];
    this.ship.position.set(fp0.x, 0, fp0.z);
    this.projectileManager = new ProjectileManager(this.scene, this.terrain, this.audio);
    this.torpedoManager = new TorpedoManager(this.scene, this.terrain, this.audio);

    const playerAdapter = this._makePlayerAdapter();
    this.friendlies.push(playerAdapter);

    // Three wingmen: a fixed destroyer + cruiser + battleship trio, all at the
    // player's level. Spawned ahead of / flanking the player per `layout`.
    const wingClasses = ['destroyer', 'cruiser', 'battleship'];
    for (let i = 0; i < 3; i++) {
      const wp = formation.points[i + 1];
      const wing = new FriendlyAIShip(this.scene, this.terrain, wp.x, wp.z, this.level, wingClasses[i], i, playerAdapter);
      this.friendlies.push(wing);
      this.teamUnits.push(wing);
    }

    // Enemy team spawns in its own region: a patrol area centred >= 500m away
    // from the friendly line, on water. Place it straight down the facing
    // heading so the formation actually points at it. _findEnemyArea uses its
    // own cos/sin bearing convention (dir = (cos b, sin b)); a heading of h has
    // direction (sin h, cos h), so the equivalent bearing is π/2 - h. Reds are
    // spread out with a generous minimum spacing so they don't clump and
    // concentrate fire. They patrol here until they detect the friendly team,
    // then engage.
    const enemyBearing = Math.PI / 2 - faceHeading;
    const enemyArea = this._findEnemyArea(lineCenter, 500, 2200, enemyBearing);
    // Point every friendly hull (player ship + wingmen) at the enemy region and
    // sync the mesh rotation so they spawn already in formation facing forward.
    this.ship.heading = faceHeading;
    this.ship.velocityHeading = faceHeading;
    this.ship.mesh.rotation.y = faceHeading;
    for (const u of this.teamUnits) {
      u.heading = faceHeading;
      u.velocityHeading = faceHeading;
      u.mesh.rotation.y = faceHeading;
    }
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

    // Place the camera directly behind the player (opposite the enemy region)
    // so the player starts looking toward the enemy spawn area.
    this.camera.position.set(
      this.ship.position.x - Math.sin(this.ship.heading) * CAM_DIST,
      CAM_HEIGHT,
      this.ship.position.z - Math.cos(this.ship.heading) * CAM_DIST
    );
    if (document.pointerLockElement) document.exitPointerLock();

    // Stop the solo loop that init() started, then start the team loop.
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.running = true;
    this.lastTime = performance.now();
    this._loopTeam = this._loopTeam.bind(this);
    this.animFrameId = requestAnimationFrame(this._loopTeam);
  }

  // Horizontal distance from a world point to the player ship, in meters,
  // used to attenuate impact-sound volume with distance.
  _distToPlayer(x, z) {
    const sp = this.ship && this.ship.position;
    if (!sp) return 0;
    const dx = x - sp.x;
    const dz = z - sp.z;
    return Math.sqrt(dx * dx + dz * dz);
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
          if (this.audio) this.audio.playExplosion(this._distToPlayer(px, pz));
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
        // Dispose in-flight ASW strike planes before the unit stops ticking.
        if (u.retire) u.retire();
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
    // Identify wingmen by the duck-type isWingman flag (set in FriendlyAIShip's
    // ctor) rather than `instanceof FriendlyAIShip`: the latter can fail across
    // duplicated module identities under some bundler/hot-reload setups, which
    // would silently empty this list (and the HUD wingmen list) so teammate
    // labels never appear. Fall back to instanceof for older units just in case.
    const wingmen = this.friendlies.filter(u => u && (u.isWingman || u instanceof FriendlyAIShip));
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
    this._fps = updateFpsEMA(this._fps, dt, 0.1);

    if (this.water && this.water.material && this.water.material.uniforms) {
      this.water.material.uniforms['time'].value += dt * 0.5;
      this.water.material.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    // 云的漂移时钟与水波共用同一累计值
    const skyDome = this.scene.userData.skyDome;
    if (skyDome) skyDome.material.uniforms.time.value = this.water.material.uniforms['time'].value;

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
        // Pass the team settings (level + ship class) so the React layer can
        // offer a "rematch" that restarts the same battle instead of defaulting
        // back to solo level 1.
        this.onGameOver(this.score, this.level, this.enemiesDestroyed, {
          mode: 'team',
          result: this.teamResult,
          shipClass: this.shipClass,
        });
      }
      this.animFrameId = requestAnimationFrame(this._loopTeam);
      return;
    }

    // In squadron view the carrier autopilots; keys drive the squadron.
    const shipKeys = this._shipKeysForFrame();
    // updateMotionKeys rewrites keys.w/keys.s from the carrier's gear/speed —
    // that's for steering the ship. In squadron view the player's W/S are
    // altitude controls instead, so we must NOT clobber them here (the ship
    // drives itself via _carrierPatrolKeys and ignores controls.keys anyway).
    if (this.playerView !== 'squadron') {
      this.controls.updateMotionKeys(this.ship.speed, this.ship.maxSpeed);
    }
    this.ship.update(dt, shipKeys, this.terrain);
    this.skills.update(dt, this.ship);
    const skillActs = this.controls.consumeSkillActivations();
    for (const name of skillActs) this.skills.activate(name, this.ship);

    // Submarine dive toggle (no-op for other classes).
    if (this.controls.consumeDiveToggle()) {
      this.ship.toggleDive();
    }

    // Carrier view toggle + squadron phase.
    if (this.controls.consumeViewToggle()) {
      this._toggleCarrierView();
    }
    const launchGroup = this.controls.consumeSquadronLaunch();
    if (launchGroup && this.shipClass === 'carrier') {
      if (this.playerView !== 'squadron') {
        this._enterSquadronView(launchGroup);
      } else {
        // Already flying: 5/6 hands control to that squadron (activates it).
        if (this.airWing) this.airWing.setActive(launchGroup);
      }
    }
    // Tab: switch the active squadron (torpedo <-> bomber).
    if (this.controls.consumeSquadronSwitch() && this.playerView === 'squadron' && this.airWing) {
      this.airWing.switchActive();
      this._resetSquadronOrbit();
    }
    if (this.controls.consumeAutoPilotToggle() && this.shipClass === 'carrier') {
      if (!this.airWing) this._enterSquadronView('torpedo');
      if (this.airWing) {
        // Toggle the active squadron's auto-pilot.
        const sq = this.airWing.active;
        sq.autoPilot = !sq.autoPilot;
        sq._autoTarget = null;
      }
    }
    // Carrier patrol map toggle (M) — hand off to React for rendering.
    if (this.controls.consumeCarrierMapToggle() && this.shipClass === 'carrier' && this.onCarrierMapToggle) {
      this.onCarrierMapToggle();
    }
    // Squadron phase: both squadrons update; the active one takes player keys,
    // the inactive one cruises (or runs its own auto-pilot). autoPilot drops are
    // released for whichever squadron requested one this frame.
    const squadCtx = {
      carrierPos: this.ship ? this.ship.position : null,
      enemies: this.reds,
      terrain: this.terrain,
    };
    if (this.airWing) {
      const inView = this.playerView === 'squadron';
      this.airWing.update(dt, inView ? this.controls.keys : { w: false, a: false, s: false, d: false }, squadCtx);
      // Auto-pilot drops: each squadron may have requested its own-type drop.
      for (const sq of [this.airWing.torpedo, this.airWing.bomber]) {
        if (sq.autoPilot && sq.autoDrop) {
          this._release(sq, sq.type);
          sq.autoDrop = false;
        }
      }
      // Crashed active squadron -> fall back to ship view (see solo loop).
      if (inView && !this.airWing.active.alive) {
        this.playerView = 'ship';
        this.controls.viewMode = 'ship';
        if (this.onSquadronCrash) this.onSquadronCrash(this.airWing.activeType);
      }
      if (this.playerView === 'squadron') {
        this.airWing.updateGuides();
        this._updateSquadronFire();
      } else {
        this.airWing.torpedo.updateGuides(false);
        this.airWing.bomber.updateGuides(false);
      }
    }

    this.audio.updateEngineBySpeed(this.ship.alive ? this.ship.speed : 0, this.ship.maxSpeed);

    this._updateCameraAndScope();

    // Player firing — only when steering the ship (squadron mode handles its
    // own fire in _updateSquadronFire above).
    if (this.ship.alive && this.playerView === 'ship') {
      this._teamPlayerFire(dt);
    }

    // Projectiles: pass the reds as the enemy list so the player's 'player'
    // shots register hits on red ships via the standard solo collision branch.
    // Cross-faction hits that the standard branch doesn't cover (player shots
    // hitting reds that the OBB already catches, plus wingman-vs-wingman which
    // is same-faction and should be ignored) are resolved centrally in
    // _applyTeamDamage. Enemy-tagged shots still hit the player via the
    // player-hit branch of projectileManager.update.
    // AA auto-defense + ASW target setup (mirror the solo loop).
    this._updateAaDefense(dt);
    if (this._aswCooldown > 0) this._aswCooldown = Math.max(0, this._aswCooldown - dt);
    this._refreshAswTargets();
    this._updateAswStrikes(dt);
    this._updateAswIndicator(this._lastAimTarget);

    this.projectileManager.update(dt, this.ship, this.reds, this._collectAllSquadrons());
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
    // Enemy strike aircraft (the AA target) — same as the solo loop.
    this._updateEnemySquadrons(dt);
    // Team AA: reds flak the player's carrier squadrons, wingmen flak the
    // enemy strike planes (both were missing from this loop before).
    this._updateTeamAaDefense(dt);

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
      const aswFit = getClassAsw(this.shipClass);
      const aswTierCfg = aswFit ? getAswTier(aswFit.tier) : null;
      const friendliesAlive = (this.ship && this.ship.alive ? 1 : 0) +
        this.friendlies.filter(u => u && (u.isWingman || u instanceof FriendlyAIShip) && u.alive).length;
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
        turrets: this.ship.turrets.map(t => ({
          cooldown: t.cooldown,
          maxCooldown: this.ship.fireCooldown,
          isFront: t.isFront,
        })),
        secondaryTurrets: this.ship.secondaryTurrets.map(t => ({
          cooldown: t.cooldown,
          maxCooldown: SECONDARY.cooldown,
        })),
        hasSecondary: this.ship.secondaryTurrets.length > 0,
        torpedoTubes: this._torpedoCooldowns.map((cd, i) => ({
          index: i, cooldown: cd,
          side: this.ship.torpedoTubes[i]?.side || 'port', ready: cd <= 0,
        })),
        torpedoMaxCooldown: this._getTorpedoCooldown(),
        shipClass: this.shipClass,
        availableTorpedoTiers: this.controls.availableTorpedoTiers,
        gear: this.controls.gear,
        skills: this.skills.toSnapshot(),
        squadron: this._squadronHud(),
        hasAsw: !!aswTierCfg,
        aswAir: !!(aswFit && aswFit.air),
        aswCooldown: this._aswCooldown,
        aswMaxCooldown: aswTierCfg ? aswTierCfg.cooldown : 0,
        // Submarine dive state for the weapon-bar slot (B key indicator).
        dive: this.shipClass === 'submarine' && this.ship ? {
          target: !!this.ship.submerged,          // 目标状态（true=要下潜）
          transition: this.ship.diveTransition,   // 0=水面 .. 1=完全潜没
        } : null,
        // Team-specific.
        mode: 'team',
        friendliesAlive,
        friendliesTotal: 4,
        redsAlive: this.reds.filter(r => r.alive).length,
        redsTotal: 10,
        wingmen: this.friendlies
          .filter(u => u && (u.isWingman || u instanceof FriendlyAIShip))
          .map(u => ({ alive: u.alive, hp: u.hp, maxHp: u.maxHp })),
      });
    }

    if (this.onMinimapUpdate) {
      const mc = this._minimapCenter();
      this.onMinimapUpdate({
        playerPos: mc.pos,
        playerHeading: mc.heading,
        followPos: mc.followPos,
        enemies: this.reds,
        terrainImage: this._minimapTerrain,
      });
    }

    // Wingmen HUD labels: project each teammate to screen for the overlay
    // (编号 + 血条). Hidden while scoped (player is aiming, labels would
    // clutter the scope view) — consistent with how minimap/labels behave.
    if (this.onTeamLabelsUpdate) {
      // Keep BOTH matrices fresh before projecting screen-space labels:
      // _updateCameraAndScope (above) may have changed fov this frame, and
      // v.project() reads camera.projectionMatrix. Without this, labels can
      // project to stale/off-screen coords on fov transitions.
      this.camera.updateMatrixWorld();
      this.camera.updateProjectionMatrix();
      const labels = this.controls.scoped ? [] : this._computeTeamLabels();
      this.onTeamLabelsUpdate(labels);
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
    this._lastAimTarget = aimTarget;

    let currentAimYaw = 0;
    if (this.ship.turrets.length > 0) {
      currentAimYaw = aimTurretsAtPoint(this.ship, aimTarget, dt) ?? 0;
    }

    // Secondary battery training mirrors the solo flow.
    let secondaryAimYaw = 0;
    if (this.ship.secondaryTurrets.length > 0 && this.controls.weaponMode === 'secondary') {
      secondaryAimYaw = aimTurretList(
        this.ship.secondaryTurrets, this.ship.mesh, this.ship.heading, aimTarget, dt,
        SECONDARY.muzzleSpeed, SECONDARY.drag, Math.PI * 1.5,
      ) ?? 0;
    }

    if (this.playerView === 'ship' && this.controls.consumeFire()) {
      if (this.controls.weaponMode === 'torpedo' && this.ship.torpedoTubes.length > 0) {
        this._fireTorpedoes();
      } else if (this.controls.weaponMode === 'asw') {
        this._fireDepthCharges(aimTarget);
      } else if (this.controls.weaponMode === 'secondary' && this.ship.secondaryTurrets.length > 0) {
        let anyFired = false;
        const spreadMult = this.skills.isActive('precision') ? 0.7 : 1.0;
        const cdMult = this.skills.isActive('rapid_fire') ? 0.7 : 1.0;
        const barrels = this.ship.secondaryTurrets[0].barrels.length;
        for (const turret of this.ship.secondaryTurrets) {
          if (turret.cooldown <= 0 && turretCanAim(turret, secondaryAimYaw)) {
            for (let b = 0; b < barrels; b++) {
              const { origin, direction } = getTurretFireData(turret, this.ship.heading, b);
              const tdx = aimTarget.x - origin.x;
              const tdz = aimTarget.z - origin.z;
              const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
              this.projectileManager.fire(
                origin,
                applyCannonSpread(direction, tdist, this.shipClass, spreadMult),
                SECONDARY.damage, 'player', SECONDARY.muzzleSpeed, SECONDARY.drag, 'secondary',
              );
            }
            turret.cooldown = SECONDARY.cooldown * cdMult;
            anyFired = true;
          }
        }
        if (anyFired) this.audio.playFire(this.shipClass);
      } else if (!this.ship.fullySubmerged) {
        // Submerged submarines cannot fire their deck gun (it's underwater).
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
      this.controls.setAswCapability(false);
      this.controls.setSecondaryCapability(false);
      return;
    }
    const cc = CLASS_CONFIG[this.shipClass]?.[this.level];
    if (cc) {
      this.controls.setTorpedoCapabilities({ availableTiers: cc.torpedoTiers });
    }
    // ASW availability is per-class (not per-level): a ship can lob depth
    // charges iff its class has an ASW fit. Secondaries likewise (cruiser /
    // battleship side batteries). AA needs no capability flag (it's automatic
    // point-defense).
    this.controls.setAswCapability(!!getClassAsw(this.shipClass));
    this.controls.setSecondaryCapability(!!(this.ship && this.ship.secondaryTurrets.length > 0));
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

  // Place the friendly formation so every slot is on water. `faceHeading` is
  // the direction the formation faces (toward the enemy); `layout` is an array
  // of { ahead, beam } offsets in metres where ahead>0 is forward (toward the
  // enemy) and beam>0 is to the formation's right. Returns { points } in the
  // same order as `layout`, in world coords. Sweeps candidate centres until the
  // whole formation lands on water.
  _findTeamFormation(faceHeading, layout) {
    const terrain = this.terrain;
    const isWater = (x, z) => !terrain || !terrain.isLand(x, z);
    const fwdX = Math.sin(faceHeading), fwdZ = Math.cos(faceHeading);
    const beamX = Math.cos(faceHeading), beamZ = -Math.sin(faceHeading); // 90° right of fwd
    const buildAt = (cx, cz) => {
      const pts = [];
      for (const L of layout) {
        pts.push({
          x: cx + fwdX * L.ahead + beamX * L.beam,
          z: cz + fwdZ * L.ahead + beamZ * L.beam,
        });
      }
      return pts.every(p => isWater(p.x, p.z)) ? pts : null;
    };

    for (let r = 0; r <= 3000; r += 150) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
        const cx = Math.cos(a) * r;
        const cz = Math.sin(a) * r;
        const pts = buildAt(cx, cz);
        if (pts) return { points: pts };
      }
    }
    // Fallback: build the formation around the safe spawn.
    const s = this._findSafeSpawn();
    return { points: buildAt(s.x, s.z) || layout.map(L => ({
      x: s.x + fwdX * L.ahead + beamX * L.beam,
      z: s.z + fwdZ * L.ahead + beamZ * L.beam,
    })) };
  }

  // Pick an enemy patrol area: a circle of `areaRadius` centred at a water
  // point that is at least `minGap` metres from `friendlyPos`. If `bearing`
  // (a compass angle in this fn's cos/sin convention: dir=(cos b, sin b)) is
  // supplied, the area is placed straight down that bearing when possible so
  // the friendly formation's facing heading points at it. Returns
  // {cx, cz, radius}.
  _findEnemyArea(friendlyPos, minGap, areaDiameter, bearing = null) {
    const radius = areaDiameter / 2;
    const terrain = this.terrain;
    const isWater = (x, z) => !terrain || !terrain.isLand(x, z);

    // Helper: place the area centre at distance r along a given bearing and
    // validate it (water + min gap from the friendly line).
    const tryAt = (a, r) => {
      const cx = friendlyPos.x + Math.cos(a) * r;
      const cz = friendlyPos.z + Math.sin(a) * r;
      const nearestEdge = Math.hypot(cx - friendlyPos.x, cz - friendlyPos.z) - radius;
      if (nearestEdge < minGap) return null;
      if (!isWater(cx, cz)) return null;
      return { cx, cz, radius };
    };

    // Preferred bearing first: scan out along it, widening the search if the
    // chosen line is blocked by land.
    if (bearing != null) {
      for (let r = minGap + radius; r <= minGap + radius + 3000; r += 200) {
        const hit = tryAt(bearing, r);
        if (hit) return hit;
      }
    }

    // Otherwise scan all bearings.
    for (let r = minGap + radius; r <= minGap + radius + 3000; r += 200) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const hit = tryAt(a, r);
        if (hit) return hit;
      }
    }
    // Fallback: straight out from the friendly spawn.
    const ang = bearing != null ? bearing : (Math.atan2(friendlyPos.z, friendlyPos.x) + Math.PI);
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
    // Squadron (carrier aircraft) view: a high trailing chase cam behind the
    // ACTIVE squadron. The camera POSITION locks to the plane's heading (so the
    // plane stays ahead of the camera), but the camera's LOOK direction is free
    // — the mouse (orbitYaw/orbitPitch) lets the player look around without
    // dragging the plane off course. No scope in this view.
    if (this.playerView === 'squadron' && this.airWing) {
      const subj = this.airWing.active;
      const headingYaw = subj.cameraHeading;
      const camDist = 35;
      const camHeight = 25;
      const targetCamPos = new THREE.Vector3(
        subj.position.x - Math.sin(headingYaw) * camDist,
        subj.position.y + camHeight,
        subj.position.z - Math.cos(headingYaw) * camDist
      );
      this.camera.position.lerp(targetCamPos, 0.12);

      const targetFov = this.controls.normalFov || FOV_NORMAL;
      this._currentFov += (targetFov - this._currentFov) * 0.12;
      this.camera.fov = this._currentFov;
      this.camera.updateProjectionMatrix();

      if (this.onScopeChange) this.onScopeChange(false);

      // Free-look: heading + mouse orbit offset for direction; pitch from mouse.
      const worldYaw = headingYaw + this.controls.orbitYaw;
      const pitch = Math.max(-1.2, Math.min(0.4, this.controls.orbitPitch));
      const lookDir = new THREE.Vector3(
        Math.sin(worldYaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(worldYaw) * Math.cos(pitch)
      );
      this.camera.lookAt(this.camera.position.clone().add(lookDir.multiplyScalar(1000)));
      return;
    }

    const ship = this.ship;
    const scoped = this.controls.scoped;
    // 进入开镜的边沿：把当前世界朝向锚定为绝对方向，之后船身转向
    // 不再带动瞄准镜；只有鼠标移动会改 scopedWorldYaw。
    if (scoped && !this.controls._wasScoped) {
      this.controls.scopedWorldYaw = ship.heading + this.controls.orbitYaw;
    }
    this.controls._wasScoped = scoped;
    const worldYaw = scoped
      ? this.controls.scopedWorldYaw
      : ship.heading + this.controls.orbitYaw;
    const shipScale = ship.shipLength / 10;
    let targetCamPos;
    const hOff = this.controls.heightOffset || 0;
    if (scoped) {
      const scopedH = (ship.scopedCameraHeight || CAM_HEIGHT_SCOPED) + hOff;
      targetCamPos = new THREE.Vector3(
        ship.position.x,
        ship.position.y + scopedH,
        ship.position.z
      );
    } else {
      const camDist = CAM_DIST + shipScale * 5;
      const camHeight = CAM_HEIGHT + shipScale * 3 + hOff;
      targetCamPos = new THREE.Vector3(
        ship.position.x - Math.sin(worldYaw) * camDist,
        ship.position.y + camHeight,
        ship.position.z - Math.cos(worldYaw) * camDist
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
    this._fps = updateFpsEMA(this._fps, dt);

    if (this.water) {
      this.water.material.uniforms['time'].value += dt * 0.5;
      this.water.material.uniforms['uCameraPos'].value.copy(this.camera.position);
    }

    // 云的漂移时钟与水波共用同一累计值
    const skyDome = this.scene.userData.skyDome;
    if (skyDome) skyDome.material.uniforms.time.value = this.water.material.uniforms['time'].value;

    if (!this.ship) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // In squadron view the carrier keeps cruising under autopilot (no WASD);
    // the player's keys drive the squadron instead. Skip updateMotionKeys so
    // it doesn't overwrite the player's W/S altitude inputs (see team loop).
    const shipKeys = this._shipKeysForFrame();
    if (this.playerView !== 'squadron') {
      this.controls.updateMotionKeys(this.ship.speed, this.ship.maxSpeed);
    }
    this.ship.update(dt, shipKeys, this.terrain);

    // Process skills
    this.skills.update(dt, this.ship);
    const skillActs = this.controls.consumeSkillActivations();
    for (const name of skillActs) {
      this.skills.activate(name, this.ship);
    }

    // Submarine dive toggle (no-op for other classes).
    if (this.controls.consumeDiveToggle()) {
      this.ship.toggleDive();
    }

    // Carrier view toggle: T returns to the ship (or launches if pressed on
    // foot). The dedicated air-group buttons (5/6) + Tab are handled below.
    if (this.controls.consumeViewToggle()) {
      this._toggleCarrierView();
    }

    // Carrier air-group launch / switch (keys 5/6). Launches both squadrons if
    // steering; while flying, 5/6 hands control to that squadron (activates it).
    const launchGroup = this.controls.consumeSquadronLaunch();
    if (launchGroup) {
      if (this.shipClass === 'carrier') {
        if (this.playerView !== 'squadron') {
          this._enterSquadronView(launchGroup);
        } else if (this.airWing) {
          this.airWing.setActive(launchGroup);
          this._resetSquadronOrbit();
        }
      }
    }

    // Tab: switch the active squadron (torpedo <-> bomber) while flying.
    if (this.controls.consumeSquadronSwitch() && this.playerView === 'squadron' && this.airWing) {
      this.airWing.switchActive();
      this._resetSquadronOrbit();
    }

    // Carrier squadron auto-pilot toggle (key Y). Engages/disengages the ACTIVE
    // squadron's auto-attack.
    if (this.controls.consumeAutoPilotToggle() && this.shipClass === 'carrier') {
      if (!this.airWing) {
        this._enterSquadronView('torpedo');
      }
      if (this.airWing) {
        const sq = this.airWing.active;
        sq.autoPilot = !sq.autoPilot;
        sq._autoTarget = null;
      }
    }

    // Carrier patrol map toggle (M) — hand off to React for rendering.
    if (this.controls.consumeCarrierMapToggle() && this.shipClass === 'carrier' && this.onCarrierMapToggle) {
      this.onCarrierMapToggle();
    }

    // Squadron phase: both squadrons update; the active one takes player keys,
    // the inactive one cruises (or runs its own auto-pilot). autoPilot can also
    // be engaged while steering the ship (the squadron flies itself).
    const squadCtx = {
      carrierPos: this.ship ? this.ship.position : null,
      enemies: this.enemyManager.enemies,
      terrain: this.terrain,
    };
    if (this.airWing) {
      const inView = this.playerView === 'squadron';
      this.airWing.update(dt, inView ? this.controls.keys : { w: false, a: false, s: false, d: false }, squadCtx);
      for (const sq of [this.airWing.torpedo, this.airWing.bomber]) {
        if (sq.autoPilot && sq.autoDrop) {
          this._release(sq, sq.type);
          sq.autoDrop = false;
        }
      }
      // If the squadron the player is flying just crashed, fall back to the
      // ship view so the camera doesn't follow a dead/hidden aircraft. The
      // player can re-launch (T/5/6) to get a fresh, repaired squadron.
      if (inView && !this.airWing.active.alive) {
        this.playerView = 'ship';
        this.controls.viewMode = 'ship';
        if (this.onSquadronCrash) this.onSquadronCrash(this.airWing.activeType);
      }
      // A squadron shot down by enemy AA re-launches from the carrier on a
      // timer (crashes still need a manual T).
      this._updateSquadronRespawn(dt);
      if (this.playerView === 'squadron') {
        this.airWing.updateGuides();
        this._updateSquadronFire();
      } else {
        this.airWing.torpedo.updateGuides(false);
        this.airWing.bomber.updateGuides(false);
      }
    }

    if (!this.ship.alive) {
      this.audio.updateEngineBySpeed(0, this.ship.maxSpeed);
      this.projectileManager.update(dt, this.ship, this.enemyManager.enemies);
      this.enemyManager.update(dt, this._soloPlayerPos(), this.ship.heading, this.ship.speed, this.projectileManager, this.camera, this.torpedoManager);
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

    // Secondary battery: only trains while the player has it selected (the
    // side turrets hold their last bearing otherwise). Small mounts slew
    // faster than the main battery.
    let secondaryAimYaw = 0;
    if (this.ship.secondaryTurrets.length > 0) {
      if (this.controls.weaponMode === 'secondary') {
        secondaryAimYaw = aimTurretList(
          this.ship.secondaryTurrets, this.ship.mesh, this.ship.heading, aimTarget, dt,
          SECONDARY.muzzleSpeed, SECONDARY.drag, Math.PI * 1.5,
        ) ?? 0;
      }
    }

    if (this.playerView === 'ship' && this.controls.consumeFire()) {
      if (this.controls.weaponMode === 'torpedo' && this.ship.torpedoTubes.length > 0) {
        this._fireTorpedoes();
      } else if (this.controls.weaponMode === 'asw') {
        this._fireDepthCharges(aimTarget);
      } else if (this.controls.weaponMode === 'secondary' && this.ship.secondaryTurrets.length > 0) {
        // Secondary battery salvo: each side turret fires on its own cooldown,
        // one shell per barrel from that turret's own muzzles (same structure
        // as the main battery, smaller calibre ballistics).
        let anyFired = false;
        const spreadMult = this.skills.isActive('precision') ? 0.7 : 1.0;
        const cdMult = this.skills.isActive('rapid_fire') ? 0.7 : 1.0;
        const barrels = this.ship.secondaryTurrets[0].barrels.length;
        for (const turret of this.ship.secondaryTurrets) {
          if (turret.cooldown <= 0 && turretCanAim(turret, secondaryAimYaw)) {
            for (let b = 0; b < barrels; b++) {
              const { origin, direction } = getTurretFireData(turret, this.ship.heading, b);
              const tdx = aimTarget.x - origin.x;
              const tdz = aimTarget.z - origin.z;
              const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
              this.projectileManager.fire(
                origin,
                applyCannonSpread(direction, tdist, this.shipClass, spreadMult),
                SECONDARY.damage, 'player', SECONDARY.muzzleSpeed, SECONDARY.drag, 'secondary',
              );
            }
            turret.cooldown = SECONDARY.cooldown * cdMult;
            anyFired = true;
          }
        }
        if (anyFired) {
          this.audio.playFire(this.shipClass);
        }
      } else if (!this.ship.fullySubmerged) {
        // Submerged submarines cannot fire their deck gun (it's underwater).
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

    // AA auto-defense + ASW target setup for the player's ship.
    this._updateAaDefense(dt);
    if (this._aswCooldown > 0) this._aswCooldown = Math.max(0, this._aswCooldown - dt);
    this._refreshAswTargets();
    this._updateAswStrikes(dt);
    this._updateAswIndicator(aimTarget);

    this.projectileManager.update(dt, this.ship, this.enemyManager.enemies, this._collectAllSquadrons());
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
    this.enemyManager.update(dt, this._soloPlayerPos(), this.ship.heading, this.ship.speed, this.projectileManager, this.camera, this.torpedoManager);
    // Enemy ships fight back against the player's aircraft: every red ship's AA
    // battery auto-targets the nearest friendly squadron in range (solo mode
    // only — multiplayer AA is server-authoritative).
    this._updateEnemyAaDefense(dt);
    // Enemy strike aircraft (the AA target): spawn waves that fly in, bomb the
    // player, and leave — so AA + flak hit detection have something to shoot.
    this._updateEnemySquadrons(dt);

    for (const enemy of this.enemyManager.enemies) {
      if (enemy.alive && enemy.hp <= 0) {
        this.enemyManager.destroyEnemy(enemy);
        this.audio.playExplosion(this._distToPlayer(enemy.mesh.position.x, enemy.mesh.position.z));
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
      const aswFit = getClassAsw(this.shipClass);
      const aswTierCfg = aswFit ? getAswTier(aswFit.tier) : null;
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
        secondaryTurrets: this.ship.secondaryTurrets.map(t => ({
          cooldown: t.cooldown,
          maxCooldown: SECONDARY.cooldown,
        })),
        hasSecondary: this.ship.secondaryTurrets.length > 0,
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
        squadron: this._squadronHud(),
        hasAsw: !!aswTierCfg,
        aswAir: !!(aswFit && aswFit.air),
        aswCooldown: this._aswCooldown,
        aswMaxCooldown: aswTierCfg ? aswTierCfg.cooldown : 0,
        // Submarine dive state for the weapon-bar slot (B key indicator).
        dive: this.shipClass === 'submarine' && this.ship ? {
          target: !!this.ship.submerged,          // 目标状态（true=要下潜）
          transition: this.ship.diveTransition,   // 0=水面 .. 1=完全潜没
        } : null,
      });
    }

    if (this.onMinimapUpdate) {
      const mc = this._minimapCenter();
      this.onMinimapUpdate({
        playerPos: mc.pos,
        playerHeading: mc.heading,
        followPos: mc.followPos,
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
    // A carrier's air-group stats scale with level; bump the air wing if airborne.
    if (this.airWing) this.airWing.setLevel(newLevel);
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
    // Cancel the pending RAF before flipping running back on: while the class
    // overlay was up the loop had already scheduled its next frame (line ~931
    // runs before _checkLevelUp sets running=false). That pending frame sees
    // running=true again and would run a SECOND concurrent loop alongside the
    // one we request below — double-stepping dt, double-scoring kills, and
    // racing the wave-spawn check, which made enemies spawn/refresh erratically
    // after the 3→4 class pick.
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.running = true;
    this.lastTime = performance.now();
    this._applyLevelUp(3, 4);
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);
  }

  // Carrier: launch / re-enter squadron view, or return to the ship. T from the
  // ship launches the air wing (default active = torpedo); T while flying
  // returns to steering the ship.
  _toggleCarrierView() {
    if (this.shipClass !== 'carrier') return;
    if (this.playerView === 'ship') {
      this._enterSquadronView('torpedo');
    } else {
      this.playerView = 'ship';
      this.controls.viewMode = 'ship';
      this._resetSquadronOrbit();
    }
  }

  // Reset the free-look orbit offsets so re-entering squadron view (or switching
  // the active squadron) starts with a neutral, heading-aligned camera rather
  // than inheriting a leftover orbit from the previous view.
  _resetSquadronOrbit() {
    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.35;
  }

  // Launch the air wing (or re-launch an existing one) and flip the camera/input
  // over to it. Both squadrons start fully armed; re-launching refills both.
  // `group` selects which squadron is active first (5=torpedo, 6=bomber).
  _enterSquadronView(group = null) {
    if (this.shipClass !== 'carrier') return;
    if (!this.airWing) {
      this.airWing = new CarrierAirWing(
        this.scene,
        this.ship.position.x,
        this.ship.position.z,
        'player',
        this.level
      );
      if (!this.squadronManager) {
        this.squadronManager = new SquadronManager(this.scene);
      }
      this.squadronManager.add(this.airWing);
    } else {
      // Re-launch: reposition both squadrons to the carrier and top up ammo.
      this.airWing.relaunchAt(this.ship.position.x, this.ship.position.z, this.ship.heading);
    }
    if (group === 'bomber') this.airWing.setActive('bomber');
    else this.airWing.setActive('torpedo');
    this.playerView = 'squadron';
    this.controls.viewMode = 'squadron';
    this.controls.scoped = false;
    this._resetSquadronOrbit();
  }

  // Auto-respawn: a squadron SHOT DOWN by enemy AA re-launches from the
  // carrier after CARRIER.squadronRespawnDelay seconds — per squadron, so a
  // surviving wingmate keeps flying (only the dead one is rebuilt at the
  // carrier's CURRENT position/heading). Crashes (player error) are excluded:
  // those still need a manual T, keeping a small skill penalty. The enemy air
  // groups respawn symmetrically on their own wave timer
  // (_updateEnemySquadrons). If the player was flying the shot-down squadron
  // they are already back in ship view (see the crash fallback) and stay
  // there — the revived squadron just cruises until taken over.
  _updateSquadronRespawn(dt) {
    if (!this.airWing || !this.ship || !this.ship.alive) return;
    if (!this._squadronRespawnTimers) this._squadronRespawnTimers = { torpedo: 0, bomber: 0 };
    for (const type of ['torpedo', 'bomber']) {
      const sq = this.airWing[type];
      if (sq.alive || !sq.shotDown) {
        this._squadronRespawnTimers[type] = 0;
        continue;
      }
      if (this._squadronRespawnTimers[type] <= 0) {
        this._squadronRespawnTimers[type] = CARRIER.squadronRespawnDelay;
      }
      this._squadronRespawnTimers[type] -= dt;
      if (this._squadronRespawnTimers[type] <= 0) {
        this._squadronRespawnTimers[type] = 0;
        sq.relaunchAt(this.ship.position.x, this.ship.position.z, this.ship.heading);
        if (this.onSquadronRespawn) this.onSquadronRespawn(type);
      }
    }
  }

  // Squadron fire: left-click releases a salvo from the ACTIVE squadron (its own
  // type). `sq`/`type` override the active squadron — used by auto-pilot when a
  // specific squadron requests its own-type drop.
  _updateSquadronFire() {
    if (!this.airWing) return;
    if (!this.controls.consumeFire()) return;
    const sq = this.airWing.active;
    this._release(sq, sq.type);
  }

  // Actually release one salvo from the given squadron (of its own type). Bombs
  // launch with an absolute initial velocity so they follow a ballistic arc.
  _release(sq, type) {
    if (!sq) return;
    if (type === 'torpedo') {
      const drops = sq.dropTorpedo();
      if (drops.length > 0) {
        for (const d of drops) {
          // Aircraft torpedoes hit harder than hull-launched ones of the same
          // tier (CARRIER.airTorpedoDamageMul) — mirrors the server's carrier
          // drop handling.
          this.torpedoManager.fire(d.origin, d.heading, d.tier, this.level, 1, 'narrow', 'player', CARRIER.airTorpedoDamageMul);
        }
        if (this.audio) this.audio.playTorpedoLaunch();
      }
    } else {
      const drops = sq.dropBomb();
      if (drops.length > 0) {
        for (const d of drops) {
          // Build a unit direction + speed from the absolute velocity so the
          // projectile manager's `velocity = dir * muzzleSpeed` reproduces the
          // ballistic throw (forward ground speed + downward kick).
          const v = d.velocity;
          const speed = v.length();
          const dir = speed > 0 ? v.clone().multiplyScalar(1 / speed) : new THREE.Vector3(0, -1, 0);
          this.projectileManager.fire(d.origin, dir, d.damage, 'player', speed, CARRIER.bombDrag, d.weapon);
        }
        if (this.audio) this.audio.playFire('carrier');
      }
    }
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

  // Player ASW (深水炸弹) release.
  //
  // Destroyers/cruisers make a CLOSE-RANGE hull drop: the aim point is clamped
  // into the class's [min, range] band and a salvo of depth charges arcs out
  // there. Charges splash, float ASW_FUSE_DELAY seconds, then detonate with a
  // large AoE that only damages submarines — see projectile.js.
  //
  // Battleships call an AIR STRIKE instead: the aim point (clamped to the air
  // range) marks the centre of a target rectangle; an AswStrikePlane flies out
  // from over the ship and scatters the salvo across the rectangle with the
  // same fuse/AoE rules.
  _fireDepthCharges(aimTarget) {
    if (!this.ship || !this.ship.alive) return;
    if (this.ship.fullySubmerged) return;       // launchers underwater
    const asw = getClassAsw(this.shipClass);
    const tierCfg = asw ? getAswTier(asw.tier) : null;
    if (!asw || !tierCfg) return;

    // Per-ship ASW release cooldown (one salvo per window).
    if (this._aswCooldown == null) this._aswCooldown = 0;
    if (this._aswCooldown > 0) return;

    const target = clampAswAim(this.ship.position, aimTarget, asw);

    if (asw.air) {
      // Battleship: launch a strike plane from over the ship toward the marked
      // rectangle; it releases the fused charges itself as it overflies it.
      const strike = new AswStrikePlane(
        this.scene, this.ship.position.x, this.ship.position.z, target, tierCfg,
      );
      this._aswStrikes.push(strike);
      this._aswCooldown = tierCfg.cooldown;
      if (this.audio) this.audio.playFire('carrier');
      return;
    }

    // Surface hull drop: lob the salvo at sub-points around the clamped point.
    const originY = 3.0;
    const salvo = tierCfg.salvo;
    const spread = tierCfg.spread;
    for (let i = 0; i < salvo; i++) {
      // Spread sub-points in a small disc around the clamped aim point.
      const ang = salvo > 1 ? (i / salvo) * Math.PI * 2 : 0;
      const rad = salvo > 1 ? spread * (0.4 + 0.6 * ((i * 7) % 5) / 4) : 0;
      const tx = target.x + Math.cos(ang) * rad;
      const tz = target.z + Math.sin(ang) * rad;
      // Short ballistic arc toward the sub-point (mirrors the server calc).
      const sdx = tx - this.ship.position.x;
      const sdz = tz - this.ship.position.z;
      const horiz = Math.sqrt(sdx * sdx + sdz * sdz);
      let pitch, yaw;
      if (horiz < 1) {
        pitch = Math.PI / 4;
        yaw = 0;
      } else {
        const v2 = ASW_MUZZLE_SPEED * ASW_MUZZLE_SPEED;
        const v4 = v2 * v2;
        const disc = v4 - CFG_GRAVITY * (CFG_GRAVITY * horiz * horiz + 2 * (0 - originY) * v2);
        pitch = disc < 0 ? Math.PI / 6 : Math.atan((v2 - Math.sqrt(disc)) / (CFG_GRAVITY * horiz));
        pitch = Math.max(0, Math.min(60 * Math.PI / 180, pitch));
        yaw = Math.atan2(sdx, sdz);
      }
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch),
      );
      this.projectileManager.fire(
        new THREE.Vector3(this.ship.position.x, originY, this.ship.position.z),
        dir, tierCfg.damage, 'player', ASW_MUZZLE_SPEED, ASW_DRAG, 'depth_charge',
      );
    }
    this._aswCooldown = tierCfg.cooldown;
    if (this.audio) this.audio.playFire(this.shipClass);
  }

  // Advance in-flight battleship ASW strike planes (solo/team local sim — the
  // multiplayer server flies its own and the engine only renders the snapshot).
  // Each released charge becomes a normal `weapon='depth_charge'` projectile
  // that splashes and detonates on its fuse.
  _updateAswStrikes(dt) {
    for (let i = this._aswStrikes.length - 1; i >= 0; i--) {
      const strike = this._aswStrikes[i];
      strike.update(dt, (x, z, damage) => {
        this.projectileManager.fire(
          new THREE.Vector3(x, ASW_AIR.altitude, z),
          new THREE.Vector3(0, -1, 0), damage, 'player', 40, 0.02, 'depth_charge',
        );
      });
      if (strike.done) {
        strike.destroy();
        this._aswStrikes.splice(i, 1);
      }
    }
  }

  // Refresh the depth-charge aim indicator (fan band for surface ships, target
  // rectangle for battleship air strikes). aimTarget is the crosshair's world
  // point this frame (stored by the loops).
  _updateAswIndicator(aimTarget) {
    if (!this.aswIndicator) return;
    const fit = getClassAsw(this.shipClass);
    const tierCfg = fit ? getAswTier(fit.tier) : null;
    const active = this.controls.weaponMode === 'asw' && this.ship && this.ship.alive
      && this.playerView === 'ship' && fit && tierCfg;
    if (!active || !aimTarget) {
      this.aswIndicator.update(false, null, null, null, null, null, null);
      return;
    }
    const clamped = clampAswAim(this.ship.position, aimTarget, fit);
    this.aswIndicator.update(
      true, fit.air ? 'air' : 'drop', this.ship.position,
      { x: aimTarget.x, z: aimTarget.z }, clamped, fit, tierCfg,
    );
  }

  // Automatic AA point-defense for the PLAYER's ship: each AA turret trains on
  // the nearest hostile squadron in range (full 360° + elevation, straight-line
  // aim like a proximity-fused shell) and fires from its own raised muzzle once
  // trained, on its own cooldown. Enemy aircraft come from this.airWing (enemy
  // carriers' wings) + any squadron manager wings marked hostile. Mirrors the
  // server _fire_aa_defenses (which fires from the same mount positions).
  // Friendly aircraft (this.airWing when the player is a carrier) are never
  // targeted. Fully automatic — the player cannot control AA.
  _updateAaDefense(dt) {
    if (!this.ship || !this.ship.alive) return;
    const aa = getClassAa(this.shipClass);
    const mounts = this.ship.aaMounts || [];
    if (!aa || !aa.tier || mounts.length === 0) return;
    const tierCfg = getAaTier(aa.tier);
    if (!tierCfg) return;

    const hostiles = this._collectHostileSquadrons();
    const r2 = tierCfg.range * tierCfg.range;
    const shipX = this.ship.position.x;
    const shipZ = this.ship.position.z;

    for (const mount of mounts) {
      // Nearest hostile squadron in range for this mount.
      let best = null, bestD2 = r2;
      for (const sq of hostiles) {
        if (!sq || !sq.alive) continue;
        const dx = sq.position.x - shipX;
        const dz = sq.position.z - shipZ;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = sq; }
      }
      if (!best) continue;

      // Train the mount (fast slew); fire only once roughly on-target so the
      // shell visually leaves the barrels pointing at the aircraft.
      if (!aimAaMountAtPoint(mount, this.ship.heading, best.position, dt)) continue;
      if (mount.cooldown > 0) continue;

      const barrels = mount.barrels.length;
      for (let b = 0; b < barrels; b++) {
        const { origin, direction } = getTurretFireData(mount, this.ship.heading, b);
        this.projectileManager.fire(
          origin,
          direction,
          tierCfg.damage, 'player', tierCfg.muzzleSpeed, AA_DRAG, 'flak',
        );
      }
      mount.cooldown = tierCfg.cooldown;
    }
  }

  // All squadrons the player's AA may shoot at: in solo/team there are no enemy
  // carriers by default, but if enemy air wings exist (stage 4) they'd surface
  // here. Returns [] when none.
  _collectHostileSquadrons() {
    const out = [];
    // Enemy air wings owned by the engine (added by stage-4 enemy carriers).
    if (this._enemySquadrons) out.push(...this._enemySquadrons);
    return out;
  }

  // Enemy-side AA auto-defense (solo mode): the mirror of _updateAaDefense —
  // every enemy ship's AA battery trains on the nearest PLAYER squadron (the
  // carrier air wing) in range and fires faction-tagged flak at it. The hit
  // itself resolves in projectile.js (enemy flak only damages player-owned
  // squadrons). No-op unless the player is a carrier with aircraft airborne.
  _updateEnemyAaDefense(dt) {
    if (!this.enemyManager) return;
    this._runAaDefense(dt, this.enemyManager.enemies, this._playerWingSquadrons());
  }

  // Team-mode AA: the red ships flak the player's carrier squadrons (mirroring
  // the solo behaviour), and the wingmen flak the engine-spawned enemy strike
  // planes — both were previously never driven in the team loop.
  _updateTeamAaDefense(dt) {
    this._runAaDefense(dt, this.reds, this._playerWingSquadrons());
    const wingmen = (this.teamUnits || []).filter(u => u && u.isWingman);
    this._runAaDefense(dt, wingmen, this._enemySquadrons || []);
  }

  // Drive every listed unit's automatic AA mounts against the given hostile
  // squadrons. Faction tagging on the projectiles keeps friendly fire out
  // (projectile.js skips squadrons whose owner matches the shooter faction).
  _runAaDefense(dt, units, hostiles) {
    for (const u of (units || [])) {
      if (!u.updateAaDefense) continue;
      u.updateAaDefense(dt, hostiles, this.projectileManager);
    }
  }

  // The player's live carrier squadrons, as a hostile list for red AA.
  _playerWingSquadrons() {
    const wing = this.airWing;
    const out = [];
    if (wing) {
      if (wing.torpedo && wing.torpedo.alive) out.push(wing.torpedo);
      if (wing.bomber && wing.bomber.alive) out.push(wing.bomber);
    }
    return out;
  }

  // Spawn + drive enemy strike aircraft so AA has a target. A wave is a single
  // dive-bomber squadron (aircraft.js Squadron, owner='enemy') that spawns off-
  // map, flies straight at the player, drops its bomb load when in range, then
  // flies off and despawns. Shot down by flak (projectile.js) it just dies. Only
  // active from level 4+ (where AA / ASW come online) and gated by a cooldown so
  // it's a periodic threat, not constant.
  _updateEnemySquadrons(dt) {
    if (!this.ship || !this.ship.alive) return;
    if (this.level < 4) return;

    // Cooldown before the next wave can spawn.
    if (this._enemySquadronTimer == null) this._enemySquadronTimer = 8 + Math.random() * 8;
    this._enemySquadronTimer -= dt;

    // Cull dead / departed squadrons.
    this._enemySquadrons = (this._enemySquadrons || []).filter(sq => {
      if (!sq.alive) {
        // Shot down by the player's AA — mirror the player-side auto respawn:
        // the replacement wave re-departs within squadronRespawnDelay instead
        // of waiting out the full wave cadence.
        this._enemySquadronTimer = Math.min(this._enemySquadronTimer, CARRIER.squadronRespawnDelay);
        sq.destroy && sq.destroy();
        return false;
      }
      const dx = sq.position.x - this.ship.position.x;
      const dz = sq.position.z - this.ship.position.z;
      if (Math.hypot(dx, dz) > 4000) { sq.destroy && sq.destroy(); return false; }
      return true;
    });

    // Spawn a new wave on the timer.
    if (this._enemySquadronTimer <= 0 && this._enemySquadrons.length < 2) {
      this._spawnEnemyStrikeSquadron();
      this._enemySquadronTimer = 18 + Math.random() * 14;
    }

    // Drive each squadron: steer toward the player + drop when in range.
    const tgt = this.ship.position;
    for (const sq of this._enemySquadrons) {
      if (!sq.alive) continue;
      const dx = tgt.x - sq.position.x;
      const dz = tgt.z - sq.position.z;
      const dist = Math.hypot(dx, dz);
      const desired = Math.atan2(dx, dz);
      // Simple direct steer toward the player (no full auto-pilot state machine).
      let diff = desired - sq.heading;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const step = CARRIER.aircraftTurnRate * dt;
      sq.heading += Math.max(-step, Math.min(step, diff));
      sq.position.x += Math.sin(sq.heading) * sq.speed * dt;
      sq.position.z += Math.cos(sq.heading) * sq.speed * dt;
      sq.mesh.position.copy(sq.position);
      sq.mesh.rotation.y = sq.heading;
      // Drop bombs when close + roughly pointed at the player.
      if (dist < CARRIER.autoAttackRange && sq.cd <= 0 && sq.ammo > 0 &&
          Math.abs(diff) < CARRIER.autoAimTolerance) {
        const drops = sq.dropBomb();
        for (const d of drops) {
          const v = d.velocity;
          const speed = v.length();
          const dir = speed > 0 ? v.clone().multiplyScalar(1 / speed) : new THREE.Vector3(0, -1, 0);
          this.projectileManager.fire(d.origin, dir, d.damage, 'enemy', speed, CARRIER.bombDrag, d.weapon);
        }
      }
      if (sq.cd > 0) sq.cd = Math.max(0, sq.cd - dt);
    }
  }

  // Spawn one enemy dive-bomber squadron off-map, headed at the player.
  _spawnEnemyStrikeSquadron() {
    const ang = Math.random() * Math.PI * 2;
    const r = 2500;
    const sx = this.ship.position.x + Math.cos(ang) * r;
    const sz = this.ship.position.z + Math.sin(ang) * r;
    const sq = new Squadron(this.scene, sx, sz, 'enemy', this.level, 'bomber');
    // Point it at the player.
    sq.heading = Math.atan2(this.ship.position.x - sx, this.ship.position.z - sz);
    sq.mesh.position.copy(sq.position);
    sq.mesh.rotation.y = sq.heading;
    this._enemySquadrons.push(sq);
  }

  // Every squadron in play (for flak hit detection — faction is filtered inside
  // projectile.js by owner). Includes the player's own wing + enemy wings.
  _collectAllSquadrons() {
    const out = [];
    if (this.airWing) {
      if (this.airWing.torpedo) out.push(this.airWing.torpedo);
      if (this.airWing.bomber) out.push(this.airWing.bomber);
    }
    if (this._enemySquadrons) out.push(...this._enemySquadrons);
    return out;
  }

  // Build the ASW target list: every submarine that depth charges may damage.
  // Includes the player ship (if a sub) and any enemy submarines. In solo/team
  // the player sub can't depth-charge itself (filtered in _detonateDepthCharge),
  // but enemy subs are fair game.
  _refreshAswTargets() {
    const subs = [];
    if (this.ship && this.ship.shipClass === 'submarine') subs.push(this.ship);
    for (const e of (this.enemyManager ? this.enemyManager.enemies : [])) {
      if (e && e.alive && e.shipClass === 'submarine') subs.push(e);
    }
    for (const u of (this.teamUnits || [])) {
      if (u && u.alive && u.shipClass === 'submarine') subs.push(u);
    }
    if (this.projectileManager) this.projectileManager.setAswTargets(subs);
  }

  _updateTorpedoCooldowns(dt) {
    for (let i = 0; i < this._torpedoCooldowns.length; i++) {
      if (this._torpedoCooldowns[i] > 0) {
        this._torpedoCooldowns[i] -= dt;
      }
    }
  }

  // Carrier air-group HUD block: ammo / cooldown / salvo for BOTH squadrons plus
  // which one is active. Null when not a carrier or no air wing yet. `torpedo`
  // and `bomber` report each squadron's pool; `activeType` says which the player
  // currently flies (HUD highlights it).
  _squadronHud() {
    const cfg = getAirGroupConfig(this.level);
    const wing = this.airWing;
    if (!wing) {
      return {
        carrier: this.shipClass === 'carrier',
        view: this.playerView,
        activeType: 'torpedo',
        airborne: false,
        autoPilot: false,
        autoPhase: 'idle',
        rearming: false,
        patrol: null,
        hp: CARRIER.aircraftHp, maxHp: CARRIER.aircraftHp,
        altitude: CARRIER.aircraftAltitude,
        maxAlt: CARRIER.aircraftMaxAlt, minAlt: CARRIER.aircraftCrashAlt,
        torpedo: { ammo: 0, maxAmmo: cfg.torpedo.ammo, cd: 0, maxCd: cfg.torpedo.cd, salvo: cfg.torpedo.salvo, autoPilot: false },
        bomber: { ammo: 0, maxAmmo: cfg.bomber.ammo, cd: 0, maxCd: cfg.bomber.cd, salvo: cfg.bomber.salvo, autoPilot: false },
        // Auto-respawn countdowns (s remaining, 0 = none pending) for shot-down
        // squadrons — available for HUD display.
        respawn: { torpedo: 0, bomber: 0 },
      };
    }
    const t = wing.torpedo, b = wing.bomber;
    const active = wing.active;
    // Rearming flag: the ACTIVE squadron within rearmRange of the carrier.
    let rearming = false;
    if (this.ship) {
      const dx = active.position.x - this.ship.position.x;
      const dz = active.position.z - this.ship.position.z;
      rearming = dx * dx + dz * dz <= CARRIER.rearmRange * CARRIER.rearmRange;
    }
    return {
      carrier: true,
      view: this.playerView,
      activeType: wing.activeType,
      airborne: this.playerView === 'squadron' && active.alive,
      autoPilot: !!active.autoPilot,
      autoPhase: active._autoPhase || 'idle',
      rearming,
      patrol: this.carrierPatrol ? { idx: this.carrierPatrol.idx, count: this.carrierPatrol.points.length } : null,
      // Active squadron's survivability + altitude for the HUD (health bar +
      // altimeter). Both squadrons track their own HP; only the flown one shows.
      hp: active.hp, maxHp: active.maxHp,
      altitude: active.altitude,
      maxAlt: CARRIER.aircraftMaxAlt, minAlt: CARRIER.aircraftCrashAlt,
      torpedo: { ammo: t.ammo, maxAmmo: t.maxAmmo, cd: t.cd, maxCd: cfg.torpedo.cd, salvo: cfg.torpedo.salvo, autoPilot: !!t.autoPilot, autoPhase: t._autoPhase || 'idle' },
      bomber: { ammo: b.ammo, maxAmmo: b.maxAmmo, cd: b.cd, maxCd: cfg.bomber.cd, salvo: cfg.bomber.salvo, autoPilot: !!b.autoPilot, autoPhase: b._autoPhase || 'idle' },
      // Auto-respawn countdowns (s remaining, 0 = none pending) for shot-down
      // squadrons — available for HUD display.
      respawn: {
        torpedo: Math.max(0, this._squadronRespawnTimers?.torpedo || 0),
        bomber: Math.max(0, this._squadronRespawnTimers?.bomber || 0),
      },
    };
  }

  _getTorpedoCooldown() {
    const tier = this.controls.torpedoTier;
    const base = TORPEDO_TIERS[tier];
    if (!base) return 8;
    const levelsAbove4 = Math.max(0, this.level - 4);
    return base.baseCooldown * Math.pow(0.95, levelsAbove4);
  }

  // Tear down any carrier air-wing state from the previous round. Called on
  // start()/startTeam()/destroy() so a re-launched match begins with NO leftover
  // squadron meshes and a ship view — otherwise the stale CarrierAirWing (whose
  // meshes may have been disposed with the scene) makes `_enterSquadronView`
  // relaunch onto dead geometry and the aircraft model fails to render.
  _resetCarrierState() {
    if (this.airWing) {
      this.airWing.destroy();
      this.airWing = null;
    }
    // Clear any enemy strike squadrons (their meshes live in the scene).
    if (this._enemySquadrons) {
      for (const sq of this._enemySquadrons) { try { sq.destroy(); } catch (e) { /* already gone */ } }
      this._enemySquadrons = [];
    }
    this._enemySquadronTimer = null;
    this.squadronManager = null;
    this.playerView = 'ship';
    if (this.controls) this.controls.viewMode = 'ship';
    this.carrierPatrol = null;
    // Drop any in-flight local ASW strike planes + reset the release cooldown.
    for (const strike of this._aswStrikes) strike.destroy();
    this._aswStrikes = [];
    this._aswCooldown = 0;
    this._lastAimTarget = null;
    if (this.aswIndicator) this.aswIndicator.update(false, null, null, null, null, null, null);
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
    // Destroy any carrier air-wing (squadron meshes) before the renderer goes.
    this._resetCarrierState();
    // Team-mode units aren't owned by EnemyManager; remove their meshes.
    for (const u of this.teamUnits) {
      if (u.mesh) this.scene.remove(u.mesh);
    }
    this.teamUnits = [];
    this.friendlies = [];
    this.reds = [];
    if (this.renderer) this.renderer.dispose();
    if (this.aswIndicator) this.aswIndicator.destroy();
    for (const strike of this._aswStrikes) strike.destroy();
    this._aswStrikes = [];
    this._lastAimTarget = null;
  }
}
