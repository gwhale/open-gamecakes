// Gamecakes archipelago — the island catalog + the MACRO LAYOUT SOLVER.
//
// The town started as ONE jelly-bean island. This is a "Florida Keys" of
// separate islands, each grouping one or more regions. Adding a new themed
// island is one ISLANDS entry — the solver auto-places it in open water with a
// guaranteed sea gap; the mainland never moves.
//
// Why a SOLVER (not hand-picked offsets): the mainland's land "bean" auto-fits
// over ~10 spread-out regions, so its shoreline reaches thousands of px — a
// fixed offset can't reliably clear it (and would need re-tuning whenever a
// region is added). The solver instead pushes each island out from the
// mainland's ACTUAL shoreline (in that island's bearing) + SEA_GAP, using the
// SAME bean-shore math the engine renders (bean.ts). So "no overlap in the
// solver" == "clear water on screen" by construction.
//
// The output is a city-space OFFSET per island, applied inside layout.cityCenterPx.
// Because offsetPx() (the save translation) is derived from cityCenterPx, the
// offset cancels in cityToOrig → ORIGINAL-space stays on the 16×12 tile grid and
// the /api/town/position contract is unchanged, however large the offset grows.
//
// Dependency-light (imports only leaf modules regions/layout-core/bean, never
// layout) so layout can import THIS without a cycle.

import { REGIONS, TILE_SIZE_PX } from '@/lib/town/regions';
import { islandExtentPx, islandCornersRel } from '@/lib/town/three/layout-core';
import { autoFitPad, beanShoreDist } from '@/lib/town/three/bean';

const MAINLAND_ID = 'mainland';

/** Open (un-wadeable) water (px) between any two islands' WALK-BLOCK boundaries.
 *  THE #1 tuning knob — bigger = more distant islands (and a larger world). */
export const SEA_GAP = TILE_SIZE_PX * 8; // 512px

/** nd level to SPACE islands by. Islands are placed so their `nd = this`
 *  boundaries are SEA_GAP apart — NOT their visual `nd=1` shorelines. Critical:
 *  the avatar's sea-gate blocks walking at the engine's WADE_ND (1.15), and a
 *  huge bean's `nd` rises so slowly that a wide band past nd=1 is still WADEABLE.
 *  Spacing here must exceed WADE_ND so there's a real un-wadeable deep strip
 *  between islands (else the avatar just wades across). The extra visual water
 *  (nd=1 shorelines end up farther apart) is a bonus. */
const WADE_SPACING_ND = 1.2;

/** x-stretch of the jelly-bean per island. Small offshore islands get the
 *  elongated look (1.3); the big mainland stays near-round (1.05) — a 1.3×
 *  stretch on a 10-region span would balloon its reach and fling islands
 *  needlessly far out to sea. */
export function islandStretch(id: string): number {
  return id === MAINLAND_ID ? 1.05 : 1.3;
}

export interface Island {
  /** Stable id (also the ferry stop id). */
  id: string;
  /** Optional visual theme key (PR wires this into the render loop later). */
  theme?: string;
  /** Member region slugs. */
  regions: string[];
  /** Optional placement bearing in degrees (0 = east, 90 = south, 225 = NW). If
   *  omitted, the island is pushed out in the direction it NATURALLY sits from
   *  the mainland center — so it stays roughly where its tile put it, just
   *  offshore. */
  bearingDeg?: number;
  /** Scale the island's LAND up or down without touching its regions.
   *
   *  Island size is otherwise derived from the member regions' tile rects and
   *  their spread separation, both of which are quantised to whole tiles — so
   *  there is no way to nudge an island by a few percent through the catalog.
   *  This multiplies the bean's half-extents, which the solver and the engine
   *  both read, so shoreline, spacing, beaches and foam all follow.
   *
   *  Growing is always safe: autoFitPad re-fits the pad around the SAME region
   *  rects, so they stay comfortably inland. Shrinking below ~1 will start
   *  pushing rect corners toward the water. Linear, so area scales by the
   *  SQUARE — 1.118 is +25% area, 1.25 is +56%. */
  sizeMul?: number;
  /** Open water between THIS island and everything else (px). Overrides the
   *  global SEA_GAP for one island, so a single island can be pushed further out
   *  to sea without moving every other island with it. */
  seaGapPx?: number;
}

