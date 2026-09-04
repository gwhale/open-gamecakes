// Shared types for Cakey Pit Stop.
//
// Bundle hygiene: NO runtime `three` import — the namespace is passed into the
// engine factory.
//
// NOTE THE DEPENDENCY DIRECTION. The tuning table and every rule live in
// `damage.ts`, which imports NOTHING, and this module re-exports them. That is
// backwards from the usual "types own the tuning" arrangement, and deliberately
// so: `scripts/pitstop-check.mjs` loads `damage.ts` under node's type stripping
// to assert the difficulty curve, and it can only do that while nothing in the
// chain reaches for `three` or an `@/` alias.

import type * as THREE from 'three';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import type { Damage, Difficulty, JobKind, PitStopSummaryStats } from './damage';

export type ThreeNS = typeof THREE;

export type {
  Difficulty, PitStopTuning, Damage, JobKind, JobState, PitStopSummaryStats,
} from './damage';
export {
  resolvePitStopTuning, JOBS, JOB_ORDER, starsForRun, canLeave, countState,
} from './damage';

export interface PitStopSceneProps {
  tier: number;
  difficulty?: Difficulty;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** The kid's Cakey Store cupcake — the crew chief, stood in the box. */
  cupcakeConfig?: CupcakeConfig;
}

/** A car waiting its turn, for the HUD queue strip. */
export interface QueueEntry {
  id: number;
  /** Body colour, so the strip matches a car the kid can actually see. */
  body: number;
  /** True if this car has been here before — it was punted. */
  returning: boolean;
}

export interface PitStopCallbacks {
  /** A car rolled into the box. */
  onCarIn(id: number, body: number, damage: Damage, visits: number): void;
  /** Its damage changed — a job finished, or it arrived back escalated. */
  onDamage(damage: Damage): void;
  /** A job is live and needs an answer. `questionId` must be handed back to
   *  resolveChallenge; see the note there. */
  onJob(kind: JobKind, questionId: number): void;
  /** The crew started wrenching. `ms` is how long it will take, so the HUD can
   *  show a progress arc without duplicating the engine's clock. */
  onWork(kind: JobKind, ms: number): void;
  onWorkDone(kind: JobKind): void;
  /** A car left. `banked` false means it was punted and will be back. */
  onCarOut(id: number, banked: boolean): void;
  /** A punted car rejoined the queue, escalated. */
  onCarReturned(id: number, body: number): void;
  onQueue(entries: QueueEntry[]): void;
  onBudget(banked: number, budget: number): void;
  onTimeLeft(ms: number): void;
  onRoundEnd(reason: 'timeout' | 'shift-complete'): void;
  onSfx?(
    name: 'arrive' | 'correct' | 'wrong' | 'wrench' | 'fixed' | 'bank' | 'limp' | 'tick' | 'timeUp' | 'win',
  ): void;
}

export interface PitStopEngine {
  /** Work a job. Called by a 3D tap on the car OR by an overlay chip — one path,
   *  so the delight route and the accessible route cannot diverge. No-op if the
   *  job isn't damaged, or the crew is already busy. */
  requestJob(kind: JobKind): void;
  /** Send the car away. No-op while anything is still red. */
  sendCar(): void;
  /** Host calls this after the question resolves, passing back the `questionId`
   *  it was posed with. Answers for any other question are ignored — a boolean
   *  gate cannot distinguish a stale answer from a fresh one when finishing one
   *  question can immediately open another. */
  resolveChallenge(correct: boolean, questionId: number): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getSummaryStats(): PitStopSummaryStats;
  dispose(): void;
}
