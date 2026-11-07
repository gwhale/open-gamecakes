// Per-kid lands belonging to THIS deployment.
//
// ───────────────────────────────────────────────────────────────────────────────
// UPSTREAM NEVER EDITS THIS FILE. That is its entire purpose.
// ───────────────────────────────────────────────────────────────────────────────
//
// The counterpart to registry.local.ts, and for the same reason: a family's
// own lands and upstream's are appended to different files, so `git merge
// upstream/main` has nothing to reconcile.
//
// It exists for a second reason too. A per-kid land is a place named for and
// themed around one child. Shipping ours upstream would seed a stranger's town
// with a child they have never met — founder content leaking into someone
// else's data rather than into their source. Migration 0045 fixed the DB half
// of that; this file is the source half.
//
// Adding one:
//
//   1. Pick free tiles. The world is WORLD_TILES (16×17) and upstream's rects
//      are laid out in regions.ts — read it before choosing, overlapping rects
//      are not detected.
//   2. Add an entry below with `kidLand: true`, `starter: true` and
//      `unlock_cost: 0`. A kid's own land should always be reachable.
//   3. Name a neighbour that exists upstream, or the land is unreachable on
//      foot. `neighbors` is one-directional from here outward.
//   4. Put the kid's games in `games`, and register those in registry.local.ts.
//
// Ownership is DATA, not a name in this file: kids.land_slug (migration 0043)
// says which kid owns which land, and the town renders that kid's own cupcake
// as the landmark. See community/README.md.

import type { Region } from './regions';

/** Tile size shared by both lands below. Upstream has its own copy — this file
 *  stays self-contained on purpose, so nothing here can break when upstream
 *  reshapes its layout constants. */
const LAND_SIZE = { w: 4, h: 3 } as const;
const TILE_PX = 64;

/** Pixel centre of a land rect, for spawnPoint. */
const center = (tile: { x: number; y: number }): { x: number; y: number } => ({
  x: (tile.x + LAND_SIZE.w / 2) * TILE_PX,
  y: (tile.y + LAND_SIZE.h / 2) * TILE_PX,
});

/** This deployment's per-kid lands. Empty upstream — that is correct.
 *  Appended AFTER upstream's regions, so REGIONS[0] stays Town Square. */
export const LOCAL_REGIONS: readonly Region[] = [
  // Example — delete the comment markers and edit:
  //
  // {
  //   slug: 'juniper-land',
  //   name: 'Treehouse Land',
  //   theme: 'Your own corner of the city.',
  //   tile: { x: 0, y: 3 },
  //   size: LAND_SIZE,
  //   unlock_cost: 0,
  //   starter: true,
  //   neighbors: ['library-of-lemon'],
  //   games: ['juniper-maze'],
  //   spawnPoint: center({ x: 0, y: 3 }),
  //   themeColor: '#fed7aa',
  //   landmark: '🧁',
  //   ribbon: 'AMBER',
  //   kidLand: true,
  // },
];
