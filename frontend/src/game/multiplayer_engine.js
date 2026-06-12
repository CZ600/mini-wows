import * as THREE from 'three';
import { createScene, createRenderer, createCamera } from './scene.js';
import { createWater } from './water.js';
import { Terrain } from './terrain.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';
import { WSClient } from './ws_client.js';
import { InputSender } from './input_sender.js';
import { EntityInterpolator } from './entity_interpolator.js';
import { reconcile } from './reconciliation.js';
import { BASE_MAX_SPEED } from './config.js';

const CAM_DIST = 30;
const CAM_HEIGHT = 15;
const FOV_NORMAL = 60;

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
    this.controls = new Controls(canvas);
    this.running = true;
    this.lastTime = performance.now();
    this._loop = this._loop.bind(this);
    this.animFrameId = requestAnimationFrame(this._loop);

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

  createRoom(mode, level = 1, shipClass = null) {
    this.ws.send({ type: 'create_room', mode, level, shipClass });
  }

  joinRoom(roomId, level = 1, shipClass = null) {
    this.ws.send({ type: 'join_room', roomId, level, shipClass });
  }

  quickMatch(mode, level = 1, shipClass = null) {
    this.ws.send({ type: 'quick_match', mode, level, shipClass });
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
      if (this.onRoomUpdate) {
        this.onRoomUpdate({
          roomId: msg.roomId,
          mode: msg.mode,
          players: msg.players,
          terrainSeed: msg.terrainSeed,
          islands: msg.islands,
        });
      }
    }

    if (type === 'room_update') {
      if (this.onRoomUpdate) {
        this.onRoomUpdate({
          roomId: this._currentRoomId,
          mode: this._roomMode,
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
      if (this.onGameOver) {
        this.onGameOver(msg.results);
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
    this.audio.init();

    // Create terrain from server seed/islands
    this.terrain = new Terrain(this.scene, msg.terrainSeed, msg.islands);
    this.water = createWater(this.scene);

    // Find my player data
    const myPlayer = msg.players.find(p => p.id === this._myId);
    const spawn = myPlayer || { id: this._myId };

    // Create local ship (for rendering)
    this.localShip = {
      pos_x: 0, pos_z: 0,
      heading: 0, speed: 0,
      hp: 100, max_hp: 100,
      max_speed: BASE_MAX_SPEED,
      turn_radius: 20,
      alive: true,
      mesh: null,
    };

    // Find safe spawn on terrain
    if (this.terrain) {
      const pos = this._findSafeSpawn();
      this.localShip.pos_x = pos.x;
      this.localShip.pos_z = pos.z;
    }

    // Create mesh for local ship
    this._createLocalShipMesh();

    // Reset other ships
    this.otherShips = {};

    this._gameStarted = true;
    this._ping = 0;

    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.18;
    this.controls.keys = { w: false, a: false, s: false, d: false };

    // Notify App that game has started
    if (this.onGameStart) this.onGameStart();
  }

  _findSafeSpawn() {
    if (this.terrain && !this.terrain.isLand(0, 0)) return { x: 0, z: 0 };
    for (let r = 100; r <= 2000; r += 100) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (this.terrain && !this.terrain.isLand(x, z)) return { x, z };
      }
    }
    return { x: 0, z: 0 };
  }

  _createLocalShipMesh() {
    const geo = new THREE.BoxGeometry(2, 1.5, 7);
    const mat = new THREE.MeshPhongMaterial({ color: 0x3388cc });
    this.localShip.mesh = new THREE.Mesh(geo, mat);
    this.localShip.mesh.position.set(this.localShip.pos_x, 0.75, this.localShip.pos_z);
    this.scene.add(this.localShip.mesh);
  }

  _processSnapshot(msg) {
    this._ping = msg.ping || 0;

    // Reconcile local ship
    if (msg.you && this.localShip) {
      const serverState = msg.you;
      this.inputSender.confirmInput(msg.lpi || 0);

      if (!serverState.alive && this.localShip.alive) {
        this.localShip.alive = false;
        this.localShip.hp = 0;
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

    // Process events
    if (msg.evts) {
      for (const evt of msg.evts) {
        if (evt.type === 'hit') {
          this.audio.playExplosion();
        }
        if (evt.type === 'kill') {
          this.audio.playExplosion();
        }
      }
    }
  }

  _syncOtherShipMeshes(othersSnap) {
    const activeIds = new Set();

    for (const snap of othersSnap) {
      activeIds.add(snap.id);

      if (!this.otherShips[snap.id]) {
        // Create mesh for new player
        const geo = new THREE.BoxGeometry(2, 1.5, 7);
        const mat = new THREE.MeshPhongMaterial({ color: 0xcc3333 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(snap.x, 0.75, snap.z);
        mesh.rotation.y = snap.h;
        this.scene.add(mesh);

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
        mesh.add(sprite);

        this.otherShips[snap.id] = { mesh, lastAlive: true };
      }

      const entry = this.otherShips[snap.id];
      if (!snap.alive && entry.lastAlive) {
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        entry.lastAlive = false;
        continue;
      }

      if (!snap.alive) continue;

      // Use interpolated position if available
      const interp = this.interpolator.getEntity(snap.id);
      if (interp) {
        entry.mesh.position.set(interp.position.x, 0.75, interp.position.z);
        entry.mesh.rotation.y = interp.heading;
      } else {
        entry.mesh.position.set(snap.x, 0.75, snap.z);
        entry.mesh.rotation.y = snap.h;
      }

      entry.lastAlive = snap.alive;
    }

    // Remove ships no longer in snapshot
    for (const id in this.otherShips) {
      if (!activeIds.has(id)) {
        const entry = this.otherShips[id];
        this.scene.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mesh.material.dispose();
        delete this.otherShips[id];
        this.interpolator.removeEntity(id);
      }
    }
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
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Local prediction
    if (this.localShip.alive) {
      const keys = this.controls.keys;
      this.localShip.pos_x += Math.sin(this.localShip.heading) * this.localShip.speed * dt;
      this.localShip.pos_z += Math.cos(this.localShip.heading) * this.localShip.speed * dt;

      // Apply controls locally for immediate feedback
      const ACCEL = BASE_MAX_SPEED / 20;
      const DECEL_FRICTION = 0.98;
      if (keys.w) this.localShip.speed += ACCEL * dt;
      if (keys.s) this.localShip.speed -= ACCEL * dt;
      if (!keys.w && !keys.s) {
        this.localShip.speed *= DECEL_FRICTION;
        if (Math.abs(this.localShip.speed) < 0.1) this.localShip.speed = 0;
      }
      this.localShip.speed = Math.max(-BASE_MAX_SPEED * 0.3, Math.min(BASE_MAX_SPEED, this.localShip.speed));

      if (Math.abs(this.localShip.speed) > 0.5) {
        const turnRate = this.localShip.speed / this.localShip.turn_radius;
        if (keys.a) this.localShip.heading += turnRate * dt;
        if (keys.d) this.localShip.heading -= turnRate * dt;
      }

      this.localShip.pos_x = Math.max(-5000, Math.min(5000, this.localShip.pos_x));
      this.localShip.pos_z = Math.max(-5000, Math.min(5000, this.localShip.pos_z));

      // Send input to server
      this.inputSender.update(keys, this.controls.orbitYaw, this.controls.orbitPitch);
      this.inputSender.sendInput();
    }

    // Update local ship mesh
    if (this.localShip.mesh) {
      this.localShip.mesh.position.set(this.localShip.pos_x, 0.75, this.localShip.pos_z);
      this.localShip.mesh.rotation.y = this.localShip.heading;
    }

    // Camera follow
    const worldYaw = this.localShip.heading + this.controls.orbitYaw;
    const targetCamPos = new THREE.Vector3(
      this.localShip.pos_x - Math.sin(worldYaw) * CAM_DIST,
      CAM_HEIGHT,
      this.localShip.pos_z - Math.cos(worldYaw) * CAM_DIST
    );
    this.camera.position.lerp(targetCamPos, 0.12);

    const pitch = this.controls.orbitPitch;
    const lookDir = new THREE.Vector3(
      Math.sin(worldYaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(worldYaw) * Math.cos(pitch)
    );
    this.camera.lookAt(this.camera.position.clone().add(lookDir.multiplyScalar(1000)));

    // HUD update
    if (this.onHudUpdate) {
      this.onHudUpdate({
        hp: this.localShip.hp,
        maxHp: this.localShip.max_hp,
        speed: Math.abs(this.localShip.speed * 3.6),
        ping: this._ping,
      });
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.running = false;
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.ws.disconnect();
    if (this.controls) this.controls.destroy();
    if (this._rCleanup) this._rCleanup();
    if (this._cCleanup) this._cCleanup();
    if (this.localShip && this.localShip.mesh) {
      this.scene.remove(this.localShip.mesh);
      this.localShip.mesh.geometry.dispose();
      this.localShip.mesh.material.dispose();
    }
    for (const id in this.otherShips) {
      const entry = this.otherShips[id];
      this.scene.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      entry.mesh.material.dispose();
    }
    this.otherShips = {};
    this.interpolator.clear();
    if (this.terrain) this.terrain.destroy?.();
    if (this.renderer) this.renderer.dispose();
  }
}
