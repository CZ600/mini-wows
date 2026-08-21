import * as THREE from 'three';
import { LEVEL_CONFIG, getClassConfig } from './ship.js';
import { applyCannonSpread, compensateDragPitch, aimAaMountAtPoint, getTurretFireData } from './turret.js';
import { buildShipModel, createMarkerSprite, CLASS_NAMES } from './ship_model.js';
import { BASE_MAX_SPEED, getMuzzleSpeed, getCannonDrag, SUBMARINE, getClassAa, getAaTier, AA_DRAG,
         getClassAsw, getAswTier, clampAswAim, ASW_MUZZLE_SPEED, ASW_DRAG, ASW_FUSE_DELAY, ASW_AIR } from './config.js';
import { AswStrikePlane } from './asw.js';

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

const ENEMY_DETECT_RANGE = 600;
const GRAVITY = 9.8;
const SHIP_TURN_RATE = Math.PI / 3;

// Single-player (solo) mode tuning.
// Spawns land in the annulus [SPAWN_MIN_DIST, SPAWN_MAX_DIST] around the player.
// 关键约束：刷怪圈必须完全在敌方索敌圈（ENEMY_DETECT_RANGE）之外 ——
// 否则波次一刷新，全部敌舰立刻发现并集火静止的玩家，开局即被秒杀。
// 因此最小刷怪距离直接由 ENEMY_DETECT_RANGE 派生（低等级贴着索敌圈外沿，
// 省去长途奔袭；4 级起再外扩 100m，给玩家更多展开空间）。
const SOLO_SPAWN_MIN_DIST_LOW = ENEMY_DETECT_RANGE;        // < level 4: 600m，索敌圈外沿
const SOLO_SPAWN_MIN_DIST = ENEMY_DETECT_RANGE + 100;      // >= level 4: 700m
const SOLO_SPAWN_MAX_DIST = 1500;                          // 1.5km spawn radius (random within)
const SOLO_SPAWN_MIN_SEP = 100;        // min spacing between spawned enemies

// Orbit band: within ENEMY_ORBIT_RANGE the ship stops chasing and circles the
// player, maintaining the orbit radius inside [ENEMY_ORBIT_MIN, ENEMY_ORBIT_MAX].
const ENEMY_ORBIT_RANGE = 100;
const ENEMY_ORBIT_MIN = 90;
const ENEMY_ORBIT_MAX = 130;

// Exported for reuse by team AI (team_ai.js).
export {
  ENEMY_DETECT_RANGE,
  ENEMY_ORBIT_RANGE, ENEMY_ORBIT_MIN, ENEMY_ORBIT_MAX,
};

export class EnemyShip {
  constructor(scene, terrain, x, z, enemyLevel, shipType) {
    this.scene = scene;
    this.terrain = terrain;
    this.enemyLevel = enemyLevel;
    this.shipType = shipType;
    this.shipClass = shipType;   // duck-type used by ASW target selection
    this.type = 'ship';
    this.alive = true;

    const classCfg = getClassConfig(shipType, enemyLevel);
    const cfg = classCfg || LEVEL_CONFIG[enemyLevel];
    this.shipLength = cfg.length;
    this.shipWidth = cfg.width;
    this.shipHeight = cfg.height || 2.5;
    this._hasBridge = cfg.hasBridge || false;

    // Use player-equivalent stats instead of ENEMY_SHIP_SCALE. Early-game enemy
    // ships are tuned down so level 1 is approachable: their HP is halved.
    const hpMul = enemyLevel === 1 ? 0.5 : 1.0;
    this.hp = Math.max(1, Math.round(cfg.hp * hpMul));
    this.maxHp = this.hp;
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

    // ASW (sub hunting): salvo release cooldown + in-flight strike planes.
    this.aswCooldown = 0;
    this._aswPlanes = [];

    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'idle';
    this.spawnX = x;
    this.spawnZ = z;
    this.patrolTargetX = x;
    this.patrolTargetZ = z;
    this.orbitDirection = Math.random() < 0.5 ? 1 : -1;

    // Faction for team battle ('player' | 'enemy'); solo ships are 'enemy'.
    // The fire target is whatever unit this ship currently aims at (defaults to
    // the player; team-mode subclasses override via _decideAI).
    this.faction = 'enemy';
    this.fireTarget = null;

    // Submarine dive state (only meaningful for shipType === 'submarine'). An
    // enemy sub dives once it gets close, becoming fullySubmerged (immune to
    // shells, vulnerable only to depth charges). Mirrors Ship.fullySubmerged.
    this.submerged = false;
    this.diveDepth = 0;

    this._buildMesh(cfg);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = this.heading;
    this.scene.add(this.mesh);
  }

