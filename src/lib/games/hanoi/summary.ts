// Cake Shift — the /api/attempts SessionSummary for one solved tower.
//
// The mastery engine wants "answers": taps_total, taps_wrong, and an
// efficiency in 0..1. A Hanoi round has no questions, so the mapping is:
//
//   score        = par (2^n − 1)        the moves that HAD to happen
//   wrongAnswers = excess + hints        every move past par, plus each hint
//   efficiency   = par / (par + excess + hints)
//
// so a par solve with no hints scores 1.0, and a kid who took 10 on a par-7
// still finishes with a real 0.7 — never a zero, never a "fail". The
// denominator is a count of moves, so taps_total ≥ 7 even for the smallest
// tower and MIN_EVIDENCE_ANSWERS (3) always holds; every completed tower is
// evidence.

import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { minMoves } from './ladder';
import { CAKE_SHIFT_GLYPH } from './name';

export interface HanoiRound {
  /** Layer count of the tower just solved. */
  n: number;
  /** Legal moves the kid made. */
  moves: number;
  /** Hints used. Each one costs the same as one move over par. */
  hints: number;
  /** Date.now() when the tower was set up. */
  sessionStart: number;
  /** False only if the round is being reported unfinished. Defaults true. */
  completed?: boolean;
}

export function buildHanoiSummary(round: HanoiRound): SessionSummary {
  const optimal = minMoves(round.n);
  const excess = Math.max(0, round.moves - optimal);
  const hints = Math.max(0, round.hints);
  const line2 =
    hints > 0
      ? `💡 ${hints} hint${hints === 1 ? '' : 's'}`
      : excess === 0
        ? '✨ Perfect!'
        : `🧁 ${excess} over par`;
  return buildSessionSummary({
    score: optimal,
    wrongAnswers: excess + hints,
    sessionStart: round.sessionStart,
    completed: round.completed ?? true,
    optimalTaps: optimal,
    metaLines: [`${CAKE_SHIFT_GLYPH} ${round.moves} moves · par ${optimal}`, line2],
  });
}
