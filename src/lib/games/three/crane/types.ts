// Cakey Crane — shared types + difficulty tuning.
//
// A crane swings a cake layer back and forth over the tower; the kid taps DROP;
// whatever hangs over the edge is sliced off and tumbles away under real
// physics (cannon-es, the same world the Castle/Sandcastle/Tower games use).
// Every five drops the bakery calls an order check — a question gate — and a
// right answer patches the layer wider.
//
// Bundle hygiene, same rule as every other 3D game here: NO runtime `three` or
// `cannon-es` import in this module. `import type` only; the loaded namespaces
// arrive as engine arguments.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { DropTuning, TinSize } from './slab';

export type ThreeNS = typeof THREE;
export type CannonNS = typeof CANNON;

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface CraneSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** Honour prefers-reduced-motion: no camera shake, no confetti. The crane
   *  still sweeps — that IS the game — but nothing else jitters. */
  reducedMotion?: boolean;
}

export interface CraneTuning extends DropTuning {
  /** Half-width of the crane's travel, in world units.
   *
   *  Keep this at or under `slabSize` on the forgiving difficulties. At the far
   *  end of the sweep the layer then still overlaps the tower, so a FULL-WIDTH
   *  slab can never miss outright — a miss only becomes possible once the kid
   *  has trimmed themselves narrow. Random taps in a headless playtest lost
   *  three lives in five drops when the sweep ran wider than the slab, which is
   *  a run ending on the crane's terms rather than the player's. */
  sweep: number;
  /** Crane speed at the first layer (units/second). */
  speedBase: number;
  /** Added to the speed per completed layer. */
  speedGrowth: number;
  /** Hard ceiling on crane speed. */
  speedMax: number;
  /** Starting slab footprint (w and d). */
  slabSize: number;
  /** Height of one cake layer. */
  layerH: number;
  /** Misses allowed before the round ends. */
  lives: number;
  /** Drops between question gates. */
  gateEvery: number;
  /** Width a correct answer patches back onto the working slab. */
  gateReward: number;
  /** Gravity for the offcut physics, m/s². */
  gravity: number;
  /** Layers to reach for 3 stars. */
  starTarget: number;
}

const BASE: Record<Difficulty, CraneTuning> = {
  // Easy: a slow crane, a fat perfect window, generous regrow, five misses.
  // The tuning steps are user-perceptible (not 10% nudges) per the Gamecakes
  // game-feel standard, and all three want a live playtest pass.
  easy: {
    sweep: 2.5, speedBase: 1.8, speedGrowth: 0.06, speedMax: 3.6,
    slabSize: 3, layerH: 0.62, lives: 5, gateEvery: 5, gateReward: 0.5,
    gravity: 16, starTarget: 10,
    perfectTolerance: 0.3, regrow: 0.16, maxSize: 3, minSize: 0.3,
  },
  medium: {
    sweep: 2.6, speedBase: 2.6, speedGrowth: 0.1, speedMax: 5.2,
    slabSize: 2.7, layerH: 0.6, lives: 3, gateEvery: 5, gateReward: 0.4,
    gravity: 18, starTarget: 12,
    perfectTolerance: 0.22, regrow: 0.12, maxSize: 2.7, minSize: 0.28,
  },
  hard: {
    sweep: 2.7, speedBase: 3.4, speedGrowth: 0.16, speedMax: 7,
    slabSize: 2.4, layerH: 0.58, lives: 2, gateEvery: 5, gateReward: 0.3,
    gravity: 20, starTarget: 14,
    perfectTolerance: 0.15, regrow: 0.08, maxSize: 2.4, minSize: 0.25,
  },
};

/** Resolve tuning for a difficulty + tier. Tier scales the QUESTIONS; here it
 *  only nudges the crane a little faster, so a level-9 kid gets a brisker
 *  bakery without the slab ever becoming un-aimable. */
export function resolveCraneTuning(difficulty: Difficulty = 'medium', tier = 1): CraneTuning {
  const base = BASE[difficulty];
  const bump = 1 + Math.min(Math.max(tier - 1, 0), 9) * 0.03;   // +0..27%
  return { ...base, speedBase: base.speedBase * bump };
}

/** Why the round ended. */
export type CraneEndReason = 'timeup' | 'lose';

export interface CraneCallbacks {
  onHeight(layers: number): void;
  onScore(score: number): void;
  onLives(lives: number): void;
  /** Consecutive perfect drops — the HUD shows it as a streak badge. */
  onCombo(combo: number): void;
  /** The tin now riding the crane, so the HUD can name it and show its
   *  multiplier before the kid commits to the drop. */
  onTin(tin: TinSize): void;
  onTimeLeft(ms: number): void;
  /** Order check. The engine has paused itself; the host poses the question and
   *  calls resolveGate(correct). */
  onGate(dropsSoFar: number): void;
  onRoundEnd(reason: CraneEndReason): void;
  onSfx?(name: CraneSfx): void;
}

export type CraneSfx =
  | 'drop' | 'perfect' | 'fit' | 'trim' | 'miss' | 'combo' | 'gate' | 'win' | 'lose' | 'tick';

export interface CraneEngine {
  /** Release the swinging layer. Ignored while paused or mid-drop. */
  drop(): void;
  resolveGate(correct: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): CraneStats;
  dispose(): void;
}

export interface CraneStats {
  height: number;
  /** Clean landings that took aim — perfects plus inside-the-cake fits. */
  cleanDrops: number;
  score: number;
  perfects: number;
  bestCombo: number;
  drops: number;
  livesLeft: number;
}

/** Cake-layer flavours, cycled up the tower so the stack reads as a real layer
 *  cake rather than a colour ramp. Straight off the brand palette. */
export const LAYER_FLAVOURS: { body: number; frosting: number; name: string }[] = [
  { body: 0xfb7185, frosting: 0xffe4e9, name: 'Strawberry' },
  // Golden sponge with a near-white frosting. The reverse (pale sponge, amber
  // frosting) inverted the read: the drips came out DARKER than the cake and
  // hung off the layer like table legs instead of icing.
  { body: 0xfde68a, frosting: 0xfffaf0, name: 'Vanilla' },
  { body: 0x6ee7b7, frosting: 0xd8fff0, name: 'Mint' },
  { body: 0x9a6240, frosting: 0xf0d9c2, name: 'Cocoa' },
  { body: 0xa78bfa, frosting: 0xece4ff, name: 'Grape' },
  { body: 0x38bdf8, frosting: 0xd8f2ff, name: 'Blueberry' },
  { body: 0xfb923c, frosting: 0xffe6cd, name: 'Sherbet' },
];

export function flavourForLayer(layer: number): { body: number; frosting: number; name: string } {
  return LAYER_FLAVOURS[layer % LAYER_FLAVOURS.length];
}
