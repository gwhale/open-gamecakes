// SharksAndMinnowsScene.factory — Phaser-free entry point for Sharks & Minnows.
// See FlappyScene.factory.ts for the rationale.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export const SHARKS_MINNOWS_SCENE_KEY = 'SharksAndMinnowsScene';
export const SHARKS_MINNOWS_VIEW_W = 800;
export const SHARKS_MINNOWS_VIEW_H = 500;

export interface SharksAndMinnowsSceneProps {
  tier: number;
  mathType: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

export const SharksAndMinnowsSceneFactory = {
  key: SHARKS_MINNOWS_SCENE_KEY,
  create: async () => (await import('./SharksAndMinnowsScene')).SharksAndMinnowsScene,
};