  _buildMesh(cfg) {
    // 敌方舰船与玩家共用同一套真实感建模（ship_model.js），涂装完全一致；
    // 阵营只通过血条颜色 + 文字标记区分，不再使用深红色船体。
    const model = buildShipModel(cfg, this.shipType);
    this.mesh = model.group;
    this._hullMat = model.mats.hull;   // subclasses can retint via _tintHull
    this._deckY = model.deckY;

    // 炮塔网格句柄：group 承担水平旋回（yaw），barrelPivot 承担俯仰（pitch），
    // 与玩家 Ship 的 turret.js 驱动方式完全同构。
    this._turretBodies = model.turrets.map(t => t.group);
    this._turretPivots = model.turrets.map(t => t.barrelPivot);
    this._turretBarrelGroups = model.turrets.map(t => ({ meshes: t.barrels, barrelLen: t.barrelLen }));

    // 防空炮座（与玩家 Ship 同构的旋回/俯仰机构），由 updateAaDefense 驱动
    // —— 单人模式中敌方 AI 的自动防空火力。
    this.aaMounts = (model.aaMounts || []).map(t => ({ ...t }));

    const hpWidth = cfg.length * 0.6;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(hpWidth, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false, transparent: true })
    );
    this.hpBarBg.position.y = cfg.height + model.deckY + 3;
    this.hpBarBg.renderOrder = 999;
    this.mesh.add(this.hpBarBg);

    // Fill geometry stays CENTRED on the mesh origin (do NOT translate it). This
    // is critical: the fill is billboarded each frame via lookAt(camera) while
    // being non-uniformly scaled in X (scale.x = hpPercent). three.js's lookAt
    // does not support non-uniform scaling on an object whose geometry centre
    // is offset from its origin — translating the geometry caused the plane to
    // skew/shear and its right edge to read as "missing" even at full HP. By
    // keeping the geometry centred and adjusting position.x per frame instead
    // (see updateShip), the billboard stays a clean rectangle at every HP.
    const fillGeo = new THREE.PlaneGeometry(hpWidth, 1.2);
    this.hpBarFill = new THREE.Mesh(
      fillGeo,
      new THREE.MeshBasicMaterial({ color: 0x44cc44, depthTest: false, transparent: true })
    );
    // Centred (position.x = 0); updateShip nudges it left as HP drops so the
    // left edge aligns with the background's left edge and the bar depletes
    // from the right.
    this.hpBarFill.position.x = 0;
    this.hpBarFill.position.y = cfg.height + model.deckY + 3;
    this.hpBarFill.renderOrder = 1000;
    this.mesh.add(this.hpBarFill);

    // 敌方文字标记（船体涂装已与玩家一致，靠红字识别）。友军翼舰在
    // _applyFactionColors 里隐藏此标记（他们由 HUD 队友标签标识）。
    const className = CLASS_NAMES[this.shipType] || '战舰';
    this.factionMarker = createMarkerSprite(`敌方·${className}`);
    const mw = Math.min(15, Math.max(7, cfg.length * 0.45));
    this.factionMarker.scale.set(mw, mw * 0.25, 1);
    this.factionMarker.position.y = cfg.height + model.deckY + 5.2;
    this.mesh.add(this.factionMarker);

    this._hpWidth = hpWidth;
    this._applyFactionColors();   // tint HP bar by faction (player=blue / enemy=red)
  }

  // Retint the hull/deck/superstructure (all share _hullMat). Used by team-mode
  // wingmen to paint themselves a distinct faction colour so they read as
  // allies at a glance instead of looking like red enemies.
  _tintHull(hex) {
    if (this._hullMat) this._hullMat.color.setHex(hex);
  }

  // Faction-tinted HP bar so wingmen (player side) and reds (enemy side) are
  // visually distinct in team battles. The background bar carries the faction
  // identity colour; the fill is re-tinted each frame by _updateHpBar().
  // Wingmen (faction 'player') hide the in-world 3D bar entirely: the team-mode
  // HUD overlay (TeamLabels) already draws a "队友N + 血条" label above them, so
  // keeping the 3D bar would show two bars stacked on the same ship.
  _applyFactionColors() {
    if (this.faction === 'player') {
      // Ally: blue family, but hide the in-world bar (overlay handles it).
      this.hpBarBg.visible = false;
      this.hpBarFill.visible = false;
      this.hpBarBg.material.color.setHex(0x113355);
      this.hpBarFill.material.color.setHex(0x33ccff);
      // 翼舰不带"敌方"标记 —— 他们由 HUD 的队友标签标识。
      if (this.factionMarker) this.factionMarker.visible = false;
    } else {
      // Enemy (and solo-mode enemies): red family.
      this.hpBarBg.visible = true;
      this.hpBarFill.visible = true;
      this.hpBarBg.material.color.setHex(0x331111);
      this.hpBarFill.material.color.setHex(0xff5544);
      if (this.factionMarker) this.factionMarker.visible = true;
    }
  }

  // Recolour the HP fill each frame by HP fraction, staying within the unit's
  // faction hue band so allies always read blue and enemies always read red:
  //   ally  : full=cyan, mid=blue,   low=deep blue
  //   enemy : full=orange-red, mid=red, low=dark red
  _updateHpBarColor(hpPercent) {
    if (this.faction === 'player') {
      if (hpPercent > 0.6) this.hpBarFill.material.color.setHex(0x33ccff);   // bright cyan
      else if (hpPercent > 0.3) this.hpBarFill.material.color.setHex(0x3388dd); // blue
      else this.hpBarFill.material.color.setHex(0x224488);                    // deep blue
    } else {
      if (hpPercent > 0.6) this.hpBarFill.material.color.setHex(0xff7744);   // orange-red
      else if (hpPercent > 0.3) this.hpBarFill.material.color.setHex(0xdd3322); // red
      else this.hpBarFill.material.color.setHex(0x882222);                    // dark red
    }
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

  // AI decision core. Returns { targetHeading, targetSpeed } and sets this.state.
  // The base implementation is the solo-mode behaviour (idle/chase/orbit around
  // the player). Team-mode subclasses override this with their own logic and
  // set this.fireTarget to whatever unit they want to shoot at.
  _decideAI(dt, playerPos, dist, dx, dz) {
    if (dist < ENEMY_ORBIT_RANGE) {
      this.state = 'orbit';
    } else if (dist < ENEMY_DETECT_RANGE) {
      this.state = 'chase';
    } else if (this.state !== 'idle') {
      this.state = 'idle';
    }

    // In solo mode the ship always fires at the player.
    this.fireTarget = {
      x: playerPos.x, z: playerPos.z,
      heading: playerPos.heading ?? 0,
      speed: playerPos.speed ?? 0,
    };

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
      // Orbit the player: steer along the tangent, with a small radial blend
      // that pushes the ship back toward the orbit band [ENEMY_ORBIT_MIN,
      // ENEMY_ORBIT_MAX] when it drifts outside it.
      const nx = dx / dist;
      const nz = dz / dist;
      let tx = -nz * this.orbitDirection;
      let tz = nx * this.orbitDirection;

      if (dist > ENEMY_ORBIT_MAX) {
        tx += nx * 0.4;
        tz += nz * 0.4;
      } else if (dist < ENEMY_ORBIT_MIN) {
        tx -= nx * 0.4;
        tz -= nz * 0.4;
      }
      targetHeading = Math.atan2(tx, tz);
      targetSpeed = this.maxSpeed * 0.5;
    }

    return { targetHeading, targetSpeed };
  }

  updateShip(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager) {
    // Update turret cooldowns
    for (let i = 0; i < this.turretCooldowns.length; i++) {
      if (this.turretCooldowns[i] > 0) {
        this.turretCooldowns[i] = Math.max(0, this.turretCooldowns[i] - dt);
      }
    }
    this.torpedoCooldown -= dt;
    if (this.aswCooldown > 0) this.aswCooldown = Math.max(0, this.aswCooldown - dt);
    this._updateAswPlanes(dt, projectileManager);

    const dx = playerPos.x - this.mesh.position.x;
    const dz = playerPos.z - this.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    const { targetHeading, targetSpeed } = this._decideAI(dt, playerPos, dist, dx, dz);

    this._rotateToward(targetHeading, dt);
    this.speed = targetSpeed;

    const newX = this.mesh.position.x + Math.sin(this.heading) * this.speed * dt;
    const newZ = this.mesh.position.z + Math.cos(this.heading) * this.speed * dt;

    if (this.terrain && this.terrain.isLand(newX, newZ)) {
      this.heading += Math.PI * 0.5;
      if (this.state === 'idle') this._pickPatrolTarget();
      // Team-mode reds patrol their own area; re-pick a waypoint on land hit.
      if (this.state === 'patrol' && typeof this._pickPatrolAreaTarget === 'function') {
        this._pickPatrolAreaTarget();
      }
    } else {
      const half = 5000;
      this.mesh.position.x = Math.max(-half, Math.min(half, newX));
      this.mesh.position.z = Math.max(-half, Math.min(half, newZ));
    }

    this.mesh.rotation.y = this.heading;

    if (camera) {
      const hpPercent = this.hp / this.maxHp;
      // Fill geometry is centred on the origin (see _buildMesh), so to deplete
      // from the RIGHT we both shrink it (scale.x) and shift its centre left so
      // its left edge stays flush with the background's left edge. Background
      // spans [-hpWidth/2, +hpWidth/2]; at full HP scale=1 and position.x=0
      // reproduces that exactly. As HP drops the fill narrows and its right
      // edge retracts toward the left, leaving the background visible behind.
      const w = Math.max(0.0001, hpPercent);
      this.hpBarFill.scale.x = w;
      this.hpBarFill.position.x = -(1 - w) * this._hpWidth / 2;
      this._updateHpBarColor(hpPercent);
      this.hpBarBg.lookAt(camera.position);
      this.hpBarFill.lookAt(camera.position);
    }

    // Resolve the fire target: team units set this.fireTarget themselves; in
    // solo mode _decideAI defaults it to the player.
    const ft = this.fireTarget || { x: playerPos.x, z: playerPos.z, heading: 0, speed: 0 };
    const ftDx = ft.x - this.mesh.position.x;
    const ftDz = ft.z - this.mesh.position.z;
    const ftDist = Math.sqrt(ftDx * ftDx + ftDz * ftDz);

    // Sub hunting: when the fire target is a submarine the guns stay silent
    // (shells splash harmlessly over a submerged hull) and ASW-fitted ships
    // answer with depth charges instead. Team units carry the live unit on
    // fireTarget.ref; solo defaults to the player adapter.
    const targetRef = (this.fireTarget && this.fireTarget.ref) || playerPos;
    const targetIsSub = targetRef && targetRef.shipClass === 'submarine';

    // Fire whenever there is a valid fire target within detect range. This is
    // state-agnostic so both the solo FSM (chase/orbit) and the team FSMs
    // (engage/kite/focus_fire/suppress/etc.) all shoot when they have a target.
    // Submarine targets are excluded — they get the ASW treatment below.
    if (this.fireTarget && ftDist < ENEMY_DETECT_RANGE && this.state !== 'idle' && this.state !== 'reposition' && !targetIsSub) {
      // Per-class muzzle speed: ships fire the same trajectory as the player
      // ship of the same class, so ranges match.
      const muzzleSpeed = getMuzzleSpeed(this.shipType);
      const cannonDrag = getCannonDrag(this.shipType);
      const flightTime = ftDist / muzzleSpeed;
      const leadX = ft.x + Math.sin(ft.heading) * ft.speed * flightTime;
      const leadZ = ft.z + Math.cos(ft.heading) * ft.speed * flightTime;
      const leadDx = leadX - this.mesh.position.x;
      const leadDz = leadZ - this.mesh.position.z;
      const leadDist = Math.sqrt(leadDx * leadDx + leadDz * leadDz);

      const targetYaw = Math.atan2(leadDx, leadDz);
      const localYaw = targetYaw - this.heading;
      // 炮塔旋回：直接驱动炮塔 group 的 yaw（与玩家 turret.js 同构）。
      for (const g of this._turretBodies) g.rotation.y = localYaw;

      const fireOriginY = this._deckY + 1;
      const horizDist = leadDist;
      const dy = (ft.y ?? 0) - fireOriginY;

      let pitch;
      if (horizDist < 1) {
        pitch = Math.PI / 6;
      } else {
        const v2 = muzzleSpeed * muzzleSpeed;
        const v4 = v2 * v2;
        const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);
        pitch = disc < 0
          ? Math.PI / 6
          : Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
        pitch = Math.max(-20 * Math.PI / 180, Math.min(80 * Math.PI / 180, pitch));
      }

      pitch = compensateDragPitch(pitch, horizDist, muzzleSpeed, cannonDrag);

      // 炮管俯仰：驱动 barrelPivot（炮管组挂在炮室内，随旋回一起转动）。
      for (const p of this._turretPivots) p.rotation.x = -pitch;

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
          // Tag the projectile with this ship's faction so friendly-fire can be
          // filtered on hit ('enemy' for red-side ships, 'player' for friendlies).
          projectileManager.fire(muzzleVec.clone(), spreadDir, this.damage, this.faction, muzzleSpeed, cannonDrag);
        }
        this.turretCooldowns[i] = this.fireCooldown;
      }
    }

    if (this.shipType === 'cruiser' && torpedoManager &&
        this.fireTarget && this.state !== 'idle' && this.state !== 'reposition' &&
        ftDist < 400 && this.torpedoCooldown <= 0) {
      const aimHeading = Math.atan2(ftDx, ftDz);
      torpedoManager.fire(this.mesh.position, aimHeading, 1, this.enemyLevel, 2, 'narrow', this.faction);
      this.torpedoCooldown = 15;
    }

    // Enemy submarine: dive when close (handled in _updateEnemyDive) and launch
    // torpedoes. Torpedoes work submerged, so the sub attacks from
    // stealth — only depth charges (ASW) can answer it.
    if (this.shipType === 'submarine' && torpedoManager &&
        this.fireTarget && this.state !== 'idle' && this.state !== 'reposition' &&
        ftDist < 700 && this.torpedoCooldown <= 0) {
      const aimHeading = Math.atan2(ftDx, ftDz);
      torpedoManager.fire(this.mesh.position, aimHeading, 2, this.enemyLevel, 4, 'narrow', this.faction);
      this.torpedoCooldown = 12;
    }

    // ASW-fitted ships (destroyer/cruiser racks, battleship air strike) hunt a
    // submarine fire target with depth charges on their own cooldown. Ships
    // without a fit (submarines themselves) keep relying on the torpedo blocks
    // above. Applies to team wingmen too — they share this fire pipeline.
    if (targetIsSub && this.fireTarget && this.state !== 'idle' && this.state !== 'reposition') {
      this._updateAswAttack(dt, ft, ftDist, projectileManager);
    }

    // Advance dive state (sinks the mesh + sets fullySubmerged for ASW).
    this._updateEnemyDive(dt);
  }

  // Anti-submarine attack for ASW-fitted AI ships — the mirror of the solo
  // engine's player-side _fireDepthCharges. Destroyer/cruiser racks lob a
  // hull-drop salvo into the class's clamped band; the battleship dispatches an
  // AswStrikePlane onto the target point (it releases the charges itself while
  // overflying). Charges are faction-tagged depth_charge projectiles, so the
  // existing splash → fuse → AoE path in projectile.js applies unchanged.
  _updateAswAttack(dt, ft, ftDist, projectileManager) {
    const fit = getClassAsw(this.shipType);
    if (!fit || this.aswCooldown > 0) return;
    const tierCfg = getAswTier(fit.tier);
    if (!tierCfg || !projectileManager) return;
    if (ftDist > fit.range) return;   // outside the drop band / air-strike range

    // Lead the target through the fuse window so the pattern lands where the
    // sub will be when the charges go off, not where it was spotted.
    const lead = ASW_FUSE_DELAY * (ft.speed ?? 0);
    const aim = {
      x: ft.x + Math.sin(ft.heading ?? 0) * lead,
      z: ft.z + Math.cos(ft.heading ?? 0) * lead,
    };
    const target = clampAswAim(this.mesh.position, aim, fit);

    if (fit.air) {
      this._aswPlanes.push(new AswStrikePlane(
        this.scene, this.mesh.position.x, this.mesh.position.z, target, tierCfg, this.faction,
      ));
    } else {
      // Surface hull drop: lob the salvo at sub-points around the clamped
      // point (same scatter + ballistic arc as the player release).
      const originY = 3.0;
      for (let i = 0; i < tierCfg.salvo; i++) {
        const ang = tierCfg.salvo > 1 ? (i / tierCfg.salvo) * Math.PI * 2 : 0;
        const rad = tierCfg.salvo > 1 ? tierCfg.spread * (0.4 + 0.6 * ((i * 7) % 5) / 4) : 0;
        const tx = target.x + Math.cos(ang) * rad;
        const tz = target.z + Math.sin(ang) * rad;
        const sdx = tx - this.mesh.position.x;
        const sdz = tz - this.mesh.position.z;
        const horiz = Math.sqrt(sdx * sdx + sdz * sdz);
        let pitch, yaw;
        if (horiz < 1) {
          pitch = Math.PI / 4;
          yaw = 0;
        } else {
          const v2 = ASW_MUZZLE_SPEED * ASW_MUZZLE_SPEED;
          const v4 = v2 * v2;
          const disc = v4 - GRAVITY * (GRAVITY * horiz * horiz + 2 * (0 - originY) * v2);
          pitch = disc < 0 ? Math.PI / 6 : Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horiz));
          pitch = Math.max(0, Math.min(60 * Math.PI / 180, pitch));
          yaw = Math.atan2(sdx, sdz);
        }
        projectileManager.fire(
          new THREE.Vector3(this.mesh.position.x, originY, this.mesh.position.z),
          new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)),
          tierCfg.damage, this.faction, ASW_MUZZLE_SPEED, ASW_DRAG, 'depth_charge',
        );
      }
    }
    this.aswCooldown = tierCfg.cooldown;
  }

  // Advance this ship's in-flight ASW strike planes; each released charge
  // becomes an enemy-owned depth_charge projectile through onDrop.
  _updateAswPlanes(dt, projectileManager) {
    for (let i = this._aswPlanes.length - 1; i >= 0; i--) {
      const plane = this._aswPlanes[i];
      plane.update(dt, (x, z, damage) => {
        if (!projectileManager) return;
        projectileManager.fire(
          new THREE.Vector3(x, ASW_AIR.altitude, z),
          new THREE.Vector3(0, -1, 0), damage, this.faction, 40, 0.02, 'depth_charge',
        );
      });
      if (plane.done) {
        plane.destroy();
        this._aswPlanes.splice(i, 1);
      }
    }
  }

  // Tear down state that outlives updateShip: in-flight ASW strike planes stop
  // being ticked once the ship dies, so they must be disposed here or their
  // meshes would freeze mid-sky. Called from every death/clear path.
  retire() {
    for (const plane of this._aswPlanes) plane.destroy();
    this._aswPlanes = [];
  }

  // Automatic AA point-defense for this enemy ship — the mirror of the solo
  // engine's player-side _updateAaDefense: every AA mount trains on the nearest
  // hostile (player-owned) squadron in range and fires flak on its own cooldown,
  // tagged with this ship's faction so projectile.js's faction filter makes it
  // hit only player aircraft. Submerged submarines keep their AA silent (the
  // mounts are underwater). Driven by the solo engine's _updateEnemyAaDefense.
  updateAaDefense(dt, hostiles, projectileManager) {
    const mounts = this.aaMounts || [];
    for (const m of mounts) {
      if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);
    }
    if (mounts.length === 0 || !hostiles || hostiles.length === 0 || !projectileManager) return;
    if (!this.alive || this.fullySubmerged) return;
    const aa = getClassAa(this.shipType);
    if (!aa || !aa.tier) return;
    const tierCfg = getAaTier(aa.tier);
    if (!tierCfg) return;

    const r2 = tierCfg.range * tierCfg.range;
    const x = this.mesh.position.x;
    const z = this.mesh.position.z;

    for (const mount of mounts) {
      // Nearest hostile squadron in range for this mount.
      let best = null, bestD2 = r2;
      for (const sq of hostiles) {
        if (!sq || !sq.alive) continue;
        const dx = sq.position.x - x;
        const dz = sq.position.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = sq; }
      }
      if (!best) continue;

      // Train the mount; fire only once roughly on-target so the shell
      // visually leaves the barrels pointing at the aircraft.
      if (!aimAaMountAtPoint(mount, this.heading, best.position, dt)) continue;
      if (mount.cooldown > 0) continue;

      const barrels = mount.barrels.length;
      for (let b = 0; b < barrels; b++) {
        const { origin, direction } = getTurretFireData(mount, this.heading, b);
        projectileManager.fire(origin, direction, tierCfg.damage, this.faction, tierCfg.muzzleSpeed, AA_DRAG, 'flak');
      }
      mount.cooldown = tierCfg.cooldown;
    }
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;
    // Optional hook so callers (e.g. the solo engine) can collect per-hit
    // feedback. team-mode units don't set this, so it stays a no-op there.
    if (this.onDamaged) this.onDamaged(amount, this);
  }

  // An enemy submarine counts as fully submerged (shell-immune, ASW-vulnerable)
  // once its diveDepth clears the shell-immunity threshold. Non-subs never are.
  // Mirrors Ship.fullySubmerged so the existing depth_charge / shell logic in
  // projectile.js applies unchanged.
  get fullySubmerged() {
    return this.shipClass === 'submarine' && this.diveDepth >= SUBMARINE.shellImmunityDepth;
  }

  // Advance an enemy submarine's dive state: dive when close to its fire target,
  // surface otherwise. Updates diveDepth + sinks the mesh like Ship does. No-op
  // for non-submarines so updateShip can call it unconditionally.
  _updateEnemyDive(dt) {
    if (this.shipClass !== 'submarine') {
      this.mesh.position.y = 0;
      return;
    }
    // Dive when within torpedo range of the target so the sub can attack from
    // stealth; surface to reposition when far.
    const tgt = this.fireTarget;
    const tx = tgt ? tgt.x : null;
    const tz = tgt ? tgt.z : null;
    const close = (tx != null)
      ? Math.hypot(tx - this.mesh.position.x, tz - this.mesh.position.z) < 500
      : false;
    this.submerged = close;
    const target = close ? 1 : 0;
    const rate = 1 / SUBMARINE.transitionTime;
    if (this.diveDepth / SUBMARINE.diveDepth < target) {
      this.diveDepth = Math.min(target * SUBMARINE.diveDepth, this.diveDepth + SUBMARINE.diveDepth * rate * dt);
    } else {
      this.diveDepth = Math.max(target * SUBMARINE.diveDepth, this.diveDepth - SUBMARINE.diveDepth * rate * dt);
    }
    this.mesh.position.y = -this.diveDepth;
    // A submerged sub is hidden (no minimap blip / mesh) like the player sub.
    this.mesh.visible = this.diveDepth < SUBMARINE.shellImmunityDepth || !close;
  }
}

