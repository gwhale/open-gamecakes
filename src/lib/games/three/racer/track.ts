// Cakey Racer — the circuit layout + all the race arithmetic.
//
// ZERO imports on purpose. No `three`, no DOM, no path aliases. Everything in
// here is plain data and pure functions, so `scripts/racer-track-check.mjs` can
// import it straight into node (type-stripping, no build step) and assert the
// invariants that actually bite: lap counting, finishing order, and the rival
// rubber-band staying inside its promised bounds.
//
// The engine turns TRACK_POINTS into a THREE.CatmullRomCurve3 and asks it for
// arc-length-parameterised points; nothing about that needs to live here.
//
// COORDINATE CONTRACT (matches the town + every other 3D game):
//   * world XZ plane, y up
//   * `s`  = total distance travelled since the green flag, in world units.
//           MONOTONIC — it never wraps, never decreases. Laps and race position
//           are both derived from it, which is why neither can have a seam bug.
//   * `u`  = lateral offset across the track, -1 (left kerb) .. +1 (right kerb).
//           |u| > 1 is the sugar rough: still driveable, just slow.

/** Control points for the closed circuit, world XZ, pre-scale.
 *
 *  Reads clockwise from the start/finish line on the bottom straight: a long
 *  run to turn 1, a fast right-hand sweeper, a kink onto the back straight, a
 *  wide top horseshoe, then a late hairpin that spits you back onto the line.
 *
 *  The seam (index 0) sits MID-STRAIGHT and its neighbours are near-collinear,
 *  so the Catmull-Rom tangent through the start/finish gantry is flat — a kink
 *  right on the line would read as a bug every single lap. */
export const TRACK_POINTS: readonly (readonly [number, number])[] = [
  [-20, -60], // 0 · start/finish (mid-straight seam)
  [10, -60],
  [38, -58],
  [60, -46], // turn 1
  [70, -22],
  [64, 4], // kink
  [74, 28],
  [62, 52], // top-right sweeper
  [38, 64],
  [8, 66], // top straight
  [-22, 62],
  [-48, 50],
  [-62, 28],
  [-58, 2], // kink
  [-68, -22], // hairpin
  [-52, -56], // onto the line
];

/** Uniform scale applied to TRACK_POINTS. Tuned so a lap is ~15s at TOP_SPEED —
 *  short enough that a 3-lap race fits a kid's attention and the timer. */
export const TRACK_SCALE = 0.8;

/** Half the driveable road width, world units. The jeep is ~1.4 wide, so this
 *  is a touch over 6 cars — room to overtake without needing a racing line. */
export const TRACK_HALF_W = 4.2;

/** |u| past this is the sugar rough. Kept > 1 so clipping a kerb is a warning,
 *  not an instant punishment. */
export const ROUGH_AT = 1.0;
/** Hard limit on |u| — the scenery boundary. There is deliberately NO wall:
 *  the town's "never wall a kid in" rule applies here too, so leaving the road
 *  costs speed and nothing else. */
export const MAX_U = 1.9;

export const LAPS = 4;

/** Where the Sugar Boost gates stand, as lap fractions.
 *
 *  TWO per lap, at four laps, is eight maths problems a run. One gate a lap was
 *  the first cut and it made a three-problem session — a racing game that had
 *  stopped being a maths game. Neither fraction is near 0, so a gate and a
 *  lap-split can never land on the same frame. */
export const GATES_AT: readonly number[] = [0.35, 0.78];

// ---- Speeds, world units/sec ----
export const TOP_SPEED = 22;
/** Top speed once you're off the road. ~60% — losing a chunk but still moving,
 *  so a kid who slides wide can always drive back on. */
export const ROUGH_SPEED = 13;
export const ACCEL = 15;
/** How fast `u` travels under a held steer input, in u-units/sec. */
export const STEER_RATE = 1.35;

export const BOOST_MUL = 1.45;
export const BOOST_MS = 3200;
/** Speed retained after clouting a rival or a candy cone. */
export const BUMP_MUL = 0.55;

/** Rubber-band envelope. A rival more than RUBBER_RANGE units clear of the
 *  player is slowed by at most RUBBER_STRENGTH; one that far behind is sped up
 *  by the same. Deliberately gentle: strong rubber-banding makes a kid's good
 *  lap feel stolen, which is worse than losing. */
export const RUBBER_RANGE = 55;
export const RUBBER_STRENGTH = 0.18;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Completed laps, 0-based. Derived from monotonic `s`, so there is no seam. */
export function lapOf(s: number, trackLen: number): number {
  return Math.floor(s / trackLen);
}

/** Position within the current lap, 0..1.
 *
 *  Derived FROM lapOf rather than from `s % trackLen`, so the two can never
 *  disagree. The modulo spelling drifts: at s = 3×len float error lands `%` on
 *  len-ε, so lapFrac read 0.9999 while lapOf read 3 — a gate keyed off the
 *  fraction would have fired twice on the line. Subtracting the floor makes
 *  that arithmetically impossible. (Caught by scripts/racer-track-check.mjs.) */
export function lapFrac(s: number, trackLen: number): number {
  return s / trackLen - lapOf(s, trackLen);
}

/** 1-based race position: how many racers are ahead of me, plus one. Ties go to
 *  the player (strict `>`), which is the friendly read on a photo finish. */
