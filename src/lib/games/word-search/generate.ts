// Word search grid generator. Pure and seeded — a grid is a function of its
// words, its tier config and one number, so "the word was not in the grid" is
// a reproducible bug report and a test can pin a layout.
//
// Placement is exhaustive, not retried: for each word every (direction, start)
// that fits is enumerated, shuffled with the rng, and the first one that does
// not contradict a letter already on the board is taken. Two words may share a
// cell when the letter agrees (a real crossing, which kids like). A word with
// no legal placement is DROPPED and reported, never squeezed in by overwriting
// — a grid where one word cannot be found is a broken toy, and the caller can
// show one word fewer instead. Longest words go first because they have the
// fewest legal spots.
//
// Fill letters are the difficulty dial the tiers do not otherwise have: at
// tier 1 the noise is uniform, so a word's rare letters stand out; at high
// tiers the noise is drawn from the words' own letters, so "e" and "t" are
// everywhere and the eye has to actually read.

export type Direction = 'E' | 'S' | 'SE' | 'NE' | 'W' | 'N' | 'NW' | 'SW';

export const DIRECTION_VECTORS: Record<Direction, readonly [number, number]> = {
  E: [0, 1],
  S: [1, 0],
  SE: [1, 1],
  NE: [-1, 1],
  W: [0, -1],
  N: [-1, 0],
  NW: [-1, -1],
  SW: [1, -1],
};

export type Cell = [number, number];

export interface Placement {
  word: string;
  direction: Direction;
  cells: Cell[];
}

export interface WordSearch {
  size: number;
  /** Uppercase letters, row-major. */
  grid: string[][];
  placements: Placement[];
  /** Words that could not be placed, in the order they were tried. */
  dropped: string[];
}

export interface GenerateOpts {
  words: readonly string[];
  size: number;
  directions: readonly Direction[];
  rng: () => number;
  /** 0 = uniform a–z noise, 1 = noise drawn only from the words' letters. */
  fillBias?: number;
}

export interface TierConfig {
  size: number;
  /** How many words the grid asks the pool for. */
  count: number;
  maxLen: number;
  directions: readonly Direction[];
  fillBias: number;
  /** Kid-facing, for the launcher preview. */
  blurb: string;
}

const FORWARD: readonly Direction[] = ['E', 'S'];
const WITH_DIAGONALS: readonly Direction[] = [...FORWARD, 'SE', 'NE'];
const ALL_DIRECTIONS: readonly Direction[] = [...WITH_DIAGONALS, 'W', 'N', 'NW', 'SW'];

/** The difficulty ladder. Levels 1–10 from the launcher. */
export function wordSearchTier(level: number): TierConfig {
  const t = Math.max(1, Math.min(10, Math.round(level)));
  if (t <= 2) {
    return { size: 6, count: 4, maxLen: 5, directions: FORWARD, fillBias: 0, blurb: 'A 6×6 grid, 4 words. Words go across → and down ↓.' };
  }
  if (t <= 4) {
    return { size: 8, count: 6, maxLen: 7, directions: WITH_DIAGONALS, fillBias: 0.2, blurb: 'An 8×8 grid, 6 words. Now some go diagonally ↘ ↗ too.' };
  }
  if (t <= 7) {
    return { size: 10, count: 8, maxLen: 9, directions: ALL_DIRECTIONS, fillBias: 0.5, blurb: 'A 10×10 grid, 8 words. Some are spelled backwards ← now — sneaky.' };
  }
  return { size: 12, count: 10, maxLen: 11, directions: ALL_DIRECTIONS, fillBias: 0.7, blurb: 'A 12×12 grid, 10 words, every direction. The big one.' };
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateWordSearch(opts: GenerateOpts): WordSearch {
  const { size, rng } = opts;
  const directions = opts.directions.length > 0 ? opts.directions : FORWARD;
  const fillBias = Math.max(0, Math.min(1, opts.fillBias ?? 0));

  // '' = empty. Filled after placement so a fill letter never blocks a word.
  const grid: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(''));
  const placements: Placement[] = [];
  const dropped: string[] = [];

  // Longest first: they have the fewest legal spots. Ties keep the caller's
  // order so the rng is the only source of variation.
  const ordered = [...opts.words]
    .map((w, i) => ({ w: w.toLocaleLowerCase(), i }))
    .sort((a, b) => b.w.length - a.w.length || a.i - b.i)
    .map((x) => x.w);

  for (const word of ordered) {
    if (word.length === 0 || word.length > size) {
      dropped.push(word);
      continue;
    }
    const candidates: { dir: Direction; r: number; c: number }[] = [];
    for (const dir of directions) {
      const [dr, dc] = DIRECTION_VECTORS[dir];
      for (let r = 0; r < size; r += 1) {
        for (let c = 0; c < size; c += 1) {
          const endR = r + dr * (word.length - 1);
          const endC = c + dc * (word.length - 1);
          if (endR < 0 || endR >= size || endC < 0 || endC >= size) continue;
          candidates.push({ dir, r, c });
        }
      }
    }
    let placed: Placement | null = null;
    for (const cand of shuffle(candidates, rng)) {
      const [dr, dc] = DIRECTION_VECTORS[cand.dir];
      const cells: Cell[] = [];
      let ok = true;
      for (let k = 0; k < word.length; k += 1) {
        const r = cand.r + dr * k;
        const c = cand.c + dc * k;
        const have = grid[r][c];
        if (have !== '' && have !== word[k].toUpperCase()) {
          ok = false;
          break;
        }
        cells.push([r, c]);
      }
      if (!ok) continue;
      placed = { word, direction: cand.dir, cells };
      break;
    }
    if (!placed) {
      dropped.push(word);
      continue;
    }
    for (let k = 0; k < word.length; k += 1) {
      const [r, c] = placed.cells[k];
      grid[r][c] = word[k].toUpperCase();
    }
    placements.push(placed);
  }

  // Noise. The biased alphabet is the multiset of the placed words' letters,
  // so a letter that appears twice in the words appears twice as often in the
  // noise — camouflage in proportion.
  const wordLetters = placements.flatMap((p) => p.word.split(''));
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (grid[r][c] !== '') continue;
      const useWords = wordLetters.length > 0 && rng() < fillBias;
      const source = useWords ? wordLetters : ALPHABET;
      grid[r][c] = source[Math.floor(rng() * source.length)].toUpperCase();
    }
  }

  return { size, grid, placements, dropped };
}

/** The straight run of cells from `a` to `b` inclusive, or null when they are
 *  not on one row, column or 45° diagonal. This is what a drag selects; a
 *  bent path is not a word. */
export function cellsBetween(a: Cell, b: Cell): Cell[] | null {
  const dr = b[0] - a[0];
  const dc = b[1] - a[1];
  if (dr === 0 && dc === 0) return [a];
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  const out: Cell[] = [];
  for (let k = 0; k <= steps; k += 1) out.push([a[0] + sr * k, a[1] + sc * k]);
  return out;
}

/** The word read along a run of cells, lowercase. */
export function readCells(grid: readonly (readonly string[])[], cells: readonly Cell[]): string {
  return cells.map(([r, c]) => grid[r][c]).join('').toLocaleLowerCase();
}
