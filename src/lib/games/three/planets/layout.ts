// Musical Planets — where things go, as plain arithmetic.
//
// The engine is a three.js scene, but every position it uses comes from here,
// so the parts a test CAN check (which key sits where, which keys a phone
// shows, how far the camera stands back) are checked without a browser.
//
// Two frames:
//   * WORLD: the circle of fifths lies flat in the XZ plane around the sun at
//     the origin. Planet 0 (C) is at the back (-Z), counting clockwise as seen
//     from above, so from the space camera C is at the top of the screen and G
//     is the next planet to the right, as on every printed circle.
//   * STAGE: the staff and the piano are laid out in CAMERA space (the camera
//     looks down -Z), so they hold still on screen while the world flies past
//     behind them. A thing placed at NDC (x, y) at depth d is at
//     (x·hw(d), y·hh(d), -d), where hh/hw are the half extents of the view.

import { CIRCLE, keyOf, majorScale, midiOf, PIANO_HIGH, PIANO_LOW, type KeyId } from '@/lib/games/music/theory';
import { planetAngle } from './angle';

/** Planet colours. The three lesson planets take the three cake layers so they
 *  read as the brand; the rest cycle the gumdrop and sprinkle hues. Colour is
 *  never the only cue: every planet carries its name. */
export const PLANET_COLORS: Record<KeyId, number> = {
  C: 0xfb7185, G: 0x34d399, F: 0x60a5fa,
  D: 0xfbbf24, A: 0xc084fc, E: 0xf472b6, B: 0x93c5fd,
  'F#': 0xa7f3d0, Db: 0xf9a8d4, Ab: 0xfde68a, Eb: 0x6ee7b7, Bb: 0xfda4af,
};

// ---------------------------------------------------------------------------
// The circle
// ---------------------------------------------------------------------------

export const ORBIT_R = 6;
/** Planet body radius at scale 1 (music-planet.glb is 1 unit across). */
export const PLANET_R = 0.5;

export function planetPos(i: number, r = ORBIT_R): { x: number; y: number; z: number } {
  const a = planetAngle(i);
  return { x: Math.cos(a) * r, y: 0, z: -Math.sin(a) * r };
}

// ---------------------------------------------------------------------------
// The piano: C4 to C6, fifteen white keys
// ---------------------------------------------------------------------------

/** Centre-to-centre distance of two white keys (music-key-white.glb is 0.94
 *  wide, leaving a 0.06 gap). */
export const WHITE_W = 1;
export const WHITE_LEN = 4.6;
export const WHITE_H = 0.55;
export const BLACK_LEN = 2.9;
export const BLACK_H = 0.5;
/** Top of the bed's floor, where the white keys stand. */
export const BED_FLOOR = 0.25;
/** Black keys stand on a riser so their tops clear the whites. */
export const BLACK_BASE = BED_FLOOR + 0.22;

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
/** Black keys sit a little off the crack between two whites, as on a real
 *  piano: C♯ and F♯ lean left, D♯ and A♯ lean right. */
const BLACK_NUDGE: Record<number, number> = { 1: -0.08, 3: 0.08, 6: -0.1, 8: 0, 10: 0.1 };

export function isBlack(midi: number): boolean {
  return !WHITE_PCS.includes(((midi % 12) + 12) % 12);
}

/** Index of a white key counted from C4 = 0; a black key gets the index of the
 *  white key just below it. */
export function whiteIndex(midi: number): number {
  const rel = midi - PIANO_LOW;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  const below = WHITE_PCS.filter((w) => w <= pc).length - 1;
  return oct * 7 + below;
}

export const WHITE_COUNT = whiteIndex(PIANO_HIGH) + 1;

/** x of a key's centre in the piano's frame, the keyboard centred on 0. */
export function keyX(midi: number): number {
  const mid = (WHITE_COUNT - 1) / 2;
  const x = (whiteIndex(midi) - mid) * WHITE_W;
  if (!isBlack(midi)) return x;
  return x + WHITE_W / 2 + BLACK_NUDGE[((midi % 12) + 12) % 12];
}

