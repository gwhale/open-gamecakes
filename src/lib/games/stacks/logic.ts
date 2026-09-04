// Cakey Stacks — the pure falling-block rules.
//
// Everything in here is plain data + pure functions: no three, no DOM, no
// timers. The engine owns pixels and clocks; this module owns "what happens to
// the pan when you drop a slice." That split is what makes the rules testable
// (logic.test.ts) and keeps the 3D layer free to be re-skinned.
//
// Board geometry is 8 × 16, NOT the arcade 10 × 20. Eight columns means a line
// is four slices of work instead of five, which is the difference between a
// kindergartner clearing a layer in their first minute and never clearing one
// at all. Difficulty lives in the falling speed, never in the pan.

export const COLS = 8;
export const ROWS = 16;

/** Piece names keep the classic letters — they describe the shapes exactly and
 *  nothing kid-facing ever shows them (the HUD draws the shape itself). */
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/** Board cell values: 0 = empty, otherwise 1-based index into PIECE_TYPES, so
 *  a locked cell remembers which flavour it came from. */
export type Board = Uint8Array;

export interface Cell {
  x: number;
  y: number;
}

/** A slice in flight. `x`/`y` are the top-left of its rotation box, in board
 *  coordinates: x grows right, y grows DOWN (row 0 is the pan's rim). */
export interface ActivePiece {
  type: PieceType;
  /** 0..3, clockwise. */
  rot: number;
  x: number;
  y: number;
}

// ---- shapes -----------------------------------------------------------------

// Rotation-0 matrices in their natural boxes: I in 4×4, O in 2×2, the rest in
// 3×3. Rotating a square box is a clean 90° transpose, which is why the shapes
// are authored as boxes rather than as loose coordinate lists.
const BASE: Record<PieceType, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

function rotateCW(m: number[][]): number[][] {
  const n = m.length;
  const out: number[][] = Array.from({ length: n }, () => Array<number>(n).fill(0));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) out[x][n - 1 - y] = m[y][x];
  }
  return out;
}

function cellsFromMatrix(m: number[][]): Cell[] {
  const out: Cell[] = [];
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m[y].length; x++) if (m[y][x]) out.push({ x, y });
  }
  return out;
}

/** Every piece's four rotation states, precomputed once at module load. */
export const ROTATIONS: Record<PieceType, Cell[][]> = (() => {
  const out = {} as Record<PieceType, Cell[][]>;
  for (const type of PIECE_TYPES) {
    let m = BASE[type];
    const states: Cell[][] = [];
    for (let r = 0; r < 4; r++) {
      states.push(cellsFromMatrix(m));
      m = rotateCW(m);
    }
    out[type] = states;
  }
  return out;
})();

/** Box width of a piece — used to centre it on spawn and to size HUD previews. */
export function boxSize(type: PieceType): number {
  return BASE[type].length;
}

/** Colour slot for a locked cell of this type (1-based; 0 means empty). */
export function colorIndex(type: PieceType): number {
  return PIECE_TYPES.indexOf(type) + 1;
}

// ---- board ------------------------------------------------------------------

export function createBoard(): Board {
  return new Uint8Array(COLS * ROWS);
}

export function boardAt(board: Board, x: number, y: number): number {
  if (x < 0 || x >= COLS || y >= ROWS) return 1; // walls + floor read as solid
  if (y < 0) return 0;                           // above the rim is open sky
  return board[y * COLS + x];
}

/** Absolute board cells occupied by a piece in its current pose. */
export function cellsOf(piece: ActivePiece): Cell[] {
  return ROTATIONS[piece.type][piece.rot & 3].map((c) => ({
    x: piece.x + c.x,
    y: piece.y + c.y,
  }));
}

/** Does this pose sit entirely in empty space? */
export function fits(board: Board, piece: ActivePiece): boolean {
  for (const c of cellsOf(piece)) {
    if (boardAt(board, c.x, c.y) !== 0) return false;
  }
  return true;
}

/** Spawn pose: centred on the rim. Returns the piece even if it does not fit —
 *  callers check `fits` to detect a top-out. */
export function spawn(type: PieceType): ActivePiece {
  const size = boxSize(type);
  return { type, rot: 0, x: Math.floor((COLS - size) / 2), y: type === 'I' ? -1 : 0 };
}

export function tryMove(board: Board, piece: ActivePiece, dx: number, dy: number): ActivePiece | null {
  const next: ActivePiece = { ...piece, x: piece.x + dx, y: piece.y + dy };
  return fits(board, next) ? next : null;
}

// Kick offsets tried, in order, when a rotation lands in something. This is a
// deliberately GENEROUS table rather than the arcade SRS one: two cells of
// horizontal shove and a lift, so a kid spinning an I-slice flush against the
// pan wall gets the rotation instead of a dead press. Failing a rotation is
// never instructive here — the puzzle is the stack, not the input.
const KICKS: readonly Cell[] = [
  { x: 0, y: 0 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -2, y: 0 },
  { x: 2, y: 0 },
  { x: 0, y: -1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 0, y: 1 },
];

