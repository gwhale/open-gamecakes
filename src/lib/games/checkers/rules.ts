// American checkers (English draughts), written from scratch.
//
// No dependency, deliberately. chess.js earned its place in this repo because
// chess move generation is genuinely hard — castling, en passant, pins,
// threefold, insufficient material. Checkers movegen is one recursive function
// and a direction table, and a package would cost a download plus a variant we
// don't control.
//
// THE VARIANT, and every line of it is a kid-facing decision:
//   - 8x8, 12 a side, one diagonal step.
//   - Men move FORWARD only. Kings move any direction but still ONE step —
//     these are NOT flying kings. A king that slides the length of a diagonal
//     and captures from three squares away is hard for a six-year-old to see
//     coming and harder to animate legibly.
//   - Captures are FORCED. This is the whole tactical layer: without it a kid
//     can decline every trade and the game has no shape. The kindness lives in
//     the INTERFACE (the board pulses the jump before you tap), not in the rule.
//   - Any jump may be taken, not the longest. American rule, and the gentler
//     one — "you took a jump but not the biggest jump" is a terrible thing to
//     say to a seven-year-old.
//   - Crowning ENDS THE TURN. A man that reaches the far row stops there even
//     mid-chain. American rule, simpler to explain, and it hands the coronation
//     its own clean beat instead of burying it inside a triple jump.
//   - Being blocked LOSES. No legal move is a loss, not a stalemate draw.
//
// A "move" here is a WHOLE TURN, chain included — see CheckersMove. That
// granularity is load-bearing in three places: the bot searches decisions, the
// telemetry counts one kid decision per turn (a triple jump is one choice, not
// three), and the 3D layer decomposes `path` into hops for the chaining UX.
//
// Pure: no three, no React, no DOM, no imports at all. The bot and the renderer
// both sit on top of this.

/** Side to move. Dark moves first, as in standard American checkers. */
export type Side = 'light' | 'dark';

/** Board cell. Sign is the side, magnitude is the rank. Zero is empty, which
 *  makes `board[sq] !== EMPTY` and sign tests cheap in the search's inner loop. */
export const EMPTY = 0;
export const LIGHT_MAN = 1;
export const LIGHT_KING = 2;
export const DARK_MAN = -1;
export const DARK_KING = -2;

/** Squares run 0..63 as `rank * 8 + file`, rank 0 at the DARK side's home row.
 *
 *  The compact 32-square representation (only playable squares, numbered 1..32)
 *  is faster and gives free direction tables, and it is rejected on purpose: its
 *  row-parity shift is a famous off-by-one generator, and the 3D board wants
 *  (file, rank) anyway so it can reuse the town board's squarePx() mapping
 *  unchanged. The speed is bought back by DARK_SQUARES below. */
export const BOARD_SIZE = 64;

/** Pieces live on one colour of square for the entire game. Movegen and the
 *  bot's eval walk THIS, not all 64 — which is where the packed
 *  representation's speed advantage goes.
 *
 *  ⚠️ The parity here is a LOGICAL choice and is independent of which colour the
 *  renderer paints these squares. The 3D board paints them CREAM (see
 *  board.ts): every piece lives on one colour, so that colour has to be the
 *  light one or the dark piece set has nothing to contrast against. */
export const DARK_SQUARES: readonly number[] = (() => {
  const out: number[] = [];
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      if ((r + f) % 2 === 1) out.push(r * 8 + f);
    }
  }
  return out;
})();

/** Crowning rows. Dark starts at rank 0 and crowns at 7; light is the mirror. */
const CROWN_RANK: Record<Side, number> = { dark: 7, light: 0 };

/** Plies without a capture or a man advance before the game is called a draw.
 *  The counter is needed for the draw rule AND for the anti-farm rule in the
 *  game shell — see the no-progress cap in CakeyCheckersGame. */
export const NO_PROGRESS_DRAW_PLIES = 60;

