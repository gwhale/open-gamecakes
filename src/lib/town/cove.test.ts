// The cove is a dent in the island field, and a dent is exactly the kind of
// thing that gets tuned away by someone who does not know what it cost.
//
// THE ONE THAT MATTERS is 'actually READS as a bay'. The first cove shipped
// with a deep bite (609px) that stayed properly local, passed every assertion
// here, and was INVISIBLE on screen -- because none of those assertions said
// anything about shape, and the mainland's own radius falls ~2400px across the
// arc the cove sits on. A bite riding down a slope steeper than itself is a
// faster curve, not a hollow.
//
// WIDTH IS WHAT MAKES DEPTH EXPENSIVE, not depth itself. At a 0.30 half-width
// the bite reached the cove region's own rect corners, so autoFitPad grew the
// island to keep them inland: depth 0.20 took the pad 1.300 -> 1.400, pushed
// the waterline FURTHER out than depth 0.14 managed, and dragged both offshore
// islands ~270px. At a 0.10 half-width the bite misses those corners entirely
// and depth 0.26 costs nothing at all. Narrow first, then deep.
//
// The headlands are free in every configuration: pushing a shoreline OUT can
// never put land in the sea, so autoFitPad has nothing to re-fit.

import { describe, expect, it } from 'vitest';
import { allIslands } from './islands';
import { beanNd, beanShoreDist } from './three/bean';
import { findRegion, REGIONS } from './regions';
import { spreadCenterPx, regionRectHalf } from './three/layout-core';

const mainland = () => allIslands().find((i) => i.id === 'mainland')!;

describe('Caramel Cove', () => {
  it('carves a bay into the mainland', () => {
    const m = mainland();
    expect(m.cove, 'the mainland lost its cove').toBeTruthy();
    const carved = beanShoreDist(m.halfW, m.halfH, m.pad, m.stretch, m.cove!.ang, m.cove);
    const round = beanShoreDist(m.halfW, m.halfH, m.pad, m.stretch, m.cove!.ang, undefined);
    // A bay you cannot see is not a bay. The shape test above is the one that
    // matters; this just pins that the inward bite is still substantial.
    expect(round - carved).toBeGreaterThan(300);
  });

  it('actually READS as a bay: a hollow with a headland on each side', () => {
    // THE TEST THAT WAS MISSING, and the reason the first cove shipped
    // invisible. The old assertions proved the bite was deep (609px) and stayed
    // local. Both were true. Neither said anything about SHAPE -- and the
    // mainland's own radius falls from ~5500px to ~3100px across that arc, so a
    // 609px bite riding down a slope steeper than itself produced no local
    // minimum at all. It was a slightly faster curve, not a bay.
    //
    // A cove is water with LAND ON BOTH SIDES. That is a local minimum in the
    // shoreline radius with a higher point either side of it, and it is the only
    // thing here that corresponds to what a kid sees.
    const m = mainland();
    const c = m.cove!;
    const r = (a: number) =>
      beanShoreDist(m.halfW, m.halfH, m.pad, m.stretch, a, c);

    // The head of the bay, searched near the cove's bearing.
    let headAng = c.ang;
    let headR = Infinity;
    for (let t = -3 * c.halfWidth; t <= 3 * c.halfWidth; t += 0.005) {
      const v = r(c.ang + t);
      if (v < headR) { headR = v; headAng = c.ang + t; }
    }
    // It must sit in the mouth, not have slid off down the coast.
    expect(Math.abs(headAng - c.ang)).toBeLessThan(2 * c.halfWidth);

    // A headland on each side, standing clear of the water at the bay head.
    let left = -Infinity;
    let right = -Infinity;
    for (let t = 0.005; t <= 4 * c.halfWidth; t += 0.005) {
      left = Math.max(left, r(headAng - t));
      right = Math.max(right, r(headAng + t));
    }
    // 600px of relief on both sides. Enough to be a landform rather than a
    // wobble -- the first attempt managed 88px on one side and none on the other.
    expect(left - headR, 'no headland on the near side').toBeGreaterThan(600);
    expect(right - headR, 'no headland on the far side').toBeGreaterThan(600);
  });

  it('bites locally — the far coast is untouched', () => {
    // A cosine lobe would quietly shave the whole opposite shoreline. The
    // Gaussian is what keeps this a cove instead of a squashed island.
    const m = mainland();
    const opposite = m.cove!.ang + Math.PI;
    const carved = beanShoreDist(m.halfW, m.halfH, m.pad, m.stretch, opposite, m.cove);
    const round = beanShoreDist(m.halfW, m.halfH, m.pad, m.stretch, opposite, undefined);
    expect(Math.abs(round - carved)).toBeLessThan(1);
  });

  it('leaves every mainland region on dry land', () => {
    // nd >= 1 is open sea. A region corner out there is a booth in the water,
    // and nothing else in the build would complain about it.
    const m = mainland();
    for (const slug of m.regions) {
      const r = findRegion(slug);
      if (!r) continue;
      const c = spreadCenterPx(slug);
      const h = regionRectHalf(r);
      for (const dx of [-h.hw, h.hw]) {
        for (const dy of [-h.hh, h.hh]) {
          const nd = beanNd(
            m.center.x, m.center.y, m.halfW, m.halfH, m.pad, m.stretch,
            c.x + dx, c.y + dy, m.cove,
          );
          expect(nd, `${slug} has a corner at nd ${nd.toFixed(3)}`).toBeLessThan(1);
        }
      }
    }
  });

  it('costs nothing: the pad is unchanged and no island moved', () => {
    // These are the values with the cove OFF, recorded when it went in. If a
    // tuning pass moves them, the cove stopped being free and the whole
    // archipelago shifted under the kids — which is invisible in a diff.
    const m = mainland();
    expect(m.pad).toBeCloseTo(1.3, 5);
    expect(Math.round(m.halfW)).toBe(3328);
    expect(Math.round(m.halfH)).toBe(2528);

    const byId = new Map(allIslands().map((i) => [i.id, i]));
    const chess = byId.get('chess-isle')!;
    const race = byId.get('race-isle')!;
    expect(Math.round(chess.center.x)).toBe(-7508);
    expect(Math.round(chess.center.y)).toBe(-5631);
    expect(Math.round(race.center.x)).toBe(-735);
    expect(Math.round(race.center.y)).toBe(5683);
  });

  it('gives the harbour a double-wide footprint that stays in the old bbox', () => {
    const cove = findRegion('caramel-cove')!;
    expect(cove.size.w).toBe(8);
    // In-bounds on a 16-tile world. (The jetty is no longer anchored to this
    // edge — it stands on the bay's axis; see sub-dock.test.ts.)
    expect(cove.tile.x + cove.size.w).toBe(16);
    // And it must not collide with its neighbour on the same row.
    const ts = findRegion('town-square')!;
    expect(cove.tile.x).toBeGreaterThanOrEqual(ts.tile.x + ts.size.w);
  });

  it('does not give any other island a cove', () => {
    // The carve is threaded through every bean call by riding on the island.
    // If a second island ever gets one, this is the reminder that the solver's
    // spacing maths now has two dents to reason about.
    const withCove = allIslands().filter((i) => i.cove);
    expect(withCove.map((i) => i.id)).toEqual(['mainland']);
  });

  it('keeps the cove region in the catalog the carve is derived from', () => {
    // mainlandCove() returns undefined if the slug ever disappears, which would
    // silently un-carve the island rather than fail.
    expect(REGIONS.some((r) => r.slug === 'caramel-cove')).toBe(true);
  });
});
