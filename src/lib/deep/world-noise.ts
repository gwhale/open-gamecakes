// Value noise on an integer lattice — the field every seabed feature samples.
//
// PORTED from abyssal-living-deep `src/underwater/WorldNoise.js` (MIT, Davi /
// Token-Gremlin). See THIRD-PARTY.md. Converted to TypeScript; the hash and the
// smoothstep interpolation are unchanged, because the exact bit-mixing IS the
// function — swap a constant and the whole world reshuffles.
//
// Dependency-free on purpose (no `three`, no React, no DB): the terrain builder,
// the scenery scatter and the tests all sample the SAME field, and a second copy
// would drift silently. Same rule as hash-line.ts.

/** Smoothstep — eases the lattice interpolation so tiles meet without creases. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Deterministic 32-bit hash of an integer lattice cell. `salt` lets one seed
 *  drive several independent fields (terrain vs. scenery vs. prop placement)
 *  without allocating a second generator. */
export function cellSeed(x: number, z: number, seed = 713, salt = 0): number {
  let h =
    Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(z ^ salt, 0xc2b2ae35) ^
    (seed >>> 0);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Bilinear value noise in [0,1]. Continuous everywhere, so it can be sampled
 *  at arbitrary offsets to derive analytic normals. */
export function fieldNoise(x: number, z: number, seed = 713): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const tx = ease(x - ix);
  const tz = ease(z - iz);
  const h = (dx: number, dz: number) => cellSeed(ix + dx, iz + dz, seed) / 4294967295;
  const a = h(0, 0) * (1 - tx) + h(1, 0) * tx;
  const b = h(0, 1) * (1 - tx) + h(1, 1) * tx;
  return a * (1 - tz) + b * tz;
}