/** Which white keys to show, inclusive. A wide screen shows the whole
 *  keyboard. A narrow one shows the current key's scale, home to home, with
 *  one key to spare each side; the keyboard slides when the planet changes. */
export function pianoWindow(keyId: KeyId | null, narrow: boolean): { lo: number; hi: number } {
  if (!narrow || !keyId) return { lo: 0, hi: WHITE_COUNT - 1 };
  const scale = majorScale(keyOf(keyId));
  const lo = Math.max(0, whiteIndex(midiOf(scale[0])) - 1);
  const hi = Math.min(WHITE_COUNT - 1, whiteIndex(midiOf(scale[7])) + 1);
  return { lo, hi };
}

/** The whole keyboard needs this many CSS px per white key to be a fair
 *  target for an eight-year-old's finger; below it the window narrows. */
export const MIN_WHITE_PX = 46;

// ---------------------------------------------------------------------------
// The staff
// ---------------------------------------------------------------------------

/** Staff lines are 0.5 apart (music-staff.glb), so one diatonic step is 0.25.
 *  y = 0 is the bottom line (E4). */
export const STAFF_STEP = 0.25;
export const STAFF_LEN = 14;

export interface StaffLayout {
  clefX: number;
  sigX: (i: number) => number;
  noteX: (i: number) => number;
}

/** x positions along the staff, 0 at its left end. The notes spread to fill
 *  what the signature leaves. */
export function staffLayout(marks: number): StaffLayout {
  const sigX0 = 2.3;
  const sigStep = 0.6;
  const noteX0 = sigX0 + Math.max(1, marks) * sigStep + 0.9;
  const noteStep = Math.min(1.4, (STAFF_LEN - 0.8 - noteX0) / 7);
  return {
    clefX: 1.05,
    sigX: (i) => sigX0 + i * sigStep,
    noteX: (i) => noteX0 + i * noteStep,
  };
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

export const FOV = 40;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);

/** Half the view's height at depth d. */
export function halfH(d: number): number {
  return d * TAN;
}

/** Space view: the camera looks down at the circle from this elevation. */
export const SPACE_ELEV = (42 * Math.PI) / 180;

/**
 * How far back the space camera stands so the whole circle, labels included,
 * fits the part of the screen the HUD leaves free. `top` and `bottom` are the
 * fractions of the screen height the HUD covers. Returns the distance and how
 * far (NDC) to push the circle's centre down to sit in the free band.
 */
export function spaceFit(aspect: number, top: number, bottom: number): { dist: number; ndcY: number } {
  const ext = ORBIT_R + 1.3;
  const freeH = Math.max(0.3, 1 - top - bottom);
  // The ring seen at an angle is an ellipse ext wide and ext·sin(elev) tall,
  // plus the planets and their labels standing above and below it.
  const vExt = ext * Math.sin(SPACE_ELEV) + 1.3;
  const dW = ext / (TAN * aspect * 0.94);
  const dH = vExt / (TAN * freeH);
  // The near planets' labels hang below them and loom larger than the far
  // ones, so the circle sits a little above the middle of its band.
  return { dist: Math.max(dW, dH) * 1.06, ndcY: bottom - top + 0.05 * freeH };
}

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  /** Turn about Y; 0 looks down -Z. */
  yaw: number;
  /** How far the camera tips down, radians. */
  pitch: number;
}

/**
 * Space view: looking down at the circle from SPACE_ELEV, with the circle's
 * centre at NDC height `ndcY`.
 */
export function spaceCamera(dist: number, ndcY: number): CameraPose {
  // Tip down a little less than the elevation, so the centre of the circle
  // lands ndcY below (or above) the middle of the view.
  const pitch = SPACE_ELEV + Math.atan(ndcY * TAN);
  return { x: 0, y: Math.sin(SPACE_ELEV) * dist, z: Math.cos(SPACE_ELEV) * dist, yaw: 0, pitch };
}

