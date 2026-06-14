import * as THREE from 'three';
import { SUN_DIR } from './scene.js';

export function createWater(scene) {
  const geometry = new THREE.PlaneGeometry(10200, 10200, 768, 768);
  geometry.rotateX(-Math.PI / 2);

  const vertexShader = `
    uniform float time;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;

    void addWave(vec2 p, float amp, vec2 dir, float freq, float spd,
                 inout float h, inout float dhx, inout float dhz) {
      float phase = dot(dir, p) * freq + time * spd;
      float s = sin(phase);
      float c = cos(phase);
      h += amp * s;
      dhx += amp * dir.x * freq * c;
      dhz += amp * dir.y * freq * c;
    }

    void main() {
      float h = 0.0, dhx = 0.0, dhz = 0.0;
      vec2 p = position.xz;

      addWave(p, 0.85, vec2(0.857, 0.514), 0.015, 0.8, h, dhx, dhz);
      addWave(p, 0.55, vec2(0.287, 0.958), 0.025, 1.0, h, dhx, dhz);
      addWave(p, 0.38, vec2(-0.530, 0.848), 0.035, 0.7, h, dhx, dhz);
      addWave(p, 0.24, vec2(0.936, -0.351), 0.05, 1.3, h, dhx, dhz);
      addWave(p, 0.16, vec2(0.216, 0.976), 0.065, 1.8, h, dhx, dhz);
      addWave(p, 0.15, vec2(0.6, 0.8), 0.04, 1.5, h, dhx, dhz);
      addWave(p, 0.10, vec2(-0.7, 0.714), 0.055, 1.7, h, dhx, dhz);

      vec3 pos = position;
      pos.y += h;
      vHeight = h;
      vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
      vNormal = normalize(vec3(-dhx, 1.0, -dhz));

      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `;

  const fragmentShader = `
    uniform float time;
    uniform vec3 uSunDir;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;

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
        color = vec3(0.10, 0.20, 0.30);
      }

      float sunDot = max(dot(dir, sunDir), 0.0);
      float disk = smoothstep(0.9982, 0.9994, sunDot);
      float glow = pow(sunDot, 220.0) * 0.9 + pow(sunDot, 12.0) * 0.22 + pow(sunDot, 3.0) * 0.05;
      color += vec3(1.0, 0.82, 0.55) * disk * 2.2;
      color += vec3(1.0, 0.78, 0.50) * glow;

      return color;
    }

    void main() {
      vec3 normal = normalize(vNormal);

      float dist = length(vWorldPos - cameraPosition);

      float detailFade = clamp(1.0 - (dist - 200.0) / 700.0, 0.1, 1.0);
      vec2 dp = vWorldPos.xz * 0.15 + time * vec2(0.3, 0.2);
      float rx = sin(dp.x * 3.7) * cos(dp.y * 2.3);
      float rz = cos(dp.x * 2.7) * sin(dp.y * 3.3);
      normal = normalize(normal + vec3(rx, 0.0, rz) * 0.12 * detailFade);

      vec3 deepColor = vec3(0.07, 0.15, 0.20);
      vec3 midColor = vec3(0.09, 0.17, 0.22);
      vec3 surfaceColor = vec3(0.12, 0.20, 0.25);
      vec3 foamColor = vec3(0.70, 0.74, 0.78);

      float hf = smoothstep(-0.8, 1.2, vHeight);
      vec3 color = mix(deepColor, midColor, hf);
      color = mix(color, surfaceColor, smoothstep(0.5, 1.2, vHeight));

      float foam = smoothstep(0.95, 1.6, vHeight);
      color = mix(color, foamColor, foam * 0.45);

      vec3 viewDir = normalize(cameraPosition - vWorldPos);

      float diff = max(dot(normal, uSunDir), 0.0);
      color *= 0.62 + 0.38 * diff;

      vec3 halfDir = normalize(viewDir + uSunDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 512.0);
      color += vec3(1.0, 0.92, 0.78) * spec * 1.0;

      float spec2 = pow(max(dot(normal, halfDir), 0.0), 32.0);
      color += vec3(0.30, 0.28, 0.26) * spec2 * 0.12;

      vec3 reflectDir = reflect(-viewDir, normal);
      vec3 skyRefl = sampleSky(reflectDir, uSunDir);

      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
      float reflStrength = clamp(fresnel * 0.45 + 0.08, 0.0, 0.65);
      color = mix(color, skyRefl, reflStrength);

      float sss = pow(max(dot(viewDir, -uSunDir + normal * 0.4), 0.0), 3.0);
      color += vec3(0.05, 0.10, 0.05) * sss * 0.35;

      float fog = 1.0 - exp(-dist * dist * 0.000000028);
      vec3 fogColor = vec3(1.0, 0.86, 0.66);
      color = mix(color, fogColor, fog * 0.92);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
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
