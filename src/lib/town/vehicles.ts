// Cake-themed rideable vehicles — the fleet a kid can rent "for the day" and
// drive/fly around Gamecakes Island.

import { RENTAL } from '@/lib/tokens/economy';
//
// This is a dependency-free content module (no `three`, no React, no DB) so it
// is the SINGLE SOURCE OF TRUTH shared by three very different consumers:
//   * the 3D engine  — reads `control` + the physics tuning to move the ride;
//   * the rent API   — reads `cost` to charge the right number of Sugar Tokens;
//   * both storefronts (in-town Cakey Garage kiosk + Cakey Store "Garage" tab)
//                      — read `label`/`glyph`/`cost`/`blurb` to render the menu.
//
// A rental lasts until the end of the real day (see supabase migration 0029 /
// POST /api/town/rent-vehicle). Mounting a ride you already rented is free; the
// cost is only paid once, when you first rent it that day.

/** The four rides. The string values double as the DB `vehicle_kind` and the
 *  engine's mount key — keep them stable (they're persisted in rental rows). */
export type VehicleKind = 'skateboard' | 'jeep' | 'biplane' | 'balloon';

/** How a ride moves — the engine branches its per-frame kinematics on this.
 *  'drive' rides stay on the ground and obey the island's walls (they can roll
 *  onto piers + into the shallows, just like the cupcake on foot). 'fly' rides
 *  lift off to a cruise altitude and ignore ground collision entirely, so kids
 *  can soar out over the sea and above still-fogged lands. */
export type VehicleControl = 'drive' | 'fly';

/** The wake a ride leaves behind — sugar-dust off a skateboard, a biscuit-dust
 *  rooster-tail off the jeep, a thin white contrail off the biplane, a warm
 *  burner puff under a climbing balloon. Cheap fading sprites, spawned by the
 *  engine's shared ride-FX pool and gated on `prefers-reduced-motion`. */
export interface VehicleTrail {
  /** Puff tint (0xRRGGBB). */
  color: number;
  /** Spawn interval (ms) while the trail is active. */
  everyMs: number;
  /** Puff radius (scene units). */
  sizeU: number;
  /** Height above the ride's base to spawn the puff (scene units) — dust rides
   *  low near the deck, a contrail sits at fuselage height, a burner puff hangs
   *  just under the basket. */
  yOffU: number;
  /** How far BEHIND the ride (scene units) to drop the puff. */
  backU: number;
  /** 'move' spawns while the ride is travelling (dust / contrail); 'climb'
   *  spawns only while the ride is actively gaining altitude (balloon burner). */
  mode: 'move' | 'climb';
}

export interface VehicleInfo {
  kind: VehicleKind;
  /** Display name shown in the rent menus. */
  label: string;
  /** Emoji identifier — the kiosk glyph + the menu row icon. */
  glyph: string;
  /** One-line kid-facing pitch for the rent card. */
  blurb: string;
  /** Sugar Tokens to rent it for the day — "coolness" pricing, 1..5. */
  cost: number;
  /** Ground ride or airborne ride. */
  control: VehicleControl;

  // ---- Physics tuning (world px/sec + scene units) ----
  /** Travel speed while ridden (world px/sec). The cupcake walks at 220; every
   *  ride is faster than walking so renting always feels like an upgrade. */
  speedPx: number;
  /** 'fly' only — cruise height above the terrain (scene units) the ride climbs
   *  to after takeoff. Ignored for 'drive'. Balloons float higher than planes. */
  cruiseAltitudeU: number;
  /** Vertical offset (scene units) to lift the cupcake so it sits/stands ON the
   *  ride instead of clipping through its deck/seat/basket. Sourced from each
   *  mesh's build (skateboard deck ≈ wheel-top, jeep seat, biplane cockpit,
   *  balloon basket floor). */
  seatOffsetU: number;

  // ---- Steering / juice FEEL (the per-ride character, not just speed) ----
  /** How briskly the ride's BODY eases toward the travel heading, as a per-second
   *  lerp rate (higher = snappier turns). Skateboard nimble, jeep heavier, biplane
   *  carves wide banking arcs, balloon floaty and laggy. The cupcake rider still
   *  turns quickly on top, so the body lag reads as weight, never as sluggish
   *  input. */
  turnResponse: number;
  /** Max roll (radians) the body banks INTO a turn — the single biggest "feel"
   *  cue. Biplane banks hard like a barnstormer, skateboard carves, jeep barely
   *  leans, balloon sways a hair. */
  bankRad: number;
  /** Motion-bob amplitude (scene units) + frequency (Hz) applied to the whole
   *  ride+rider while moving: skateboard light hop, jeep fast rumble, balloon big
   *  slow sway, biplane almost none. */
  bobAmpU: number;
  bobHz: number;
  /** Speed multiplier for the short double-tap BOOST burst (every ride gets one —
   *  forgiving, kid-friendly). */
  boostMult: number;

  // ---- Fly-only altitude band (the climb/dive trim range) ----
  /** Lowest / highest cruise (scene units) the kid can trim to with the climb &
   *  dive buttons: skim the waves at min, soar high to peek over lands at max.
   *  Both 0 for drive rides. */
  minAltitudeU: number;
  maxAltitudeU: number;
  /** How fast holding climb/dive retrims the target altitude (units/sec). 0 for
   *  drive rides. */
  climbRateU: number;

