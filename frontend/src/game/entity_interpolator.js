import * as THREE from 'three';

const INTERP_DELAY = 0.1;
const SNAP_THRESHOLD = 0.5;
const SNAP_LERP_SPEED = 0.25;

export class EntityInterpolator {
  constructor() {
    this.entities = {};
  }

  update(newSnapshots, dt) {
    const now = performance.now() / 1000;
    const renderTime = now - INTERP_DELAY;

    for (const snap of newSnapshots) {
      const id = snap.id;
      if (!this.entities[id]) {
        this.entities[id] = {
          snapshots: [],
          position: new THREE.Vector3(snap.x, 0, snap.z),
          heading: snap.h,
          prevPosition: new THREE.Vector3(snap.x, 0, snap.z),
          prevHeading: snap.h,
        };
      }
      const entity = this.entities[id];
      entity.snapshots.push({ time: now, ...snap });
      // Keep only recent snapshots
      while (entity.snapshots.length > 2 && entity.snapshots[0].time < renderTime - 0.5) {
        entity.snapshots.shift();
      }
    }

    // Interpolate each entity
    for (const id in this.entities) {
      const entity = this.entities[id];
      const snaps = entity.snapshots;
      if (snaps.length < 2) continue;

      // Find the two snapshots bracketing renderTime
      let s0 = null, s1 = null;
      for (let i = 0; i < snaps.length - 1; i++) {
        if (snaps[i].time <= renderTime && snaps[i + 1].time >= renderTime) {
          s0 = snaps[i];
          s1 = snaps[i + 1];
          break;
        }
      }

      if (!s0 || !s1) {
        // Dead reckoning: extrapolate from latest
        const latest = snaps[snaps.length - 1];
        if (latest && latest.alive) {
          const pos = entity.position;
          pos.x += Math.sin(entity.heading) * (latest.spd || 0) * dt;
          pos.z += Math.cos(entity.heading) * (latest.spd || 0) * dt;
        }
        continue;
      }

      const alpha = (renderTime - s0.time) / (s1.time - s0.time);
      const targetX = s0.x + (s1.x - s0.x) * alpha;
      const targetZ = s0.z + (s1.z - s0.z) * alpha;

      // Snap threshold check
      const dx = targetX - entity.position.x;
      const dz = targetZ - entity.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist > SNAP_THRESHOLD) {
        // Large correction: smooth lerp
        entity.position.x += dx * SNAP_LERP_SPEED;
        entity.position.z += dz * SNAP_LERP_SPEED;
      } else {
        // Small delta: direct interpolation
        entity.position.x = targetX;
        entity.position.z = targetZ;
      }

      // Heading interpolation
      let targetH = s0.h + (s1.h - s0.h) * alpha;
      // Handle angle wrapping
      let hDiff = targetH - entity.heading;
      while (hDiff > Math.PI) hDiff -= 2 * Math.PI;
      while (hDiff < -Math.PI) hDiff += 2 * Math.PI;
      entity.heading += hDiff * SNAP_LERP_SPEED;
    }
  }

  getEntity(id) {
    return this.entities[id];
  }

  removeEntity(id) {
    delete this.entities[id];
  }

  clear() {
    this.entities = {};
  }
}
