// Rules tests for Cakey Stacks.
//
// The board rules are the one part of this game that has to be exactly right:
// a rotation that eats a cell, a clear that shifts the wrong row, or a bag that
// starves a shape are all invisible in code review and obvious to a kid on the
// third playthrough. They are pure functions, so they get pinned here.

import { describe, expect, it } from 'vitest';
import {
  COLS,
  PIECE_TYPES,
  ROTATIONS,
  ROWS,
  cellsOf,
  clearBottomRows,
  clearRows,
  colorIndex,
  createBag,
  createBoard,
  dropDistance,
  fits,
  fullRows,
  ghostOf,
  gravityMs,
  levelFor,
  lock,
  scoreForClear,
  spawn,
  stackTop,
  tryMove,
  tryRotate,
  type Board,
  type PieceType,
} from './logic';

/** Fill row `y` except for the columns listed. */
function fillRow(board: Board, y: number, holes: number[] = []): void {
  for (let x = 0; x < COLS; x++) if (!holes.includes(x)) board[y * COLS + x] = 1;
}

describe('shapes', () => {
  it('gives every piece four rotation states of four cells', () => {
    for (const type of PIECE_TYPES) {
      expect(ROTATIONS[type]).toHaveLength(4);
      for (const state of ROTATIONS[type]) expect(state).toHaveLength(4);
    }
  });

  it('rotates back to where it started after four turns', () => {
    const board = createBoard();
    for (const type of PIECE_TYPES) {
      let p = spawn(type);
      const start = JSON.stringify(cellsOf(p));
      for (let i = 0; i < 4; i++) p = tryRotate(board, p, 1)!;
      expect(JSON.stringify(cellsOf(p))).toBe(start);
    }
  });

  it('spawns every piece inside the pan', () => {
    const board = createBoard();
    for (const type of PIECE_TYPES) {
      const p = spawn(type);
      expect(fits(board, p)).toBe(true);
      for (const c of cellsOf(p)) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.x).toBeLessThan(COLS);
      }
    }
  });
});

describe('collision', () => {
  it('stops a piece at the floor', () => {
    const board = createBoard();
    const p = spawn('O');
    const rested = { ...p, y: p.y + dropDistance(board, p) };
    expect(tryMove(board, rested, 0, 1)).toBeNull();
    expect(Math.max(...cellsOf(rested).map((c) => c.y))).toBe(ROWS - 1);
  });

  it('stops a piece at the walls', () => {
    const board = createBoard();
    let p = spawn('O');
    for (let i = 0; i < COLS; i++) p = tryMove(board, p, -1, 0) ?? p;
    expect(Math.min(...cellsOf(p).map((c) => c.x))).toBe(0);
    expect(tryMove(board, p, -1, 0)).toBeNull();
  });

  it('lands on top of what is already stacked', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    const p = spawn('O');
    const rested = { ...p, y: p.y + dropDistance(board, p) };
    expect(Math.max(...cellsOf(rested).map((c) => c.y))).toBe(ROWS - 2);
  });

  it('puts the ghost exactly where the piece will land', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    const p = spawn('T');
    const ghost = ghostOf(board, p);
    expect(dropDistance(board, ghost)).toBe(0);
    expect(ghost.x).toBe(p.x);
  });
});

describe('rotation kicks', () => {
  it('kicks an I-slice off the left wall instead of refusing to turn', () => {
    const board = createBoard();
    // Stand the I upright, then shove it flush against the left wall.
    let p = tryRotate(board, spawn('I'), 1)!;
    for (let i = 0; i < COLS; i++) p = tryMove(board, p, -1, 0) ?? p;
    expect(Math.min(...cellsOf(p).map((c) => c.x))).toBe(0);
    const turned = tryRotate(board, p, 1);
    expect(turned).not.toBeNull();
    expect(fits(board, turned!)).toBe(true);
  });

  it('refuses only when the piece is genuinely sealed in', () => {
    const board = createBoard();
    // Wall off everything but a 2-wide slot, then try to spin an I in it.
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (x > 1) board[y * COLS + x] = 1;
      }
    }
    const upright = { type: 'I' as PieceType, rot: 1, x: -1, y: 4 };
    expect(fits(board, upright)).toBe(true);
    expect(tryRotate(board, upright, 1)).toBeNull();
  });
});

