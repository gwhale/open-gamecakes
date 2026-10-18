// Shared types + tuning for the Sunken Batterlands (the divable ocean under
// Gamecakes Island).
//
// BUNDLE HYGIENE — the same rule as src/lib/town/three/*: nothing in
// src/lib/deep/ may statically import `three` at runtime. `import type` only
// (fully erased by the compiler); the loaded namespace is passed into the
// factories as an argument. DeepHost dynamic-imports `three` + the engine
// inside a useEffect, so no WebGL reaches the server bundle.
//
// COORDINATE SYSTEM — deliberately NOT the town's.
//   The town works in world PIXELS (1 tile = 64px) because its server contract
//   (POST /api/town/position) is in that space. The ocean has no such contract
//   and its whole vocabulary is depth in metres, so:
//
//     1 scene unit == 1 METRE. y = 0 is the sea surface. Down is NEGATIVE y.
//
//   Depth is therefore always `-y`, and reads the way the PRD writes it. The
//   two spaces meet at exactly one place — the dock in Caramel Cove — and
//   nothing carries across it but "the kid went diving".

import type * as THREE from 'three';

/** The runtime `three` namespace, typed. Factories accept this so the modules
 *  themselves never statically import three. */
export type ThreeNS = typeof THREE;

// ---- Depth bands (metres below the surface) ----
// MVP builds the first band and the lip of the second. The rest are named here
// because the terrain ramp already passes through their depths — they exist as
// water you sink through, and become places when they get content.
export const BAND = {
  /** Bright, colourful, friendly. Where you start and where the whisk is. */
  SPRINKLE_REEF: { from: 0, to: 100 },
  /** Not built for MVP — the ramp passes through it as open blue. */
  KELP_KITCHEN: { from: 100, to: 300 },
  /** MVP reaches the LIP only: cliffs going dark, and then the wall. */
  CRUMB_CANYON: { from: 300, to: 600 },
} as const;

/** How deep Sub-Cake One may go before the hull complains. The glow sits below
 *  this, permanently out of reach — that unreachability IS the hook. */
export const DEPTH_LIMIT_M = 370;
/** Where the glows sit. Close enough under DEPTH_LIMIT_M to be IN FRAME when
 *  the camera dips at the wall, far enough that the sub is refused before it
 *  gets near one. Too deep is its own failure: 80m below the limit once put
 *  them outside the view entirely, and the dive ended on an empty screen.
 *
 *  THE GAP IS THE FEATURE, not the inequality. This sat 52m below the limit
 *  until the limit moved to 370 and left it 2m clear -- close enough to touch,
 *  which is the one thing it must never be. ocean-floor.test.ts pins a minimum
 *  gap for that reason. Keep it near 50m under DEPTH_LIMIT_M, and comfortably
 *  above the seabed at GLOW_SPOTS. */
export const GLOW_DEPTH_M = 418;

/** Where the glows are, in the canyon. Several, spread out: the canyon is
 *  hundreds of metres wide, and a kid who reaches the limit anywhere else
 *  would get the refusal with nothing underneath it -- all wall, no promise.
 *
 *  Lives here rather than in landmarks.ts so it can be TESTED. landmarks.ts
 *  imports `three`; this file imports nothing at runtime, and a glow buried
 *  in the seabed at its own coordinates is exactly the kind of defect a test
 *  has to be able to see. */
export const GLOW_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [40, 430],
  [-260, 360],
  [250, 520],
  [-90, 560],
] as const;

// ---- World extent ----
/** Horizontal radius of the divable bowl (metres). Beyond it the sub is turned
 *  back. ~810m crosses in about two and a half minutes at cruise, still a size
 *  to re-cross while chasing a sonar bearing without it becoming a commute. */
export const DOMAIN_RADIUS_M = 810;

