// Land evolution catalog — the "My Land" upgrade ladder in the Cakey Store.

import { ESTATE } from '@/lib/tokens/economy';
//
// Each per-kid land (any region with an
// kids.land_slug) evolves through a few stages, bought with Sugar Tokens. A
// single monotonic `level` (0..MAX_LAND_LEVEL) captures the whole progression:
// owning a level implies owning every stage below it, so there is no separate
// entitlement table (unlike cupcake unlocks). The level is stored on the
// existing kid_region_discoveries row (level int, default 0) and rendered as a
// bigger pad + a grander structure in the 3D town.
//
// `padScale` is the render-time visual scale applied to the land's pad + hero
// in city3d.ts. It is intentionally capped: two stacked kid lands scaling at
// once must stay clear of the ~1459px center gap the town layout gives them, so
// the top stage (Castle) sits at 2.2× and MUST NOT exceed ~2.5×. This is a
// PURELY VISUAL scale — the logical grid, roads, spawn, and walk-clamp are
// untouched (see town/three/city3d.ts + the plan).

export interface LandEvolution {
  /** Ladder position. 0 = the free starting stage every land begins at. */
  level: number;
  /** Stable key (for analytics / metadata). */
  key: 'plot' | 'cottage' | 'tower' | 'castle';
  /** Kid-facing stage name. */
  name: string;
  /** Emoji used in the shop + as the fallback map landmark for this stage. */
  glyph: string;
  /** Sugar Tokens to reach THIS stage from the one below. 0 for the start. */
  cost: number;
  /** Render-time visual scale for the land's pad + hero. Capped ≤ 2.5. */
  padScale: number;
}

/** The upgrade ladder. Index === level, so LAND_EVOLUTIONS[level] is O(1). */
export const LAND_EVOLUTIONS: readonly LandEvolution[] = [
  { level: 0, key: 'plot',    name: 'Plot',    glyph: '🏕️', cost: 0,  padScale: 1.0 },
  { level: 1, key: 'cottage', name: 'Cottage', glyph: '🏠', cost: ESTATE.COTTAGE, padScale: 1.3 },
  { level: 2, key: 'tower',   name: 'Tower',   glyph: '🗼', cost: ESTATE.TOWER, padScale: 1.7 },
  { level: 3, key: 'castle',  name: 'Castle',  glyph: '🏰', cost: ESTATE.CASTLE, padScale: 2.2 },
] as const;

/** Highest reachable level (index of the last stage). */
export const MAX_LAND_LEVEL = LAND_EVOLUTIONS.length - 1;

/** Total Sugar Tokens to evolve a land all the way to Castle. */
export const LAND_EVOLUTION_TOTAL_COST = LAND_EVOLUTIONS.reduce(
  (sum, e) => sum + e.cost,
  0,
);

/** Read-path coerce: clamp any stored/incoming value to a valid level so a
 *  legacy or hand-edited row can never crash the renderer (mirrors
 *  coerceCupcakeConfig). */
export function clampLandLevel(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(MAX_LAND_LEVEL, v));
}

/** The stage a land is currently at. */
export function evolutionForLevel(level: number): LandEvolution {
  return LAND_EVOLUTIONS[clampLandLevel(level)];
}

/** The next stage up, or null if already maxed. */
export function nextEvolution(level: number): LandEvolution | null {
  const next = clampLandLevel(level) + 1;
  return next <= MAX_LAND_LEVEL ? LAND_EVOLUTIONS[next] : null;
}

/** Server-authoritative cost to buy `toLevel` (the price of that stage).
 *  Returns null for level 0 or out-of-range — callers reject those. */
export function costForLevel(toLevel: number): number | null {
  if (toLevel < 1 || toLevel > MAX_LAND_LEVEL) return null;
  return LAND_EVOLUTIONS[toLevel].cost;
}