describe('clearing', () => {
  it('finds only the rows that are completely full', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    fillRow(board, ROWS - 2, [3]);
    expect(fullRows(board)).toEqual([ROWS - 1]);
  });

  it('drops everything above a cleared row down by one', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    board[(ROWS - 3) * COLS + 2] = 5;      // a lone marker two rows up
    clearRows(board, [ROWS - 1]);
    expect(board[(ROWS - 3) * COLS + 2]).toBe(0);
    expect(board[(ROWS - 2) * COLS + 2]).toBe(5);
    expect(fullRows(board)).toEqual([]);
  });

  it('drops by two when two rows clear at once', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    fillRow(board, ROWS - 2);
    board[(ROWS - 5) * COLS + 1] = 7;
    clearRows(board, [ROWS - 1, ROWS - 2]);
    expect(board[(ROWS - 3) * COLS + 1]).toBe(7);
  });

  it('blows away the bottom rows for a bomb without touching the rest', () => {
    const board = createBoard();
    fillRow(board, ROWS - 1);
    fillRow(board, ROWS - 2);
    board[(ROWS - 4) * COLS + 0] = 3;
    const removed = clearBottomRows(board, 2);
    expect(removed).toHaveLength(2);
    expect(board[(ROWS - 2) * COLS + 0]).toBe(3);   // the marker fell two rows
    expect(stackTop(board)).toBe(ROWS - 2);
  });

  it('locks a piece into the board under its own colour', () => {
    const board = createBoard();
    const p = spawn('S');
    const landed = lock(board, { ...p, y: p.y + dropDistance(board, p) });
    expect(landed).toHaveLength(4);
    for (const c of landed) expect(board[c.y * COLS + c.x]).toBe(colorIndex('S'));
  });

  it('reports an empty pan as having no stack', () => {
    expect(stackTop(createBoard())).toBe(ROWS);
  });
});

describe('7-bag randomiser', () => {
  it('deals each shape exactly once per bag', () => {
    const next = createBag(() => 0.42);
    for (let bag = 0; bag < 5; bag++) {
      const seen = new Set<PieceType>();
      for (let i = 0; i < PIECE_TYPES.length; i++) seen.add(next());
      expect(seen.size).toBe(PIECE_TYPES.length);
    }
  });

  it('never makes a kid wait more than 12 slices for a given shape', () => {
    const next = createBag();
    let sinceI = 0;
    let worst = 0;
    for (let i = 0; i < 700; i++) {
      if (next() === 'I') { worst = Math.max(worst, sinceI); sinceI = 0; }
      else sinceI++;
    }
    expect(worst).toBeLessThanOrEqual(12);
  });
});

describe('scoring + speed', () => {
  it('pays more for four rows at once than for four singles', () => {
    expect(scoreForClear(4, 1)).toBeGreaterThan(scoreForClear(1, 1) * 4);
  });

  it('scales the payout with the level', () => {
    expect(scoreForClear(2, 3)).toBe(scoreForClear(2, 1) * 3);
  });

  it('levels up every `linesPerLevel` rows', () => {
    expect(levelFor(0, 1, 10)).toBe(1);
    expect(levelFor(9, 1, 10)).toBe(1);
    expect(levelFor(10, 1, 10)).toBe(2);
    expect(levelFor(35, 2, 10)).toBe(5);
  });

  it('speeds up with the level but never below the floor', () => {
    const base = 800;
    const floor = 320;
    expect(gravityMs(1, base, floor)).toBe(base);
    expect(gravityMs(3, base, floor)).toBeLessThan(gravityMs(2, base, floor));
    expect(gravityMs(50, base, floor)).toBe(floor);
  });
});
