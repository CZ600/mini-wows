import * as THREE from 'three';
import { createScene, createRenderer, createCamera } from './scene.js';
import { createWater } from './water.js';
import { Terrain } from './terrain.js';
import { Ship, LEVEL_CONFIG, CLASS_CONFIG, getClassConfig } from './ship.js';
import { updateTurrets, getTurretFireData, calcBallisticAngles, turretCanAim } from './turret.js';
import { ProjectileManager } from './projectile.js';
import { TorpedoManager, TORPEDO_TIERS } from './torpedo.js';
import { EnemyManager, ENEMY_SCALE } from './enemy.js';
import { Controls } from './controls.js';
import { AudioManager } from './audio.js';

const CAM_DIST = 30;
const CAM_HEIGHT = 15;
const CAM_DIST_SCOPED = 8;
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
    this._gameOverFired = false;
    this._aimTarget = new THREE.Vector3();
    this._currentFov = FOV_NORMAL;
    this.shipClass = null;
    this._torpedoCooldowns = [];
    this._waitingForClassSelect = false;
    this.onClassSelect = null;
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
    this.score = LEVEL_THRESHOLDS[initialLevel - 1] || 0;
    this.level = initialLevel;
    this.wave = 1;
    this.enemiesDestroyed = 0;
    this.shipClass = shipClass;
    this._waitingForClassSelect = false;

    if (this.ship) this.ship.destroy();
    if (this.projectileManager) this.projectileManager.destroy();
    if (this.torpedoManager) this.torpedoManager.destroy();
    if (this.enemyManager) this.enemyManager.clear();

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

    this._updateControlsCapabilities();
    this._torpedoCooldowns = this.ship.torpedoTubes.map(() => 0);

    this.controls.orbitYaw = 0;
    this.controls.orbitPitch = -0.18;
    this.controls.keys = { w: false, a: false, s: false, d: false };
    this._gameOverFired = false;

    this.camera.position.set(spawn.x, CAM_HEIGHT, spawn.z - CAM_DIST);

    if (document.pointerLockElement) document.exitPointerLock();
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

  _loop(time) {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this._loop);

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    if (this.water) {
      this.water.material.uniforms['time'].value += dt * 0.5;
    }

    if (!this.ship) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.ship.update(dt, this.controls.keys, this.terrain);

    if (!this.ship.alive) {
      this.audio.updateEngineBySpeed(0, this.ship.maxSpeed);
      this.projectileManager.update(dt, this.ship, this.enemyManager.enemies);
      this.enemyManager.update(dt, this.ship.position, this.projectileManager, this.camera, this.torpedoManager);
      this.renderer.render(this.scene, this.camera);
      if (!this._gameOverFired && this.onGameOver) {
        this._gameOverFired = true;
        this.onGameOver(this.score, this.level, this.enemiesDestroyed);
      }
      return;
    }

    this.audio.updateEngineBySpeed(this.ship.speed, this.ship.maxSpeed);

    const worldYaw = this.ship.heading + this.controls.orbitYaw;
    const scoped = this.controls.scoped;
    const shipScale = this.ship.shipLength / 10;
    let targetCamPos;
    if (scoped) {
      const scopedH = this.ship.scopedCameraHeight || CAM_HEIGHT_SCOPED;
      targetCamPos = new THREE.Vector3(
        this.ship.position.x,
        this.ship.position.y + scopedH,
        this.ship.position.z
      );
    } else {
      const camDist = CAM_DIST + shipScale * 5;
      const camHeight = CAM_HEIGHT + shipScale * 3;
      targetCamPos = new THREE.Vector3(
        this.ship.position.x - Math.sin(worldYaw) * camDist,
        this.ship.position.y + camHeight,
        this.ship.position.z - Math.cos(worldYaw) * camDist
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
    const lookTarget = this.camera.position.clone().add(lookDir.multiplyScalar(1000));
    this.camera.lookAt(lookTarget);

    const aimTarget = this._findAimTarget();

    let currentAimYaw = 0;
    if (this.ship.turrets.length > 0) {
      const turretPos = new THREE.Vector3();
      this.ship.turrets[0].body.getWorldPosition(turretPos);
      const { yaw, pitch: aimPitch } = calcBallisticAngles(turretPos, aimTarget, this.ship.heading);
      currentAimYaw = yaw;
      updateTurrets(this.ship, yaw, aimPitch, dt);
    }

    if (this.controls.consumeFire()) {
      if (this.controls.weaponMode === 'torpedo' && this.ship.torpedoTubes.length > 0) {
        this._fireTorpedoes();
      } else {
        let anyFired = false;
        for (const turret of this.ship.turrets) {
          if (turret.cooldown <= 0 && turretCanAim(turret, currentAimYaw)) {
            const { origin, direction } = getTurretFireData(turret, this.ship.heading);
            this.projectileManager.fire(origin, direction, this.ship.damage, 'player');
            turret.cooldown = this.ship.fireCooldown;
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
      const aimYaw = this.ship.heading + this.controls.orbitYaw;
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
    this.enemyManager.update(dt, this.ship.position, this.projectileManager, this.camera, this.torpedoManager);

    for (const enemy of this.enemyManager.enemies) {
      if (enemy.alive && enemy.hp <= 0) {
        this.enemyManager.destroyEnemy(enemy);
        this.audio.playExplosion();
        this.score += enemy.scoreValue;
        this.enemiesDestroyed++;
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
    }

    if (this.onHudUpdate) {
      this.onHudUpdate({
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

    this.renderer.render(this.scene, this.camera);
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
      this.ship.heading + this.controls.orbitYaw,
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
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    if (this.audio) this.audio.stopAll();
    if (this.controls) this.controls.destroy();
    if (this._rCleanup) this._rCleanup();
    if (this._cCleanup) this._cCleanup();
    if (this.ship) this.ship.destroy();
    if (this.projectileManager) this.projectileManager.destroy();
    if (this.torpedoManager) this.torpedoManager.destroy();
    if (this.enemyManager) this.enemyManager.clear();
    if (this.renderer) this.renderer.dispose();
  }
}
