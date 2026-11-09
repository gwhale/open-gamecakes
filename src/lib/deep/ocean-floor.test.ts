// The seabed is generated, not authored, so nothing about its SHAPE is visible
// by reading it. These are the invariants the geography comment in
// ocean-floor.ts promises — if one breaks, the world silently stopped being the
// place the design assumes, and the first symptom would be a kid driving into
// sand where the canyon was supposed to be.

import { describe, expect, it } from 'vitest';
import { oceanFloorM, bandAtDepth, constrainToOcean } from './ocean-floor';
import { DEPTH_LIMIT_M, GLOW_DEPTH_M, DOMAIN_RADIUS_M, GLOW_SPOTS } from './types';

/** Sample the whole bowl on a coarse grid — cheap enough to do per assertion. */
function* sweep(step = 40): Generator<[number, number]> {
  for (let z = -DOMAIN_RADIUS_M; z <= DOMAIN_RADIUS_M; z += step) {
    for (let x = -DOMAIN_RADIUS_M; x <= DOMAIN_RADIUS_M; x += step) {
      if (Math.hypot(x, z) <= DOMAIN_RADIUS_M) yield [x, z];
    }
  }
}

describe('oceanFloorM', () => {
  it('is deterministic — two iPads must generate the same canyon', () => {
    for (const [x, z] of sweep(150)) {
      expect(oceanFloorM(x, z)).toBe(oceanFloorM(x, z));
    }
  });

  it('never puts seabed above the sea surface', () => {
    for (const [x, z] of sweep()) {
      expect(oceanFloorM(x, z)).toBeLessThan(0);
    }
  });

  it('gets deeper as you drive seaward (+z)', () => {
    // Averaged across x, because individual columns ride dunes and escarpments.
    const meanDepthAt = (z: number) => {
      let total = 0;
      let n = 0;
      for (let x = -300; x <= 300; x += 20) {
        total += -oceanFloorM(x, z);
        n++;
      }
      return total / n;
    };
    const reef = meanDepthAt(-400);
    const drop = meanDepthAt(0);
    const canyon = meanDepthAt(400);
    expect(reef).toBeLessThan(drop);
    expect(drop).toBeLessThan(canyon);
    // And the reef really is the shallow, bright band the biome claims.
    expect(reef).toBeLessThan(100);
  });

  it('leaves the sub room to reach its depth limit without landing', () => {
    // If nowhere is deeper than the limit, "DEPTH LIMIT REACHED" can never fire
    // — the kid just runs aground first and the whole hook is unreachable.
    const deepest = Math.max(...[...sweep()].map(([x, z]) => -oceanFloorM(x, z)));
    expect(deepest).toBeGreaterThan(DEPTH_LIMIT_M);
  });

  it('keeps the glow out of reach by a MARGIN, not by a hair', () => {
    // The hook is that you can SEE it and cannot REACH it, and the thing that
    // delivers it is the SIZE of the gap, not the inequality.
    //
    // This test used to assert only GLOW_DEPTH_M > DEPTH_LIMIT_M. That is true
    // at one metre. Raising the limit to 370 once left the glow 2m below it --
    // close enough for the sub to sit nose-to-nose with the one thing it is
    // never allowed to have -- and this file stayed green through it.
    const gap = GLOW_DEPTH_M - DEPTH_LIMIT_M;
    expect(gap, `the glow is only ${gap}m below the limit`).toBeGreaterThanOrEqual(35);
  });

  it('puts every glow in open water, not inside the seabed', () => {
    // Checking the canyon's DEEPEST point told us nothing about the four places
    // the glows actually are: the floor rolls, and a spot on a rise can easily
    // sit above a glow the deepest point clears comfortably. So ask at their
    // own coordinates, which is why GLOW_SPOTS lives in types.ts.
    for (const [x, z] of GLOW_SPOTS) {
      const bed = -oceanFloorM(x, z);
      expect(
        bed,
        `the glow at ${x},${z} is ${(GLOW_DEPTH_M - bed).toFixed(0)}m inside the seabed`,
      ).toBeGreaterThan(GLOW_DEPTH_M + 8);
    }
  });

  it('is continuous — no cliffs the terrain mesh would tear on', () => {
    // Analytic normals sample +-0.4m; a discontinuity there renders as a seam
    // and, worse, as a collision clamp that teleports the sub.
    for (const [x, z] of sweep(37)) {
      const here = oceanFloorM(x, z);
      expect(Math.abs(oceanFloorM(x + 0.4, z) - here)).toBeLessThan(2);
      expect(Math.abs(oceanFloorM(x, z + 0.4) - here)).toBeLessThan(2);
    }
  });
});

describe('bandAtDepth', () => {
  it('names the three bands the biome, scenery and radio all read', () => {
    expect(bandAtDepth(0)).toBe('reef');
    expect(bandAtDepth(99)).toBe('reef');
    expect(bandAtDepth(100)).toBe('drop');
    expect(bandAtDepth(299)).toBe('drop');
    expect(bandAtDepth(300)).toBe('canyon');
    expect(bandAtDepth(DEPTH_LIMIT_M)).toBe('canyon');
  });
});

describe('constrainToOcean', () => {
  it('turns the sub back at the edge of the bowl', () => {
    const p = constrainToOcean({ x: 5000, y: -50, z: 0 });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(DOMAIN_RADIUS_M, 5);
  });

  it('keeps the hull above the seabed, and under the surface', () => {
    const floor = oceanFloorM(0, -400);
    const sunk = constrainToOcean({ x: 0, y: floor - 100, z: -400 }, 3);
    expect(sunk.y).toBeCloseTo(floor + 3, 5);

    const flying = constrainToOcean({ x: 0, y: 500, z: -400 });
    expect(flying.y).toBeLessThan(0);
  });
});
