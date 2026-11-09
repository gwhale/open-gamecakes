// Shared types + tuning for Cakey Chase 3D.
//
// Bundle hygiene (same as Sandcastle/town): no runtime `three` import — the
// loaded namespace is passed into the engine factory. `import type` is erased.

import type * as THREE from 'three';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export type ThreeNS = typeof THREE;

export interface PacmanSceneProps {
  tier: number;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

/** 3-minute round (matches the Phaser original). */
export const ROUND_MS = 180_000;
/** Lives per round. */
export const LIVES = 3;

/** Which event opened the math gate — routes the result reward. */
export type ChallengeContext = 'power-up' | 'caught';

export interface PacmanCallbacks {
  onScore(score: number): void;
  onLives(lives: number): void;
  onPellets(remaining: number, total: number): void;
  onTimeLeft(ms: number): void;
  /** A math gate opened; the host poses the numeric modal and later calls
   *  engine.resolveChallenge(correct). The engine self-halts until then. */
  onChallenge(context: ChallengeContext): void;
  onRoundEnd(reason: 'win' | 'lose' | 'timeout'): void;
  onSfx?(name: 'tap' | 'levelUp' | 'correct' | 'wrong' | 'catch' | 'win' | 'timeUp' | 'tick'): void;
}

export interface PacmanEngine {
  /** Queue a direction from keyboard / swipe / on-screen D-pad. */
  setDir(dir: 'up' | 'down' | 'left' | 'right'): void;
  /** Host calls this after the math modal resolves. */
  resolveChallenge(correct: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  zoomBy(factor: number): void;
  getSummaryStats(): {
    score: number;
    pelletsEaten: number;
    pelletsTotal: number;
    ghostsEaten: number;
    deaths: number;
    wrongAnswers: number;
  };
  dispose(): void;
}
