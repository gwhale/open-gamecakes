// Waffle Sudoku — turning a solved waffle into a SessionSummary.
//
// There is no clock, so "how well did it go" is efficiency alone:
//
//     efficiency = (blanks − hints) / (blanks + wrong)
//
// via buildSessionSummary({ score: blanks − hints, wrongAnswers: wrong + hints,
// optimalTaps: blanks }). Read it as: every blank the kid filled unaided is a
// point; every wrong digit is a miss; and a HINT COSTS EXACTLY A WRONG — it
// removes a point from the numerator AND adds a miss to the denominator, the
// same as slipping once and then getting it. A kid who hints every square
// scores 0, which is right: the waffle was solved, but not by them.
//
// The mastery engine calls efficiency ≥ 0.7 "correct" and needs taps_total ≥
// MIN_EVIDENCE_ANSWERS (3) to count the session at all; taps_total here is
// blanks + wrong, and the smallest band leaves 5 blanks, so a solve always
// counts.

import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import type { SudokuSize } from './types';

export interface SudokuOutcome {
  blanks: number;
  wrong: number;
  hints: number;
  sessionStart: number;
  size: SudokuSize;
  tier: number;
}

/** No wrong digits, no hints. The ladder steps up only on these. */
export function isCleanSolve(o: Pick<SudokuOutcome, 'wrong' | 'hints'>): boolean {
  return o.wrong === 0 && o.hints === 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Second overlay line: a clean-solve badge, or what it cost. */
export function outcomeLine(o: Pick<SudokuOutcome, 'wrong' | 'hints'>): string {
  if (isCleanSolve(o)) return '✨ Clean solve!';
  const parts: string[] = [];
  if (o.hints > 0) parts.push(`💡 ${plural(o.hints, 'hint', 'hints')}`);
  if (o.wrong > 0) parts.push(`❌ ${plural(o.wrong, 'slip', 'slips')}`);
  return parts.join(' · ');
}

export function buildSudokuSummary(o: SudokuOutcome): SessionSummary {
  const hints = Math.min(o.hints, o.blanks);
  return buildSessionSummary({
    score: o.blanks - hints,
    wrongAnswers: o.wrong + hints,
    optimalTaps: o.blanks,
    sessionStart: o.sessionStart,
    completed: true,
    metaLines: [`🧇 Solved the ${o.size}×${o.size} waffle`, outcomeLine(o)],
  });
}
