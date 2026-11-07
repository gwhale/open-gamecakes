// Town building — the catalog of pieces a kid can buy and place on the town
// grid, and the grid rules the server and the 3D engine share.
//
// Dependency-free content module (no `three`, no React, no DB), like
// vehicles.ts: the build API reads `cost` and the plot rule, the engine reads
// the same plot rule plus its own terrain tests, and the build tray reads
// label/glyph/cost.
//
// THE GRID: city-pixel space (the spread layout in three/layout.ts, the same
// space the multiplayer position packets use) cut into 64px squares, one scene
// unit each. A build at (gx, gy) covers city px [gx*64, gx*64+64) on x, same
// on y. Every piece fills exactly one square.

import { BUILD } from '@/lib/tokens/economy';
import { TILE_SIZE_PX, findRegion } from '@/lib/town/regions';
import { cityRectPx, worldBoundsPx } from '@/lib/town/three/layout';

/** Stored in town_builds.kind — keep the strings stable. */
export type BuildKind =
  | 'road'
  | 'fence'
  | 'lamp'
  | 'bench'
  | 'flowers'
  | 'tree'
  | 'cotton-tree'
  | 'gumdrop-pine'
  | 'cane-palm'
  | 'house';

export interface BuildInfo {
  kind: BuildKind;
  label: string;
  glyph: string;
  cost: number;
  /** False for pieces that look the same from every side (the road joins up
   *  on its own, a lamp is round), so the tray hides the turn button. */
  turns: boolean;
}

/** Tray order: cheapest first. */
export const BUILD_CATALOG: readonly BuildInfo[] = [
  { kind: 'road', label: 'Road', glyph: '🛣️', cost: BUILD.ROAD, turns: false },
  { kind: 'fence', label: 'Fence', glyph: '🚧', cost: BUILD.FENCE, turns: true },
  { kind: 'flowers', label: 'Flowers', glyph: '🌷', cost: BUILD.FLOWERS, turns: false },
  { kind: 'lamp', label: 'Lamp', glyph: '💡', cost: BUILD.LAMP, turns: false },
  { kind: 'bench', label: 'Bench', glyph: '🪑', cost: BUILD.BENCH, turns: true },
  { kind: 'tree', label: 'Tree', glyph: '🌳', cost: BUILD.TREE, turns: false },
  { kind: 'cotton-tree', label: 'Cotton Candy', glyph: '🍭', cost: BUILD.COTTON_TREE, turns: false },
  { kind: 'gumdrop-pine', label: 'Gumdrop Pine', glyph: '🌲', cost: BUILD.GUMDROP_PINE, turns: false },
  { kind: 'cane-palm', label: 'Cane Palm', glyph: '🌴', cost: BUILD.CANE_PALM, turns: true },
  { kind: 'house', label: 'House', glyph: '🏠', cost: BUILD.HOUSE, turns: true },
];

export function isBuildKind(v: unknown): v is BuildKind {
  return typeof v === 'string' && BUILD_CATALOG.some((b) => b.kind === v);
}

export function findBuild(kind: BuildKind): BuildInfo {
  return BUILD_CATALOG.find((b) => b.kind === kind)!;
}

/** Most builds one family may have. Keeps the town cheap to draw on an iPad;
 *  at the prices above it is weeks of saving before anyone gets near it. */
export const MAX_FAMILY_BUILDS = 400;

/** Seconds after placing in which removing a piece refunds it in full (the
 *  "oops" undo). After that the builder gets half back. */
export const UNDO_SECS = 10;

/** Why a square can't take a piece, as the engine reports it to the build
 *  tray. 'empty' is the remove tool aimed at a square with nothing on it. */
export type BuildProblem = 'taken' | 'sibling' | 'water' | 'locked' | 'busy' | 'road' | 'empty';

/** A placed piece, as the API returns it and the engine draws it. */
export interface TownBuild {
  id: string;
  kid_id: string;
  kind: BuildKind;
  gx: number;
  gy: number;
  rot: number;
  created_at: string;
}

export const CELL_PX = TILE_SIZE_PX; // 64

export function cellOfPx(px: number, py: number): { gx: number; gy: number } {
  return { gx: Math.floor(px / CELL_PX), gy: Math.floor(py / CELL_PX) };
}

export function cellCenterPx(gx: number, gy: number): { x: number; y: number } {
  return { x: (gx + 0.5) * CELL_PX, y: (gy + 0.5) * CELL_PX };
}

/** Is the cell inside the world at all? The server's sanity bound on gx/gy. */
export function cellInWorld(gx: number, gy: number): boolean {
  const b = worldBoundsPx();
  const c = cellCenterPx(gx, gy);
  return c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1;
}

/** The plot rule. Kids build on open grass and on their own land; a sibling's
 *  land is theirs alone. `otherKidLands` is every land slug owned by another
 *  kid in the family. Returns the slug of the sibling land the cell falls in,
 *  or null when the plot rule allows it. */
export function siblingLandAt(gx: number, gy: number, otherKidLands: Iterable<string>): string | null {
  const c = cellCenterPx(gx, gy);
  for (const slug of otherKidLands) {
    const region = findRegion(slug);
    if (!region) continue;
    const rc = cityRectPx(region);
    if (c.x >= rc.x0 && c.x <= rc.x1 && c.y >= rc.y0 && c.y <= rc.y1) return slug;
  }
  return null;
}

/** Which of the four neighbours of (gx, gy) hold a road, as a bitmask:
 *  1 = north (gy-1), 2 = east (gx+1), 4 = south (gy+1), 8 = west (gx-1).
 *  The engine draws a road square as a centre patch plus one arm per set bit,
 *  so straights, corners, T's and crossings all join up without a tile set. */
export function roadMask(gx: number, gy: number, hasRoad: (gx: number, gy: number) => boolean): number {
  return (
    (hasRoad(gx, gy - 1) ? 1 : 0) |
    (hasRoad(gx + 1, gy) ? 2 : 0) |
    (hasRoad(gx, gy + 1) ? 4 : 0) |
    (hasRoad(gx - 1, gy) ? 8 : 0)
  );
}

export function cellKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}
