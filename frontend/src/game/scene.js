import * as THREE from 'three';

// 朝阳方向（仰角约 17°，水平偏向东南），单位向量。
// scene.js 的灯光、SkyDome、water.js 的反射共用此方向。
export const SUN_DIR = new THREE.Vector3(0.55, 0.30, 0.78).normalize();

export function createScene() {
  const scene = new THREE.Scene();
  // 远处薄雾：所有标准材质（地形/舰船/炮塔/炮弹）按距离向地平线暖色淡出，
  // 形成大气透视与纵深感。密度 0.0002 在近处(≤800m)几乎无影响、
  // 中距离(1.5km)约 8%、远处(3km)约 30%、极远(6km)约 76%。
  // 颜色与天空穹顶地平线(0xffdca8)及水面雾化统一，保证海天衔接自然。
  scene.fog = new THREE.FogExp2(0xfae0ad, 0.0002);

  const sun = new THREE.DirectionalLight(0xffe6b8, 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(2000);
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0xfff0d6, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffe0b0, 0x4a5870, 0.45);
  scene.add(hemi);

  const skyDome = createSkyDome();
  scene.add(skyDome);
  // 引擎在水波 time 更新处同步云的漂移时钟（scene.userData.skyDome）
  scene.userData.skyDome = skyDome;

  return scene;
}

