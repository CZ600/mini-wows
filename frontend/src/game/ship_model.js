// 共享的真实感战舰建模器。
//
// 玩家 Ship（ship.js）与敌方 EnemyShip（enemy.js）共用同一套建模代码，
// 保证双方舰船外观完全一致（阵营只靠血条颜色 + 文字标记区分，不再靠
// 船体颜色）。模型全部为程序化生成：
//   - 放样船体（lofted hull）：尖艏、方艉（transom）、圆舭剖面、水线以下
//     有吃水深度，水线带/防污漆直接画进船体贴图；
//   - 程序化 Canvas 贴图：船体钢板焊缝/锈痕/水线带、钢质甲板板缝、
//     飞行甲板中线、上层建筑板缝 —— 全部模块级缓存，多舰共享；
//   - 主炮塔：倾斜装甲炮室（顶面收窄后移）+ 圆柱炮座 + 锥形炮管（带套筒）；
//   - 上层建筑：双层舰桥 + 深色玻璃带、后倾椭圆烟囱、桅杆 + 雷达天线、
//     测距仪、救生艇、防浪板；潜艇/航母有各自的专用轮廓。

import * as THREE from 'three';
import { applyHalfLambert } from './scene.js';
import { getClassAa } from './config.js';

// 阵营文字标记用的船种中文名。
export const CLASS_NAMES = {
  destroyer: '驱逐舰',
  cruiser: '巡洋舰',
  battleship: '战列舰',
  carrier: '航空母舰',
  submarine: '潜艇',
};

// ============================================================================
// 程序化贴图（模块级缓存，所有舰船共享一份）
// ============================================================================

