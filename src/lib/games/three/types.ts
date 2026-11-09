// Shared types + tuning for the Sandcastle Siege 3D game.
//
// IMPORTANT — bundle hygiene: this module (and its siblings city.ts,
// balloon.ts, engine.ts) must NOT statically import `three` or `cannon-es`
// at runtime. They use `import type` only — fully erased by the compiler, so
// they carry ZERO 3D-engine weight into any bundle (server included). The
// loaded runtime namespaces are passed into the engine factory functions as
// arguments (see engine.ts), exactly the way PhaserGameHost defers Phaser.
//
// The host (a client component) dynamic-imports `three`, `cannon-es`, and the
// engine together inside a useEffect, so the heavy WebGL/physics code only
// ever loads in the browser, after the kid taps Play.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

/** The runtime `three` namespace, typed. Engine factories accept this so the
 *  module itself never statically imports three. */
export type ThreeNS = typeof THREE;
/** The runtime `cannon-es` namespace, typed. */
export type CannonNS = typeof CANNON;

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyTuning {
  /** Downward gravity magnitude (m/s²) fed to world.gravity. Higher = snappier
   *  fall and a heavier, more satisfying collapse. */
  gravity: number;
  /** Balloon sphere radius (world units). Smaller = harder to land a hit. */
  balloonRadius: number;
  /** Launch power at full pull-back. */
  maxPullPower: number;
  /** Base building count before the per-tier bonus. */
  buildings: number;
  /** Whether to render shadows — the single biggest "premium" cue for reading
   *  the topple, gated so it can be downshifted for weak GPUs. */
  shadows: boolean;
}

// NOTE on power: launch velocity ≈ maxPullPower (the impulse is power*mass and
// Δv = impulse/mass = power). Ballistic range at ~45° ≈ v²/g. The back row of
// the city sits ~22 units from the slingshot, so a full pull needs v ≥ √(22·g):
// easy ≈ 16, medium ≈ 20, hard ≈ 22. We set the ceilings comfortably above that
// so a strong pull clears the back towers with headroom (and the city is also
// pulled a little closer in engine.ts).
export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy:   { gravity: 12, balloonRadius: 0.45, maxPullPower: 22, buildings: 8,  shadows: true },
  medium: { gravity: 18, balloonRadius: 0.40, maxPullPower: 27, buildings: 11, shadows: true },
  hard:   { gravity: 22, balloonRadius: 0.35, maxPullPower: 31, buildings: 14, shadows: true },
};

/** Hard cap so a high-tier bonus on `hard` can never spawn an unbounded city. */
export const MAX_BUILDINGS = 16;

/** Resolve base tuning for a difficulty, then lightly grow the city by tier
 *  (+0..+2 buildings). `tier` itself is passed straight to
 *  generateMathChallenge to scale the *math* difficulty. */
export function resolveTuning(difficulty: Difficulty, tier: number): DifficultyTuning {
  const base = DIFFICULTY[difficulty];
  const bonus = Math.min(2, Math.max(0, Math.floor((tier - 1) / 4)));
  return { ...base, buildings: Math.min(MAX_BUILDINGS, base.buildings + bonus) };
}

// ---- Per-level cake-themed landscapes ----
// Each level paints a different candy world: sky, fog, ground, light tint, and
// a palette for scattered candy decor (gumdrops + lollipops). Levels cycle
// through the set, so every tier feels like a fresh place.
export interface LandscapeTheme {
  name: string;
  sky: number;
  fog: number;
  ground: number;
  /** Ambient light tint. */
  ambient: number;
  /** Directional (sun) light tint. */
  sun: number;
  /** Colors for the scattered candy props. */
  candy: number[];
}

export const LANDSCAPE_THEMES: LandscapeTheme[] = [
  { name: 'Strawberry Fields', sky: 0xffd1e8, fog: 0xffc1de, ground: 0xf3a6c2, ambient: 0xffffff, sun: 0xfff0f6, candy: [0xfb7185, 0x6ee7b7, 0xffffff] },
  { name: 'Minty Meadow',      sky: 0xc8f6e6, fog: 0xb6efdc, ground: 0x8fdfba, ambient: 0xffffff, sun: 0xeafff7, candy: [0x34d399, 0xffffff, 0xfb7185] },
  { name: 'Chocolate Land',    sky: 0xf3e2c7, fog: 0xe7d2ad, ground: 0xb5764a, ambient: 0xfff4e0, sun: 0xfff0d8, candy: [0x7b4a2b, 0xfff1d6, 0xe11d48] },
  { name: 'Blueberry Night',   sky: 0x434a93, fog: 0x4a4f96, ground: 0x5a6bb5, ambient: 0xb3bcff, sun: 0xe6ebff, candy: [0x93b4f0, 0xffffff, 0xfde68a] },
  { name: 'Vanilla Dunes',     sky: 0xfef0c9, fog: 0xfbe6b0, ground: 0xf0dca6, ambient: 0xffffff, sun: 0xfff6e0, candy: [0xfde68a, 0xfff1d6, 0xfb7185] },
  { name: 'Bubblegum Pop',     sky: 0xffc2f0, fog: 0xffb0ea, ground: 0xf58fda, ambient: 0xffffff, sun: 0xfff0fb, candy: [0xff79c6, 0x6ee7b7, 0xffffff] },
  { name: 'Lemon Sherbet',     sky: 0xfff6b0, fog: 0xfdf0a0, ground: 0xe9d978, ambient: 0xffffff, sun: 0xfffbe0, candy: [0xfde047, 0xffffff, 0x6ee7b7] },
  { name: 'Cocoa Dusk',        sky: 0xf7c8a0, fog: 0xf0b890, ground: 0xc98a5a, ambient: 0xfff0e0, sun: 0xffe8cc, candy: [0x7b4a2b, 0xfb7185, 0xfff1d6] },
];

/** Pick a landscape for a level (1-based), cycling through the set. */
export function resolveTheme(level: number): LandscapeTheme {
  const i = (Math.max(1, level) - 1) % LANDSCAPE_THEMES.length;
  return LANDSCAPE_THEMES[i];
}

/** Props the shell threads through to the host/engine. */
export interface SandcastleSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

// ---- Slingshot drag + round constants ----
/** Below this pull distance (px) a release is treated as a tap, not a shot. */
export const MIN_PULL_PX = 24;
/** Drag distance (px) at which power saturates to `maxPullPower`. Lowered so a
 *  comfortable thumb-drag (not a full screen swipe) already reaches max power —
 *  the back towers shouldn't require a heroic pull. */
export const MAX_PULL_PX = 190;
/** Minimum launch power even at the shortest valid pull. */
export const MIN_POWER = 9;
/** How far (world units) the balloon visually pulls back from the anchor at a
 *  full draw — sells the slingshot stretch. */
export const MAX_PULLBACK_UNITS = 3.4;
/** 3-minute round. */
export const ROUND_MS = 180_000;
/** Balloons per round — roughly one a minute over the 3-minute clock. Each is
 *  earned by solving a math problem; the round ends once all 3 are used (or
 *  the clock runs out first). */
export const MAX_BALLOONS = 3;
