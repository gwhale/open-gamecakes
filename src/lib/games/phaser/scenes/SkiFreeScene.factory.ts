// SkiFreeScene.factory — Phaser-free entry point for Meringue Downhill.
//
// The sibling SkiFreeScene.ts statically imports Phaser 3, whose module-
// level code references `window`. In Next 16 with Turbopack dev mode, any
// module reachable via the *static* import graph from a route's server
// ancestors gets evaluated on the server and crashes with `ReferenceError:
// window is not defined`. This file breaks that edge: it exports the
// dimensions, key, and types, plus a factory whose `create()` uses a
// *dynamic* import so the scene class only loads client-side. Shells import
// from here, never from SkiFreeScene.ts. (Same rationale as FlappyScene.factory.)

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';

export const SKI_FREE_SCENE_KEY = 'SkiFreeScene';
// 640×640 — a WIDE slope (like the original Ski Free) so there's real room to
// carve side to side and dodge the Yeti, while keeping a tall downhill runway.
// Widening the view auto-spreads gates/trees/ramps (they spawn across VIEW_W)
// and the host card reflows to this aspect via Phaser.Scale.FIT.
export const SKI_FREE_VIEW_W = 640;
export const SKI_FREE_VIEW_H = 640;

export type SkiFreeDifficulty = 'easy' | 'medium' | 'hard';

export interface SkiFreeSceneProps {
  tier: number;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  difficulty?: SkiFreeDifficulty;
  /** The kid's saved Cakey Store cupcake — the skier IS the kid's character.
   *  Undefined (guest / no saved cupcake) falls back to the plain starter. */
  cupcakeConfig?: CupcakeConfig;
}

export const SkiFreeSceneFactory = {
  key: SKI_FREE_SCENE_KEY,
  create: async () => (await import('./SkiFreeScene')).SkiFreeScene,
};
