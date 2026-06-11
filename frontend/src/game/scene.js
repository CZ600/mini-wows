import * as THREE from 'three';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0x87ceeb, 0.00015);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(500, 300, 200);
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x6688aa, 0.6);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3a5f0b, 0.4);
  scene.add(hemi);

  return scene;
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