export function placeOf(myS: number, otherS: readonly number[]): number {
  let ahead = 0;
  for (const o of otherS) if (o > myS) ahead += 1;
  return ahead + 1;
}

/** On the road (as opposed to the sugar rough)? */
export function isOnTrack(u: number): boolean {
  return Math.abs(u) <= ROUGH_AT;
}

/** The speed cap available at a given lateral offset. */
export function speedCapAt(u: number, boosting: boolean): number {
  const base = isOnTrack(u) ? TOP_SPEED : ROUGH_SPEED;
  return boosting ? base * BOOST_MUL : base;
}

/** Rubber-banded rival pace.
 *
 *  ── This is the game-feel knob. ──────────────────────────────────────────
 *  Scales a rival's base speed by where it sits relative to the player: ahead
 *  → eased off, behind → pushed on. Clamped to ±RUBBER_STRENGTH so a rival can
 *  never be seen doing something its car plainly cannot do.
 *
 *  Alternatives if this feels wrong on a real kid:
 *    · asymmetric — help a trailing rival, never slow a leading one (harder,
 *      but a won race stays honestly won);
 *    · zero strength — pure fixed pace, the race is a time trial with scenery;
 *    · widen RUBBER_RANGE so the band only engages in a blowout.
 *  ─────────────────────────────────────────────────────────────────────────
 */
export function rivalSpeed(baseSpeed: number, rivalS: number, playerS: number): number {
  const gap = rivalS - playerS; // + = rival is ahead
  const band = clamp(-gap / RUBBER_RANGE, -1, 1);
  return baseSpeed * (1 + band * RUBBER_STRENGTH);
}

/** A rival's lateral offset — a slow deterministic weave off its own `s`, so
 *  rivals drift across the road and have to be overtaken around rather than
 *  driven straight through. Pure: no per-frame state to desync. */
export function rivalOffset(s: number, amp: number, freq: number, phase: number): number {
  return amp * Math.sin(s * freq + phase);
}

export interface RivalSpec {
  name: string;
  /** Cookie-body tint passed to buildJeep. */
  bodyColor: number;
  trimColor: number;
  /** Grid slot, as a starting lateral offset. */
  startU: number;
  /** Pace before rubber-banding, as a fraction of TOP_SPEED. */
  pace: number;
  weaveAmp: number;
  weaveFreq: number;
  weavePhase: number;
}

/** Three rivals, each a different candy jeep with its own pace and weave. The
 *  spread of `pace` means one is a genuine threat, one is beatable, and one is
 *  there to be caught early so the kid gets an overtake in lap 1. */
export const RIVALS: readonly RivalSpec[] = [
  {
    name: 'Peppermint Pete',
    bodyColor: 0xe11d48,
    trimColor: 0xffffff,
    startU: 0.15,
    pace: 0.96,
    weaveAmp: 0.42,
    weaveFreq: 0.045,
    weavePhase: 0,
  },
  {
    name: 'Minty',
    bodyColor: 0x4ade80,
    trimColor: 0xfef3c7,
    startU: 0.5,
    pace: 0.9,
    weaveAmp: 0.55,
    weaveFreq: 0.03,
    weavePhase: 2.1,
  },
  {
    name: 'Butterscotch',
    bodyColor: 0xfbbf24,
    trimColor: 0x78350f,
    startU: 0.85,
    pace: 0.83,
    weaveAmp: 0.3,
    weaveFreq: 0.06,
    weavePhase: 4.2,
  },
];

/** The player's grid slot — pole, on the inside. */
export const PLAYER_START_U = -0.35;

/** Static candy cones, repeated every lap. `at` is a lap fraction; `u` the
 *  lateral slot. Placed off the natural racing line and never spanning the full
 *  width, so every one of them is avoidable without lifting. */
export const CONES: readonly { at: number; u: number }[] = [
  { at: 0.07, u: 0.55 },
  { at: 0.16, u: -0.6 },
  { at: 0.24, u: 0.1 },
  { at: 0.28, u: -0.45 },
  { at: 0.41, u: 0.65 },
  { at: 0.58, u: -0.15 },
  { at: 0.66, u: 0.6 },
  { at: 0.74, u: -0.55 },
  { at: 0.83, u: 0.35 },
  { at: 0.92, u: -0.7 },
];

/** Contact box between two racers, in (s, u) space. A jeep is ~2.6 long and
 *  ~1.4 wide; the u figure is that width expressed as a fraction of the half
 *  road width, plus a smidge so near-misses still nudge. */
export const CAR_LEN_S = 3.0;
export const CAR_HALF_U = 1.5 / TRACK_HALF_W;

/** Do two racers occupy the same bit of road? */
export function overlaps(aS: number, aU: number, bS: number, bU: number): boolean {
  return Math.abs(aS - bS) < CAR_LEN_S && Math.abs(aU - bU) < CAR_HALF_U * 2;
}

/** Straight-line length of the control polygon. The real curve is a little
 *  longer (Catmull-Rom bows outside its chords), so this is a lower bound the
 *  check script uses to sanity-test lap timing without pulling in three. */
export function polylineLength(pts: readonly (readonly [number, number])[], scale = 1): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]) * scale;
  }
  return total;
}
