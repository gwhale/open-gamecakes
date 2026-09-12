// Cakey Stacks — shared types, difficulty tuning, and the renderer contract.
//
// The game splits three ways:
//   logic.ts    pure rules (no clocks, no pixels)
//   core.ts     the round: gravity, input, lock delay, gates, the clock
//   render*.ts  a renderer — 3D cake pan (three) or 2D classic (canvas 2D)
//
// The kid picks the renderer on the launcher, so both have to satisfy the same
// small interface below. Core never imports either one; the host loads exactly
// the renderer that was chosen, which is why picking "2D Classic" downloads no
// three.js at all.
//
// Bundle hygiene, same rule as the other 3D games: NOTHING in this module (or
// core.ts / logic.ts) imports `three` at runtime. Only render3d.ts touches it,
// and even there the namespace arrives as a factory argument.

import type { MathKind } from '@/lib/games/shared/challenge-mode';
import type { ChallengeMode } from '@/lib/games/shared/challenge-mode';
import type { ActivePiece, Board, Cell, PieceType } from './logic';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Which renderer draws the pan. '3d' is the branded cake-pan scene; '2d' is
 *  the flat arcade board (also the low-power option — it loads no WebGL). */
export type StacksView = '3d' | '2d';

export interface StacksSceneProps {
  tier: number;
  mathType?: MathKind;
  difficulty?: Difficulty;
  /** 'verbal' swaps arithmetic for vocabulary. Defaults to 'math'. */
  challengeMode?: ChallengeMode;
  /** Renderer pick from the launcher. Defaults to '3d'. */
  view?: StacksView;
  /** Honour prefers-reduced-motion: no camera punch, no confetti, no shake.
   *  The board still animates — motion is reduced, not removed. */
  reducedMotion?: boolean;
}

export interface StacksTuning {
  /** Level the round starts at — scales the first gravity step. */
  startLevel: number;
  /** Milliseconds per gravity step at level 1. */
  gravityBaseMs: number;
  /** Fastest gravity step this difficulty will ever reach. */
  gravityFloorMs: number;
  /** Lines cleared per level-up. */
  linesPerLevel: number;
  /** Lines cleared between "Order up!" question gates. */
  linesPerGate: number;
  /** How long a resting piece waits before it locks. Every move or rotation
   *  restarts it (up to `lockResets`), which is what lets a kid slide a piece
   *  into a gap they only spotted once it landed. */
  lockDelayMs: number;
  lockResets: number;
  /** Oven rescues: wrong answers at a top-out before the round is over. */
  rescues: number;
  /** Rows the Cherry Bomb clears from the bottom of the pan. */
  bombRows: number;
  /** Rows an oven rescue clears — bigger than a bomb, because the pan is full
   *  and the kid needs somewhere to put the next slice. */
  rescueRows: number;
  /** Cherry Bombs you can hold at once. */
  bombCap: number;
}

const BASE: Record<Difficulty, StacksTuning> = {
  // Easy is genuinely easy: a slice takes a full second per row at level 1 and
  // never drops faster than ~1.7 rows/second even at level 10, the lock delay
  // is nearly a second, and five wrong answers at the rim are survivable.
  easy: {
    startLevel: 1, gravityBaseMs: 1000, gravityFloorMs: 580, linesPerLevel: 12,
    linesPerGate: 6, lockDelayMs: 900, lockResets: 20, rescues: 5,
    bombRows: 2, rescueRows: 5, bombCap: 3,
  },
  medium: {
    startLevel: 1, gravityBaseMs: 800, gravityFloorMs: 320, linesPerLevel: 10,
    linesPerGate: 8, lockDelayMs: 650, lockResets: 15, rescues: 3,
    bombRows: 1, rescueRows: 4, bombCap: 3,
  },
  hard: {
    startLevel: 2, gravityBaseMs: 620, gravityFloorMs: 150, linesPerLevel: 8,
    linesPerGate: 10, lockDelayMs: 480, lockResets: 12, rescues: 2,
    bombRows: 1, rescueRows: 3, bombCap: 2,
  },
};

/** Resolve tuning for a difficulty + tier. Tier scales the *questions*; here it
 *  only nudges the starting level, so a level-9 kid opens a touch quicker
 *  without the pan ever becoming unreadable. */
export function resolveStacksTuning(difficulty: Difficulty = 'medium', tier = 1): StacksTuning {
  const base = BASE[difficulty];
  const bonus = Math.min(2, Math.max(0, Math.floor((tier - 1) / 4)));
  return { ...base, startLevel: base.startLevel + bonus };
}

/** 3-star rating for the end card: layers cleared against a per-difficulty
 *  target, so "3 stars" means roughly the same effort on easy and hard. */
export function starsForRun(lines: number, difficulty: Difficulty): 0 | 1 | 2 | 3 {
  const target = difficulty === 'easy' ? 12 : difficulty === 'hard' ? 8 : 10;
  if (lines >= target) return 3;
  if (lines >= Math.ceil(target * 0.6)) return 2;
  if (lines >= Math.ceil(target * 0.25)) return 1;
  return 0;
}

// ---- flavours ---------------------------------------------------------------

/** One flavour per shape, in PIECE_TYPES order (I O T S Z J L). Straight off
 *  the brand palette — strawberry, golden cream, grape frosting, mint, cocoa,
 *  blueberry, orange sherbet — so the pan reads as cake, not as neon. Every
 *  pair is separable by lightness as well as hue, which is what keeps them
 *  distinguishable to a colour-blind player and on a washed-out iPad screen
 *  outdoors. */
