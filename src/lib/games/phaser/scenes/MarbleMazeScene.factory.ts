// MarbleMazeScene.factory — Phaser-free entry point for Marble Math Maze.
// See FlappyScene.factory.ts for the dev-mode rationale (Turbopack dev
// evaluates static imports transitively; Phaser's top-level `window` ref
// would crash server-side evaluation).

import type { MathKind, ChallengeMode } from '@/lib/games/shared/challenge-mode';

export const MARBLE_MAZE_SCENE_KEY = 'MarbleMazeScene';
// Landscape canvas — tilt-controlled marble feels much better when the
// iPad is held wide. The maze layouts (designed in 400×600 portrait)
// are mechanically transposed at scene-init via transposeMaze().
export const MARBLE_MAZE_VIEW_W = 600;
export const MARBLE_MAZE_VIEW_H = 400;

export interface MarbleMazeSceneProps {
  tier: number;
  /** Which question set the gates use. Was declared on the shell and
   *  dropped here, so Words mode served arithmetic while crediting a
   *  reading skill. Fixed 2026-09-03. */
  challengeMode?: ChallengeMode;
  mathType?: MathKind;
  /** Whether the device reported permission for motion/orientation events.
   *  When true the scene binds the tilt listener; when false it falls
   *  back to pointer-drag controls. */
  tiltEnabled: boolean;
  /** Tilt baselines captured during the calibration step (kid holds iPad
   *  flat, taps "Start"). Scene applies them on init so the marble doesn't
   *  drift from frame 1 — capturing on first pointerdown like the v1
   *  shipped behavior produced wrong baselines, since kids tap-and-hold
   *  the iPad at a non-flat angle while reaching for the screen.
   *  Null when tiltEnabled=false (drag mode). */
  tiltBaselineGamma: number | null;
  tiltBaselineBeta: number | null;
}

export const MarbleMazeSceneFactory = {
  key: MARBLE_MAZE_SCENE_KEY,
  create: async () => (await import('./MarbleMazeScene')).MarbleMazeScene,
};
