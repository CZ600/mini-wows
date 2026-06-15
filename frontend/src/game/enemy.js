import * as THREE from 'three';
import { LEVEL_CONFIG, CLASS_CONFIG, getClassConfig } from './ship.js';
import { applyCannonSpread, compensateDragPitch } from './turret.js';
import { applyHalfLambert } from './scene.js';
import { BASE_MAX_SPEED } from './config.js';

export const ENEMY_SCALE = {
  1:  { hp: 100,  damage: 20, count: 10, size: 10, score: 3 },
  2:  { hp: 130,  damage: 24, count: 10, size: 10, score: 4 },
  3:  { hp: 170,  damage: 30, count: 12, size: 10, score: 5 },
  4:  { hp: 220,  damage: 36, count: 12, size: 11, score: 7 },
  5:  { hp: 280,  damage: 44, count: 14, size: 11, score: 9 },
  6:  { hp: 350,  damage: 58, count: 14, size: 12, score: 11 },
  7:  { hp: 430,  damage: 76, count: 16, size: 12, score: 14 },
  8:  { hp: 520,  damage: 98, count: 16, size: 13, score: 17 },
  9:  { hp: 630,  damage: 124, count: 18, size: 13, score: 21 },
  10: { hp: 750,  damage: 154, count: 20, size: 14, score: 25 },
};

export const ENEMY_SHIP_SCALE = {
  1:  { hp: 120,  damage: 12, speed: 8,   score: 5 },
  2:  { hp: 160,  damage: 15, speed: 9,   score: 7 },
  3:  { hp: 210,  damage: 19, speed: 10,  score: 10 },
  4:  { hp: 270,  damage: 24, speed: 10,  score: 13 },
  5:  { hp: 340,  damage: 30, speed: 11,  score: 17 },
  6:  { hp: 420,  damage: 38, speed: 11,  score: 21 },
  7:  { hp: 520,  damage: 48, speed: 12,  score: 26 },
  8:  { hp: 640,  damage: 60, speed: 13,  score: 32 },
};

const ENEMY_FIRE_COOLDOWN = 8;
const ENEMY_DETECT_RANGE = 600;
const ENEMY_FIRE_SPEED = 150;
const GRAVITY = 9.8;
const SHIP_TURN_RATE = Math.PI / 3;

class EnemyShip {
  constructor(scene, terrain, x, z, enemyLevel, shipType) {
    this.scene = scene;
    this.terrain = terrain;
    this.enemyLevel = enemyLevel;
    this.shipType = shipType;
    this.type = 'ship';
    this.alive = true;

    const classCfg = getClassConfig(shipType, enemyLevel);
    const cfg = classCfg || LEVEL_CONFIG[enemyLevel];
    this.shipLength = cfg.length;
    this.shipWidth = cfg.width;
    this.shipHeight = cfg.height || 2.5;
    this._hasBridge = cfg.hasBridge || false;

    // Use player-equivalent stats instead of ENEMY_SHIP_SCALE
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.damage = cfg.damage;
    this.maxSpeed = cfg.maxSpeed || BASE_MAX_SPEED;
    this.fireCooldown = cfg.fireCooldown;

    // Turret system: same as player ships
    this.frontTurrets = cfg.frontTurrets || 1;
    this.backTurrets = cfg.backTurrets || 0;
    this._barrels = cfg.barrels || 1;
    const nTurrets = this.frontTurrets + this.backTurrets;
    this.turretCooldowns = new Array(nTurrets).fill(0);

    // Score value from ENEMY_SHIP_SCALE (not player-equivalent)
    const scale = ENEMY_SHIP_SCALE[enemyLevel] || ENEMY_SHIP_SCALE[8];
    this.scoreValue = scale.score;
    this.size = cfg.length;
    this.torpedoCooldown = 10 + Math.random() * 10;

    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'idle';
    this.spawnX = x;
    this.spawnZ = z;
    this.patrolTargetX = x;
    this.patrolTargetZ = z;
    this.orbitDirection = Math.random() < 0.5 ? 1 : -1;

    this._buildMesh(cfg);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    this.scene.add(this.mesh);
  }