export interface Flavour {
  /** Piece body. */
  body: number;
  /** Frosting cap on the top face (3D) / highlight band (2D). */
  cap: number;
  /** Shadow side, used for the 2D bevel and the 3D underside tint. */
  shade: number;
  /** Kid-facing flavour name — read out by the HUD's next/hold labels. */
  name: string;
}

export const FLAVOURS: Record<PieceType, Flavour> = {
  I: { body: 0xfb7185, cap: 0xffe4e9, shade: 0xbe3455, name: 'Strawberry' },
  O: { body: 0xfbbf24, cap: 0xfff3c4, shade: 0xb27407, name: 'Golden Cream' },
  T: { body: 0xa78bfa, cap: 0xece4ff, shade: 0x6d51c4, name: 'Grape Frosting' },
  S: { body: 0x34d399, cap: 0xd8fff0, shade: 0x0f8a63, name: 'Mint' },
  Z: { body: 0x9a6240, cap: 0xf0d9c2, shade: 0x5c3620, name: 'Cocoa' },
  J: { body: 0x38bdf8, cap: 0xd8f2ff, shade: 0x0a7ead, name: 'Blueberry' },
  L: { body: 0xfb923c, cap: 0xffe6cd, shade: 0xb85c14, name: 'Orange Sherbet' },
};

/** Sprinkle colours for clear/bomb bursts. */
export const SPRINKLES = [0xfb7185, 0x6ee7b7, 0xfde68a, 0x93c5fd, 0xf9a8d4, 0xffffff];

// ---- renderer contract ------------------------------------------------------

/** What core hands a renderer every frame. Read-only — a renderer must never
 *  mutate the board or the piece. */
export interface StacksFrame {
  board: Board;
  /** Null while a clear is animating or the round is over. */
  active: ActivePiece | null;
  /** Landing preview for `active`. Null when ghosts are off or no piece. */
  ghost: ActivePiece | null;
  /** Rows mid-pop, with 0..1 animation progress. */
  clearing: { rows: number[]; t: number } | null;
  level: number;
  /** True once the stack is within three rows of the rim — renderers tint the
   *  pan so the danger reads before the kid has to count rows. */
  danger: boolean;
  paused: boolean;
  /** Fraction of the current gravity step already elapsed (0..1). Renderers
   *  use it to draw the fall smoothly instead of one row per tick. */
  stepT: number;
}

export interface StacksRenderer {
  /** Draw one frame. `dtMs` is real elapsed time, for the renderer's own
   *  easing — core has already applied it to the game state. */
  draw(frame: StacksFrame, dtMs: number): void;
  /** Screen pixels per board cell, for the drag-to-column gesture. */
  pxPerCell(): number;
  /** Canvas-local x/y of the board's top-left corner, in CSS pixels. */
  boardOrigin(): { x: number; y: number };
  /** Sprinkle burst on these cells. */
  burst(cells: Cell[], kind: 'clear' | 'bomb' | 'lock'): void;
  /** Screen punch on a big clear. No-op under reduced motion. */
  punch(strength: number): void;
  resize(): void;
  dispose(): void;
}

// ---- core contract ----------------------------------------------------------

/** Why the round stopped. */
export type StacksEndReason = 'timeup' | 'lose';

/** What a question gate is being asked for. */
export type GateContext = 'preheat' | 'order' | 'bomb' | 'rescue';

export interface StacksCallbacks {
  onScore(score: number): void;
  onLines(lines: number): void;
  onLevel(level: number): void;
  onTimeLeft(ms: number): void;
  onBombs(bombs: number): void;
  onRescues(rescues: number): void;
  /** Next-up queue + held piece, for the HUD previews. */
  onQueue(next: PieceType[], hold: PieceType | null): void;
  /** Core wants a question. It has already paused itself; the host poses the
   *  modal and calls resolveGate(correct) when the kid answers. */
  onGate(context: GateContext): void;
  onRoundEnd(reason: StacksEndReason): void;
  onSfx?(name: StacksSfx): void;
}

export type StacksSfx =
  | 'move' | 'rotate' | 'lock' | 'drop' | 'clear' | 'tetris'
  | 'hold' | 'bomb' | 'levelUp' | 'danger' | 'lose' | 'tick';

/** Directions core can be told to hold down (auto-repeat lives in core, so the
 *  repeat rate is frame-accurate instead of at the mercy of a React timer). */
export type HeldDir = 'left' | 'right' | 'down';

export interface StacksEngine {
  press(dir: HeldDir): void;
  release(dir: HeldDir): void;
  rotate(dir: 1 | -1): void;
  hardDrop(): void;
  hold(): void;
  /** Use a stocked Cherry Bomb, or return false when the tin is empty (the
   *  host then poses a question to earn one). */
  useBomb(): boolean;
  /** Host answer for the open gate. */
  resolveGate(correct: boolean): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): StacksStats;
  dispose(): void;
}

export interface StacksStats {
  score: number;
  lines: number;
  level: number;
  pieces: number;
  bestClear: number;
  bombsUsed: number;
  rescuesUsed: number;
  rescuesLeft: number;
}

/** Re-exported so renderers can type their frames without reaching into logic. */
export type { ActivePiece, Board, Cell, PieceType };
