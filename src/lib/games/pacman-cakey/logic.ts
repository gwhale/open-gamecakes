// Cakey Chase — pure grid logic (no Phaser, no three.js).
//
// Extracted so both the legacy Phaser scene and the new 3D engine can share
// the exact same movement rules, tunnel wraparound, ghost AI, and per-tier
// difficulty. Operates purely on the parsed MAZE grid + plain {col,row} state.

import { MAZE, MAZE_COLS, MAZE_ROWS, TUNNEL_ROWS } from './maze';

export type Direction = 'up' | 'down' | 'left' | 'right';
export type GhostMode = 'chase' | 'wander' | 'frightened' | 'eaten';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const DIR_VECTORS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

export const REVERSE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export interface Difficulty {
  cakeyStepMs: number;
  ghostStepMs: number;
  frightenedStepMs: number;
  frightenedDurationMs: number;
  chaserCount: number;
}

/** Per-tier tuning — mirrors the original Phaser scene exactly. */
export function difficultyFromTier(tier: number): Difficulty {
  const t = Math.max(1, Math.min(10, tier));
  return {
    cakeyStepMs: 220 - t * 10,
    ghostStepMs: Math.max(140, 280 - t * 16),
    frightenedStepMs: Math.max(220, 360 - t * 10),
    frightenedDurationMs: Math.max(3500, 7500 - t * 400),
    chaserCount: t <= 2 ? 1 : t <= 5 ? 2 : 3,
  };
}

/** Move one cell in `dir`, applying tunnel wraparound on the left/right edges
 *  of TUNNEL_ROWS. Returns the (possibly wrapped) target col/row. */
export function stepCell(col: number, row: number, dir: Direction): { col: number; row: number } {
  const v = DIR_VECTORS[dir];
  let nc = col + v.dc;
  const nr = row + v.dr;
  if (TUNNEL_ROWS.includes(row)) {
    if (nc < 0) nc = MAZE_COLS - 1;
    else if (nc >= MAZE_COLS) nc = 0;
  }
  return { col: nc, row: nr };
}

/** Can the entity step from (col,row) in `dir` into a walkable cell? */
export function canStep(col: number, row: number, dir: Direction): boolean {
  const target = stepCell(col, row, dir);
  if (target.row < 0 || target.row >= MAZE_ROWS) return false;
  if (target.col < 0 || target.col >= MAZE_COLS) return false;
  return MAZE.cells[target.row][target.col].walkable;
}

export interface GhostLike {
  col: number;
  row: number;
  dir: Direction | null;
  mode: GhostMode;
  ai: 'chase' | 'wander';
  spawnCol: number;
  spawnRow: number;
}

/** Greedy: of the candidate dirs, pick the one whose next cell is closest to
 *  the target (straight-line). */
export function greedyToward(
  ghost: GhostLike,
  candidates: Direction[],
  targetCol: number,
  targetRow: number,
): Direction {
  let best = candidates[0];
  let bestDist = Infinity;
  for (const dir of candidates) {
    const next = stepCell(ghost.col, ghost.row, dir);
    const dist = Math.hypot(next.col - targetCol, next.row - targetRow);
    if (dist < bestDist) {
      bestDist = dist;
      best = dir;
    }
  }
  return best;
}

/** Decide a ghost's next direction from its current cell. `rng` supplies
 *  randomness for wander/frightened modes (pass Math.random). */
export function pickGhostDir(
  ghost: GhostLike,
  cakeyCol: number,
  cakeyRow: number,
  rng: () => number,
): Direction | null {
  const candidates: Direction[] = [];
  for (const dir of DIRECTIONS) {
    if (ghost.dir && dir === REVERSE[ghost.dir]) continue;
    if (canStep(ghost.col, ghost.row, dir)) candidates.push(dir);
  }
  if (candidates.length === 0) {
    if (ghost.dir && canStep(ghost.col, ghost.row, REVERSE[ghost.dir])) {
      return REVERSE[ghost.dir];
    }
    return null;
  }
  if (ghost.mode === 'eaten') {
    return greedyToward(ghost, candidates, ghost.spawnCol, ghost.spawnRow);
  }
  if (ghost.mode === 'frightened' || ghost.ai === 'wander') {
    return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
  }
  return greedyToward(ghost, candidates, cakeyCol, cakeyRow);
}
