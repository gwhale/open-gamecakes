// Cake Shift — difficulty ladder.
//
// Two layers of difficulty, the same shape as chess-puzzles: the LAUNCHER
// level (1–10, seeded from kid_skills.current_tier on logic/hanoi) picks how
// many cake layers the first tower has, and the IN-SESSION ladder steps that
// count up or down between towers depending on how close to par the kid
// solved the last one. Height is the whole difficulty signal — there is no
// timer, no lives, no "level 7 of 10" badge; a taller cake and the camera
// pulling back to fit it are what say "this one is bigger".
//
// UNPLAYTESTED DIAL. The tier → layers table below is a first guess sized so
// that tier 1 is the three-layer brand cake (cream / gold / strawberry) and
// tier 10 is the eight-layer maximum (255 moves at par, which is a lot of
// tapping for anyone). Nobody has watched a five-year-old play it yet; expect
// the T3–T6 bands to move once someone has.

import { MAX_LAYERS, MIN_LAYERS } from './state';

/** Fewest moves that can solve n layers: 2^n − 1. This is "par". */
export function minMoves(n: number): number {
  return 2 ** Math.max(0, Math.floor(n)) - 1;
}

/** Starting layer count for a launcher level. Monotonic, clamped to 1–10. */
export function layersForTier(tier: number): number {
  const t = Math.max(1, Math.min(10, Math.floor(tier)));
  if (t <= 2) return 3;
  if (t <= 4) return 4;
  if (t <= 6) return 5;
  if (t <= 8) return 6;
  if (t === 9) return 7;
  return 8;
}

/** Solved within par × this → one more layer next time. */
export const STEP_UP_RATIO = 1.0;
/** Solved within par × this → same height again. Worse → one layer fewer. */
export const HOLD_RATIO = 1.5;

/** Layer count for the NEXT tower, given how the last one went.
 *
 *  Clean (at par) solves climb one layer, capped at MAX_LAYERS. A solve that
 *  took up to 1.5× par holds. Anything worse drops a layer, floored at
 *  MIN_LAYERS — the kid never sees fewer than three, because two layers is
 *  not a puzzle. Never punishes a par solve, never rewards a slog. */
export function nextLayers(current: number, moves: number, par: number): number {
  const cur = Math.max(MIN_LAYERS, Math.min(MAX_LAYERS, Math.floor(current)));
  if (par <= 0) return cur;
  const ratio = moves / par;
  if (ratio <= STEP_UP_RATIO) return Math.min(MAX_LAYERS, cur + 1);
  if (ratio <= HOLD_RATIO) return cur;
  return Math.max(MIN_LAYERS, cur - 1);
}
