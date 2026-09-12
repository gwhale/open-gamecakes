// Grader tests for Waffle Sudoku.
//
// The grade is the ladder's whole notion of difficulty. If 'singles' is ever
// awarded to a puzzle that needs a hidden single, tier 1 kids get tier 3
// puzzles and nobody can tell from the code.

import { describe, expect, it } from 'vitest';
import { generatePuzzle } from './generate';
import { applyHiddenSingles, applyNakedSingles, gradePuzzle, techniqueAtMost } from './grade';
import { solve } from './solver';
import { FOUR_SINGLES, FOUR_SOLUTION, NINE_GIVENS, NINE_SOLUTION, grid } from './solver.test';
import { SPECS } from './types';

// 4s and 3s only. Naked singles find nothing; hidden singles place both 3s.
// It has TWO solutions (swap every 1 and 2), so it grades 'invalid'.
const FOUR_TWO_SOLUTIONS = grid(['...4', '34..', '..43', '4...']);

// AI Escargot — 23 clues, famously beyond singles, exactly one solution.
const NINE_HARD = grid([
  '1....7.9.',
  '.3..2...8',
  '..96..5..',
  '..53..9..',
  '.1..8...2',
  '6....4...',
  '3......1.',
  '.4......7',
  '..7...3..',
]);

describe('applyNakedSingles / applyHiddenSingles', () => {
  it('naked singles finish the singles-only 4×4', () => {
    const cells = new Uint8Array(FOUR_SINGLES);
    expect(applyNakedSingles(SPECS[4], cells)).toBe(8);
    expect(Array.from(cells)).toEqual(Array.from(FOUR_SOLUTION));
  });

  it('a hidden single is found where naked singles see nothing', () => {
    const cells = new Uint8Array(FOUR_TWO_SOLUTIONS);
    expect(applyNakedSingles(SPECS[4], cells)).toBe(0);
    const placed = applyHiddenSingles(SPECS[4], cells);
    expect(placed).toBeGreaterThanOrEqual(2);
    expect(cells[2]).toBe(3); // r0c2 — the only home for 3 in row 0
    expect(cells[13]).toBe(3); // r3c1 — the only home for 3 in row 3
  });

  it('reports a contradiction rather than filling nonsense', () => {
    const cells = grid(['12..', '..12', '2.4.', '.3.4']); // r3c3=4 clashes with r0c3's forced 4
    expect(applyNakedSingles(SPECS[4], cells)).toBe(-1);
  });
});

describe('gradePuzzle', () => {
  it("grades a singles-only 4×4 'singles'", () => {
    const r = gradePuzzle(SPECS[4], FOUR_SINGLES, FOUR_SOLUTION);
    expect(r.grade).toBe('singles');
    expect(Array.from(r.filled)).toEqual(Array.from(FOUR_SOLUTION));
  });

  it("grades a puzzle that needs a hidden single 'hidden'", () => {
    // Search the generator for a small puzzle singles cannot finish. The
    // generator only promises "≤ hidden", so this finds one that is exactly
    // hidden, then checks the grader's two verdicts on it agree.
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const p = generatePuzzle(
        { size: 6, givens: { min: 12, max: 18, target: 12 }, maxTechnique: 'hidden', symmetric: false },
        seed,
      );
      const singlesOnly = new Uint8Array(p.givens);
      applyNakedSingles(SPECS[6], singlesOnly);
      if (singlesOnly.includes(0)) {
        found = true;
        expect(p.technique).toBe('hidden');
        const r = gradePuzzle(SPECS[6], p.givens, p.solution);
        expect(r.grade).toBe('hidden');
        expect(Array.from(r.filled)).toEqual(Array.from(p.solution));
        // The early-exit used by the generator reports "harder than singles".
        expect(gradePuzzle(SPECS[6], p.givens, p.solution, 'singles').grade).toBe('advanced');
      }
    }
    expect(found).toBe(true);
  });

  it("grades a known hard 9×9 'advanced'", () => {
    const r = gradePuzzle(SPECS[9], NINE_HARD);
    expect(r.grade).toBe('advanced');
    expect(r.filled.includes(0)).toBe(true); // singles stalled
  });

  it("grades a two-solution 4×4 'invalid'", () => {
    expect(gradePuzzle(SPECS[4], FOUR_TWO_SOLUTIONS).grade).toBe('invalid');
  });

  it("grades a contradictory grid 'invalid'", () => {
    expect(gradePuzzle(SPECS[4], grid(['11..', '....', '....', '....'])).grade).toBe('invalid');
  });

  it('the logical fill equals the backtracking solution', () => {
    const r = gradePuzzle(SPECS[9], NINE_GIVENS);
    expect(['singles', 'hidden']).toContain(r.grade);
    expect(Array.from(r.filled)).toEqual(Array.from(solve(SPECS[9], NINE_GIVENS)!));
    expect(Array.from(r.filled)).toEqual(Array.from(NINE_SOLUTION));
  });

  it('never mutates the givens', () => {
    const before = Array.from(NINE_HARD);
    gradePuzzle(SPECS[9], NINE_HARD);
    expect(Array.from(NINE_HARD)).toEqual(before);
  });
});

describe('techniqueAtMost', () => {
  it('orders singles < hidden < advanced and rejects invalid', () => {
    expect(techniqueAtMost('singles', 'singles')).toBe(true);
    expect(techniqueAtMost('hidden', 'singles')).toBe(false);
    expect(techniqueAtMost('hidden', 'hidden')).toBe(true);
    expect(techniqueAtMost('advanced', 'hidden')).toBe(false);
    expect(techniqueAtMost('singles', 'advanced')).toBe(true);
    expect(techniqueAtMost('invalid', 'advanced')).toBe(false);
  });
});
