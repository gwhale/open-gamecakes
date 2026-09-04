// Shared types + tuning for "Cakey's Frosting Fighter" — the Star Fox-inspired
// 3D rail shooter. You fly a cupcake-rocket above a candy city: bank around and
// climb over frosting-tower buildings, hold the blaster to shoot gummy fighters,
// and solve a math gate to reload when the clip runs dry.
//
// Bundle hygiene (same rule as the tank/sandcastle engines): this module uses
// `import type` only, so it carries ZERO three weight into any bundle. The live
// `three` namespace is passed into createFlightEngine as an argument; the host
// dynamic-imports `three` + the engine in a browser-only useEffect. No cannon-es
// — flight is kinematic (no rigid-body solver), kept light for iPad framerate.

import type { ThreeNS } from '@/lib/games/three/types';
import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';

export type { ThreeNS };

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Props the shell threads through to the host/engine. */
export interface FlightSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for synonyms vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
}

/** 3-minute score-attack round, identical to the other 3D games. */
export const FLIGHT_ROUND_MS = 180_000;

/** Lasers per clip — a math gate fires every time the clip empties (after 5
 *  shots) or when you crash a building. Solve it to reload. */
export const AMMO_CLIP = 5;

/** Lasers granted on a WRONG reload answer — a partial clip keeps the round
 *  moving (never a dead end) while still rewarding correct answers with more. */
export const RELOAD_PARTIAL = 3;

/** Blaster upgrade tiers. Flying through a power-up bumps the level (capped),
 *  growing the bolt, recoloring it, and widening the aim lane. `css` mirrors
 *  `color` for the HUD so the badge matches the bolt. Shared by engine + host. */
export interface BlasterLevel {
  /** Bolt body color (hex). */
  color: number;
  /** Bolt emissive (hex) — the glow. */
  emissive: number;
  /** CSS hex string for the HUD badge (matches `color`). */
  css: string;
  /** Bolt size multiplier. */
  scale: number;
  /** Aim-lane half-width (world units) — bigger blaster, easier hits. */
  lane: number;
}

export const BLASTER_LEVELS: ReadonlyArray<BlasterLevel> = [
  { color: 0xffd23f, emissive: 0xffd23f, css: '#ffd23f', scale: 1.0, lane: 1.9 }, // golden
  { color: 0xff8fc7, emissive: 0xff5db0, css: '#ff5db0', scale: 1.4, lane: 2.3 }, // strawberry
  { color: 0x6ee7ff, emissive: 0x22d3ee, css: '#22d3ee', scale: 1.8, lane: 2.7 }, // cyan
  { color: 0xc084fc, emissive: 0xa855f7, css: '#c084fc', scale: 2.3, lane: 3.2 }, // grape
];

export const BLASTER_MAX_LEVEL = BLASTER_LEVELS.length - 1;

/** Sounds the engine asks the host to play. The host maps these to the shared
 *  sound library (the engine never imports it — keeps it pure). */
export type FlightSfx = 'laser' | 'boom' | 'swoop' | 'hit' | 'empty' | 'power';

/** The three power-up drops. `blaster` upgrades the bolt (existing); `speed`
 *  is a temporary power-dash (faster + can't crash); `bomb` is a frosting
 *  bomb that instantly clears the near-field towers + gummies. */
export type PowerupKind = 'blaster' | 'speed' | 'bomb';

export interface FlightEngineCallbacks {
  /** Emitted (at most once per second) with ms remaining on the clock. */
  onTimeLeft(ms: number): void;
  /** Lasers left in the clip changed → host updates the ammo pips. */
  onAmmo(remaining: number): void;
  /** A gummy was blasted → host updates the score HUD (the "fun" score). */
  onScore(blasted: number): void;
  /** Blaster upgraded by a power-up → host updates the blaster badge. */
  onBlaster(level: number): void;
  /** A power-up was grabbed → host flashes a toast for the kind. */
  onPickup?(kind: PowerupKind): void;
  /** The canyon zone opened (~1 min in) → host shows a "fly low!" banner. */
  onCanyon?(): void;
  /** The clip hit zero → host opens the math reload gate. */
  onNeedReload(): void;
  /** The clock hit zero → host shows the game-over overlay. */
  onRoundEnd(): void;
  /** Optional SFX hook. */
  onSfx?(name: FlightSfx): void;
}

export interface FlightEngine {
  /** Pause/resume flight + clock (paused while a reload modal is up). Booms and
   *  laser bolts still animate so a kill resolves cleanly into the pause. */
  setPaused(paused: boolean): void;
  /** Steer the ship. {x,y} each in [-1,1] from the D-pad / keyboard; null = idle. */
  setMove(dir: { x: number; y: number } | null): void;
  /** Hold the blaster. While true (and ammo remains) the engine fires forward
   *  bolts at a fixed cadence. Driven by the on-screen FIRE button + Space. */
  setFiring(on: boolean): void;
  /** Refill the clip after a reload gate. full=true → AMMO_CLIP, false → partial. */
  reload(full: boolean): void;
  /** Recompute camera aspect + drawing-buffer size after a layout change. */
  resize(): void;
  /** Live figures for the end-of-round summary. */
  getStats(): { blasted: number; reloads: number };
  /** Tear down WebGL + listeners. */
  dispose(): void;
}

export interface DifficultyTuning {
  /** Milliseconds between gummy-fighter spawns. Lower = denser swarm. */
  spawnEveryMs: number;
  /** Milliseconds between building spawns. Lower = a denser, twistier city. */
  buildingEveryMs: number;
  /** Forward scroll speed (world units/sec) the city + enemies rush past. */
  worldSpeed: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy:   { spawnEveryMs: 1500, buildingEveryMs: 1300, worldSpeed: 16 },
  medium: { spawnEveryMs: 1150, buildingEveryMs: 1000, worldSpeed: 21 },
  hard:   { spawnEveryMs: 850,  buildingEveryMs: 750,  worldSpeed: 26 },
};

/** Resolve tuning for a difficulty, nudging world speed up slightly by tier so
 *  a higher-tier kid (who also gets harder math) feels a faster city. `tier`
 *  itself is passed straight to generateMathChallenge for the reload problems. */
export function resolveTuning(difficulty: Difficulty, tier: number): DifficultyTuning {
  const base = DIFFICULTY[difficulty];
  const t = Math.max(1, Math.min(10, tier));
  return { ...base, worldSpeed: base.worldSpeed + (t - 1) * 0.6 };
}
