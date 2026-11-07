// The shared chess difficulty axis — one rating scale for every chess game.
//
// This exists as its own module for a bundle reason, not a taste one. ladder.ts
// derives its bounds from the puzzle library, which means importing ANYTHING
// from it drags in puzzles.ts → library.json, a 577 KB JSON blob of ~4.9k
// lichess puzzles. Chess Challenge needs the level→rating mapping and nothing
// else, so pulling it from ladder.ts would have shipped half a megabyte of
// puzzles into a game that never shows one.
//
// So: the bounds live here as literals, and ladder.ts imports them. ladder.ts
// still checks its real library against these in dev — see the assertion there.

/** Rating floor. Matches the lichess puzzle library's easiest bucket. */
export const RATING_MIN = 500;

/** Rating ceiling. The library tops out at 1899; 1900 is the round number the
 *  ramp clamps to, and startRatingForTier never reaches it anyway. */
export const RATING_MAX = 1900;

/** Map a launcher level (1–10) to a starting rating. Level 1 → easiest (~500),
 *  level 10 → ~1500, leaving headroom above for a puzzle rush's clean-solve ramp
 *  to climb into.
 *
 *  Chess Challenge maps its opponents onto this SAME axis rather than inventing a
 *  second difficulty scale, so "level 7" means comparable difficulty whichever
 *  chess game the kid opens. */
export function startRatingForTier(tier: number): number {
  const t = Math.max(1, Math.min(10, tier));
  const top = Math.min(RATING_MAX, 1500);
  return Math.round(RATING_MIN + ((t - 1) / 9) * (top - RATING_MIN));
}
