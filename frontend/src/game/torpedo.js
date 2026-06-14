import * as THREE from 'three';

export const TORPEDO_TIERS = {
  1: { speed: 22.2, range: 400, baseCooldown: 8 },
  2: { speed: 16.7, range: 600, baseCooldown: 8 },
  3: { speed: 12.5, range: 800, baseCooldown: 8 },
};

const RANGE_SCALE_PER_LEVEL = 1.05;
const SPEED_SCALE_PER_LEVEL = 1.03;
const COOLDOWN_SCALE_PER_LEVEL = 0.95;
const TORPEDO_Y = -0.5;
const TORPEDO_RADIUS = 0.2;
const TORPEDO_LENGTH = 2.5;
const HIT_RADIUS = 3;

export function getTorpedoStats(tier, level) {
  const base = TORPEDO_TIERS[tier];
  if (!base) return null;
  const levelsAbove4 = Math.max(0, level - 4);
  return {
    speed: base.speed * Math.pow(SPEED_SCALE_PER_LEVEL, levelsAbove4),
    range: base.range * Math.pow(RANGE_SCALE_PER_LEVEL, levelsAbove4),
    cooldown: base.baseCooldown * Math.pow(COOLDOWN_SCALE_PER_LEVEL, levelsAbove4),
  };
}

export function calcSpreadAngles(tubeCount, spread) {
  if (tubeCount === 0) return [];
  if (tubeCount === 1) return [0];
  const maxAngle = spread === 'wide' ? 15 * Math.PI / 180 : 5 * Math.PI / 180;
  const angles = [];
  for (let i = 0; i < tubeCount; i++) {
    angles.push(-maxAngle + (2 * maxAngle * i) / (tubeCount - 1));
  }
  return angles;
}

export class TorpedoManager {
  constructor(scene, terrain, audio) {
    this.scene = scene;
    this.terrain = terrain;
    this.audio = audio;
    this.torpedoes = [];
    this.fanArcs = [];
    this._aimFan = null;
  }

  fire(origin, heading, tier, level, tubeCount, spread, owner) {
    const stats = getTorpedoStats(tier, level);
    if (!stats) return;

    const angles = calcSpreadAngles(tubeCount, spread);

    for (const offsetAngle of angles) {
      const angle = heading + offsetAngle;

      const mesh = new THREE.Group();

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(TORPEDO_RADIUS, TORPEDO_RADIUS, TORPEDO_LENGTH, 8),
        new THREE.MeshPhongMaterial({ color: 0x444444 })
      );
      body.rotation.x = Math.PI / 2;
      mesh.add(body);

      const triShape = new THREE.Shape();
      triShape.moveTo(0, -1.5);
      triShape.lineTo(1.3, 1);
      triShape.lineTo(-1.3, 1);
      triShape.closePath();
      const markerColor = owner === 'player' ? 0x00ffff : 0xff0000;
      const marker = new THREE.Mesh(
        new THREE.ShapeGeometry(triShape),
        new THREE.MeshBasicMaterial({ color: markerColor, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
      );
      marker.position.y = 3.0;
      mesh.add(marker);

      const trailGeo = new THREE.BufferGeometry();
      const trailPositions = new Float32Array(60 * 3);
      trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
      const trailMat = new THREE.PointsMaterial({ color: 0x88ddff, size: 1.2, transparent: true, opacity: 0.85 });
      const trail = new THREE.Points(trailGeo, trailMat);
      this.scene.add(trail);

      mesh.position.set(origin.x, TORPEDO_Y, origin.z);
      mesh.rotation.y = angle;
      this.scene.add(mesh);

      this.torpedoes.push({
        mesh,
        trail,
        velocity: new THREE.Vector3(
          Math.sin(angle) * stats.speed,
          0,
          Math.cos(angle) * stats.speed
        ),
        speed: stats.speed,
        range: stats.range,
        distanceTraveled: 0,
        owner,
        tier,
        trailData: [],
      });
    }

    if (angles.length > 1) {
      const minA = angles[0];
      const maxA = angles[angles.length - 1];
      const fanRadius = stats.range * 0.25;
      const segs = 24;
      const fanShape = new THREE.Shape();
      fanShape.moveTo(0, 0);
      for (let i = 0; i <= segs; i++) {
        const a = heading + minA + (maxA - minA) * i / segs;
        fanShape.lineTo(Math.sin(a) * fanRadius, -Math.cos(a) * fanRadius);
      }
      fanShape.closePath();
      const fanMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(fanShape),
        new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
      );
      fanMesh.rotation.x = -Math.PI / 2;
      fanMesh.position.set(origin.x, 1.5, origin.z);
      this.scene.add(fanMesh);
      this.fanArcs.push({ mesh: fanMesh, life: 2.0 });
    }
  }

