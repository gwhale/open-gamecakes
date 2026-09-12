// Score-tick animation helper — tween a score badge from its current
// value to a new value over ~400ms so the kid sees the number CLIMB
// rather than just jump. Used by Phaser scenes that show a running
// score badge.
//
// Why: a number that snaps from 12 → 17 reads as "the system updated."
// A number that ticks 12 → 13 → 14 → 15 → 16 → 17 reads as "I earned
// those." The dopamine target is the climbing motion, not the final
// value. ~400ms feels brisk but legible at ages 4-9.
//
// Usage in a scene:
//
//   import { tickScoreBadge } from '@/lib/games/theme';
//
//   private score = 0;
//   private scoreBadge!: BadgeHandle;
//
//   private addScore(delta: number, format = (n: number) => `🪙 ${n}`) {
//     const from = this.score;
//     this.score += delta;
//     tickScoreBadge(this, this.scoreBadge, from, this.score, { format });
//   }
//
// The tween targets a plain JS object holding `{ v: from }` and writes
// each step's value into the badge via setValue(format(n)). Phaser
// tweens don't care that the target isn't a GameObject; they just
// read/write the named property.

import * as Phaser from 'phaser';
import type { BadgeHandle } from './hud';

export interface ScoreTickOpts {
  /** How the integer value renders as a label. Default: `"🪙 N"`. */
  format?: (n: number) => string;
  /** Tween duration in ms. Defaults to 400 — brisk but legible. */
  duration?: number;
  /** Tween ease. Default 'Cubic.easeOut' for a "land hard" feel. */
  ease?: string;
}

const DEFAULT_FORMAT = (n: number): string => `🪙 ${n}`;

export function tickScoreBadge(
  scene: Phaser.Scene,
  badge: BadgeHandle,
  fromValue: number,
  toValue: number,
  opts?: ScoreTickOpts,
): void {
  const format = opts?.format ?? DEFAULT_FORMAT;
  // Same-value: no-op (otherwise the tween still flashes briefly).
  if (fromValue === toValue) {
    badge.setValue(format(toValue));
    return;
  }
  const cursor = { v: fromValue };
  scene.tweens.add({
    targets: cursor,
    v: toValue,
    duration: opts?.duration ?? 400,
    ease: opts?.ease ?? 'Cubic.easeOut',
    onUpdate: () => {
      badge.setValue(format(Math.round(cursor.v)));
    },
    onComplete: () => {
      // Pin the final value exactly — guard against rounding drift on
      // the last frame.
      badge.setValue(format(toValue));
    },
  });
}
