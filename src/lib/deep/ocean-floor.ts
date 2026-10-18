// The seabed of the Sunken Batterlands — ONE height field, sampled by everything.
//
// DERIVED from abyssal-living-deep `src/underwater/OceanDomain.js` `oceanFloor()`
// (MIT, Davi / Token-Gremlin). See THIRD-PARTY.md. What is carried over is the
// COMPOSITION, which is the good idea: blend a shelf, a shelf-break and a trench
// with smoothsteps to get one continuous depth ramp, then layer broad swells,
// dunes, a sand channel and seeded ridges on top of it. The constants are all
// re-derived — ABYSSAL's encode a 1,419 m world built around four fixed camera
// sites, and ours is a 430 m bowl a kid drives around in.
//
// Dependency-free (no `three`): the terrain mesh, the prop scatter, the sub's
// collision clamp and the tests all call this. Two copies of a seabed is two
// seabeds, and the one you crash into would be the one you cannot see.
//
// GEOGRAPHY — +z is SEAWARD. You surface at the north edge (z ≈ -600, under
// Caramel Cove) and the world gets deeper as you drive south:
//
//   z=-600 ┄┄┄┄┄┄┄ Sprinkle Reef ┄┄┄┄┄┄┄ z=-80    ~33 → 126 m  bright, sandy
//   z=-80  ─────────── the drop ─────────── z=150   126 → 301 m  open blue
//   z=150  ═══════ Crumb Canyon ═══════════ z=600   301 → 450 m  cliffs, dark
//
// The sub's DEPTH_LIMIT_M (370 m) sits well inside the canyon, between the lip
// and the floor: you get far enough to SEE the floor fall away beneath you and
// not far enough to land on it.
//
// THESE NUMBERS ARE THE FOUR CONSTANTS BELOW. They have been retuned once and
// this diagram went stale in the same commit, so if you change them, change it.

import { fieldNoise } from './world-noise';
import { DEEP_SEED, smooth, clamp } from './world-math';
import { DOMAIN_RADIUS_M } from './types';

/** Shallowest water in the reef (metres). Deep enough to fly the sub through
 *  without scraping, shallow enough that the surface is a visible ceiling. */
const REEF_DEPTH_M = 33;
/** Depth at the seaward edge of the reef shelf, just before the drop. */
const SHELF_EDGE_M = 126;
/** Depth of the canyon lip — where the cliffs start and the light gives up. */
const CANYON_LIP_M = 301;
/** Depth of the canyon floor. Below DEPTH_LIMIT_M on purpose: the bottom of the
 *  world has to be visible from the limit, or the wall is just an invisible
 *  fence rather than a place you were stopped short of. */
const CANYON_FLOOR_M = 450;

/** Phase offset derived from the seed, so the whole world's swells shift
 *  together if the seed ever changes rather than each feature moving alone. */
const PHASE = (DEEP_SEED % 997) * 0.003;

/**
 * Seabed height at a world point, in METRES, negative-down (y = 0 is the
 * surface). Continuous and cheap — safe to sample at arbitrary offsets, which
 * is how the tile builder derives analytic normals.
 */
export function oceanFloorM(x: number, z: number): number {
  // --- The ramp: three depth regimes blended into one continuous curve. ---
  const toBreak = smooth(-80, 150, z); // reef shelf → the drop
  const toCanyon = smooth(150, 420, z); // the drop → canyon floor
  const shelf = REEF_DEPTH_M + smooth(-600, -80, z) * (SHELF_EDGE_M - REEF_DEPTH_M);
  const depth =
    shelf * (1 - toBreak) + CANYON_LIP_M * toBreak + (CANYON_FLOOR_M - CANYON_LIP_M) * toCanyon;

  // --- Broad swell: the slow roll that stops the shelf reading as a plane. ---
  const broad = Math.sin(x * 0.011 + PHASE) * Math.cos(z * 0.009 + PHASE * 0.5) * 6;

  // --- Dunes: mid-frequency ripples, strongest on the sandy reef. ---
  const dunes =
    Math.sin(x * 0.031 + Math.sin(z * 0.024 + PHASE) * 1.3) * 2.4 * (1 - toBreak);

  // --- The sand channel. Abyssal's best single trick: a groove that gives the
  //     eye a route THROUGH the reef instead of an even scatter of scenery.
  //     It wanders, so following it is a choice rather than a corridor. ---
  const channel = Math.exp(-(((x - Math.sin(z * 0.012) * 90) / 55) ** 2));

  // --- Escarpment: the canyon's terraced walls. Only exists in the canyon
  //     (sin(toCanyon·π) peaks mid-slope and vanishes at both ends), so the
  //     reef never inherits cliffs it has no business having. ---
  const escarpment =
    Math.sin(x * 0.013 + Math.sin(z * 0.008) * 2.7 + PHASE) *
    Math.sin(z * 0.019 + PHASE) *
    26 *
    Math.sin(toCanyon * Math.PI);

  // --- Seeded relief: the only genuinely APERIODIC term, and the reason the
  //     world does not read as one hill repeated. Two octaves of the noise
  //     field — coarse for landform, fine for texture.
  //
  //     This used to be a third sine (`sin(x * 0.012)`), which was a mistake:
  //     `broad` above has a 571 m period and the bowl is 1200 m across, so a
  //     near-identical frequency beat with it instead of breaking it up, and
  //     the depth map showed the same lobe twice, side by side. Noise cannot
  //     do that to us. Keep this term aperiodic. ---
  const coarse = fieldNoise(x / 150, z / 190, DEEP_SEED + 903);
  const fine = fieldNoise(x / 47, z / 61, DEEP_SEED + 2711);
  const relief = (coarse - 0.5) * 24 + (fine - 0.5) * 8;

  // The swell's own amplitude is modulated by the coarse field, so even the
  // one remaining periodic term never delivers two identical crests.
  return (
    -depth + broad * (0.55 + coarse * 0.9) + dunes - channel * 9 * (1 - toBreak) + escarpment + relief
  );
}

/** Which named band a depth falls in. Drives biome tint, scenery and Cakey's
 *  radio, so all three agree about where you are by construction. */
export type DeepBand = 'reef' | 'drop' | 'canyon';

export function bandAtDepth(depthM: number): DeepBand {
  if (depthM < 100) return 'reef';
  if (depthM < 300) return 'drop';
  return 'canyon';
}

/**
 * Keep the sub inside the world: circular horizontal bound, and never below the
 * seabed. Mutates and returns the vector it is given (called every frame — this
 * is the hot path, and allocating a Vector3 per frame is how a tablet loses its
 * frame budget).
 *
 * `clearance` is how far the hull floats above the floor, so the sub settles ON
 * the sand rather than half-buried in it.
 */
export function constrainToOcean(
  position: { x: number; y: number; z: number },
  clearance = 3,
): { x: number; y: number; z: number } {
  const r = Math.hypot(position.x, position.z);
  if (r > DOMAIN_RADIUS_M) {
    position.x *= DOMAIN_RADIUS_M / r;
    position.z *= DOMAIN_RADIUS_M / r;
  }
  // Never above the surface, never through the floor.
  position.y = clamp(position.y, oceanFloorM(position.x, position.z) + clearance, -1.5);
  return position;
}
