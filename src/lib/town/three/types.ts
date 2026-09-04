// Shared types + tuning for the 3D Gamecakes City (free-roam walkable town).
//
// BUNDLE HYGIENE (same rule as src/lib/games/three/*): this module and its
// siblings (city3d.ts, avatar.ts, engine.ts) must NOT statically import
// `three` at runtime. They use `import type` only — fully erased by the
// compiler — and the loaded `three` namespace is passed into the factory
// functions as an argument. The host (a client component) dynamic-imports
// `three` + the engine inside a useEffect, so the WebGL code only ever loads
// in the browser after the kid enters the city.
//
// COORDINATE SYSTEMS — read this before touching anything spatial:
//   * GAMEPLAY logic (avatar position, walk target, region rects, fog-approach
//     distance, the POST /api/town/position body) all live in WORLD PIXELS,
//     the same 1024×768 space the Phaser walkable town + ParkMapHost use. This
//     keeps the server contract byte-identical and lets us reuse REGIONS' tile
//     coords + spawnPoint directly.
//   * RENDERING happens in three.js UNITS (1 unit = 1 tile = 64px), centered on
//     the origin so the camera/lights/fog use small, friendly magnitudes.
//   * Convert ONLY at the mesh boundary via pxToScene* below. Never store scene
//     units in gameplay state.

import type * as THREE from 'three';
import { WORLD_PX, TILE_SIZE_PX } from '@/lib/town/regions';
import type { CupcakeConfig } from '@/lib/cupcake/config';

/** The runtime `three` namespace, typed. Engine/city/avatar factories accept
 *  this so the modules themselves never statically import three. */
export type ThreeNS = typeof THREE;

// ---- World scale ----
/** Pixels per three.js unit. One unit == one town tile == 64px. */
export const PX_PER_UNIT = TILE_SIZE_PX; // 64
/** World size in three.js units (16 × 12). */
export const WORLD_U = {
  w: WORLD_PX.w / PX_PER_UNIT, // 16
  h: WORLD_PX.h / PX_PER_UNIT, // 12
} as const;

/** Convert a world-pixel X to a scene-unit X (origin-centered). */
export function pxToSceneX(px: number): number {
  return px / PX_PER_UNIT - WORLD_U.w / 2;
}
/** Convert a world-pixel Y (top-down) to a scene-unit Z (origin-centered).
 *  Town "south/down" (larger y) maps to larger z (toward the camera). */
export function pxToSceneZ(py: number): number {
  return py / PX_PER_UNIT - WORLD_U.h / 2;
}
/** Inverse: scene-unit ground point (x,z) back to world pixels. Used by the
 *  raycaster to turn a tapped ground point into a walk target. */
export function sceneToPx(x: number, z: number): { x: number; y: number } {
  return {
    x: (x + WORLD_U.w / 2) * PX_PER_UNIT,
    y: (z + WORLD_U.h / 2) * PX_PER_UNIT,
  };
}

// ---- Movement / interaction tuning (all in WORLD PIXELS) ----
/** Avatar ground speed. Mirrors the Phaser walkable town's
 *  WALK_SPEED_PX_PER_SEC so the city feels identical to the 2D original. */
export const WALK_SPEED_PX = 220;
/** Within this distance of a fogged, unlock-eligible region the approach-to-
 *  unlock prompt fires. Mirrors TownScene's FOG_APPROACH_DISTANCE_PX. */
export const FOG_APPROACH_PX = 80;
/** Within this distance of a game building, the "tap to play" hint shows. */
export const ENTER_PROMPT_PX = 70;
/** Treat the walk as arrived when this close to the target (px). */
export const ARRIVE_EPS_PX = 5;
/** Throttle for the position POST (ms) — fire at most this often while moving. */
export const POSITION_POST_INTERVAL_MS = 2500;

// ---- Wading (avatar only) ----
/** How far past the shoreline (islandNd = 1.0) the avatar may wade before the
 *  sea wall stops it. 1.15 ≈ a shallow ankle/knee-deep ring. Cakey never wades
 *  (he keeps the strict shore clamp). */
