import * as THREE from 'three';
import { applyHalfLambert } from './scene.js';
import { ASW_AIR, ASW_BLAST_RADIUS } from './config.js';

// Depth-charge (深水炸弹) aim UI + battleship air-strike plane.
//
// Surface ships (destroyer/cruiser) drop charges into a close band around the
// hull: the aim indicator draws an annular sector (fan) covering the allowed
// [fit.min, fit.range] band around the aim bearing — the depth-charge
// counterpart of the torpedo aim fan — plus rings marking the scatter disc and
// lethal blast radius at the clamped drop point.
//
// Battleships mark a rectangle on the water instead: the indicator draws that
// box (clamped to the air range) and a strike plane flies out from over the
// ship to scatter fused charges across it. In solo/team the plane is simulated
// locally by AswStrikePlane; in multiplayer the server flies it and the engine
// only mirrors the snapshot positions (makeAswPlaneMesh).

// Small twin-boat seaplane silhouette: fuselage + wing + tail, oriented along
// +Z (heading convention: 0 → +Z), like aircraft.js _makeAircraft but standalone.
export function makeAswPlaneMesh(color = 0x66ccff) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color });
  applyHalfLambert(mat);
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.2, 6), mat);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.12, 1), mat);
  g.add(wings);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.5), mat);
  tail.position.z = -1.4;
  g.add(tail);
  return g;
}