  update(dt, ship, enemies) {
    for (let i = this.torpedoes.length - 1; i >= 0; i--) {
      const t = this.torpedoes[i];

      t.distanceTraveled += t.speed * dt;
      t.mesh.position.addScaledVector(t.velocity, dt);

      this._updateTrail(t);

      let hit = false;

      if (t.owner === 'player') {
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const ep = enemy.mesh.position;
          const dx = t.mesh.position.x - ep.x;
          const dz = t.mesh.position.z - ep.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < HIT_RADIUS + enemy.size / 2) {
            enemy.takeDamage((50 + t.tier * 20) * 2);
            if (this.audio) this.audio.playTorpedoHit();
            hit = true;
            break;
          }
        }
      }

      if (!hit && t.owner === 'enemy' && ship && ship.alive) {
        const sp = ship.position;
        const dx = t.mesh.position.x - sp.x;
        const dz = t.mesh.position.z - sp.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const hitRadius = Math.max(ship.shipLength, ship.shipWidth) / 2;
        if (dist < hitRadius + HIT_RADIUS) {
          ship.takeDamage((30 + t.tier * 15) * 2);
          if (this.audio) this.audio.playTorpedoHit();
          hit = true;
        }
      }

      if (t.distanceTraveled >= t.range) hit = true;

      if (hit) {
        this.scene.remove(t.mesh);
        t.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.scene.remove(t.trail);
        t.trail.geometry.dispose();
        t.trail.material.dispose();
        this.torpedoes.splice(i, 1);
      }
    }

    for (let i = this.fanArcs.length - 1; i >= 0; i--) {
      const f = this.fanArcs[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mesh.material.dispose();
        this.fanArcs.splice(i, 1);
      } else {
        f.mesh.material.opacity = 0.35 * (f.life / 2.0);
      }
    }
  }

  updateAimFan(visible, origin, aimYaw, tubeCount, spread, range) {
    if (!visible) {
      if (this._aimFan) {
        this.scene.remove(this._aimFan);
        this._aimFan.geometry.dispose();
        this._aimFan.material.dispose();
        this._aimFan = null;
      }
      return;
    }

    const angles = calcSpreadAngles(tubeCount, spread);
    const minA = angles.length > 1 ? angles[0] : -2 * Math.PI / 180;
    const maxA = angles.length > 1 ? angles[angles.length - 1] : 2 * Math.PI / 180;
    const fanRadius = range * 0.25;
    const segs = 24;
    const fanShape = new THREE.Shape();
    fanShape.moveTo(0, 0);
    for (let i = 0; i <= segs; i++) {
      const a = aimYaw + minA + (maxA - minA) * i / segs;
      fanShape.lineTo(Math.sin(a) * fanRadius, -Math.cos(a) * fanRadius);
    }
    fanShape.closePath();

    if (this._aimFan) {
      this.scene.remove(this._aimFan);
      this._aimFan.geometry.dispose();
      this._aimFan.material.dispose();
    }
    this._aimFan = new THREE.Mesh(
      new THREE.ShapeGeometry(fanShape),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false })
    );
    this._aimFan.rotation.x = -Math.PI / 2;
    this._aimFan.position.set(origin.x, 1.5, origin.z);
    this.scene.add(this._aimFan);
  }

  _updateTrail(t) {
    const pos = t.mesh.position;
    t.trailData.push({ x: pos.x, y: 0.1, z: pos.z });
    if (t.trailData.length > 60) t.trailData.shift();

    const positions = t.trail.geometry.attributes.position.array;
    for (let j = 0; j < 60; j++) {
      if (j < t.trailData.length) {
        positions[j * 3] = t.trailData[j].x;
        positions[j * 3 + 1] = t.trailData[j].y;
        positions[j * 3 + 2] = t.trailData[j].z;
      } else {
        positions[j * 3 + 1] = -100;
      }
    }
    t.trail.geometry.attributes.position.needsUpdate = true;
  }

  destroy() {
    for (const t of this.torpedoes) {
      this.scene.remove(t.mesh);
      t.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this.scene.remove(t.trail);
      t.trail.geometry.dispose();
      t.trail.material.dispose();
    }
    this.torpedoes = [];
    if (this._aimFan) {
      this.scene.remove(this._aimFan);
      this._aimFan.geometry.dispose();
      this._aimFan.material.dispose();
      this._aimFan = null;
    }
    for (const f of this.fanArcs) {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mesh.material.dispose();
    }
    this.fanArcs = [];
  }
}
