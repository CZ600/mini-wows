import * as THREE from 'three';
import { SUN_DIR } from './scene.js';

// 海面着色器 v3：真实感海浪 + 光影。
//
// 旧版问题的根源：
//  1. "机械、重复"——长波是一组固定平行波列，波峰线笔直且无限延伸，
//     再叠加全局同步的"呼吸"脉动，整片海面像同一个函数平移。
//  2. "不锐利"——网格 20m/格，波长 45~70m 的中波每波只有 2~3 个顶点
//     (低于奈奎斯特采样极限，直接糊掉)，22~28m 的细波完全采样不出来。
//     真实海面的"锐利感"恰恰来自这些中小尺度波。
//
// 本版方案：
//  [顶点层 · 涌浪] 7 个大尺度 Gerstner 波(520m~70m)，方向围绕风向扩散
//    + 1 个交叉涌浪。每个波的相位被两张低频噪声场扰动——波峰线弯曲、
//    断裂，不再平行；振幅被"波群"包络调制——海面成片起伏，此起彼伏。
//  [片元层 · 细浪] 9 个倍频细浪(42m~2.8m)只算法线梯度、不算位移，
//    逐像素求值无网格分辨率限制，波光锐利；每倍频按距离淡出防摩尔纹。
//  [光影] Gerstner 折叠雅可比驱动的白沫(波峰翻卷处起沫)、双瓣太阳
//    高光 + 逐格闪烁耀斑(波光粼粼)、Fresnel 天空反射、波背次表面散射、
//    缓慢漂移的云影(海面明暗斑驳)。
//
// 对外接口与旧版一致：返回 Mesh，material.uniforms 含 time / uCameraPos，
// engine 每帧更新这两个 uniform 即可。波幅峰值控制在 ~2.6m，
// 与舰船固定吃水线匹配，不会穿甲板。