export class EnemyManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.enemies = [];
    this.explosions = [];
  }

  // Pick a water position in the annulus [minDist, SOLO_SPAWN_MAX_DIST]
  // around the player, avoiding land and keeping SOLO_SPAWN_MIN_SEP from already-
  // placed enemies. Returns {x, z} or null if no valid spot was found in 20 tries.
  // minDist lowers for early levels (< 4) so enemies spawn closer to the player.
  _findSpawnPos(playerPos, level = 1) {
    const minDist = level < 4 ? SOLO_SPAWN_MIN_DIST_LOW : SOLO_SPAWN_MIN_DIST;
    for (let attempts = 0; attempts < 20; attempts++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = minDist + Math.random() * (SOLO_SPAWN_MAX_DIST - minDist);
      const x = playerPos.x + Math.cos(angle) * dist;
      const z = playerPos.z + Math.sin(angle) * dist;

      if (this.terrain && this.terrain.isLand(x, z)) continue;

      const tooClose = this.enemies.some(e => {
        const edx = e.mesh.position.x - x;
        const edz = e.mesh.position.z - z;
        return Math.sqrt(edx * edx + edz * edz) < SOLO_SPAWN_MIN_SEP;
      });
      if (tooClose) continue;

      return { x, z };
    }
    return null;
  }

  // Single-player (solo) enemy wave spawn. Turrets have been removed entirely;
  // every wave is now pure EnemyShip fleet. Counts are unchanged:
  //   level < 3  -> ENEMY_SCALE[level].count  ships (was that many turrets)
  //   level >= 3 -> 10 ships                   (was 5 turrets + 10 ships)
  // Spawn positions use the [600m/700m, 1500m] annulus (keep-out radius drops to
  // 600m for levels < 4) so enemies never appear too close but stay within reach.
  spawn(playerPos, level = 1) {
    this.clear();
    const scale = ENEMY_SCALE[level] || ENEMY_SCALE[10];
    const count = level < 3 ? scale.count : 10;
    const enemyShipLevel = Math.max(1, level - 1);

    for (let i = 0; i < count; i++) {
      const pos = this._findSpawnPos(playerPos, level);
      if (!pos) continue;

      // Class assignment tracks the PLAYER's level, not enemyShipLevel:
      // getClassConfig(shipType, lvl) is only valid for lvl >= 4, so cruisers
      // (which get torpedoes from their class config) first appear at player
      // level 4. The old `enemyShipLevel >= 4` check gated this one level too
      // late, so level-4 cruisers were never created and never fired torpedoes.
      let shipType = null;
      if (level >= 4) {
        // Mix cruisers / battleships, with an occasional submarine so the
        // player's ASW (depth charges) has a target to hunt.
        const r = Math.random();
        if (r < 0.20) shipType = 'submarine';
        else if (r < 0.60) shipType = 'cruiser';
        else shipType = 'battleship';
      }

      const ship = new EnemyShip(this.scene, this.terrain, pos.x, pos.z, enemyShipLevel, shipType);
      this.enemies.push(ship);
    }
  }

  update(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;

      // All enemies are ships now (turrets removed); drive each through its
      // own AI state machine.
      enemy.updateShip(dt, playerPos, playerHeading, playerSpeed, projectileManager, camera, torpedoManager);
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
    for (const e of this.enemies) {
      if (e.retire) e.retire();
      this.scene.remove(e.mesh);
    }
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
    if (enemy.retire) enemy.retire();
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
