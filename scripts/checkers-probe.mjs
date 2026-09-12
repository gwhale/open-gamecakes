// Correctness probe for the checkers rules engine.
//
//   node --import ./scripts/lw-ts-alias.mjs scripts/checkers-probe.mjs [games]
//
// This repo has no test runner, so this script IS the regression guard for
// rules.ts. It plays a lot of random games and asserts the properties that a
// broken movegen would violate:
//
//   1. Every game TERMINATES. An infinite chain (the classic bug: removing a
//      jumped piece before recursing, so a lone king eats the same man forever)
//      shows up here as a game that never ends.
//   2. applyMove is PURE — the state handed in is byte-identical afterwards.
//   3. legalMoves does not mutate the board it reads.
//   4. Under forced capture, a quiet move is never offered alongside a jump.
//   5. Material only ever goes down, and by exactly captures.length.
//   6. A crowned move always lands on that side's far rank.
//
// Exits non-zero on the first violation, so it can gate a commit.

import {
  initialState,
  legalMoves,
  applyMove,
  result,
  positionKey,
  material,
  squareToRC,
  isKing,
} from '../src/lib/games/checkers/rules.ts';
import * as T from '../src/lib/games/checkers/types.ts';

// --- 0. The y-ladder --------------------------------------------------------
//
// No two faces in the board stack may share a height, or the two opaque surfaces
// z-fight and the whole board flickers as the camera moves. There is no
// polygonOffset in this repo, so separation is purely geometric and nothing but
// this check enforces it. Cheap, and it catches the one bug that would otherwise
// only show up on a device at a grazing angle.
{
  const faces = [
    ['stand bottom', T.Y_STAND - T.STAND_H / 2],
    ['stand top', T.Y_STAND + T.STAND_H / 2],
    ['table bottom', T.Y_TABLE - T.TABLE_H / 2],
    ['table top', T.Y_TABLE + T.TABLE_H / 2],
    ['slab bottom', T.Y_SLAB - T.SLAB_H / 2],
    ['slab top', T.Y_SLAB + T.SLAB_H / 2],
    ['surface bottom', T.Y_SURFACE - T.SURFACE_H / 2],
    ['surface top', T.Y_SURFACE + T.SURFACE_H / 2],
    ['markers', T.Y_MARKER],
    ['ring', T.Y_RING],
  ];
  for (let i = 0; i < faces.length; i += 1) {
    for (let j = i + 1; j < faces.length; j += 1) {
      if (Math.abs(faces[i][1] - faces[j][1]) < 1e-6) {
        console.error(`FAIL: y-ladder — "${faces[i][0]}" and "${faces[j][0]}" both sit at ${faces[i][1]}`);
        console.error('Two coplanar opaque faces will z-fight and the board will flicker.');
        process.exit(1);
      }
    }
  }
  // The playing plane must be DERIVED from the surface, never retyped.
  if (Math.abs(T.Y_TOP - (T.Y_SURFACE + T.SURFACE_H / 2)) > 1e-9) {
    console.error('FAIL: Y_TOP has drifted from the surface it is meant to sit on.');
    process.exit(1);
  }
  console.log('y-ladder: 10 faces, all distinct.');
}

const GAMES = Number(process.argv[2] ?? 1000);
const PLY_CAP = 400; // far above the 60-ply no-progress draw; only a bug reaches it

let rngState = 0x2f6e2b1;
/** mulberry32, so a failure is reproducible from the seed printed below. */
const rand = () => {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

const totalPieces = (s) => {
  const m = material(s);
  return m.light.men + m.light.kings + m.dark.men + m.dark.kings;
};

const outcomes = { win: 0, repetition: 0, 'no-progress': 0 };
let plies = 0;
let longestChain = 0;
let crownings = 0;

for (let g = 0; g < GAMES; g += 1) {
  const seed = rngState;
  let state = initialState();
  const history = new Map();
  history.set(positionKey(state), 1);

  let ply = 0;
  for (;;) {
    const done = result(state, history);
    if (done) {
      if (done.kind === 'win') outcomes.win += 1;
      else outcomes[done.reason] += 1;
      break;
    }

    ply += 1;
    if (ply > PLY_CAP) fail(`game ${g} (seed ${seed}) ran past ${PLY_CAP} plies — movegen is not terminating`);

    const boardBefore = Array.from(state.board).join(',');
    const moves = legalMoves(state);
    if (Array.from(state.board).join(',') !== boardBefore) {
      fail(`game ${g} (seed ${seed}) ply ${ply}: legalMoves mutated the board`);
    }
    if (moves.length === 0) fail(`game ${g} (seed ${seed}) ply ${ply}: result() said live but there are no moves`);

    // Property 4 — forced capture is all-or-nothing.
    const jumps = moves.filter((m) => m.captures.length > 0);
    if (jumps.length > 0 && jumps.length !== moves.length) {
      fail(`game ${g} (seed ${seed}) ply ${ply}: quiet move offered alongside a jump`);
    }

    const move = moves[Math.floor(rand() * moves.length)];
    longestChain = Math.max(longestChain, move.captures.length);

    // Property 6 — a crown lands on the far rank.
    if (move.crowns) {
      crownings += 1;
      const { rank } = squareToRC(move.to);
      const want = state.turn === 'dark' ? 7 : 0;
      if (rank !== want) fail(`game ${g} (seed ${seed}) ply ${ply}: ${state.turn} crowned on rank ${rank}, want ${want}`);
      if (isKing(state.board[move.from])) fail(`game ${g} (seed ${seed}) ply ${ply}: a king was crowned again`);
    }

    // Chain bookkeeping must be self-consistent: n captures means n-1
    // intermediate landings, or 0 for a quiet move.
    const wantPath = move.captures.length > 0 ? move.captures.length - 1 : 0;
    if (move.path.length !== wantPath) {
      fail(
        `game ${g} (seed ${seed}) ply ${ply}: ${move.captures.length} captures but ${move.path.length} ` +
          `intermediate landings (want ${wantPath})`,
      );
    }

    const before = totalPieces(state);
    const next = applyMove(state, move);

    // Property 2 — purity.
    if (Array.from(state.board).join(',') !== boardBefore) {
      fail(`game ${g} (seed ${seed}) ply ${ply}: applyMove mutated the state it was given`);
    }
    // Property 5 — material accounting.
    if (totalPieces(next) !== before - move.captures.length) {
      fail(
        `game ${g} (seed ${seed}) ply ${ply}: ${before} pieces minus ${move.captures.length} captured ` +
          `should leave ${before - move.captures.length}, got ${totalPieces(next)}`,
      );
    }
    if (next.turn === state.turn) fail(`game ${g} (seed ${seed}) ply ${ply}: turn did not flip`);

    state = next;
    const key = positionKey(state);
    history.set(key, (history.get(key) ?? 0) + 1);
  }
  plies += ply;
}

console.log(`${GAMES} random games, all terminated.`);
console.log(`  avg length     ${(plies / GAMES).toFixed(1)} plies`);
console.log(`  outcomes       ${outcomes.win} decisive · ${outcomes.repetition} repetition · ${outcomes['no-progress']} no-progress`);
console.log(`  longest chain  ${longestChain} captures in one turn`);
console.log(`  crownings      ${crownings}`);
console.log('OK');