/** Non-mainland islands. Everything NOT listed here is the mainland. Adding a
 *  themed island = one entry (id/theme/regions [+ optional bearingDeg]); the
 *  solver spaces it automatically. */
export const ISLANDS: readonly Island[] = [
  {
    id: 'chess-isle',
    theme: 'chess',
    regions: ['chess-club'],
    // DOUBLED AGAIN (was 2.1366), to hold two game booths — Chess Puzzles and
    // Chess Challenge — plus the walk-on board, which grew to 1400px square and
    // moved out to +1400 so it stops colliding with the region's checker pad.
    // The land itself is only half the story: chess-club's TILE RECT doubled to
    // 8×6 at the same time, because the pad, the booth row and the name arch are
    // sized from the rect, not from this. See CHESS_SIZE in regions.ts.
    //
    // TUNED TO A RATIO, NOT TO A MULTIPLE — and that distinction is the whole
    // lesson here. The first pass solved for "exactly 2× the old island" and got
    // 2.6883, which barely helped, because the BOARD grew 1.75× in the same
    // change: it went from 30% of the island's width to 25%, and the island still
    // read as being made of chessboard. What a player actually sees is how much
    // of the island the board eats, so that is what this is set by now.
    //
    // At 3.6 the board is 18.9% of the shoreline span, there is ~757px of open
    // grass between the plaza's pad and the board's west edge (it used to OVERLAP
    // by 19px), and the board's far corner sits at nd 0.695 — well inside the
    // 0.82 grass line instead of hugging the beach.
    //
    // Shoreline span 2776×1664 → 7587×4286 px (2.73× / 2.58× linear, ~7× area).
    // Region-rect corners stay at nd 0.355, far inland.
    //
    // Nearly free in walking distance: the trek is set by the board's OFFSET, not
    // by the island's size, so the far edge is ~11s away at WALK_SPEED_PX against
    // ~10s before. All the extra land sits beyond the board.
    //
    // A round 3.6 rather than a solved decimal BECAUSE the target is a ratio, not
    // an exact multiple. The bean's radii are `halfExtent * mul * pad * stretch +
    // BEACH_PX` and that fixed 80px beach ring does not scale, so this is still
    // not linear in island size — if you ever need an exact multiple, bisect
    // against the real bean formula the way 2.1366 and race-isle's 1.129 were.
    //
    // GROWN AGAIN (was 3.6) — and this one IS an exact multiple, so it is a
    // solved decimal, bisected against the real bean the way the paragraph above
    // says to. 4.4328 is +50% AREA (1.226x linear), measured as ½∮r(θ)²dθ over
    // beanShoreDist, not estimated from the multiplier: the 80px beach ring is a
    // fixed additive term, so mul² is NOT the area ratio.
    //
    // Shoreline span 7587x4286 → 9303x5243 px. The board's far corner moves from
    // nd 0.687 to 0.561, further inside the 0.82 grass line; the region rect's
    // corners sit at nd 0.219, far inland.
    //
    // ⚠️ WHAT THIS DOES AND DOES NOT MOVE. sizeMul grows the LAND only. The
    // plaza pad, the booth row and the name arch are all sized from chess-club's
    // TILE RECT (CHESS_SIZE in regions.ts), and the walk-on board sits at a fixed
    // pixel offset from the island centre — so none of them move or change size,
    // and the plaza-to-board grass gap is exactly what it was. Every bit of the
    // new land appears BEYOND the board, as beach and open green.
    //
    // The cost, and it is the one the tuning comment above cares about: the board
    // now reads as 15.0% of the shoreline span, down from 18.5%. That is the same
    // direction the 3.6 change was made in (the island used to "read as being
    // made of chessboard"), so it is not a regression — but there is a floor
    // somewhere below which the arena stops feeling like the island's centrepiece
    // and starts looking marooned in a field. If this grows again, check that
    // ratio before the area.
    sizeMul: 4.4328,
  },
  // Race Island — two lands side by side, so the solver fits ONE bean over both
  // and the island comes out a long east–west speedway strip (~4.15× chess-isle
  // by area). No bearingDeg: its tile rects sit south of town, so the natural
  // bearing already solves to ≈103° (SSE) — a full 114° away from chess-isle's
  // ≈217° (NW). Add a bearingDeg here only if it ever reads wrong in-engine.
  {
    id: 'race-isle',
    theme: 'race',
    regions: ['race-pit-row', 'race-victory-lane'],
    // +25% land AREA (linear × √1.25) and double the standard sea gap, so the
    // speedway reads as the big, far-out island it is meant to be. Both are pure
    // look-tuning knobs — nothing downstream is hardcoded to these values; the
    // bridge, the bus route and the ferry-style docks all re-derive from the
    // solved shoreline.
    // 1.129, not √1.25 (1.118) as you'd expect for +25% area: the bean's radii
    // are `halfExtent * mul * pad * stretch + BEACH_PX`, and that 80px beach
    // ring is a FIXED term that does not scale — so a pure √ multiplier lands at
    // +22.7%. Solved numerically against the real bean formula instead.
    sizeMul: 1.129,
    seaGapPx: SEA_GAP * 2,
  },
];

