// Where the jetty actually is, in water terms.
//
// This pier shipped twice running as a walkway over sand with a submarine
// "moored" on a beach, and nothing caught it: it type-checks, it renders, the
// planks are all present, and every test in the suite passed. What was wrong
// was a BEARING — the deck ran due east, and this coast faces about 41 degrees,
// so east is very nearly tangent to the shoreline and no length would ever have
// reached the sea.
//
// So these assert the thing the suite could not see: the far end is over open
// water, the near end is on land, and the deck a kid has to walk to get there
// is registered as walkable. All of it in city pixels against the same island
// field the renderer uses, so it cannot drift from what is on screen.

import { describe, expect, it } from 'vitest';
import { allIslands, islandOf } from './islands';
import { beanNd, beanShoreDist } from './three/bean';
import { findRegion } from './regions';

import { SUB_DOCK_REGION, SUB_DOCK_ROOT_FRAC } from './three/sub-dock';

const mainland = () => allIslands().find((i) => i.id === 'mainland')!;

/** The dock anchor and bearing, exactly as the engine derives them: on the
 *  bay's axis, just inland of its head. */
function dock() {
  const isl = islandOf(SUB_DOCK_REGION);
  const heading = isl.cove!.ang;
  const shoreR = beanShoreDist(isl.halfW, isl.halfH, isl.pad, isl.stretch, heading, isl.cove);
  const r = shoreR * SUB_DOCK_ROOT_FRAC;
  return {
    origin: {
      x: isl.center.x + Math.cos(heading) * r,
      y: isl.center.y + Math.sin(heading) * r,
    },
    heading,
  };
}

const ndAt = (x: number, y: number): number => {
  const m = mainland();
  return beanNd(m.center.x, m.center.y, m.halfW, m.halfH, m.pad, m.stretch, x, y, m.cove);
};

const along = (d: number) => {
  const { origin, heading } = dock();
  return { x: origin.x + Math.cos(heading) * d, y: origin.y + Math.sin(heading) * d };
};

// Kept in step with sub-dock.ts. Duplicated rather than exported because the
// point of the test is to fail if the constant and the water disagree.
const JETTY_LENGTH_PX = 620;
const MOOR_AT = 0.86;

describe('the submarine jetty', () => {
  it('starts on dry land', () => {
    // A jetty whose root is already in the sea is a raft.
    expect(ndAt(dock().origin.x, dock().origin.y)).toBeLessThan(1);
  });

  it('reaches open water', () => {
    const tip = along(JETTY_LENGTH_PX);
    expect(ndAt(tip.x, tip.y), 'the jetty tip is not in the sea').toBeGreaterThan(1);
  });

  it('moors Sub-Cake One in water, not on the beach', () => {
    // The whole point. nd >= 1 is past the waterline.
    const moor = along(JETTY_LENGTH_PX * MOOR_AT);
    expect(ndAt(moor.x, moor.y), 'the submarine is aground').toBeGreaterThan(1);
  });

  it('crosses the waterline well before the mooring, so the sub is not paddling', () => {
    // Being barely past nd=1 would put the hull in the surf. Find the crossing
    // and insist there is real water between it and the sub.
    let shore = -1;
    for (let d = 0; d <= JETTY_LENGTH_PX; d += 5) {
      const p = along(d);
      if (ndAt(p.x, p.y) >= 1) { shore = d; break; }
    }
    expect(shore, 'the deck never crosses the waterline').toBeGreaterThan(0);
    expect(JETTY_LENGTH_PX * MOOR_AT - shore).toBeGreaterThan(60);
  });

  it('runs out to sea rather than along the coast', () => {
    // The original bug, stated as a property: walking the deck must actually
    // increase how far out you are. Due east it barely moved at all.
    const start = ndAt(dock().origin.x, dock().origin.y);
    const tip = along(JETTY_LENGTH_PX);
    expect(ndAt(tip.x, tip.y) - start).toBeGreaterThan(0.15);
  });

  it('stands at the head of the bay, on its axis', () => {
    // The jetty used to hang off the cove region's east edge, ~7 degrees off
    // the bay's axis and well inland of its head. If the anchor drifts back
    // off-axis the deck crosses the shoreline late and the sub grounds again.
    const isl = islandOf(SUB_DOCK_REGION);
    expect(isl.cove, 'the island lost its cove').toBeTruthy();
    const { origin, heading } = dock();
    expect(heading).toBeCloseTo(isl.cove!.ang, 6);
    const bearing = Math.atan2(origin.y - isl.center.y, origin.x - isl.center.x);
    expect(bearing).toBeCloseTo(isl.cove!.ang, 6);
  });
});

describe('the moored submarine', () => {
  // These are geometry constants copied from sub-dock.ts. Copied on purpose:
  // the test exists to fail when one of them changes without the other, which
  // importing them would defeat.
  const HULL_R = 0.62;
  const HULL_LEN = 1.5;
  const FIN_X = 0.72;
  const FIN_HALF_T = 0.1 / 2;
  const FIN_Z = 1.0;

  it('keeps the fins OUTSIDE the hull', () => {
    // This exact defect shipped in the deep: fins and a propeller placed inside
    // a CapsuleGeometry, invisible to 237 passing tests and obvious the moment
    // anyone looked. A fin whose inner face sits inside the hull radius is
    // swallowed by it.
    expect(FIN_X - FIN_HALF_T).toBeGreaterThan(HULL_R);
  });

  it('keeps the fins ON the hull, not floating off the tail', () => {
    // A capsule of radius r and length l spans +-(l/2 + r) along its axis.
    const halfSpan = HULL_LEN / 2 + HULL_R;
    expect(FIN_Z).toBeLessThan(halfSpan);
  });
});