export interface RulesOptions {
  /** Forced capture. Default true. Exposed as a flag only so the bottom tiers
   *  could be softened if playtests demand it — flipping it changes the game,
   *  not just the difficulty, so don't reach for it lightly. */
  forcedCapture?: boolean;
}

const DEFAULTS: Required<RulesOptions> = { forcedCapture: true };

/** One whole turn. A triple jump is ONE CheckersMove with three entries in
 *  `captures` and two in `path` — never three moves. */
export interface CheckersMove {
  from: number;
  /** Final landing square. */
  to: number;
  /** Squares of the pieces removed, in the order they were jumped. Empty for a
   *  quiet move. */
  captures: number[];
  /** Intermediate landing squares of a chain, EXCLUDING `to`. The renderer
   *  animates from → path[0] → … → to, one hop per entry. */
  path: number[];
  /** True if this move crowns the moving man. */
  crowns: boolean;
}

export interface CheckersState {
  board: Int8Array;
  turn: Side;
  /** Plies since the last capture or man advance. */
  sinceProgress: number;
}

export type Result =
  | { kind: 'win'; side: Side }
  | { kind: 'draw'; reason: 'repetition' | 'no-progress' };

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

export function squareToRC(sq: number): { file: number; rank: number } {
  return { file: sq % 8, rank: (sq / 8) | 0 };
}

export function rcToSquare(file: number, rank: number): number {
  return rank * 8 + file;
}

/** Is (file, rank) on the board at all? Guards every direction step. */
function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

export function sideOf(piece: number): Side | null {
  if (piece === EMPTY) return null;
  return piece > 0 ? 'light' : 'dark';
}

export function isKing(piece: number): boolean {
  return piece === LIGHT_KING || piece === DARK_KING;
}

export function opponent(side: Side): Side {
  return side === 'light' ? 'dark' : 'light';
}

/** Light travels toward rank 0, dark toward rank 7. Kings ignore this. */
function forwardDr(piece: number): number {
  return piece > 0 ? -1 : 1;
}

/** The diagonals a piece may travel. One shared array per case, never
 *  allocated in the search loop. */
const KING_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const LIGHT_MAN_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [-1, 1],
];
const DARK_MAN_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, -1],
  [1, 1],
];