/** A placed island — the solver's output. */
export interface SolvedIsland {
  id: string;
  theme?: string;
  regions: string[];
  /** City-space offset added to every member region's cityCenterPx. */
  offset: { x: number; y: number };
  /** Solved bean center (offset-free base center + offset), city-px. */
  center: { x: number; y: number };
  /** Bean half-extents + auto-fit pad + x-stretch (the engine renders with
   *  exactly these). */
  halfW: number;
  halfH: number;
  pad: number;
  stretch: number;
}

function mainlandRegionSlugs(): string[] {
  const claimed = new Set(ISLANDS.flatMap((i) => i.regions));
  return REGIONS.map((r) => r.slug).filter((s) => !claimed.has(s));
}

function solveOne(
  id: string,
  theme: string | undefined,
  regions: string[],
  sizeMul = 1,
): {
  base: { x: number; y: number };
  halfW: number;
  halfH: number;
  pad: number;
  stretch: number;
  spec: { id: string; theme?: string; regions: string[] };
} {
  const ext = islandExtentPx(regions);
  const stretch = islandStretch(id);
  // Scale the bean BEFORE fitting the pad, so the auto-fit sees the real
  // half-extents and keeps every region rect inland at the new size.
  const halfW = ext.halfW * sizeMul;
  const halfH = ext.halfH * sizeMul;
  const pad = autoFitPad(halfW, halfH, stretch, islandCornersRel(regions, ext.baseCx, ext.baseCy));
  return {
    base: { x: ext.baseCx, y: ext.baseCy },
    halfW,
    halfH,
    pad,
    stretch,
    spec: { id, theme, regions },
  };
}

