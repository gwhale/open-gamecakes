// The seeded PRNG every Cakey opponent plays with.
//
// Hoisted out of chess/bot.ts so the checkers bot can share it rather than
// carrying a second copy that drifts. chess/bot.ts re-exports makeRng from here,
// so anything already importing it from there keeps working.

/** mulberry32 — a tiny seeded PRNG.
 *
 *  A bot never calls Math.random directly; the caller passes one of these in.
 *  Without a seed, "the bot gave away a king on move 12" is an unreproducible
 *  bug report, and every tier is partly random by design. Seed per game, keep it
 *  in a ref, log it in dev only. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform pick from a non-empty array. */
export function pickOne<T>(xs: readonly T[], rng: () => number): T {
  return xs[Math.floor(rng() * xs.length)];
}