// 简单可复现的伪随机（贴图只需要"看起来随机"，不需要加密强度）。
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// 在画布上撒细碎的明暗噪点，打破纯色的塑料感。
function paintNoise(ctx, w, h, rng, count, alpha) {
  for (let i = 0; i < count; i++) {
    const dark = rng() < 0.5;
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha})` : `rgba(255,255,255,${alpha * 0.7})`;
    ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 3, 1 + rng() * 3);
  }
}

function finishTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// 无 DOM 环境（Node 单元测试）下降级为 null：材质走无贴图的纯色路径。
function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  try {
    if (!c.getContext('2d')) return null;
  } catch {
    return null;
  }
  return c;
}

let _hullTex = null;
// 船体贴图。v 方向按"世界米数"分段锚定（见 createHullGeometry 的 vForY）：
//   v ∈ [0, 0.08)   —— 防污漆暗红（水下深处，仅沉没时可见）
//   v ∈ [0.08, 0.30] —— 黑色水线带（boot topping），按米数覆盖波浪摆动范围
//   v ∈ (0.30, 1]    —— 雾灰主船体（haze gray）+ 板缝/锈痕
// 海面 Gerstner 波在 ±1m 量级起伏（波峰可达 ~2.5m），水线带必须足够宽，
// 实际水面才能始终切在带内 —— 否则波谷会露出船底，像船坐在水面上。
// u 方向沿船长每 9m 重复一次（UV 在几何体里按世界坐标写入）。
function getHullTexture() {
  if (_hullTex) return _hullTex;
  const W = 512, H = 512;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const rng = makeRng(1337);

  const yOf = (v) => H * (1 - v);

  ctx.fillStyle = '#5c3833';                       // 防污漆（水下段）
  ctx.fillRect(0, yOf(0.08), W, H - yOf(0.08));
  ctx.fillStyle = '#232629';                       // 水线带（boot topping）
  ctx.fillRect(0, yOf(0.30), W, yOf(0.08) - yOf(0.30));
  ctx.fillStyle = '#9aa0a6';                       // 主船体雾灰（haze gray）
  ctx.fillRect(0, 0, W, yOf(0.30));

  // 水线带上下边缘的过渡污渍。
  ctx.fillStyle = 'rgba(60,45,38,0.35)';
  ctx.fillRect(0, yOf(0.31), W, 4);
  ctx.fillRect(0, yOf(0.07), W, 3);

  // 水平板缝（船壳板列缝）。
  ctx.strokeStyle = 'rgba(20,24,28,0.28)';
  ctx.lineWidth = 2;
  for (const v of [0.34, 0.46, 0.58, 0.70, 0.82, 0.93]) {
    ctx.beginPath();
    ctx.moveTo(0, yOf(v));
    ctx.lineTo(W, yOf(v));
    ctx.stroke();
  }

  // 每一列板带内错开的竖向对接缝。
  ctx.strokeStyle = 'rgba(20,24,28,0.16)';
  ctx.lineWidth = 2;
  const strakes = [[0.34, 0.46], [0.46, 0.58], [0.58, 0.70], [0.70, 0.82], [0.82, 0.93]];
  strakes.forEach(([v0, v1], si) => {
    for (let x = ((si * 53) % 96); x < W; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, yOf(v1));
      ctx.lineTo(x, yOf(v0));
      ctx.stroke();
    }
  });

  // 水线带上方向上流淌的锈痕。
  for (let i = 0; i < 14; i++) {
    const x = rng() * W;
    const len = 24 + rng() * 70;
    const grad = ctx.createLinearGradient(0, yOf(0.30), 0, yOf(0.30) - len);
    grad.addColorStop(0, `rgba(110,74,58,${0.16 + rng() * 0.10})`);
    grad.addColorStop(1, 'rgba(110,74,58,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, yOf(0.30) - len, 2 + rng() * 3, len);
  }

  // 甲板边缘一条阴影渐变，压住侧板与甲板的交界。
  const edge = ctx.createLinearGradient(0, 0, 0, yOf(0.90));
  edge.addColorStop(0, 'rgba(0,0,0,0.22)');
  edge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, yOf(0.90));

  paintNoise(ctx, W, H, rng, 700, 0.05);
  _hullTex = finishTexture(c);
  return _hullTex;
}

let _deckTex = null;
// 钢质甲板：板缝 + 系缆桩/舱口细节 + 防滑涂层噪点。u=x/6, v=z/10（世界米）。
function getDeckTexture() {
  if (_deckTex) return _deckTex;
  const W = 512, H = 512;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const rng = makeRng(4242);

  ctx.fillStyle = '#4a4f53';
  ctx.fillRect(0, 0, W, H);

  // 甲板板缝：横向（垂直于船长）为主。
  ctx.strokeStyle = 'rgba(12,14,16,0.30)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 96) {
    ctx.beginPath();
    ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(12,14,16,0.18)';
  for (let y = 32; y < H; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // 几个舱口盖。
  ctx.strokeStyle = 'rgba(10,12,14,0.4)';
  ctx.lineWidth = 3;
  for (const [hx, hy, hw, hh] of [[150, 120, 46, 60], [356, 300, 40, 52], [140, 392, 38, 48]]) {
    ctx.strokeRect(hx, hy, hw, hh);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(hx, hy, hw, hh);
  }

  paintNoise(ctx, W, H, rng, 600, 0.05);
  _deckTex = finishTexture(c);
  return _deckTex;
}

let _flightDeckTex = null;
// 航母飞行甲板：深蓝灰涂层 + 中线虚线（u=0 恒为船体中线）。u=x/6, v=z/10。
function getFlightDeckTexture() {
  if (_flightDeckTex) return _flightDeckTex;
  const W = 512, H = 512;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const rng = makeRng(777);

  ctx.fillStyle = '#39414b';
  ctx.fillRect(0, 0, W, H);

  // 甲板板缝。
  ctx.strokeStyle = 'rgba(10,12,16,0.25)';
  ctx.lineWidth = 2;
  for (let y = 0; y < H; y += 110) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // 中线虚线条纹。
  ctx.fillStyle = 'rgba(215,220,224,0.85)';
  for (let y = 6; y < H; y += 60) {
    ctx.fillRect(W / 2 - 5, y, 10, 38);
  }

  // 尾部拦阻索的横向淡线。
  ctx.strokeStyle = 'rgba(215,220,224,0.22)';
  ctx.lineWidth = 3;
  for (let y = H - 150; y < H - 30; y += 36) {
    ctx.beginPath(); ctx.moveTo(W * 0.22, y); ctx.lineTo(W * 0.78, y); ctx.stroke();
  }

  paintNoise(ctx, W, H, rng, 500, 0.05);
  _flightDeckTex = finishTexture(c);
  return _flightDeckTex;
}

let _superTex = null;
// 上层建筑板缝贴图（浅灰底 + 竖向接缝）。
function getSuperstructureTexture() {
  if (_superTex) return _superTex;
  const W = 256, H = 256;
  const c = makeCanvas(W, H);
  if (!c) return null;
  const ctx = c.getContext('2d');
  const rng = makeRng(99);

  ctx.fillStyle = '#a6abb0';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(20,24,28,0.18)';
  ctx.lineWidth = 2;
  for (let x = 24; x < W; x += 64) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(20,24,28,0.12)';
  for (const y of [H * 0.35, H * 0.72]) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  paintNoise(ctx, W, H, rng, 300, 0.05);
  _superTex = finishTexture(c);
  return _superTex;
}

// 每艘舰单独实例化材质（dispose 安全），但共享上面的缓存贴图。
export function createShipMaterials(isCarrier = false) {
  const hull = new THREE.MeshPhongMaterial({
    map: getHullTexture(),
    color: 0xffffff,
    shininess: 22,
    specular: 0x2a2c2e,
  });
  const deck = new THREE.MeshPhongMaterial({
    map: isCarrier ? getFlightDeckTexture() : getDeckTexture(),
    color: 0xffffff,
    shininess: 10,
    specular: 0x1a1c1e,
  });
  const superM = new THREE.MeshPhongMaterial({
    map: getSuperstructureTexture(),
    color: 0xffffff,
    shininess: 16,
    specular: 0x242628,
  });
  const turret = new THREE.MeshPhongMaterial({ color: 0x84898e, shininess: 14, specular: 0x202224 });
  const barrel = new THREE.MeshPhongMaterial({ color: 0x474b4f, shininess: 42, specular: 0x333638 });
  // 舰桥玻璃：深色反光，而不是亮蓝色。
  const glass = new THREE.MeshPhongMaterial({ color: 0x142433, shininess: 90, specular: 0x99aabb });
  const trim = new THREE.MeshPhongMaterial({ color: 0x2b2d2f, shininess: 8, specular: 0x181a1b });
  const boat = new THREE.MeshPhongMaterial({ color: 0xc9ced2, shininess: 10, specular: 0x202224 });
  for (const m of [hull, deck, superM, turret, barrel, glass, trim, boat]) {
    applyHalfLambert(m);
  }
  return { hull, deck, super: superM, turret, barrel, glass, trim, boat };
}

// ============================================================================
// 放样船体几何
// ============================================================================

// 平面视图半宽分数：t=0 艉（方艉 transomFrac）→ 平行中体 → 尖艏收敛到 0。
// sternStart/bowStart 是艉部/艏部收敛段的起点（可分别指定，默认关于船中
// 对称）—— 两者之间即全宽平行中体。战列舰用它做出"纺锤形"平面：中部
// 一段保持全宽，艏艉各拖出一段收敛段，而不是宽在船中聚成一个尖峰的菱形。
// 艏艉弧线均为外凸（弧向外鼓，不内凹），且在平行中体两端以零斜率相切
// —— 中部与艏艉之间斜率连续，没有肩角，整船轮廓一气呵成：
//   艏弧 1 - u^p（p>1）       —— 零斜率切出中体，外鼓收向艏柱尖角；
//   艉弧 1 - (1-u)^q（q>1）   —— 出艉封板后迅速张开外鼓，零斜率融入中体
//     （旧式 u^q 在接点斜率不为零，会形成肩角，且弧线内凹）。
export function hullHalfBeamFraction(t, opts = {}) {
  const bowStart = opts.bowStart ?? 0.66;
  const sternStart = opts.sternStart ?? (1 - bowStart);
  const bowPow = opts.bowPow ?? 1.7;
  const transom = opts.transom ?? 0.62;
  const sternPow = opts.sternPow ?? 1.5;
  if (t >= bowStart) {
    const u = (t - bowStart) / (1 - bowStart);
    return Math.max(0.02, 1 - Math.pow(u, bowPow));
  }
  if (t <= sternStart) {
    const u = t / sternStart;
    return transom + (1 - transom) * (1 - Math.pow(1 - u, sternPow));
  }
  return 1;
}

// 剖面半宽形状：s=0 龙骨（0 宽）→ s=1 甲板边缘（全宽）。pow<1 更丰满的圆舭。
function sectionShape(s, sectionPow) {
  return Math.pow(Math.sin(s * Math.PI / 2), sectionPow);
}

// 自动定向的四边形：按参考外向向量翻转绕序，保证法线朝外。
function pushQuad(pos, idx, a, b, c, d, rx, ry, rz) {
  // (b-a) × (c-a) 与参考外向的点积决定朝向。
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const flip = nx * rx + ny * ry + nz * rz < 0;
  const base = pos.length / 3;
  pos.push(...a, ...b, ...c, ...d);
  if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// 世界高度 → 贴图 v 的分段线性映射。水线带在贴图上固定占 v∈[0.08, 0.30]，
// 这里把它锚定到固定的世界高度区间 [bandBot, bandTop]（按船型大小取值，
// 见 buildShipModel）—— 所有舰船共享同一张贴图，但无论大舰小舰，水面
// 波浪（±1m 量级摆动）始终切在黑色水线带内，不会露出船底防污漆。
function vForY(y, keelY, deckY, bandBot, bandTop) {
  if (y >= bandTop) return 0.30 + (y - bandTop) / Math.max(deckY - bandTop, 0.01) * 0.70;
  if (y <= bandBot) return 0.08 * Math.max(0, (y - keelY)) / Math.max(bandBot - keelY, 0.01);
  return 0.08 + (y - bandBot) / (bandTop - bandBot) * 0.22;
}

// ── 舷弧 / 艏柱前倾 / 外飘的纵向曲线 ──────────────────────────────
// 舷弧（sheer）：甲板线向艏/艉逐渐抬高的传统船型曲线（平方抬升，前段
// 从 55% 船长开始、艉段从 25% 船长开始），是"前高后低"侧影的来源。
const SHEER_START_F = 0.55;
const SHEER_START_A = 0.25;
// 艏柱前倾（stem rake）只在最后 12% 船长生效（飞剪艏的前倾艏柱）。
const BOW_RAKE_START = 0.88;

function sheerRiseFwd(t) {
  return t > SHEER_START_F ? Math.pow((t - SHEER_START_F) / (1 - SHEER_START_F), 2) : 0;
}
function sheerRiseAft(t) {
  return t < SHEER_START_A ? Math.pow((SHEER_START_A - t) / SHEER_START_A, 2) : 0;
}
function bowRiseFrac(t, bowStart) {
  return t > bowStart ? Math.pow((t - bowStart) / (1 - bowStart), 1.5) : 0;
}

// 放样船体。返回 { hullGeo, deckGeo }：
//   hullGeo —— 左右舷侧板 + 艉部封板（transom）；
//   deckGeo —— 跟随船体平面轮廓 + 舷弧曲线的甲板面。
// opts 里除平面轮廓（bowStart/bowPow/transom/sternPow/sectionPow）外：
//   sheerFwd / sheerAft —— 艏/艉舷弧抬升量（米，绝对值）
//   bowFlare            —— 艏部水线以上外飘强度（0=无）
//   stemRake            —— 艏柱前倾量（米）
export function createHullGeometry(length, beam, deckY, draft, opts = {}) {
  const stations = opts.stations ?? 26;
  const sections = opts.sections ?? 9;
  const sectionPow = opts.sectionPow ?? 0.8;
  const sheerFwd = opts.sheerFwd ?? 0;
  const sheerAft = opts.sheerAft ?? 0;
  const bowFlare = opts.bowFlare ?? 0;
  const stemRake = opts.stemRake ?? 0;
  const keelY = -draft;
  // 水线带的世界高度锚点（由 buildShipModel 按船型传入）。
  const bandBot = opts.bandBot ?? -1.0;
  const bandTop = opts.bandTop ?? 0.35;
  const halfBeam = beam / 2;
  const zOf = (t) => -length / 2 + t * length;
  const deckAt = (t) => deckY + sheerFwd * sheerRiseFwd(t) + sheerAft * sheerRiseAft(t);
  const rakeAt = (t) => stemRake * (t > BOW_RAKE_START ? Math.pow((t - BOW_RAKE_START) / (1 - BOW_RAKE_START), 2) : 0);
  // 艏部外飘只在水线以上生效（s>0.45 ≈ 水线上方），越靠艏越强。
  const flareMul = (t, s) => 1 + bowFlare * bowRiseFrac(t, opts.bowStart ?? 0.66) * Math.max(0, (s - 0.45) / 0.55);

  // —— 舷侧板（左右两片网格，共享索引顶点 → 平滑着色）——
  const sidePos = [];
  const sideUV = [];
  const sideIdx = [];
  const buildSide = (sign) => {
    const base = sidePos.length / 3;
    for (let i = 0; i <= stations; i++) {
      const t = i / stations;
      const hb = Math.max(hullHalfBeamFraction(t, opts) * halfBeam, 0.02);
      for (let j = 0; j <= sections; j++) {
        const s = j / sections;
        const y = keelY + (deckAt(t) - keelY) * s;
        const x = sign * hb * sectionShape(s, sectionPow) * flareMul(t, s);
        const zs = zOf(t) + rakeAt(t) * s;
        sidePos.push(x, y, zs);
        sideUV.push(zs / 9, vForY(y, keelY, deckAt(t), bandBot, bandTop));
      }
    }
    const stride = sections + 1;
    for (let i = 0; i < stations; i++) {
      for (let j = 0; j < sections; j++) {
        const a = base + i * stride + j;
        const b = a + stride;
        const c = b + 1;
        const d = a + 1;
        if (sign > 0) sideIdx.push(a, c, b, a, d, c);
        else sideIdx.push(a, b, c, a, c, d);
      }
    }
  };
  buildSide(1);
  buildSide(-1);

  // —— 艉封板（transom / 圆艉的收口，随艉舷弧抬高）——
  const z0 = zOf(0);
  const hb0 = Math.max(hullHalfBeamFraction(0, opts) * halfBeam, 0.02);
  const deckY0 = deckAt(0);
  for (let j = 0; j < sections; j++) {
    const s0 = j / sections;
    const s1 = (j + 1) / sections;
    const x0 = hb0 * sectionShape(s0, sectionPow);
    const x1 = hb0 * sectionShape(s1, sectionPow);
    const y0 = keelY + (deckY0 - keelY) * s0;
    const y1 = keelY + (deckY0 - keelY) * s1;
    const base = sidePos.length / 3;
    sidePos.push(-x0, y0, z0, x0, y0, z0, x1, y1, z0, -x1, y1, z0);
    sideUV.push(
      0.98, vForY(y0, keelY, deckY0, bandBot, bandTop),
      0.98, vForY(y0, keelY, deckY0, bandBot, bandTop),
      0.98, vForY(y1, keelY, deckY0, bandBot, bandTop),
      0.98, vForY(y1, keelY, deckY0, bandBot, bandTop),
    );
    // j=0 时龙骨处 x=0，第一个三角退化成线段，跳过只留第二个。
    if (j > 0) sideIdx.push(base, base + 2, base + 1);
    sideIdx.push(base, base + 3, base + 2);
  }

  const hullGeo = new THREE.BufferGeometry();
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePos, 3));
  hullGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUV, 2));
  hullGeo.setIndex(sideIdx);
  hullGeo.computeVertexNormals();

  // —— 甲板面（跟随平面轮廓 + 舷弧 + 艏部外飘 + 艏柱前倾）——
  const deckPos = [];
  const deckUV = [];
  const deckIdx = [];
  for (let i = 0; i <= stations; i++) {
    const t = i / stations;
    const hb = Math.max(hullHalfBeamFraction(t, opts) * halfBeam, 0.02) * flareMul(t, 1);
    const y = deckAt(t);
    const z = zOf(t) + rakeAt(t);
    deckPos.push(-hb, y, z, hb, y, z);
    deckUV.push(-hb / 6, z / 10, hb / 6, z / 10);
  }
  for (let i = 0; i < stations; i++) {
    const a = i * 2;          // 左舷 i
    const b = (i + 1) * 2;    // 左舷 i+1
    const c = b + 1;          // 右舷 i+1
    const d = a + 1;          // 右舷 i
    deckIdx.push(a, c, d, a, b, c);
  }
  const deckGeo = new THREE.BufferGeometry();
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(deckPos, 3));
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(deckUV, 2));
  deckGeo.setIndex(deckIdx);
  deckGeo.computeVertexNormals();

  return { hullGeo, deckGeo };
}

// ============================================================================
// 主炮塔
// ============================================================================

// 倾斜装甲炮室：底面矩形 → 顶面收窄并后移（四坡面 + 平顶），非共享顶点 → 平直甲板面。
function createTurretHousingGeometry(w, h, l) {
  const hw = w / 2, hl = l / 2;
  const tw = hw * 0.76, tl = hl * 0.60, tz = -hl * 0.16;
  const v = [
    [-hw, 0, -hl], [hw, 0, -hl], [hw, 0, hl], [-hw, 0, hl],        // 底面 0-3
    [-tw, h, tz - tl], [tw, h, tz - tl], [tw, h, tz + tl], [-tw, h, tz + tl], // 顶面 4-7
  ];
  const pos = [];
  const idx = [];
  const q = (a, b, c, d, nx, ny, nz) => pushQuad(pos, idx, v[a], v[b], v[c], v[d], nx, ny, nz);
  q(4, 5, 6, 7, 0, 1, 0);        // 顶
  q(3, 2, 6, 7, 0, 0, 1);        // 正面（炮口方向）
  q(1, 0, 4, 5, 0, 0, -1);       // 背面
  q(2, 1, 5, 6, 1, 0, 0);        // 右舷
  q(0, 3, 7, 4, -1, 0, 0);       // 左舷
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// 组装一座炮塔：炮座 + 炮室 + 炮管组。层级为
//   turretGroup { base(炮座), body(炮室) { barrelPivot { barrels } } }
// 玩家侧通过 group.rotation.y / barrelPivot.rotation.x 驱动（turret.js），
// 敌方侧同样驱动 group/barrelPivot —— 两侧瞄准代码完全同构。
// 炮室长度系数（相对 turretSize）：真实炮塔是"长炮室、短露管"——炮室
// 覆盖整段炮耳滑轨，炮管只露出前半（□□□--- 形，而非 □--- 的短室细管）。
const TURRET_HOUSING_LEN_MUL = 1.7;

// 炮室宽度（多管加宽）：三联约 1.76×turretSize，与 1.7× 的长度近似方形
// 平面 —— 真实炮室是"方盾+炮管"，而不是一块横宽的薄板。
function turretHousingWidth(turretSize, barrels) {
  return turretSize * (1 + (barrels - 1) * 0.38);
}

function buildTurret(mats, turretSize, barrels, barrelLen, barrelGap) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(turretSize * 0.52, turretSize * 0.62, turretSize * 0.3, 14),
    mats.turret,
  );
  group.add(base);

  const housingWidth = turretHousingWidth(turretSize, barrels);
  const body = new THREE.Mesh(
    createTurretHousingGeometry(housingWidth, turretSize * 0.88, turretSize * TURRET_HOUSING_LEN_MUL),
    mats.turret,
  );
  body.position.y = turretSize * 0.3;
  group.add(body);

  // 炮耳（炮管俯仰轴）放在加长炮室的前 1/3 处，炮管只露出炮室外一小半。
  const barrelPivot = new THREE.Group();
  barrelPivot.position.set(0, turretSize * 0.42, turretSize * 0.7);
  body.add(barrelPivot);

  const rB = Math.min(0.24, Math.max(0.09, turretSize * 0.12));
  const barrelMeshes = [];
  for (let b = 0; b < barrels; b++) {
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(rB * 0.72, rB, barrelLen, 10),
      mats.barrel,
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set((b - (barrels - 1) / 2) * barrelGap, 0, barrelLen / 2);
    barrelPivot.add(barrel);
    // 炮尾套筒（炮管后段加粗的外罩）。
    const sleeve = new THREE.Mesh(
      new THREE.CylinderGeometry(rB * 1.45, rB * 1.6, barrelLen * 0.3, 10),
      mats.barrel,
    );
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.set((b - (barrels - 1) / 2) * barrelGap, 0, barrelLen * 0.16);
    barrelPivot.add(sleeve);
    barrelMeshes.push(barrel);
  }

  return { group, body, barrelPivot, barrels: barrelMeshes, barrelLen, barrelGap };
}

// ============================================================================
// 炮塔布局（自 ship.js 迁入，玩家/敌方共用）
// ============================================================================

const YAW_RANGE_FULL = Math.PI;
const YAW_RANGE_BRIDGE = 2.6;

export function buildTurretDefs(cfg, shipClass) {
  const defs = [];
  const yawRange = cfg.hasBridge ? YAW_RANGE_BRIDGE : YAW_RANGE_FULL;
  const turretMul = cfg.turretMul || 1.0;
  const barrels = cfg.barrels || 1;
  const turretSize = (0.8 + cfg.width * 0.10) * turretMul;
  const housingWidth = turretHousingWidth(turretSize, barrels);
  const spacing = Math.max(1.2, housingWidth * 1.4);

  // 炮塔绕轴旋转时最远扫掠半径（炮室对角线一半）：任意朝向都不允许扫进
  // 舰桥建筑 —— 旧 frontGap 只按炮室宽度的一小部分留缝，炮塔回旋时
  // 炮室后角会切进舰桥（穿模）。
  const sweepR = Math.sqrt((housingWidth / 2) ** 2 + (turretSize * TURRET_HOUSING_LEN_MUL / 2) ** 2);
  // 舰桥（干舷建筑）实际半长占船长的比例 —— 必须与 buildSurfaceSuperstructure
  // 里的 bl 分段保持一致（战列 0.30/2、驱逐 0.25/2、其余 0.28/2）。
  const deckHalfFrac = shipClass === 'battleship' ? 0.15 : shipClass === 'destroyer' ? 0.125 : 0.14;

  let frontCenter = cfg.length * 0.2;
  let backCenter = -cfg.length * 0.2;

  if (cfg.hasBridge) {
    const bridgeZ = 0;
    const bridgeHalf = Math.max(cfg.length * 0.14, cfg.length * deckHalfFrac);
    const frontGap = sweepR + 0.3;
    const backGap = sweepR + 0.5;

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

  // 艏部站位上限：最前一座炮塔不越过 t=0.88 —— 再往前船体已收窄，炮室
  // 会悬出甲板边缘（艉部收窄更晚且后炮组靠中，无需对称限制）。短船身
  // （如三级三联装的巡洋舰）会先撞到这条上限，此时最靠近舰桥的炮塔
  // 已被超射炮座抬到舰桥顶之上，从其上方越过的炮室不会相碰。
  frontCenter = Math.min(frontCenter, cfg.length * 0.38 - (cfg.frontTurrets - 1) / 2 * spacing);

  const stepH = turretSize * 0.55;

  const nFront = cfg.frontTurrets;
  for (let i = 0; i < nFront; i++) {
    const offset = (i - (nFront - 1) / 2) * spacing;
    defs.push({ z: frontCenter + offset, x: 0, y: (nFront - 1 - i) * stepH, yawCenter: 0, yawRange, isFront: true });
  }

  const nBack = cfg.backTurrets;
  for (let i = 0; i < nBack; i++) {
    const offset = (i - (nBack - 1) / 2) * spacing;
    defs.push({ z: backCenter + offset, x: 0, y: i * stepH, yawCenter: Math.PI, yawRange, isFront: false });
  }

  return defs;
}

// ============================================================================
// 上层建筑
// ============================================================================

// 后倾椭圆烟囱（顶部略收 + 深色烟口），挂在 parent 上。
function addFunnel(parent, mats, r, h, z) {
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.86, r, h, 14),
    mats.super,
  );
  funnel.scale.z = 0.72;
  funnel.rotation.x = -0.18;
  funnel.position.set(0, h * 0.44, z);
  parent.add(funnel);
  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.82, r * 0.9, h * 0.1, 14),
    mats.trim,
  );
  cap.scale.z = 0.72;
  cap.position.y = h * 0.47;
  funnel.add(cap);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.68, r * 0.68, h * 0.06, 12),
    new THREE.MeshBasicMaterial({ color: 0x0a0a0b }),
  );
  inner.scale.z = 0.72;
  inner.position.y = h * 0.5;
  funnel.add(inner);
  return funnel;
}

// 环视玻璃带（挂在舰桥层上，yAbs 为在父级局部坐标系中的绝对高度）。
function addGlassBand(parent, mats, w, h, l, yAbs) {
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, l),
    mats.glass,
  );
  band.position.y = yAbs;
  parent.add(band);
  return band;
}

// 水面战舰上层建筑：按船种分型，绝不做等比缩放。
//   战列舰 —— 金刚型宝塔式舰桥（三层收分塔楼 + 顶部测距仪）+ 双烟囱 +
//             带探照灯平台的高桅；配合飞剪艏/圆艉船体，一眼可辨。
//   巡洋舰 —— 两层舰桥 + 单烟囱 + 桅杆雷达。
//   驱逐舰 —— 低干舷轻建筑：小舰桥 + 细单烟囱 + 短桅，纤瘦轻快。
function buildSurfaceSuperstructure(cfg, deckY, mats, turretTopZ, shipClass, deckYAt) {
  const isBB = shipClass === 'battleship';
  const isDD = shipClass === 'destroyer';
  // 巡洋/驱逐舰的舰桥比例适当放大（炮塔缩小后腾出的甲板空间给建筑），
  // 烟囱/桅杆/救生艇等一切细节都从这三个量派生，自动跟随。
  const bw = cfg.width * (isBB ? 0.52 : isDD ? 0.44 : 0.50);
  const bh = cfg.height * (isBB ? 1.05 : isDD ? 0.88 : 1.08);
  const bl = cfg.length * (isBB ? 0.30 : isDD ? 0.25 : 0.28);
  const parts = [];

  // 低干舷建筑基底。
  const deckhouseH = bh * (isBB ? 0.55 : isDD ? 0.42 : 0.5);
  const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.85, deckhouseH, bl), mats.super);
  deckhouse.position.set(0, deckY + deckhouseH / 2 + 0.1, 0);
  parts.push(deckhouse);
  addGlassBand(deckhouse, mats, bw * 0.9, deckhouseH * 0.22, bl * 0.9, deckhouseH * 0.12);

  let bridgeStackH;        // 舰桥各层累计高度（算 scopedCameraHeight 用）
  let mastH;
  let mastBase;            // 桅杆挂载点
  let mastBaseHalfH;       // 挂载点自身半高（桅杆底从此起算）

  if (isBB) {
    // ── 宝塔式舰桥：三层收分塔楼（参考金刚型）──
    const t2W = bw * 0.68, t2H = bh * 0.5, t2L = bl * 0.34;
    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(t2W, t2H, t2L), mats.super);
    tier2.position.set(0, deckhouseH / 2 + t2H / 2, bl * 0.22);
    deckhouse.add(tier2);
    addGlassBand(tier2, mats, t2W * 0.92, t2H * 0.2, t2L + 0.06, t2H * 0.18);

    const t3W = bw * 0.52, t3H = bh * 0.34, t3L = bl * 0.22;
    const tier3 = new THREE.Mesh(new THREE.BoxGeometry(t3W, t3H, t3L), mats.super);
    tier3.position.set(0, t2H / 2 + t3H / 2, t2L * 0.06);
    tier2.add(tier3);
    addGlassBand(tier3, mats, t3W * 0.94, t3H * 0.22, t3L + 0.05, t3H * 0.2);

    // 塔顶测距仪（带短镜筒的钟形座）。
    const director = new THREE.Mesh(
      new THREE.CylinderGeometry(t3W * 0.16, t3W * 0.24, t3H * 0.3, 10),
      mats.turret,
    );
    director.position.set(0, t3H / 2 + t3H * 0.15, 0);
    tier3.add(director);
    const dirTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, t3W * 0.34, 6),
      mats.barrel,
    );
    dirTube.rotation.z = Math.PI / 2;
    dirTube.position.y = t3H * 0.05;
    director.add(dirTube);

    bridgeStackH = t2H + t3H;
    mastBase = tier2;
    mastBaseHalfH = t2H / 2;

    // ── 双烟囱（前高后低）──
    addFunnel(deckhouse, mats, Math.max(0.32, bw * 0.21), bh * 0.85, -bl * 0.12);
    addFunnel(deckhouse, mats, Math.max(0.28, bw * 0.18), bh * 0.68, -bl * 0.40);

    // ── 高桅：两道横桁 + 两座探照灯平台 + 顶部雷达 ──
    mastH = bh * 1.3;
  } else if (isDD) {
    // ── 驱逐舰：紧凑小舰桥 ──
    const brW = bw * 0.72, brH = bh * 0.55, brL = bl * 0.36;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(brW, brH, brL), mats.super);
    bridge.position.set(0, deckhouseH / 2 + brH / 2, bl * 0.26);
    deckhouse.add(bridge);
    addGlassBand(bridge, mats, brW * 0.9, brH * 0.24, brL + 0.05, brH * 0.2);

    const topW = brW * 0.7, topH = brH * 0.16;
    const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, brL * 0.6), mats.super);
    bridgeTop.position.y = brH / 2 + topH / 2;
    bridge.add(bridgeTop);

    bridgeStackH = brH;
    mastBase = bridge;
    mastBaseHalfH = brH / 2;

    // 细单烟囱 + 短桅。
    addFunnel(deckhouse, mats, Math.max(0.22, bw * 0.17), bh * 0.72, -bl * 0.30);
    mastH = bh * 0.55;
  } else {
    // ── 巡洋舰/早期舰：两层舰桥 + 单烟囱（原设计）──
    const fwdBlockW = bw * 0.7, fwdBlockH = bh * 0.8, fwdBlockL = bl * 0.32;
    const fwdBlock = new THREE.Mesh(new THREE.BoxGeometry(fwdBlockW, fwdBlockH, fwdBlockL), mats.super);
    fwdBlock.position.set(0, deckhouseH / 2 + fwdBlockH / 2, bl * 0.30);
    deckhouse.add(fwdBlock);
    addGlassBand(fwdBlock, mats, fwdBlockW * 0.88, fwdBlockH * 0.22, fwdBlockL + 0.08, fwdBlockH * 0.18);

    const bridgeTop = new THREE.Mesh(
      new THREE.BoxGeometry(fwdBlockW * 0.72, fwdBlockH * 0.14, fwdBlockL * 0.7),
      mats.super,
    );
    bridgeTop.position.y = fwdBlockH / 2 + fwdBlockH * 0.07;
    fwdBlock.add(bridgeTop);

    // 测距仪（舰桥顶上的钟形座）。
    if (cfg.length > 22) {
      const director = new THREE.Mesh(
        new THREE.CylinderGeometry(fwdBlockW * 0.14, fwdBlockW * 0.2, fwdBlockH * 0.16, 10),
        mats.turret,
      );
      director.position.set(0, fwdBlockH * 0.14 + fwdBlockH * 0.08 + fwdBlockH * 0.11, fwdBlockL * 0.1);
      fwdBlock.add(director);
      const dirTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, fwdBlockW * 0.3, 6),
        mats.barrel,
      );
      dirTube.rotation.z = Math.PI / 2;
      dirTube.position.y = fwdBlockH * 0.06;
      director.add(dirTube);
    }

    bridgeStackH = fwdBlockH;
    mastBase = fwdBlock;
    mastBaseHalfH = fwdBlockH / 2;

    addFunnel(deckhouse, mats, Math.max(0.3, bw * 0.2), bh * 0.75, -bl * 0.30);
    mastH = bh * 0.9;
  }

  // 桅杆（挂在前舰桥结构上）：横桁 + 探照灯平台（战列舰）+ 顶部雷达。
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.15, mastH, 6),
    mats.trim,
  );
  mast.rotation.x = 0.07;
  mast.position.set(0, mastBaseHalfH + mastH / 2, -bl * 0.04);
  mastBase.add(mast);
  const mastW = bw * 0.6;
  const yard1 = new THREE.Mesh(new THREE.BoxGeometry(mastW * 0.55, 0.1, 0.1), mats.trim);
  yard1.position.y = mastH * 0.32;
  mast.add(yard1);
  if (mastH > 1.2) {
    const yard2 = new THREE.Mesh(new THREE.BoxGeometry(mastW * 0.38, 0.09, 0.09), mats.trim);
    yard2.position.y = mastH * 0.55;
    mast.add(yard2);
  }
  if (isBB) {
    // 两座探照灯平台（金刚型桅楼的标志细节）。
    for (const yf of [0.38, 0.55]) {
      const platform = new THREE.Mesh(new THREE.BoxGeometry(mastW * 0.5, 0.08, mastW * 0.22), mats.trim);
      platform.position.set(0, mastH * yf, 0.09);
      mast.add(platform);
      const light = new THREE.Mesh(
        new THREE.CylinderGeometry(mastW * 0.07, mastW * 0.09, mastW * 0.1, 8),
        mats.glass,
      );
      light.rotation.x = Math.PI / 2.5;
      light.position.set(0, mastH * yf + 0.08, 0.09);
      mast.add(light);
    }
  }
  const radar = new THREE.Mesh(new THREE.BoxGeometry(mastW * 0.3, 0.24, 0.08), mats.trim);
  radar.position.y = mastH * 0.78;
  mast.add(radar);

  // 两舷救生艇（扣在干舷建筑侧面）：战列/巡洋每舷 2 艘，驱逐舰每舷 1 艘。
  const boatR = Math.max(0.12, bw * 0.055);
  const boatL = Math.max(0.5, bl * 0.15);
  const boatSpots = isDD ? [0] : [bl * 0.12, -bl * 0.1];
  for (const sideSign of [1, -1]) {
    for (const zz of boatSpots) {
      const boat = new THREE.Mesh(
        new THREE.CapsuleGeometry(boatR, boatL, 2, 8),
        mats.boat,
      );
      boat.rotation.x = Math.PI / 2;
      boat.position.set(sideSign * (bw * 0.85 / 2 + boatR * 0.9), -deckhouseH / 2 + deckhouseH * 0.22, zz);
      deckhouse.add(boat);
    }
  }

  // 防浪板：一号炮塔前的两片人字形挡板（随舷弧坐在局部甲板高度上）。
  if (!isDD && turretTopZ > 0 && turretTopZ < cfg.length * 0.44) {
    const bwW = Math.max(0.5, cfg.width * 0.16);
    const breakwaterZ = turretTopZ + Math.max(0.8, cfg.width * 0.12);
    for (const sideSign of [1, -1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(bwW, Math.max(0.3, cfg.height * 0.22), 0.1),
        mats.deck,
      );
      plate.position.set(sideSign * bwW * 0.45, deckYAt(breakwaterZ) + Math.max(0.15, cfg.height * 0.11), breakwaterZ);
      plate.rotation.y = sideSign * 0.45;
      plate.rotation.x = -0.25;
      parts.push(plate);
    }
  }

  return { parts, scopedCameraHeight: deckY + 0.1 + deckhouseH + bridgeStackH + mastH + 1.5 };
}

// 潜艇：圆角指挥塔 + 潜望镜/通气管 + 尾鳍。
function buildSubmarineSuperstructure(cfg, deckY, mats) {
  const parts = [];
  const towerW = cfg.width * 0.45;
  const towerL = cfg.length * 0.12;
  const towerH = cfg.height * 1.1;

  // 圆角指挥塔（圆柱压扁，前后收分）。
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, towerH, 14),
    mats.super,
  );
  tower.scale.set(towerW / 2, 1, towerL / 2);
  tower.position.set(0, deckY + towerH / 2 + 0.1, 0);
  parts.push(tower);

  // 指挥塔舷窗。
  const towerWindows = new THREE.Mesh(
    new THREE.BoxGeometry(towerW * 0.85, towerH * 0.16, towerL * 0.35),
    mats.glass,
  );
  towerWindows.position.set(0, towerH * 0.18, towerL * 0.28);
  tower.add(towerWindows);

  // 潜望镜 + 通气管。
  const periscopeH = cfg.height * 2.4;
  const periscope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, periscopeH, 6),
    mats.trim,
  );
  periscope.position.set(towerW * 0.16, towerH / 2 + periscopeH / 2, towerL * 0.05);
  tower.add(periscope);
  const snorkel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, periscopeH * 0.7, 6),
    mats.trim,
  );
  snorkel.position.set(-towerW * 0.2, towerH / 2 + periscopeH * 0.35, -towerL * 0.3);
  tower.add(snorkel);

  // 尾部垂直稳定鳍。
  const finH = cfg.height * 0.8;
  const fin = new THREE.Mesh(
    new THREE.BoxGeometry(cfg.width * 0.09, finH, cfg.length * 0.09),
    mats.super,
  );
  fin.position.set(0, deckY + finH / 2, -cfg.length * 0.4);
  parts.push(fin);

  return { parts, scopedCameraHeight: deckY + towerH + periscopeH + 1.0 };
}

// 航母：贴图飞行甲板 + 右舷岛式上层建筑（舰桥/烟囱/雷达桅）。
function buildCarrierSuperstructure(cfg, deckY, mats) {
  const parts = [];

  const fdW = cfg.width * 0.98;
  const fdL = cfg.length * 0.95;
  const fdH = 0.4;
  const flightDeck = new THREE.Mesh(
    new THREE.BoxGeometry(fdW, fdH, fdL),
    mats.deck,
  );
  flightDeck.position.set(0, deckY + fdH / 2 + 0.1, 0);
  parts.push(flightDeck);

  // 右舷岛。
  const islandX = fdW * 0.32;
  const islandW = cfg.width * 0.22;
  const islandL = cfg.length * 0.18;
  const islandH = cfg.height * 1.6;

  const island = new THREE.Mesh(new THREE.BoxGeometry(islandW, islandH, islandL), mats.super);
  island.position.set(islandX, deckY + fdH + islandH / 2 + 0.1, -cfg.length * 0.05);
  parts.push(island);

  const islandWindows = new THREE.Mesh(
    new THREE.BoxGeometry(islandW * 0.94, islandH * 0.2, islandL + 0.08),
    mats.glass,
  );
  islandWindows.position.y = islandH * 0.12;
  island.add(islandWindows);

  // 岛上的烟囱（后倾圆柱）。
  const funnelR = Math.max(0.28, islandW * 0.28);
  const funnelH = islandH * 0.62;
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(funnelR * 0.86, funnelR, funnelH, 12),
    mats.super,
  );
  funnel.scale.z = 0.72;
  funnel.rotation.x = -0.16;
  funnel.position.set(0, islandH / 2 + funnelH * 0.42, -islandL * 0.34);
  island.add(funnel);
  const funnelCap = new THREE.Mesh(
    new THREE.CylinderGeometry(funnelR * 0.82, funnelR * 0.9, funnelH * 0.1, 12),
    mats.trim,
  );
  funnelCap.scale.z = 0.72;
  funnelCap.position.y = funnelH * 0.47;
  funnel.add(funnelCap);

  // 雷达桅杆。
  const mastH = islandH * 0.85;
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.16, mastH, 6),
    mats.trim,
  );
  mast.position.set(0, islandH / 2 + mastH / 2, islandL * 0.3);
  island.add(mast);
  const yard = new THREE.Mesh(new THREE.BoxGeometry(islandW * 0.5, 0.1, 0.1), mats.trim);
  yard.position.y = mastH * 0.32;
  mast.add(yard);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(islandW * 0.34, islandH * 0.12, 0.08), mats.trim);
  radar.position.y = mastH * 0.68;
  mast.add(radar);

  return { parts, scopedCameraHeight: deckY + fdH + islandH + mastH + 1.5 };
}

// ============================================================================
// 总装
// ============================================================================

// 每个船种的船体放样参数。各船型轮廓差异是"船种识别"的核心 —— 不做等比
// 缩放：战列舰参考金刚型（飞剪外飘艏 + 显著舷弧 + 圆艉 + 扁宽深吃水的
// 厚重船体），驱逐舰则是窄瘦 V 剖面低干舷的轻快船型。
//   sheerFwdMul / sheerAftMul —— 艏/艉舷弧（相对干舷的比例）
//   bowFlare / stemRakeMul    —— 艏部水线上外飘强度 / 艏柱前倾（相对船长）
//   freeboardMul              —— 干舷压缩系数（水线上船体高度，战列舰压得
//                                最扁；上层建筑尺寸取自 cfg.height 不随之缩水）
//   draftMul / draftCap       —— 吃水系数（相对未压缩干舷）/ 吃水上限（米）
function hullOptsFor(shipClass) {
  switch (shipClass) {
    case 'battleship':
      // 纺锤形平面：t∈[0.32, 0.66] 一段 34% 船长的全宽平行中体（中部留宽），
      // 艏艉各拖出 ~1/3 船长的外凸弧线收敛段 —— 两端弧线向外鼓、以零斜率
      // 与中体相切（无肩角），到艏柱/艉封板才收拢，整船轮廓流畅饱满。
      return {
        bowStart: 0.66, bowPow: 1.6, transom: 0.2, sternStart: 0.32, sternPow: 1.5,
        sectionPow: 0.8,
        sheerFwdMul: 0.3, sheerAftMul: 0.08, bowFlare: 0.45, stemRakeMul: 0.022,
        freeboardMul: 0.65, draftMul: 1.0, draftCap: 3.8,
      };
    case 'cruiser':
      return {
        bowStart: 0.6, bowPow: 1.6, transom: 0.32, sternPow: 1.1, sectionPow: 0.72,
        sheerFwdMul: 0.2, sheerAftMul: 0.06, bowFlare: 0.28, stemRakeMul: 0.016,
        freeboardMul: 0.78, draftMul: 0.8, draftCap: 3.2,
      };
    case 'destroyer':
      // 窄瘦、V 形剖面、低干舷、方艉 —— 与战列舰形成强烈反差。
      return {
        bowStart: 0.58, bowPow: 1.75, transom: 0.5, sternPow: 1.3, sectionPow: 0.6,
        sheerFwdMul: 0.15, sheerAftMul: 0.05, bowFlare: 0.18, stemRakeMul: 0.014,
        freeboardMul: 0.76, draftMul: 0.72, draftCap: 2.4,
      };
    case 'submarine':
      // 圆舭圆艉、无舷弧无外飘；干舷极低贴水面。
      return {
        bowStart: 0.7, bowPow: 1.9, transom: 0.28, sternPow: 1.1, sectionPow: 0.55,
        freeboardMul: 0.85, draftMul: 0.85, draftCap: 2.6,
      };
    case 'carrier':
      // 宽体、近方形艉（飞行甲板需要）；舷弧趋平。
      return {
        bowStart: 0.75, bowPow: 1.6, transom: 0.75, sternPow: 1.3, sectionPow: 0.9,
        sheerFwdMul: 0.04, sheerAftMul: 0.02, freeboardMul: 0.8, draftMul: 0.8, draftCap: 3.4,
      };
    default:
      return {
        sheerFwdMul: 0.12, sheerAftMul: 0.04, bowFlare: 0.15, stemRakeMul: 0.012,
        freeboardMul: 0.85, draftMul: 0.6, draftCap: 2.9,
      };
  }
}

// 组装整舰模型。玩家 Ship 与敌方 EnemyShip 都走这一条路径，确保双方舰船
// 建模与涂装完全一致。返回：
//   { group, mats, turrets, deckY, hasBridge, scopedCameraHeight, turretSize }
export function buildShipModel(cfg, shipClass) {
  const group = new THREE.Group();
  const isCarrier = shipClass === 'carrier';
  const mats = createShipMaterials(isCarrier);
  const hullOpts = hullOptsFor(shipClass);

  // 干舷压缩：甲板高度（水线以上船体）按船种压低，露水部分更扁更修长；
  // 上层建筑尺寸取自 cfg.height，不随干舷缩水 —— 全舰侧影变成"矮船体 +
  // 原比例上层建筑"。战列舰压得最狠（0.65），下限 1.6m —— 再低波峰
  // （~2.6m 峰值、常态 ±1m）会漫过甲板。
  const baseDeckY = cfg.height + 1.0;
  const deckY = Math.max(1.6, baseDeckY * (hullOpts.freeboardMul ?? 0.9));

  // 吃水与水线带锚定（世界米数）：海面波浪在 ±1m 量级摆动（波峰 ~2.5m），
  // 水线带（黑色 boot topping）按未压缩的参考干舷取宽并整体抬高 —— 黑色
  // 水线带在露水船体上骑得更高、灰色干舷更矮，配合加深的吃水形成"深坐水"
  // 的厚重观感；吃水按未压缩干舷计算（不随干舷压缩变浅），龙骨稳居波谷
  // 之下，防污漆（暗红）只在沉没时露出。战列舰吃水可达 ~3.8m，而水线上
  // 船体只有 ~3m（扁宽而非高瘦）。
  const bandBot = -Math.min(1.35, Math.max(0.8, 0.35 * baseDeckY));
  const bandTop = Math.min(0.75, Math.max(0.3, 0.15 * baseDeckY));
  const draftMul = hullOpts.draftMul ?? 0.45;
  const draft = Math.min(hullOpts.draftCap ?? 2.9, Math.max(-bandBot + 0.3, draftMul * baseDeckY));
  hullOpts.bandBot = bandBot;
  hullOpts.bandTop = bandTop;
  // 舷弧/艏柱前倾的绝对量（参数以相对比例给出，此处换算成米）。
  hullOpts.sheerFwd = (hullOpts.sheerFwdMul ?? 0) * deckY;
  hullOpts.sheerAft = (hullOpts.sheerAftMul ?? 0) * deckY;
  hullOpts.stemRake = (hullOpts.stemRakeMul ?? 0) * cfg.length;

  // 局部甲板高度（z 处）：炮塔/防空炮座/防浪板都坐在弯曲的甲板线上，
  // 艏部炮塔随舷弧自然抬高 —— 这正是战列舰"前高后低"层叠侧影的来源。
  const deckYAt = (z) => {
    const t = Math.max(0, Math.min(1, (z + cfg.length / 2) / cfg.length));
    return deckY + hullOpts.sheerFwd * sheerRiseFwd(t) + hullOpts.sheerAft * sheerRiseAft(t);
  };

  const { hullGeo, deckGeo } = createHullGeometry(cfg.length, cfg.width, deckY, draft, hullOpts);
  group.add(new THREE.Mesh(hullGeo, mats.hull));
  if (!isCarrier) {
    // 航母的飞行甲板会覆盖船体甲板，跳过避免 z-fighting。
    group.add(new THREE.Mesh(deckGeo, mats.deck));
  }

  // 上层建筑（按船种分支）。
  let scopedCameraHeight;
  let hasBridge = !!cfg.hasBridge;
  const barrels = cfg.barrels || 1;
  const turretSize = (0.8 + cfg.width * 0.10) * (cfg.turretMul || 1.0);
  const barrelLen = turretSize * 1.5;
  // 炮管间距拉开（旧 0.35）：多管炮塔的每根炮管各占一条滑轨，像 □□□---
  // 一样横布在炮室前缘，而不是三根细管挤成一束。
  const barrelGap = turretSize * 0.55;
  const turretDefs = buildTurretDefs(cfg, shipClass);
  const frontMaxZ = turretDefs.filter(d => d.isFront).reduce((m, d) => Math.max(m, d.z), 0);

  if (shipClass === 'submarine') {
    const sub = buildSubmarineSuperstructure(cfg, deckY, mats);
    for (const p of sub.parts) group.add(p);
    scopedCameraHeight = sub.scopedCameraHeight;
    hasBridge = false;
  } else if (isCarrier) {
    const car = buildCarrierSuperstructure(cfg, deckY, mats);
    for (const p of car.parts) group.add(p);
    scopedCameraHeight = car.scopedCameraHeight;
    hasBridge = true;
  } else if (cfg.hasBridge) {
    const sup = buildSurfaceSuperstructure(cfg, deckY, mats, frontMaxZ, shipClass, deckYAt);
    for (const p of sup.parts) group.add(p);
    scopedCameraHeight = sup.scopedCameraHeight;
  } else {
    scopedCameraHeight = deckY + 3;
  }

  // 主炮塔。
  const turrets = [];
  for (const def of turretDefs) {
    const t = buildTurret(mats, turretSize, barrels, barrelLen, barrelGap);
    t.group.position.set(def.x, deckYAt(def.z) + 0.15 + (def.y || 0), def.z);
    group.add(t.group);

    // 超射炮塔下的炮座（barbette）。
    if ((def.y || 0) > 0.01) {
      const housingWidth = turretHousingWidth(turretSize, barrels);
      const pedestalH = (def.y || 0) + 0.15;
      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(housingWidth * 0.42, housingWidth * 0.5, pedestalH, 14),
        mats.turret,
      );
      pedestal.position.set(def.x, deckYAt(def.z) + pedestalH / 2, def.z);
      group.add(pedestal);
    }

    turrets.push({
      group: t.group,
      body: t.body,
      barrelPivot: t.barrelPivot,
      barrels: t.barrels,
      barrelLen: t.barrelLen,
      barrelGap: t.barrelGap,
      yawCenter: def.yawCenter,
      yawRange: def.yawRange,
      isFront: def.isFront,
    });
  }

  // 防空炮座（装饰）。
  buildAaMounts(group, cfg, shipClass, deckYAt, mats, hullOpts);

  return { group, mats, turrets, deckY, hasBridge, scopedCameraHeight, turretSize };
}

// 沿两舷散布小口径防空炮。railX 依据船体实际半宽内收，避免在收窄的
// 艏/艉段悬空。
function buildAaMounts(group, cfg, shipClass, deckYAt, mats, hullOpts) {
  const aa = getClassAa(shipClass);
  if (!aa || aa.mounts <= 0) return;
  const mainTurretSize = (0.8 + cfg.width * 0.10) * (cfg.turretMul || 1.0);
  const mountSize = Math.max(0.35, mainTurretSize * 0.32);
  const halfL = cfg.length / 2;
  const barrelLen = mountSize * 1.1;
  for (let i = 0; i < aa.mounts; i++) {
    const side = (i % 2 === 0) ? 1 : -1;
    const t = aa.mounts === 1 ? 0.5 : i / (aa.mounts - 1);
    const z = halfL * 0.62 - t * halfL * 1.05;
    // 该站的船体半宽（t 参数以艉→艏方向与放样一致）。
    const stationT = (z + halfL) / cfg.length;
    const localHalf = hullHalfBeamFraction(stationT, hullOpts) * cfg.width * 0.5;
    const railX = Math.min(cfg.width * 0.34, localHalf - mountSize * 0.75);

    const mount = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(mountSize * 0.5, mountSize * 0.6, mountSize * 0.3, 8),
      mats.turret,
    );
    mount.add(base);
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(mountSize, mountSize * 0.8, mountSize),
      mats.turret,
    );
    housing.position.y = mountSize * 0.4;
    mount.add(housing);
    for (let b = 0; b < 2; b++) {
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, barrelLen, 6),
        mats.barrel,
      );
      barrel.rotation.x = Math.PI / 2 - 0.6;
      barrel.position.set((b - 0.5) * mountSize * 0.35, mountSize * 0.4, barrelLen * 0.35);
      housing.add(barrel);
    }
    mount.position.set(side * railX, deckYAt(z) + 0.15, z);
    group.add(mount);
  }
}

// ============================================================================
// 阵营文字标记（敌方识别用：船体不再分红色阵营涂装）
// ============================================================================

const _markerTexCache = new Map();

// 生成带描边的文字 Sprite（自动面向相机，depthTest 关闭穿烟可见）。
export function createMarkerSprite(text, fill = '#ff6a55') {
  let tex = _markerTexCache.get(text);
  if (!tex) {
    const W = 256, H = 64;
    const c = makeCanvas(W, H);
    if (!c) {
      // 无 DOM 环境（单元测试）：返回无贴图的空白 Sprite，保持调用方可用。
      return new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    }
    const ctx = c.getContext('2d');
    ctx.font = 'bold 32px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(15,8,8,0.9)';
    ctx.lineWidth = 6;
    ctx.strokeText(text, W / 2, H / 2 + 2);
    ctx.fillStyle = fill;
    ctx.fillText(text, W / 2, H / 2 + 2);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    _markerTexCache.set(text, tex);
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  }));
  sprite.renderOrder = 1002;
  return sprite;
}
