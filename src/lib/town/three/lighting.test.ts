import { describe, expect, it } from 'vitest';
import { SUN_DIR, TOWN_RIG, shadowHalfForDistance, snapToShadowTexel } from './lighting';
import { PRESETS, SHADOW_FILL_FLOOR, shadowFill } from './weather';

/** Where a world point falls on the shadow map's two axes, in texels. */
function texelCoords(p: { x: number; y: number; z: number }, texelU: number): [number, number] {
  const d = SUN_DIR;
  const rLen = Math.hypot(d.z, d.x);
  const r = { x: d.z / rLen, y: 0, z: -d.x / rLen };
  const u = { x: d.y * r.z - d.z * r.y, y: d.z * r.x - d.x * r.z, z: d.x * r.y - d.y * r.x };
  return [
    (p.x * r.x + p.y * r.y + p.z * r.z) / texelU,
    (p.x * u.x + p.y * u.y + p.z * u.z) / texelU,
  ];
}

describe('snapToShadowTexel', () => {
  const texelU = 80 / 2048;

  it('lands on whole shadow-map texels wherever the view is', () => {
    for (const [x, z] of [[0, 0], [12.34, -7.77], [-250.4, 133.3], [1000.01, 999.99]]) {
      const [a, b] = texelCoords(snapToShadowTexel(x, z, SUN_DIR, texelU), texelU);
      expect(Math.abs(a - Math.round(a))).toBeLessThan(1e-6);
      expect(Math.abs(b - Math.round(b))).toBeLessThan(1e-6);
    }
  });

  it('stays within a texel of the point it was given, as seen by the light', () => {
    const [a0, b0] = texelCoords({ x: 42.5, y: 0, z: -18.2 }, texelU);
    const [a1, b1] = texelCoords(snapToShadowTexel(42.5, -18.2, SUN_DIR, texelU), texelU);
    expect(Math.abs(a1 - a0)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(b1 - b0)).toBeLessThanOrEqual(0.5);
  });
});

describe('shadowHalfForDistance', () => {
  it('covers what the camera can see until it reaches the widest step', () => {
    for (const d of [0, 10, 40, 70, 100]) expect(shadowHalfForDistance(d, 40)).toBeGreaterThanOrEqual(d);
  });

  it('only ever returns a few widths, so it does not shimmer as the camera moves', () => {
    const widths = new Set<number>();
    for (let d = 0; d < 200; d += 0.5) widths.add(shadowHalfForDistance(d, 30));
    expect(widths.size).toBeLessThanOrEqual(4);
  });
});

describe('light in shadow', () => {
  it('never falls below the floor, in any weather', () => {
    expect(shadowFill({ amb: TOWN_RIG.ambient, hemi: TOWN_RIG.hemi, env: TOWN_RIG.env })).toBeGreaterThanOrEqual(SHADOW_FILL_FLOOR);
    for (const preset of Object.values(PRESETS)) {
      expect(shadowFill(preset)).toBeGreaterThanOrEqual(SHADOW_FILL_FLOOR);
    }
  });

  it('leaves the sun doing real work on a clear day, or shadows would not show', () => {
    expect(TOWN_RIG.sun / Math.PI).toBeGreaterThan(shadowFill({ amb: TOWN_RIG.ambient, hemi: TOWN_RIG.hemi, env: TOWN_RIG.env }));
  });
});
