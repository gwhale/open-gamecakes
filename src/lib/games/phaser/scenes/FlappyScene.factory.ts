// FlappyScene.factory — Phaser-free entry point for Flappy Math / Word Flap.
//
// The sibling FlappyScene.ts statically imports Phaser 3, whose module-level
// code references `window`. In Next 16 with Turbopack dev mode, any module
// that's reachable via the *static* import graph from a route's server-
// component ancestors gets evaluated on the server — even across `'use client'`
// boundaries in certain cases — which crashes with `ReferenceError: window
// is not defined`.
//
// This file breaks the static graph edge: it exports the dimensions, key,
// types, and a factory object whose `create()` method uses a *dynamic*
// import to pull in the scene class at runtime, client-side only. Shells
// import from here, never from FlappyScene.ts.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';

export const FLAPPY_SCENE_KEY = 'FlappyScene';
export const FLAPPY_VIEW_W = 480;
export const FLAPPY_VIEW_H = 640;

export type FlappyDifficulty = 'easy' | 'medium' | 'hard';
/** Input scheme.
 *   'tap'  = classic flappy — tap applies upward impulse, gravity pulls down.
 *           Losing a life just respawns with 2s immunity (no math modal).
 *   'drag' = finger-steer mode — gravity off, bird follows pointer Y.
 *           Losing a life opens a math challenge; correct answer refunds
 *           the life (the K-friendly option). */
export type FlappyControls = 'tap' | 'drag';

export interface FlappySceneProps {
  tier: number;
  /** Math games: 'verbal' swaps arithmetic for synonyms vocabulary at each
   *  gate (the player's Words-mode pick on the launcher). Defaults to 'math'.
   *  Ignored when subject is 'reading'. */
  challengeMode?: ChallengeMode;
  mathType?: MathKind;
  /** 'make-ten' swaps every math challenge for a "a + ❓ = 10" choice
   *  challenge (tap-to-answer), ignoring tier/mathType. Built for the
   *  anonymous /ba arcade. Defaults to 'standard'. */
  mathStyle?: 'standard' | 'make-ten';
  /** Which mascot flies the plane. Defaults to Cakey; the /ba arcade
   *  uses the BA bear. */
  birdStyle?: 'cakey' | 'ba-bear';
  /** The kid's customized cupcake (from the Cakey Store). When present
   *  and birdStyle is Cakey, it rides in the cockpit instead of the
   *  generic 🎂 mascot — so the kid flies as their own character.
   *  Omitted for guests / the ba-bear arcade → falls back to 🎂. */
  cupcakeConfig?: CupcakeConfig;
  /** Optional starting phase; defaults to 1. */
  startPhase?: number;
  /** Flight-mode preset: 'easy' | 'medium' | 'hard'. Defaults to 'medium'. */
  difficulty?: FlappyDifficulty;
  /** Control scheme. Defaults to 'tap' (classic flappy). */
  controls?: FlappyControls;
}

export const FlappySceneFactory = {
  key: FLAPPY_SCENE_KEY,
  create: async () => (await import('./FlappyScene')).FlappyScene,
};
