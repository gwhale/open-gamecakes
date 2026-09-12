// TownScene.factory — Phaser-free entry point for the Gamecakes
// City scene. Same dev-mode rationale as the game scene factories
// (see FlappyScene.factory.ts): Turbopack evaluates static imports
// transitively, and Phaser's top-level `window` reference would
// crash server-side rendering. Async-importing the scene class
// keeps Phaser out of the server bundle entirely.

import type { Region } from '@/lib/town/regions';

export const TOWN_SCENE_KEY = 'TownScene';

export interface TownSceneProps {
  /** Kid avatar emoji, e.g. 🦊 / 🐼 / 🎯. Rendered as a Phaser Text
   *  on a white circle so it pops over the colored region tiles. */
  avatar: string;
  /** Display name — used for the welcome bubble. */
  kidName: string;
  /** Region slugs the kid has discovered. PR 3 doesn't render fog yet
   *  (all regions visible regardless), but the scene tracks this so
   *  PR 5 can drop in fog overlays without changing the contract. */
  discovered: string[];
  /** Initial avatar position in world pixel coordinates. Either the
   *  kid's last-known spot from kid_avatar_position, or the spawnPoint
   *  of their starter region when no row exists yet. */
  spawn: { x: number; y: number };
  /** Slug of the region containing the spawn position — used as the
   *  position-update payload's region_slug until the avatar walks
   *  into a new region. */
  spawnRegion: string;
  /** Full region catalog (passed in so the scene module doesn't have
   *  to also import from regions.ts — keeps the bundle graph cleaner). */
  regions: readonly Region[];
}

export const TownSceneFactory = {
  key: TOWN_SCENE_KEY,
  create: async () => (await import('./TownScene')).TownScene,
};