// ---- Submarine tuning (metres, seconds) ----
// Forgiving and slightly floaty, NOT a submarine simulator. The PRD is explicit
// that eight-year-olds outrank hydrodynamics; every number here is picked for
// "a kid understands this in 60 seconds", which is the branch's success metric.
export const SUB = {
  /** Cruise speed (m/s) at full throttle. */
  CRUISE_MS: 11,
  /** Multiplier while boost is held. */
  BOOST: 1.9,
  /** Turn rate (radians/sec) at cruise. */
  TURN_RATE: 1.5,
  /** Vertical speed (m/s) on the dive/rise control. */
  CLIMB_MS: 7,
  /** How fast thrust reaches the commanded value — low is floaty, high is
   *  twitchy. This is the single most important feel knob in the build. */
  ACCEL_LERP: 2.2,
  /** Drag applied when no throttle is held (fraction of speed shed per second). */
  DRAG: 1.1,
  /** Nose never pitches past this (radians) — a kid who dives at full tilt
   *  should still be able to read the horizon. */
  MAX_PITCH: 0.55,
} as const;

// ---- Camera ----
/** How far behind the sub the chase camera sits (metres). */
export const CAM_BACK_M = 14;
/** Camera height above the hull (metres). */
export const CAM_HEIGHT_M = 5;
/** Follow stiffness — fraction of the gap closed per frame at 60fps. Looser
 *  than the town's 0.08 so the ocean feels like it has weight in it. */
export const CAM_LERP = 0.06;

// ---- Sonar ----
/** How far a pulse reaches (metres). */
export const SONAR_RANGE_M = 260;
/** How long the ring takes to travel that range (seconds). */
export const SONAR_SWEEP_S = 2.2;
/** Cooldown between pulses (seconds) — long enough that mashing it is useless
 *  and short enough that it never feels withheld. */
export const SONAR_COOLDOWN_S = 3.5;
/** How long a pinged object keeps glowing after the ring passes it (seconds).
 *  It must EXPIRE: a mark that persists is a map, and the PRD is explicit that
 *  a map full of icons is what kills exploration. */
export const SONAR_MARK_S = 6;

/** How often the host saves the submarine's position (ms). Slower than the
 *  town's 2.5s: the ocean has one row to write and nothing else reads it mid
 *  dive, so there is no reason to be chatty. */
export const POSITION_POST_INTERVAL_MS = 4000;

/** How recently the deep must have been saved for a dive to RESUME where the
 *  kid left off, rather than starting again at the reef.
 *
 *  Mirrors the walkable town's RESUME_WINDOW_MS, and for the same reason: a
 *  save this fresh means the kid stepped out and came straight back, so
 *  stranding them at the dock would be wrong. Anything older is a new dive.
 *
 *  This is deliberately NOT "always resume". The descent — bright shallow
 *  water, the floor falling away, the light going out — is the best thirty
 *  seconds in the feature, and permanently resuming at the limit in the dark would
 *  quietly delete it from every dive after the first. */
export const RESUME_WINDOW_MS = 30 * 60 * 1000;

/** Where the submarine sits when a dive starts fresh: out in the reef, shallow,
 *  facing seaward, so the first thing pushing forward does is go somewhere that
 *  gets deeper. */
export const REEF_SPAWN = { x: 0, y: -14, z: -420, heading: Math.PI } as const;

/** A saved submarine pose. */
export interface DeepSpawn {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/** Props the host threads into the deep engine factory. */
export interface DeepProps {
  /** Honour prefers-reduced-motion: damps camera sway and the dive transition. */
  reducedMotion?: boolean;
  /** Where to put the submarine. Omit for REEF_SPAWN. */
  spawn?: DeepSpawn;
  /** Landmark slugs this kid has already found, so Cakey greets a thing he has
   *  met before differently from a thing he has not. */
  found?: readonly string[];
  /** The kid's deepest dive so far (metres). Seeds the record tracker so a
   *  second dive does not re-announce a depth they reached last week. */
  bestDepthM?: number;
}