/**
 * Planet view: the camera stands outside the circle looking back at the
 * focused planet, toward the sun, so the sun glows behind it and the rest of
 * the circle spreads out beyond. The planet lands at NDC height `ndcY` with an
 * on-screen radius of `ndcR` (in units of the view's half height). The camera
 * rises a little (`rise` × distance) so the orbit reads as a ring, not a line.
 */
export function planetCamera(
  p: { x: number; y: number; z: number },
  radius: number,
  ndcY: number,
  ndcR: number,
  rise = 0.1,
): CameraPose {
  const len = Math.hypot(p.x, p.z) || 1;
  const ox = p.x / len;
  const oz = p.z / len;
  const dist = radius / (ndcR * TAN);
  const h = dist * rise;
  const pitch = Math.atan(h / dist) + Math.atan(ndcY * TAN);
  return { x: p.x + ox * dist, y: p.y + h, z: p.z + oz * dist, yaw: Math.atan2(ox, oz), pitch };
}

/**
 * Splits the part of the screen the HUD leaves free into bands, top to bottom,
 * and returns each band's centre and half-height in NDC. `top` and `bottom`
 * are the fractions of the screen height the HUD covers; `bands` are the
 * fractions of the free part each band takes.
 */
export function ndcBands(top: number, bottom: number, bands: readonly number[]): { y: number; h: number }[] {
  const hi = 1 - 2 * top;
  const lo = -1 + 2 * bottom;
  const span = Math.max(0.2, hi - lo);
  let at = hi;
  return bands.map((b) => {
    const h = (b * span) / 2;
    const y = at - h;
    at -= b * span;
    return { y, h };
  });
}

/** Everything a CIRCLE index needs from theory, for the engine's labels. */
export function circleKey(i: number): KeyId {
  return CIRCLE[i];
}

/**
 * Fits a stage piece into a band of the screen. `corners` are the piece's
 * bounding-box corners in camera axes at scale 1, already turned the way it
 * will be shown, centred on its own origin. Returns the scale and the camera-
 * space height to put the origin at, so that at depth `depth` its projection
 * fills the band [bandY - bandH, bandY + bandH] (NDC) without spilling it,
 * and is never wider than `maxW` (NDC, out of 2).
 *
 * Perspective makes this non-linear (a tipped keyboard's near edge looms
 * larger than its far one), so it is solved by bisection rather than by a
 * formula that would only be right for a flat piece.
 */
export function fitInBand(
  corners: readonly { x: number; y: number; z: number }[],
  depth: number,
  aspect: number,
  bandY: number,
  bandH: number,
  maxW: number,
  /** Where a piece that is narrower than its band sits in it. */
  anchor: 'centre' | 'bottom' = 'centre',
): { s: number; y: number } {
  const project = (s: number, y0: number): { lo: number; hi: number; w: number } => {
    let lo = Infinity, hi = -Infinity, w = 0;
    for (const c of corners) {
      const d = depth - s * c.z;
      const ny = (y0 + s * c.y) / (d * TAN);
      const nx = (s * c.x) / (d * TAN * aspect);
      lo = Math.min(lo, ny);
      hi = Math.max(hi, ny);
      w = Math.max(w, Math.abs(nx) * 2);
    }
    return { lo, hi, w };
  };
  const centre = (s: number): number => {
    let y0 = bandY * halfH(depth);
    for (let i = 0; i < 6; i++) {
      const p = project(s, y0);
      const err = anchor === 'bottom' && p.hi - p.lo < 2 * bandH ? bandY - bandH - p.lo : bandY - (p.lo + p.hi) / 2;
      y0 += err * halfH(depth);
    }
    return y0;
  };
  let lo = 0.01;
  let hi = depth / 2;
  for (let i = 0; i < 24; i++) {
    const s = (lo + hi) / 2;
    const p = project(s, centre(s));
    if (p.hi - p.lo <= 2 * bandH && p.w <= maxW) lo = s;
    else hi = s;
  }
  return { s: lo, y: centre(lo) };
}