// Local (solo/team) simulation of a battleship ASW strike plane. Mirrors the
// server's game_state._update_asw_planes state machine: cruise to the marked
// rectangle, release one fused charge every ASW_AIR.interval at a random point
// inside it (emitted through the onDrop callback so the engine can spawn the
// actual depth-charge projectile), then fly on and despawn.
export class AswStrikePlane {
  constructor(scene, shipX, shipZ, target, tierCfg, owner = 'player') {
    this.scene = scene;
    this.owner = owner;
    this.x = shipX;
    this.z = shipZ;
    this.alt = ASW_AIR.altitude;
    this.target = { x: target.x, z: target.z };
    this.heading = Math.atan2(target.x - shipX, target.z - shipZ);
    this.speed = ASW_AIR.speed;
    this.state = 'cruise';           // cruise -> drop -> leave
    this.dropsLeft = tierCfg.salvo;
    this.dropTimer = 0;
    this.leaveTimer = ASW_AIR.leave;
    this.damage = tierCfg.damage;
    this.done = false;

    this.mesh = makeAswPlaneMesh(owner === 'player' ? 0x66ccff : 0xff4444);
    this.mesh.position.set(this.x, this.alt, this.z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  update(dt, onDrop) {
    if (this.done) return;
    if (this.state !== 'leave') {
      // Steer straight at the rectangle centre while approaching.
      const desired = Math.atan2(this.target.x - this.x, this.target.z - this.z);
      let diff = desired - this.heading;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const step = Math.max(-2.0 * dt, Math.min(2.0 * dt, diff));
      this.heading += step;
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.position.set(this.x, this.alt, this.z);
    this.mesh.rotation.y = this.heading;

    if (this.state === 'cruise') {
      const dx = this.target.x - this.x;
      const dz = this.target.z - this.z;
      if (dx * dx + dz * dz <= (ASW_AIR.box * 0.5) ** 2) this.state = 'drop';
    } else if (this.state === 'drop') {
      this.dropTimer -= dt;
      if (this.dropTimer <= 0 && this.dropsLeft > 0) {
        this.dropTimer = ASW_AIR.interval;
        this.dropsLeft -= 1;
        const ox = (Math.random() * 2 - 1) * ASW_AIR.box;
        const oz = (Math.random() * 2 - 1) * ASW_AIR.box;
        if (onDrop) onDrop(this.target.x + ox, this.target.z + oz, this.damage);
        if (this.dropsLeft <= 0) this.state = 'leave';
      }
    } else if (this.state === 'leave') {
      this.leaveTimer -= dt;
      if (this.leaveTimer <= 0) this.done = true;
    }
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.mesh.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
}

// Aim indicator for the depth-charge weapon mode. mode 'drop' (destroyer /
// cruiser) draws the close-range annular fan; mode 'air' (battleship) draws the
// target rectangle. Rebuilt per frame like the torpedo aim fan (cheap shapes).
//
// Shape-space convention shared with torpedo.js fans: with rotation.x = -π/2 a
// shape point (x, y) lands at world (x, 0, -y), so a world yaw `a` unit vector
// (sin a, cos a) maps to shape point (sin a, -cos a).
export class AswAimIndicator {
  constructor(scene) {
    this.scene = scene;
    this._fan = null;
    this._scatterRing = null;
    this._blastRing = null;
    this._box = null;
  }

  _disposeMesh(m) {
    this.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }

  _hideAll() {
    if (this._fan) { this._disposeMesh(this._fan); this._fan = null; }
    if (this._scatterRing) { this._disposeMesh(this._scatterRing); this._scatterRing = null; }
    if (this._blastRing) { this._disposeMesh(this._blastRing); this._blastRing = null; }
    if (this._box) { this._disposeMesh(this._box); this._box = null; }
  }

  // visible: whether to draw at all. fit/tierCfg: resolved class ASW fit and
  // tier row. shipPos: THREE.Vector3-like {x,z}. aim: world aim point {x,z}
  // (crosshair on the water). clamped: the band-clamped drop point {x,z}.
  update(visible, mode, shipPos, aim, clamped, fit, tierCfg) {
    if (!visible || !fit || !tierCfg) {
      this._hideAll();
      return;
    }

    const dx = aim.x - shipPos.x;
    const dz = aim.z - shipPos.z;
    const bearing = Math.sqrt(dx * dx + dz * dz) < 1 ? shipPos.heading ?? 0 : Math.atan2(dx, dz);

    if (mode === 'air') {
      // Battleship: target rectangle centred on the clamped aim point.
      this._hideAll();
      const half = ASW_AIR.box;
      const pts = [
        new THREE.Vector3(-half, 0, -half),
        new THREE.Vector3(half, 0, -half),
        new THREE.Vector3(half, 0, half),
        new THREE.Vector3(-half, 0, half),
      ];
      this._box = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.9 }),
      );
      this._box.position.set(clamped.x, 1.0, clamped.z);
      this.scene.add(this._box);
      return;
    }

    // Surface drop: annular sector over [fit.min, fit.range] around the aim
    // bearing. Half-angle ~18° reads like the torpedo fan's spread wedge.
    if (this._box) { this._disposeMesh(this._box); this._box = null; }
    const half = 18 * Math.PI / 180;
    const segs = 24;
    const inner = fit.min || 10;
    const outer = fit.range;
    const shape = new THREE.Shape();
    for (let i = 0; i <= segs; i++) {
      const a = bearing - half + (2 * half * i) / segs;
      const x = Math.sin(a) * outer;
      const y = -Math.cos(a) * outer;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    for (let i = segs; i >= 0; i--) {
      const a = bearing - half + (2 * half * i) / segs;
      shape.lineTo(Math.sin(a) * inner, -Math.cos(a) * inner);
    }
    shape.closePath();
    if (this._fan) this._disposeMesh(this._fan);
    this._fan = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    this._fan.rotation.x = -Math.PI / 2;
    this._fan.position.set(shipPos.x, 1.2, shipPos.z);
    this.scene.add(this._fan);

    // Drop point rings: bright scatter disc (charges land within `spread`) +
    // faint lethal-radius ring (the delayed blast reaches this far).
    this._ring('_scatterRing', clamped, tierCfg.spread, 0x99ddff, 0.85);
    this._ring('_blastRing', clamped, ASW_BLAST_RADIUS, 0x66ccff, 0.28);
  }

  _ring(slot, center, radius, color, opacity) {
    if (this[slot]) this._disposeMesh(this[slot]);
    const r = Math.max(radius, 2);
    this[slot] = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.92, r, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
    );
    this[slot].rotation.x = -Math.PI / 2;
    this[slot].position.set(center.x, 1.2, center.z);
    this.scene.add(this[slot]);
  }

  destroy() {
    this._hideAll();
  }
}
