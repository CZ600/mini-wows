import * as THREE from 'three';
import { SUBMARINE } from './config.js';
import { buildShipModel } from './ship_model.js';

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
  // lengthMul stretches the hull (width/height untouched): destroyer/cruiser
  // hulls run long and slim — turrets & bridge take a smaller share of the
  // hull length, so the silhouette reads sleek rather than stubby.
  destroyer: {
    4:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 1 },
    5:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 4, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 1 },
    6:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 2 },
    7:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 5, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 2 },
    8:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 2 },
    9:  { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 6, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 2 },
    10: { hpMul: 0.6,  speedMul: 1.4, turnMul: 0.7, damageMul: 0.7, cooldownMul: 1.0, torpedoTiers: [1, 2, 3], torpedoTubeCount: 8, sizeMul: 0.55, lengthMul: 1.28, turretMul: 0.65, spacingMul: 0.7, barrels: 2 },
  },
  // turretMul 0.8/0.65: cruiser & destroyer turrets scaled down — with the
  // longer (1.7x) gunhouses they otherwise blanket most of the deck.
  cruiser: {
    4:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 1 },
    5:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 1 },
    6:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 2, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 2 },
    7:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 2 },
    8:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 3, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 2 },
    9:  { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 2 },
    10: { hpMul: 1.0, speedMul: 1.0, turnMul: 1.0, damageMul: 1.3, cooldownMul: 0.7, torpedoTiers: [1], torpedoTubeCount: 4, sizeMul: 0.85, lengthMul: 1.22, turretMul: 0.8, spacingMul: 0.85, barrels: 2 },
  },
  // Battleship: Lv6-7 double turrets; Lv8-10 triple turrets in A-B-X layout
  // (2 front + 1 back). get_class_config keeps DPM constant via the
  // equivalent-barrels factor derived from BASE_TURRET_COUNT.
  // lengthMul stretches the hull (width/height untouched): a longer, sleeker
  // spindle and more deck room so turrets can train without clipping the
  // bridge superstructure.
  battleship: {
    4:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 1 },
    5:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 1 },
    6:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 2 },
    7:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 2 },
    8:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 1 },
    9:  { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 1 },
    10: { hpMul: 1.4, speedMul: 0.7, turnMul: 1.4, damageMul: 3.075, cooldownMul: 1.2, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.0, lengthMul: 1.18, turretMul: 1.0, spacingMul: 1.0, barrels: 3, frontTurrets: 2, backTurrets: 2 },
  },
  // Submarine: very fragile, slow on the surface, relies on torpedoes.
  // A single deck gun (frontTurrets=1, backTurrets=0) keeps DPM low.
  // getClassConfig() holds salvo DPM constant vs BASE_TURRET_COUNT (4 single
  // barrels at Lv4), so a 1-turret ship gets a 4x per-shot multiplier;
  // damageMul=0.1 keeps the resulting single-gun DPM (~0.4x of a destroyer
  // gun) clearly inferior. Mid/long-range torpedo tiers only. Surface speed
  // here; underwater speed handled in stage 2 (dive mechanic).
  submarine: {
    4:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 4, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    5:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 4, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    6:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 4, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    7:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 5, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    8:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 5, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    9:  { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 6, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
    10: { hpMul: 0.4, speedMul: 0.6, turnMul: 0.6, damageMul: 0.1, cooldownMul: 1.0, torpedoTiers: [2, 3], torpedoTubeCount: 6, sizeMul: 0.5, turretMul: 0.5, spacingMul: 0.7, barrels: 1, frontTurrets: 1, backTurrets: 0 },
  },
  // Carrier: tough hull (2nd to battleship), slow & unwieldy, weak
  // self-defense guns, no torpedoes. Its real power is aircraft (stage 3);
  // stage 1 ships it as a heavy, under-armed platform so it can be picked and
  // fought while the aircraft system is built out.
  // turretMul 0.5: small deck-edge DP mounts (laid out along both flight-deck
  // edges in buildTurretDefs) — the deck centreline stays clear for aircraft.
  carrier: {
    4:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    5:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    6:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    7:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    8:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    9:  { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
    10: { hpMul: 1.2, speedMul: 0.6, turnMul: 1.5, damageMul: 0.4, cooldownMul: 1.0, torpedoTiers: [], torpedoTubeCount: 0, sizeMul: 1.1, turretMul: 0.5, spacingMul: 1.0, barrels: 1 },
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
  // Submarine: low freeboard and slow surface speed → minimal drift; underwater
  // handling (stage 2) will use a separate profile.
  submarine:  { recovery_base: 2.0, speed_factor: 0.08, max_angle: 0.30 },
  // Carrier: largest, most unwieldy hull — tightest drift recovery.
  carrier:    { recovery_base: 1.8, speed_factor: 0.04, max_angle: 0.20 },
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
    length: Math.round(base.length * sm * (cc.lengthMul || 1.0)),
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
// Bridge ships (Lv4+) keep a slightly narrower arc than the full 360° of
// early-game ships — the island blocks dead-ast/fire arcs. Widened from 2.2
// to 2.6 (≈149°/side) so front and rear groups overlap at the beam and oblique
// quarters (e.g. ±150°) can still bring a turret group to bear.
// Turret layout (buildTurretDefs) and the whole visual model live in
// ship_model.js, shared with enemy ships so both sides look identical.

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

    // Submarine dive state. Only meaningful for shipClass === 'submarine' but
    // the fields exist on every ship (always surfaced) so callers don't need
    // to special-case non-submarines.
    this.submerged = false;          // target dive state
    this.diveDepth = 0;              // current depth in m (0=surfaced)
    this.diveTransition = 0;         // 0=surfaced, 1=submerged (eased)
    this.surfaceMaxSpeed = this.maxSpeed;       // cached surfaced speed
    this.underwaterMaxSpeed = this.maxSpeed * SUBMARINE.underwaterSpeedMul;
    this.surfaceTurnRadius = this.turnRadius;
    this.underwaterTurnRadius = this.turnRadius * SUBMARINE.underwaterTurnMul;

    this._buildMesh(cfg);
    this.scene.add(this.mesh);
    this._initWake();
  }

  _getConfig(level) {
    const classCfg = getClassConfig(this.shipClass, level);
    return classCfg || LEVEL_CONFIG[level];
  }

  _buildMesh(cfg) {
    // 全部视觉建模（放样船体/贴图/上层建筑/炮塔/副炮/防空炮塔）在
    // ship_model.js 中程序化生成，并与敌方舰船共用同一套代码 —— 双方涂装
    // 一致，阵营只靠血条颜色与文字标记区分。
    const model = buildShipModel(cfg, this.shipClass);
    this.mesh = model.group;
    this.hasBridge = model.hasBridge;
    this.turretSize = model.turretSize; // exposed for hitbox height computation
    this.deckY = model.deckY;           // 实际甲板高度（干舷按船种压缩过）
    this.scopedCameraHeight = model.scopedCameraHeight;
    this.turrets = model.turrets.map(t => ({
      group: t.group,
      body: t.body,
      barrelPivot: t.barrelPivot,
      barrel: t.barrels[0],
      barrels: t.barrels,
      barrelLen: t.barrelLen,
      barrelGap: t.barrelGap,
      currentYaw: t.yawCenter,
      currentPitch: 0,
      cooldown: 0,
      yawCenter: t.yawCenter,
      yawRange: t.yawRange,
      isFront: t.isFront,
    }));
    // 副炮塔（战列/巡洋）与防空炮塔：与主炮塔同构的旋回/俯仰机构，
    // 各自维护冷却。副炮由玩家切换操控，防空全自动。
    this.secondaryTurrets = (model.secondaryTurrets || []).map(t => ({ ...t }));
    this.aaMounts = (model.aaMounts || []).map(t => ({ ...t }));
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
    // Re-cache dive profiles for the new level's speed/turn.
    this.surfaceMaxSpeed = this.maxSpeed;
    this.underwaterMaxSpeed = this.maxSpeed * SUBMARINE.underwaterSpeedMul;
    this.surfaceTurnRadius = this.turnRadius;
    this.underwaterTurnRadius = this.turnRadius * SUBMARINE.underwaterTurnMul;

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

    // Advance the dive transition (handles speed/turn swap + mesh sink).
    this.updateDiveTransition(dt);

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
    // Secondary battery + AA mounts tick their own cooldowns here too (AA
    // cooldowns are consumed by the engine's auto-defense pass).
    for (const t of this.secondaryTurrets) {
      if (t.cooldown > 0) t.cooldown = Math.max(0, t.cooldown - dt);
    }
    for (const m of this.aaMounts) {
      if (m.cooldown > 0) m.cooldown = Math.max(0, m.cooldown - dt);
    }
  }

  // Toggle the submarine's target dive state. No-op for non-submarines so the
  // engine can call it unconditionally. Returns true if a toggle was accepted.
  toggleDive() {
    if (this.shipClass !== 'submarine' || !this.alive) return false;
    this.submerged = !this.submerged;
    return true;
  }

  // Advance diveDepth / diveTransition toward the target state, swap maxSpeed
  // and turnRadius between surfaced/submerged profiles, and sink the mesh to
  // reflect depth. Called once per update tick while alive.
  updateDiveTransition(dt) {
    if (this.shipClass !== 'submarine') {
      this.mesh.position.set(this.position.x, 0, this.position.z);
      return;
    }

    // Ease diveTransition toward 0 (surfaced) or 1 (submerged).
    const target = this.submerged ? 1 : 0;
    const rate = 1 / SUBMARINE.transitionTime;
    if (this.diveTransition < target) {
      this.diveTransition = Math.min(target, this.diveTransition + rate * dt);
    } else if (this.diveTransition > target) {
      this.diveTransition = Math.max(target, this.diveTransition - rate * dt);
    }
    this.diveDepth = this.diveTransition * SUBMARINE.diveDepth;

    // Lerp speed/turn profiles by the transition.
    this.maxSpeed = this.surfaceMaxSpeed + (this.underwaterMaxSpeed - this.surfaceMaxSpeed) * this.diveTransition;
    this.turnRadius = this.surfaceTurnRadius + (this.underwaterTurnRadius - this.surfaceTurnRadius) * this.diveTransition;

    // Mesh y follows depth (negative = below water plane).
    this.mesh.position.set(this.position.x, -this.diveDepth, this.position.z);
  }

  // A submarine is "fully submerged" (hidden + shell-immune) once its current
  // depth clears the shell-immunity threshold. Non-submarines never are.
  get fullySubmerged() {
    return this.shipClass === 'submarine' && this.diveDepth >= SUBMARINE.shellImmunityDepth;
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
