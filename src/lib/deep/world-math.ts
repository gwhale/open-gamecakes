// Seeded randomness and the small maths the whole deep shares.
//
// PORTED from abyssal-living-deep `src/underwater/WorldMath.js` and
// `src/underwater/OceanDomain.js` (MIT, Davi / Token-Gremlin). See
// THIRD-PARTY.md. `seeded`, `parseSeed`, `clamp` and `smooth` are carried over
// as-is; everything else in those files (named dive sites, camera transects,
// documentary fly-through routing) belongs to ABYSSAL's guided tour and has no
// meaning in a world a kid drives themselves.
//
// Dependency-free content module — no `three`, no React, no DB.

export const TAU = Math.PI * 2;

/** THE world seed. Fixed, and it must STAY fixed: two kids on two iPads have to
 *  surface talking about the same canyon, or none of the geography can ever
 *  become canonical. Change this string and every place in the ocean moves —
 *  harmless today (nothing is saved yet), a breaking change the moment
 *  discoveries persist. */
export const WORLD_SEED = 'GAMECAKES_MAIN_01';

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/** Smoothstep between two bounds — the workhorse for blending depth bands. */
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** FNV-1a a seed STRING down to the uint32 the noise field wants, so the seed
 *  can stay human-readable ('GAMECAKES_MAIN_01') everywhere a person reads it. */
export function parseSeed(value: string | number | null | undefined, fallback = 713): number {
  if (value == null || value === '') return fallback;
  if (/^\d+$/.test(String(value))) return Number(value) >>> 0;
  let h = 2166136261;
  for (const c of String(value)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — a small, fast, repeatable PRNG. Returns a function, so each
 *  consumer (terrain, scenery, prop scatter) takes its own stream off a salted
 *  seed and stays independent of how many numbers the others drew. */
export function seeded(seed = 73129): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The resolved uint32 for WORLD_SEED. Everything downstream salts off this. */
export const DEEP_SEED = parseSeed(WORLD_SEED);
