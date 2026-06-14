import * as THREE from 'three';

// 朝阳方向（仰角约 17°，水平偏向东南），单位向量。
// scene.js 的灯光、SkyDome、water.js 的反射共用此方向。
export const SUN_DIR = new THREE.Vector3(0.55, 0.30, 0.78).normalize();

export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xf7d6a8, 0.00009);

  const sun = new THREE.DirectionalLight(0xffe6b8, 1.25);
  sun.position.copy(SUN_DIR).multiplyScalar(2000);
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0xfff0d6, 0.55);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xffe0b0, 0x4a5870, 0.45);
  scene.add(hemi);

  scene.add(createSkyDome());

  return scene;
}

function createSkyDome() {
  const geo = new THREE.SphereGeometry(9000, 32, 16);
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
      varying vec3 vDir;

      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;

        vec3 color;
        if (h > 0.0) {
          float t1 = smoothstep(0.0, 0.18, h);
          float t2 = smoothstep(0.18, 0.55, h);
          vec3 lower = mix(uHorizonColor, uMidColor, t1);
          color = mix(lower, uTopColor, t2);
        } else {
          color = mix(uHorizonColor, vec3(0.82, 0.86, 0.92), clamp(-h * 2.5, 0.0, 1.0));
        }

        float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
        float disk = smoothstep(0.9982, 0.9994, sunDot);
        float glow = pow(sunDot, 220.0) * 0.9 + pow(sunDot, 12.0) * 0.22 + pow(sunDot, 3.0) * 0.06;
        color += uSunColor * disk * 2.0;
        color += uSunColor * glow;

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
