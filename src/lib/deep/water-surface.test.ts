// A shader cannot be unit-tested, and this file does not pretend otherwise —
// the look was checked by eye in the harness (`npm run deep-harness`, then
// water.html). What IS testable is the small amount of logic around it, and in
// particular the rule that broke surfacing in the first place.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createWaterSurface, surfaceLook } from './water-surface';
import { DEPTH_LIMIT_M } from './types';

describe('surfaceLook', () => {
  it('is at its most alive right at the surface', () => {
    const top = surfaceLook(0);
    expect(top.nearness).toBe(1);
    expect(top.opacity).toBeGreaterThan(0.3);
    expect(top.visible).toBe(true);
  });

  it('fades the ceiling out rather than hanging it over the canyon', () => {
    // A lid over the canyon is the reason this fades at all.
    expect(surfaceLook(DEPTH_LIMIT_M).opacity).toBe(0);
    expect(surfaceLook(DEPTH_LIMIT_M).visible).toBe(false);
    expect(surfaceLook(40).opacity).toBeLessThan(surfaceLook(10).opacity);
  });

  it('keeps the sea drawn while the kid is at the top, whatever the fade says', () => {
    // THE BUG THIS EXISTS FOR. Surfacing used to show nothing at all, and any
    // future "optimisation" that hides the plane near zero depth brings it back.
    for (const d of [0, 0.5, 1, 1.9]) {
      expect(surfaceLook(d).visible, `depth ${d}m`).toBe(true);
    }
  });

  it('never returns a nearness outside 0..1', () => {
    for (const d of [-5, 0, 22, 45, 90, 500]) {
      const n = surfaceLook(d).nearness;
      expect(n, `depth ${d}m`).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe('the water surface mesh', () => {
  it('draws BOTH faces, because the camera goes above the waterline', () => {
    // The chase camera sits CAM_HEIGHT_M above a sub that may rise to y = -1.5,
    // so it is above y = 0 whenever the kid surfaces. With BackSide — which is
    // what shipped — the sea is culled and surfacing shows an empty blue room.
    const water = createWaterSurface(THREE);
    expect((water.material as THREE.ShaderMaterial).side).toBe(THREE.DoubleSide);
  });

  it('does not write depth, so it cannot occlude the sub beneath it', () => {
    const water = createWaterSurface(THREE);
    expect((water.material as THREE.ShaderMaterial).depthWrite).toBe(false);
    expect((water.material as THREE.ShaderMaterial).transparent).toBe(true);
  });

  it('takes the scene fog, or it would glow through the murk', () => {
    // Everything else in the deep is swallowed by fog on purpose. A surface that
    // ignored it would stay bright at 100m and read as a hole in the ocean.
    const water = createWaterSurface(THREE);
    const mat = water.material as THREE.ShaderMaterial;
    expect(mat.fog).toBe(true);
    expect(mat.uniforms.fogColor).toBeDefined();
    expect(mat.uniforms.fogDensity).toBeDefined();
  });

  it('follows the submarine and stays just under the waterline', () => {
    const water = createWaterSurface(THREE);
    water.update(3, 12, new THREE.Color(0x88ccee), 120, -300);
    expect(water.mesh.position.x).toBe(120);
    expect(water.mesh.position.z).toBe(-300);
    expect(water.mesh.position.y).toBeLessThan(0);
    expect(water.mesh.visible).toBe(true);
  });

  it('hides itself in the canyon', () => {
    const water = createWaterSurface(THREE);
    water.update(3, DEPTH_LIMIT_M, new THREE.Color(0x102040), 0, 400);
    expect(water.mesh.visible).toBe(false);
  });
});