  /** The ride's wake (see VehicleTrail). */
  trail: VehicleTrail;
}

// ============================================================================
// THE FLEET — cost & feel
// ============================================================================
// LEARNING-MODE CONTRIBUTION POINT — this table is where your taste sets the
// whole vibe, and it's the one place worth tuning by hand:
//   * `cost` is the "coolness curve" (1 humble → 5 showstopper). Is a balloon
//     really worth 5× a skateboard? Sensible defaults are set below.
//   * `speedPx` + `cruiseAltitudeU` are the FEEL: a twitchy-fast biplane vs. a
//     slow, dreamy balloon drifter; a nippy skateboard vs. a chunky jeep.
// Everything else in the feature reads from here, so tweaking a number here
// re-tunes the ride everywhere with no other edits.
export const VEHICLE_CATALOG: readonly VehicleInfo[] = [
  {
    kind: 'skateboard',
    label: 'Sprinkle Skateboard',
    glyph: '🛹',
    blurb: 'A frosting deck on gumball wheels. Cheap thrills, zero altitude.',
    cost: RENTAL.BASIC,
    control: 'drive',
    speedPx: 300, // zippier than walking, still ground-bound
    cruiseAltitudeU: 0,
    seatOffsetU: 0.15,
    // Nimble + carvy: snaps into turns and leans hard for its size, light hop.
    turnResponse: 12,
    bankRad: 0.3,
    bobAmpU: 0.035,
    bobHz: 8,
    boostMult: 1.85,
    minAltitudeU: 0,
    maxAltitudeU: 0,
    climbRateU: 0,
    trail: { color: 0xfff2d6, everyMs: 85, sizeU: 0.12, yOffU: 0.05, backU: 0.5, mode: 'move' },
  },
  {
    kind: 'jeep',
    label: 'Cookie Cruiser',
    glyph: '🚙',
    blurb: 'A chunky cookie 4×4 with candy tyres. Rumbles anywhere on land.',
    cost: RENTAL.ROAD,
    control: 'drive',
    speedPx: 340,
    cruiseAltitudeU: 0,
    seatOffsetU: 0.5,
    // Heavy + planted: turns slower, barely leans, rumbles over the sponge.
    turnResponse: 6,
    bankRad: 0.1,
    bobAmpU: 0.06,
    bobHz: 11,
    boostMult: 1.7,
    minAltitudeU: 0,
    maxAltitudeU: 0,
    climbRateU: 0,
    trail: { color: 0xd8b073, everyMs: 120, sizeU: 0.16, yOffU: 0.05, backU: 0.55, mode: 'move' },
  },
  {
    kind: 'biplane',
    label: 'Buttercream Biplane',
    glyph: '✈️',
    blurb: 'Two wings, a spinning prop, and the whole sky. Fast and swoopy.',
    cost: RENTAL.AIR,
    control: 'fly',
    speedPx: 380, // fastest of the fleet — a nippy flyer
    cruiseAltitudeU: 3.2,
    seatOffsetU: 0.6,
    // Swoopy barnstormer: wide banking arcs, big roll into turns, steep boost.
    turnResponse: 4.5,
    bankRad: 0.62,
    bobAmpU: 0.02,
    bobHz: 3,
    boostMult: 2.05,
    minAltitudeU: 0.8, // skim just over the wave-tops
    maxAltitudeU: 7, // soar high enough to peek over fogged lands
    climbRateU: 3.4,
    trail: { color: 0xffffff, everyMs: 65, sizeU: 0.13, yOffU: 0.0, backU: 0.75, mode: 'move' },
  },
  {
    kind: 'balloon',
    label: 'Cupcake Balloon',
    glyph: '🎈',
    blurb: 'A big striped balloon over a woven basket. Drifts high and dreamy.',
    cost: RENTAL.SKY,
    control: 'fly',
    speedPx: 160, // slow, floaty drifter — the opposite of the biplane
    cruiseAltitudeU: 4.6,
    seatOffsetU: 0.4,
    // Dreamy drifter: turns very lazily, sways big and slow, gentle boost, and
    // climbs highest of all — the ride that reaches the sky-high treats.
    turnResponse: 2.2,
    bankRad: 0.12,
    bobAmpU: 0.12,
    bobHz: 1.2,
    boostMult: 1.5,
    minAltitudeU: 1.4,
    maxAltitudeU: 8.2,
    climbRateU: 2.3,
    trail: { color: 0xffb066, everyMs: 130, sizeU: 0.18, yOffU: 0.5, backU: 0, mode: 'climb' },
  },
];

/** Ordered list of the four kinds (menu order = catalog order). */
export const VEHICLE_KINDS: readonly VehicleKind[] = VEHICLE_CATALOG.map((v) => v.kind);

/** Look up a ride by kind. Returns undefined for unknown kinds. */
export function findVehicle(kind: string): VehicleInfo | undefined {
  return VEHICLE_CATALOG.find((v) => v.kind === kind);
}

/** Type guard — is this string one of the four rentable kinds? Used to validate
 *  the rent API body + the mount handle argument. */
export function isVehicleKind(x: unknown): x is VehicleKind {
  return typeof x === 'string' && VEHICLE_KINDS.includes(x as VehicleKind);
}
