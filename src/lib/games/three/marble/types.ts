// Shared types + constants for Marble Math — the 3D tilt-to-roll game.
//
// Bundle hygiene (same rule as the Sandcastle/maze engines): `import type`
// only, so this module carries ZERO three/cannon weight. The live namespaces
// are passed into createMarbleEngine; the host dynamic-imports them in a
// browser-only useEffect.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export type ThreeNS = typeof THREE;
export type CannonNS = typeof CANNON;

/** Props the shell threads through (tilt config comes from calibration). */
export interface MarbleSceneProps {
  tier: number;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** True once device-orientation permission was granted + calibrated. When
   *  false the engine uses the pointer-drag fallback instead. */
  tiltEnabled: boolean;
  /** Raw gamma/beta captured at calibration "Start" — the kid's neutral hold
   *  angle. Tilt is measured relative to these. */
  tiltBaselineGamma: number | null;
  tiltBaselineBeta: number | null;
}

/** Standardized round length across the catalog. Reaching the goal ends the
 *  round early (win); running out of lives or the clock ends it otherwise. */
export const MARBLE_ROUND_MS = 180_000;

/** Lives — falling in a cake-hole costs one (improved pacing: 3 is forgiving
 *  for a kindergartner but still meaningful). */
export const MARBLE_MAX_LIVES = 3;

export type MarbleSfx = 'roll' | 'gate' | 'correct' | 'wrong' | 'fall' | 'win';

export interface MarbleCallbacks {
  onTimeLeft(ms: number): void;
  /** The marble rolled into a locked gate. The host poses the math modal and
   *  later calls engine.resolveGate(correct). The engine halts at the gate
   *  until then. */
  onGateReached(gateId: string): void;
  onGatesProgress(solved: number, total: number): void;
  /** A life was lost to a hole. `lives` is what remains (0 ⇒ game over). */
  onLifeLost(lives: number): void;
  /** The marble reached the goal pad and a fresh maze was built in its place.
   *  `count` is how many mazes have now been cleared this round. The round does
   *  NOT end here — only the clock or running out of lives ends it. */
  onMazeCleared(count: number): void;
  /** The clock hit zero. */
  onTimeUp(): void;
  onSfx?(name: MarbleSfx): void;
}

export interface MarbleEngine {
  setPaused(paused: boolean): void;
  /** Host calls this after the gate modal resolves. */
  resolveGate(correct: boolean): void;
  resize(): void;
  getStats(): { gatesTotal: number; gatesSolved: number; wrongAnswers: number; lives: number; mazesCleared: number };
  dispose(): void;
}
