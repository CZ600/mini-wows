import * as THREE from 'three';

export const ENEMY_SCALE = {
  1:  { hp: 100,  damage: 10, count: 10, size: 10, score: 3 },
  2:  { hp: 130,  damage: 12, count: 10, size: 10, score: 4 },
  3:  { hp: 170,  damage: 15, count: 12, size: 10, score: 5 },
  4:  { hp: 220,  damage: 18, count: 12, size: 11, score: 7 },
  5:  { hp: 280,  damage: 22, count: 14, size: 11, score: 9 },
  6:  { hp: 350,  damage: 26, count: 14, size: 12, score: 11 },
  7:  { hp: 430,  damage: 30, count: 16, size: 12, score: 14 },
  8:  { hp: 520,  damage: 35, count: 16, size: 13, score: 17 },
  9:  { hp: 630,  damage: 40, count: 18, size: 13, score: 21 },
  10: { hp: 750,  damage: 45, count: 20, size: 14, score: 25 },
};

const ENEMY_FIRE_COOLDOWN = 8;
const ENEMY_DETECT_RANGE = 600;
const ENEMY_FIRE_SPEED = 150;
const GRAVITY = 9.8;

export class EnemyManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.enemies = [];
    this.explosions = [];
  }

  spawn(playerPos, level = 1) {
    this.clear();
    const scale = ENEMY_SCALE[level] || ENEMY_SCALE[10];
    const size = scale.size;

    for (let i = 0; i < scale.count; i++) {
      let x, z, attempts = 0;
      do {
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 400;
        x = playerPos.x + Math.cos(angle) * dist;
        z = playerPos.z + Math.sin(angle) * dist;
        attempts++;
      } while (this.terrain && this.terrain.isLand(x, z) && attempts < 20);
      if (attempts >= 20) continue;

      const tooClose = this.enemies.some(e => {
        const dx = e.mesh.position.x - x;
        const dz = e.mesh.position.z - z;
        return Math.sqrt(dx * dx + dz * dz) < 100;
      });
      if (tooClose) continue;

      const group = new THREE.Group();

      const r = Math.max(0.5, 0.83 - level * 0.03);
      const g = Math.max(0.3, 0.53 - level * 0.02);
      const b = Math.max(0.3, 0.44 - level * 0.015);

      const base = new THREE.Mesh(
        new THREE.BoxGeometry(size, 2, size),
        new THREE.MeshPhongMaterial({ color: new THREE.Color(r * 0.8, g * 0.8, b * 0.8) })
      );
      base.position.y = 1;
      group.add(base);

      const body = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshPhongMaterial({ color: new THREE.Color(r, g, b) })
      );
      body.position.y = size / 2 + 2;
      group.add(body);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, size * 0.8, 8),
        new THREE.MeshPhongMaterial({ color: 0x553333 })
      );
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0, size * 0.6);
      body.add(barrel);

      const hpBarBg = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 0.8, 1),
        new THREE.MeshBasicMaterial({ color: 0x333333, depthTest: false, transparent: true })
      );
      hpBarBg.position.y = size + 8;
      hpBarBg.renderOrder = 999;
      group.add(hpBarBg);

      const hpBarFill = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 0.8, 0.8),
        new THREE.MeshBasicMaterial({ color: 0x44cc44, depthTest: false, transparent: true })
      );
      hpBarFill.position.y = size + 8;
      hpBarFill.renderOrder = 1000;
      group.add(hpBarFill);

      group.position.set(x, 0, z);
      this.scene.add(group);

      const enemySize = size;
      const enemyHp = scale.hp;
      const enemyDamage = scale.damage;
      const enemyScore = scale.score;

      this.enemies.push({
        mesh: group, body, barrel, hpBarBg, hpBarFill,
        hp: enemyHp, maxHp: enemyHp, alive: true,
        size: enemySize, damage: enemyDamage, scoreValue: enemyScore,
        cooldown: ENEMY_FIRE_COOLDOWN * (0.5 + Math.random() * 0.5),
        takeDamage(amount) {
          this.hp -= amount;
          if (this.hp < 0) this.hp = 0;
        },
      });
    }
  }

  update(dt, playerPos, projectileManager, camera) {
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.cooldown -= dt;

      const size = enemy.size;

      if (camera) {
        const hpPercent = enemy.hp / enemy.maxHp;
        enemy.hpBarFill.scale.x = Math.max(0.001, hpPercent);
        enemy.hpBarFill.position.x = -(1 - hpPercent) * size * 0.4;
        if (hpPercent > 0.6) enemy.hpBarFill.material.color.setHex(0x44cc44);
        else if (hpPercent > 0.3) enemy.hpBarFill.material.color.setHex(0xccaa22);
        else enemy.hpBarFill.material.color.setHex(0xff3333);
        enemy.hpBarBg.lookAt(camera.position);
        enemy.hpBarFill.lookAt(camera.position);
      }

      const dx = playerPos.x - enemy.mesh.position.x;
      const dz = playerPos.z - enemy.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < ENEMY_DETECT_RANGE) {
        const targetYaw = Math.atan2(dx, dz);
        enemy.body.rotation.y = targetYaw;

        const fireOriginY = enemy.mesh.position.y + size / 2 + 2;
        const horizDist = dist;
        const dy = playerPos.y - fireOriginY;

        let pitch;
        if (horizDist < 1) {
          pitch = Math.PI / 6;
        } else {
          const v2 = ENEMY_FIRE_SPEED * ENEMY_FIRE_SPEED;
          const v4 = v2 * v2;
          const disc = v4 - GRAVITY * (GRAVITY * horizDist * horizDist + 2 * dy * v2);
          if (disc < 0) {
            pitch = Math.PI / 6;
          } else {
            pitch = Math.atan((v2 - Math.sqrt(disc)) / (GRAVITY * horizDist));
          }
          pitch = Math.max(-20 * Math.PI / 180, Math.min(80 * Math.PI / 180, pitch));
        }

        enemy.barrel.rotation.x = Math.PI / 2 - pitch;

        if (enemy.cooldown <= 0) {
          const firePos = new THREE.Vector3(
            enemy.mesh.position.x,
            fireOriginY,
            enemy.mesh.position.z
          );
          const dirX = Math.sin(targetYaw) * Math.cos(pitch);
          const dirY = Math.sin(pitch);
          const dirZ = Math.cos(targetYaw) * Math.cos(pitch);
          projectileManager.fire(firePos, { x: dirX, y: dirY, z: dirZ }, enemy.damage, 'enemy');
          enemy.cooldown = ENEMY_FIRE_COOLDOWN;
        }
      }
    }

    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.lifetime += dt;
      const progress = e.lifetime / e.duration;
      if (progress >= 1) {
        this.scene.remove(e.mesh);
        e.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
        this.explosions.splice(i, 1);
        continue;
      }
      const s = 1 + progress * e.maxSize;
      e.mesh.scale.set(s, s, s);
      e.mesh.traverse(child => {
        if (child.material && child.material.opacity !== undefined) {
          child.material.opacity = 1 - progress;
        }
      });
    }
  }

  getAliveCount() {
    return this.enemies.filter(e => e.alive).length;
  }

  clear() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    for (const e of this.explosions) {
      this.scene.remove(e.mesh);
      e.mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    }
    this.enemies = [];
    this.explosions = [];
  }

  destroyEnemy(enemy) {
    const pos = enemy.mesh.position.clone();
    pos.y += enemy.size / 2;
    this._createExplosion(pos, enemy.size);
    enemy.alive = false;
    this.scene.remove(enemy.mesh);
  }

  _createExplosion(position, size = 10) {
    const group = new THREE.Group();

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 1 })
    );
    group.add(sphere);

    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 1 })
    );
    group.add(core);

    const count = 20;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) positions[i] = (Math.random() - 0.5) * 2;
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particles = new THREE.Points(pGeo,
      new THREE.PointsMaterial({ color: 0xffaa00, size: 2, transparent: true, opacity: 1 })
    );
    group.add(particles);

    const smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
    );
    group.add(smoke);

    group.position.copy(position);
    this.scene.add(group);
    this.explosions.push({ mesh: group, lifetime: 0, duration: 1.0, maxSize: size });
  }
}