  _buildMesh(cfg) {
    this.mesh = new THREE.Group();
    const deckY = cfg.height + 1.0;
    const hullY = cfg.height / 2 + 1.0;
    const hullMat = new THREE.MeshPhongMaterial({ color: 0x8b2020 });
    applyHalfLambert(hullMat);
    const turretMat = new THREE.MeshPhongMaterial({ color: 0x666666 });
    applyHalfLambert(turretMat);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x444444 });
    applyHalfLambert(barrelMat);

    const hullGeo = new THREE.CylinderGeometry(1, 1, cfg.height, 32);
    hullGeo.scale(cfg.width * 0.65, 1, cfg.length * 0.65);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.set(0, hullY, 0);
    this.mesh.add(hull);

    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.width * 0.85, 0.25, cfg.length * 0.85),
      hullMat
    );
    deck.position.set(0, deckY, 0);
    this.mesh.add(deck);

    if (cfg.hasBridge) {
      // Long-island superstructure mirroring the player ship: low deckhouse
      // running fore-aft, with a forward bridge block (carrying the mast) and
      // an aft funnel.
      const isAbx = (cfg.barrels || 1) >= 3;
      const bridgeOffsetZ = 0;
      const bw = cfg.width * (isAbx ? 0.5 : 0.45);
      // Bridge island height: raised to 140% to match the player ship.
      const bh = cfg.height * 0.98;
      const bl = cfg.length * 0.26;

      const deckhouseH = bh * 0.5;
      const deckhouse = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.85, deckhouseH, bl),
        hullMat
      );
      deckhouse.position.set(0, deckY + deckhouseH / 2 + 0.1, bridgeOffsetZ);
      this.mesh.add(deckhouse);

      const windowMat = new THREE.MeshPhongMaterial({ color: 0x886644 });
      applyHalfLambert(windowMat);
      const windows = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.88, deckhouseH * 0.35, bl + 0.1),
        windowMat
      );
      windows.position.y = deckhouseH * 0.1;
      deckhouse.add(windows);

      // Forward bridge block (taller).
      const fwdBlockW = bw * 0.7;
      const fwdBlockH = bh * 0.8;
      const fwdBlockL = bl * 0.32;
      const fwdBlock = new THREE.Mesh(
        new THREE.BoxGeometry(fwdBlockW, fwdBlockH, fwdBlockL),
        hullMat
      );
      fwdBlock.position.set(0, deckhouseH / 2 + fwdBlockH / 2, bl * 0.30);
      deckhouse.add(fwdBlock);

      // Aft funnel block (shorter, squatter).
      const funnelW = bw * 0.5;
      const funnelH = bh * 0.6;
      const funnelL = bl * 0.26;
      const funnel = new THREE.Mesh(
        new THREE.BoxGeometry(funnelW, funnelH, funnelL),
        hullMat
      );
      funnel.position.set(0, deckhouseH / 2 + funnelH / 2, -bl * 0.32);
      deckhouse.add(funnel);

      const funnelTopMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
      applyHalfLambert(funnelTopMat);
      const funnelTop = new THREE.Mesh(
        new THREE.BoxGeometry(funnelW * 0.9, funnelH * 0.12, funnelL * 0.9),
        funnelTopMat
      );
      funnelTop.position.y = funnelH / 2 - funnelH * 0.06;
      funnel.add(funnelTop);

      const mastH = bh * (isAbx ? 1.2 : 0.9);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.18, mastH, 6),
        hullMat
      );
      mast.position.set(0, fwdBlockH / 2 + mastH / 2, -fwdBlockL * 0.1);
      fwdBlock.add(mast);

      const crossarm = new THREE.Mesh(
        new THREE.BoxGeometry(fwdBlockW * 0.5, 0.12, 0.12),
        hullMat
      );
      crossarm.position.set(0, mastH * 0.35, 0);
      mast.add(crossarm);
    }

    const barrels = cfg.barrels || 1;
    const turretSize = (0.8 + cfg.width * 0.10) * (cfg.turretMul || 1.0);
    const barrelLen = turretSize * 1.5;
    const barrelGap = turretSize * 0.35;
    // Spacing tracks the (widened) multi-barrel housing width so adjacent
    // turrets pack tightly (was width*0.85, too loose with smaller turrets).
    const housingWidth = turretSize * (1 + (barrels - 1) * 0.45);
    const spacing = Math.max(1.2, housingWidth * 1.4);

    let frontCenter = cfg.length * 0.2;
    let backCenter = -cfg.length * 0.2;

    if (cfg.hasBridge) {
      const bridgeZ = 0;
      const bridgeHalf = cfg.length * 0.14;
      const frontGap = housingWidth * 0.35;
      const backGap = housingWidth * 0.55;
      if (cfg.frontTurrets > 0) {
        const frontEdge = bridgeZ + bridgeHalf;
        const closestOffset = (cfg.frontTurrets - 1) / 2 * spacing;
        frontCenter = Math.max(frontCenter, frontEdge + frontGap + closestOffset);
      }
      if (cfg.backTurrets > 0) {
        const backEdge = bridgeZ - bridgeHalf;
        const closestOffset = (cfg.backTurrets - 1) / 2 * spacing;
        backCenter = Math.min(backCenter, backEdge - backGap - closestOffset);
      }
    }

    this._turretBodies = [];
    this._turretBarrels = [];
    this._turretBarrelGroups = [];

    // Step height so aft turrets are raised to fire over the ones ahead of them.
    const stepH = turretSize * 0.55;

    for (let i = 0; i < cfg.frontTurrets; i++) {
      const offset = (i - (cfg.frontTurrets - 1) / 2) * spacing;
      // Front group fires forward: turret nearest the bridge (lowest i) is highest.
      this._addTurretMesh(turretMat, barrelMat, turretSize, barrelLen, barrelGap, barrels, frontCenter + offset, deckY, (cfg.frontTurrets - 1 - i) * stepH);
    }
    for (let i = 0; i < cfg.backTurrets; i++) {
      const offset = (i - (cfg.backTurrets - 1) / 2) * spacing;
      // Rear group fires aft: turret nearest the bridge (highest i) is highest.
      this._addTurretMesh(turretMat, barrelMat, turretSize, barrelLen, barrelGap, barrels, backCenter + offset, deckY, i * stepH);
    }

    const hpWidth = cfg.length * 0.6;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(hpWidth, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false, transparent: true })
    );
    this.hpBarBg.position.y = deckY + cfg.height + 3;
    this.hpBarBg.renderOrder = 999;
    this.mesh.add(this.hpBarBg);

    this.hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(hpWidth, 1.2),
      new THREE.MeshBasicMaterial({ color: 0x44cc44, depthTest: false, transparent: true })
    );
    this.hpBarFill.position.y = deckY + cfg.height + 3;
    this.hpBarFill.renderOrder = 1000;
    this.mesh.add(this.hpBarFill);

    this._hpWidth = hpWidth;
    this._deckY = deckY;
  }

  _addTurretMesh(turretMat, barrelMat, turretSize, barrelLen, barrelGap, barrels, z, deckY, yOffset = 0) {
    const turretGroup = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(turretSize * 0.5, turretSize * 0.6, turretSize * 0.3, 8),
      turretMat
    );
    turretGroup.add(base);

    // Widen the turret housing so multiple barrels sit naturally side by side.
    const housingWidth = turretSize * (1 + (barrels - 1) * 0.45);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(housingWidth, turretSize, turretSize),
      turretMat
    );
    body.position.y = turretSize * 0.4;
    turretGroup.add(body);

    // One barrel mesh per barrel, offset sideways on x; all parented to the
    // body so they pitch together (body rotation animates elevation).
    const barrelMeshes = [];
    for (let b = 0; b < barrels; b++) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, barrelLen, 8),
        barrelMat
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set((b - (barrels - 1) / 2) * barrelGap, 0, turretSize * 0.5 + barrelLen / 2);
      body.add(barrel);
      barrelMeshes.push(barrel);
    }

    turretGroup.position.set(0, deckY + 0.15 + yOffset, z);
    this.mesh.add(turretGroup);

    // Cylindrical pedestal under raised (superfiring) turrets, filling the
    // gap from the deck up to the turret base.
    if (yOffset > 0.01) {
      const pedestalH = yOffset + 0.15;
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(housingWidth * 0.42, housingWidth * 0.5, pedestalH, 12),
        turretMat
      );
      pedestal.position.set(0, deckY + pedestalH / 2, z);
      this.mesh.add(pedestal);
    }

    this._turretBodies.push(body);
    // Per-turret barrel info for computing distinct muzzle origins when firing.
    this._turretBarrelGroups.push({ meshes: barrelMeshes, barrelLen });
    // Keep the flat list for the pitch animation loop.
    for (const m of barrelMeshes) this._turretBarrels.push(m);
  }

  _rotateToward(target, dt) {
    let diff = target - this.heading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    const maxDelta = SHIP_TURN_RATE * dt;
    if (Math.abs(diff) < maxDelta) {
      this.heading = target;
    } else {
      this.heading += Math.sign(diff) * maxDelta;
    }
    while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
    while (this.heading < -Math.PI) this.heading += 2 * Math.PI;
  }

  _pickPatrolTarget() {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * 300;
    this.patrolTargetX = this.spawnX + Math.cos(angle) * r;
    this.patrolTargetZ = this.spawnZ + Math.sin(angle) * r;
  }

  updateShip(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager) {
    // Update turret cooldowns
    for (let i = 0; i < this.turretCooldowns.length; i++) {
      if (this.turretCooldowns[i] > 0) {
        this.turretCooldowns[i] = Math.max(0, this.turretCooldowns[i] - dt);
      }
    }
    this.torpedoCooldown -= dt;

    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 50) {
      this.state = 'orbit';
    } else if (dist < ENEMY_DETECT_RANGE) {
      this.state = 'chase';
    } else if (this.state !== 'idle') {
      this.state = 'idle';
    }

    let targetHeading;
    let targetSpeed;

    if (this.state === 'idle') {
      const ptDx = this.patrolTargetX - this.mesh.position.x;
      const ptDz = this.patrolTargetZ - this.mesh.position.z;
      const ptDist = Math.sqrt(ptDx * ptDx + ptDz * ptDz);

      if (ptDist < 20) this._pickPatrolTarget();

      targetHeading = Math.atan2(this.patrolTargetX - this.mesh.position.x, this.patrolTargetZ - this.mesh.position.z);
      targetSpeed = this.maxSpeed * 0.3;
    } else if (this.state === 'chase') {
      targetHeading = Math.atan2(dx, dz);
      targetSpeed = this.maxSpeed * 0.7;
    } else {
      const nx = dx / dist;
      const nz = dz / dist;
      let tx = -nz * this.orbitDirection;
      let tz = nx * this.orbitDirection;

      if (dist > 60) {
        tx += nx * 0.3;
        tz += nz * 0.3;
      } else if (dist < 40) {
        tx -= nx * 0.3;
        tz -= nz * 0.3;
      }
      targetHeading = Math.atan2(tx, tz);
      targetSpeed = this.maxSpeed * 0.5;
    }

    this._rotateToward(targetHeading, dt);
    this.speed = targetSpeed;

    const newX = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const newZ = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;

    if (this.terrain && this.terrain.isLand(newX, newZ)) {
      this.heading += Math.PI * 0.5;
      if (this.state === 'idle') this._pickPatrolTarget();
    } else {
      const half = 5000;
      this.mesh.position.x = Math.max(-half, Math.min(half, newX));
      this.mesh.position.z = Math.max(-half, Math.min(half, newZ));
    }

    this.mesh.rotation.y = this.heading;

    if (camera) {
      const hpPercent = this.hp / this.maxHp;
      this.hpBarFill.scale.x = Math.max(0.001, hpPercent);
      this.hpBarFill.position.x = -(1 - hpPercent) * this._hpWidth / 2;
      if (hpPercent > 0.6) this.hpBarFill.material.color.setHex(0x44cc44);
      else if (hpPercent > 0.3) this.hpBarFill.material.color.setHex(0xccaa22);
      else this.hpBarFill.material.color.setHex(0xff3333);
      this.hpBarBg.lookAt(camera.position);
      this.hpBarFill.lookAt(camera.position);
    }

    if ((this.state === 'chase' || this.state === 'orbit') && dist < ENEMY_DETECT_RANGE) {
      // Lead prediction using INITIAL_SPEED (player-equivalent, 200 m/s)
      const INITIAL_SPEED = 200;
      const flightTime = dist / INITIAL_SPEED;
      const leadX = playerPos.x + Math.sin(playerHeading) * playerSpeed * flightTime;
      const leadZ = playerPos.z + Math.cos(playerHeading) * playerSpeed * flightTime;
      const leadDx = leadX - this.mesh.position.x;
      const leadDz = leadZ - this.mesh.position.z;
      const leadDist = Math.sqrt(leadDx * leadDx + leadDz * leadDz);

      const targetYaw = Math.atan2(leadDx, leadDz);
      const localYaw = targetYaw - this.heading;
      for (const b of this._turretBodies) b.rotation.y = localYaw;

      const fireOriginY = this._deckY + 1;
      const horizDist = leadDist;
      const dy = playerPos.y - fireOriginY;

      let pitch;
      if (horizDist < 1) {
        pitch = Math.PI / 6;
      } else {
        const v2 = INITIAL_SPEED * INITIAL_SPEED;
        const v4 = v2 * v2;
        const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);
        pitch = disc < 0
          ? Math.PI / 6
          : Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
        pitch = Math.max(-20 * Math.PI / 180, Math.min(80 * Math.PI / 180, pitch));
      }

      pitch = compensateDragPitch(pitch, horizDist, INITIAL_SPEED);

      for (const b of this._turretBarrels) b.rotation.x = Math.PI / 2 - pitch;

      // Turret-based salvo: fire from all turrets that can aim and are ready.
      // Each barrel fires its own shell from its own muzzle position with
      // independent spread, mirroring the server's multi-barrel fire logic.
      const dirX = Math.sin(targetYaw) * Math.cos(pitch);
      const dirY = Math.sin(pitch);
      const dirZ = Math.cos(targetYaw) * Math.cos(pitch);

      const muzzleVec = new THREE.Vector3();
      for (let i = 0; i < this._turretBodies.length; i++) {
        if (this.turretCooldowns[i] > 0) continue;

        // Check if turret can aim at target
        const yawCenter = i < this.frontTurrets ? 0 : Math.PI;
        const yawRange = this._hasBridge ? 2.2 : Math.PI;
        const diff = ((localYaw - yawCenter + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        if (Math.abs(diff) > yawRange + 0.05) continue;

        const group = this._turretBarrelGroups[i];
        for (let b = 0; b < this._barrels; b++) {
          // Muzzle = barrel mesh's local +z end (barrelLen/2 from its center).
          // localToWorld folds in the superfiring step height so elevated
          // turrets actually fire from their raised muzzle, not the deck.
          const mesh = group.meshes[b];
          const halfLen = group.barrelLen / 2;
          muzzleVec.set(0, 0, halfLen);
          mesh.localToWorld(muzzleVec);
          const spreadDir = applyCannonSpread({ x: dirX, y: dirY, z: dirZ }, horizDist, this.shipType);
          projectileManager.fire(muzzleVec.clone(), spreadDir, this.damage, 'enemy');
        }
        this.turretCooldowns[i] = this.fireCooldown;
      }
    }

    if (this.shipType === 'cruiser' && torpedoManager &&
        (this.state === 'chase' || this.state === 'orbit') &&
        dist < 400 && this.torpedoCooldown <= 0) {
      const aimHeading = Math.atan2(dx, dz);
      torpedoManager.fire(this.mesh.position, aimHeading, 1, this.enemyLevel, 2, 'narrow', 'enemy');
      this.torpedoCooldown = 15;
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;
  }
}

