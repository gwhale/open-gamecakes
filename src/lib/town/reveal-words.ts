// How many words of Cakey's line are on screen. Pure, so it can be tested without
// a voice clip.

/** The reading clock's tick. */
export const REVEAL_TICK_MS = 190;
/** How far the clock may run ahead of a playing clip, about 1.5 seconds. Past
 *  that the clip has stalled, and a kid shouldn't wait on it to read the line. */
const STALL_GRACE_TICKS = 8;

export function wordsShown(opts: {
  total: number;
  revealAll: boolean;
  /** True while a clip is giving word timings for this line. */
  tracked: boolean;
  /** The word being spoken, when tracked. */
  wordIndex: number;
  /** Ticks since the line appeared. */
  clock: number;
}): number {
  const { total, revealAll, tracked, wordIndex, clock } = opts;
  if (revealAll) return total;
  const shown = tracked ? Math.max(wordIndex + 1, clock - STALL_GRACE_TICKS, 1) : clock + 1;
  return Math.min(total, shown);
}
