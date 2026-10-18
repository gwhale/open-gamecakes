// Summary tests for Waffle Sudoku.
//
// The formula is the contract with the mastery engine: efficiency ≥ 0.7 is a
// "correct" attempt, taps_total ≥ 3 is the evidence floor, and a hint must
// cost exactly a wrong — pinned here so nobody quietly makes hints free.

import { describe, expect, it } from 'vitest';
import { MIN_EVIDENCE_ANSWERS } from '@/lib/mastery/update';
import { buildSudokuSummary, isCleanSolve, outcomeLine } from './summary';

const base = { sessionStart: Date.now() - 1000, size: 6 as const, tier: 4 };

describe('buildSudokuSummary', () => {
  it('efficiency = (blanks − hints) / (blanks + wrong)', () => {
    const s = buildSudokuSummary({ ...base, blanks: 10, wrong: 2, hints: 1 });
    expect(s.efficiency).toBeCloseTo(9 / 12);
    expect(s.taps_total).toBe(12);
    expect(s.taps_wrong).toBe(3);
    expect(s.optimal_taps).toBe(10);
    expect(s.completed).toBe(true);
    expect(s.session_ms).toBeGreaterThanOrEqual(1000);
  });

  it('a clean solve is 100%', () => {
    expect(buildSudokuSummary({ ...base, blanks: 7, wrong: 0, hints: 0 }).efficiency).toBe(1);
  });

  it('a hint costs exactly a wrong — and never less', () => {
    const hinted = buildSudokuSummary({ ...base, blanks: 10, wrong: 0, hints: 1 });
    const slipped = buildSudokuSummary({ ...base, blanks: 10, wrong: 1, hints: 0 });
    // Both count as one miss to the mastery engine.
    expect(hinted.taps_wrong).toBe(slipped.taps_wrong);
    expect(hinted.taps_wrong).toBe(1);
    // The hinted square was not solved by the kid, so it is also not a point:
    // 9/10 vs 10/11. A hint is never the cheaper way out of a square.
    expect(hinted.efficiency).toBeCloseTo(9 / 10);
    expect(slipped.efficiency).toBeCloseTo(10 / 11);
    expect(hinted.efficiency).toBeLessThanOrEqual(slipped.efficiency);
  });

  it('all hints → efficiency 0', () => {
    const s = buildSudokuSummary({ ...base, blanks: 5, wrong: 0, hints: 5 });
    expect(s.efficiency).toBe(0);
    expect(s.taps_total).toBe(5);
  });

  it('meets the evidence floor for the smallest waffle', () => {
    const s = buildSudokuSummary({ ...base, size: 4, blanks: 5, wrong: 0, hints: 0 });
    expect(s.taps_total).toBeGreaterThanOrEqual(MIN_EVIDENCE_ANSWERS);
  });

  it('meta lines name the waffle and the outcome', () => {
    expect(buildSudokuSummary({ ...base, blanks: 10, wrong: 0, hints: 0 }).meta_lines).toEqual([
      '🧇 Solved the 6×6 waffle',
      '✨ Clean solve!',
    ]);
    expect(buildSudokuSummary({ ...base, size: 9, blanks: 40, wrong: 1, hints: 2 }).meta_lines).toEqual([
      '🧇 Solved the 9×9 waffle',
      '💡 2 hints · ❌ 1 slip',
    ]);
  });
});

describe('isCleanSolve / outcomeLine', () => {
  it('clean means no wrong and no hints', () => {
    expect(isCleanSolve({ wrong: 0, hints: 0 })).toBe(true);
    expect(isCleanSolve({ wrong: 1, hints: 0 })).toBe(false);
    expect(isCleanSolve({ wrong: 0, hints: 1 })).toBe(false);
  });

  it('outcomeLine shows only what happened, with plurals', () => {
    expect(outcomeLine({ wrong: 0, hints: 1 })).toBe('💡 1 hint');
    expect(outcomeLine({ wrong: 3, hints: 0 })).toBe('❌ 3 slips');
    expect(outcomeLine({ wrong: 1, hints: 2 })).toBe('💡 2 hints · ❌ 1 slip');
  });
});
