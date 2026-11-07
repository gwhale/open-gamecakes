// Waffle Sudoku — the backtracking solver, and the grid filler built on it.
//
// One routine does three jobs: fill an empty grid (with a seeded rng picking
// the digit order, so every seed is a different waffle), solve a given grid,
// and count solutions up to a limit (2 is all uniqueness needs). It is a
// minimum-remaining-values backtracker over row/column/box bitmasks: at each
// step it fills the blank with the fewest candidates, which on a 9×9 makes
// "is this unique?" a sub-millisecond question instead of a coffee break.
//
// Nothing here mutates its input. `solve` copies; the masks are local.

import { type Cells, type GridSpec, tablesFor } from './types';

/** Bits 1..size set. Bit 0 is never used, so digit d is `1 << d`. */
export function fullMask(spec: GridSpec): number {
  return ((1 << (spec.size + 1)) - 2) >>> 0;
}

export interface Masks {
  rows: Uint16Array;
  cols: Uint16Array;
  boxes: Uint16Array;
}

/** Row/col/box occupancy for a grid, or null if two equal digits already share
 *  a unit — a grid that is wrong before anyone touches it. */
export function buildMasks(spec: GridSpec, cells: Cells): Masks | null {
  const { rowOf, colOf, boxOfCell } = tablesFor(spec);
  const n = spec.size;
  const rows = new Uint16Array(n);
  const cols = new Uint16Array(n);
  const boxes = new Uint16Array(n);
  for (let i = 0; i < cells.length; i++) {
    const v = cells[i];
    if (v === 0) continue;
    const bit = 1 << v;
    const r = rowOf[i];
    const c = colOf[i];
    const b = boxOfCell[i];
    if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) return null;
    rows[r] |= bit;
    cols[c] |= bit;
    boxes[b] |= bit;
  }
  return { rows, cols, boxes };
}

/** Candidate bitmask for blank cell i given the current grid: the digits not
 *  yet used by any peer. A filled cell reports 0 — it has no candidates, it
 *  has a value. */
export function candidates(spec: GridSpec, cells: Cells, i: number): number {
  if (cells[i] !== 0) return 0;
  const { peers } = tablesFor(spec);
  let used = 0;
  for (const j of peers[i]) used |= 1 << cells[j];
  return fullMask(spec) & ~used;
}

export function popcount(m: number): number {
  let x = m >>> 0;
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** The single digit in a one-bit mask (undefined behaviour otherwise). */
export function lowestDigit(m: number): number {
  return 31 - Math.clz32(m & -m);
}

function shuffled(xs: number[], rng: () => number): number[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out;
}

/** The engine behind solve / countSolutions / fillGrid.
 *  Returns how many solutions were found (≤ limit). When `out` is given the
 *  first solution found is left in it. */
function search(
  spec: GridSpec,
  cells: Cells,
  limit: number,
  digitOrder: readonly number[],
  out: Cells | null,
): number {
  const masks = buildMasks(spec, cells);
  if (!masks) return 0;
  const { rows, cols, boxes } = masks;
  const { rowOf, colOf, boxOfCell } = tablesFor(spec);
  const full = fullMask(spec);
  const work = new Uint8Array(cells);
  const total = work.length;
  let found = 0;

  const step = (): boolean => {
    // MRV: the blank with the fewest candidates. A blank with none is a dead
    // branch, and finding it first is what keeps the tree small.
    let best = -1;
    let bestMask = 0;
    let bestCount = 99;
    for (let i = 0; i < total; i++) {
      if (work[i] !== 0) continue;
      const m = full & ~(rows[rowOf[i]] | cols[colOf[i]] | boxes[boxOfCell[i]]);
      const c = popcount(m);
      if (c < bestCount) {
        best = i;
        bestMask = m;
        bestCount = c;
        if (c <= 1) break;
      }
    }
    if (best === -1) {
      found++;
      if (out && found === 1) out.set(work);
      return found >= limit;
    }
    if (bestCount === 0) return false;
    const r = rowOf[best];
    const c = colOf[best];
    const b = boxOfCell[best];
    for (const d of digitOrder) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      work[best] = d;
      rows[r] |= bit;
      cols[c] |= bit;
      boxes[b] |= bit;
      const stop = step();
      rows[r] &= ~bit;
      cols[c] &= ~bit;
      boxes[b] &= ~bit;
      work[best] = 0;
      if (stop) return true;
    }
    return false;
  };

  step();
  return found;
}

function naturalOrder(spec: GridSpec): number[] {
  return Array.from({ length: spec.size }, (_, k) => k + 1);
}

/** One solution of `cells`, or null. With an rng, ties in digit order are
 *  broken randomly — which, on an empty grid, is how fillGrid makes a fresh
 *  waffle per seed. Never mutates `cells`. */
export function solve(spec: GridSpec, cells: Cells, rng?: () => number): Cells | null {
  const order = rng ? shuffled(naturalOrder(spec), rng) : naturalOrder(spec);
  const out = new Uint8Array(cells.length);
  const n = search(spec, cells, 1, order, out);
  return n >= 1 ? out : null;
}

/** How many completions `cells` has, stopping at `limit`. 0 = contradiction,
 *  1 = a proper puzzle, 2 = ambiguous (and we don't care how ambiguous). */
export function countSolutions(spec: GridSpec, cells: Cells, limit = 2): number {
  return search(spec, cells, limit, naturalOrder(spec), null);
}

/** A complete valid grid, chosen by the rng. Deterministic per rng stream. */
export function fillGrid(spec: GridSpec, rng: () => number): Cells {
  const empty = new Uint8Array(spec.size * spec.size);
  const g = solve(spec, empty, rng);
  // An empty grid always has a solution; this only guards a broken spec.
  if (!g) throw new Error(`[sudoku] fillGrid found no solution for size ${spec.size}`);
  return g;
}
