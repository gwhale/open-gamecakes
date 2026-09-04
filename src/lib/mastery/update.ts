// Mastery update — the heart of the adaptive engine.
//
// Pure TypeScript. NO Supabase imports, NO DOM, NO side effects. Given a
// kid_skills row state and a new attempt, compute the next state and
// whether the kid just tiered up or down. The DB layer calls this to
// recompute what to write; tests (when we add them) feed it synthetic
// sequences of attempts and assert on the trajectory.
//
// Algorithm (rolling window):
//   - Append this attempt's `correct` flag to a last-20 sliding window.
//   - `mastery_pct` = correctCount / windowLength.
//   - After at least MIN_FOR_CHANGE attempts in the current tier:
//     * if mastery_pct >= TIER_UP_THRESHOLD and current_tier < MAX_TIER
//       → bump the tier, RESET the window (so the next tier gets a fresh
//         baseline and doesn't inherit the previous tier's easy wins)
//     * if mastery_pct <= TIER_DOWN_THRESHOLD and current_tier > MIN_TIER
//       → drop the tier, RESET the window (so one bad session at the new
//         easier tier doesn't immediately bounce them back up)
//
// "Correct" here is game-template-defined. For Math Maze, correct means
// "efficiency >= 0.7" (path efficiency is `optimal_taps / total_taps`).
// For a multiple choice quiz, correct might mean "≥ 80% of questions
// answered correctly this session." The mastery function doesn't care —
// it just consumes booleans.

export const MAX_WINDOW = 20;
export const MIN_FOR_CHANGE = 10;
export const TIER_UP_THRESHOLD = 0.8;
export const TIER_DOWN_THRESHOLD = 0.3;
export const MAX_TIER = 10;
export const MIN_TIER = 1;

// A session must contain at least this many answered problems before it
// counts as mastery evidence. You can't assess a skill from a 19-second
// session where the kid answered nothing — and the live data showed
// exactly that: the majority of "failed" attempts were 0-2 answer
// micro-sessions (kid opened a game, poked it, bounced). Those were
// dragging windows below TIER_DOWN_THRESHOLD and demoting kids who had
// shown no actual evidence either way. Sessions below this floor are
// still audit-logged in `attempts`; they just don't touch kid_skills.
export const MIN_EVIDENCE_ANSWERS = 3;

/** One entry in the rolling window. Matches kid_skills.recent_window jsonb. */
export interface WindowEntry {
  correct: boolean;
  ts: string; // ISO-8601
}

/** Subset of the kid_skills row that this function reads and writes. */
export interface KidSkillState {
  current_tier: number;
  mastery_pct: number;
  total_attempts: number;
  recent_window: WindowEntry[];
}

/** The input attempt — just the two fields the algorithm needs. */
export interface AttemptInput {
  correct: boolean;
  ts: string;
}

/** What changed as a result of applying this attempt. */
export interface MasteryUpdate {
  next: KidSkillState;
  tieredUp: boolean;
  tieredDown: boolean;
}

/** Zero state for a brand-new (kid, skill) pair — matches the DB defaults. */
export function initialKidSkillState(): KidSkillState {
  return {
    current_tier: MIN_TIER,
    mastery_pct: 0,
    total_attempts: 0,
    recent_window: [],
  };
}

/**
 * Apply a new attempt to a kid_skills state.
 *
 * This is the ONLY place the tier-up/tier-down rules live. Everything else
 * (API route, tests, parent dashboard) derives its behavior from what this
 * function returns.
 */
export function applyAttempt(
  state: KidSkillState,
  attempt: AttemptInput,
): MasteryUpdate {
  // Append + trim the window to the last MAX_WINDOW entries.
  const trimmedWindow: WindowEntry[] = [...state.recent_window, attempt].slice(-MAX_WINDOW);

  const correctCount = trimmedWindow.reduce((n, e) => n + (e.correct ? 1 : 0), 0);
  const masteryPct = trimmedWindow.length > 0 ? correctCount / trimmedWindow.length : 0;

  const base: KidSkillState = {
    current_tier: state.current_tier,
    mastery_pct: masteryPct,
    total_attempts: state.total_attempts + 1,
    recent_window: trimmedWindow,
  };

  // Not enough data in the current-tier window to justify a tier change.
  if (trimmedWindow.length < MIN_FOR_CHANGE) {
    return { next: base, tieredUp: false, tieredDown: false };
  }

  if (masteryPct >= TIER_UP_THRESHOLD && state.current_tier < MAX_TIER) {
    return {
      next: {
        current_tier: state.current_tier + 1,
        mastery_pct: 0,
        total_attempts: base.total_attempts,
        recent_window: [],
      },
      tieredUp: true,
      tieredDown: false,
    };
  }

  if (masteryPct <= TIER_DOWN_THRESHOLD && state.current_tier > MIN_TIER) {
    return {
      next: {
        current_tier: state.current_tier - 1,
        mastery_pct: 0,
        total_attempts: base.total_attempts,
        recent_window: [],
      },
      tieredUp: false,
      tieredDown: true,
    };
  }

  return { next: base, tieredUp: false, tieredDown: false };
}
