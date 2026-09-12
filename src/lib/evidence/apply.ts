// Handicap-weighted evidence translator.
//
// Bridges the AI evaluator's qualitative verdicts into the existing adaptive
// engine's binary boolean world. A single verdict becomes N synthetic
// attempts fed into `applyAttempt()` — keeping the mastery engine pure.
//
// The weighting is "golf handicap"-style: each piece of evidence moves the
// kid's mastery only a fraction of what a full game-session attempt would.
// Multiple evidences accumulate over time; a single high-confidence photo
// never flips a tier by itself.
//
// Rules:
//   verdict + confidence + source_weight → N synthetic boolean attempts
//
// Example:
//   verdict=correct, confidence=0.9, source=photo (weight=0.8)
//     → round(0.9 * 0.8 * 2) = 1 correct attempt
//   verdict=partial, confidence=0.7, source=photo (weight=0.8)
//     → round(0.7 * 0.8 * 2) = 1 attempt → splits 1 correct + 1 incorrect
//   verdict=incorrect, confidence=0.5, source=game_session_secondary (weight=0.4)
//     → round(0.5 * 0.4 * 2) = 0 attempts → skipped
//   verdict=correct, confidence=1.0, source=manual (weight=1.0)
//     → round(1.0 * 1.0 * 2) = 2 correct attempts (the max single-event impact)
//
// At most 2 synthetic attempts per verdict, ever. A rolling window of 20
// needs sustained evidence to shift tier, which is the intended behavior.

import type { EvidenceSource, Verdict } from '@/lib/types';

/** Per-source contribution weight (0..1). Photos and parent notes are
 *  moderate evidence; game sessions contribute heavily to their primary
 *  skill (handled by /api/attempts) and LIGHTLY to secondary ones. */
export const SOURCE_WEIGHTS: Record<EvidenceSource, number> = {
  photo: 0.8,
  observation: 0.8,
  text: 0.6,
  manual: 1.0,
  game_session: 0.4,      // secondary skills only (primary is /api/attempts)
  feedback_ticket: 0.25,  // very light — tickets are mostly product signal
};

/** The maximum number of synthetic attempts a single verdict can emit.
 *  Keeps any one artifact from dominating the 20-entry rolling window. */
const MAX_SYNTHETIC = 2;

export interface TranslatedVerdict {
  /** Number of boolean attempts to feed into applyAttempt. */
  syntheticAttempts: number;
  /** The boolean attempts themselves, in order. Mix of true/false for
   *  `partial`, all true for `correct`, all false for `incorrect`. */
  attempts: boolean[];
}

/** Translate one verdict into N synthetic attempts. Pure — no I/O. */
export function translateVerdict(args: {
  verdict: Verdict;
  confidence: number;
  source: EvidenceSource;
}): TranslatedVerdict {
  const { verdict, confidence, source } = args;
  if (verdict === 'not-evidenced') return { syntheticAttempts: 0, attempts: [] };

  const sourceWeight = SOURCE_WEIGHTS[source] ?? 0.5;
  const clamped = Math.max(0, Math.min(1, confidence));

  // Raw contribution before rounding. The `* MAX_SYNTHETIC` scales
  // confidence×weight=[0,1] to the [0,2] synthetic range.
  const raw = clamped * sourceWeight * MAX_SYNTHETIC;
  const n = Math.round(raw);
  if (n <= 0) return { syntheticAttempts: 0, attempts: [] };

  if (verdict === 'correct') {
    return { syntheticAttempts: n, attempts: Array.from({ length: n }, () => true) };
  }
  if (verdict === 'incorrect') {
    return { syntheticAttempts: n, attempts: Array.from({ length: n }, () => false) };
  }
  // partial — split as evenly as possible. For n=1, one correct (generous).
  // For n=2, one correct + one incorrect.
  if (n === 1) return { syntheticAttempts: 1, attempts: [true] };
  return { syntheticAttempts: 2, attempts: [true, false] };
}

/** Resolve the numeric source weight for display in the UI. Kept here so
 *  the UI and the translator agree on one canonical value. */
export function sourceWeight(source: EvidenceSource): number {
  return SOURCE_WEIGHTS[source] ?? 0.5;
}
