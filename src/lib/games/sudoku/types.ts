// Waffle Sudoku — grid geometry and the puzzle record.
//
// Three grid sizes, one code path. A 4×4 is a sudoku with 2×2 boxes, a 6×6 has
// 2-row × 3-column boxes, a 9×9 the familiar 3×3. Everything downstream (solver,
// grader, generator, component) takes a GridSpec and never hardcodes 9, so the
// ladder can start a six-year-old on a 4×4 and the same solver proves its
// uniqueness.
//
// Cells are a flat Uint8Array, row-major, 0 = blank. Digits are 1..size. Every
// exported function treats its inputs as read-only unless its name says
// otherwise (the grade.ts `apply*` helpers mutate, and say so).

export type SudokuSize = 4 | 6 | 9;

export interface GridSpec {
  size: SudokuSize;
  /** Rows per box. 4→2, 6→2, 9→3. */
  boxRows: number;
  /** Columns per box. 4→2, 6→3, 9→3. */
  boxCols: number;
}

export const SPECS: Record<SudokuSize, GridSpec> = {
  4: { size: 4, boxRows: 2, boxCols: 2 },
  6: { size: 6, boxRows: 2, boxCols: 3 },
  9: { size: 9, boxRows: 3, boxCols: 3 },
};

/** Flat row-major grid; 0 is a blank. Length is size². */
export type Cells = Uint8Array;

/** How hard the puzzle is, by the hardest technique a logical solve needs.
 *  'singles'  — naked singles alone finish it (a cell with one candidate).
 *  'hidden'   — naked + hidden singles finish it (a digit with one home in a unit).
 *  'advanced' — unique, but singles stall; the kid has to reason further. */
export type Technique = 'singles' | 'hidden' | 'advanced';

export const TECHNIQUE_RANK: Record<Technique, number> = {
  singles: 0,
  hidden: 1,
  advanced: 2,
};

export interface Puzzle {
  size: SudokuSize;
  /** The starting grid — what the kid sees. 0 = blank. */
  givens: Cells;
  /** The one and only completion of `givens`. */
  solution: Cells;
  technique: Technique;
  givensCount: number;
  /** size² − givensCount. Also the number of correct placements a solve takes. */
  blanks: number;
  /** The seed that produced it, so a bug report can be replayed. */
  seed: number;
}

export function idx(spec: GridSpec, r: number, c: number): number {
  return r * spec.size + c;
}

/** Box index of cell i. Boxes are numbered row-major across the grid. */
export function boxOf(spec: GridSpec, i: number): number {
  const n = spec.size;
  const r = Math.floor(i / n);
  const c = i % n;
  const boxesAcross = n / spec.boxCols;
  return Math.floor(r / spec.boxRows) * boxesAcross + Math.floor(c / spec.boxCols);
}

interface SpecCache {
  peers: readonly (readonly number[])[];
  units: readonly (readonly number[])[];
  rowOf: Uint8Array;
  colOf: Uint8Array;
  boxOfCell: Uint8Array;
}

const CACHE = new Map<SudokuSize, SpecCache>();

/** Per-spec lookup tables, built once. Three specs exist, so this never grows. */
export function tablesFor(spec: GridSpec): SpecCache {
  const hit = CACHE.get(spec.size);
  if (hit) return hit;
  const n = spec.size;
  const cells = n * n;
  const rowOf = new Uint8Array(cells);
  const colOf = new Uint8Array(cells);
  const boxOfCell = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    rowOf[i] = Math.floor(i / n);
    colOf[i] = i % n;
    boxOfCell[i] = boxOf(spec, i);
  }
  const rows: number[][] = Array.from({ length: n }, () => []);
  const cols: number[][] = Array.from({ length: n }, () => []);
  const boxes: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < cells; i++) {
    rows[rowOf[i]].push(i);
    cols[colOf[i]].push(i);
    boxes[boxOfCell[i]].push(i);
  }
  const units = [...rows, ...cols, ...boxes];
  const peers: number[][] = [];
  for (let i = 0; i < cells; i++) {
    const set = new Set<number>();
    for (const j of rows[rowOf[i]]) set.add(j);
    for (const j of cols[colOf[i]]) set.add(j);
    for (const j of boxes[boxOfCell[i]]) set.add(j);
    set.delete(i);
    peers.push([...set].sort((a, b) => a - b));
  }
  const built: SpecCache = { peers, units, rowOf, colOf, boxOfCell };
  CACHE.set(spec.size, built);
  return built;
}

/** Every cell sharing a row, column or box with i — excluding i itself. */
export function peersOf(spec: GridSpec, i: number): readonly number[] {
  return tablesFor(spec).peers[i];
}

/** All units: rows, then columns, then boxes. Each is a list of cell indices. */
export function unitsOf(spec: GridSpec): readonly (readonly number[])[] {
  return tablesFor(spec).units;
}

/** Full grid, every unit a permutation of 1..size. */
export function isValidSolution(spec: GridSpec, cells: Cells): boolean {
  const n = spec.size;
  if (cells.length !== n * n) return false;
  const full = ((1 << (n + 1)) - 2) >>> 0;
  for (const unit of unitsOf(spec)) {
    let seen = 0;
    for (const i of unit) {
      const v = cells[i];
      if (v < 1 || v > n) return false;
      const bit = 1 << v;
      if (seen & bit) return false;
      seen |= bit;
    }
    if (seen !== full) return false;
  }
  return true;
}
