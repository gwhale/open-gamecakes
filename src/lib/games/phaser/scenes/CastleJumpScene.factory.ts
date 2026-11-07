// CastleJumpScene.factory — Phaser-free entry point for Cakey Castle Jump.
//
// The sibling CastleJumpScene.ts statically imports Phaser 3, whose
// module-level code touches `window` and crashes during Next 16 / Turbopack
// server evaluation. This file breaks that static-import edge: it exports
// only the dimensions, key, types, and a factory whose `create()` dynamic-
// imports the scene class client-side. Shells import from HERE, never from
// CastleJumpScene.ts.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export const CASTLE_JUMP_SCENE_KEY = 'CastleJumpScene';
// Portrait canvas — the game is a vertical climb up the castle, so tall.
export const CASTLE_JUMP_VIEW_W = 480;
export const CASTLE_JUMP_VIEW_H = 720;

export type CastleJumpDifficulty = 'easy' | 'medium' | 'hard';

export interface CastleJumpSceneProps {
  /** Base math tier (1–10). The kid's launcher pick sets the STARTING
   *  difficulty of the gate problems; they ramp up as Cakey climbs. */
  tier: number;
  /** Which operation the gate problems use. Defaults to mixed. */
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** Physics/enemy feel preset. Defaults to 'medium'. */
  difficulty?: CastleJumpDifficulty;
}

export const CastleJumpSceneFactory = {
  key: CASTLE_JUMP_SCENE_KEY,
  create: async () => (await import('./CastleJumpScene')).CastleJumpScene,
};
