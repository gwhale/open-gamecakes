// Shared types + tuning for the Castle Crumble 3D game.
//
// Castle Crumble is a limited-ammo artillery puzzle: solve a math problem to load
// the candy cannon, tap to set the barrel angle, tap to lock the power, and blast
// a cake-block castle to rubble before you run out of cannonballs. It reuses the
// Sandcastle Siege physics primitives (the launch impulse + topple blast) but
// swaps the drag-back slingshot for a tap-timed cannon, and the timed round for
// an ammo budget with a win-on-crumble goal.
//
// Bundle hygiene (same rule as the Sandcastle modules): NO runtime `three` /
// `cannon-es` import here — the loaded namespaces arrive as engine args. We only
// pull pure helpers/constants from the sibling Sandcastle modules.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { Difficulty, DifficultyTuning, LandscapeTheme } from '../types';
import { DIFFICULTY, resolveTheme } from '../types';

// Re-export the bits the host/engine need so callers can import everything
// castle-related from this one module.
export type { Difficulty, LandscapeTheme };
export { resolveTheme };

/** Props the shell threads through to the host/engine. */
export interface CastleSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

/** Castle tuning. Extends the Sandcastle physics tuning (gravity, balloon size,
 *  launch power, shadows — all already dialed to the game-feel bar, and shaped
 *  exactly how `computeLaunch` expects) with the two puzzle-specific knobs:
 *  how big the fortress is, and how generous the ammo is. */
export interface CastleTuning extends DifficultyTuning {
  /** Extra wall segments per side beyond the base fortress. Grows the castle
   *  (and, proportionally, the ammo) at higher tiers. */
  extraWallsPerSide: number;
  /** Cannonballs per structure the kid gets — the engine multiplies this by the
   *  actual number of structures it builds, so ammo always scales with castle
   *  size no matter how the layout changes. Each ball is earned by solving a
   *  math problem; the round is LOST once they're spent without crumbling the
   *  castle. */
  ammoFactor: number;
}

/** Cannonballs-per-structure by difficulty. ~1.0 (easy) means roughly a ball per
 *  structure — trivially winnable; lower means you must lean on chain reactions
 *  (a toppling tower knocking over its neighbours). Tune by user-perceptible
 *  doubling/halving, not 10% (Gamecakes game-feel standard). NOTE: needs a live
 *  playtest pass — set generous/kid-forgiving for now. */
export const AMMO_FACTOR_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 0.8,
  hard: 0.65,
};

/** Fraction of the castle's structures that must be flattened to win. Forgiving
 *  (< 100%) so a few stubborn blocks wedged upright can't deny an otherwise-
 *  crumbled castle — the kid earned the win the moment the fortress is rubble. */
// Flatten this fraction of the castle's pieces to win. Eased a touch from 0.7
// for the much bigger (~17-piece) fortress — you topple most of it, not all.
export const WIN_FLATTEN_FRACTION = 0.7;

// ---------------------------------------------------------------------------
// Ammo arsenal — the escalating cannonball roster. The gobstopper is the precise
// default round; the cherry bomb is a heavier, big-blast AoE built for chain
// reactions, unlocked at higher tiers. Each shot is loaded by answering a math
// problem, then fired from the candy cannon (tap the angle, tap the power).
// ---------------------------------------------------------------------------

export type WeaponId = 'cannonball' | 'cherryBomb';

export interface Weapon {
  id: WeaponId;
  label: string;
  glyph: string;
  /** Projectile sphere radius. `balloon` overrides this with tuning.balloonRadius
   *  (its size scales with difficulty); the bomb uses this value directly. */
  radius: number;
  /** Mass once launched — heavier drives more momentum through the cakes. */
  mass: number;
  /** Radial topple-blast applied on impact (fed to applyToppleBlast). */
  blastStrength: number;
  blastRadius: number;
  /** Camera-shake magnitude on impact (0 = none; gated on reduced-motion). */
  shake: number;
  /** Cake-crumb debris chunks spawned at the impact point. */
  debris: number;
  /** Lowest tier at which this weapon is available (escalation gate). */
  minTier: number;
  /** Body/mesh tint. */
  color: number;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  // Precise default — a heavy grape gobstopper. Distinct grape colour so it never
  // reads as the (red) cherry bomb, and heavier than the old water balloon so the
  // cannon lands with a satisfying candy *thunk*.
  cannonball: {
    id: 'cannonball', label: 'Gobstopper', glyph: '🟣',
    // Small, precise shot — reads as a candy pellet against the big fortress,
    // and the tighter ball makes picking off a single tower more satisfying.
    radius: 0.9, mass: 0.9, blastStrength: 18, blastRadius: 9,
    shake: 0.14, debris: 4, minTier: 1, color: 0x8b5cf6,
  },
  // Heavy AoE — roughly double the blast + reach, meaty shake + debris. Built
  // to set off chain reactions (topple a tower into its neighbours).
  cherryBomb: {
    id: 'cherryBomb', label: 'Cherry Bomb', glyph: '🍒',
    // Still the bigger of the two (kids read power by size), matched to the
    // castle's own cherry toppers (0xe11d48) — just scaled down with the
    // smaller default so the size *contrast* survives the shrink.
    radius: 1.1, mass: 1.4, blastStrength: 34, blastRadius: 13,
    shake: 0.32, debris: 12, minTier: 2, color: 0xe11d48,
  },
};

/** Weapons available at a given tier (always includes the gobstopper). Order is
 *  stable (gobstopper first) so the host's picker is deterministic. */
export function weaponsForTier(tier: number): Weapon[] {
  return (['cannonball', 'cherryBomb'] as WeaponId[])
    .map((id) => WEAPONS[id])
    .filter((w) => tier >= w.minTier);
}

/** 3-star efficiency rating — fewer shots = more stars (matches the reference's
 *  per-level star scoring). `par` is the engine's target shot count for the
 *  castle size. A loss is 0 stars. */
export function starsForRun(won: boolean, shots: number, par: number): 0 | 1 | 2 | 3 {
  if (!won) return 0;
  if (shots <= par) return 3;
  if (shots <= par + 2) return 2;
  return 1;
}

/** Resolve castle tuning for a difficulty + tier. Physics carries over from the
 *  Sandcastle table; the castle grows +0..+2 wall segments per side every ~4
 *  tiers (mirrors resolveTuning's building bonus). `tier` itself also scales the
 *  *math* difficulty via generateMathChallenge. */
export function resolveCastleTuning(difficulty: Difficulty, tier: number): CastleTuning {
  const base = DIFFICULTY[difficulty];
  const extraWallsPerSide = Math.min(2, Math.max(0, Math.floor((tier - 1) / 4)));
  return { ...base, extraWallsPerSide, ammoFactor: AMMO_FACTOR_BY_DIFFICULTY[difficulty] };
}