/** Rotate 1 = clockwise, -1 = counter-clockwise. Returns null only when every
 *  kick is blocked (a genuinely sealed pocket). */
export function tryRotate(board: Board, piece: ActivePiece, dir: 1 | -1): ActivePiece | null {
  const rot = (piece.rot + (dir === 1 ? 1 : 3)) & 3;
  for (const k of KICKS) {
    const next: ActivePiece = { ...piece, rot, x: piece.x + k.x, y: piece.y + k.y };
    if (fits(board, next)) return next;
  }
  return null;
}

/** How many rows this piece can fall before it rests. 0 = already resting. */
export function dropDistance(board: Board, piece: ActivePiece): number {
  let d = 0;
  while (fits(board, { ...piece, y: piece.y + d + 1 })) d++;
  return d;
}

/** Where the ghost ("frosting outline") sits. */
export function ghostOf(board: Board, piece: ActivePiece): ActivePiece {
  return { ...piece, y: piece.y + dropDistance(board, piece) };
}

/** Stamp a piece into the board. Cells above the rim are dropped on the floor
 *  (they are off-board), which is what makes a top-out terminal. Returns the
 *  cells that actually landed, for the lock-flash effect. */
export function lock(board: Board, piece: ActivePiece): Cell[] {
  const color = colorIndex(piece.type);
  const landed: Cell[] = [];
  for (const c of cellsOf(piece)) {
    if (c.y < 0 || c.y >= ROWS || c.x < 0 || c.x >= COLS) continue;
    board[c.y * COLS + c.x] = color;
    landed.push(c);
  }
  return landed;
}

/** Row indices that are completely full, top-down. */
export function fullRows(board: Board): number[] {
  const rows: number[] = [];
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (board[y * COLS + x] === 0) { full = false; break; }
    }
    if (full) rows.push(y);
  }
  return rows;
}

/** Remove the given rows and let everything above settle down. Mutates. */
export function clearRows(board: Board, rows: number[]): void {
  if (rows.length === 0) return;
  const doomed = new Set(rows);
  let write = ROWS - 1;
  for (let read = ROWS - 1; read >= 0; read--) {
    if (doomed.has(read)) continue;
    if (write !== read) board.copyWithin(write * COLS, read * COLS, read * COLS + COLS);
    write--;
  }
  for (let y = write; y >= 0; y--) board.fill(0, y * COLS, y * COLS + COLS);
}

/** Cherry Bomb / oven rescue: blow away the bottom `n` rows. Returns the rows
 *  that were removed so the engine can pop them with sprinkles. */
export function clearBottomRows(board: Board, n: number): number[] {
  const rows: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = ROWS - 1 - i;
    if (y >= 0) rows.push(y);
  }
  clearRows(board, rows);
  return rows;
}

/** Highest occupied row (0 = rim), or ROWS when the pan is empty. Drives the
 *  "danger" tint on the HUD. */
export function stackTop(board: Board): number {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (board[y * COLS + x] !== 0) return y;
  }
  return ROWS;
}

// ---- randomiser -------------------------------------------------------------

/** 7-bag: every seven slices contain each shape exactly once. Kids notice
 *  droughts long before they can name them, and "I never get a long one" is
 *  the fastest way to make a stacking game feel unfair. */
export function createBag(rand: () => number = Math.random): () => PieceType {
  let bag: PieceType[] = [];
  return () => {
    if (bag.length === 0) {
      bag = [...PIECE_TYPES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  };
}

// ---- scoring + speed --------------------------------------------------------

/** Points per simultaneous clear, before the level multiplier. Four at once is
 *  worth six single rows — the greedy play should feel worth the risk. */
const CLEAR_POINTS = [0, 40, 100, 300, 1200];

export function scoreForClear(lines: number, level: number): number {
  const base = CLEAR_POINTS[Math.min(lines, 4)] ?? 0;
  return base * Math.max(1, level);
}

/** One point per row a hard drop travelled — the classic nudge toward decisive
 *  play, kept small so it never out-earns clearing layers. */
export function scoreForHardDrop(rows: number): number {
  return Math.max(0, rows);
}

/** Level from total lines cleared. `linesPerLevel` comes from difficulty. */
export function levelFor(lines: number, startLevel: number, linesPerLevel: number): number {
  return startLevel + Math.floor(lines / Math.max(1, linesPerLevel));
}

/** Milliseconds per gravity step at a level. Geometric decay with a floor, so
 *  the speed keeps rising but never crosses into "no human child can react".
 *  `floorMs` is the difficulty's fastest allowed step. */
export function gravityMs(level: number, baseMs: number, floorMs: number): number {
  const decayed = baseMs * Math.pow(0.82, Math.max(0, level - 1));
  return Math.max(floorMs, Math.round(decayed));
}
