// Waffle Sudoku — the grader. "How hard is this puzzle, for a kid?"
//
// Difficulty is not a count of givens (a 9×9 with 30 clues can be trivial or
// brutal). It is the hardest TECHNIQUE a purely logical solve needs:
//
//   singles  — every step is a naked single: a blank whose peers leave it one
//              candidate. A kid can always "look at the square and see".
//   hidden   — some steps need a hidden single: a digit that has only one
//              home left in a row/column/box. The kid looks at the NUMBER
//              instead of the square. That is the T3 / T5 / T8 / T9 jump.
//   advanced — singles stall before the grid is done, but backtracking says
//              exactly one solution exists. Real sudoku; top of the ladder.
//   invalid  — zero or many solutions. The generator never returns one.
//
// A logical solve IS a uniqueness proof: naked and hidden singles are sound
// deductions, so if they fill the grid, that filling is the only one. The
// expensive countSolutions is called only for the puzzles singles cannot
// finish — which is why generating a 'singles' 9×9 stays cheap.
//
// `applyNakedSingles` / `applyHiddenSingles` MUTATE their argument (they are
// the hot loop, and copying per step would dominate generation). gradePuzzle
// copies once and hands the copy to them.

import { buildMasks, fullMask, lowestDigit, popcount, countSolutions } from './solver';
import {
  type Cells,
  type GridSpec,
  type Technique,
  TECHNIQUE_RANK,
  isValidSolution,
  tablesFor,
  unitsOf,
} from './types';

export type Grade = Technique | 'invalid';

/** Fill every naked single, repeat to fixpoint. Mutates `cells`.
 *  Returns the number of cells filled, or -1 if a blank ran out of candidates
 *  (the grid is contradictory; the caller should stop trusting it). */
export function applyNakedSingles(spec: GridSpec, cells: Cells): number {
  const masks = buildMasks(spec, cells);
  if (!masks) return -1;
  const { rows, cols, boxes } = masks;
  const { rowOf, colOf, boxOfCell } = tablesFor(spec);
  const full = fullMask(spec);
  let filled = 0;
  let progress = true;
  while (progress) {
    progress = false;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== 0) continue;
      const m = full & ~(rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOfCell[i]]);
      if (m === 0) return -1;
      if (popcount(m) === 1) {
        const d = lowestDigit(m);
        cells[i] = d;
        rows[rowOf[i]] |= m;
        cols[colOf[i]] |= m;
        boxes[boxOfCell[i]] |= m;
        filled++;
        progress = true;
      }
    }
  }
  return filled;
}

/** Fill every hidden single (a digit with exactly one candidate cell in some
 *  unit), then naked singles, repeat to fixpoint. Mutates `cells`.
 *  Same return convention as applyNakedSingles. */
export function applyHiddenSingles(spec: GridSpec, cells: Cells): number {
  const { rowOf, colOf, boxOfCell } = tablesFor(spec);
  const full = fullMask(spec);
  const n = spec.size;
  let filled = 0;
  let progress = true;
  while (progress) {
    progress = false;
    const masks = buildMasks(spec, cells);
    if (!masks) return -1;
    const { rows, cols, boxes } = masks;
    for (const unit of unitsOf(spec)) {
      // Which digits are still missing from this unit, and where each could go.
      let present = 0;
      for (const i of unit) present |= 1 << cells[i];
      const missing = full & ~present;
      if (missing === 0) continue;
      for (let d = 1; d <= n; d++) {
        const bit = 1 << d;
        if (!(missing & bit)) continue;
        let home = -1;
        let homes = 0;
        for (const i of unit) {
          if (cells[i] !== 0) continue;
          const m = full & ~(rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOfCell[i]]);
          if (m & bit) {
            homes++;
            home = i;
            if (homes > 1) break;
          }
        }
        if (homes === 0) return -1;
        if (homes === 1) {
          cells[home] = d;
          rows[rowOf[home]] |= bit;
          cols[colOf[home]] |= bit;
          boxes[boxOfCell[home]] |= bit;
          filled++;
          progress = true;
        }
      }
    }
    if (progress) {
      const more = applyNakedSingles(spec, cells);
      if (more < 0) return -1;
      filled += more;
    }
  }
  return filled;
}

function isComplete(cells: Cells): boolean {
  for (let i = 0; i < cells.length; i++) if (cells[i] === 0) return false;
  return true;
}

export interface GradeResult {
  grade: Grade;
  /** The grid after the logical solve. Complete for 'singles' / 'hidden'; the
   *  stalled partial for 'advanced'; whatever was reached for 'invalid'. */
  filled: Cells;
}

/** Grade `givens`. If `solution` is supplied, a logical solve that disagrees
 *  with it is reported 'invalid' rather than trusted. Never mutates `givens`.
 *
 *  `stopAfter` is an optimisation for the generator: once the grade is known
 *  to exceed it, return early ('advanced' stands in for "harder than asked")
 *  instead of paying for the hidden-singles pass or a solution count. */
export function gradePuzzle(
  spec: GridSpec,
  givens: Cells,
  solution?: Cells,
  stopAfter?: Technique,
): GradeResult {
  const filled = new Uint8Array(givens);
  const agrees = (): boolean =>
    isValidSolution(spec, filled) && (!solution || sameCells(filled, solution));

  const naked = applyNakedSingles(spec, filled);
  if (naked < 0) return { grade: 'invalid', filled };
  if (isComplete(filled)) return { grade: agrees() ? 'singles' : 'invalid', filled };
  if (stopAfter === 'singles') return { grade: 'advanced', filled };

  const hidden = applyHiddenSingles(spec, filled);
  if (hidden < 0) return { grade: 'invalid', filled };
  if (isComplete(filled)) return { grade: agrees() ? 'hidden' : 'invalid', filled };
  if (stopAfter === 'hidden') return { grade: 'advanced', filled };

  // Singles stalled. Counting from the PARTIAL is sound (every deduction so
  // far is forced) and cheaper than counting from the raw givens.
  const count = countSolutions(spec, filled, 2);
  return { grade: count === 1 ? 'advanced' : 'invalid', filled };
}

function sameCells(a: Cells, b: Cells): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Is grade `g` no harder than `max`? 'invalid' is never within anything. */
export function techniqueAtMost(g: Grade, max: Technique): boolean {
  if (g === 'invalid') return false;
  return TECHNIQUE_RANK[g] <= TECHNIQUE_RANK[max];
}