export const WADE_ND = 1.15;
/** How far below the water surface (WATER_Y) the avatar's base dips at the
 *  outer edge of the wade ring — reads as feet-in-the-water. */
export const WADE_DIP_U = 0.15;

// ---- Cakey — wandering mascot NPC (all px unless noted) ----
/** Cakey's amble speed — well under the kid's 220 so he reads as a stroller. */
export const CAKEY_SPEED_PX = 95;
/** Dwell range at each wander target (ms) before he picks a new spot. */
export const CAKEY_PAUSE_MIN_MS = 1800;
export const CAKEY_PAUSE_MAX_MS = 4200;
/** How far a new wander target may sit from his current spot (px). */
export const CAKEY_WANDER_MIN_PX = 90;
export const CAKEY_WANDER_MAX_PX = 620;
/** Within this of the kid, Cakey "notices you" (host may pop a hello line). */
export const CAKEY_NEAR_PX = 170;
// CAKEY_MOVE_REPORT_MS (a 90ms / ~11Hz throttle) used to gate the screen-position
// report, justified as avoiding a React re-render every frame. That was not what
// happened: ThreeTownHost assigns the report straight into a ref, so it never
// rendered React at all, while CakeyOverlay's own rAF loop wrote style.left/top
// at 60Hz from a value that only changed 11 times a second. The bubble visibly
// detached from Cakey whenever the camera moved quickly. The report is now made
// every frame — one Vector3.project, no React involvement.
/** Height (scene units) of the bubble/anchor point above Cakey's base. Sits a
 *  little above his cherry hat at his ~1.9× display scale so the follow bubble
 *  clears his taller head instead of overlapping his chest. */
export const CAKEY_HEAD_U = 2.9;

// ---- Camera (scene units) ----
/** How far behind the avatar the chase camera sits (units). */
export const CAM_BACK_U = 7.5;
/** Camera height above the ground (units). */
export const CAM_HEIGHT_U = 6.0;
/** Follow stiffness — fraction of the gap closed per frame at 60fps. Higher =
 *  snappier/stiffer; lower = lazier/cinematic. Re-tuned in the learning hook. */
export const CAM_LERP = 0.08;

/** Props the host threads into the engine factory. All gameplay-space (px). */
export interface ThreeTownProps {
  /** Where to drop the avatar (world px) — the kid's last position or the
   *  spawn region's center. */
  spawnPx: { x: number; y: number };
  /** Slug the avatar starts in (for the initial region-change emit). */
  spawnRegionSlug: string;
  /** Region slugs already revealed for this kid. */
  discovered: string[];
  /** The kid's cupcake_config — drives the walking avatar's base shape +
   *  frosting/wrapper colors so it matches their Cakey Store choice.
   *  Optional; the avatar falls back to a plain cupcake. */
  cupcakeConfig?: CupcakeConfig;
  /** Per-kid land icons: region slug → the owning kid's cupcake_config. When a
   *  region has an entry, its center landmark renders as that kid's cupcake
   *  instead of the generic hero cake + emoji. Resolved server-side from the
   *  family's kids (kids.land_slug → region slug). Empty/absent for guests
   *  and families with no matching kid — those lands keep the emoji landmark. */
  landCupcakes?: Record<string, CupcakeConfig>;
  /** Per-kid land evolution levels: region slug → owner's stage (0..N). Scales
   *  the land's pad + hero and swaps in its evolved structure. Family-wide,
   *  resolved server-side; a missing slug renders as level 0 (Plot). */
  landLevels?: Record<string, number>;
  /** The VIEWING kid's own land slug (kids.land_slug), if any.
   *  Owner-only in-world affordances (the "Grow My Land" upgrade kiosk) are built
   *  only for this slug, so other kids viewing the same land just see the pretty
   *  diorama. Omitted for guests / kids who own no land. */
  ownedLandSlug?: string;
}