function createSkyDome() {
  const geo = new THREE.SphereGeometry(9000, 64, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color(0xffd28a) },
      uHorizonColor: { value: new THREE.Color(0xffdca8) },
      uMidColor: { value: new THREE.Color(0x9fc2dc) },
      uTopColor: { value: new THREE.Color(0x5f9fce) },
      time: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uMidColor;
      uniform vec3 uTopColor;
      uniform float time;
      varying vec3 vDir;

      // 与 water.js 一致的主风向：云的漂移方向对齐海面云影
      const vec2 WIND = vec2(0.8206, 0.5715);

      // 对大输入坐标稳健的 hash(无 sin 版)：传统 p*456 放大系数在
      // 地平线方向的超大采样坐标下会让 fract() 丢精度，退化成条纹。
      float hash(vec2 p) {
        p = fract(p * vec2(0.1031, 0.1030));
        p += dot(p, p.yx + 33.33);
        return fract((p.x + p.y) * p.x);
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
      float fbm5(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { s += valueNoise(p) * a; p = p * 2.11 + 3.9; a *= 0.5; }
        return s;
      }

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        // ---- 大气渐变 ----
        vec3 color;
        if (h > 0.0) {
          vec3 lower = mix(uHorizonColor, uMidColor, smoothstep(0.0, 0.18, h));
          color = mix(lower, uTopColor, smoothstep(0.18, 0.55, h));
        } else {
          color = mix(uHorizonColor, vec3(0.82, 0.86, 0.92), clamp(-h * 2.5, 0.0, 1.0));
        }

        // 太阳方位的地平线暖光扩散(黄金时刻大气散射)
        float sunAz = max(dot(normalize(vec3(dir.x, 0.0, dir.z)),
                              normalize(vec3(uSunDir.x, 0.0, uSunDir.z))), 0.0);
        color += uSunColor * pow(sunAz, 6.0) * (1.0 - smoothstep(0.0, 0.45, h)) * 0.16;

        // ---- 日面与光晕 ----
        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float disk = smoothstep(0.9982, 0.9994, sunDot);
        float glow = pow(sunDot, 220.0) * 0.9 + pow(sunDot, 12.0) * 0.22 + pow(sunDot, 3.0) * 0.06;
        color += uSunColor * disk * 2.0;
        color += uSunColor * glow;

        // ---- 高空卷云：沿风向拉丝的半透明薄云 ----
        float cirr = 0.0;
        if (h > 0.05) {
          vec2 hp = dir.xz / max(h, 0.08) * 4000.0;
          vec2 hu = vec2(dot(hp, vec2(0.94, 0.34)), dot(hp, vec2(-0.34, 0.94)));
          hu = hu * vec2(1.0 / 9000.0, 1.0 / 2200.0) + WIND * time * 0.0035;
          float hn = fbm4(hu) * 0.5 + 0.5;
          cirr = smoothstep(0.58, 0.92, hn) * 0.42;
          cirr *= smoothstep(0.06, 0.25, h);
          vec3 cirrCol = mix(vec3(0.95, 0.94, 0.96), uSunColor * 1.1, 0.30 + 0.25 * pow(sunAz, 3.0));
          color = mix(color, cirrCol, cirr);
        }

        // ---- 积云：视线与云高平面求交 + 域扭曲 fbm，透视上地平线处自然压缩 ----
        // 噪声频率保持恒定(频率随仰角形变会在地平线上方拉出一圈扭曲的云带)：
        // 仰角降低时改为阈值展宽(云变软) + alpha 淡出，让云在投影距离
        // 失控前"融进"大气，同时避免欠采样竖纹。
        if (h > 0.045) {
          vec2 cp = dir.xz / max(h, 0.05) * 1500.0;
          // 特征尺度 ~1.6km、沿风向漂移 ~8m/s，与海面云影的速度/尺度呼应
          vec2 q = cp * (1.0 / 1600.0) + WIND * time * 0.005;
          vec2 w = vec2(fbm3(q * 0.9), fbm3(q * 0.9 + 17.3));
          float d = fbm5(q + w * 0.55);

          // 远处云变软：阈值带随仰角展宽，模拟大气散射的模糊
          float width = mix(0.42, 0.20, smoothstep(0.05, 0.35, h));
          float m = d * 0.5 + 0.5;
          float dens = smoothstep(0.52 - width * 0.15, 0.52 - width * 0.15 + width, m);

          if (dens > 0.003) {
            // 低角度阳光水平穿云：向阳侧偏移采样，密度差给出受光面与银边
            vec2 sunOff = normalize(uSunDir.xz) * 0.10;
            float dSun = fbm4(q + w * 0.55 + sunOff);
            float lit = clamp(0.5 + (d - dSun) * 2.6, 0.0, 1.0);

            vec3 cShadow = vec3(0.45, 0.48, 0.58);
            vec3 cLit = vec3(1.15, 1.02, 0.90);
            vec3 cloudCol = mix(cShadow, cLit, lit);
            cloudCol += uSunColor * pow(lit, 4.0) * 0.85;              // 迎光银边
            cloudCol *= 0.85 + 0.15 * smoothstep(0.0, 0.5, h);         // 地平线处沉入雾色

            // 投影距离 ~7.5km(仰角 0.2)以下开始淡出，融进地平线雾色
            float alpha = dens * 0.95 * smoothstep(0.055, 0.20, h);
            color = mix(color, cloudCol, alpha);
          }
        }

        // ---- 地平线雾化：与水面/场景雾色衔接 ----
        color = mix(color, uHorizonColor * 1.02, (1.0 - smoothstep(0.0, 0.09, h)) * 0.55);

        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });

  const sky = new THREE.Mesh(geo, mat);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

/**
 * 为 MeshPhongMaterial / MeshLambertMaterial 注入 Half Lambert 漫反射。
 * Half Lambert = dotNL * 0.5 + 0.5，比标准 Lambert 更柔和，暗部不会完全黑。
 */
export function applyHalfLambert(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tvec3 irradiance = dotNL * directLight.color;',
      'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );\n\tdotNL = dotNL * 0.5 + 0.5;\n\tvec3 irradiance = dotNL * directLight.color;'
    );
  };
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  return { renderer, cleanup: () => window.removeEventListener('resize', onResize) };
}

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 15000);
  camera.position.set(0, 15, -25);
  camera.lookAt(0, 0, 0);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return { camera, cleanup: () => window.removeEventListener('resize', onResize) };
}
