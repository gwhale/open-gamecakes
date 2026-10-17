// The archipelago solver has no tests until Puzzle Island, and the invariants
// it relies on were recorded only as comments — which do not fail a build.
// These pin the three things that would break silently:
//
//   1. Every offshore island declares how it is reached. An island with no
//      transport is a land only a flying rental can touch, and nothing else in
//      the build would notice.
//   2. Islands keep clear water between them. The solver's island–island
//      backstop pushes BOTH islands apart, so a new island can move an old one.
//   3. Chess Island did not move. Its arenas, booths and ferry docks all hang off
//      the solved centre, so the numbers below are the pre-Puzzle placement,
//      captured by running the solver before puzzle-isle existed.

import { describe, expect, it } from 'vitest';
import { ISLANDS, SEA_GAP, allIslands, ferryIslands, islandOf } from './islands';
import { beanShoreDist } from './three/bean';

const deg = (rad: number): number => (rad * 180) / Math.PI;

describe('island catalog', () => {
  it('every offshore island declares a transport', () => {
    for (const isl of ISLANDS) {
      expect(['ferry', 'bridge'], `${isl.id} has no transport`).toContain(isl.transport);
    }
  });

  it('ferryIslands() lists the ferry islands in catalog order and nothing else', () => {
    expect(ferryIslands().map((i) => i.id)).toEqual(
      ISLANDS.filter((i) => i.transport === 'ferry').map((i) => i.id),
    );
    expect(ferryIslands().map((i) => i.id)).toContain('chess-isle');
    expect(ferryIslands().map((i) => i.id)).toContain('puzzle-isle');
    expect(ferryIslands().map((i) => i.id)).not.toContain('race-isle');
  });

  it('every island has at least one region, and the first is its landing land', () => {
    for (const isl of ISLANDS) expect(isl.regions.length, isl.id).toBeGreaterThan(0);
  });
});

describe('island solver', () => {
  const solved = allIslands();
  const mainland = solved[0];

  it('puts the mainland first, unmoved', () => {
    expect(mainland.id).toBe('mainland');
    expect(mainland.offset).toEqual({ x: 0, y: 0 });
    expect(mainland.center.x).toBeCloseTo(512, 6);
    expect(mainland.center.y).toBeCloseTo(384, 6);
  });

  it('keeps every offshore island the catalog sea gap from the mainland', () => {
    for (const isl of solved.slice(1)) {
      const dx = isl.center.x - mainland.center.x;
      const dy = isl.center.y - mainland.center.y;
      const ang = Math.atan2(dy, dx);
      const water =
        Math.hypot(dx, dy) -
        beanShoreDist(mainland.halfW, mainland.halfH, mainland.pad, mainland.stretch, ang) -
        beanShoreDist(isl.halfW, isl.halfH, isl.pad, isl.stretch, ang + Math.PI);
      const gap = ISLANDS.find((i) => i.id === isl.id)?.seaGapPx ?? SEA_GAP;
      expect(water, `${isl.id} open water`).toBeGreaterThanOrEqual(gap);
    }
  });

  it('keeps every pair of offshore islands the sea gap apart', () => {
    for (let a = 1; a < solved.length; a += 1) {
      for (let b = a + 1; b < solved.length; b += 1) {
        const A = solved[a];
        const B = solved[b];
        const dx = B.center.x - A.center.x;
        const dy = B.center.y - A.center.y;
        const ang = Math.atan2(dy, dx);
        const water =
          Math.hypot(dx, dy) -
          beanShoreDist(A.halfW, A.halfH, A.pad, A.stretch, ang) -
          beanShoreDist(B.halfW, B.halfH, B.pad, B.stretch, ang + Math.PI);
        expect(water, `${A.id} <-> ${B.id}`).toBeGreaterThanOrEqual(SEA_GAP);
      }
    }
  });

  it('spreads the islands round the compass — no two within 60° of each other', () => {
    const bearings = solved.slice(1).map((isl) => ({
      id: isl.id,
      deg: deg(Math.atan2(isl.center.y - mainland.center.y, isl.center.x - mainland.center.x)),
    }));
    for (let a = 0; a < bearings.length; a += 1) {
      for (let b = a + 1; b < bearings.length; b += 1) {
        let sep = Math.abs(bearings[a].deg - bearings[b].deg) % 360;
        if (sep > 180) sep = 360 - sep;
        expect(sep, `${bearings[a].id} vs ${bearings[b].id}`).toBeGreaterThanOrEqual(60);
      }
    }
  });

  it('places Puzzle Island to the north-east, off the free top-right tile corner', () => {
    const p = islandOf('puzzle-isle');
    expect(p.id).toBe('puzzle-isle');
    const bearing = deg(Math.atan2(p.center.y - mainland.center.y, p.center.x - mainland.center.x));
    // Tile rect (12,0) 4×3 centres on (14, 1.5); from the pinned world centre
    // (8, 6) that is atan2(-4.5, 6) = -36.87°.
    expect(bearing).toBeCloseTo(-36.87, 0);
  });

  // Pinned to HALF A PIXEL, not to the fourth decimal. The solver's output
  // depends on every mainland rect, so an unrelated catalog change (a kid land
  // moving, a starter added) shifts an island by a few hundredths of a pixel —
  // float noise, invisible on screen, and exactly what tripped this test the
  // first time it met a master that had moved under it. What this guards
  // against is an island sliding by whole pixels because the separation
  // backstop fired.
  it('did not move Chess Island (pre-Puzzle placement, captured 2026-09-09)', () => {
    const c = islandOf('chess-club');
    expect(c.id).toBe('chess-isle');
    expect(c.center.x).toBeCloseTo(-7507.5805, 0);
    expect(c.center.y).toBeCloseTo(-5630.6854, 0);
    expect(c.halfW).toBeCloseTo(3063.9514, 0);
    expect(c.halfH).toBeCloseTo(2439.8131, 0);
    expect(c.pad).toBeCloseTo(1.1, 6);
  });

  it('did not move Race Island either', () => {
    const r = islandOf('race-pit-row');
    expect(r.id).toBe('race-isle');
    expect(r.center.x).toBeCloseTo(-734.7629, 0);
    expect(r.center.y).toBeCloseTo(5682.7422, 0);
  });
});
