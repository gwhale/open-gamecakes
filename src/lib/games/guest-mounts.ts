// How to run a game with nobody signed in.
//
// One row per game. The row says which host component to load and, for the
// Phaser games, which scene to hand it. Everything else is shared: the same
// gentle preset for every game, and — the important part — NO attemptMeta.
//
// That omission is the whole mechanism. Every host now guards on it
// (`if (!props.attemptMeta) return;` before the POST), so a game mounted from
// this table plays normally and writes nothing: no attempt row, no mastery
// update, no token mint, no evidence-engine call, no cost. There is no
// separate "guest mode" to keep in sync — the absence of one prop is the mode.
//
// WHY A TABLE AND NOT A SHELL PER GAME
//
// /ba has a hand-written simplified shell per game, which is why it only ever
// had two. Adding a game to the public arcade should be one row, not 130 lines,
// or the arcade goes stale the moment someone builds a game and forgets.
//
// UPSTREAM GAMES ONLY. A family's own games (registry.local.ts) are not
// upstream's to demo, and a game with no row here simply does not appear.

import type { ComponentType } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any --
 * A mount table erases per-game prop types on purpose: one page mounts
 * sixteen hosts whose props have nothing in common but `gameSlug`. Typing
 * that honestly would mean a union of sixteen interfaces reconstructed here,
 * which would drift from the hosts silently. The runtime contract is proven
 * where it matters instead — guest-mounts.test.ts asserts every module and
 * export named below actually resolves. */
import { UPSTREAM_GAMES } from './registry';

/** The preset every guest game runs at.
 *
 *  Tier 2 is "add and subtract within 10" on the catalog scale — reachable by
 *  a five-year-old and not insulting to a nine-year-old, which is the honest
 *  compromise when you know nothing about who is holding the iPad. Easy
 *  physics for the same reason: a visitor's first thirty seconds should not be
 *  a difficulty wall.
 *
 *  Game-specific extras (tilt calibration, a cupcake config) are all optional
 *  on their scene prop types, so one object satisfies every host. */
const GUEST_SCENE_PROPS = {
  tier: 2,
  challengeMode: 'math' as const,
  mathType: 'addition' as const,
  difficulty: 'easy' as const,
  controls: 'tap' as const,
};

/** A Phaser game: the shared host plus its own scene factory and viewport. */
interface PhaserMount {
  kind: 'phaser';
  load: () => Promise<{ default: ComponentType<any> }>;
  factory: () => Promise<Record<string, unknown>>;
  /** Export names inside the factory module: [sceneFactory, width, height]. */
  keys: [string, string, string];
}

/** A three.js game: its own host, which already owns its viewport. */
interface HostMount {
  kind: 'host';
  load: () => Promise<{ default: ComponentType<any> }>;
}

export type GuestMount = PhaserMount | HostMount;

const phaser = (
  load: PhaserMount['load'],
  factory: PhaserMount['factory'],
  keys: PhaserMount['keys'],
): PhaserMount => ({ kind: 'phaser', load, factory, keys });

const host = (load: HostMount['load']): HostMount => ({ kind: 'host', load });

const PHASER_HOST = () =>
  import('@/components/games/phaser/PhaserGameHost') as unknown as Promise<{
    default: ComponentType<any>;
  }>;

/** slug -> how to mount it anonymously. Add a game by adding a row. */
export const GUEST_MOUNTS: Record<string, GuestMount> = {
  // ---- Phaser ----
  'flappy-math': phaser(
    PHASER_HOST,
    () => import('@/lib/games/phaser/scenes/FlappyScene.factory'),
    ['FlappySceneFactory', 'FLAPPY_VIEW_W', 'FLAPPY_VIEW_H'],
  ),
  'math-asteroids': phaser(
    PHASER_HOST,
    () => import('@/lib/games/phaser/scenes/AsteroidsScene.factory'),
    ['AsteroidsSceneFactory', 'ASTEROIDS_VIEW_W', 'ASTEROIDS_VIEW_H'],
  ),
  'sharks-minnows': phaser(
    PHASER_HOST,
    () => import('@/lib/games/phaser/scenes/SharksAndMinnowsScene.factory'),
    ['SharksAndMinnowsSceneFactory', 'SHARKS_MINNOWS_VIEW_W', 'SHARKS_MINNOWS_VIEW_H'],
  ),
  'ski-free': phaser(
    PHASER_HOST,
    () => import('@/lib/games/phaser/scenes/SkiFreeScene.factory'),
    ['SkiFreeSceneFactory', 'SKI_FREE_VIEW_W', 'SKI_FREE_VIEW_H'],
  ),
  'castle-jump': phaser(
    PHASER_HOST,
    () => import('@/lib/games/phaser/scenes/CastleJumpScene.factory'),
    ['CastleJumpSceneFactory', 'CASTLE_JUMP_VIEW_W', 'CASTLE_JUMP_VIEW_H'],
  ),

  // ---- three.js ----
  'marble-maze': host(() => import('@/components/games/three/MarbleMaze3DHost')),
  'cakey-tower': host(() => import('@/components/games/three/CakeyTower3DHost')),
  'cakey-crane': host(() => import('@/components/games/three/CakeyCrane3DHost')),
  'cakey-road': host(() => import('@/components/games/three/CakeyRoad3DHost')),
  'cakey-racer': host(() => import('@/components/games/three/CakeyRacer3DHost')),
  'castle-crumble': host(() => import('@/components/games/three/CastleCrumble3DHost')),
  'frosting-fighter': host(() => import('@/components/games/three/FrostingFighter3DHost')),
  'pacman-cakey': host(() => import('@/components/games/three/CakeyChase3DHost')),
  'pit-stop': host(() => import('@/components/games/three/PitStop3DHost')),
  'sandcastle-siege': host(() => import('@/components/games/three/SandcastleGameHost')),
  'cakey-stacks': host(() => import('@/components/games/stacks/CakeyStacksHost')),
};

export { GUEST_SCENE_PROPS };

/** Games the arcade can actually offer: upstream, live, and mountable.
 *
 *  Derived rather than hand-listed, so a retired game leaves the arcade on its
 *  own and a local game can never appear in it. A game with no row here simply
 *  does not show up — the absence is the opt-out. */
export function guestPlayableGames() {
  return UPSTREAM_GAMES.filter((g) => !g.retired && GUEST_MOUNTS[g.slug]);
}
