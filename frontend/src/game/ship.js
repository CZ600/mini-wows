import * as THREE from 'three';

export const LEVEL_CONFIG = {
  1:  { length: 7,  width: 2,  height: 1.5, hp: 300,  turnRadius: 20, fireCooldown: 5.0, damage: 30, frontTurrets: 1, backTurrets: 0, hasBridge: false },
  2:  { length: 13, width: 3,  height: 2.0, hp: 450,  turnRadius: 30, fireCooldown: 4.5, damage: 35, frontTurrets: 1, backTurrets: 1, hasBridge: false },
  3:  { length: 18, width: 4,  height: 2.5, hp: 660,  turnRadius: 35, fireCooldown: 4.0, damage: 40, frontTurrets: 2, backTurrets: 1, hasBridge: false },
  4:  { length: 23, width: 5,  height: 3.0, hp: 900,  turnRadius: 40, fireCooldown: 3.5, damage: 45, frontTurrets: 2, backTurrets: 2, hasBridge: true },
  5:  { length: 28, width: 6,  height: 3.5, hp: 1200, turnRadius: 45, fireCooldown: 3.2, damage: 50, frontTurrets: 2, backTurrets: 2, hasBridge: true },
  6:  { length: 33, width: 7,  height: 4.0, hp: 1560, turnRadius: 50, fireCooldown: 2.8, damage: 55, frontTurrets: 3, backTurrets: 2, hasBridge: true },
  7:  { length: 38, width: 8,  height: 4.5, hp: 1950, turnRadius: 55, fireCooldown: 2.5, damage: 60, frontTurrets: 3, backTurrets: 2, hasBridge: true },
  8:  { length: 43, width: 9,  height: 5.0, hp: 2400, turnRadius: 60, fireCooldown: 2.2, damage: 65, frontTurrets: 3, backTurrets: 3, hasBridge: true },
  9:  { length: 48, width: 10, height: 5.5, hp: 2850, turnRadius: 65, fireCooldown: 2.0, damage: 70, frontTurrets: 3, backTurrets: 3, hasBridge: true },
  10: { length: 53, width: 11, height: 6.0, hp: 3300, turnRadius: 70, fireCooldown: 1.8, damage: 80, frontTurrets: 3, backTurrets: 3, hasBridge: true },
};

export const CLASS_CONFIG = {
  destroyer: {
    4:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    5:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    6:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    7:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    8:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    9:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
    10: { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 8, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7 },
  },
  cruiser: {
    4:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    5:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    6:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    7:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    8:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    9:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
    10: { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85 },
  },
  battleship: {
    4:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    5:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    6:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    7:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    8:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    9:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
    10: { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0 },
  },
};

const BASE_MAX_SPEED = 16.67;

export function getClassConfig(shipClass, level) {
  if (!shipClass || level < 4 || level > 10) return null;
  const cc = CLASS_CONFIG[shipClass]?.[level];
  if (!cc) return null;
  const base = LEVEL_CONFIG[level];
  const sm = cc.sizeMul || 1.0;
  return {
    hp: Math.round(base.hp * cc.hpMul),
    maxSpeed: BASE_MAX_SPEED * cc.speedMul,
    turnRadius: Math.round(base.turnRadius * cc.turnMul),
    damage: Math.round(base.damage * cc.damageMul),
    fireCooldown: +(base.fireCooldown * cc.cooldownMul).toFixed(2),
    frontTurrets: base.frontTurrets,
    backTurrets: base.backTurrets,
    hasBridge: base.hasBridge,
    length: Math.round(base.length * sm),
    width: +(base.width * sm).toFixed(1),
    height: +(base.height * sm).toFixed(1),
    torpedoTiers: cc.torpedoTiers,
    torpedoTubeCount: cc.torpedoTubeCount,
    turretMul: cc.turretMul || 1.0,
  };
}

export function getTorpedoTubes(shipClass, level) {
  const cc = CLASS_CONFIG[shipClass]?.[level];
  if (!cc || cc.torpedoTubeCount === 0) return [];
  const count = cc.torpedoTubeCount;
  const tubes = [];
  for (let i = 0; i < count; i++) {
    const side = i % 2 === 0 ? 'port' : 'starboard';
    tubes.push({
      side,
      angle: side === 'port' ? Math.PI / 2 : -Math.PI / 2,
      index: i,
    });
  }
  return tubes;
}

const ACCEL = BASE_MAX_SPEED / 15;
const DECEL_FRICTION = 0.98;
const YAW_RANGE_FULL = Math.PI;
const YAW_RANGE_BRIDGE = 2.2;

