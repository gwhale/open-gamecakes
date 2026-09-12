// Shared types for Crayon Maze 3D. No runtime `three` import.

import type * as THREE from 'three';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export type ThreeNS = typeof THREE;

export interface MazeSceneProps {
  tier: number;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

export interface MazeCallbacks {
  /** The fox tried to enter a locked gate — the host poses the math modal and
   *  later calls engine.resolveGate(correct). The engine self-halts until then. */
  onGateOpen(gateId: string): void;
  onGatesProgress(solved: number, total: number): void;
  onWin(): void;
  onSfx?(name: 'hop' | 'catch' | 'escape' | 'win'): void;
}

export interface MazeEngine {
  setDir(dir: 'up' | 'down' | 'left' | 'right'): void;
  /** Host calls this after the gate modal resolves. */
  resolveGate(correct: boolean): void;
  resize(): void;
  zoomBy(factor: number): void;
  getStats(): { gatesTotal: number; gatesSolved: number; wrongAnswers: number };
  dispose(): void;
}
