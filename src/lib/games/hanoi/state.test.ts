import { describe, expect, it } from 'vitest';
import {
  canMove,
  isSolved,
  move,
  newGame,
  nextOptimalMove,
  serialize,
  standOf,
  topOf,
  MAX_LAYERS,
  MIN_LAYERS,
  SOURCE_STAND,
  TARGET_STAND,
  type HanoiState,
} from './state';
import { minMoves } from './ladder';

describe('newGame', () => {
  it('stacks the whole cake on the left, biggest at the bottom', () => {
    const s = newGame(4);
    expect(s.stacks[SOURCE_STAND]).toEqual([4, 3, 2, 1]);
    expect(s.stacks[1]).toEqual([]);
    expect(s.stacks[TARGET_STAND]).toEqual([]);
    expect(s.moves).toBe(0);
    expect(topOf(s, SOURCE_STAND)).toBe(1);
    expect(topOf(s, 1)).toBeNull();
  });

  it('clamps the layer count to the shipped range', () => {
    expect(newGame(1).n).toBe(MIN_LAYERS);
    expect(newGame(40).n).toBe(MAX_LAYERS);
    expect(newGame(5.9).n).toBe(5);
  });
});

describe('the rule', () => {
  const s = newGame(3);

  it('lets the little layer go anywhere empty', () => {
    expect(canMove(s, 0, 1)).toBe(true);
    expect(canMove(s, 0, 2)).toBe(true);
  });

  it('refuses the same stand, an empty source, and big-onto-small', () => {
    expect(canMove(s, 0, 0)).toBe(false);
    expect(canMove(s, 1, 2)).toBe(false);
    const after = move(s, 0, 1)!; // 1 → middle
    // Now the top of the left stand is 2; the middle holds 1.
    expect(canMove(after, 0, 1)).toBe(false);
    expect(move(after, 0, 1)).toBeNull();
    expect(canMove(after, 1, 0)).toBe(true);
  });

  it('lets a small layer land on a bigger one', () => {
    const a = move(s, 0, 2)!; // 1 → right
    const b = move(a, 0, 1)!; // 2 → middle
    expect(canMove(b, 2, 1)).toBe(true); // 1 onto 2
    expect(move(b, 2, 1)!.stacks[1]).toEqual([2, 1]);
  });

  it('never mutates the input and counts only legal moves', () => {
    const before = serialize(s);
    const after = move(s, 0, 1)!;
    expect(serialize(s)).toBe(before);
    expect(after.moves).toBe(1);
    expect(move(after, 0, 1)).toBeNull();
    expect(after.moves).toBe(1);
  });
});

describe('isSolved', () => {
  it('is false at the start and true only with every layer on the right', () => {
    const s = newGame(3);
    expect(isSolved(s)).toBe(false);
    let cur: HanoiState = s;
    for (let i = 0; i < minMoves(3); i += 1) {
      const next = nextOptimalMove(cur)!;
      cur = move(cur, next.from, next.to)!;
    }
    expect(isSolved(cur)).toBe(true);
    expect(cur.stacks[TARGET_STAND]).toEqual([3, 2, 1]);
  });

  it('is not fooled by a full stack on the middle stand', () => {
    const s: HanoiState = { n: 3, stacks: [[], [3, 2, 1], []], moves: 7 };
    expect(isSolved(s)).toBe(false);
  });
});

describe('nextOptimalMove', () => {
  it.each([3, 4, 5, 6, 7, 8])('solves %i layers in exactly 2^n − 1 moves', (n) => {
    let cur = newGame(n);
    let steps = 0;
    while (!isSolved(cur)) {
      const next = nextOptimalMove(cur);
      expect(next).not.toBeNull();
      const applied = move(cur, next!.from, next!.to);
      expect(applied, `optimal move ${next!.from}→${next!.to} was illegal at ${serialize(cur)}`).not.toBeNull();
      cur = applied!;
      steps += 1;
      if (steps > minMoves(n)) break;
    }
    expect(steps).toBe(minMoves(n));
    expect(isSolved(cur)).toBe(true);
  });

  it('returns null once solved', () => {
    const s: HanoiState = { n: 3, stacks: [[], [], [3, 2, 1]], moves: 7 };
    expect(nextOptimalMove(s)).toBeNull();
  });

  it('recovers from a wandering position without going back to the start', () => {
    // Kid moved 1 to the right, then 2 to the middle, then 1 back to the left:
    // [3,1] [2] []. Optimal from here: 1 → middle (onto 2), then 3 → right, …
    const s: HanoiState = { n: 3, stacks: [[3, 1], [2], []], moves: 3 };
    expect(nextOptimalMove(s)).toEqual({ from: 0, to: 1 });
    let cur = s;
    let steps = 0;
    while (!isSolved(cur) && steps < 20) {
      const next = nextOptimalMove(cur)!;
      cur = move(cur, next.from, next.to)!;
      steps += 1;
    }
    // From [3,1] [2] [] the shortest finish is 1→1, 3→2, 1→0, 2→2, 1→2 = 5.
    expect(steps).toBe(5);
  });
});

describe('helpers', () => {
  it('standOf finds every layer', () => {
    const s: HanoiState = { n: 3, stacks: [[3], [2], [1]], moves: 2 };
    expect(standOf(s, 3)).toBe(0);
    expect(standOf(s, 2)).toBe(1);
    expect(standOf(s, 1)).toBe(2);
    expect(() => standOf(s, 4)).toThrow();
  });

  it('serialize is stable and readable', () => {
    expect(serialize(newGame(3))).toBe('n=3 m=0 [3,2,1||]');
  });
});
