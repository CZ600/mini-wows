import * as THREE from 'three';

export function createWater(scene) {
  const geometry = new THREE.PlaneGeometry(10200, 10200, 512, 512);
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

      addWave(p, 0.8, vec2(0.857, 0.514), 0.015, 0.8, h, dhx, dhz);
      addWave(p, 0.5, vec2(0.287, 0.958), 0.025, 1.0, h, dhx, dhz);
      addWave(p, 0.35, vec2(-0.530, 0.848), 0.035, 0.7, h, dhx, dhz);
      addWave(p, 0.2, vec2(0.936, -0.351), 0.05, 1.3, h, dhx, dhz);
      addWave(p, 0.12, vec2(0.216, 0.976), 0.08, 1.8, h, dhx, dhz);

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

    void main() {
      vec3 normal = normalize(vNormal);

      // Small-scale ripple detail
      vec2 dp = vWorldPos.xz * 0.15 + time * vec2(0.3, 0.2);
      float rx = sin(dp.x * 3.7) * cos(dp.y * 2.3);
      float rz = cos(dp.x * 2.7) * sin(dp.y * 3.3);
      normal = normalize(normal + vec3(rx, 0.0, rz) * 0.12);

      // Ocean color layers
      vec3 deepColor = vec3(0.06, 0.15, 0.30);
      vec3 midColor = vec3(0.12, 0.28, 0.48);
      vec3 surfaceColor = vec3(0.22, 0.42, 0.62);
      vec3 foamColor = vec3(0.82, 0.88, 0.92);

      float hf = smoothstep(-0.8, 1.2, vHeight);
      vec3 color = mix(deepColor, midColor, hf);
      color = mix(color, surfaceColor, smoothstep(0.5, 1.2, vHeight));

      // Foam on wave crests
      float foam = smoothstep(0.8, 1.4, vHeight);
      color = mix(color, foamColor, foam * 0.55);

      // Diffuse
      float diff = max(dot(normal, uSunDir), 0.0);
      color *= 0.45 + 0.55 * diff;

      // Sun specular
      vec3 viewDir = normalize(cameraPosition - vWorldPos);
      vec3 halfDir = normalize(viewDir + uSunDir);
      float spec = pow(max(dot(normal, halfDir), 0.0), 512.0);
      color += vec3(1.0, 0.97, 0.92) * spec * 1.5;

      // Broader sun reflection
      float spec2 = pow(max(dot(normal, halfDir), 0.0), 32.0);
      color += vec3(0.3, 0.35, 0.4) * spec2 * 0.15;

      // Fresnel
      float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
      color = mix(color, vec3(0.55, 0.75, 0.90), fresnel * 0.35);

      // Subsurface scattering hint
      float sss = pow(max(dot(viewDir, -uSunDir + normal * 0.4), 0.0), 3.0);
      color += vec3(0.0, 0.08, 0.06) * sss * 0.4;

      // Distance fog
      float dist = length(vWorldPos - cameraPosition);
      float fog = 1.0 - exp(-dist * dist * 0.0000000225);
      color = mix(color, vec3(0.62, 0.85, 0.95), fog);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
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
