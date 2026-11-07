// PacmanCakeyScene.factory — Phaser-free entry point for Cakey Chase.
// Same pattern as MathMazeScene.factory: page imports geometry +
// factory; the actual scene class is dynamically imported on the
// client so Phaser doesn't end up in the server bundle.

import {
  CELL_PX,
  HEADER_PX,
  MAZE_COLS,
  MAZE_ROWS,
} from '@/lib/games/pacman-cakey/maze';
import type { MathKind, ChallengeMode } from '@/lib/games/shared/challenge-mode';

export const PACMAN_CAKEY_SCENE_KEY = 'PacmanCakeyScene';

export interface PacmanCakeySceneProps {
  /** Difficulty tier 1–10 — picked by GameLauncher and forwarded
   *  through PhaserGameHost.sceneProps. Drives ghost speed and the
   *  number-range / operation of the math gate problems. */
  tier: number;
  /** Operation constraint for the math gates — addition / subtraction
   *  / multiplication / mixed. The launcher's Problem Type picker sets
   *  this. We thread it through to generateMathChallenge so the gate
   *  questions match the kid's chosen practice mode. */
  /** Which question set the gates use. Was declared on the shell and
   *  dropped here, so Words mode served arithmetic while crediting a
   *  reading skill. Fixed 2026-09-03. */
  challengeMode?: ChallengeMode;
  mathType: MathKind;
}

/** Canvas dimensions. Mirrors the scene's internal numbers so the
 *  page can size the Phaser game without importing the scene. */
export function pacmanCakeyViewSize(): { width: number; height: number } {
  return {
    width: MAZE_COLS * CELL_PX,
    height: MAZE_ROWS * CELL_PX + HEADER_PX,
  };
}

export const PacmanCakeySceneFactory = {
  key: PACMAN_CAKEY_SCENE_KEY,
  create: async () => (await import('./PacmanCakeyScene')).PacmanCakeyScene,
};
