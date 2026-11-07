// Town spread layout — pushes the 8 regions apart so the 3D city reads as
// distinct "towns" with walkable ground between them, instead of the tightly
// packed 16×12 grid the 2D map used.
//
// We scale each region's CENTER outward from the world center while keeping its
// pad SIZE the same, which opens real gaps between regions. All of this lives
// in a derived "city-pixel" space that the engine + city renderer share. The
// only place we convert back to the ORIGINAL region-pixel space is the
// position save/restore boundary (cityToOrig / origToCity), so the
// /api/town/position contract — and any other consumer of those coords — is
// unchanged.

import { REGIONS, TILE_SIZE_PX, findRegion, type Region } from '@/lib/town/regions';
import { islandOffset, allIslands } from '@/lib/town/islands';
import { spreadCenterPx, regionRectHalf } from './layout-core';

// TOWN_SPREAD / ZONE_SCALE live in layout-core (the offset-free layer the solver
// shares); re-exported here for existing importers.
export { TOWN_SPREAD, ZONE_SCALE } from './layout-core';

/** Original region center (px) — the tile-rect center, same as spawnPoint. */
function origCenterPx(region: Region): { x: number; y: number } {
  return { x: region.spawnPoint.x, y: region.spawnPoint.y };
}

/** Spread region center (city px) = offset-free spread + the region's ISLAND
 *  OFFSET (the solver's placement; {0,0} for the mainland). Because offsetPx()
 *  below is derived from cityCenterPx, the island offset flows into the save
 *  translation and cityToOrig cancels it back — ORIGINAL-space stays on the tile
 *  grid, so the /api/town/position contract is unchanged (see islands.ts). */
export function cityCenterPx(slug: string): { x: number; y: number } {
  const s = spreadCenterPx(slug);
  const off = islandOffset(slug);
  return { x: s.x + off.x, y: s.y + off.y };
}

/** The constant translation from original-space to city-space for a region. */
function offsetPx(slug: string): { x: number; y: number } {
  const region = findRegion(slug) ?? REGIONS[0];
  const o = origCenterPx(region);
  const c = cityCenterPx(slug);
  return { x: c.x - o.x, y: c.y - o.y };
}

/** Original region-px point → city-px (point keeps its in-region offset). */
export function origToCity(p: { x: number; y: number }, slug: string): { x: number; y: number } {
  const off = offsetPx(slug);
  return { x: p.x + off.x, y: p.y + off.y };
}

/** City-px point → original region-px (for the position save contract). */
export function cityToOrig(p: { x: number; y: number }, slug: string): { x: number; y: number } {
  const off = offsetPx(slug);
  return { x: p.x - off.x, y: p.y - off.y };
}

export interface RectPx {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A region's walkable rect in city-px (spread center, original size). */
export function cityRectPx(region: Region): RectPx {
  const c = cityCenterPx(region.slug);
  const { hw, hh } = regionRectHalf(region);
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh };
}

/** Bounding box (city-px) over a set of region slugs + margin. */
function boundsOverSlugs(slugs: string[], marginPx: number): RectPx {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of slugs) {
    const r = findRegion(s);
    if (!r) continue;
    const rc = cityRectPx(r);
    x0 = Math.min(x0, rc.x0);
    y0 = Math.min(y0, rc.y0);
    x1 = Math.max(x1, rc.x1);
    y1 = Math.max(y1, rc.y1);
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return { x0: x0 - marginPx, y0: y0 - marginPx, x1: x1 + marginPx, y1: y1 + marginPx };
}

/** Bounding box over ALL regions across ALL islands (+ margin) — used to size
 *  the shared ground/water plane + fog far, which must span the whole
 *  archipelago. */
export function worldBoundsPx(marginPx = TILE_SIZE_PX * 2): RectPx {
  return boundsOverSlugs(
    REGIONS.map((r) => r.slug),
    marginPx,
  );
}

/** Bounding box over ONE island's regions (+ margin) — drives that island's
 *  land "bean". */
export function islandBoundsPx(islandId: string, marginPx = TILE_SIZE_PX * 2): RectPx {
  const isl = allIslands().find((i) => i.id === islandId);
  return boundsOverSlugs(isl?.regions ?? [], marginPx);
}

/** Bounding box over the MAINLAND's regions (+ margin) — for gameplay features
 *  that must stay on the mainland (train loop, frosting mountain, terrain
 *  edge-fade) rather than spanning the open sea to the offshore islands. */
export function mainlandBoundsPx(marginPx = TILE_SIZE_PX * 2): RectPx {
  return islandBoundsPx('mainland', marginPx);
}

/** Bounding box over all region rects (+ margin). Alias of worldBoundsPx —
 *  retained for existing callers; new code should pick world/mainland/island
 *  scope explicitly. */
export function cityBoundsPx(marginPx = TILE_SIZE_PX * 2): RectPx {
  return worldBoundsPx(marginPx);
}