function buildTurretDefs(cfg) {
  const defs = [];
  const yawRange = cfg.hasBridge ? YAW_RANGE_BRIDGE : YAW_RANGE_FULL;
  const spacing = Math.max(1.5, cfg.width * 0.85 * (cfg.spacingMul || 1.0));

  let frontCenter = cfg.length * 0.2;
  let backCenter = -cfg.length * 0.2;

  if (cfg.hasBridge) {
    const turretSize = (1.2 + cfg.width * 0.15) * (cfg.turretMul || 1.0);
    const bridgeHalf = cfg.length * 0.06;
    const minDist = bridgeHalf + turretSize * 0.7 + 0.2;

    if (cfg.frontTurrets > 0) {
      const closestOffset = (cfg.frontTurrets - 1) / 2 * spacing;
      frontCenter = Math.max(frontCenter, minDist + closestOffset);
    }
    if (cfg.backTurrets > 0) {
      const closestOffset = (cfg.backTurrets - 1) / 2 * spacing;
      backCenter = Math.min(backCenter, -(minDist + closestOffset));
    }
  }

  const nFront = cfg.frontTurrets;
  for (let i = 0; i < nFront; i++) {
    const offset = (i - (nFront - 1) / 2) * spacing;
    defs.push({ z: frontCenter + offset, x: 0, yawCenter: 0, yawRange, isFront: true });
  }

  const nBack = cfg.backTurrets;
  for (let i = 0; i < nBack; i++) {
    const offset = (i - (nBack - 1) / 2) * spacing;
    defs.push({ z: backCenter + offset, x: 0, yawCenter: Math.PI, yawRange, isFront: false });
  }

  return defs;
}

