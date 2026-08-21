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

  // ── 航行水花系统 ──────────────────────────────────────────────
  // 两层结构：
  //   1. 粒子（THREE.Points）：艏部 V 形喷溅、两舷白浪、艉部翻腾与泡沫；
  //   2. 艉流带（triangle-strip）：船身后拖出的持久泡沫尾迹，随时间
  //      扩散、变淡，停船后逐渐消散。
  // 所有发射强度由速度比 s = |speed|/maxSpeed 门控：低速只有轻微艉部
  // 泡沫，高速才出现明显的艏波喷溅。下潜中的潜艇不产生水花。
  _initWake() {
    const max = 720;
    this._wakeMax = max;
    this._wakeData = new Array(max);
    this._wakeEmitAccum = 0;
    this._wakeNextIdx = 0;

    const positions = new Float32Array(max * 3);
    const opacities = new Float32Array(max);
    const sizes = new Float32Array(max);
    const rotations = new Float32Array(max);
    const seeds = new Float32Array(max);
    const types = new Float32Array(max);

    for (let i = 0; i < max; i++) {
      positions[i * 3 + 1] = -100;
      opacities[i] = 0;
      sizes[i] = 0;
      this._wakeData[i] = {
        active: false, life: 0, maxLife: 0, type: 0,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size0: 1,
      };
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aOpacity', new THREE.Float32BufferAttribute(opacities, 1));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
    geo.setAttribute('aRot', new THREE.Float32BufferAttribute(rotations, 1));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geo.setAttribute('aType', new THREE.Float32BufferAttribute(types, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aOpacity;
        attribute float aSize;
        attribute float aRot;
        attribute float aSeed;
        attribute float aType;
        varying float vOpacity;
        varying float vRot;
        varying float vSeed;
        varying float vType;
        void main() {
          vOpacity = aOpacity; vRot = aRot; vSeed = aSeed; vType = aType;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        varying float vRot;
        varying float vSeed;
        varying float vType;
        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float c = cos(vRot);
          float s = sin(vRot);
          uv = mat2(c, -s, s, c) * uv;
          float r = length(uv);
          if (r > 0.5) discard;
          float ang = atan(uv.y, uv.x);
          // 不规则的团状轮廓 + 细颗粒质感，避免"整齐圆圈"的假感
          float lump = 0.78 + 0.22 * sin(ang * 3.0 + vSeed * 6.2832) * sin(ang * 5.0 - vSeed * 9.0);
          float grain = 0.72 + 0.28 * sin(ang * 11.0 + vSeed * 17.0 + r * 8.0);
          // 喷溅(0)：亮白软边团；泡沫(1)：偏蓝白、边缘溶解成颗粒
          float sprayA = pow(smoothstep(0.5, 0.06, r), 1.35) * lump;
          float foamA = smoothstep(0.5, 0.18, r) * (lump * 0.6 + grain * 0.4);
          float a = mix(sprayA, foamA, vType) * vOpacity;
          if (a < 0.01) discard;
          vec3 sprayCol = vec3(0.97, 0.99, 1.0);
          vec3 foamCol = mix(vec3(0.82, 0.90, 0.97), vec3(1.0), grain * 0.35);
          gl_FragColor = vec4(mix(sprayCol, foamCol, vType), a);
        }
      `,
    });

    this._wakeMesh = new THREE.Points(geo, mat);
    this._wakeMesh.frustumCulled = false;
    this.scene.add(this._wakeMesh);

    this._initWakeTrail();
  }

  _emitWake() {
    const idx = this._wakeNextIdx;
    this._wakeNextIdx = (this._wakeNextIdx + 1) % this._wakeMax;

    const p = this._wakeData[idx];
    const speed = Math.abs(this.speed);
    const s = Math.min(1, speed / this.maxSpeed);
    const halfLen = this.shipLength / 2;
    const halfW = this.shipWidth * 0.5;
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);
    const hull = 1 + this.shipWidth * 0.10;

    // 部位按速度加权：高速时艏波占主导，低速以艉部泡沫为主
    const bowP = s > 0.22 ? 0.16 + 0.30 * s * s : 0;
    const roll = Math.random();

    let type; // 0 = 喷溅（抛物线飞行），1 = 泡沫（贴水面扩散）
    if (roll < bowP) {
      // 艏波：向前外侧掀起的 V 形水花，速度越快抛得越高越远
      type = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      const bowZ = halfLen * (0.55 + Math.random() * 0.25);
      const lat = side * halfW * (0.55 + Math.random() * 0.5);
      p.x = this.position.x + sinH * bowZ + cosH * lat;
      p.y = 0.5 + Math.random() * 0.6;
      p.z = this.position.z + cosH * bowZ - sinH * lat;
      const out = (1.6 + 3.4 * s) * (0.7 + Math.random() * 0.6);
      const fwd = speed * (0.15 + 0.10 * Math.random());
      p.vx = cosH * side * out + sinH * fwd;
      p.vy = 1.1 + 2.2 * s + Math.random() * 1.2;
      p.vz = -sinH * side * out + cosH * fwd;
      p.maxLife = 0.5 + Math.random() * 0.5;
      p.size0 = (0.9 + Math.random() * 0.5) * hull;
    } else if (roll < bowP + 0.30) {
      // 艉流泡沫：螺旋桨翻涌出的白色泡沫带，贴水面缓慢扩散
      type = 1;
      const lat = (Math.random() - 0.5) * 1.6 * halfW;
      const stern = halfLen * (0.9 + Math.random() * 0.15);
      p.x = this.position.x - sinH * stern + cosH * lat;
      p.y = 0.18;
      p.z = this.position.z - cosH * stern - sinH * lat;
      p.vx = -sinH * speed * 0.05 + (Math.random() - 0.5) * 0.8;
      p.vy = 0;
      p.vz = -cosH * speed * 0.05 + (Math.random() - 0.5) * 0.8;
      p.maxLife = 2.6 + Math.random() * 1.8;
      p.size0 = (1.5 + Math.random() * 0.9) * hull;
    } else if (roll < bowP + 0.60) {
      // 两舷白浪：被船体推开的水线泡沫，沿船侧拖出白色条带
      type = 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      const along = (Math.random() - 0.4) * 1.2 * halfLen;
      const lat = side * halfW * (1.0 + Math.random() * 0.25);
      p.x = this.position.x + sinH * along + cosH * lat;
      p.y = 0.18;
      p.z = this.position.z + cosH * along - sinH * lat;
      const out = 0.5 + 1.3 * s + Math.random() * 0.5;
      p.vx = cosH * side * out;
      p.vy = 0;
      p.vz = -sinH * side * out;
      p.maxLife = 1.8 + Math.random() * 1.4;
      p.size0 = (1.2 + Math.random() * 0.6) * hull;
    } else {
      // 艉部翻腾：艉流激起的小股碎水
      type = 0;
      const lat = (Math.random() - 0.5) * 2 * halfW;
      const stern = halfLen * 0.85;
      p.x = this.position.x - sinH * stern + cosH * lat;
      p.y = 0.4 + Math.random() * 0.4;
      p.z = this.position.z - cosH * stern - sinH * lat;
      p.vx = -sinH * speed * 0.10 + (Math.random() - 0.5) * 2.4;
      p.vy = 1.0 + 2.0 * s + Math.random() * 1.4;
      p.vz = -cosH * speed * 0.10 + (Math.random() - 0.5) * 2.4;
      p.maxLife = 0.45 + Math.random() * 0.45;
      p.size0 = (0.7 + Math.random() * 0.4) * hull;
    }

    p.active = true;
    p.life = 0;
    p.type = type;
    const attrs = this._wakeMesh.geometry.attributes;
    attrs.aRot.array[idx] = Math.random() * 6.2832;
    attrs.aSeed.array[idx] = Math.random();
    attrs.aType.array[idx] = type;
  }

  _updateWake(dt) {
    const attrs = this._wakeMesh.geometry.attributes;
    const positions = attrs.position.array;
    const opacities = attrs.aOpacity.array;
    const sizes = attrs.aSize.array;

    for (let i = 0; i < this._wakeMax; i++) {
      const p = this._wakeData[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        positions[i * 3 + 1] = -100;
        opacities[i] = 0;
        sizes[i] = 0;
        continue;
      }
      const t = p.life / p.maxLife;
      if (p.type === 0) {
        // 喷溅：抛物线飞行，落回水面后快速消散
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy -= 6.5 * dt;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
        if (p.y <= 0.22) {
          p.y = 0.22;
          p.vy = 0;
          p.vx *= 0.3;
          p.vz *= 0.3;
          p.maxLife = Math.min(p.maxLife, p.life + 0.22);
        }
        opacities[i] = Math.pow(1 - t, 1.5);
        sizes[i] = p.size0 * (1 + t * 1.6);
      } else {
        // 泡沫：贴水面缓慢漂移扩散，先浮现再逐渐消散
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        const damp = Math.max(0, 1 - 1.1 * dt);
        p.vx *= damp;
        p.vz *= damp;
        positions[i * 3] = p.x;
        positions[i * 3 + 2] = p.z;
        const rise = Math.min(1, p.life * 7);
        opacities[i] = rise * Math.pow(1 - t, 1.2) * 0.85;
        sizes[i] = p.size0 * (1 + t * 2.2);
      }
    }

    attrs.position.needsUpdate = true;
    attrs.aOpacity.needsUpdate = true;
    attrs.aSize.needsUpdate = true;
    // 在 _emitWake 中写入、此处置脏（每帧统一上传）
    attrs.aRot.needsUpdate = true;
    attrs.aSeed.needsUpdate = true;
    attrs.aType.needsUpdate = true;
  }

  // 每帧驱动水花（发射 + 粒子更新 + 尾迹更新）。单人/组队由 update()
  // 调用；联机模式下 mesh 由服务器状态直接驱动、不经过 update()，由
  // multiplayer_engine 显式调用。
  tickWake(dt) {
    if (this.alive && Math.abs(this.speed) > 1 && this.diveTransition < 0.4) {
      const s = Math.min(1, Math.abs(this.speed) / this.maxSpeed);
      // 单位距离的发射量随速度比增强，总量封顶避免高速舰打爆粒子池
      const rate = Math.min(Math.abs(this.speed) * 18 * (0.35 + 0.65 * s), 240);
      this._wakeEmitAccum += rate * dt;
      while (this._wakeEmitAccum >= 1) {
        this._emitWake();
        this._wakeEmitAccum -= 1;
      }
    } else {
      this._wakeEmitAccum = 0;
    }
    this._updateWake(dt);
    this._updateWakeTrail(dt);
  }

  _initWakeTrail() {
    const maxPts = 56;            // 采样点数；间距 4m → 最长约 220m 的尾迹
    this._trailMax = maxPts;
    this._trailSpacing = 4;
    this._trailPts = [];
    this._trailTime = 0;
    this._trailLife = 9;          // 尾迹完全消散的时间（秒）

    const positions = new Float32Array(maxPts * 2 * 3);
    const fades = new Float32Array(maxPts * 2);
    const across = new Float32Array(maxPts * 2);
    const indices = new Uint16Array((maxPts - 1) * 6);
    for (let i = 0; i < maxPts - 1; i++) {
      const v = i * 6;
      const a = i * 2;
      indices[v] = a;
      indices[v + 1] = a + 1;
      indices[v + 2] = a + 2;
      indices[v + 3] = a + 1;
      indices[v + 4] = a + 3;
      indices[v + 5] = a + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fades, 1));
    geo.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
    geo.setIndex(new THREE.Uint16BufferAttribute(indices, 1));
    geo.setDrawRange(0, 0);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float aFade;
        attribute float aAcross;
        varying float vFade;
        varying float vAcross;
        varying vec3 vWorld;
        void main() {
          vFade = aFade; vAcross = aAcross; vWorld = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying float vFade;
        varying float vAcross;
        varying vec3 vWorld;
        void main() {
          // 泡沫噪声：两圈正弦叠出的粗颗粒纹理，随时间缓慢流动
          float n1 = sin(vWorld.x * 0.55 + uTime * 0.6) * sin(vWorld.z * 0.75 - uTime * 0.45);
          float n2 = sin(vWorld.x * 1.9 - uTime * 0.9) * sin(vWorld.z * 2.2 + uTime * 0.7);
          float n = 0.55 + 0.30 * n1 + 0.15 * n2;
          float edge = smoothstep(1.0, 0.35, abs(vAcross));
          float a = vFade * edge * (0.30 + 0.55 * n);
          if (a < 0.01) discard;
          vec3 col = mix(vec3(0.78, 0.87, 0.95), vec3(1.0), n * 0.45);
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this._trailMesh = new THREE.Mesh(geo, mat);
    this._trailMesh.frustumCulled = false;
    this._trailMesh.renderOrder = 1;
    this.scene.add(this._trailMesh);
  }

  _updateWakeTrail(dt) {
    this._trailTime += dt;
    this._trailMesh.material.uniforms.uTime.value = this._trailTime;

    const speed = Math.abs(this.speed);
    if (this.alive && speed > 0.8 && this.diveTransition < 0.4) {
      // 采样点取艉部稍后方，沿实际运动方向（velocityHeading × 航速符号）拖尾
      const dir = this.speed >= 0 ? 1 : -1;
      const sinV = Math.sin(this.velocityHeading) * dir;
      const cosV = Math.cos(this.velocityHeading) * dir;
      const stemX = this.position.x - sinV * (this.shipLength / 2 + 1.5);
      const stemZ = this.position.z - cosV * (this.shipLength / 2 + 1.5);
      const last = this._trailPts[this._trailPts.length - 1];
      if (!last) {
        this._trailPts.push({ x: stemX, z: stemZ, h: this.velocityHeading, age: 0 });
      } else {
        const dx = stemX - last.x;
        const dz = stemZ - last.z;
        if (dx * dx + dz * dz >= this._trailSpacing * this._trailSpacing) {
          this._trailPts.push({ x: stemX, z: stemZ, h: this.velocityHeading, age: 0 });
          if (this._trailPts.length > this._trailMax) this._trailPts.shift();
        }
      }
    }

    const pts = this._trailPts;
    const n = pts.length;
    const geo = this._trailMesh.geometry;
    if (n < 2) {
      geo.setDrawRange(0, 0);
      this._trailMesh.visible = false;
      return;
    }

    const positions = geo.attributes.position.array;
    const fades = geo.attributes.aFade.array;
    const across = geo.attributes.aAcross.array;
    let anyVisible = false;
    for (let i = 0; i < n; i++) {
      const pt = pts[i];
      pt.age += dt;
      // 尾迹按龄扩散（V 形张开），近艉处最亮
      const width = this.shipWidth * 0.55 + Math.min(pt.age * (0.5 + 0.06 * speed), 15);
      const fade = Math.max(0, 1 - pt.age / this._trailLife);
      const bright = 0.45 + 0.55 * Math.exp(-pt.age * 0.7);
      const f = fade * bright;
      const sinH = Math.sin(pt.h);
      const cosH = Math.cos(pt.h);
      const o = i * 6;
      positions[o] = pt.x + cosH * width;
      positions[o + 1] = 0.16;
      positions[o + 2] = pt.z - sinH * width;
      positions[o + 3] = pt.x - cosH * width;
      positions[o + 4] = 0.16;
      positions[o + 5] = pt.z + sinH * width;
      fades[i * 2] = f;
      fades[i * 2 + 1] = f;
      across[i * 2] = 1;
      across[i * 2 + 1] = -1;
      if (f > 0.01) anyVisible = true;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aFade.needsUpdate = true;
    geo.attributes.aAcross.needsUpdate = true;
    geo.setDrawRange(0, (n - 1) * 6);
    this._trailMesh.visible = anyVisible;

    // 完全消散的老点出队，避免停船后队列无限堆积
    while (pts.length && pts[0].age >= this._trailLife) pts.shift();
  }

  _destroyWake() {
    if (this._wakeMesh) {
      this.scene.remove(this._wakeMesh);
      this._wakeMesh.geometry.dispose();
      this._wakeMesh.material.dispose();
      this._wakeMesh = null;
    }
    if (this._trailMesh) {
      this.scene.remove(this._trailMesh);
      this._trailMesh.geometry.dispose();
      this._trailMesh.material.dispose();
      this._trailMesh = null;
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
      this._updateWakeTrail(dt);
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

    this.tickWake(dt);

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
