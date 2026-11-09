import { describe, expect, it } from 'vitest';
import { makeRng } from '@/lib/games/opponents/rng';
import {
  DIRECTION_VECTORS,
  cellsBetween,
  generateWordSearch,
  readCells,
  wordSearchTier,
  type Direction,
} from './generate';

const ALL: Direction[] = ['E', 'S', 'SE', 'NE', 'W', 'N', 'NW', 'SW'];

describe('generateWordSearch', () => {
  it('places every word readable along its cells in an allowed direction', () => {
    const words = ['cat', 'dog', 'sun', 'red'];
    const ws = generateWordSearch({ words, size: 6, directions: ['E', 'S'], rng: makeRng(1) });
    expect(ws.dropped).toEqual([]);
    expect(ws.placements.map((p) => p.word).sort()).toEqual([...words].sort());
    for (const p of ws.placements) {
      expect(['E', 'S']).toContain(p.direction);
      expect(readCells(ws.grid, p.cells)).toBe(p.word);
      // Consecutive cells step by exactly the direction's vector.
      const [dr, dc] = DIRECTION_VECTORS[p.direction];
      for (let k = 1; k < p.cells.length; k += 1) {
        expect(p.cells[k][0] - p.cells[k - 1][0]).toBe(dr);
        expect(p.cells[k][1] - p.cells[k - 1][1]).toBe(dc);
      }
    }
  });

  it('fills the whole grid with uppercase letters', () => {
    const ws = generateWordSearch({ words: ['cake', 'bike'], size: 6, directions: ['E', 'S'], rng: makeRng(2) });
    expect(ws.grid.length).toBe(6);
    for (const row of ws.grid) {
      expect(row.length).toBe(6);
      for (const ch of row) expect(ch).toMatch(/^[A-Z]$/);
    }
  });

  it('is deterministic for a seed', () => {
    const opts = { words: ['water', 'light', 'house', 'cloud', 'green', 'night'], size: 8, directions: ALL };
    const a = generateWordSearch({ ...opts, rng: makeRng(7), fillBias: 0.5 });
    const b = generateWordSearch({ ...opts, rng: makeRng(7), fillBias: 0.5 });
    expect(a).toEqual(b);
    const c = generateWordSearch({ ...opts, rng: makeRng(8), fillBias: 0.5 });
    expect(c.grid).not.toEqual(a.grid);
  });

  it('never overwrites a placed letter — crossings must agree', () => {
    // Many words on a small board with every direction: crossings are
    // inevitable, so this is where a bad overlap would show.
    for (let seed = 0; seed < 40; seed += 1) {
      const ws = generateWordSearch({
        words: ['tree', 'rain', 'bread', 'green', 'beach', 'night', 'happy', 'water'],
        size: 8,
        directions: ALL,
        rng: makeRng(seed),
        fillBias: 0.6,
      });
      for (const p of ws.placements) expect(readCells(ws.grid, p.cells)).toBe(p.word);
    }
  });

  it('drops and reports a word that does not fit, instead of placing it', () => {
    const ws = generateWordSearch({ words: ['elephant', 'cat'], size: 6, directions: ['E'], rng: makeRng(3) });
    expect(ws.dropped).toEqual(['elephant']);
    expect(ws.placements.map((p) => p.word)).toEqual(['cat']);
  });

  it('drops a word the board has no room left for', () => {
    // Six six-letter words East-only on a 6×6: each takes a full row, so the
    // seventh cannot go anywhere.
    const words = ['aaaaaa', 'bbbbbb', 'cccccc', 'dddddd', 'eeeeee', 'ffffff', 'gggggg'];
    const ws = generateWordSearch({ words, size: 6, directions: ['E'], rng: makeRng(4) });
    expect(ws.placements.length).toBe(6);
    expect(ws.dropped.length).toBe(1);
  });

  it('respects the direction list: forward-only tiers never place backwards', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const ws = generateWordSearch({
        words: ['cat', 'dog', 'sun', 'red'],
        size: 6,
        directions: ['E', 'S'],
        rng: makeRng(seed),
      });
      for (const p of ws.placements) expect(['E', 'S']).toContain(p.direction);
    }
  });

  it('biases fill toward the words\' own letters when asked', () => {
    // With bias 1 every noise letter comes from the word; with a word of one
    // repeated letter the noise is provably that letter.
    const ws = generateWordSearch({ words: ['zzzz'], size: 6, directions: ['E'], rng: makeRng(5), fillBias: 1 });
    for (const row of ws.grid) for (const ch of row) expect(ch).toBe('Z');
  });

  it('lowercases input words', () => {
    const ws = generateWordSearch({ words: ['CAT'], size: 4, directions: ['E'], rng: makeRng(6) });
    expect(ws.placements[0].word).toBe('cat');
  });
});

describe('wordSearchTier', () => {
  it('follows the ladder in the spec', () => {
    expect(wordSearchTier(1)).toMatchObject({ size: 6, count: 4, maxLen: 5 });
    expect(wordSearchTier(2).directions).toEqual(['E', 'S']);
    expect(wordSearchTier(3)).toMatchObject({ size: 8, count: 6 });
    expect(wordSearchTier(4).directions).toContain('SE');
    expect(wordSearchTier(4).directions).not.toContain('W');
    expect(wordSearchTier(5)).toMatchObject({ size: 10, count: 8 });
    expect(wordSearchTier(7).directions).toContain('W');
    expect(wordSearchTier(8)).toMatchObject({ size: 12, count: 10 });
    expect(wordSearchTier(10).directions.length).toBe(8);
  });

  it('never asks for a word longer than the grid', () => {
    for (let t = 1; t <= 10; t += 1) expect(wordSearchTier(t).maxLen).toBeLessThanOrEqual(wordSearchTier(t).size);
  });

  it('always asks for at least four words, so taps_total is at least 3', () => {
    for (let t = 1; t <= 10; t += 1) expect(wordSearchTier(t).count).toBeGreaterThanOrEqual(4);
  });

  it('gets harder: fill bias never decreases with level', () => {
    for (let t = 2; t <= 10; t += 1) {
      expect(wordSearchTier(t).fillBias).toBeGreaterThanOrEqual(wordSearchTier(t - 1).fillBias);
    }
  });
});

describe('cellsBetween', () => {
  it('returns the run for rows, columns and diagonals, inclusive', () => {
    expect(cellsBetween([0, 0], [0, 3])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
    expect(cellsBetween([3, 1], [0, 1])).toEqual([[3, 1], [2, 1], [1, 1], [0, 1]]);
    expect(cellsBetween([0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(cellsBetween([2, 0], [0, 2])).toEqual([[2, 0], [1, 1], [0, 2]]);
  });

  it('is a single cell for a tap, and null for a bent path', () => {
    expect(cellsBetween([1, 1], [1, 1])).toEqual([[1, 1]]);
    expect(cellsBetween([0, 0], [1, 2])).toBeNull();
  });
});
