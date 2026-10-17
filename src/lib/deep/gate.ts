// The treasure-chest gate: three correct answers, and the lid opens.
//
// Pure and dependency-free of React, the DB and `three`, because two different
// machines have to agree about it. The browser poses the questions and gives
// instant feedback; the server decides whether the chest actually opens. If
// those two disagreed about what question number 4 was, the gate would either
// cheat kids or be cheatable.
//
// THERE IS NO FAILURE STATE, and it lives here rather than in the dialog so it
// cannot quietly become a streak when someone tidies the UI. A wrong answer
// advances the question and costs nothing else: no lives, no reset, no lockout.
// The chest is not a test. A kid who needs eleven questions to get three right
// has just done eleven questions, which is the entire point of the feature.
//
// HOW THE SERVER CAN CHECK WITHOUT REMEMBERING ANYTHING. The obvious design is
// a runs table: serve a question, store its answer, wait. That is a migration, a
// row per attempt, and a cleanup job for every kid who swims away mid-question.
// Instead every question is DERIVED from (kid, chest, index), so the server can
// regenerate any question it has ever asked and re-mark the whole run from the
// answers alone. The client sends what it typed, never whether it was right.
//
// The generators upstream are not seeded — they call Math.random 27 times
// across three modules — so `withSeededRandom` swaps in a deterministic stream
// for the duration of one synchronous call. That is safe here specifically
// because generateChallengeForMode does no I/O and never awaits, so nothing
// else can observe the swapped global in between. Do not lift this helper
// somewhere it might wrap an async call.

import { parseSeed, seeded } from './world-math';
import {
  generateChallengeForMode,
  type ChallengeMode,
  type MathKind,
} from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';

/** How many right answers open a chest. */
export const NEEDED_CORRECT = 3;

/** What the chest is asking about. Built from whatever pickNext() recommended,
 *  so the questions are the ones the educator already believed were due. */
export interface GateSpec {
  mode: ChallengeMode;
  mathType?: MathKind;
  /** 1-10. */
  tier: number;
  skillId: string;
  skillSlug: string;
  /** Kid-facing name of the skill, for the dialog header. */
  displayName: string;
  /** pickNext()'s own sentence about why this skill. */
  reason: string;
}

export interface GateProgress {
  /** How many questions have been answered, right or wrong. */
  asked: number;
  /** Right answers so far, capped at `needed`. */
  correct: number;
  needed: number;
  /** True once the chest may be opened. */
  open: boolean;
}

/** Fold a run's results into progress. The only place the rule lives. */
export function gateProgress(
  results: readonly boolean[],
  needed: number = NEEDED_CORRECT,
): GateProgress {
  const right = results.reduce((n, r) => n + (r ? 1 : 0), 0);
  return {
    asked: results.length,
    correct: Math.min(right, needed),
    needed,
    open: right >= needed,
  };
}

/**
 * The seed for one question. Derived from the kid and the chest, so:
 *   - the client and the server generate the same thing without talking;
 *   - a kid cannot reroll into easier questions by reloading, because nothing
 *     about the request chooses the seed;
 *   - two kids at the same chest get different questions.
 */
export function questionSeed(kidId: string, chestSlug: string, index: number): number {
  return parseSeed(`${kidId}|${chestSlug}|${index}`);
}

function withSeededRandom<T>(seed: number, fn: () => T): T {
  const real = Math.random;
  Math.random = seeded(seed);
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

/** Questions per index we are willing to reject before giving up on the mode. */
const RETRIES = 8;

/**
 * The question at a given index. Deterministic: same arguments, same question,
 * on either side of the network.
 *
 * Multi-part ('steps') challenges are skipped. They are a fine thing to be
 * asked in a game that can show working, but the gate sends ONE typed answer
 * back to be re-marked, and a question whose correctness depends on three
 * intermediate values cannot be checked from that. Rejecting them by re-rolling
 * a salted seed keeps both sides in step without renumbering the run.
 */
export function challengeAt(
  spec: GateSpec,
  kidId: string,
  chestSlug: string,
  index: number,
): Challenge {
  for (let salt = 0; salt < RETRIES; salt++) {
    const c = withSeededRandom(questionSeed(kidId, chestSlug, index * 16 + salt), () =>
      generateChallengeForMode(spec.mode, { tier: spec.tier, mathType: spec.mathType }),
    );
    if (c.kind !== 'steps') return c;
  }
  // A mode that only ever yields multi-part questions would otherwise hand back
  // a chest that cannot be opened. Plain arithmetic at the same tier is a worse
  // question than the one we wanted and a much better outcome than a dead lid.
  return withSeededRandom(questionSeed(kidId, chestSlug, index * 16 + RETRIES), () =>
    generateChallengeForMode('math', { tier: spec.tier, mathType: 'mixed' }),
  );
}

/**
 * Is this the right answer? Takes the RAW thing the kid entered, never the
 * browser's opinion of whether it was correct — that opinion is one devtools
 * call from being `true` forever.
 */
export function isAnswerCorrect(challenge: Challenge, given: string): boolean {
  if (typeof given !== 'string') return false;
  if (challenge.kind === 'numeric') {
    const n = Number.parseInt(given.trim(), 10);
    return Number.isFinite(n) && n === challenge.answer;
  }
  if (challenge.kind === 'choice') {
    return given === challenge.answer;
  }
  // 'steps' never reaches a gate — challengeAt rejects it.
  return false;
}

/** Re-mark a whole run from its answers. This is what makes the gate
 *  server-authoritative: the client's claims are not part of the input. */
export function markRun(
  spec: GateSpec,
  kidId: string,
  chestSlug: string,
  answers: readonly string[],
): { results: boolean[]; progress: GateProgress } {
  const results: boolean[] = [];
  for (let i = 0; i < answers.length; i++) {
    // Stop marking the moment the chest is open: answers sent after that are
    // not part of the run, and honouring them would let a long tail of junk
    // extend a run that had already finished.
    if (gateProgress(results).open) break;
    results.push(isAnswerCorrect(challengeAt(spec, kidId, chestSlug, i), answers[i]));
  }
  return { results, progress: gateProgress(results) };
}

/** Longest run we will re-mark. A kid answering this many questions at one
 *  chest has stopped playing and started poking, and each answer costs a
 *  challenge generation on the server. */
export const MAX_ANSWERS = 60;

/**
 * Build a spec from what the recommender said. Kept as loose primitives rather
 * than taking a Recommendation, so lib/deep does not grow a dependency on
 * lib/recommendations for one field.
 */
export function gateSpec(args: {
  subject: 'math' | 'reading';
  /** practiceOpFor(skillSlug) — a MathKind for math, a reading type otherwise. */
  op: string | null;
  tier: number;
  skillId: string;
  skillSlug: string;
  displayName: string;
  reason: string;
}): GateSpec {
  const tier = Math.max(1, Math.min(10, Math.round(args.tier)));
  const base = {
    tier,
    skillId: args.skillId,
    skillSlug: args.skillSlug,
    displayName: args.displayName,
    reason: args.reason,
  };
  if (args.subject === 'math') {
    return { ...base, mode: 'math', mathType: (args.op ?? 'mixed') as MathKind };
  }
  // For reading the op IS the challenge mode. 'mixed' rotates across the
  // reading types, which is the right fallback for a skill with no mapping.
  return { ...base, mode: (args.op ?? 'mixed') as ChallengeMode };
}
