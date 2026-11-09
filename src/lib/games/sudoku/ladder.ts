// Waffle Sudoku — the difficulty ladder.
//
// ⚠️ UNPLAYTESTED DIALS. Every number in this file is a first guess made at a
// desk, not at a table with a six-year-old. The bands, the givens ranges, the
// step sizes and the tier→score mapping were chosen so the generator can hit
// each band quickly (that IS measured — see generate.test.ts) and so the ramp
// reads sensibly on paper. Whether tier 4 is where a 4×4 kid should first meet
// a 6×6, or whether 5 clean solves per band is the right pace, nobody knows
// yet. Tune by the game-feel doubling/halving rule (grade-baseline.ts): if a
// band plays too easy in a real sitting, move its floor, don't fine-slice.
//
// HOW IT WORKS. The launcher's level (1–10) picks a STARTING band. Within a
// round, a running `score` (0–100) climbs CLEAN_STEP on a clean solve (no
// wrong digits, no hints) and eases MISS_STEP otherwise; specForScore maps the
// score to a band and, within the band, interpolates the number of givens from
// the band's generous end at its floor to its sparse end at its ceiling. So a
// kid who keeps solving cleanly sees the same waffle get slowly emptier, then
// a new technique, then a bigger waffle — and never a cliff.
//
// Chess uses the same shape (chess/ladder.ts: CLEAN_STEP / MISS_STEP over a
// rating); the difference is that sudoku has no library to draw from, so the
// score has to be turned into GENERATOR PARAMETERS, which is what PuzzleSpec is.

import type { SudokuSize, Technique } from './types';
import { TECHNIQUE_RANK } from './types';

export interface LadderBand {
  tier: number;
  size: SudokuSize;
  /** Inclusive range of clues the generator may leave. */
  givens: { min: number; max: number };
  maxTechnique: Technique;
  /** Mirror the blanks through the centre. Off for the smallest grids (a 4×4
   *  with symmetric blanks is nearly always degenerate) and for the top band
   *  (symmetry constrains removal and stalls the sparse end). */
  symmetric: boolean;
  /** Launcher preview text. */
  blurb: string;
}

/** Exactly ten bands, tier 1..10 in order. Sizes never shrink and techniques
 *  never regress as you go down the list — ladder.test.ts pins both.
 *
 *  Givens ranges are the spec's first guess, MEASURED against the generator
 *  (10 tiers × 20 seeds with a timing budget, see generate.test.ts). If a
 *  band stalls that loop, widen its range HERE and record why below — never
 *  paper over it in the generator. Widenings so far: none. */
export const LADDER: readonly LadderBand[] = [
  { tier: 1, size: 4, givens: { min: 10, max: 11 }, maxTechnique: 'singles', symmetric: false, blurb: '4×4 waffle · just a few missing squares' },
  { tier: 2, size: 4, givens: { min: 8, max: 9 }, maxTechnique: 'singles', symmetric: false, blurb: '4×4 waffle · half the squares missing' },
  { tier: 3, size: 4, givens: { min: 6, max: 7 }, maxTechnique: 'hidden', symmetric: false, blurb: '4×4 · hunt for where a number can go' },
  { tier: 4, size: 6, givens: { min: 20, max: 22 }, maxTechnique: 'singles', symmetric: true, blurb: '6×6 waffle · numbers to 6' },
  { tier: 5, size: 6, givens: { min: 15, max: 18 }, maxTechnique: 'hidden', symmetric: true, blurb: '6×6 · a real hunt' },
  { tier: 6, size: 9, givens: { min: 44, max: 48 }, maxTechnique: 'singles', symmetric: true, blurb: 'The big 9×9 waffle, lots of clues' },
  { tier: 7, size: 9, givens: { min: 38, max: 42 }, maxTechnique: 'singles', symmetric: true, blurb: '9×9 · fewer clues' },
  { tier: 8, size: 9, givens: { min: 32, max: 36 }, maxTechnique: 'hidden', symmetric: true, blurb: '9×9 · proper sudoku' },
  { tier: 9, size: 9, givens: { min: 27, max: 30 }, maxTechnique: 'hidden', symmetric: true, blurb: '9×9 · sparse clues' },
  { tier: 10, size: 9, givens: { min: 24, max: 28 }, maxTechnique: 'advanced', symmetric: false, blurb: '9×9 · the trickiest waffle' },
];

export const SCORE_MIN = 0;
export const SCORE_MAX = 100;

/** Score movement per round. Clean solves climb faster than misses fall, so
 *  a kid who mostly solves cleanly still ramps; a kid who mostly slips eases
 *  down gently rather than crashing a whole band per miss. */
export const CLEAN_STEP = 5;
export const MISS_STEP = 3;

/** Points of score per band. 10 bands × 10 = the 0..99 range; 100 clamps in. */
const BAND_WIDTH = 10;

export function clampScore(s: number): number {
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, s));
}

export function bandForTier(tier: number): LadderBand {
  const t = Math.max(1, Math.min(LADDER.length, Math.round(tier)));
  return LADDER[t - 1];
}

/** Where a launcher level starts on the score axis: just inside its band's
 *  floor, so the first waffle is the band's generous end. Note that +2 with a
 *  MISS_STEP of 3 means a slip on the very first waffle followed by "Next
 *  puzzle" serves the band BELOW (tier 1 clamps at 0 and stays). That is the
 *  spec's chosen pair of numbers, and it is one of the dials to watch in a
 *  real sitting — a kid who picked level 5 and slipped once may not want a
 *  level-4 waffle next. "Play again" keeps the score, so it is never forced. */
export function startScoreForTier(tier: number): number {
  const t = Math.max(1, Math.min(LADDER.length, Math.round(tier)));
  return (t - 1) * BAND_WIDTH + 2;
}

export function bandForScore(score: number): LadderBand {
  const s = clampScore(score);
  const t = Math.min(LADDER.length, Math.floor(s / BAND_WIDTH) + 1);
  return LADDER[t - 1];
}

export function stepScore(score: number, clean: boolean): number {
  return clampScore(score + (clean ? CLEAN_STEP : -MISS_STEP));
}

/** What the generator is asked for at a given score. */
export interface PuzzleSpec {
  tier: number;
  size: SudokuSize;
  maxTechnique: Technique;
  symmetric: boolean;
  givens: { min: number; max: number; target: number };
}

/** Band + a givens target that slides from the band's max at its floor to its
 *  min at its ceiling. Score 100 sits at tier 10's ceiling. */
export function specForScore(score: number): PuzzleSpec {
  const s = clampScore(score);
  const band = bandForScore(s);
  const floor = (band.tier - 1) * BAND_WIDTH;
  const ceiling = floor + BAND_WIDTH - 1;
  const pos = Math.min(1, Math.max(0, (s - floor) / (ceiling - floor)));
  const target = Math.round(band.givens.max - pos * (band.givens.max - band.givens.min));
  return {
    tier: band.tier,
    size: band.size,
    maxTechnique: band.maxTechnique,
    symmetric: band.symmetric,
    givens: { min: band.givens.min, max: band.givens.max, target },
  };
}

/** A single number that orders specs by how hard they are: bigger grid, then
 *  harder technique, then fewer givens. Strictly monotonic over the ladder —
 *  ladder.test.ts walks score 0..100 and asserts it never goes down. */
export function difficultyRank(spec: PuzzleSpec): number {
  const cells = spec.size * spec.size;
  return spec.size * 100_000 + TECHNIQUE_RANK[spec.maxTechnique] * 1_000 + (cells - spec.givens.target);
}
