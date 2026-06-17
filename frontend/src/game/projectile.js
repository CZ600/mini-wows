import * as THREE from 'three';

const GRAVITY = 9.8;
const INITIAL_SPEED = 200;
const MAX_LIFETIME = 10;
const DRAG = 0.06;
const TRAIL_LENGTH = 30;

export class ProjectileManager {
  constructor(scene, terrain, audio) {
    this.scene = scene;
    this.terrain = terrain;
    this.audio = audio;
    this.projectiles = [];
    this.explosions = [];
    this._splashes = [];
  }

  fire(origin, direction, damage, owner) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: owner === 'player' ? 0xffaa00 : 0xff6644 })
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
      const drag = 1.0 - DRAG * dt;
      p.velocity.multiplyScalar(drag);
      p.velocity.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      this._updateTrail(p);

      let hit = false;

      // Water — splash only, no explosion sound (a miss into the sea is silent).
      if (p.mesh.position.y <= 0) {
        this._createSplash(p.mesh.position.clone());
        hit = true;
      }

      // Terrain
      if (!hit && this.terrain) {
        const th = this.terrain.getHeightAt(p.mesh.position.x, p.mesh.position.z);
        if (th > 0 && p.mesh.position.y <= th) {
          this._explode(p.mesh.position.clone(), 0xff6622, 5);
          if (p.owner === 'player' && this.audio) this.audio.playExplosion();
          hit = true;
        }
      }

      // Hit player ship — OBB in the ship's local space.
      // The hull rotates with heading, so an axis-aligned box would shift the
      // hit area sideways as the ship turns. Transform the projectile into the
      // ship's local frame (inverse heading) then test the local AABB, where
      // local X = ship width and local Z = ship length. Vertical extent runs
      // from just below the keel up to the top of the shortest turret
      // (deck + 0.15 + turretSize * 0.9, the lowest non-superfiring housing),
      // so high-arc shells that clip a turret roof still count as a hit.
      if (!hit && p.owner === 'enemy' && ship && ship.alive) {
        const sp = ship.mesh.position;
        const relX = p.mesh.position.x - sp.x;
        const relZ = p.mesh.position.z - sp.z;
        const h = ship.heading;
        const cosH = Math.cos(h);
        const sinH = Math.sin(h);
        const localX =  relX * cosH + relZ * sinH;
        const localZ = -relX * sinH + relZ * cosH;
        const sh = ship.shipHeight || 2.5;
        const ts = ship.turretSize || 1.0;
        const turretTop = (sh + 1) + 0.15 + ts * 0.9;
        if (Math.abs(localX) < ship.shipWidth / 2 + 0.5 &&
            Math.abs(localZ) < ship.shipLength / 2 + 0.5 &&
            p.mesh.position.y >= sp.y - 1 &&
            p.mesh.position.y <= sp.y + turretTop + 0.5) {
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

          // Enemy ships use an OBB (rotated to heading) just like the player,
          // so the hit area tracks the hull regardless of which way it points.
          // Vertical box spans from just above the keel up to the bridge top
          // (deckhouse + forward bridge block), matching the tallest solid
          // superstructure but excluding the thin mast above it. Turrets keep
          // the axis-aligned size cube — their mesh is genuinely square and
          // they don't rotate.
          let hitEnemy;
          if (enemy.type === 'ship') {
            const relX = p.mesh.position.x - ep.x;
            const relZ = p.mesh.position.z - ep.z;
            const h = enemy.heading;
            const cosH = Math.cos(h);
            const sinH = Math.sin(h);
            const localX =  relX * cosH + relZ * sinH;
            const localZ = -relX * sinH + relZ * cosH;
            // Bridge top (excl. mast): deckY + deckhouseH + fwdBlockH
            //   = (height+1) + height*0.49 + height*0.784 = 1 + height*2.274
            const sh = enemy.shipHeight || 2.5;
            const bridgeTop = 1 + sh * 2.274;
            hitEnemy = Math.abs(localX) < (enemy.shipWidth  || enemy.size) / 2 + 0.5 &&
                       Math.abs(localZ) < (enemy.shipLength || enemy.size) / 2 + 0.5 &&
                       p.mesh.position.y >= ep.y - 1 &&
                       p.mesh.position.y <= ep.y + bridgeTop + 0.5;
          } else {
            const halfSize = enemy.size / 2;
            hitEnemy = Math.abs(p.mesh.position.x - ep.x) < halfSize + 1 &&
                       p.mesh.position.y >= ep.y - 1 &&
                       p.mesh.position.y <= ep.y + enemy.size + 3 &&
                       Math.abs(p.mesh.position.z - ep.z) < halfSize + 1;
          }

          if (hitEnemy) {
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

    // Water splashes
    for (let i = this._splashes.length - 1; i >= 0; i--) {
      const s = this._splashes[i];
      s.lifetime += dt;
      const progress = s.lifetime / s.duration;
      if (progress >= 1) {
        this.scene.remove(s.points);
        s.points.geometry.dispose();
        s.points.material.dispose();
        this._splashes.splice(i, 1);
        continue;
      }

      const posArr = s.points.geometry.attributes.position.array;
      const opaArr = s.points.geometry.attributes.aOpacity.array;
      const sizeArr = s.points.geometry.attributes.aSize.array;

      for (let j = 0; j < s.count; j++) {
        const v = s.velocities[j];
        v.y -= GRAVITY * dt;
        posArr[j * 3] += v.x * dt;
        posArr[j * 3 + 1] += v.y * dt;
        posArr[j * 3 + 2] += v.z * dt;

        if (posArr[j * 3 + 1] <= 0) {
          opaArr[j] = 0;
          sizeArr[j] = 0;
        } else {
          opaArr[j] = (1 - progress) * 0.9;
        }
      }

      s.points.geometry.attributes.position.needsUpdate = true;
      s.points.geometry.attributes.aOpacity.needsUpdate = true;
      s.points.geometry.attributes.aSize.needsUpdate = true;
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

  _createSplash(position) {
    const count = 28;
    const positions = new Float32Array(count * 3);
    const opacities = new Float32Array(count);
    const sizes = new Float32Array(count);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = Math.max(position.y, 0);
      positions[i * 3 + 2] = position.z;

      const isColumn = i < count * 0.3;
      const angle = Math.random() * Math.PI * 2;
      const radius = isColumn ? Math.random() * 1.0 : 1.5 + Math.random() * 3.5;
      const upSpeed = isColumn ? 12 + Math.random() * 6 : 6 + Math.random() * 6;

      velocities.push({
        x: Math.cos(angle) * radius,
        y: upSpeed,
        z: Math.sin(angle) * radius,
      });
      opacities[i] = 1;
      sizes[i] = isColumn ? 2.5 + Math.random() * 1.5 : 1.2 + Math.random() * 1.2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: `
        attribute float aOpacity;
        attribute float aSize;
        varying float vOpacity;
        void main() {
          vOpacity = aOpacity;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -mvPos.z);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying float vOpacity;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float a = (1.0 - smoothstep(0.35, 0.5, d)) * vOpacity;
          vec3 core = vec3(1.0, 1.0, 1.0);
          vec3 edge = vec3(0.55, 0.78, 0.92);
          vec3 color = mix(core, edge, smoothstep(0.0, 0.42, d));
          gl_FragColor = vec4(color, a);
        }
      `,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);

    this._splashes.push({
      points,
      velocities,
      lifetime: 0,
      duration: 1.2,
      count,
    });
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
    for (const s of this._splashes) {
      this.scene.remove(s.points);
      s.points.geometry.dispose();
      s.points.material.dispose();
    }
    this.projectiles = [];
    this.explosions = [];
    this._splashes = [];
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