function solve(): SolvedIsland[] {
  const main = solveOne(MAINLAND_ID, undefined, mainlandRegionSlugs());
  const mainland: SolvedIsland = {
    id: MAINLAND_ID,
    regions: main.spec.regions,
    offset: { x: 0, y: 0 },
    center: { x: main.base.x, y: main.base.y },
    halfW: main.halfW,
    halfH: main.halfH,
    pad: main.pad,
    stretch: main.stretch,
  };
  const solved: SolvedIsland[] = [mainland];
  const bases = new Map<string, { x: number; y: number }>([[MAINLAND_ID, main.base]]);

  for (const isl of ISLANDS) {
    const o = solveOne(isl.id, isl.theme, isl.regions, isl.sizeMul ?? 1);
    const gap = isl.seaGapPx ?? SEA_GAP;
    // Bearing: authored, else the natural direction from the mainland center to
    // this island's natural (offset-free) center — so it goes offshore where it
    // already sits.
    const natAng = Math.atan2(o.base.y - main.base.y, o.base.x - main.base.x);
    const ang = isl.bearingDeg != null ? (isl.bearingDeg * Math.PI) / 180 : natAng;
    // Center distance so the two WALK-BLOCK boundaries (nd = WADE_SPACING_ND) end
    // up SEA_GAP apart along the bearing. beanShoreDist returns the nd=1 radius;
    // nd is linear along a ray, so the nd=W radius is just W× that.
    const d =
      WADE_SPACING_ND * beanShoreDist(mainland.halfW, mainland.halfH, mainland.pad, mainland.stretch, ang) +
      WADE_SPACING_ND * beanShoreDist(o.halfW, o.halfH, o.pad, o.stretch, ang + Math.PI) +
      gap;
    const center = { x: main.base.x + Math.cos(ang) * d, y: main.base.y + Math.sin(ang) * d };
    bases.set(isl.id, o.base);
    solved.push({
      id: isl.id,
      theme: isl.theme,
      regions: [...isl.regions],
      offset: { x: center.x - o.base.x, y: center.y - o.base.y },
      center,
      halfW: o.halfW,
      halfH: o.halfH,
      pad: o.pad,
      stretch: o.stretch,
    });
  }

  // Island–island separation backstop (the mainland stays fixed): push any two
  // offshore islands apart along their center line until their shorelines are
  // SEA_GAP apart. A few passes converge for a handful of islands.
  for (let pass = 0; pass < 5; pass += 1) {
    for (let a = 1; a < solved.length; a += 1) {
      for (let b = a + 1; b < solved.length; b += 1) {
        const A = solved[a];
        const B = solved[b];
        const dx = B.center.x - A.center.x;
        const dy = B.center.y - A.center.y;
        const dist = Math.hypot(dx, dy) || 1;
        const angAB = Math.atan2(dy, dx);
        // Honour the WIDER of the two islands' gaps: an island that asked to be
        // far from everything must not be dragged back in by a neighbour that
        // only asked for the default.
        const gapAB = Math.max(
          ISLANDS.find((i) => i.id === A.id)?.seaGapPx ?? SEA_GAP,
          ISLANDS.find((i) => i.id === B.id)?.seaGapPx ?? SEA_GAP,
        );
        const need =
          WADE_SPACING_ND * beanShoreDist(A.halfW, A.halfH, A.pad, A.stretch, angAB) +
          WADE_SPACING_ND * beanShoreDist(B.halfW, B.halfH, B.pad, B.stretch, angAB + Math.PI) +
          gapAB;
        if (dist < need) {
          const push = (need - dist) / 2 + 1;
          const ux = dx / dist;
          const uy = dy / dist;
          A.center.x -= ux * push;
          A.center.y -= uy * push;
          B.center.x += ux * push;
          B.center.y += uy * push;
          const ab = bases.get(A.id);
          const bb = bases.get(B.id);
          if (ab) A.offset = { x: A.center.x - ab.x, y: A.center.y - ab.y };
          if (bb) B.offset = { x: B.center.x - bb.x, y: B.center.y - bb.y };
        }
      }
    }
  }
  return solved;
}

const SOLVED: SolvedIsland[] = solve();
const SOLVED_BY_ID = new Map(SOLVED.map((s) => [s.id, s]));

/** Which (solved) island a region belongs to — mainland if unassigned. */
export function islandOf(slug: string): SolvedIsland {
  const found = SOLVED.find((i) => i.id !== MAINLAND_ID && i.regions.includes(slug));
  return found ?? SOLVED_BY_ID.get(MAINLAND_ID)!;
}

/** The solved city-space offset for a region's island ({0,0} for the mainland). */
export function islandOffset(slug: string): { x: number; y: number } {
  return islandOf(slug).offset;
}

/** All solved islands (mainland first) — the engine iterates this to build one
 *  bean per island, reusing the solver's exact center/half-extents/pad/stretch. */
export function allIslands(): SolvedIsland[] {
  return SOLVED.map((s) => ({
    ...s,
    regions: [...s.regions],
    offset: { ...s.offset },
    center: { ...s.center },
  }));
}
