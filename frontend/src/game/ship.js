import * as THREE from 'three';
import { applyHalfLambert } from './scene.js';

export const LEVEL_CONFIG = {
  // Hull height scaled to ~60% of the original freeboard so ships sit lower
  // in the water; collision boxes derive from this via getClassConfig().
  1:  { length: 7,  width: 2,  height: 0.9, hp: 300,  turnRadius: 20, fireCooldown: 5.0, damage: 30, frontTurrets: 1, backTurrets: 0, hasBridge: false },
  2:  { length: 13, width: 3,  height: 1.2, hp: 450,  turnRadius: 30, fireCooldown: 4.5, damage: 35, frontTurrets: 1, backTurrets: 1, hasBridge: false },
  3:  { length: 18, width: 4,  height: 1.5, hp: 660,  turnRadius: 35, fireCooldown: 4.0, damage: 40, frontTurrets: 2, backTurrets: 1, hasBridge: false },
  4:  { length: 23, width: 5,  height: 1.8, hp: 900,  turnRadius: 40, fireCooldown: 3.5, damage: 45, frontTurrets: 2, backTurrets: 2, hasBridge: true },
  5:  { length: 28, width: 6,  height: 2.1, hp: 1200, turnRadius: 45, fireCooldown: 3.2, damage: 50, frontTurrets: 2, backTurrets: 2, hasBridge: true },
  6:  { length: 33, width: 7,  height: 2.4, hp: 1560, turnRadius: 50, fireCooldown: 2.8, damage: 55, frontTurrets: 3, backTurrets: 2, hasBridge: true },
  7:  { length: 38, width: 8,  height: 2.7, hp: 1950, turnRadius: 55, fireCooldown: 2.5, damage: 60, frontTurrets: 3, backTurrets: 2, hasBridge: true },
  8:  { length: 43, width: 9,  height: 3.0, hp: 2400, turnRadius: 60, fireCooldown: 2.2, damage: 65, frontTurrets: 3, backTurrets: 3, hasBridge: true },
  9:  { length: 48, width: 10, height: 3.3, hp: 2850, turnRadius: 65, fireCooldown: 2.0, damage: 70, frontTurrets: 3, backTurrets: 3, hasBridge: true },
  10: { length: 53, width: 11, height: 3.6, hp: 3300, turnRadius: 70, fireCooldown: 1.8, damage: 80, frontTurrets: 3, backTurrets: 3, hasBridge: true },
};

export const CLASS_CONFIG = {
  destroyer: {
    4:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 1 },
    5:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 1 },
    6:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 2 },
    7:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 2 },
    8:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 2 },
    9:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 2 },
    10: { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 8, sizeMul: 0.55, turretMul: 0.75, spacingMul: 0.7, barrels: 2 },
  },
  cruiser: {
    4:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 1 },
    5:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 1 },
    6:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 2 },
    7:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 2 },
    8:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 2 },
    9:  { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 2 },
    10: { hpMul: 1.0,  speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, turretMul: 1.0, spacingMul: 0.85, barrels: 2 },
  },
  // Battleship: Lv6-7 double turrets; Lv8-10 triple turrets in A-B-X layout
  // (2 front + 1 back). get_class_config keeps DPM constant via the
  // equivalent-barrels factor derived from BASE_TURRET_COUNT.
  battleship: {
    4:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 1 },
    5:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 1 },
    6:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 2 },
    7:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 2 },
    8:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 1 },
    9:  { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 1 },
    10: { hpMul: 1.4,  speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 2 },
  },
};

// Reference turret count before per-class multi-barrel / A-B-X overrides.
// Used by getClassConfig() to hold DPM constant when turret count changes.
const BASE_TURRET_COUNT = {
  4: 4, 5: 4, 6: 5, 7: 5, 8: 6, 9: 6, 10: 6,
};

export const DRIFT_CONFIG = {
  default:    { recovery_base: 2.5, speed_factor: 0.14, max_angle: 0.40 },
  destroyer:  { recovery_base: 2.5, speed_factor: 0.10, max_angle: 0.65 },
  cruiser:    { recovery_base: 2.5, speed_factor: 0.14, max_angle: 0.45 },
  battleship: { recovery_base: 2.0, speed_factor: 0.05, max_angle: 0.25 },
};

