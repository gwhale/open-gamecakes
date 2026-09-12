// Solver tests for Waffle Sudoku.
//
// The solver is the one piece that must be exactly right: a fill that breaks
// the box rule on a 6×6, or a solution count that stops one short, would ship
// a kid a waffle with two answers and no way to know which the pad wants.

import { describe, expect, it } from 'vitest';
import { makeRng } from '@/lib/games/opponents/rng';
import { candidates, countSolutions, fillGrid, solve } from './solver';
import { SPECS, type SudokuSize, isValidSolution } from './types';

export function grid(rows: string[]): Uint8Array {
  const out: number[] = [];
  for (const row of rows) {
    for (const ch of row.replace(/[|\s]/g, '')) out.push(ch === '.' ? 0 : Number(ch));
  }
  return Uint8Array.from(out);
}

export const FOUR_SOLUTION = grid(['1234', '3412', '2143', '4321']);
export const FOUR_SINGLES = grid(['12..', '..12', '2.4.', '.3.1']);

export const SIX_SOLUTION = grid(['123456', '456123', '231564', '564231', '312645', '645312']);
// One blank per row, all in different columns — each is a naked single.
export const SIX_GIVENS = grid(['.23456', '4.6123', '23.564', '564.31', '3126.5', '64531.']);

// The canonical Wikipedia example — 30 clues, singles all the way.
export const NINE_GIVENS = grid([
  '53..7....',
  '6..195...',
  '.98....6.',
  '8...6...3',
  '4..8.3..1',
  '7...2...6',
  '.6....28.',
  '...419..5',
  '....8..79',
]);
export const NINE_SOLUTION = grid([
  '534678912',
  '672195348',
  '198342567',
  '859761423',
  '426853791',
  '713924856',
  '961537284',
  '287419635',
  '345286179',
]);

describe('solve', () => {
  it('solves a hand-written 4×4 to its known solution', () => {
    expect(Array.from(solve(SPECS[4], FOUR_SINGLES)!)).toEqual(Array.from(FOUR_SOLUTION));
  });

  it('solves a hand-written 6×6 to its known solution', () => {
    expect(Array.from(solve(SPECS[6], SIX_GIVENS)!)).toEqual(Array.from(SIX_SOLUTION));
  });

  it('solves the Wikipedia 9×9 to its known solution', () => {
    expect(Array.from(solve(SPECS[9], NINE_GIVENS)!)).toEqual(Array.from(NINE_SOLUTION));
  });

  it('returns null for a contradictory grid', () => {
    const bad = grid(['11..', '....', '....', '....']);
    expect(solve(SPECS[4], bad)).toBeNull();
  });

  it('never mutates its input', () => {
    const before = Array.from(NINE_GIVENS);
    solve(SPECS[9], NINE_GIVENS);
    countSolutions(SPECS[9], NINE_GIVENS);
    expect(Array.from(NINE_GIVENS)).toEqual(before);
  });
});

describe('countSolutions', () => {
  it('is 0 for a contradiction', () => {
    expect(countSolutions(SPECS[4], grid(['11..', '....', '....', '....']))).toBe(0);
  });

  it('is 1 for a proper puzzle', () => {
    expect(countSolutions(SPECS[4], FOUR_SINGLES)).toBe(1);
    expect(countSolutions(SPECS[9], NINE_GIVENS)).toBe(1);
  });

  it('stops at the limit on an empty 4×4 (which has 288 solutions)', () => {
    const empty = new Uint8Array(16);
    expect(countSolutions(SPECS[4], empty)).toBe(2);
    expect(countSolutions(SPECS[4], empty, 1)).toBe(1);
    expect(countSolutions(SPECS[4], empty, 5)).toBe(5);
    expect(countSolutions(SPECS[4], empty, 1000)).toBe(288);
  });
});

describe('candidates', () => {
  it('is the bitmask of digits no peer uses', () => {
    // r0c2 of FOUR_SINGLES: row has 1,2; column has 1,4 → only 3.
    expect(candidates(SPECS[4], FOUR_SINGLES, 2)).toBe(1 << 3);
    // A filled cell has no candidates.
    expect(candidates(SPECS[4], FOUR_SINGLES, 0)).toBe(0);
  });
});

describe('fillGrid', () => {
  for (const size of [4, 6, 9] as SudokuSize[]) {
    it(`fills a valid ${size}×${size}, deterministically per seed`, () => {
      const a = fillGrid(SPECS[size], makeRng(7));
      const b = fillGrid(SPECS[size], makeRng(7));
      const c = fillGrid(SPECS[size], makeRng(8));
      expect(isValidSolution(SPECS[size], a)).toBe(true);
      expect(isValidSolution(SPECS[size], c)).toBe(true);
      expect(Array.from(a)).toEqual(Array.from(b));
      expect(Array.from(a)).not.toEqual(Array.from(c));
    });
  }
});
