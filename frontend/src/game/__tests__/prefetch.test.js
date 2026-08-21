// Parser tests for the module-graph prefetch fallback path: discovering the
// import graph by scanning served (URL-rewritten) module code for specifiers.
import { describe, it, expect } from 'vitest';
import { collectImportSpecifiers } from '../prefetch.js';

describe('collectImportSpecifiers', () => {
  it('collects namespace/named/side-effect imports and re-exports', () => {
    const code = [
      'import * as THREE from "/node_modules/.vite/deps/three.js?v=abc";',
      'import { Ship, LEVEL_CONFIG as LC } from "/src/game/ship.js";',
      'import "/src/game/config.js";',
      'export { weaponVisuals } from "/src/game/projectile.js";',
    ].join('\n');
    expect([...collectImportSpecifiers(code)]).toEqual([
      '/node_modules/.vite/deps/three.js?v=abc',
      '/src/game/ship.js',
      '/src/game/config.js',
      '/src/game/projectile.js',
    ]);
  });

  it('handles multiline named imports', () => {
    const code = 'import {\n  getTurretFireData,\n  turretCanAim,\n} from "/src/game/turret.js";';
    expect([...collectImportSpecifiers(code)]).toEqual(['/src/game/turret.js']);
  });

  it('collects dynamic imports', () => {
    const code = 'const mod = await import("/src/game/engine.js");';
    expect([...collectImportSpecifiers(code)]).toEqual(['/src/game/engine.js']);
  });

  it('ignores vite internals, remote URLs and non-module assets', () => {
    const code = [
      'import { createHotContext } from "/@vite/client";',
      'import "https://cdn.example.com/x.js";',
      'const bg = "/img/water.png";',
    ].join('\n');
    expect([...collectImportSpecifiers(code)]).toEqual([]);
  });

  it('does not treat ordinary strings containing import/from as specifiers', () => {
    const code = 'const msg = "export data from disk"; const url = "/api/x";';
    expect([...collectImportSpecifiers(code)]).toEqual([]);
  });
});
