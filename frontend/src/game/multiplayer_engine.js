import * as THREE from 'three';
import { createScene, createRenderer, createCamera, applyHalfLambert } from './scene.js';
import { createWater } from './water.js';
import { Terrain } from './terrain.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { WSClient } from './ws_client.js';
import { InputSender } from './input_sender.js';
import { EntityInterpolator } from './entity_interpolator.js';
import { reconcile } from './reconciliation.js';
import { BASE_MAX_SPEED } from './config.js';
import { Ship, CLASS_CONFIG, getDriftConfig } from './ship.js';
import { updateTurrets, calcBallisticAngles, turretCanAim, applyCannonSpread } from './turret.js';
import { ProjectileManager } from './projectile.js';
import { TorpedoManager, TORPEDO_TIERS } from './torpedo.js';

const CAM_DIST = 30;
const CAM_HEIGHT = 15;
const CAM_DIST_SCOPED = 8;
const CAM_HEIGHT_SCOPED = 5;
const FOV_NORMAL = 60;
const FOV_SCOPED = 15;
const RAYCASTER = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);

export class MultiplayerEngine {
  constructor() {
    this.running = false;
    this.animFrameId = null;
    this.lastTime = 0;
    this.ws = new WSClient();
    this.inputSender = new InputSender(this.ws);
    this.interpolator = new EntityInterpolator();
    this.audio = new AudioManager();
    this.controls = null;
    this.onHudUpdate = null;
    this.onMinimapUpdate = null;
    this.onGameOver = null;
    this.onDisconnect = null;
    this.onGameStart = null;
    this.onError = null;
    this.onRoomUpdate = null;
    this.onCountdown = null;
    this.onScopeChange = null;
    this.onShipLabelsUpdate = null;
    this._eliminated = false;

    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.terrain = null;
    this.water = null;

    // Local prediction state
    this.localShip = null;
    this.otherShips = {};
    this._gameStarted = false;
    this._myId = null;
    this._ping = 0;
    this._aimTarget = new THREE.Vector3();
    this._currentFov = FOV_NORMAL;
    this._torpedoCooldowns = [];
    this._localProjMgr = null;
    this._minimapTerrain = null;
    this._projectileMeshes = new Map(); // id -> mesh
    this._projectileGeometry = null;
    this._projectileMaterial = null;
    this.torpedoManager = null;
    this._myRespawns = 0;
    this._localTeam = null;
    this._labelTempVec = new THREE.Vector3();
  }

  init(canvas) {
    // If already initialized with the same canvas, skip
    if (this._initDone && this.renderer?.domElement === canvas) return;

    // If re-initializing with a new canvas (React Strict Mode remount),
    // dispose the old renderer and recreate it
    if (this._initDone && this.renderer?.domElement !== canvas) {
      if (this._rCleanup) this._rCleanup();
      this.renderer.dispose();
      const { renderer, cleanup: rCleanup } = createRenderer(canvas);
      this.renderer = renderer;
      this._rCleanup = rCleanup;
      this.canvas = canvas;
      // Rebind Controls to the new canvas — without this, click/pointerlock
      // listeners stay attached to the (now-detached) old canvas, so the user
      // can never lock the pointer and mouse input / number keys stop working.
      if (this.controls) this.controls.attachCanvas(canvas);
      return;
    }

    // First-time initialization
    this._initDone = true;
    this.canvas = canvas;
    this.scene = createScene();
    const { renderer, cleanup: rCleanup } = createRenderer(canvas);
    this.renderer = renderer;
    this._rCleanup = rCleanup;
    const { camera, cleanup: cCleanup } = createCamera();
    this.camera = camera;
    this._cCleanup = cCleanup;
    this.controls = new Controls(canvas);
    this.running = true;
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);