export function getDriftConfig(shipClass) {
  if (!shipClass) return DRIFT_CONFIG.default;
  return DRIFT_CONFIG[shipClass] || DRIFT_CONFIG.default;
}

const BASE_MAX_SPEED = 16.67;

export function getClassConfig(shipClass, level) {
  if (!shipClass || level < 4 || level > 10) return null;
  const cc = CLASS_CONFIG[shipClass]?.[level];
  if (!cc) return null;
  const base = LEVEL_CONFIG[level];
  const sm = cc.sizeMul || 1.0;
  const barrels = cc.barrels || 1;

  // Optional per-class turret layout override (e.g. battleship A-B-X),
  // otherwise fall back to the shared LEVEL_CONFIG layout.
  const frontTurrets = cc.frontTurrets ?? base.frontTurrets;
  const backTurrets = cc.backTurrets ?? base.backTurrets;
  const newTurrets = frontTurrets + backTurrets;

  // Hold DPM constant: the original layout (BASE_TURRET_COUNT single-barrel
  // turrets) had a fixed per-shot damage. The new layout fires more shots
  // (newTurrets * barrels), so each shot's damage scales down so that the
  // total damage per salvo is preserved.
  const baseSalvoShots = BASE_TURRET_COUNT[level] ?? (base.frontTurrets + base.backTurrets);
  const newSalvoShots = newTurrets * barrels;
  const dmgScale = baseSalvoShots / newSalvoShots;

  return {
    hp: Math.round(base.hp * cc.hpMul),
    maxSpeed: BASE_MAX_SPEED * cc.speedMul,
    turnRadius: Math.round(base.turnRadius * cc.turnMul),
    damage: Math.round(base.damage * cc.damageMul * dmgScale),
    fireCooldown: +(base.fireCooldown * cc.cooldownMul).toFixed(2),
    frontTurrets,
    backTurrets,
    hasBridge: base.hasBridge,
    length: Math.round(base.length * sm),
    width: +(base.width * sm).toFixed(1),
    height: +(base.height * sm).toFixed(1),
    torpedoTiers: cc.torpedoTiers,
    torpedoTubeCount: cc.torpedoTubeCount,
    turretMul: cc.turretMul || 1.0,
    barrels,
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
// Bridge ships (Lv4+) keep a slightly narrower arc than the full 360° of
// early-game ships — the island blocks dead-ast/fire arcs. Widened from 2.2
// to 2.6 (≈149°/side) so front and rear groups overlap at the beam and oblique
// quarters (e.g. ±150°) can still bring a turret group to bear.
const YAW_RANGE_BRIDGE = 2.6;

function buildTurretDefs(cfg) {
  const defs = [];
  const yawRange = cfg.hasBridge ? YAW_RANGE_BRIDGE : YAW_RANGE_FULL;
  const turretMul = cfg.turretMul || 1.0;
  const barrels = cfg.barrels || 1;
  const turretSize = (0.8 + cfg.width * 0.10) * turretMul;
  // Housing width widens with barrel count; spacing just clears it so adjacent
  // turrets in a group sit tightly packed (was width*0.85, far too loose now
  // that turrets are smaller).
  const housingWidth = turretSize * (1 + (barrels - 1) * 0.45);
  const spacing = Math.max(1.2, housingWidth * 1.4);

  let frontCenter = cfg.length * 0.2;
  let backCenter = -cfg.length * 0.2;

  if (cfg.hasBridge) {
    // Bridge stays centered; turrets pack against its fore/aft edges.
    const bridgeZ = 0;
    const bridgeHalf = cfg.length * 0.14;
    // Tight gap so front turrets hug the bridge; rear keeps a bit more room.
    const frontGap = housingWidth * 0.35;
    const backGap = housingWidth * 0.55;

    if (cfg.frontTurrets > 0) {
      // Front turrets sit ahead of the bridge, pushed clear of its near edge.
      const frontEdge = bridgeZ + bridgeHalf;
      const closestOffset = (cfg.frontTurrets - 1) / 2 * spacing;
      frontCenter = Math.max(frontCenter, frontEdge + frontGap + closestOffset);
    }
    if (cfg.backTurrets > 0) {
      // Rear turret(s) sit behind the bridge, pushed clear of its far edge.
      const backEdge = bridgeZ - bridgeHalf;
      const closestOffset = (cfg.backTurrets - 1) / 2 * spacing;
      backCenter = Math.min(backCenter, backEdge - backGap - closestOffset);
    }
  }

  // Step height so each turret aft of another is raised enough to fire over it
  // (real warship "superfiring" arrangement). Steps scale with turret size so
  // the barrel of the rearmost turret clears the housing of the one ahead.
  const stepH = turretSize * 0.55;

  const nFront = cfg.frontTurrets;
  for (let i = 0; i < nFront; i++) {
    const offset = (i - (nFront - 1) / 2) * spacing;
    // Front group fires forward: the turret nearest the bridge (lowest i, furthest
    // aft in the group) sits highest to fire over the ones ahead of it.
    defs.push({ z: frontCenter + offset, x: 0, y: (nFront - 1 - i) * stepH, yawCenter: 0, yawRange, isFront: true });
  }

  const nBack = cfg.backTurrets;
  for (let i = 0; i < nBack; i++) {
    const offset = (i - (nBack - 1) / 2) * spacing;
    // Rear group fires aft: the turret nearest the bridge (highest i, furthest
    // forward in the group) sits highest to fire over the ones behind it.
    defs.push({ z: backCenter + offset, x: 0, y: i * stepH, yawCenter: Math.PI, yawRange, isFront: false });
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
    this.shipHeight = cfg.height;
    this.turnRadius = cfg.turnRadius;
    this.maxHp = cfg.hp;
    this.maxSpeed = cfg.maxSpeed || BASE_MAX_SPEED;
    this.fireCooldown = cfg.fireCooldown;
    this.damage = cfg.damage;
    this.barrels = cfg.barrels || 1;
    this.torpedoTubes = getTorpedoTubes(shipClass, level);

    this.heading = 0;
    this.velocityHeading = 0;
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
    applyHalfLambert(hullMat);

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
      // Long-island superstructure: a low deckhouse runs fore-aft, with a
      // forward bridge block (carrying the mast) and an aft funnel.
      //
      //            |           <- mast (tall, thin, forward)
      //            ▢           <- forward bridge block (taller)
      //   ▢  ▢  ▢  ▢  ▢  ▢    <- long low deckhouse island
      //                  ▢     <- aft funnel block (shorter, wider)
      //
      const isAbx = (cfg.barrels || 1) >= 3;
      const bridgeOffsetZ = 0;
      const bw = cfg.width * (isAbx ? 0.5 : 0.45);
      // Bridge island height: raised to 140% of the original freeboard-derived
      // height so the superstructure towers over the lowered hull.
      const bh = cfg.height * 0.98;
      // Lengthened island: spans a larger share of the deck.
      const bl = cfg.length * 0.26;

      // Long low deckhouse (the ▢▢▢▢▢ base).
      const deckhouseH = bh * 0.5;
      const deckhouse = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.85, deckhouseH, bl),
        hullMat
      );
      deckhouse.position.set(0, deckY + deckhouseH / 2 + 0.1, bridgeOffsetZ);
      this.mesh.add(deckhouse);

      // Window strip wrapping the deckhouse.
      const windowMat = new THREE.MeshPhongMaterial({ color: 0xaaddff });
      applyHalfLambert(windowMat);
      const windows = new THREE.Mesh(
        new THREE.BoxGeometry(bw * 0.88, deckhouseH * 0.35, bl + 0.1),
        windowMat
      );
      windows.position.y = deckhouseH * 0.1;
      deckhouse.add(windows);

      // Forward bridge block — taller, sits at the front of the island.
      const fwdBlockW = bw * 0.7;
      const fwdBlockH = bh * 0.8;
      const fwdBlockL = bl * 0.32;
      const fwdBlock = new THREE.Mesh(
        new THREE.BoxGeometry(fwdBlockW, fwdBlockH, fwdBlockL),
        hullMat
      );
      fwdBlock.position.set(0, deckhouseH / 2 + fwdBlockH / 2, bl * 0.30);
      deckhouse.add(fwdBlock);

      const fwdWindows = new THREE.Mesh(
        new THREE.BoxGeometry(fwdBlockW * 0.85, fwdBlockH * 0.25, fwdBlockL + 0.1),
        windowMat
      );
      fwdWindows.position.y = fwdBlockH * 0.15;
      fwdBlock.add(fwdWindows);

      // Aft funnel block — shorter and squatter, sits at the rear of the island.
      const funnelW = bw * 0.5;
      const funnelH = bh * 0.6;
      const funnelL = bl * 0.26;
      const funnel = new THREE.Mesh(
        new THREE.BoxGeometry(funnelW, funnelH, funnelL),
        hullMat
      );
      funnel.position.set(0, deckhouseH / 2 + funnelH / 2, -bl * 0.32);
      deckhouse.add(funnel);

      // Funnel top (dark rim).
      const funnelTopMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
      applyHalfLambert(funnelTopMat);
      const funnelTop = new THREE.Mesh(
        new THREE.BoxGeometry(funnelW * 0.9, funnelH * 0.12, funnelL * 0.9),
        funnelTopMat
      );
      funnelTop.position.y = funnelH / 2 - funnelH * 0.06;
      funnel.add(funnelTop);

      // Tripod-ish mast on the forward bridge block. Taller on capital ships.
      const mastH = bh * (isAbx ? 1.2 : 0.9);
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.18, mastH, 6),
        hullMat
      );
      mast.position.set(0, fwdBlockH / 2 + mastH / 2, -fwdBlockL * 0.1);
      fwdBlock.add(mast);

      // Crossarm near the top of the mast.
      const crossarm = new THREE.Mesh(
        new THREE.BoxGeometry(fwdBlockW * 0.5, 0.12, 0.12),
        hullMat
      );
      crossarm.position.set(0, mastH * 0.35, 0);
      mast.add(crossarm);

      this.scopedCameraHeight = deckY + 0.1 + deckhouseH + fwdBlockH + mastH + 1.5;
    } else {
      this.scopedCameraHeight = deckY + 3;
    }
    this.hasBridge = cfg.hasBridge;

    const barrels = cfg.barrels || 1;
    const turretSize = (0.8 + cfg.width * 0.10) * (cfg.turretMul || 1.0);
    this.turretSize = turretSize; // exposed for hitbox height computation
    const barrelLen = turretSize * 1.5;
    // Multi-barrel spacing: barrels fan out sideways across the turret face.
    const barrelGap = turretSize * 0.35;
    const turretDefs = buildTurretDefs(cfg);
    this.turrets = [];

    const turretMat = new THREE.MeshPhongMaterial({ color: 0x808080 });
    applyHalfLambert(turretMat);
    const barrelMat = new THREE.MeshPhongMaterial({ color: 0x505050 });
    applyHalfLambert(barrelMat);

    for (const def of turretDefs) {
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

      const barrelPivot = new THREE.Group();
      barrelPivot.position.set(0, turretSize * 0.4, turretSize * 0.5);
      turretGroup.add(barrelPivot);

      // One barrel mesh per barrel, offset sideways on x.
      const barrelMeshes = [];
      for (let b = 0; b < barrels; b++) {
        const barrel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, barrelLen, 8),
          barrelMat
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set((b - (barrels - 1) / 2) * barrelGap, 0, barrelLen / 2);
        barrelPivot.add(barrel);
        barrelMeshes.push(barrel);
      }

      turretGroup.position.set(def.x, deckY + 0.15 + (def.y || 0), def.z);
      this.mesh.add(turretGroup);

      // Cylindrical pedestal under raised (superfiring) turrets, filling the
      // gap from the deck up to the turret base.
      if ((def.y || 0) > 0.01) {
        const housingWidth = turretSize * (1 + (barrels - 1) * 0.45);
        const pedestalH = (def.y || 0) + 0.15;
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(housingWidth * 0.42, housingWidth * 0.5, pedestalH, 12),
          turretMat
        );
        pedestal.position.set(def.x, deckY + pedestalH / 2, def.z);
        this.mesh.add(pedestal);
      }

      this.turrets.push({
        group: turretGroup,
        body,
        barrelPivot,
        barrel: barrelMeshes[0],
        barrels: barrelMeshes,
        barrelLen,
        barrelGap,
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
    const max = 480;
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
          float a = (1.0 - smoothstep(0.45, 0.5, d)) * vOpacity;
          float ring = smoothstep(0.28, 0.45, d);
          vec3 color = mix(vec3(1.0, 1.0, 1.0), vec3(0.18, 0.26, 0.34), ring);
          gl_FragColor = vec4(color, a);
        }
      `,
    });

    this._wakeMesh = new THREE.Points(geo, mat);
    this._wakeMesh.frustumCulled = false;
    this.scene.add(this._wakeMesh);
  }

  _emitWake() {
    const idx = this._wakeNextIdx;
    this._wakeNextIdx = (this._wakeNextIdx + 1) % this._wakeMax;

    const p = this._wakeData[idx];
    p.active = true;
    p.life = 0;
    p.maxLife = 1.2 + Math.random() * 0.8;

    const halfLen = this.shipLength / 2;
    const halfW = this.shipWidth * 0.25;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    const isBow = Math.random() < 0.20;
    const sign = Math.random() < 0.5 ? -1 : 1;

    if (isBow) {
      const bowZ = halfLen * 0.7;
      const bowSide = sign * halfW;
      p.x = this.position.x + sinH * bowZ + cosH * bowSide;
      p.y = 1.6 + Math.random() * 1.0;
      p.z = this.position.z + cosH * bowZ - sinH * bowSide;

      const sideSpeed = Math.abs(this.speed) * 0.35 + Math.random() * 2.0;
      p.vx = cosH * sign * sideSpeed - sinH * Math.abs(this.speed) * 0.15;
      p.vy = 1.8 + Math.random() * 2.0;
      p.vz = -sinH * sign * sideSpeed - cosH * Math.abs(this.speed) * 0.15;
    } else {
      const side = (Math.random() - 0.5) * 2 * halfW;
      p.x = this.position.x - sinH * halfLen + cosH * side;
      p.y = 1.6 + Math.random() * 1.0;
      p.z = this.position.z - cosH * halfLen - sinH * side;

      const backSpeed = Math.abs(this.speed) * 0.25 + Math.random() * 2.0;
      const spread = (Math.random() - 0.5) * 3.5;
      p.vx = -sinH * backSpeed + cosH * spread;
      p.vy = 2.2 + Math.random() * 2.3;
      p.vz = -cosH * backSpeed - sinH * spread;
    }
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
        p.vy -= 4.0 * dt;
        if (p.y < 0.3) { p.y = 0.3; p.vy = 0; }
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        const t = p.life / p.maxLife;
        opacities[i] = (1 - t) * 1.0;
        sizes[i] = (1.4 + t * 2.6) * (1 + this.shipWidth * 0.12);
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
    const vh = this.velocityHeading;
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
    this.shipHeight = cfg.height;
    this.turnRadius = cfg.turnRadius;
    this.maxHp = cfg.hp;
    this.hp = cfg.hp;
    this.maxSpeed = cfg.maxSpeed || BASE_MAX_SPEED;
    this.fireCooldown = cfg.fireCooldown;
    this.damage = cfg.damage;
    this.barrels = cfg.barrels || 1;
    this.torpedoTubes = getTorpedoTubes(this.shipClass, newLevel);
    this.turrets = [];

    this._buildMesh(cfg);
    this._initWake();
    this.position.copy(pos);
    this.heading = heading;
    this.velocityHeading = vh;
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

    this._applyDrift(dt);

    const newX = this.position.x + Math.sin(this.velocityHeading) * this.speed * dt;
    const newZ = this.position.z + Math.cos(this.velocityHeading) * this.speed * dt;
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
      this._wakeEmitAccum += Math.abs(this.speed) * 15 * dt;
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

  _applyDrift(dt) {
    const driftCfg = getDriftConfig(this.shipClass);
    let diff = this.heading - this.velocityHeading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    const speedRatio = Math.abs(this.speed) <= 0.5 ? 0 : Math.abs(this.speed) / this.maxSpeed;
    const recovery = driftCfg.recovery_base * (1 - speedRatio * (1 - driftCfg.speed_factor));
    const maxStep = recovery * dt;

    if (Math.abs(diff) <= maxStep) {
      this.velocityHeading = this.heading;
    } else {
      this.velocityHeading += Math.sign(diff) * maxStep;
    }

    let finalDiff = this.heading - this.velocityHeading;
    while (finalDiff > Math.PI) finalDiff -= 2 * Math.PI;
    while (finalDiff < -Math.PI) finalDiff += 2 * Math.PI;
    if (Math.abs(finalDiff) > driftCfg.max_angle) {
      this.velocityHeading = this.heading - Math.sign(finalDiff) * driftCfg.max_angle;
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