export function createWater(scene) {
  // 640x640 段 ≈ 16m/格：给 70~520m 涌浪足够的位移分辨率；
  // 更细的尺度全部由片元着色器承担，不再靠加密网格。
  const geometry = new THREE.PlaneGeometry(10200, 10200, 640, 640);
  geometry.rotateX(-Math.PI / 2);

  const vertexShader = `
    uniform float time;
    uniform vec3 uCameraPos;

    varying vec3 vWorldPos;
    varying vec2 vSlope;   // 涌浪坡度 (dy/dx, dy/dz)，片元层再叠加细浪
    varying float vHeight; // 波高
    varying float vFold;   // Gerstner 折叠雅可比 J：波峰翻卷时 J→0
    varying float vGroup;  // 波群能量(局部海面"活跃度")

    // 主风向(与主浪向一致)
    const vec2 WIND = vec2(0.8206, 0.5715);

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
    }

    // 单个 Gerstner 涌浪。S 为陡峭系数(0~1)：
    //   水平位移幅度 = S/k，波峰被拉尖、波谷被摊平(trochoid 形)。
    // 同时累积坡度 slope 与折叠雅可比项 jac。
    void gw(vec2 p, float amp, vec2 dir, float L, float S, float warp, float t,
            inout float h, inout vec2 disp, inout vec2 slope, inout vec4 jac) {
      float k = 6.2831853 / L;
      float c = 2.1 * sqrt(1.5613 * L);   // 深水波速(引擎 time 以 0.5 倍速推进)
      float f = k * (dot(dir, p) - c * t) + k * warp;
      float sf = sin(f);
      float cf = cos(f);
      disp  += dir * (S / k) * cf;
      h     += amp * sf;
      slope += dir * (k * amp * cf);
      // J = (1-jxx)(1-jzz) - jxz*jzx，各项 = Σ S·d_i·d_j·sin(f)
      jac   += vec4(S * dir.x * dir.x, S * dir.x * dir.y,
                    S * dir.y * dir.x, S * dir.y * dir.y) * sf;
    }

    void main() {
      vec2 p = position.xz;
      float t = time;

      vec4 aw = modelMatrix * vec4(position, 1.0);
      float dist = length(aw.xz - uCameraPos.xz);
      float lodA = 1.0 - smoothstep(1200.0, 3200.0, dist);  // 中频涌浪远处淡出
      float lodB = 1.0 - smoothstep(500.0, 1600.0, dist);   // 短涌浪仅近处

      // 相位扰动场：让波峰线弯曲、断裂，消除平行波列的机械感。
      // 两张不同尺度/速度的噪声，长波弯得缓、短波碎得急。
      float warp1 = valueNoise(p * 0.0032 + WIND * t * 0.020 + 17.0);
      float warp2 = valueNoise(p * 0.0080 - WIND * t * 0.033 + 43.0);
      // 波群包络：大尺度能量起伏，海面成片活跃/平静，而非全局同步。
      float modA = 0.62 + 0.68 * (valueNoise(p * 0.0016 + WIND * t * 0.008 + 5.0) * 0.5 + 0.5);
      float modB = 0.62 + 0.68 * (valueNoise(p * 0.0025 - WIND * t * 0.011 + 29.0) * 0.5 + 0.5);

      float h = 0.0;
      vec2 disp = vec2(0.0);
      vec2 slope = vec2(0.0);
      vec4 jac = vec4(0.0);

      // === 涌浪谱：波长 520~70m，方向绕风向扩散 + 一个交叉涌浪 ===
      // (波长, 振幅, 方向, 陡度S, 相位扰动)——扰动幅度 ~0.18L，逐波交替取反
      gw(p, 0.50 * modA, vec2( 0.821, 0.572), 520.0, 0.32,  warp1 *  95.0, t, h, disp, slope, jac);
      gw(p, 0.42 * modA, vec2( 0.657, 0.753), 340.0, 0.42, -warp1 *  62.0, t, h, disp, slope, jac);
      gw(p, 0.34 * modA, vec2( 0.975, 0.222), 240.0, 0.52,  warp1 *  43.0, t, h, disp, slope, jac);
      gw(p, 0.26 * modB, vec2( 0.294, 0.956), 170.0, 0.60, -warp2 *  31.0, t, h, disp, slope, jac);
      gw(p, 0.20 * modB, vec2(-0.340, 0.941), 125.0, 0.66,  warp2 *  22.0, t, h, disp, slope, jac);
      gw(p, 0.15 * modB * lodA, vec2(0.502, 0.865),  95.0, 0.72,  warp2 * 17.0, t, h, disp, slope, jac);
      gw(p, 0.10 * modB * lodB, vec2(0.996,-0.090),  70.0, 0.78, -warp2 * 12.0, t, h, disp, slope, jac);

      vec3 pos = position;
      pos.x += disp.x;
      pos.z += disp.y;
      pos.y += h;

      vHeight = h;
      vSlope = slope;
      vFold = (1.0 - jac.x) * (1.0 - jac.w) - jac.y * jac.z;
      vGroup = (modA + modB) * 0.5;
      vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float time;
    uniform vec3 uSunDir;

    varying vec3 vWorldPos;
    varying vec2 vSlope;
    varying float vHeight;
    varying float vFold;
    varying float vGroup;

    const vec2 WIND = vec2(0.8206, 0.5715);

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 2.0 - 1.0;
    }
    float fbm3(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 3; i++) { s += valueNoise(p) * a; p = p * 2.13 + 11.7; a *= 0.5; }
      return s;
    }
    float fbm4(vec2 p) {
      float s = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { s += valueNoise(p) * a; p = p * 2.17 + 7.3; a *= 0.5; }
      return s;
    }
    vec3 hash3(vec2 p) {
      float n = sin(dot(p, vec2(41.3, 289.1)));
      return fract(vec3(n, n * 1.37, n * 2.13) * 43758.5453);
    }

    // 片元级细浪：只算法线梯度、不算位移，逐像素求值不受网格分辨率限制，
    // 是海面"锐利感"的主要来源。fade 按波长×距离淡出，防止远处摩尔纹。
    void chop(vec2 p, vec2 dir, float L, float slopeAmt, float fade, float warp, inout vec2 g) {
      if (fade <= 0.003) return;
      float k = 6.2831853 / L;
      float c = 2.1 * sqrt(1.5613 * L);
      float f = k * (dot(dir, p) - c * time + warp);
      g += dir * (slopeAmt * fade) * cos(f);
    }

    // 与 scene.js 天空穹顶一致的天空采样(含日面与光晕)，供反射使用。
    vec3 sampleSky(vec3 dir, vec3 sunDir) {
      float h = dir.y;
      vec3 horizon = vec3(1.0, 0.86, 0.66);
      vec3 mid = vec3(0.62, 0.76, 0.86);
      vec3 zenith = vec3(0.37, 0.62, 0.81);

      vec3 color;
      if (h > 0.0) {
        vec3 lower = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        color = mix(lower, zenith, smoothstep(0.18, 0.55, h));
      } else {
        color = mix(vec3(0.10, 0.20, 0.30), horizon, clamp(-h * 6.0, 0.0, 1.0) * 0.25);
      }

      float sunDot = max(dot(dir, sunDir), 0.0);
      float disk = smoothstep(0.9982, 0.9994, sunDot);
      float glow = pow(sunDot, 220.0) * 0.9 + pow(sunDot, 12.0) * 0.22 + pow(sunDot, 3.0) * 0.05;
      color += vec3(1.0, 0.82, 0.55) * disk * 2.2;
      color += vec3(1.0, 0.78, 0.50) * glow;
      return color;
    }

    void main() {
      vec3 toCam = cameraPosition - vWorldPos;
      float dist = length(toCam);
      vec3 V = toCam / max(dist, 1e-4);
      vec2 p = vWorldPos.xz;

      // ---- 细浪法线(逐像素)：涌浪坡度 + 9 个倍频梯度 ----
      vec2 g = vSlope;
      float wn = valueNoise(p * 0.045 + vec2(time * 0.9, -time * 0.6));
      chop(p, vec2(0.604, 0.797), 42.0, 0.30, 1.0 - smoothstep(1300.0, 4200.0, dist),  wn * 2.2, g);
      chop(p, vec2(0.993, 0.120), 30.0, 0.27, 1.0 - smoothstep( 900.0, 3000.0, dist), -wn * 2.6, g);
      chop(p, vec2(0.193, 0.981), 22.0, 0.24, 1.0 - smoothstep( 660.0, 2200.0, dist),  wn * 3.0, g);
      chop(p, vec2(0.921, 0.388), 16.0, 0.21, 1.0 - smoothstep( 480.0, 1600.0, dist), -wn * 3.2, g);
      chop(p, vec2(0.905,-0.425), 11.5, 0.18, 1.0 - smoothstep( 340.0, 1150.0, dist),  wn * 3.5, g);
      chop(p, vec2(0.377, 0.926),  8.2, 0.15, 1.0 - smoothstep( 240.0,  820.0, dist), 0.0, g);
      chop(p, vec2(0.867, 0.498),  5.8, 0.12, 1.0 - smoothstep( 170.0,  580.0, dist), 0.0, g);
      chop(p, vec2(0.818,-0.576),  4.0, 0.09, 1.0 - smoothstep( 120.0,  400.0, dist), 0.0, g);
      chop(p, vec2(0.562, 0.828),  2.8, 0.07, 1.0 - smoothstep(  84.0,  280.0, dist), 0.0, g);

      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      float slopeMag = length(g);

      // ---- 云影：大尺度噪声缓慢漂移，阳光被云层遮出明暗斑驳 ----
      float cs = fbm3(p * 0.00055 + WIND * time * 0.0045);
      float sunVis = 0.62 + 0.38 * smoothstep(-0.45, 0.55, cs);

      vec3 sunColor = vec3(1.0, 0.87, 0.64);

      // ---- 水体颜色：深水散射 + 波峰透光，波面朝阳侧提亮 ----
      vec3 deep = vec3(0.014, 0.062, 0.085);
      vec3 sub  = vec3(0.052, 0.170, 0.180);
      vec3 water = mix(deep, sub, smoothstep(-0.8, 1.5, vHeight) * 0.75);
      float ndl = max(dot(n, uSunDir), 0.0);
      water *= 0.55 + 0.45 * (0.5 + 0.5 * ndl * sunVis);
      water += sunColor * vec3(0.012, 0.034, 0.036) * ndl * sunVis * 2.0;

      // ---- Fresnel 天空反射(水面的"天光") ----
      float ndv = max(dot(n, V), 1e-3);
      float F = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
      vec3 R = reflect(-V, n);
      vec3 sky = sampleSky(R, uSunDir);
      vec3 color = water * (1.0 - F) + sky * F;

      // ---- 次表面散射：逆光时波背透出青绿 ----
      float back = pow(max(dot(V, -uSunDir), 0.0), 3.0);
      float sss = back * smoothstep(-0.3, 1.4, vHeight) * (0.3 + 0.7 * ndl);
      color += vec3(0.05, 0.32, 0.26) * sss * 0.5 * sunVis;

      // ---- 太阳高光：近处锐利闪烁 + 远处渐宽成"耀斑光路" ----
      vec3 H = normalize(V + uSunDir);
      float ndh = max(dot(n, H), 0.0);
      float distT = smoothstep(60.0, 3500.0, dist);
      float specSharp = pow(ndh, mix(720.0, 60.0, distT));
      float specBroad = pow(ndh, mix(48.0, 14.0, distT));
      vec3 spec = sunColor * (specSharp * mix(2.4, 0.35, distT) + specBroad * 0.16) * sunVis;

      // ---- 耀斑闪点：~0.5m 网格里随机倾斜的微镜面，朝半程向量对齐时爆闪 ----
      float sparkleAmt = (1.0 - smoothstep(250.0, 700.0, dist)) * sunVis;
      vec2 cell = floor(mod(p * 1.9, 512.0));
      vec3 h3 = hash3(cell);
      vec3 jit = normalize(vec3((h3.x - 0.5) * 1.6, 0.55, (h3.y - 0.5) * 1.6));
      float flick = 0.5 + 0.5 * sin(time * 7.0 + h3.z * 40.0);
      float glint = pow(max(dot(jit, H), 0.0), 260.0) * flick;
      spec += sunColor * glint * sparkleAmt * 2.8;
      color += spec;

      // ---- 白沫：波峰折叠(雅可比)起沫 + 细浪过陡翻白，顺风拉丝、随波漂移 ----
      float uAxis = dot(p, WIND);
      float vAxis = dot(p, vec2(-WIND.y, WIND.x));
      vec2 fuv = vec2(uAxis - time * 7.0, vAxis * 3.0) * 0.035;   // 沿风向拉长 3:1
      vec2 tuv = vec2(uAxis - time * 4.5 + 30.0, vAxis * 2.2) * 0.030;
      float foamTex = smoothstep(0.05, 0.55, fbm4(fuv));
      float trailTex = smoothstep(0.10, 0.60, fbm3(tuv));

      // vFold 平坦时为 1，波峰翻卷时降到 ~0.1-0.35：阈值据此标定，
      // 大多数中等以上的波峰都能起沫，配合波群能量决定浓淡。
      float crestFold = smoothstep(0.92, 0.10, vFold);
      float crestFoam = crestFold * smoothstep(-0.10, 0.80, vHeight)
                      + smoothstep(1.3, 2.0, vHeight) * 0.3;   // 高波峰顶端戴帽
      float chopBreak = smoothstep(0.34, 0.80, slopeMag) * (1.0 - smoothstep(250.0, 1200.0, dist));
      float foamEnergy = clamp((vGroup - 0.45) * 1.6, 0.40, 1.0);
      float foamAmt = (crestFoam * (0.55 + 0.45 * foamTex)
                     + crestFoam * trailTex * 0.5
                     + chopBreak * 0.4 * trailTex) * foamEnergy;
      foamAmt *= 1.0 - smoothstep(1400.0, 3000.0, dist);

      vec3 skyAmb = vec3(0.62, 0.71, 0.80);
      vec3 foamCol = vec3(0.88, 0.90, 0.92)
                   * (skyAmb * 0.42 + sunColor * (0.42 + 0.58 * ndl) * sunVis);
      color = mix(color, foamCol, clamp(foamAmt, 0.0, 0.88));

      // ---- 远景雾：与 scene.fog (FogExp2, 0xfae0ad) 对齐 ----
      float fog = 1.0 - exp(-dist * dist * 0.00000004);
      vec3 fogColor = vec3(0.98, 0.88, 0.68);
      color = mix(color, fogColor, fog * 0.92);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader,
    fragmentShader,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0;
  scene.add(mesh);
  return mesh;
}
