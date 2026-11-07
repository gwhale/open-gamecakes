// The town's graphics tiers, in one table.
//
// An iPad and a desktop draw the same world at different cost. Everything that
// differs between them is a row here, so a later visual change adds a field
// rather than another `isCoarsePointer ? a : b` inside the engine. The current
// values are what the engine shipped with before tiers existed.
//
// `?gfx=high|tablet` forces a tier and `?perf=1` turns on the frame readout
// (perf-overlay.ts). Both are for testing and neither is linked from the UI.

import { PRECIP_CAP_DESKTOP, PRECIP_CAP_TABLET } from '@/lib/town/weather-config';

export type QualityTier = 'high' | 'tablet';

export interface QualitySettings {
  /** Upper limit on devicePixelRatio. */
  maxPixelRatio: number;
  precipCap: number;
  grass: {
    /** Tufts in the live patch that travels with the player. */
    count: number;
    /** Side of that patch, in scene units. */
    patchU: number;
    /** Spacing of the static carpet on every island's green, in scene units. */
    carpetSpacingU: number;
  };
  shadow: {
    /** Half-width of the shadow frustum at the closest camera, in scene units. */
    halfU: number;
    /** Redraw the shadow map every Nth frame. */
    everyFrames: number;
  };
  /** A second, finer read of the ground noise in the terrain shader. */
  groundDetail: boolean;
  /** The two shortest sea waves. */
  seaDetail: boolean;
  /** A cloud density read toward the sun, for lit edges. */
  cloudLight: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  high: {
    maxPixelRatio: 2,
    precipCap: PRECIP_CAP_DESKTOP,
    grass: { count: 6400, patchU: 36, carpetSpacingU: 1 },
    shadow: { halfU: 40, everyFrames: 1 },
    groundDetail: true,
    seaDetail: true,
    cloudLight: true,
  },
  tablet: {
    maxPixelRatio: 2,
    precipCap: PRECIP_CAP_TABLET,
    grass: { count: 3200, patchU: 28, carpetSpacingU: 1.5 },
    shadow: { halfU: 30, everyFrames: 2 },
    groundDetail: false,
    seaDetail: false,
    cloudLight: false,
  },
};

/** The tier from `?gfx=`, or null when absent or unrecognised. */
export function gfxOverride(search: string): QualityTier | null {
  const v = new URLSearchParams(search).get('gfx');
  return v === 'high' || v === 'tablet' ? v : null;
}

/** A touch-first device is treated as a tablet. An override always wins, so a
 *  desktop can preview the iPad's tier and an iPad can try the desktop's. */
export function pickQualityTier(opts: {
  coarsePointer: boolean;
  override?: QualityTier | null;
}): QualityTier {
  return opts.override ?? (opts.coarsePointer ? 'tablet' : 'high');
}

export function perfRequested(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1';
}
