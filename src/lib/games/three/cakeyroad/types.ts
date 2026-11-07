// Shared types + difficulty tuning for Cakey Road (3D crossy-hopper).
//
// Bundle hygiene (same as Cakey Chase / Castle / town): NO runtime `three`
// import — the loaded namespace is passed into the engine factory. `import
// type` is erased at build, so this module is safe to pull into the server
// bundle via the shell/host prop types.

import type * as THREE from 'three';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';

export type ThreeNS = typeof THREE;

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Hop directions. Forward = away from the camera (up a row). */
export type HopDir = 'up' | 'down' | 'left' | 'right';

/** Lives per run — matches the rest of the catalog. */
export const LIVES = 3;

export interface CakeyRoadSceneProps {
  tier: number;
  difficulty?: Difficulty;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** The kid's saved Cakey Store avatar — rendered as the hopper. */
  cupcakeConfig?: CupcakeConfig;
}

/** Per-difficulty knobs. Speeds are in cells/second; gaps/lengths in cells. */
export interface CakeyRoadTuning {
  hopMs: number;          // duration of a single cell hop
  carSpeed: number;       // road hazard speed (cells/s), scaled per-lane
  carGap: number;         // spacing between road hazards (cells)
  raftSpeed: number;      // river raft drift speed (cells/s)
  raftGap: number;        // gap between rafts (cells)
  raftLen: number;        // raft length (cells)
  trainSpeed: number;     // Sugar Express speed (cells/s)
  trainWarnMs: number;    // crossing-signal lead time before a train
  gateEvery: number;      // rows between checkpoint gates
  maxRiverBand: number;   // max consecutive river rows (crossability cap)
  coinChance: number;     // 0..1 chance a non-gate lane spawns a coin
}

const BASE: Record<Difficulty, CakeyRoadTuning> = {
  // Easy is for the youngest players — deliberately gentle. Slow, well-spaced
  // hazards; long, tightly-packed rafts (almost a continuous bridge); a long
  // train warning; and NEVER two river rows in a row (maxRiverBand 1) so a
  // beginner is never asked to chain two raft-jumps. Paired with the lane
  // generator's on-ramp (SAFE_START_ROWS + a speed ramp), the first stretch
  // stays very forgiving and the challenge builds slowly. (Kid feedback: the
  // crossing started way too hard even on easy, 2026-07-13.)
  easy: {
    hopMs: 150, carSpeed: 1.5, carGap: 5.5, raftSpeed: 1.2, raftGap: 2.0, raftLen: 4,
    trainSpeed: 7, trainWarnMs: 2000, gateEvery: 6, maxRiverBand: 1, coinChance: 0.5,
  },
  medium: {
    hopMs: 140, carSpeed: 3.0, carGap: 3.6, raftSpeed: 2.1, raftGap: 2.2, raftLen: 3,
    trainSpeed: 11, trainWarnMs: 1200, gateEvery: 6, maxRiverBand: 3, coinChance: 0.42,
  },
  hard: {
    hopMs: 130, carSpeed: 3.8, carGap: 3.1, raftSpeed: 2.6, raftGap: 2.0, raftLen: 2,
    trainSpeed: 13, trainWarnMs: 1000, gateEvery: 7, maxRiverBand: 3, coinChance: 0.34,
  },
};

/** Resolve tuning from the launcher's difficulty pick + tier. Tier nudges the
 *  base speeds up a touch so higher levels feel quicker without a 2× jump. */
export function resolveCakeyRoadTuning(
  difficulty: Difficulty = 'medium',
  tier = 1,
): CakeyRoadTuning {
  const b = BASE[difficulty];
  const t = 1 + Math.min(Math.max(tier - 1, 0), 9) * 0.03; // +0..27%
  return {
    ...b,
    carSpeed: b.carSpeed * t,
    raftSpeed: b.raftSpeed * t,
    trainSpeed: b.trainSpeed * t,
  };
}

/** Only one gate context for this game, but kept as a type for parity with the
 *  other 3D hosts (and room to grow). */
export type ChallengeContext = 'gate';

export interface CakeyRoadCallbacks {
  onDistance(furthestRow: number): void;
  onCoins(coins: number): void;
  onLives(lives: number): void;
  onTimeLeft(ms: number): void;
  /** A checkpoint gate opened; host poses the keypad and later calls
   *  engine.resolveChallenge(correct). The engine self-halts until then. */
  onChallenge(context: ChallengeContext): void;
  onRoundEnd(reason: 'lose' | 'timeout'): void;
  onSfx?(name: 'hop' | 'coin' | 'correct' | 'wrong' | 'splash' | 'thud' | 'swoop' | 'win' | 'timeUp' | 'tick'): void;
}

export interface CakeyRoadEngine {
  /** Queue a hop from swipe / D-pad / keyboard. */
  setDir(dir: HopDir): void;
  /** Host calls this after the math modal resolves. */
  resolveChallenge(correct: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getSummaryStats(): {
    furthestRow: number;
    coins: number;
    deaths: number;
    gatesCleared: number;
    wrongAnswers: number;
  };
  dispose(): void;
}
