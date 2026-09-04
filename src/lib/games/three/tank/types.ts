// Shared types + constants for Minnow Catch — the 3D fishing game.
//
// Bundle hygiene (same rule as the Sandcastle engine, see ../types.ts):
// this module uses `import type` only, so it carries ZERO three weight into
// any bundle. The live `three` namespace is passed into createTankEngine as
// an argument; the host dynamic-imports `three` + the engine in a browser-only
// useEffect.
//
// The game: a giant aquarium where the kid picks a BAIT and taps the water to
// drop a hook. A fish whose color matches the loaded bait swims up and bites;
// that poses a math gate. Solve it → reel the fish in (+1). Miss it → the fish
// steals the bait and darts off (still catchable later). Stall too long → the
// shark snatches the fish clean off the hook. Clear all the fish (or run out
// the clock) and the round ends.

import type { ThreeNS } from '@/lib/games/three/types';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export type { ThreeNS };

/** Props the shell threads through to the host/engine. */
export interface TankSceneProps {
  tier: number;
  mathType?: MathKind;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

/** Fish in the tank at the start of a round — also the number of fish the kid
 *  must reel in (or lose to the shark) to "clear the tank" for a win. */
export const FISH_COUNT = 8;

/** 3-minute round, identical to the 2D version and Sandcastle Siege. */
export const TANK_ROUND_MS = 180_000;

// ---------------------------------------------------------------------------
// Bait — the heart of the fishing loop.
//
// Each fish "wants" exactly one bait type. The trick that keeps this
// kid-friendly is COLOR: a bait card and the fish that want it share one hex
// color, so matching is a perceptual task ("tap the green fish's green bait"),
// not a memory task. The engine tints fish bodies with `color`; the host tints
// the bait cards with the same value.
// ---------------------------------------------------------------------------
export type BaitType = 'worm' | 'shrimp' | 'lure';

export interface BaitInfo {
  type: BaitType;
  label: string;
  /** Shown on the bait card in the tray. */
  emoji: string;
  /** Shared color for this bait's card AND the fish that want it (0xRRGGBB). */
  color: number;
}

export const BAITS: readonly BaitInfo[] = [
  { type: 'worm', label: 'Worm', emoji: '🪱', color: 0x4ade80 }, // green
  { type: 'shrimp', label: 'Shrimp', emoji: '🦐', color: 0xfb7185 }, // coral
  { type: 'lure', label: 'Lure', emoji: '✨', color: 0x38bdf8 }, // blue
];

/** Sounds the engine asks the host to play. The host maps these to the
 *  shared sound library (the engine never imports it — keeps it pure). */
export type TankSfx = 'cast' | 'bite' | 'reel' | 'escape' | 'shark' | 'bubble';

export interface TankEngineCallbacks {
  /** Emitted (at most once per second) with ms remaining on the clock. */
  onTimeLeft(ms: number): void;
  /** A fish bit the baited hook — the host poses a math gate to reel it in. */
  onFishBite(fishId: number): void;
  /** The clock hit zero. The host shows the game-over overlay. */
  onRoundEnd(): void;
  /** Optional SFX hook. */
  onSfx?(name: TankSfx): void;
}

export interface TankEngine {
  /** Pause/resume the swim + clock (paused while a challenge modal is up). */
  setPaused(paused: boolean): void;
  /** Recompute camera aspect + drawing-buffer size after a layout change. */
  resize(): void;
  /** Load a bait onto the hook. Fish of the matching color will be lured in. */
  setBait(bait: BaitType): void;
  /** Correct answer: the hooked fish is reeled up out of the water (+1). */
  reelInFish(id: number): void;
  /** Wrong answer: the fish steals the bait and darts to a far corner. It
   *  stays alive and can be lured back in on a later cast. */
  escapeFish(id: number): void;
  /** Stalled too long: the shark lunges in and snatches the hooked fish. The
   *  fish is gone for good (does not count as caught). */
  sharkSteal(id: number): void;
  /** Live HUD/score figures. */
  getStats(): { caught: number; remaining: number };
  /** Tear down WebGL + listeners. */
  dispose(): void;
}
