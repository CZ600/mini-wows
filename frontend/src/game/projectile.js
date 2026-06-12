import * as THREE from 'three';

const GRAVITY = 9.8;
const INITIAL_SPEED = 200;
const MAX_LIFETIME = 10;
const TRAIL_LENGTH = 30;

export class ProjectileManager {
  constructor(scene, terrain, audio) {
    this.scene = scene;
    this.terrain = terrain;
    this.audio = audio;
    this.projectiles = [];
    this.explosions = [];
  }

  fire(origin, direction, damage, owner) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x333333 })
    );
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const trailGeo = new THREE.BufferGeometry();
    const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = new THREE.PointsMaterial({
      color: owner === 'player' ? 0xffaa44 : 0xff6644,
      size: 0.8,
      transparent: true,
      opacity: 0.7,
    });
    const trail = new THREE.Points(trailGeo, trailMat);
    this.scene.add(trail);

    this.projectiles.push({
      mesh,
      trail,
      trailData: [],
      velocity: new THREE.Vector3(
        direction.x * INITIAL_SPEED,
        direction.y * INITIAL_SPEED,
        direction.z * INITIAL_SPEED
      ),
      damage,
      owner,
      lifetime: 0,
    });
  }

  update(dt, ship, enemies) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime += dt;
      p.velocity.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      this._updateTrail(p);

      let hit = false;

      // Water
      if (p.mesh.position.y <= 0) {
        this._explode(p.mesh.position.clone(), 0x4488cc, 3);
        hit = true;
      }

      // Terrain
      if (!hit && this.terrain) {
        const th = this.terrain.getHeightAt(p.mesh.position.x, p.mesh.position.z);
        if (th > 0 && p.mesh.position.y <= th) {
          this._explode(p.mesh.position.clone(), 0xff6622, 5);
          if (this.audio) this.audio.playExplosion();
          hit = true;
        }
      }

      // Hit player ship
      if (!hit && p.owner === 'enemy' && ship && ship.alive) {
        const sp = ship.mesh.position;
        const dx = Math.abs(p.mesh.position.x - sp.x);
        const dy = Math.abs(p.mesh.position.y - sp.y);
        const dz = Math.abs(p.mesh.position.z - sp.z);
        if (dx < ship.shipWidth / 2 + 0.5 && dy < 2.5 && dz < ship.shipLength / 2 + 0.5) {
          ship.takeDamage(p.damage);
          this._explode(p.mesh.position.clone(), 0xff4400, 5);
          if (this.audio) this.audio.playExplosion();
          hit = true;
        }
      }

      // Hit enemy
      if (!hit && p.owner === 'player') {
        for (const enemy of enemies) {
          if (!enemy.alive) continue;
          const ep = enemy.mesh.position;
          const halfSize = enemy.size / 2;
          if (Math.abs(p.mesh.position.x - ep.x) < halfSize + 1 &&
              p.mesh.position.y >= ep.y - 1 && p.mesh.position.y <= ep.y + enemy.size + 3 &&
              Math.abs(p.mesh.position.z - ep.z) < halfSize + 1) {
            enemy.takeDamage(p.damage);
            this._explode(p.mesh.position.clone(), 0xff4400, 6);
            if (this.audio) this.audio.playExplosion();
            hit = true;
            break;
          }
        }
      }

      if (!hit && p.lifetime > MAX_LIFETIME) hit = true;

      if (hit) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.scene.remove(p.trail);
        p.trail.geometry.dispose();
        p.trail.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // Explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.lifetime += dt;
      const progress = e.lifetime / e.duration;
      if (progress >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.explosions.splice(i, 1);
        continue;
      }
      const scale = 1 + progress * e.maxSize;
      e.mesh.scale.set(scale, scale, scale);
      if (e.mesh.material) e.mesh.material.opacity = 1 - progress;
    }
  }

  _explode(position, color, maxSize) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.explosions.push({ mesh, lifetime: 0, duration: 0.5, maxSize });

    // Spark particles
    const count = 12;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 2;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(pGeo,
      new THREE.PointsMaterial({ color: 0xffaa00, size: 1.5, transparent: true })
    );
    particles.position.copy(position);
    this.scene.add(particles);
    this.explosions.push({ mesh: particles, lifetime: 0, duration: 0.6, maxSize: maxSize * 0.8 });
  }

  destroy() {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      this.scene.remove(p.trail);
      p.trail.geometry.dispose();
      p.trail.material.dispose();
    }
    for (const e of this.explosions) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); }
    this.projectiles = [];
    this.explosions = [];
  }

  _updateTrail(p) {
    const pos = p.mesh.position;
    p.trailData.push({ x: pos.x, y: pos.y, z: pos.z });
    if (p.trailData.length > TRAIL_LENGTH) p.trailData.shift();

    const positions = p.trail.geometry.attributes.position.array;
    for (let j = 0; j < TRAIL_LENGTH; j++) {
      if (j < p.trailData.length) {
        const t = p.trailData[j];
        positions[j * 3] = t.x;
        positions[j * 3 + 1] = t.y;
        positions[j * 3 + 2] = t.z;
      } else {
        positions[j * 3 + 1] = -100;
      }
    }
    p.trail.geometry.attributes.position.needsUpdate = true;
  }
}