function createBowGeometry(width, height, length) {
  const hw = width / 2;
  const hh = height / 2;
  const positions = new Float32Array([
    -hw, -hh, 0,
     hw, -hh, 0,
     hw,  hh, 0,
    -hw,  hh, 0,
     0, -hh, length,
     0,  hh, length,
  ]);
  const indices = new Uint16Array([
    0, 2, 1,  0, 3, 2,
    3, 0, 4,  3, 4, 5,
    2, 5, 4,  1, 2, 4,
    0, 1, 4,
    3, 5, 2,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

function createSternGeometry(frontWidth, backWidth, height, length) {
  const fhw = frontWidth / 2;
  const bhw = backWidth / 2;
  const hh = height / 2;
  const positions = new Float32Array([
    -fhw, -hh, 0,
     fhw, -hh, 0,
     fhw,  hh, 0,
    -fhw,  hh, 0,
    -bhw, -hh, -length,
     bhw, -hh, -length,
     bhw,  hh, -length,
    -bhw,  hh, -length,
  ]);
  const indices = new Uint16Array([
    0, 1, 2,  0, 2, 3,
    4, 6, 5,  4, 7, 6,
    0, 3, 7,  0, 7, 4,
    1, 5, 6,  1, 6, 2,
    3, 2, 6,  3, 6, 7,
    0, 4, 5,  0, 5, 1,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export class Ship {
  constructor(scene, level = 1, shipClass = null) {
    this.scene = scene;
    this.level = level;
    this.shipClass = shipClass;
    const cfg = this._getConfig(level);
    this.shipLength = cfg.length;
    this.shipWidth = cfg.width;
    this.turnRadius = cfg.turnRadius;
    this.maxHp = cfg.hp;
    this.maxSpeed = cfg.maxSpeed || BASE_MAX_SPEED;
    this.fireCooldown = cfg.fireCooldown;
    this.damage = cfg.damage;
    this.torpedoTubes = getTorpedoTubes(shipClass, level);

    this.heading = 0;
    this.speed = 0;
    this.position = new THREE.Vector3(0, 0, 0);
    this.hp = this.maxHp;
    this.alive = true;
    this.sinking = false;
    this.sinkTimer = 0;
    this.turrets = [];

    this._buildMesh(cfg);
    this.scene.add(this.mesh);
    this._initWake();
  }

  _getConfig(level) {
    const classCfg = getClassConfig(this.shipClass, level);
    return classCfg || LEVEL_CONFIG[level];
  }

  _buildMesh(cfg) {
    this.mesh = new THREE.Group();
    const deckY = cfg.height + 1.0;
    const hullY = cfg.height / 2 + 1.0;
    const hullMat = new THREE.MeshPhongMaterial({ color: 0xb0b0b0 });

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
      const bw = cfg.width * 0.45;
      const bh = cfg.height * 0.7;
      const bl = cfg.length * 0.12;
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bl),
        hullMat
      );
      bridge.position.set(0, deckY + bh / 2 + 0.1, 0);
      this.mesh.add(bridge);

      const windows = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.85, bh * 0.25, bl + 0.1),
        new THREE.MeshPhongMaterial({ color: 0xaaddff })
      );
      windows.position.y = bh * 0.1;
      bridge.add(windows);

      const sbw = bw * 0.6;
      const sbh = bh * 0.35;
      const sbl = bl * 0.6;
      const smallBlock = new THREE.Mesh(
        new THREE.BoxGeometry(sbw, sbh, sbl),
        hullMat
      );
      smallBlock.position.set(0, bh / 2 + sbh / 2, 0);
      bridge.add(smallBlock);

      const mastH = bh * 0.8;
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.15, mastH, 6),
        hullMat
      );
      mast.position.set(0, sbh / 2 + mastH / 2, 0);
      smallBlock.add(mast);

      this.scopedCameraHeight = deckY + 0.1 + bh + sbh + mastH + 1.5;
    } else {
      this.scopedCameraHeight = deckY + 3;
    }
    this.hasBridge = cfg.hasBridge;

    const turretSize = (1.2 + cfg.width * 0.15) * (cfg.turretMul || 1.0);
    const barrelLen = turretSize * 1.5;
    const turretDefs = buildTurretDefs(cfg);
    this.turrets = [];

    for (const def of turretDefs) {
      const turretGroup = new THREE.Group();

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(turretSize * 0.5, turretSize * 0.6, turretSize * 0.3, 8),
        new THREE.MeshPhongMaterial({ color: 0x808080 })
      );
      turretGroup.add(base);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(turretSize, turretSize, turretSize),
        new THREE.MeshPhongMaterial({ color: 0x808080 })
      );
      body.position.y = turretSize * 0.4;
      turretGroup.add(body);

      const barrelPivot = new THREE.Group();
      barrelPivot.position.set(0, turretSize * 0.4, turretSize * 0.5);
      turretGroup.add(barrelPivot);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, barrelLen, 8),
        new THREE.MeshPhongMaterial({ color: 0x505050 })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, barrelLen / 2);
      barrelPivot.add(barrel);

      turretGroup.position.set(def.x, deckY + 0.15, def.z);
      this.mesh.add(turretGroup);

      this.turrets.push({
        group: turretGroup,
        body,
        barrelPivot,
        barrel,
        barrelLen,
        currentYaw: def.yawCenter,
        currentPitch: 0,
        cooldown: 0,
        yawCenter: def.yawCenter,
        yawRange: def.yawRange,
        isFront: def.isFront,
      });
    }
  }

  _initWake() {
    const max = 200;
    this._wakeMax = max;
    this._wakeData = new Array(max);
    this._wakeEmitAccum = 0;
    this._wakeNextIdx = 0;

    const positions = new Float32Array(max * 3);
    const opacities = new Float32Array(max);
    const sizes = new Float32Array(max);

    for (let i = 0; i < max; i++) {
      positions[i * 3 + 1] = -100;
      opacities[i] = 0;
      sizes[i] = 0;
      this._wakeData[i] = { active: false, life: 0, maxLife: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aOpacity', new THREE.Float32BufferAttribute(opacities, 1));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aOpacity;
        attribute float aSize;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d) * vOpacity;
          gl_FragColor = vec4(1.0, 1.0, 1.0, a);
        }
      `,
    });

    this._wakeMesh = new THREE.Points(geo, mat);
    this.scene.add(this._wakeMesh);
  }

  _emitWake() {
    const idx = this._wakeNextIdx;
    this._wakeNextIdx = (this._wakeNextIdx + 1) % this._wakeMax;

    const p = this._wakeData[idx];
    p.active = true;
    p.life = 0;
    p.maxLife = 1.0 + Math.random() * 0.8;

    const halfLen = this.shipLength / 2;
    const halfW = this.shipWidth * 0.2;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    const side = (Math.random() - 0.5) * 2 * halfW;
    p.x = this.position.x - sinH * halfLen + cosH * side;
    p.y = 0.3 + Math.random() * 0.4;
    p.z = this.position.z - cosH * halfLen - sinH * side;

    const backSpeed = Math.abs(this.speed) * 0.2 + Math.random() * 1.5;
    const spread = (Math.random() - 0.5) * 2;
    p.vx = -sinH * backSpeed + cosH * spread;
    p.vy = Math.random() * 1.2;
    p.vz = -cosH * backSpeed - sinH * spread;
  }

  _updateWake(dt) {
    const positions = this._wakeMesh.geometry.attributes.position.array;
    const opacities = this._wakeMesh.geometry.attributes.aOpacity.array;
    const sizes = this._wakeMesh.geometry.attributes.aSize.array;

    for (let i = 0; i < this._wakeMax; i++) {
      const p = this._wakeData[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        positions[i * 3 + 1] = -100;
        opacities[i] = 0;
        sizes[i] = 0;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 3.0 * dt;
        if (p.y < 0) { p.y = 0; p.vy = 0; }
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        const t = p.life / p.maxLife;
        opacities[i] = (1 - t) * 0.7;
        sizes[i] = (0.5 + t * 1.5) * (1 + this.shipWidth * 0.1);
      }
    }

    this._wakeMesh.geometry.attributes.position.needsUpdate = true;
    this._wakeMesh.geometry.attributes.aOpacity.needsUpdate = true;
    this._wakeMesh.geometry.attributes.aSize.needsUpdate = true;
  }

  _destroyWake() {
    if (this._wakeMesh) {
      this.scene.remove(this._wakeMesh);
      this._wakeMesh.geometry.dispose();
      this._wakeMesh.material.dispose();
      this._wakeMesh = null;
    }
  }

  upgradeToLevel(newLevel) {
    const pos = this.position.clone();
    const heading = this.heading;
    const alive = this.alive;

    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    this.scene.remove(this.mesh);
    this._destroyWake();

    this.level = newLevel;
    const cfg = this._getConfig(newLevel);
    this.shipLength = cfg.length;
    this.shipWidth = cfg.width;
    this.turnRadius = cfg.turnRadius;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.maxSpeed = cfg.maxSpeed || BASE_MAX_SPEED;
    this.fireCooldown = cfg.fireCooldown;
    this.damage = cfg.damage;
    this.torpedoTubes = getTorpedoTubes(this.shipClass, newLevel);
    this.turrets = [];

    this._buildMesh(cfg);
    this._initWake();
    this.position.copy(pos);
    this.heading = heading;
    this.alive = alive;
    this.mesh.position.copy(pos);
    this.mesh.rotation.y = heading;
    this.scene.add(this.mesh);
  }

  update(dt, keys, terrain) {
    if (!this.alive) {
      if (this.sinking) {
        this.sinkTimer += dt;
        this.mesh.position.y -= dt * 2;
        this.mesh.rotation.x += dt * 0.3;
        if (this.sinkTimer > 5) {
          this.sinking = false;
          this.mesh.visible = false;
        }
      }
      this._updateWake(dt);
      return;
    }

    // Speed-dependent acceleration: faster at low speed, slower at high speed
    const speedRatio = Math.abs(this.speed) / this.maxSpeed;
    const accel = ACCEL * (1.5 - speedRatio);
    if (keys.w) this.speed += accel * dt;
    if (keys.s) this.speed -= accel * dt;
    if (!keys.w && !keys.s) {
      this.speed *= DECEL_FRICTION;
      if (Math.abs(this.speed) < 0.1) this.speed = 0;
    }
    this.speed = Math.max(-this.maxSpeed * 0.3, Math.min(this.maxSpeed, this.speed));

    if (Math.abs(this.speed) > 0.5) {
      const turnRate = this.speed / this.turnRadius;
      if (keys.a) this.heading += turnRate * dt;
      if (keys.d) this.heading -= turnRate * dt;
    }

    const newX = this.position.x + Math.sin(this.heading) * this.speed * dt;
    const newZ = this.position.z + Math.cos(this.heading) * this.speed * dt;
    const half = 5000;
    this.position.x = Math.max(-half, Math.min(half, newX));
    this.position.z = Math.max(-half, Math.min(half, newZ));

    if (terrain) {
      const corners = this.getCorners();
      for (const c of corners) {
        if (terrain.isLand(c.x, c.z)) {
          this.hp = 0;
          this.sink();
          return;
        }
      }
    }

    this.mesh.position.set(this.position.x, 0, this.position.z);
    this.mesh.rotation.y = this.heading;

    if (Math.abs(this.speed) > 1) {
      this._wakeEmitAccum += Math.abs(this.speed) * 5 * dt;
      while (this._wakeEmitAccum >= 1) {
        this._emitWake();
        this._wakeEmitAccum -= 1;
      }
    }
    this._updateWake(dt);

    for (const t of this.turrets) {
      if (t.cooldown > 0) t.cooldown -= dt;
    }
  }

  getCorners() {
    const halfL = this.shipLength / 2;
    const halfW = this.shipWidth / 2;
    const cos = Math.cos(this.heading);
    const sin = Math.sin(this.heading);
    return [
      { x: this.position.x + sin * halfL + cos * halfW, z: this.position.z + cos * halfL - sin * halfW },
      { x: this.position.x + sin * halfL - cos * halfW, z: this.position.z + cos * halfL + sin * halfW },
      { x: this.position.x - sin * halfL + cos * halfW, z: this.position.z - cos * halfL - sin * halfW },
      { x: this.position.x - sin * halfL - cos * halfW, z: this.position.z - cos * halfL + sin * halfW },
    ];
  }

  sink() {
    if (!this.alive) return;
    this.alive = false;
    this.sinking = true;
    this.sinkTimer = 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.sink();
    }
  }

  getReloadProgress() {
    if (this.turrets.length === 0) return 1;
    return Math.min(...this.turrets.map(t => 1 - Math.max(0, t.cooldown) / this.fireCooldown));
  }

  destroy() {
    this.scene.remove(this.mesh);
    this._destroyWake();
  }
}
