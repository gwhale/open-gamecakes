// Adaptive difficulty ladder for Chess Puzzles.
//
// The library (src/components/games/chess-puzzles/puzzles.ts) is ~4.9k lichess
// puzzles evenly spread across rating buckets 500–1900. During a rush we track
// a running `currentRating` that climbs on clean solves and eases on misses,
// and serve the nearest-rated unseen puzzle — so difficulty ramps up exactly
// as the kid gets them right without errors.

import { PUZZLES, type ChessPuzzle } from '@/components/games/chess-puzzles/puzzles';
import { RATING_MIN, RATING_MAX, startRatingForTier } from '@/lib/games/chess/rating';

// Re-exported so existing importers of this module keep working unchanged. The
// values themselves now live in rating.ts, which is free of the puzzle library —
// Chess Challenge needs the axis but not 577 KB of puzzles. See that file.
export { RATING_MIN, RATING_MAX, startRatingForTier };

/** Library sorted by rating once, for nearest-rating lookup. */
const BY_RATING: ChessPuzzle[] = [...PUZZLES].sort((a, b) => a.rating - b.rating);

// The literals in rating.ts describe THIS library, so if the library is ever
// regenerated with a different spread they must move together. Dev-only: a
// mismatch is a content problem to fix at the source, not something to paper over
// at runtime by re-deriving (which is what coupled them to the blob originally).
if (process.env.NODE_ENV !== 'production') {
  const lo = BY_RATING[0]?.rating;
  const hi = BY_RATING[BY_RATING.length - 1]?.rating;
  if (lo != null && lo !== RATING_MIN) {
    console.warn(`[chess/ladder] library floor ${lo} != RATING_MIN ${RATING_MIN} in rating.ts`);
  }
  if (hi != null && hi > RATING_MAX) {
    console.warn(`[chess/ladder] library ceiling ${hi} exceeds RATING_MAX ${RATING_MAX} in rating.ts`);
  }
}

/** Stable key for a puzzle (dedupe within a session). */
export function puzzleKey(p: ChessPuzzle): string {
  return `${p.fen}|${p.moves[0]}`;
}

/** How much the rating moves per outcome. */
export const CLEAN_STEP = 40; // solved with no wrong moves → ramp up
export const MISS_STEP = 30; // any error on the puzzle → ease down

/** Pick the next puzzle nearest to `rating` that hasn't been seen this session.
 *  Collects the ~24 closest unseen and random-picks one for variety, so the kid
 *  doesn't get the identical puzzle at a given rating every time. */
export function nextPuzzle(rating: number, seen: Set<string>): ChessPuzzle {
  const n = BY_RATING.length;
  // Binary-search the first index whose rating >= target.
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (BY_RATING[mid].rating < rating) lo = mid + 1;
    else hi = mid;
  }
  // Expand outward from `lo`, taking the nearest unseen puzzles.
  const near: ChessPuzzle[] = [];
  let i = lo;
  let j = lo - 1;
  while (near.length < 24 && (i < n || j >= 0)) {
    const preferI =
      i < n && (j < 0 || Math.abs(BY_RATING[i].rating - rating) <= Math.abs(BY_RATING[j].rating - rating));
    if (preferI) {
      const p = BY_RATING[i++];
      if (!seen.has(puzzleKey(p))) near.push(p);
    } else {
      const p = BY_RATING[j--];
      if (!seen.has(puzzleKey(p))) near.push(p);
    }
  }
  if (near.length === 0) {
    // Every puzzle seen (essentially impossible in one rush) — just reuse one.
    return BY_RATING[Math.floor(Math.random() * n)];
  }
  return near[Math.floor(Math.random() * near.length)];
}

/** Clamp a rating to the library's range. */
export function clampRating(r: number): number {
  return Math.max(RATING_MIN, Math.min(RATING_MAX, r));
}
