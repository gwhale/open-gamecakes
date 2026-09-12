// MazeWithGatesScene.factory — Phaser-free entry point.
// See FlappyScene.factory.ts for the rationale.

import type { MazeGatesConfig } from '@/lib/games/maze-gates';

export const MAZE_GATES_SCENE_KEY = 'MazeWithGatesScene';

// Geometry constants mirror the scene's internals. Scene file imports them
// back from here so there's one source of truth.
export const MAZE_GATES_CELL = 48;
export const MAZE_GATES_FRAME_PAD = MAZE_GATES_CELL * 0.3;
export const MAZE_GATES_DPAD_BTN = 56;
export const MAZE_GATES_DPAD_GAP = 8;
export const MAZE_GATES_DPAD_AREA_H =
  MAZE_GATES_DPAD_BTN * 3 + MAZE_GATES_DPAD_GAP * 4;

/** Compute overall scene dimensions for a given config. */
export function mazeViewSize(config: MazeGatesConfig): { width: number; height: number } {
  const { rows, cols } = config.grid;
  const width = cols * MAZE_GATES_CELL + MAZE_GATES_FRAME_PAD * 2;
  const height =
    rows * MAZE_GATES_CELL + MAZE_GATES_FRAME_PAD * 2 + MAZE_GATES_DPAD_AREA_H + 16;
  return { width, height };
}

export interface MazeWithGatesSceneProps {
  config: MazeGatesConfig;
}

export const MazeWithGatesSceneFactory = {
  key: MAZE_GATES_SCENE_KEY,
  create: async () => (await import('./MazeWithGatesScene')).MazeWithGatesScene,
};
