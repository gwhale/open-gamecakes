// Waffle Sudoku — the puzzle generator.
//
// Fill a grid, then dig holes: shuffle the cells, blank each in turn, and keep
// the hole only if the puzzle is still solvable within the band's technique
// (singles / hidden — a logical solve, which is also a uniqueness proof) or,
// for the top band, still has exactly one solution. Stop at the band's target
// clue count. If an attempt cannot get down to the band's max, throw the
// whole grid away and start again with the next rng stream — a grid that
// resists digging is not worth digging harder.
//
// Determinism: every random choice comes from makeRng(seed) — the fill's digit
// order and the removal order. No Math.random anywhere. The component picks
// the seed and dev-logs it, so a waffle a kid complains about can be replayed.
//
// Symmetry (the 6×6 and most 9×9 bands) removes cells in centre-mirrored
// pairs — it is what makes a sudoku look like a sudoku rather than a grid
// with a bite out of one corner, and it costs a few more attempts at the
// sparse end, which the ladder's ranges have been measured to afford.

import { makeRng } from '@/lib/games/opponents/rng';
import { gradePuzzle, techniqueAtMost } from './grade';
import type { PuzzleSpec } from './ladder';
import { countSolutions, fillGrid } from './solver';
import { type Cells, type Puzzle, SPECS, type SudokuSize, type Technique, tablesFor } from './types';

export interface GenerateOptions {
  size: SudokuSize;
  givens: { min: number; max: number; target: number };
  maxTechnique: Technique;
  symmetric: boolean;
  /** Fresh grids to try before giving up on the range. */
  maxAttempts?: number;
}

const DEFAULT_ATTEMPTS = 40;

/** Removal groups: single cells, or centre-mirrored pairs when symmetric (the
 *  exact-centre cell of an odd grid is its own mirror and travels alone). */
function removalGroups(cells: number, symmetric: boolean, rng: () => number): number[][] {
  const order: number[] = [];
  const limit = symmetric ? Math.ceil(cells / 2) : cells;
  for (let i = 0; i < limit; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order.map((i) => {
    if (!symmetric) return [i];
    const m = cells - 1 - i;
    return m === i ? [i] : [i, m];
  });
}

/** Does the puzzle stay within the band after this removal? */
function stillAllowed(spec: GenerateOptions, grid: Cells, solution: Cells): boolean {
  const gs = SPECS[spec.size];
  if (spec.maxTechnique === 'advanced') return countSolutions(gs, grid, 2) === 1;
  const g = gradePuzzle(gs, grid, solution, spec.maxTechnique).grade;
  return techniqueAtMost(g, spec.maxTechnique);
}

/** A 4×4 with all its blanks in one row (or column) is not a sudoku, it is a
 *  "fill in the missing number" worksheet — the box rule never comes into it.
 *  Blanks must touch at least two rows AND two columns. Applied to every size
 *  for uniformity; it only ever bites on the 4×4. */
function blanksSpread(size: SudokuSize, grid: Cells): boolean {
  const { rowOf, colOf } = tablesFor(SPECS[size]);
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] !== 0) continue;
    rows.add(rowOf[i]);
    cols.add(colOf[i]);
  }
  return rows.size >= 2 && cols.size >= 2;
}

/** One waffle for the band. Deterministic in (opts, seed). */
export function generatePuzzle(opts: GenerateOptions, seed: number): Puzzle {
  const gs = SPECS[opts.size];
  const cells = opts.size * opts.size;
  const attempts = opts.maxAttempts ?? DEFAULT_ATTEMPTS;
  let best: { givens: Cells; solution: Cells; count: number } | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    // Golden-ratio stride so attempt k of seed s never collides with attempt 0
    // of seed s+k — otherwise neighbouring seeds could hand out the same grid.
    const rng = makeRng((seed ^ Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const solution = fillGrid(gs, rng);
    const grid = new Uint8Array(solution);
    let givens = cells;

    for (const group of removalGroups(cells, opts.symmetric, rng)) {
      if (givens <= opts.givens.target) break;
      if (givens - group.length < opts.givens.min) continue;
      for (const i of group) grid[i] = 0;
      if (stillAllowed(opts, grid, solution)) {
        givens -= group.length;
      } else {
        for (const i of group) grid[i] = solution[i];
      }
    }

    if (givens <= opts.givens.max && blanksSpread(opts.size, grid)) {
      const technique = gradePuzzle(gs, grid, solution).grade;
      // Every kept removal was checked, so this cannot be 'invalid' — but a
      // generator that hands a kid an unsolvable waffle is the one bug that
      // must never ship silently, so it is asserted rather than assumed.
      if (technique === 'invalid') continue;
      return {
        size: opts.size,
        givens: grid,
        solution,
        technique,
        givensCount: givens,
        blanks: cells - givens,
        seed,
      };
    }
    if (!best || givens < best.count) best = { givens: grid, solution, count: givens };
  }

  // The band is mis-tuned for this seed. Ship the closest grid rather than
  // crash a kid's round — and shout in dev, because the fix is in ladder.ts.
  if (!best) throw new Error(`[sudoku] no grid at all for size ${opts.size}`);
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `[sudoku] band stalled: size ${opts.size} ${opts.maxTechnique} wanted ≤${opts.givens.max} givens, ` +
        `best was ${best.count} after ${attempts} attempts (seed ${seed}). Widen the range in ladder.ts.`,
    );
  }
  const technique = gradePuzzle(gs, best.givens, best.solution).grade;
  return {
    size: opts.size,
    givens: best.givens,
    solution: best.solution,
    technique: technique === 'invalid' ? opts.maxTechnique : technique,
    givensCount: best.count,
    blanks: cells - best.count,
    seed,
  };
}

/** The ladder's PuzzleSpec → a puzzle. What the component calls. */
export function generateForSpec(spec: PuzzleSpec, seed: number): Puzzle {
  return generatePuzzle(
    {
      size: spec.size,
      givens: spec.givens,
      maxTechnique: spec.maxTechnique,
      symmetric: spec.symmetric,
    },
    seed,
  );
}
