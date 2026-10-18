// Where the three hidden land chests go, found on the SOLVED map.
//
// Pure: no `three`, no engine. The engine hands in what it already knows about
// the mainland (its shape, what is built on it, the mountain), and this returns
// one point per hiding-place kind in lib/town/land-chests.ts. Same map in, same
// spots out, so a chest is where it was last visit — and wherever the layout
// moves it next time, it is still somewhere nobody walks.
//
// "HIDDEN" IS MEASURED, NOT PICKED. A spot's score is its CLEARANCE: the
// distance to the nearest land, road, pitch or rail — the places a kid is
// already going. The coast and hollow chests take the best-scoring points in
// their band, so they sit in the parts of town that have nothing in them.
//
// THE MOUNTAIN CHEST IS ON THE FAR SIDE, measured from the mainland's centre,
// so the slope a kid sees from town is the slope it is not on.

import type { LandChestSpot } from '../land-chests';

export interface Pt {
  x: number;
  y: number;
}

export interface SpotWorld {
  /** Mainland bounding box, px. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Mainland centre, px. */
  centre: Pt;
  /** The mainland's normalised distance: 0 at the centre, 1 at the shoreline. */
  nd(x: number, y: number): number;
  /** Distance in px to the nearest land, road, pitch or rail. <= 0 means ON one. */
  clearance(x: number, y: number): number;
  /** Frosting Mountain. */
  mountain: Pt & { r: number };
}

/** Grid resolution of the search, per side. Fine enough that the best spot is
 *  within ~1 tile of the true best on the current mainland, cheap enough to run
 *  at engine build (48² clearance calls). */
const GRID = 48;

/** The coast chest's band: on the sand-side of the land, not in the surf. The
 *  engine snaps spawns above nd 0.95 back to the centre; stay well inside it. */
const COAST_ND = [0.78, 0.9] as const;
/** The hollow chest's band: properly inland. */
const HOLLOW_ND = [0.3, 0.72] as const;
/** The hollow must be at least this fraction of the mainland's width from the
 *  coast chest, or the two read as one hiding place. */
const MIN_SEPARATION_FRAC = 0.3;
/** Out from the mountain's centre, as a fraction of its footprint radius: a
 *  climb, but not the summit, where the cherry topper already draws every eye. */
const MOUNTAIN_FRAC = 0.55;
/** Smallest clearance a spot may have, px. Less than this and the chest is in
 *  someone's front garden. */
const MIN_CLEARANCE_PX = 60;

function bestInBand(
  w: SpotWorld,
  band: readonly [number, number],
  accept: (p: Pt) => boolean,
): Pt | null {
  let best: Pt | null = null;
  let bestScore = -Infinity;
  const { x0, y0, x1, y1 } = w.bounds;
  for (let i = 0; i <= GRID; i++) {
    for (let j = 0; j <= GRID; j++) {
      const p = { x: x0 + ((x1 - x0) * i) / GRID, y: y0 + ((y1 - y0) * j) / GRID };
      const nd = w.nd(p.x, p.y);
      if (nd < band[0] || nd > band[1]) continue;
      if (Math.hypot(p.x - w.mountain.x, p.y - w.mountain.y) < w.mountain.r + 60) continue;
      if (!accept(p)) continue;
      const score = w.clearance(p.x, p.y);
      if (score < MIN_CLEARANCE_PX) continue;
      // Strict >, scanning in a fixed order: ties go to the first, so the
      // result never depends on floating-point noise between two equal spots.
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
  }
  return best;
}

function mountainSpot(w: SpotWorld): Pt | null {
  const away = Math.atan2(w.mountain.y - w.centre.y, w.mountain.x - w.centre.x);
  // Straight out the back first, then swing either side in widening steps
  // until the point is on land and clear of anything built.
  for (const step of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    const a = away + step * (Math.PI / 9);
    const p = {
      x: w.mountain.x + Math.cos(a) * w.mountain.r * MOUNTAIN_FRAC,
      y: w.mountain.y + Math.sin(a) * w.mountain.r * MOUNTAIN_FRAC,
    };
    if (w.nd(p.x, p.y) < 0.9 && w.clearance(p.x, p.y) >= MIN_CLEARANCE_PX) return p;
  }
  return null;
}

/** One point per hiding-place kind, or null where the map has no such place
 *  (a chest with nowhere to go is not built, rather than dropped in a land). */
export function pickLandChestSpots(w: SpotWorld): Record<LandChestSpot, Pt | null> {
  const mountain = mountainSpot(w);
  const coast = bestInBand(w, COAST_ND, () => true);
  const minSep = (w.bounds.x1 - w.bounds.x0) * MIN_SEPARATION_FRAC;
  const hollow = bestInBand(w, HOLLOW_ND, (p) => {
    for (const other of [coast, mountain]) {
      if (other && Math.hypot(p.x - other.x, p.y - other.y) < minSep) return false;
    }
    return true;
  });
  return { mountain, coast, hollow };
}