    this._projectileGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    this._projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff6644 });

    // Wire up WS handlers
    this.ws.onMessage = (msg) => this._handleMessage(msg);
    this.ws.onDisconnect = () => {
      if (this.onDisconnect) this.onDisconnect();
    };
  }

  connect(token, userId) {
    this._myId = userId;
    this.ws.connect(token);
  }

  createRoom(mode, level = 1, shipClass = null, respawnLimit = 0) {
    this.ws.send({ type: 'create_room', mode, level, shipClass, respawnLimit });
  }

  joinRoom(roomId) {
    this.ws.send({ type: 'join_room', roomId });
  }

  quickMatch(mode, level = 1, shipClass = null, respawnLimit = 0) {
    this.ws.send({ type: 'quick_match', mode, level, shipClass, respawnLimit });
  }

  ready() {
    this.ws.send({ type: 'ready' });
  }

  leaveRoom() {
    this.ws.send({ type: 'leave_room' });
  }

  _handleMessage(msg) {
    const type = msg.type;

    if (type === 'room_created' || type === 'room_joined') {
      this._currentRoomId = msg.roomId;
      this._roomMode = msg.mode;
      this._roomLevel = msg.roomLevel || 1;
      this._respawnLimit = msg.respawnLimit || 0;
      if (this.onRoomUpdate) {
        this.onRoomUpdate({
          roomId: msg.roomId,
          mode: msg.mode,
          roomLevel: msg.roomLevel || 1,
          respawnLimit: msg.respawnLimit || 0,
          players: msg.players,
          terrainSeed: msg.terrainSeed,
          islands: msg.islands,
        });
      }
    }

    if (type === 'room_update') {
      this._roomMode = msg.mode || this._roomMode;
      this._roomLevel = msg.roomLevel || this._roomLevel || 1;
      this._respawnLimit = msg.respawnLimit ?? this._respawnLimit;
      if (this.onRoomUpdate) {
        this.onRoomUpdate({
          roomId: this._currentRoomId,
          mode: this._roomMode,
          roomLevel: this._roomLevel,
          respawnLimit: this._respawnLimit,
          players: msg.players,
        });
      }
    }

    if (type === 'countdown') {
      if (this.onCountdown) this.onCountdown(msg.seconds);
    }

    if (type === 'game_start') {
      this._startGame(msg);
    }

    if (type === 'snapshot') {
      this._processSnapshot(msg);
    }

    if (type === 'game_end') {
      this._gameStarted = false;
      this._eliminated = false;
      if (this.onGameOver) {
        this.onGameOver(msg.results);
      }
    }

    if (type === 'player_eliminated') {
      this._eliminated = true;
      if (this.onEliminated) {
        this.onEliminated();
      }
    }

    if (type === 'error') {
      if (this.onError) this.onError(msg.msg);
    }

    if (type === 'chat') {
      if (this.onChat) this.onChat(msg);
    }
  }

  _startGame(msg) {
    this._cleanupGame();

    try { this.audio.init(); this.audio.startAmbient(); this.audio.startBGM(); } catch (e) { /* audio unavailable */ }

    // Create terrain from server seed/islands
    this.terrain = new Terrain(this.scene, msg.terrainSeed, msg.islands);
    this.water = createWater(this.scene);
    this._minimapTerrain = this.terrain.generateMinimapImage?.() || null;

    // Create torpedo manager for rendering
    this.torpedoManager = new TorpedoManager(this.scene, this.terrain, this.audio);
    this._localProjMgr = new ProjectileManager(this.scene, this.terrain, this.audio);

    // Find my player data
    const myPlayer = msg.players.find(p => p.id === this._myId);
    const myLevel = myPlayer?.level || this._roomLevel || 1;
    const myClass = myPlayer?.shipClass || null;

    // Create local ship (for rendering)
    this.localShip = {
      pos_x: 0, pos_z: 0,
      heading: 0, velocityHeading: 0, speed: 0,
      hp: 100, max_hp: 100,
      max_speed: BASE_MAX_SPEED,
      turn_radius: 20,
      alive: true,
      level: myLevel,
      shipClass: myClass,
      ship: null,
      mesh: null,
    };

    // Create detailed ship model
    this._createLocalShipMesh();

    // Set torpedo capabilities
    this._updateControlsCapabilities();
    this._torpedoCooldowns = this.localShip.ship.torpedoTubes.map(() => 0);

    // Clean up old other ships
    for (const id in this.otherShips) {
      this.otherShips[id].ship.destroy();
    }
    this.otherShips = {};
    this.interpolator.clear();

    // Initialize respawn count from server game_start message (definitive source)
    this._myRespawns = msg.respawnLimit ?? this._respawnLimit ?? 0;
    this._respawnLimit = this._myRespawns;

    this._gameStarted = true;
    this._eliminated = false;
    this._ping = 0;
    this._localTeam = null;

    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.18;
    this.controls.keys = { w: false, a: false, s: false, d: false };
    this.controls.gear = 1;

    // Notify App that game has started
    if (this.onGameStart) this.onGameStart();
  }

  _updateControlsCapabilities() {
    if (!this.localShip) return;
    const shipClass = this.localShip.shipClass;
    const level = this.localShip.level;
    if (!shipClass || level < 4) {
      this.controls.setTorpedoCapabilities({ availableTiers: [] });
      return;
    }
    const cc = CLASS_CONFIG[shipClass]?.[level];
    if (cc) {
      this.controls.setTorpedoCapabilities({ availableTiers: cc.torpedoTiers });
    }
  }

  _createLocalShipMesh() {
    const ship = new Ship(this.scene, this.localShip.level, this.localShip.shipClass);
    ship.mesh.position.set(this.localShip.pos_x, 0, this.localShip.pos_z);
    ship.mesh.visible = false; // hidden until first server snapshot arrives
    this.localShip.ship = ship;
    this.localShip.mesh = ship.mesh;
    this.localShip.max_speed = ship.maxSpeed;
    this.localShip.turn_radius = ship.turnRadius;
    this.localShip.hp = ship.maxHp;
    this.localShip.max_hp = ship.maxHp;
  }

  _findAimTarget() {
    RAYCASTER.setFromCamera(SCREEN_CENTER, this.camera);

    // Try to hit other player ships
    const otherMeshes = [];
    for (const id in this.otherShips) {
      const entry = this.otherShips[id];
      if (entry.lastAlive && entry.ship.mesh) {
        otherMeshes.push(entry.ship.mesh);
      }
    }
    if (otherMeshes.length > 0) {
      const hits = RAYCASTER.intersectObjects(otherMeshes, true);
      if (hits.length > 0) {
        this._aimTarget.copy(hits[0].point);
        return this._aimTarget;
      }
    }

    // Fall back to water/terrain intersection
    const ray = RAYCASTER.ray;
    if (ray.direction.y < 0) {
      const t = -ray.origin.y / ray.direction.y;
      if (t > 0) {
        this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, t);
        if (this.terrain) {
          const th = this.terrain.getHeightAt?.(this._aimTarget.x, this._aimTarget.z);
          if (th > 0) this._aimTarget.y = th;
        }
        return this._aimTarget;
      }
    }

    this._aimTarget.copy(ray.origin).addScaledVector(ray.direction, 500);
    return this._aimTarget;
  }

  _processSnapshot(msg) {
    // Compute ping from echoed client timestamp (RTT / 2)
    if (msg.cts) {
      this._ping = Math.round((Date.now() - msg.cts) / 2);
    }

    // Reconcile local ship
    if (msg.you && this.localShip) {
      const serverState = msg.you;
      this.inputSender.confirmInput(msg.lpi || 0);

      // Update respawn count
      this._myRespawns = serverState.rspn || 0;

      // Track local team for friend/foe detection
      this._localTeam = serverState.team ?? null;

      // Show ship on first snapshot
      if (!this.localShip.ship.mesh.visible) {
        this.localShip.pos_x = serverState.x;
        this.localShip.pos_z = serverState.z;
        this.localShip.heading = serverState.h;
        this.localShip.velocityHeading = serverState.vh ?? serverState.h;
        this.localShip.speed = serverState.spd;
        this.localShip.ship.mesh.position.set(serverState.x, 0, serverState.z);
        this.localShip.ship.mesh.rotation.y = serverState.h;
        this.localShip.ship.position.set(serverState.x, 0, serverState.z);
        this.localShip.ship.mesh.visible = true;
      }

      // Check for level upgrade
      if (serverState.lvl && serverState.lvl !== this.localShip.level) {
        this.localShip.level = serverState.lvl;
        if (this.localShip.ship) {
          this.localShip.ship.upgradeToLevel(serverState.lvl);
          this.localShip.mesh = this.localShip.ship.mesh;
          this.localShip.max_speed = this.localShip.ship.maxSpeed;
          this.localShip.turn_radius = this.localShip.ship.turnRadius;
          this._updateControlsCapabilities();
          this._torpedoCooldowns = this.localShip.ship.torpedoTubes.map(() => 0);
        }
      }

      if (!serverState.alive && this.localShip.alive) {
        this.localShip.alive = false;
        this.localShip.hp = 0;
        if (this.localShip.ship) this.localShip.ship.sink();
      } else if (serverState.alive && !this.localShip.alive) {
        // Respawned
        this.localShip.alive = true;
        this.localShip.hp = serverState.hp;
        this.localShip.max_hp = serverState.mhp;
        this.localShip.pos_x = serverState.x;
        this.localShip.pos_z = serverState.z;
        this.localShip.heading = serverState.h;
        this.localShip.velocityHeading = serverState.h;
        this.localShip.speed = 0;
        this._eliminated = false;
        if (this.localShip.ship) {
          this.localShip.ship.mesh.position.set(serverState.x, 0, serverState.z);
          this.localShip.ship.mesh.rotation.y = serverState.h;
          this.localShip.ship.mesh.visible = true;
          this.localShip.ship.position.set(serverState.x, 0, serverState.z);
        }
      } else if (serverState.alive) {
        reconcile(this.localShip, serverState, this.inputSender.getPendingInputs());
        this.localShip.hp = serverState.hp;
        this.localShip.max_hp = serverState.mhp;
      }
    }

    // Interpolate other players
    if (msg.others) {
      this.interpolator.update(msg.others, 0.05);
      this._syncOtherShipMeshes(msg.others);
    }

    // Update projectile visuals
    if (msg.projs) {
      this._updateProjectileVisuals(msg.projs);
    }

    // Update torpedo visuals from server data
    if (msg.torps) {
      this._updateTorpedoVisuals(msg.torps);
    }

    // Process events — only play explosion for events involving the local player
    if (msg.evts) {
      const me = String(this._myId ?? '');
      for (const evt of msg.evts) {
        if (evt.type === 'hit' || evt.type === 'kill') {
          const target = String(evt.target ?? '');
          const attacker = String(evt.attacker ?? evt.destroyed_by ?? '');
          if (target === me || attacker === me) {
            if (evt.weapon === 'torpedo') {
              this.audio.playTorpedoHit();
            } else {
              this.audio.playExplosion();
            }
          }
        }
      }
    }
  }

  _updateProjectileVisuals(projs) {
    // Only render remote player projectiles from server data
    // Local player projectiles are rendered by _localProjMgr
    const myId = String(this._myId ?? '');
    const remote = this._localProjMgr
      ? projs.filter(p => String(p.owner) !== myId)
      : projs;
    const activeIds = new Set();

    for (const p of remote) {
      activeIds.add(p.id);
      let entry = this._projectileMeshes.get(p.id);
      if (!entry) {
        const mesh = new THREE.Mesh(this._projectileGeometry, this._projectileMaterial);
        this.scene.add(mesh);

        // Trail
        const trailGeo = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(60 * 3);
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailMat = new THREE.PointsMaterial({
          color: 0xff6644,
          size: 1.2,
          transparent: true,
          opacity: 0.85,
        });
        const trail = new THREE.Points(trailGeo, trailMat);
        this.scene.add(trail);

        entry = { mesh, trail, trailData: [] };
        this._projectileMeshes.set(p.id, entry);
      }
      entry.mesh.position.set(p.x, p.y, p.z);

      // Update trail
      entry.trailData.push({ x: p.x, y: p.y, z: p.z });
      if (entry.trailData.length > 60) entry.trailData.shift();
      const positions = entry.trail.geometry.attributes.position.array;
      for (let j = 0; j < 60; j++) {
        if (j < entry.trailData.length) {
          const tp = entry.trailData[j];
          positions[j * 3] = tp.x;
          positions[j * 3 + 1] = tp.y;
          positions[j * 3 + 2] = tp.z;
        } else {
          positions[j * 3 + 1] = -100;
        }
      }
      entry.trail.geometry.attributes.position.needsUpdate = true;
    }

    // Remove meshes for projectiles no longer in snapshot (safe pattern)
    const toRemove = [];
    for (const [id, entry] of this._projectileMeshes) {
      if (!activeIds.has(id)) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      const entry = this._projectileMeshes.get(id);
      if (entry) {
        this.scene.remove(entry.mesh);
        this.scene.remove(entry.trail);
        entry.trail.geometry.dispose();
        entry.trail.material.dispose();
      }
      this._projectileMeshes.delete(id);
    }
  }

  _updateTorpedoVisuals(torps) {
    if (!this._torpedoVisuals) this._torpedoVisuals = {};
    const activeIds = new Set();

    for (const torp of torps) {
      activeIds.add(torp.id);

      if (!this._torpedoVisuals[torp.id]) {
        const mesh = new THREE.Group();

        const mpTorpedoMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
        applyHalfLambert(mpTorpedoMat);
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 2.5, 8),
          mpTorpedoMat
        );
        body.rotation.x = Math.PI / 2;
        mesh.add(body);

        const triShape = new THREE.Shape();
        triShape.moveTo(0, -1.5);
        triShape.lineTo(1.3, 1);
        triShape.lineTo(-1.3, 1);
        triShape.closePath();
        const marker = new THREE.Mesh(
          new THREE.ShapeGeometry(triShape),
          new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
        );
        marker.position.y = 3.0;
        mesh.add(marker);

        const trailGeo = new THREE.BufferGeometry();
        const trailPositions = new Float32Array(60 * 3);
        trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
        const trailMat = new THREE.PointsMaterial({ color: 0x88ddff, size: 1.2, transparent: true, opacity: 0.85 });
        const trail = new THREE.Points(trailGeo, trailMat);
        this.scene.add(trail);

        this.scene.add(mesh);

        this._torpedoVisuals[torp.id] = {
          mesh, marker, trail, trailData: [],
          prevX: torp.x, prevZ: torp.z,
        };
      }

      const entry = this._torpedoVisuals[torp.id];

      const ownerKey = String(torp.owner);
      const myIdStr = String(this._myId ?? '');
      let isFriendly = ownerKey === myIdStr;
      if (!isFriendly && this._localTeam != null) {
        const otherEntry = this.otherShips[ownerKey];
        const otherTeam = otherEntry?.lastSnap?.team ?? null;
        if (otherTeam != null && otherTeam === this._localTeam) {
          isFriendly = true;
        }
      }
      const targetColor = isFriendly ? 0x00ffff : 0xff0000;
      if (entry.marker.material.color.getHex() !== targetColor) {
        entry.marker.material.color.setHex(targetColor);
      }

      entry.mesh.position.set(torp.x, -0.5, torp.z);

      // Calculate heading from movement direction
      const dx = torp.x - entry.prevX;
      const dz = torp.z - entry.prevZ;
      if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
        entry.mesh.rotation.y = Math.atan2(dx, dz);
      }
      entry.prevX = torp.x;
      entry.prevZ = torp.z;

      // Update trail
      entry.trailData.push({ x: torp.x, y: 0.1, z: torp.z });
      if (entry.trailData.length > 60) entry.trailData.shift();
      const positions = entry.trail.geometry.attributes.position.array;
      for (let j = 0; j < 60; j++) {
        if (j < entry.trailData.length) {
          positions[j * 3] = entry.trailData[j].x;
          positions[j * 3 + 1] = entry.trailData[j].y;
          positions[j * 3 + 2] = entry.trailData[j].z;
        } else {
          positions[j * 3 + 1] = -100;
        }
      }
      entry.trail.geometry.attributes.position.needsUpdate = true;
    }

    // Remove torpedoes no longer in snapshot (safe pattern)
    const toRemoveTorps = [];
    for (const id in this._torpedoVisuals) {
      if (!activeIds.has(Number(id))) {
        toRemoveTorps.push(id);
      }
    }
    for (const id of toRemoveTorps) {
      const entry = this._torpedoVisuals[id];
      this.scene.remove(entry.mesh);
      entry.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(entry.trail);
      entry.trail.geometry.dispose();
      entry.trail.material.dispose();
      delete this._torpedoVisuals[id];
    }
  }

  _syncOtherShipMeshes(othersSnap) {
    const activeIds = new Set();

    for (const snap of othersSnap) {
      activeIds.add(snap.id);

      if (!this.otherShips[snap.id]) {
        // Create detailed ship model for new player
        const level = snap.lvl || 1;
        const shipClass = snap.shipClass || null;
        const ship = new Ship(this.scene, level, shipClass);
        ship.mesh.position.set(snap.x, 0, snap.z);
        ship.mesh.rotation.y = snap.h;

        // Name label
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(snap.name || snap.id, 128, 40);
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.y = 5;
        sprite.scale.set(8, 2, 1);
        ship.mesh.add(sprite);

        this.otherShips[snap.id] = { ship, lastAlive: true, level, shipClass };
      }

      const entry = this.otherShips[snap.id];
      entry.lastSnap = snap;

      // Check for level upgrade
      const newLevel = snap.lvl || 1;
      const newClass = snap.shipClass || null;
      if (newLevel !== entry.level || newClass !== entry.shipClass) {
        entry.ship.upgradeToLevel(newLevel);
        entry.level = newLevel;
        entry.shipClass = newClass;
      }

      if (!snap.alive && entry.lastAlive) {
        entry.ship.sink();
        entry.lastAlive = false;
        continue;
      }

      if (!snap.alive && !entry.lastAlive) continue;

      // Handle respawn: was dead, now alive
      if (snap.alive && !entry.lastAlive) {
        entry.lastAlive = true;
        if (!entry.ship.mesh.visible) {
          entry.ship.mesh.visible = true;
          // Rebuild ship mesh if it was destroyed during sink
          const level = snap.lvl || 1;
          const shipClass = snap.shipClass || null;
          entry.ship.destroy();
          const ship = new Ship(this.scene, level, shipClass);
          ship.mesh.position.set(snap.x, 0, snap.z);
          ship.mesh.rotation.y = snap.h;

          // Re-add name label
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 24px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(snap.name || snap.id, 128, 40);
          const texture = new THREE.CanvasTexture(canvas);
          const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
          const sprite = new THREE.Sprite(spriteMat);
          sprite.position.y = 5;
          sprite.scale.set(8, 2, 1);
          ship.mesh.add(sprite);

          entry.ship = ship;
        }
      }

      if (!snap.alive) continue;

      // Use interpolated position only when enough snapshots exist for interpolation
      if (this.interpolator.isInterpolating(snap.id)) {
        const interp = this.interpolator.getEntity(snap.id);
        entry.ship.mesh.position.set(interp.position.x, 0, interp.position.z);
        entry.ship.mesh.rotation.y = interp.heading;
      } else {
        // Not enough snapshots yet — use raw server position directly
        entry.ship.mesh.position.set(snap.x, 0, snap.z);
        entry.ship.mesh.rotation.y = snap.h;
      }

      entry.lastAlive = snap.alive;
    }

    // Remove ships no longer in snapshot (safe pattern)
    const toRemoveShips = [];
    for (const id in this.otherShips) {
      if (!activeIds.has(Number(id))) {
        toRemoveShips.push(id);
      }
    }
    for (const id of toRemoveShips) {
      const entry = this.otherShips[id];
      entry.ship.destroy();
      delete this.otherShips[id];
      this.interpolator.removeEntity(id);
    }
  }

  _computeShipLabels() {
    const labels = [];
    if (!this.canvas) return labels;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height) return labels;

    const v = this._labelTempVec;
    v.set(0, 0, 0);

    for (const id in this.otherShips) {
      const entry = this.otherShips[id];
      if (!entry.lastSnap) continue;
      const snap = entry.lastSnap;
      if (!snap.alive) continue;
      if (!entry.ship || !entry.ship.mesh || !entry.ship.mesh.visible) continue;

      const labelY = (entry.ship.scopedCameraHeight || 8) + 1.5;
      v.set(snap.x, labelY, snap.z);
      v.project(this.camera);

      if (v.z > 1 || v.z < -1) continue;

      const sx = (v.x + 1) / 2 * width;
      const sy = (1 - v.y) / 2 * height;
      if (sx < -120 || sx > width + 120 || sy < -80 || sy > height + 80) continue;

      const isFriendly = this._localTeam != null && snap.team === this._localTeam;

      labels.push({
        id,
        name: snap.name || String(id),
        hp: snap.hp,
        maxHp: snap.mhp,
        isFriendly,
        x: sx,
        y: sy,
      });
    }
    return labels;
  }

  _loop(time) {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this._loop);

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.water) {
      this.water.material.uniforms['time'].value += dt * 0.5;
    }

    if (!this._gameStarted || !this.localShip) {
      if (this.onShipLabelsUpdate) this.onShipLabelsUpdate([]);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Local prediction
    if (this.localShip.alive) {
      this.controls.updateMotionKeys(this.localShip.speed, this.localShip.max_speed);
      const keys = this.controls.keys;

      // Apply controls locally for immediate feedback
      // Speed-dependent acceleration: faster at low speed, slower at high speed
      const speedRatio = Math.abs(this.localShip.speed) / this.localShip.max_speed;
      const ACCEL = (this.localShip.max_speed / 15) * (1.5 - speedRatio);
      const DECEL_FRICTION = 0.98;
      if (keys.w) this.localShip.speed += ACCEL * dt;
      if (keys.s) this.localShip.speed -= ACCEL * dt;
      if (!keys.w && !keys.s) {
        this.localShip.speed *= DECEL_FRICTION;
        if (Math.abs(this.localShip.speed) < 0.1) this.localShip.speed = 0;
      }
      this.localShip.speed = Math.max(-this.localShip.max_speed * 0.3, Math.min(this.localShip.max_speed, this.localShip.speed));

      if (Math.abs(this.localShip.speed) > 0.5) {
        const turnRate = this.localShip.speed / this.localShip.turn_radius;
        if (keys.a) this.localShip.heading += turnRate * dt;
        if (keys.d) this.localShip.heading -= turnRate * dt;
      }

      // Drift: velocityHeading chases heading
      if (typeof this.localShip.velocityHeading !== 'number') {
        this.localShip.velocityHeading = this.localShip.heading;
      }
      this._applyLocalDrift(dt);

      this.localShip.pos_x += Math.sin(this.localShip.velocityHeading) * this.localShip.speed * dt;
      this.localShip.pos_z += Math.cos(this.localShip.velocityHeading) * this.localShip.speed * dt;

      this.localShip.pos_x = Math.max(-5000, Math.min(5000, this.localShip.pos_x));
      this.localShip.pos_z = Math.max(-5000, Math.min(5000, this.localShip.pos_z));

      // Send input to server
      this.inputSender.update(keys, this.controls.orbitYaw, this.controls.orbitPitch);
      this.inputSender.sendInput();

      this.audio.updateEngineBySpeed(this.localShip.speed, this.localShip.max_speed);
    } else {
      this.audio.updateEngineBySpeed(0, this.localShip.max_speed || 1);
    }

    // Update local ship mesh
    if (this.localShip.ship) {
      this.localShip.ship.mesh.position.set(this.localShip.pos_x, 0, this.localShip.pos_z);
      this.localShip.ship.mesh.rotation.y = this.localShip.heading;
      this.localShip.ship.heading = this.localShip.heading;
      this.localShip.ship.velocityHeading = this.localShip.velocityHeading;
      this.localShip.ship.speed = this.localShip.speed;
      this.localShip.ship.position.set(this.localShip.pos_x, 0, this.localShip.pos_z);
      if (Math.abs(this.localShip.speed) > 1) {
        this.localShip.ship._wakeEmitAccum += Math.abs(this.localShip.speed) * 5 * dt;
        while (this.localShip.ship._wakeEmitAccum >= 1) {
          this.localShip.ship._emitWake();
          this.localShip.ship._wakeEmitAccum -= 1;
        }
      }
      this.localShip.ship._updateWake(dt);
    }

    // Turret aiming & cooldown
    let currentAimYaw = 0;
    if (this.localShip.ship && this.localShip.ship.turrets.length > 0) {
      const aimTarget = this._findAimTarget();
      const turretPos = new THREE.Vector3();
      this.localShip.ship.turrets[0].body.getWorldPosition(turretPos);
      const { yaw, pitch: aimPitch } = calcBallisticAngles(turretPos, aimTarget, this.localShip.heading);
      currentAimYaw = yaw;
      updateTurrets(this.localShip.ship, yaw, aimPitch, dt);
      for (const t of this.localShip.ship.turrets) {
        if (t.cooldown > 0) t.cooldown -= dt;
      }
    }

    // Fire handling — server-authoritative: only consume when turrets actually fire
    if (this.localShip.alive && this.controls.wantsFire) {
      const isTorpedo = this.controls.weaponMode === 'torpedo' && this.localShip.ship.torpedoTubes.length > 0;
      if (isTorpedo) {
        // Torpedoes: send fire to server, don't consume wantsFire (server-authoritative)
        this._fireTorpedoes();
        this.controls.consumeFire();
      } else {
        // Guns: only consume wantsFire if turrets actually fire
        const ship = this.localShip.ship;
        const canFireNow = ship.turrets.some(t => t.cooldown <= 0 && turretCanAim(t, currentAimYaw));
        if (canFireNow) {
          this._fireGuns(currentAimYaw);
          this.controls.consumeFire();
        }
        // If can't fire yet (turret rotating or on cooldown), DON'T consume — keep wantsFire for next frame
      }
    }

    // Update torpedo cooldowns
    this._updateTorpedoCooldowns(dt);

    // Torpedo aim fan
    if (this.torpedoManager && this.localShip.ship) {
      const isTorpedoMode = this.controls.weaponMode === 'torpedo';
      const aimYaw = this.localShip.heading + this.controls.orbitYaw;
      const tier = this.controls.torpedoTier;
      const stats = TORPEDO_TIERS[tier];
      this.torpedoManager.updateAimFan(
        isTorpedoMode && this.localShip.alive,
        new THREE.Vector3(this.localShip.pos_x, 0, this.localShip.pos_z),
        aimYaw,
        this.localShip.ship.torpedoTubes.length,
        this.controls.torpedoSpread,
        stats ? stats.range : 400
      );
    }

    // Update torpedo visuals (trails, fan arcs)
    if (this.torpedoManager) {
      this.torpedoManager.update(dt, null, []);
    }

    // Update local projectile visuals
    if (this._localProjMgr) {
      this._localProjMgr.update(dt, null, []);
    }

    // Camera follow
    const worldYaw = this.localShip.heading + this.controls.orbitYaw;
    const scoped = this.controls.scoped;
    const shipScale = this.localShip.ship ? this.localShip.ship.shipLength / 10 : 1;
    let targetCamPos;
    if (scoped) {
      const scopedH = this.localShip.ship?.scopedCameraHeight || CAM_HEIGHT_SCOPED;
      targetCamPos = new THREE.Vector3(
        this.localShip.pos_x,
        scopedH,
        this.localShip.pos_z
      );
    } else {
      const camDist = CAM_DIST + shipScale * 5;
      const camHeight = CAM_HEIGHT + shipScale * 3;
      targetCamPos = new THREE.Vector3(
        this.localShip.pos_x - Math.sin(worldYaw) * camDist,
        camHeight,
        this.localShip.pos_z - Math.cos(worldYaw) * camDist
      );
    }
    const camLerp = scoped ? 0.15 : 0.12;
    this.camera.position.lerp(targetCamPos, camLerp);

    const targetFov = scoped ? FOV_SCOPED : FOV_NORMAL;
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
    this.camera.lookAt(this.camera.position.clone().add(lookDir.multiplyScalar(1000)));

    // HUD update
    if (this.onHudUpdate && this.localShip.ship) {
      const ship = this.localShip.ship;
      this.onHudUpdate({
        hp: this.localShip.hp,
        maxHp: this.localShip.max_hp,
        speed: Math.abs(this.localShip.speed * 3.6),
        ping: this._ping,
        level: this.localShip.level,
        shipClass: this.localShip.shipClass,
        respawns: this._myRespawns,
        turrets: ship.turrets.map(t => ({
          cooldown: t.cooldown,
          maxCooldown: ship.fireCooldown,
          isFront: t.isFront,
        })),
        weaponMode: this.controls.weaponMode,
        torpedoTier: this.controls.torpedoTier,
        torpedoSpread: this.controls.torpedoSpread,
        torpedoTubes: ship.torpedoTubes.map((tube, i) => ({
          index: i,
          cooldown: this._torpedoCooldowns[i] || 0,
          side: tube.side,
          ready: (this._torpedoCooldowns[i] || 0) <= 0,
        })),
        torpedoMaxCooldown: this._getTorpedoCooldown(),
        availableTorpedoTiers: this.controls.availableTorpedoTiers,
        gear: this.controls.gear,
      });
    }

    // Minimap update
    if (this.onMinimapUpdate && this.localShip.ship) {
      const otherEntities = [];
      for (const id in this.otherShips) {
        const entry = this.otherShips[id];
        if (entry.lastAlive && entry.ship.mesh) {
          otherEntities.push({
            mesh: entry.ship.mesh,
            heading: entry.ship.mesh.rotation.y,
            type: 'ship',
            alive: true,
          });
        }
      }
      this.onMinimapUpdate({
        playerPos: { x: this.localShip.pos_x, z: this.localShip.pos_z },
        playerHeading: this.localShip.heading,
        enemies: otherEntities,
        terrainImage: this._minimapTerrain,
      });
    }

    // Ship labels (HP bar + name) — HTML overlay positions
    if (this.onShipLabelsUpdate) {
      this.camera.updateMatrixWorld();
      this.onShipLabelsUpdate(this._computeShipLabels());
    }

    this.renderer.render(this.scene, this.camera);
  }

  _fireGuns(aimYaw) {
    if (!this.localShip.ship) return;
    const ship = this.localShip.ship;
    const aimTarget = this._findAimTarget();
    let anyFired = false;

    // Calculate common aim direction (same as server logic)
    const turretPos = new THREE.Vector3();
    ship.turrets[0].body.getWorldPosition(turretPos);
    const { pitch: aimPitch } = calcBallisticAngles(turretPos, aimTarget, this.localShip.heading);
    const worldYaw = Math.atan2(
      aimTarget.x - this.localShip.pos_x,
      aimTarget.z - this.localShip.pos_z
    );
    const dirX = Math.sin(worldYaw) * Math.cos(aimPitch);
    const dirY = Math.sin(aimPitch);
    const dirZ = Math.cos(worldYaw) * Math.cos(aimPitch);

    for (const turret of ship.turrets) {
      if (turret.cooldown <= 0 && turretCanAim(turret, aimYaw)) {
        // Origin: turret base position in world space (different per turret)
        const turretWorldPos = new THREE.Vector3();
        turret.body.getWorldPosition(turretWorldPos);
        turretWorldPos.y = 3.0; // turret height

        if (this._localProjMgr) {
          const tdx = aimTarget.x - turretWorldPos.x;
          const tdz = aimTarget.z - turretWorldPos.z;
          const tdist = Math.sqrt(tdx * tdx + tdz * tdz);
          const dir = applyCannonSpread({ x: dirX, y: dirY, z: dirZ }, tdist, this.localShip.shipClass);
          this._localProjMgr.fire(turretWorldPos, dir, ship.damage, 'player');
        }
        turret.cooldown = ship.fireCooldown;
        anyFired = true;
      }
    }
    if (anyFired) {
      this.inputSender.sendFire({ x: aimTarget.x, y: aimTarget.y, z: aimTarget.z });
      this.audio.playFire(this.localShip.shipClass);
    }
  }

  _fireTorpedoes() {
    if (!this.localShip.ship) return;
    const ship = this.localShip.ship;
    const readyTubes = [];
    for (let i = 0; i < ship.torpedoTubes.length; i++) {
      if ((this._torpedoCooldowns[i] || 0) <= 0) readyTubes.push(i);
    }
    if (readyTubes.length === 0) return;

    const heading = this.localShip.heading + this.controls.orbitYaw;
    const tier = this.controls.torpedoTier;
    const spread = this.controls.torpedoSpread;

    // Send to server — torpedoes are server-authoritative
    this.inputSender.sendTorpedo(heading, tier, spread);

    // Set local cooldowns to prevent spam (server will create the actual torpedoes)
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
    const base = { 1: 8, 2: 8, 3: 8 };
    const levelsAbove4 = Math.max(0, (this.localShip?.level || 1) - 4);
    return (base[tier] || 8) * Math.pow(0.95, levelsAbove4);
  }

  _applyLocalDrift(dt) {
    const ls = this.localShip;
    const driftCfg = getDriftConfig(ls.shipClass);
    let diff = ls.heading - ls.velocityHeading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const speedRatio = Math.abs(ls.speed) <= 0.5 ? 0 : Math.abs(ls.speed) / ls.max_speed;
    const recovery = driftCfg.recovery_base * (1 - speedRatio * (1 - driftCfg.speed_factor));
    const maxStep = recovery * dt;

    if (Math.abs(diff) <= maxStep) {
      ls.velocityHeading = ls.heading;
    } else {
      ls.velocityHeading += Math.sign(diff) * maxStep;
    }

    let finalDiff = ls.heading - ls.velocityHeading;
    while (finalDiff > Math.PI) finalDiff -= 2 * Math.PI;
    while (finalDiff < -Math.PI) finalDiff += 2 * Math.PI;
    if (Math.abs(finalDiff) > driftCfg.max_angle) {
      ls.velocityHeading = ls.heading - Math.sign(finalDiff) * driftCfg.max_angle;
    }
  }

  _cleanupGame() {
    if (this.audio) this.audio.stopAll();
    if (this.terrain) {
      this.terrain.destroy?.();
      this.terrain = null;
    }
    if (this.water) {
      this.scene.remove(this.water);
      if (this.water.geometry) this.water.geometry.dispose();
      if (this.water.material) this.water.material.dispose();
      this.water = null;
    }
    if (this._localProjMgr) {
      this._localProjMgr.destroy();
      this._localProjMgr = null;
    }
    if (this.torpedoManager) {
      this.torpedoManager.destroy();
      this.torpedoManager = null;
    }
    if (this.localShip && this.localShip.ship) {
      this.localShip.ship.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.localShip.ship.destroy();
      this.localShip = null;
    }
    for (const id in this.otherShips) {
      this.otherShips[id].ship.destroy();
    }
    this.otherShips = {};
    this.interpolator.clear();
    for (const [id, entry] of this._projectileMeshes) {
      this.scene.remove(entry.mesh);
      if (entry.trail) {
        this.scene.remove(entry.trail);
        entry.trail.geometry.dispose();
        entry.trail.material.dispose();
      }
    }
    this._projectileMeshes = new Map();
    if (this._torpedoVisuals) {
      for (const id in this._torpedoVisuals) {
        const entry = this._torpedoVisuals[id];
        this.scene.remove(entry.mesh);
        entry.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.scene.remove(entry.trail);
        entry.trail.geometry.dispose();
        entry.trail.material.dispose();
      }
      this._torpedoVisuals = {};
    }
  }

  destroy() {
    this._initDone = false;
    this.running = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.audio) this.audio.stopAll();
    this.ws.disconnect();
    if (this.controls) this.controls.destroy();
    this._cleanupGame();
    if (this._rCleanup) this._rCleanup();
    if (this._cCleanup) this._cCleanup();
    if (this.renderer) this.renderer.dispose();
  }
}
