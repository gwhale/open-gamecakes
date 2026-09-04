// Where the soccer pitch goes.
//
// ── THE BUG THIS EXISTS TO KILL ─────────────────────────────────────────────
// Kid ticket, 27 July 2026: "The soccer field is in the water." Correct — all
// four corners were past the shoreline, centre at nd 1.121, essentially at the
// walk-block boundary.
//
// The old placement scanned `cityBoundsPx()`, which is the bounding RECTANGLE of
// every region in the world — INCLUDING the offshore islands. Its x0 reached
// −8199, out toward Chess Island at −7508, so "the centre of bounds" was not the
// mainland's centre (512) at all: it sat ~4,500px west of it, in open sea between
// the two islands. The scan then checked only that rect and region-rect clashes.
// It never asked `nd`, so a candidate could be comfortably inside a rectangle and
// comfortably outside a bean-shaped coastline.
//
// It was almost certainly fine before Chess Island went offshore, and drifted
// further out to sea every time that island grew (sizeMul 2.1366 → 3.6 → 4.4328).
// Nothing in the build could notice. A six-year-old did.
//
// So: search the MAINLAND BEAN, and require every corner to be on grass.
//
// Pure and THREE-free on purpose — the engine needs the footprint long before
// there is a mesh, and scripts/soccer-pitch-check.mjs asserts against this exact
// function rather than a copy of the arithmetic that would silently drift.

import { allIslands } from '@/lib/town/islands';
import { beanNd, beanShoreDist } from './bean';
import { cityCenterPx } from './layout';
import type { RectPx } from './layout';

/** nd past which grass gives way to sand. The pitch must be entirely inside it —
 *  a corner on the beach reads as "half in the sand", which is the same class of
 *  complaint as being in the water. Matches the 0.82 line the chess/checkers
 *  arenas are held to. */
export const GRASS_ND = 0.82;

/** Scan resolution across the mainland's extent. 24 is ~400px steps on today's
 *  bean — fine enough to find a clear spot near the middle without the search
 *  becoming a visible cost at boot (625 candidates × 4 corner tests). */
const GRID = 24;

/** The pitch's centre, in city px.
 *
 *  Preference order: on grass (hard requirement) → clear of every land rect
 *  (hard requirement) → nearest Town Square. Town Square rather than the bean's
 *  geometric centre because the pitch is meant to read as the town's playing
 *  field, sitting just off the main square, which is what the original comment
 *  intended before the bounds drifted out from under it. */
export function pitchCenterPx(
  widthPx: number,
  heightPx: number,
  zoneRects: readonly RectPx[],
): { x: number; y: number } {
  const hw = widthPx / 2;
  const hh = heightPx / 2;
  const main = allIslands().find((i) => i.id === 'mainland');

  // No mainland (impossible in practice, but this module must not throw during
  // world construction): fall back to the town centre.
  const anchor = cityCenterPx('town-square');
  if (!main) return anchor;

  const nd = (x: number, y: number): number =>
    beanNd(main.center.x, main.center.y, main.halfW, main.halfH, main.pad, main.stretch, x, y);

  const onGrass = (c: { x: number; y: number }): boolean =>
    nd(c.x - hw, c.y - hh) <= GRASS_ND &&
    nd(c.x + hw, c.y - hh) <= GRASS_ND &&
    nd(c.x - hw, c.y + hh) <= GRASS_ND &&
    nd(c.x + hw, c.y + hh) <= GRASS_ND;

  const clashes = (c: { x: number; y: number }): boolean => {
    const r = { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
    return zoneRects.some((rc) => !(r.x1 < rc.x0 || r.x0 > rc.x1 || r.y1 < rc.y0 || r.y0 > rc.y1));
  };

  // Search box = the MAINLAND bean's own extent, not the archipelago's bounding
  // rect. Sampling the real shoreline rather than using halfW/halfH keeps this
  // honest about the bean's wobble + eastward `fat` bulge.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 64; i += 1) {
    const ang = (i / 64) * Math.PI * 2;
    const r = beanShoreDist(main.halfW, main.halfH, main.pad, main.stretch, ang);
    x0 = Math.min(x0, main.center.x + Math.cos(ang) * r);
    x1 = Math.max(x1, main.center.x + Math.cos(ang) * r);
    y0 = Math.min(y0, main.center.y + Math.sin(ang) * r);
    y1 = Math.max(y1, main.center.y + Math.sin(ang) * r);
  }

  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let gx = 0; gx <= GRID; gx += 1) {
    for (let gy = 0; gy <= GRID; gy += 1) {
      const cand = {
        x: x0 + ((x1 - x0) * gx) / GRID,
        y: y0 + ((y1 - y0) * gy) / GRID,
      };
      if (!onGrass(cand)) continue;
      if (clashes(cand)) continue;
      const d = Math.hypot(cand.x - anchor.x, cand.y - anchor.y);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  if (best) return best;

  // Nothing clash-free fits on grass — the town has filled up. Drop the
  // clash rule (a pitch overlapping a land rect is ugly; a pitch in the sea is
  // a bug a kid reports) and take the grassiest spot nearest the square.
  for (let gx = 0; gx <= GRID; gx += 1) {
    for (let gy = 0; gy <= GRID; gy += 1) {
      const cand = { x: x0 + ((x1 - x0) * gx) / GRID, y: y0 + ((y1 - y0) * gy) / GRID };
      if (!onGrass(cand)) continue;
      const d = Math.hypot(cand.x - anchor.x, cand.y - anchor.y);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  // Still nothing: the pitch is bigger than the island's grass. Centre it on the
  // bean, which is the most-inland point there is.
  return best ?? { x: main.center.x, y: main.center.y };
}

/** The pitch's footprint, given its centre. Kept here so the engine's flat/
 *  no-scatter reservation and the renderer cannot disagree. */
export function pitchRectPx(
  center: { x: number; y: number },
  widthPx: number,
  heightPx: number,
): RectPx {
  return {
    x0: center.x - widthPx / 2,
    y0: center.y - heightPx / 2,
    x1: center.x + widthPx / 2,
    y1: center.y + heightPx / 2,
  };
}
