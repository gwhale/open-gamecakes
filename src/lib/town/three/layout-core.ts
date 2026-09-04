// Offset-FREE spread math — the region layout BEFORE any island offset. Shared
// by the island layout solver (islands.ts) and layout.ts so neither imports the
// other (islands → layout-core ← layout, no cycle). The solver computes island
// offsets from this; layout.ts adds those offsets back in cityCenterPx.

import { REGIONS, TILE_SIZE_PX, findRegion, type Region } from '@/lib/town/regions';

/** How far apart to fling the towns (centers scaled out from world center). */
export const TOWN_SPREAD = 7.6;

/** How much bigger each zone's footprint is vs its raw tile size. */
export const ZONE_SCALE = 2.2;

/** Margin around a region set's bbox (px) — matches layout.cityBoundsPx. */
export const MARGIN_PX = TILE_SIZE_PX * 2;

/** The point the town spreads outward FROM (city px).
 *
 *  ⚠️ PINNED LITERAL — do NOT re-derive this from WORLD_PX.
 *
 *  Every region's city position is `origin + (orig - origin) * TOWN_SPREAD`, so
 *  this point anchors the ENTIRE town layout. It used to be `WORLD_PX / 2`,
 *  which silently coupled the layout to the tile-grid SIZE: growing WORLD_TILES
 *  to make room for a new island's tile rect would move this origin and
 *  re-spread every existing land, ballooning the mainland bean and shifting the
 *  whole town. (Saved positions survive — original space is untouched — but the
 *  world visibly rearranges.)
 *
 *  512 × 384 is the centre of the historical 16 × 12 grid, so pinning it is a
 *  no-op for the town as it stands and keeps the grid free to grow southward
 *  for new islands. */
const WORLD_CENTER = { x: 512, y: 384 };

function origCenterPx(region: Region): { x: number; y: number } {
  return { x: region.spawnPoint.x, y: region.spawnPoint.y };
}

/** Spread region center (city px) WITHOUT the island offset. */
export function spreadCenterPx(slug: string): { x: number; y: number } {
  const region = findRegion(slug) ?? REGIONS[0];
  const o = origCenterPx(region);
  return {
    x: WORLD_CENTER.x + (o.x - WORLD_CENTER.x) * TOWN_SPREAD,
    y: WORLD_CENTER.y + (o.y - WORLD_CENTER.y) * TOWN_SPREAD,
  };
}

/** Half-extent of a region's rect (city px) — offset-invariant. */
export function regionRectHalf(region: Region): { hw: number; hh: number } {
  return {
    hw: (region.size.w * TILE_SIZE_PX * ZONE_SCALE) / 2,
    hh: (region.size.h * TILE_SIZE_PX * ZONE_SCALE) / 2,
  };
}

/** Offset-free bounding box over a set of region slugs (+ MARGIN): the box's
 *  center + half-extents. Adding an island offset is a pure translation, so this
 *  matches layout.islandBoundsPx minus that offset — i.e. the island's bean
 *  SIZE (halfW/H), which is what the solver + auto-fit need. */
export function islandExtentPx(slugs: string[]): {
  baseCx: number;
  baseCy: number;
  halfW: number;
  halfH: number;
} {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of slugs) {
    const r = findRegion(s);
    if (!r) continue;
    const c = spreadCenterPx(s);
    const { hw, hh } = regionRectHalf(r);
    x0 = Math.min(x0, c.x - hw);
    y0 = Math.min(y0, c.y - hh);
    x1 = Math.max(x1, c.x + hw);
    y1 = Math.max(y1, c.y + hh);
  }
  if (!Number.isFinite(x0)) return { baseCx: 0, baseCy: 0, halfW: 0, halfH: 0 };
  x0 -= MARGIN_PX;
  y0 -= MARGIN_PX;
  x1 += MARGIN_PX;
  y1 += MARGIN_PX;
  return { baseCx: (x0 + x1) / 2, baseCy: (y0 + y1) / 2, halfW: (x1 - x0) / 2, halfH: (y1 - y0) / 2 };
}

/** Region-rect corners RELATIVE to a given center (offset-invariant) — the
 *  auto-fit input for a bean. */
export function islandCornersRel(
  slugs: string[],
  baseCx: number,
  baseCy: number,
): Array<[number, number]> {
  const corners: Array<[number, number]> = [];
  for (const s of slugs) {
    const r = findRegion(s);
    if (!r) continue;
    const c = spreadCenterPx(s);
    const { hw, hh } = regionRectHalf(r);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      corners.push([c.x + sx * hw - baseCx, c.y + sy * hh - baseCy]);
    }
  }
  return corners;
}
