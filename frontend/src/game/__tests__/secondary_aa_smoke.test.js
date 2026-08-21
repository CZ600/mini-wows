// Smoke test for the secondary-battery / AA mount arrays introduced with the
// side-battery + stern-AA rework. Runs headless (no DOM — textures degrade to
// plain colours) and checks the mounts the model exposes, their arcs, and that
// the aim/fire helpers accept them.
import { describe, it, expect } from 'vitest';
import { buildShipModel, buildTurretDefs } from '../ship_model.js';
import { getClassConfig } from '../ship.js';
import { aimTurretList, aimAaMountAtPoint, turretCanAim } from '../turret.js';

const CFGS = {
  cruiser: getClassConfig('cruiser', 10),
  battleship: getClassConfig('battleship', 10),
  destroyer: getClassConfig('destroyer', 10),
};

describe('secondary battery + AA mount modeling', () => {
  it('stretches destroyer/cruiser hulls (lengthMul) without widening them', () => {
    const base = CFGS.destroyer;
    // Lv10 base is length 53 * sizeMul 0.55 = 29 before the stretch.
    expect(base.length).toBeGreaterThan(34);
    // Width is untouched by lengthMul: 11 * 0.55 = 6.05.
    expect(Math.abs(CFGS.destroyer.width - 6.1)).toBeLessThan(0.11);
    const ca = CFGS.cruiser; // 53 * 0.85 * 1.22 ≈ 55
    expect(ca.length).toBeGreaterThan(52);
  });

  it('equips cruisers/battleships with side secondaries, destroyers with none', () => {
    const ca = buildShipModel(CFGS.cruiser, 'cruiser');
    expect(ca.secondaryTurrets).toHaveLength(4);
    for (const t of ca.secondaryTurrets) {
      // Side turrets face outboard (±90°) with a ±120° arc.
      expect(Math.abs(Math.abs(t.yawCenter) - Math.PI / 2)).toBeLessThan(0.01);
      expect(t.yawRange).toBeCloseTo(2.1, 5);
      expect(t.group).toBeTruthy();
      expect(t.barrelPivot).toBeTruthy();
      expect(t.barrels.length).toBe(2);
    }

    const bb = buildShipModel(CFGS.battleship, 'battleship');
    expect(bb.secondaryTurrets).toHaveLength(6);

    const dd = buildShipModel(CFGS.destroyer, 'destroyer');
    expect(dd.secondaryTurrets).toHaveLength(0);
  });

  it('builds full 360° AA mounts — stern battery on cruiser/BB, beams on DD', () => {
    const ca = buildShipModel(CFGS.cruiser, 'cruiser');
    expect(ca.aaMounts).toHaveLength(8);
    const bb = buildShipModel(CFGS.battleship, 'battleship');
    expect(bb.aaMounts).toHaveLength(10);
    const dd = buildShipModel(CFGS.destroyer, 'destroyer');
    expect(dd.aaMounts).toHaveLength(4);

    // Cruiser AA is a stern battery: every mount sits aft of the bridge.
    for (const m of ca.aaMounts) {
      expect(m.group.position.z).toBeLessThan(0);
      expect(m.yawRange).toBeCloseTo(Math.PI, 5);
    }
  });

  it('aimTurretList + turretCanAim drive secondary turrets like main ones', () => {
    const ca = buildShipModel(CFGS.cruiser, 'cruiser');
    const fakeShipMesh = { position: { x: 0, y: 0, z: 0 } };
    // Aim far out to starboard: the starboard (yawCenter +90°) battery should
    // train onto it, port mounts clamp at their arc edge.
    const target = { x: 400, y: 0, z: 50 };
    for (let i = 0; i < 40; i++) {
      aimTurretList(ca.secondaryTurrets, fakeShipMesh, 0, target, 0.05, 320, 0.09, Math.PI * 1.5);
    }
    const starboard = ca.secondaryTurrets.filter(t => t.yawCenter > 0);
    for (const t of starboard) {
      expect(turretCanAim(t, Math.PI / 2)).toBe(true);
      // currentYaw converged near the target bearing (small yaw offset for
      // convergence from the mount's lateral position).
      expect(Math.abs(t.currentYaw - Math.PI / 2)).toBeLessThan(0.2);
    }
  });

  it('aimAaMountAtPoint slews onto an overhead-ish target and reports on-target', () => {
    const dd = buildShipModel(CFGS.destroyer, 'destroyer');
    const mount = dd.aaMounts[0];
    const target = { x: 100, y: 60, z: 100 };
    let onTarget = false;
    for (let i = 0; i < 60 && !onTarget; i++) {
      onTarget = aimAaMountAtPoint(mount, 0, target, 0.05);
    }
    expect(onTarget).toBe(true);
    expect(mount.barrelPivot.rotation.x).toBeLessThan(0); // barrels raised
  });

  it('main turret defs still match the bridge share for stretched hulls', () => {
    const dd = buildShipModel(CFGS.destroyer, 'destroyer');
    const defs = buildTurretDefs(CFGS.destroyer, 'destroyer');
    expect(dd.turrets.length).toBe(defs.length);
  });
});
