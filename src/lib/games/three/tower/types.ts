// Shared types + tuning for the Cakey Tower 3D game.
//
// Cakey Tower is a candy remake of *Glass Tower*: a physics tower of stacked
// candy blocks. Solve a math/reading problem to earn a BITE, then tap a MINT
// candy to eat it — the tower shifts and settles under gravity. Don't let a
// strawberry GUMMY tumble off the plate and splat (−1 life). Eat every mint to
// win; run out of lives to lose. The rules themselves are in rules.ts.
//
// Bundle hygiene (same rule as the Castle/Sandcastle modules): NO runtime
// `three` / `cannon-es` import here — the loaded namespaces arrive as engine
// args. `import type` only, fully erased by the compiler.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { Difficulty, DifficultyTuning, LandscapeTheme } from '../types';
import { DIFFICULTY, resolveTheme } from '../types';

export type { Difficulty, LandscapeTheme };
export { resolveTheme };

/** Props the shell threads through to the host/engine. */
export interface TowerSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

/** The four candy-block roles a kid must read at a glance. */
export type BlockRole = 'good' | 'bad' | 'hard' | 'mystery';

/** Cakey Tower tuning. Reuses the shared physics `gravity`/`shadows`, and adds
 *  the puzzle knobs: how tall the tower is, how many gummies hide in it, and
 *  how many lives the kid gets. */
export interface TowerTuning extends DifficultyTuning {
  /** Lives — one lost each time a strawberry gummy tumbles off and splats. */
  lives: number;
  /** Number of stacked courses in the tower (scales with tier). */
  courses: number;
  /** Fraction of blocks that are BAD (a gummy: keep it on the plate). */
  badFraction: number;
  /** Fraction of blocks that are HARD (chocolate brittle: heavy, can't be
   *  eaten, but it does fall and does knock things). */
  hardFraction: number;
  /** Chance a block is a MYSTERY gobstopper (a lucky mint or a new gummy on tap). */
  mysteryChance: number;
}

/** Lives by difficulty — one per gummy splat before the round is lost. */
const LIVES_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 5,
  medium: 3,
  hard: 2,
};

/** Base tower courses + hazard mix by difficulty. Tuned by user-perceptible
 *  doubling/halving, not 10% (Gamecakes game-feel standard); needs a live
 *  playtest pass — start generous/kid-forgiving. */
//
//  A `splatSpeed` knob (impact speed above which a landing gummy counted as a
//  splat) used to sit beside these. The engine never read it: a gummy splats
//  when its centre drops below the plate, full stop. Deleted rather than
//  implemented — one rule a kid can see beats a second one they cannot.
const MIX_BY_DIFFICULTY: Record<Difficulty, { courses: number; badFraction: number; hardFraction: number; mysteryChance: number }> = {
  easy:   { courses: 7,  badFraction: 0.15, hardFraction: 0.10, mysteryChance: 0.00 },
  medium: { courses: 9,  badFraction: 0.22, hardFraction: 0.14, mysteryChance: 0.06 },
  hard:   { courses: 11, badFraction: 0.30, hardFraction: 0.18, mysteryChance: 0.12 },
};

/** Hard cap so a high-tier bonus can never build an unplayably tall tower. */
export const MAX_COURSES = 14;

/** Resolve tower tuning for a difficulty + tier. The tower grows +0..+3 courses
 *  by tier (mirrors resolveTuning's building bonus); `tier` itself also scales
 *  the *math* difficulty via generateMathChallenge. */
export function resolveTowerTuning(difficulty: Difficulty, tier: number): TowerTuning {
  const base = DIFFICULTY[difficulty];
  const mix = MIX_BY_DIFFICULTY[difficulty];
  const bonus = Math.min(3, Math.max(0, Math.floor((tier - 1) / 3)));
  return {
    ...base,
    lives: LIVES_BY_DIFFICULTY[difficulty],
    courses: Math.min(MAX_COURSES, mix.courses + bonus),
    badFraction: mix.badFraction,
    hardFraction: mix.hardFraction,
    mysteryChance: mix.mysteryChance,
  };
}

// starsForRun lives in rules.ts with the rest of the round's rules.
