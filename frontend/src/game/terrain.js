import * as THREE from 'three';
import { PerlinNoise } from './noise.js';
import { applyHalfLambert } from './scene.js';

const MAP_SIZE = 10000;
const SEGMENTS = 256;

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export class Terrain {
  constructor(scene, terrainSeed, islands) {
    this.scene = scene;
    this.noise = new PerlinNoise(123);
    this.heights = new Float32Array((SEGMENTS + 1) * (SEGMENTS + 1));

    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);

    const positions = geo.attributes.position.array;

    if (islands && islands.length > 0) {
      this.islandCenters = islands.map(i => ({
        x: i.x, z: i.z, radius: i.radius, height: i.height,
      }));
    } else {
      const rng = terrainSeed ? seededRandom(terrainSeed) : Math.random;
      this.islandCenters = [];
      // 山体密度比原来增加 100%（5 -> 10）
      for (let i = 0; i < 10; i++) {
        // 最高高度提升至原来的 300%（最大值 60 -> 180）
        const height = 20 + rng() * 180;
        // 底座面积随高度放大：高山配更宽的底座，避免尖塔感
        // 矮山(height≈20):  约 350~550；高山(height≈200): 约 800~1000
        const radius = 300 + (height / 200) * 500 + rng() * 200;
        this.islandCenters.push({
          x: (rng() - 0.5) * MAP_SIZE * 0.7,
          z: (rng() - 0.5) * MAP_SIZE * 0.7,
          radius,
          height,
        });
      }
    }

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];

      let h = this.noise.fbm(x * 0.0003, z * 0.0003, 4) * 3 - 3;

      for (const island of this.islandCenters) {
        const dx = x - island.x;
        const dz = z - island.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < island.radius) {
          const factor = 1 - (dist / island.radius);
          h += island.height * factor * factor;
        }
      }

      if (h < 0) h = -4;
      else h += 2;
      positions[i + 1] = h;
      this.heights[i / 3] = h;
    }

    geo.computeVertexNormals();

    const colors = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const h = positions[i + 1];
      let r, g, b;
      if (h <= 0) { r = 0.78; g = 0.78; b = 0.76; }
      else if (h < 7) { r = 0.86; g = 0.82; b = 0.62; }
      else if (h < 32) { r = 0.25; g = 0.55; b = 0.15; }
      else { r = 0.50; g = 0.45; b = 0.38; }
      colors[i] = r; colors[i + 1] = g; colors[i + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyHalfLambert(mat);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = -1;
    scene.add(this.mesh);
  }

  getHeightAt(x, z) {
    const halfSize = MAP_SIZE / 2;
    const step = MAP_SIZE / SEGMENTS;
    const ix = (x + halfSize) / step;
    const iz = (z + halfSize) / step;
    const x0 = Math.floor(ix);
    const z0 = Math.floor(iz);
    const fx = ix - x0;
    const fz = iz - z0;

    if (x0 < 0 || x0 >= SEGMENTS || z0 < 0 || z0 >= SEGMENTS) return -5;

    const getIdx = (xi, zi) => zi * (SEGMENTS + 1) + xi;
    const h00 = this.heights[getIdx(x0, z0)];
    const h10 = this.heights[getIdx(x0 + 1, z0)];
    const h01 = this.heights[getIdx(x0, z0 + 1)];
    const h11 = this.heights[getIdx(x0 + 1, z0 + 1)];

    return ((h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz) - 1;
  }

  isLand(x, z) { return this.getHeightAt(x, z) > 0; }

  destroy() {
    if (this.mesh) {
      if (this.scene) this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }

  generateMinimapImage() {
    const res = SEGMENTS + 1;
    const canvas = document.createElement('canvas');
    canvas.width = res;
    canvas.height = res;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(res, res);
    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i];
      const p = i * 4;
      if (h > 30) {
        imgData.data[p] = 100; imgData.data[p + 1] = 90; imgData.data[p + 2] = 70;
      } else if (h > 7) {
        imgData.data[p] = 45; imgData.data[p + 1] = 95; imgData.data[p + 2] = 30;
      } else if (h > 0) {
        imgData.data[p] = 130; imgData.data[p + 1] = 120; imgData.data[p + 2] = 75;
      } else {
        imgData.data[p] = 10; imgData.data[p + 1] = 42; imgData.data[p + 2] = 80;
      }
      imgData.data[p + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
}
