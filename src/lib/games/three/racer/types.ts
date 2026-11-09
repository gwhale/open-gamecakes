// Shared types + difficulty tuning for Cakey Racer (3D lap racer).
//
// Bundle hygiene (same as Cakey Road / Castle / the town): NO runtime `three`
// import — the loaded namespace is passed into the engine factory. `import
// type` is erased at build, so this module is safe to pull into the server
// bundle via the shell/host prop types.

import type * as THREE from 'three';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';

export type ThreeNS = typeof THREE;

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Held steering input. 0 = straight. */
export type Steer = -1 | 0 | 1;

export interface CakeyRacerSceneProps {
  tier: number;
  difficulty?: Difficulty;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** The kid's saved Cakey Store cupcake — rides in the jeep, and its frosting
   *  colour paints the bodywork so the car is recognisably theirs. */
  cupcakeConfig?: CupcakeConfig;
}

/** Per-difficulty knobs. Everything else lives in track.ts, which is the shared
 *  circuit truth; this is only what the launcher's picker is allowed to bend. */
export interface CakeyRacerTuning {
  /** Multiplier on the player's top speed. */
  playerSpeedMul: number;
  /** Multiplier on every rival's pace. */
  rivalSpeedMul: number;
  /** Multiplier on STEER_RATE — slower steering is easier to place, not harder. */
  steerMul: number;
  /** How much speed survives a cone or a rival. 1 = no penalty. */
  bumpForgiveness: number;
  /** Cones are skipped entirely on easy. */
  cones: boolean;
}

const BASE: Record<Difficulty, CakeyRacerTuning> = {
  // Easy is for the youngest drivers. The car is slower than the rivals' raw
  // pace would suggest ONLY because the rivals are slowed further — the kid
  // should still feel quick. No cones at all: on easy the whole job is steering
  // and the gates, and a first-time five-year-old kept spearing the scenery.
  easy: { playerSpeedMul: 0.82, rivalSpeedMul: 0.7, steerMul: 0.85, bumpForgiveness: 0.85, cones: false },
  medium: { playerSpeedMul: 1.0, rivalSpeedMul: 0.94, steerMul: 1.0, bumpForgiveness: 1.0, cones: true },
  hard: { playerSpeedMul: 1.1, rivalSpeedMul: 1.06, steerMul: 1.15, bumpForgiveness: 1.15, cones: true },
};

/** Resolve tuning from the launcher's difficulty pick + tier. Tier nudges the
 *  rivals up a touch so higher levels race harder without a 2× jump. */
export function resolveCakeyRacerTuning(
  difficulty: Difficulty = 'medium',
  tier = 1,
): CakeyRacerTuning {
  const b = BASE[difficulty];
  const t = 1 + Math.min(Math.max(tier - 1, 0), 9) * 0.02; // +0..18%
  return { ...b, rivalSpeedMul: b.rivalSpeedMul * t };
}

/** Only one gate context today, kept as a type for parity with the other 3D
 *  hosts (Pit Row's tyre-change drill would add a second). */
export type ChallengeContext = 'boost-gate';

export interface CakeyRacerCallbacks {
  /** Completed laps, 0..LAPS. */
  onLap(lap: number): void;
  /** 1-based race position, recomputed every frame. */
  onPlace(place: number): void;
  /** Current speed as a 0..1 fraction of top speed — drives the HUD speedo. */
  onSpeed(pct: number): void;
  onTimeLeft(ms: number): void;
  /** Sugar Boost started or ended — the HUD flashes while it's live. */
  onBoost(active: boolean): void;
  /** A boost gate was reached; the host poses the keypad and later calls
   *  engine.resolveChallenge(correct). The engine self-halts until then. */
  onChallenge(context: ChallengeContext): void;
  onRoundEnd(reason: 'finish' | 'timeout'): void;
  onSfx?(
    name: 'gate' | 'correct' | 'wrong' | 'boost' | 'bump' | 'rough' | 'lap' | 'win' | 'timeUp' | 'tick',
  ): void;
}

export interface CakeyRacerEngine {
  /** Held steering from swipe / on-screen buttons / keyboard. */
  setSteer(steer: Steer): void;
  /** Host calls this after the maths modal resolves. */
  resolveChallenge(correct: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getSummaryStats(): {
    laps: number;
    place: number;
    /** null if no lap was completed. */
    bestLapMs: number | null;
    gatesCleared: number;
    wrongAnswers: number;
    bumps: number;
    finished: boolean;
  };
  dispose(): void;
}