export class EnemyManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.enemies = [];
    this.explosions = [];
  }

  spawn(playerPos, level = 1) {
    this.clear();
    const scale = ENEMY_SCALE[level] || ENEMY_SCALE[10];
    const size = scale.size;

    if (level < 3) {
      for (let i = 0; i < scale.count; i++) {
        let x, z, attempts = 0;
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 400;
          x = playerPos.x + Math.cos(angle) * dist;
          z = playerPos.z + Math.sin(angle) * dist;
          attempts++;
        } while (this.terrain && this.terrain.isLand(x, z) && attempts < 20);
        if (attempts >= 20) continue;

        const tooClose = this.enemies.some(e => {
          const edx = e.mesh.position.x - x;
          const edz = e.mesh.position.z - z;
          return Math.sqrt(edx * edx + edz * edz) < 100;
        });
        if (tooClose) continue;

        const enemyData = this._createTurret(x, z, size, scale);
        if (enemyData) this.enemies.push(enemyData);
      }
    } else {
      for (let i = 0; i < 5; i++) {
        let x, z, attempts = 0;
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = 100 + Math.random() * 400;
          x = playerPos.x + Math.cos(angle) * dist;
          z = playerPos.z + Math.sin(angle) * dist;
          attempts++;
        } while (this.terrain && this.terrain.isLand(x, z) && attempts < 20);
        if (attempts >= 20) continue;

        const enemyData = this._createTurret(x, z, size, scale);
        if (enemyData) this.enemies.push(enemyData);
      }

      const enemyShipLevel = Math.max(1, level - 1);
      for (let i = 0; i < 10; i++) {
        let x, z, attempts = 0;
        do {
          const angle = Math.random() * Math.PI * 2;
          const dist = 200 + Math.random() * 1800;
          x = playerPos.x + Math.cos(angle) * dist;
          z = playerPos.z + Math.sin(angle) * dist;
          attempts++;
        } while (this.terrain && this.terrain.isLand(x, z) && attempts < 20);
        if (attempts >= 20) continue;

        const tooClose = this.enemies.some(e => {
          const edx = e.mesh.position.x - x;
          const edz = e.mesh.position.z - z;
          return Math.sqrt(edx * edx + edz * edz) < 100;
        });
        if (tooClose) continue;

        let shipType = null;
        if (enemyShipLevel >= 4) {
          shipType = Math.random() < 0.5 ? 'cruiser' : 'battleship';
        }

        const ship = new EnemyShip(this.scene, this.terrain, x, z, enemyShipLevel, shipType);
        this.enemies.push(ship);
      }
    }
  }

  _createTurret(x, z, size, scale) {
    const group = new THREE.Group();

    const r = Math.max(0.5, 0.83 - scale.size * 0.03);
    const g = Math.max(0.3, 0.53 - scale.size * 0.02);
    const b = Math.max(0.3, 0.44 - scale.size * 0.015);

    const baseMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(r * 0.8, g * 0.8, b * 0.8) });
    applyHalfLambert(baseMat);
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(size, 2, size),
      baseMat
    );
    base.position.y = 1;
    group.add(base);

    const underwaterMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(r * 0.4, g * 0.4, b * 0.4) });
    applyHalfLambert(underwaterMat);
    const underwaterHull = new THREE.Mesh(
      new THREE.BoxGeometry(size * 1.1, 3, size * 1.1),
      underwaterMat
    );
    underwaterHull.position.y = -1.5;
    group.add(underwaterHull);

    const bodyMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(r, g, b) });
    applyHalfLambert(bodyMat);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      bodyMat
    );
    body.position.y = size / 2 + 2;
    group.add(body);

    const turretBarrelMat = new THREE.MeshPhongMaterial({ color: 0x553333 });
    applyHalfLambert(turretBarrelMat);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, size * 0.8, 8),
      turretBarrelMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0, size * 0.6);
    body.add(barrel);

    const hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.8, 1),
      new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false, transparent: true })
    );
    hpBarBg.position.y = size + 8;
    hpBarBg.renderOrder = 999;
    group.add(hpBarBg);

    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 0.8, 0.8),
      new THREE.MeshBasicMaterial({ color: 0x44cc44, depthTest: false, transparent: true })
    );
    hpBarFill.position.y = size + 8;
    hpBarFill.renderOrder = 1000;
    group.add(hpBarFill);

    group.position.set(x, 0, z);
    this.scene.add(group);

    const enemyHp = scale.hp;
    const enemyDamage = scale.damage;
    const enemyScore = scale.score;

    return {
      mesh: group, body, barrel, hpBarBg, hpBarFill,
      type: 'turret',
      hp: enemyHp, maxHp: enemyHp, alive: true,
      size, damage: enemyDamage, scoreValue: enemyScore,
      cooldown: ENEMY_FIRE_COOLDOWN * (0.5 + Math.random() * 0.5),
      takeDamage(amount) {
        this.hp -= amount;
        if (this.hp < 0) this.hp = 0;
      },
    };
  }

  update(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      if (enemy.type === 'ship') {
        enemy.updateShip(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager);
        continue;
      }

      enemy.cooldown -= dt;

      const size = enemy.size;

      if (camera) {
        const hpPercent = enemy.hp / enemy.maxHp;
        enemy.hpBarFill.scale.x = Math.max(0.001, hpPercent);
        enemy.hpBarFill.position.x = -(1 - hpPercent) * size * 0.4;
        if (hpPercent > 0.6) enemy.hpBarFill.material.color.setHex(0x44cc44);
        else if (hpPercent > 0.3) enemy.hpBarFill.material.color.setHex(0xccaa22);
        else enemy.hpBarFill.material.color.setHex(0xff3333);
        enemy.hpBarBg.lookAt(camera.position);
        enemy.hpBarFill.lookAt(camera.position);
      }

      const dx = playerPos.x - enemy.mesh.position.x;
      const dz = playerPos.z - enemy.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < ENEMY_DETECT_RANGE) {
        // Lead prediction
        const flightTime = dist / ENEMY_FIRE_SPEED;
        const leadX = playerPos.x + Math.sin(playerHeading) * playerSpeed * flightTime;
        const leadZ = playerPos.z + Math.cos(playerHeading) * playerSpeed * flightTime;
        const leadDx = leadX - enemy.mesh.position.x;
        const leadDz = leadZ - enemy.mesh.position.z;
        const leadDist = Math.sqrt(leadDx * leadDx + leadDz * leadDz);

        const targetYaw = Math.atan2(leadDx, leadDz);
        enemy.body.rotation.y = targetYaw;

        const fireOriginY = enemy.mesh.position.y + size / 2 + 2;
        const horizDist = leadDist;
        const dy = playerPos.y - fireOriginY;

        let pitch;
        if (horizDist < 1) {
          pitch = Math.PI / 6;
        } else {
          const v2 = ENEMY_FIRE_SPEED * ENEMY_FIRE_SPEED;
          const v4 = v2 * v2;
          const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);
          if (disc < 0) {
            pitch = Math.PI / 6;
          } else {
            pitch = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
          }
          pitch = Math.max(-20 * Math.PI / 180, Math.min(80 * Math.PI / 180, pitch));
        }

        pitch = compensateDragPitch(pitch, horizDist, ENEMY_FIRE_SPEED);

        enemy.barrel.rotation.x = Math.PI / 2 - pitch;

        if (enemy.cooldown <= 0) {
          const firePos = new THREE.Vector3(
            enemy.mesh.position.x,
            fireOriginY,
            enemy.mesh.position.z
          );
          const dirX = Math.sin(targetYaw) * Math.cos(pitch);
          const dirY = Math.sin(pitch);
          const dirZ = Math.cos(targetYaw) * Math.cos(pitch);
          const dir = applyCannonSpread({ x: dirX, y: dirY, z: dirZ }, horizDist);
          projectileManager.fire(firePos, dir, enemy.damage, 'enemy');
          enemy.cooldown = ENEMY_FIRE_COOLDOWN;
        }
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.lifetime += dt;
      const progress = e.lifetime / e.duration;
      if (progress >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.explosions.splice(i, 1);
        continue;
      }
      const s = 1 + progress * e.maxSize;
      e.mesh.scale.set(s, s, s);
      e.mesh.traverse(child => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 1 - progress;
        }
      });
    }
  }

  getAliveCount() {
    return this.enemies.filter(e => e.alive).length;
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    for (const e of this.explosions) {
      this.scene.remove(e.mesh);
      e.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.enemies = [];
    this.explosions = [];
  }

  destroyEnemy(enemy) {
    const pos = enemy.mesh.position.clone();
    pos.y += enemy.size / 2;
    this._createExplosion(pos, enemy.size);
    enemy.alive = false;
    this.scene.remove(enemy.mesh);
  }

  _createExplosion(position, size = 10) {
    const group = new THREE.Group();

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1 })
    );
    group.add(sphere);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 1 })
    );
    group.add(core);

    const count = 20;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 2;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(pGeo,
      new THREE.PointsMaterial({ color: 0xffaa00, size: 2, transparent: true, opacity: 1 })
    );
    group.add(particles);

    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
    );
    group.add(smoke);

    group.position.copy(position);
    this.scene.add(group);
    this.explosions.push({ mesh: group, lifetime: 0, duration: 1.0, maxSize: size });
  }
}