function dirsFor(piece: number): ReadonlyArray<readonly [number, number]> {
  if (isKing(piece)) return KING_DIRS;
  return forwardDr(piece) === -1 ? LIGHT_MAN_DIRS : DARK_MAN_DIRS;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Standard opening position. Dark on ranks 0-2, light on ranks 5-7, dark to
 *  move. Exactly 7 legal moves exist for each side — asserted at the bottom. */
export function initialState(): CheckersState {
  const board = new Int8Array(BOARD_SIZE);
  for (const sq of DARK_SQUARES) {
    const { rank } = squareToRC(sq);
    if (rank <= 2) board[sq] = DARK_MAN;
    else if (rank >= 5) board[sq] = LIGHT_MAN;
  }
  return { board, turn: 'dark', sinceProgress: 0 };
}

export function cloneState(s: CheckersState): CheckersState {
  return { board: Int8Array.from(s.board), turn: s.turn, sinceProgress: s.sinceProgress };
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

/** Every jump chain available to the piece at `sq`, as whole turns.
 *
 *  Walks the board in place and undoes as it goes rather than copying per node
 *  — a chain can branch several ways and the copies add up inside the bot's
 *  search. `board` is left byte-identical on return; if you change this
 *  function, keep that true.
 *
 *  ⚠️ The victim stays on the board as a SENTINEL while we recurse past it, so
 *  a chain cannot jump the same piece twice. Removing it eagerly is the classic
 *  bug here and produces phantom infinite chains around a lone king. */
function collectJumps(
  board: Int8Array,
  sq: number,
  piece: number,
  side: Side,
  from: number,
  captures: number[],
  path: number[],
  out: CheckersMove[],
): void {
  const { file, rank } = squareToRC(sq);
  const foe = opponent(side);

  for (const [dr, df] of dirsFor(piece)) {
    const mf = file + df;
    const mr = rank + dr;
    const lf = file + df * 2;
    const lr = rank + dr * 2;
    if (!onBoard(lf, lr)) continue;

    const midSq = rcToSquare(mf, mr);
    const landSq = rcToSquare(lf, lr);
    const mid = board[midSq];
    if (mid === EMPTY || sideOf(mid) !== foe) continue;
    if (board[landSq] !== EMPTY) continue;
    // Already eaten earlier in this chain — the sentinel above is why we can
    // still see it, and this is where we refuse to eat it again.
    if (captures.includes(midSq)) continue;

    // A man that lands on the crowning row STOPS. The turn ends there even if
    // another jump is on the board — see the variant note at the top.
    const crowns = !isKing(piece) && lr === CROWN_RANK[side];

    board[sq] = EMPTY;
    board[landSq] = piece;
    captures.push(midSq);

    if (crowns) {
      out.push({ from, to: landSq, captures: [...captures], path: [...path], crowns: true });
    } else {
      // Recurse with landSq on the path, then take it back off before emitting
      // the terminal move — `path` holds INTERMEDIATE landings only, and this
      // square's is carried by `to`.
      const before = out.length;
      path.push(landSq);
      collectJumps(board, landSq, piece, side, from, captures, path, out);
      path.pop();
      if (out.length === before) {
        out.push({ from, to: landSq, captures: [...captures], path: [...path], crowns: false });
      }
    }

    captures.pop();
    board[landSq] = EMPTY;
    board[sq] = piece;
  }
}

/** Quiet (non-capturing) single steps for the piece at `sq`. */
function collectSteps(board: Int8Array, sq: number, piece: number, side: Side, out: CheckersMove[]): void {
  const { file, rank } = squareToRC(sq);
  for (const [dr, df] of dirsFor(piece)) {
    const tf = file + df;
    const tr = rank + dr;
    if (!onBoard(tf, tr)) continue;
    const to = rcToSquare(tf, tr);
    if (board[to] !== EMPTY) continue;
    out.push({
      from: sq,
      to,
      captures: [],
      path: [],
      crowns: !isKing(piece) && tr === CROWN_RANK[side],
    });
  }
}

/** Every legal whole-turn for the side to move.
 *
 *  Under forced capture (the default) this returns ONLY jumps when any jump
 *  exists — so `legalMoves(s).length === 1` is a genuinely common state in
 *  checkers, unlike chess. The move-quality grader must not flag a turn the kid
 *  had no choice about; see the single-legal-move guard in the game shell. */
export function legalMoves(s: CheckersState, o?: RulesOptions): CheckersMove[] {
  const opts = { ...DEFAULTS, ...o };
  const side = s.turn;
  const jumps: CheckersMove[] = [];
  const steps: CheckersMove[] = [];

  for (const sq of DARK_SQUARES) {
    const piece = s.board[sq];
    if (piece === EMPTY || sideOf(piece) !== side) continue;
    collectJumps(s.board, sq, piece, side, sq, [], [], jumps);
    if (jumps.length === 0 || !opts.forcedCapture) collectSteps(s.board, sq, piece, side, steps);
  }

  if (jumps.length > 0 && opts.forcedCapture) return jumps;
  if (jumps.length > 0) return [...jumps, ...steps];
  return steps;
}

/** The subset of legalMoves() starting at `sq`. Used by the 3D board on tap —
 *  it derives from legalMoves() rather than generating independently so the
 *  forced-capture filter can never disagree between what the board lights up
 *  and what the rules will accept. */
export function movesFrom(s: CheckersState, sq: number, o?: RulesOptions): CheckersMove[] {
  return legalMoves(s, o).filter((m) => m.from === sq);
}

/** Does the side to move have a jump available?
 *
 *  The bot's quiescence search leans on this: because captures are forced,
 *  "there is a jump on the board" IS the definition of an unresolved position,
 *  which is what makes checkers quiescence cheap. */
export function hasCapture(s: CheckersState): boolean {
  const side = s.turn;
  for (const sq of DARK_SQUARES) {
    const piece = s.board[sq];
    if (piece === EMPTY || sideOf(piece) !== side) continue;
    const probe: CheckersMove[] = [];
    collectJumps(s.board, sq, piece, side, sq, [], [], probe);
    if (probe.length > 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Applying a move
// ---------------------------------------------------------------------------

/** Pure. Returns a new state; `s` is untouched.
 *
 *  Copying 64 bytes per node is cheap enough for the depths we search. If a
 *  future tier blows the think window, the fix is a make/unmake pair INSIDE
 *  bot.ts, not a mutable public API — every other caller (the renderer, the
 *  grader, the repetition tracker) depends on states being snapshots. */
export function applyMove(s: CheckersState, m: CheckersMove): CheckersState {
  const board = Int8Array.from(s.board);
  const piece = board[m.from];
  const side = sideOf(piece);
  if (side === null) throw new Error(`applyMove: no piece on square ${m.from}`);

  board[m.from] = EMPTY;
  for (const victim of m.captures) board[victim] = EMPTY;
  board[m.to] = m.crowns ? (side === 'light' ? LIGHT_KING : DARK_KING) : piece;

  // Progress = a capture, or a MAN moving. A man can only move forward, so any
  // man move is irreversible; king shuffling is what the counter is hunting.
  const progressed = m.captures.length > 0 || !isKing(piece);

  return {
    board,
    turn: opponent(side),
    sinceProgress: progressed ? 0 : s.sinceProgress + 1,
  };
}

// ---------------------------------------------------------------------------
// Position identity and results
// ---------------------------------------------------------------------------

/** Identity of a position for repetition purposes: the 32 playable squares plus
 *  the side to move. Excludes sinceProgress on purpose — two positions that
 *  differ only in the shuffle counter ARE the same position. */
export function positionKey(s: CheckersState): string {
  let key = '';
  for (const sq of DARK_SQUARES) key += String.fromCharCode(65 + s.board[sq]);
  return `${key}${s.turn === 'light' ? 'L' : 'D'}`;
}

/** The game's result, or null if it is still going.
 *
 *  `history` counts how many times each positionKey has occurred, INCLUDING the
 *  current one. Zero pieces is not checked separately — a side with no pieces
 *  has no legal moves, which is already a loss. */
export function result(s: CheckersState, history?: ReadonlyMap<string, number>): Result | null {
  if (legalMoves(s).length === 0) return { kind: 'win', side: opponent(s.turn) };
  if (history && (history.get(positionKey(s)) ?? 0) >= 3) {
    return { kind: 'draw', reason: 'repetition' };
  }
  if (s.sinceProgress >= NO_PROGRESS_DRAW_PLIES) return { kind: 'draw', reason: 'no-progress' };
  return null;
}

/** Men and kings per side. The bot evaluates from this and the game-over card
 *  adjudicates from it. */
export function material(s: CheckersState): Record<Side, { men: number; kings: number }> {
  const out = { light: { men: 0, kings: 0 }, dark: { men: 0, kings: 0 } };
  for (const sq of DARK_SQUARES) {
    const piece = s.board[sq];
    if (piece === EMPTY) continue;
    const side = piece > 0 ? 'light' : 'dark';
    if (isKing(piece)) out[side].kings += 1;
    else out[side].men += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dev assertions
// ---------------------------------------------------------------------------

// This repo has no test runner, so correctness guards live here and shout in the
// dev console — the same pattern as opponents.ts. Erased in production.
if (process.env.NODE_ENV !== 'production') {
  const start = initialState();
  const opening = legalMoves(start);
  if (opening.length !== 7) {
    console.warn(`[checkers] opening should have 7 legal moves, got ${opening.length}`);
  }
  if (opening.some((m) => m.captures.length > 0)) {
    console.warn('[checkers] opening position generated a capture');
  }

  const asLight = legalMoves({ ...start, turn: 'light' });
  if (asLight.length !== 7) {
    console.warn(`[checkers] opening is not symmetric: light has ${asLight.length} moves`);
  }

  // A hand-built double jump. Dark man on (2,1); light men on (3,2) and (5,4);
  // everything else empty. Dark should find exactly one move, taking both.
  const chain = new Int8Array(BOARD_SIZE);
  chain[rcToSquare(1, 2)] = DARK_MAN;
  chain[rcToSquare(2, 3)] = LIGHT_MAN;
  chain[rcToSquare(4, 5)] = LIGHT_MAN;
  const chainMoves = legalMoves({ board: chain, turn: 'dark', sinceProgress: 0 });
  if (chainMoves.length !== 1 || chainMoves[0].captures.length !== 2) {
    console.warn(
      `[checkers] double jump: expected 1 move capturing 2, got ${chainMoves.length} move(s) capturing ` +
        `${chainMoves[0]?.captures.length ?? 0}`,
    );
  }
  if (chainMoves[0] && chainMoves[0].path.length !== 1) {
    console.warn(`[checkers] double jump should have 1 intermediate landing, got ${chainMoves[0].path.length}`);
  }

  // Crowning stops a chain, and this is the position that actually proves it:
  // the jump to (4,7) crowns, and a KING on (4,7) could immediately jump back
  // over (5,6) to (6,5). If crowning failed to end the turn we'd see a
  // 2-capture move here.
  const crown = new Int8Array(BOARD_SIZE);
  crown[rcToSquare(2, 5)] = DARK_MAN;
  crown[rcToSquare(3, 6)] = LIGHT_MAN;
  crown[rcToSquare(5, 6)] = LIGHT_MAN;
  const crownMoves = legalMoves({ board: crown, turn: 'dark', sinceProgress: 0 });
  if (crownMoves.length !== 1 || !crownMoves[0].crowns || crownMoves[0].captures.length !== 1) {
    console.warn(
      `[checkers] crowning must end the turn: expected 1 move, 1 capture, crowns=true; got ` +
        `${crownMoves.length} move(s), ${crownMoves[0]?.captures.length ?? 0} capture(s), ` +
        `crowns=${crownMoves[0]?.crowns}`,
    );
  }

  // Blocked loses, and it is not a draw.
  const blocked = new Int8Array(BOARD_SIZE);
  blocked[rcToSquare(1, 0)] = DARK_MAN;
  blocked[rcToSquare(0, 1)] = LIGHT_MAN;
  blocked[rcToSquare(2, 1)] = LIGHT_MAN;
  blocked[rcToSquare(3, 2)] = LIGHT_MAN;
  const blockedResult = result({ board: blocked, turn: 'dark', sinceProgress: 0 });
  if (blockedResult?.kind !== 'win' || blockedResult.side !== 'light') {
    console.warn('[checkers] a side with no legal move should LOSE, not draw');
  }

  // Forced capture actually filters.
  const forced = new Int8Array(BOARD_SIZE);
  forced[rcToSquare(1, 2)] = DARK_MAN;
  forced[rcToSquare(5, 2)] = DARK_MAN;
  forced[rcToSquare(2, 3)] = LIGHT_MAN;
  const forcedState = { board: forced, turn: 'dark' as Side, sinceProgress: 0 };
  if (legalMoves(forcedState).some((m) => m.captures.length === 0)) {
    console.warn('[checkers] forced capture let a quiet move through');
  }
  if (legalMoves(forcedState, { forcedCapture: false }).length <= 1) {
    console.warn('[checkers] forcedCapture:false should offer the quiet moves too');
  }
}
