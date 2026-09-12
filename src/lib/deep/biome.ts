// How each depth band LOOKS — water colour, how far you can see, and how much
// light reaches you.
//
// Dependency-free content module (no `three`, no React, no DB), the same shape
// as cakey-lines.ts / vehicles.ts / story-events.ts, so the art direction of the
// ocean is tunable in one file without opening the engine. The engine reads
// these numbers into a Fog/Color/Light; nothing here knows that.
//
// The bands are CONTINUOUS, not switched. `waterAtDepth()` blends between them,
// because the single most important feeling in this build is that depth is a
// gradient you sink through — a hard cut at 100m would announce that the ocean
// is three rooms rather than one place.

import { BAND } from './types';
import { clamp } from './world-math';

export interface WaterLook {
  /** Fog + background colour (0xRRGGBB) — these are the same value on purpose.
   *  Any gap between them shows up as a visible dome edge where geometry ends. */
  water: number;
  /** three.FogExp2 density. Derived from a target visibility: at d*z ≈ 1.7 the
   *  fog is ~95% opaque, so density = 1.7 / metres-you-can-see. */
  fogDensity: number;
  /** Hemisphere/ambient light intensity — the sun, as much of it as got here. */
  ambient: number;
  /** How much the sub's headlights matter. 0 in bright water (they are a toy),
   *  1 in the canyon (they are the only reason you can see the wall). */
  lampIntensity: number;
  /** Seabed vertex tint at this depth. Sand up top, cold basalt at the bottom. */
  seabed: number;
}

/** Target visibility in metres per band — the number to actually tune. Fog is
 *  the mood AND the performance budget: it is why a 1,200m bowl can be one
 *  draw call without the far side looking like a flat plate. */
const STOPS: ReadonlyArray<{ depth: number; look: WaterLook }> = [
  {
    // Sprinkle Reef — bright, colourful, friendly. You can see across it.
    depth: BAND.SPRINKLE_REEF.from,
    look: {
      water: 0x38bdf8,
      fogDensity: 1.7 / 170,
      ambient: 1.15,
      lampIntensity: 0,
      seabed: 0xfde68a, // SAND.PALE — the reef is a sandy shelf
    },
  },
  {
    // The reef's seaward edge, just before the floor goes.
    depth: BAND.SPRINKLE_REEF.to,
    look: {
      water: 0x1d4ed8,
      fogDensity: 1.7 / 130,
      ambient: 0.78,
      lampIntensity: 0.35,
      seabed: 0xa8b8a0,
    },
  },
  {
    // The Kelp Kitchen. It used to be described here as "open blue, nothing to
    // see sideways, which is the point" — and that was a rationalisation for an
    // empty band. There is a forest in it now, so the water opens up a little
    // to let a kid see the tops of it, and the seabed goes green under the
    // roots instead of straight to cold grey.
    depth: BAND.KELP_KITCHEN.to,
    look: {
      water: 0x0d3556,
      fogDensity: 1.7 / 110,
      ambient: 0.48,
      lampIntensity: 0.75,
      seabed: 0x5e7458,
    },
  },
  {
    // Crumb Canyon — the headlights are the only reason there is a wall.
    depth: BAND.CRUMB_CANYON.from + 120,
    look: {
      water: 0x030b1f,
      fogDensity: 1.7 / 62,
      ambient: 0.2,
      lampIntensity: 1,
      seabed: 0x4a5560,
    },
  },
];

/** Channel-wise lerp of two packed 0xRRGGBB colours. */
function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((Math.round(ar + (br - ar) * t) << 16) |
      (Math.round(ag + (bg - ag) * t) << 8) |
      Math.round(ab + (bb - ab) * t)) >>>
    0
  );
}

/**
 * The look of the water at a given depth (metres, positive). Blended between
 * the stops above, so descending reads as one continuous darkening rather than
 * three rooms with doors between them.
 */
export function waterAtDepth(depthM: number): WaterLook {
  const d = Math.max(0, depthM);
  let i = 0;
  while (i < STOPS.length - 2 && d > STOPS[i + 1].depth) i++;
  const lo = STOPS[i];
  const hi = STOPS[i + 1];
  const t = clamp((d - lo.depth) / (hi.depth - lo.depth), 0, 1);
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    water: mixHex(lo.look.water, hi.look.water, t),
    fogDensity: lerp(lo.look.fogDensity, hi.look.fogDensity),
    ambient: lerp(lo.look.ambient, hi.look.ambient),
    lampIntensity: lerp(lo.look.lampIntensity, hi.look.lampIntensity),
    seabed: mixHex(lo.look.seabed, hi.look.seabed, t),
  };
}
