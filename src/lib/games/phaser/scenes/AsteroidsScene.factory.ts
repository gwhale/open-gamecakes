// AsteroidsScene.factory — Phaser-free entry point for Math Asteroids.
// See FlappyScene.factory.ts for the rationale (Turbopack dev-mode server
// evaluates static imports transitively, Phaser crashes without `window`).

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { CupcakeConfig } from '@/lib/cupcake/config';

export const ASTEROIDS_SCENE_KEY = 'AsteroidsScene';
export const ASTEROIDS_VIEW_W = 480;
export const ASTEROIDS_VIEW_H = 640;

export type AsteroidsDifficulty = 'easy' | 'medium' | 'hard';

export interface AsteroidsSceneProps {
  tier: number;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  mathType?: MathKind;
  difficulty?: AsteroidsDifficulty;
  /** The kid's Cakey Store cupcake — rides upright in the ship's cockpit
   *  (counter-rotated against the ship's spin). Omitted for guests →
   *  plain ship, no pilot. */
  cupcakeConfig?: CupcakeConfig;
}

export const AsteroidsSceneFactory = {
  key: ASTEROIDS_SCENE_KEY,
  create: async () => (await import('./AsteroidsScene')).AsteroidsScene,
};
