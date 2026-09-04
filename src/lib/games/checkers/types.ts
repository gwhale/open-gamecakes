// Shared constants and contracts for the Cakey Checkers 3D scene.
//
// No runtime `three` import — `import type` only, so this module and its
// siblings carry ZERO 3D-engine weight into any bundle, server included. The
// host client component dynamic-imports `three` and the engine together inside a
// useEffect and passes the namespace in as an argument. Same rule as
// lib/games/three/types.ts; do not add a runtime import here.

import type * as THREE from 'three';
import { CAKE, CAKEY_ROAD } from '@/lib/games/theme/palette';
import type { Side } from './rules';

export type ThreeNS = typeof THREE;

// ---------------------------------------------------------------------------
// Board metrics
// ---------------------------------------------------------------------------

/** One square. Everything else is expressed in these units. */
export const SQUARE_U = 1.0;
export const BOARD_U = SQUARE_U * 8;
/** The chocolate slab the playing surface sits on, with a rim all round. */
export const SLAB_U = BOARD_U + 0.9;
/** The frosted cake stand under the whole thing. */
export const TABLE_U = SLAB_U + 1.6;

/** Board colours.
 *
 *  ⚠️ THE PLAYING SQUARE IS THE MID TONE, AND THAT IS THE WHOLE POINT. In a real
 *  game every piece stands on ONE colour of square, so that colour has to be
 *  legible against BOTH piece sets at once. Measured:
 *
 *      pieces on cream #fef3c7   light 1.05:1  FAIL   dark 13.45:1
 *      pieces on cocoa #9c6b3f   light 4.32:1  ok     dark  3.27:1  ok
 *      pieces on choc  #5a3210   light 10.45:1 ok     dark  1.35:1  FAIL
 *
 *  Only a mid value clears 3:1 in both directions. The town's decorative board
 *  paints its playable squares cream and gets away with it because it is a toy
 *  with pieces on both colours; a real game cannot. The unplayable squares are
 *  free to be cream, because nothing ever stands on them. */
export const SQUARE_PLAY = CAKEY_ROAD.ROAD_COCOA;
export const SQUARE_IDLE = CAKE.VANILLA;
export const BOARD_EDGE = CAKE.CHOCOLATE_DEEP;
export const SLAB_COLOR = CAKE.CHOCOLATE;
export const SPONGE_COLOR = 0xfde8bd;
export const STAND_COLOR = CAKE.FROSTING;
export const SCENE_BG = 0xfff4e2;

// ---------------------------------------------------------------------------
// The y-ladder
// ---------------------------------------------------------------------------

/** ⚠️ NO TWO FACES IN THIS STACK MAY SHARE A Y.
 *
 *  This repo has zero `polygonOffset` and exactly one `renderOrder` (the town's
 *  skydome), so coplanar opaque surfaces have nothing to separate them and the
 *  whole board flickers as the camera moves. Separation here is GEOMETRIC and
 *  the ladder below is the proof: every face sits at its own height, and the
 *  values that depend on each other are DERIVED, never retyped.
 *
 *      stand    -0.97 … -0.27
 *      table    -0.30 … -0.10      (slab's underside is buried in it)
 *      slab     -0.12 …  0.12
 *      surface   0.09 …  0.21      (0.09 proud of the slab top)
 *      pieces    0.21 up
 *      markers   0.222             destination discs, empty squares only
 *      ring      0.234             selection torus
 *
 *  The town board's chessboard.ts carries the same ladder for the same reason.
 *  If you add a layer, add a rung — do not nudge an existing one. */
export const Y_STAND = -0.62;
export const STAND_H = 0.7;
export const Y_TABLE = -0.2;
export const TABLE_H = 0.2;
export const Y_SLAB = 0;
export const SLAB_H = 0.24;
export const Y_SURFACE = 0.15;
export const SURFACE_H = 0.12;
/** The playing plane. Derived — pieces stand ON the surface, they do not float
 *  at a number somebody typed. */
export const Y_TOP = Y_SURFACE + SURFACE_H / 2;
export const Y_PIECE = Y_TOP;
export const Y_MARKER = Y_TOP + 0.012;
export const Y_RING = Y_TOP + 0.024;

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/** Radius of a piece's invisible tap proxy. The piece itself is 0.34, so this is
 *  a 3.3x hit area — the "hit boxes tuned in the kid's favour" rule.
 *
 *  ⚠️ 0.62 IS A CEILING, NOT A PREFERENCE. Playable squares are diagonal
 *  neighbours, so centre-to-centre spacing is SQUARE_U * sqrt(2) = 1.414. Two
 *  0.62 proxies leave 0.174 of air between them. At 0.71 they TOUCH, and from
 *  there the raycaster resolves overlaps by depth and starts reliably picking
 *  the piece BEHIND the one the kid aimed at on a near-miss. If you want a more
 *  generous target than this, the square has to get bigger. */
export const HIT_R = 0.62;
export const HIT_H = 0.9;
/** Destination proxies. Slightly larger than a piece's, and spawned ONLY on the
 *  squares that are legal right now — a tap on an irrelevant square should fall
 *  through to the "nothing there" wobble rather than ambiguously hitting
 *  nothing. */
export const DEST_HIT_R = 0.68;

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Narrow, and far back. The biggest readability lever in the whole scene.
 *
 *  At a wide FOV the near rank renders ~1.8x the far rank and the board reads as
 *  a wedge; at 38 from further out that drops to about 1.25x while keeping
 *  enough depth cue to still feel like a world rather than a diagram. */
export const CAM_FOV = 38;
/** The resting pitch, in degrees above the horizon. Much higher than the other
 *  3D games here (pit stop sits at ~26) because an 8x8 grid at a low pitch
 *  foreshortens until the far rank is a sliver and pieces occlude each other —
 *  the single worst failure mode for a board game on a small screen. */
export const CAM_PITCH_DEG = 50;
/** Padding on the fit, so the board never touches the frame edge. */
export const CAM_FIT_PAD = 1.12;

/** YAW IS FREE — drag all the way round if you like.
 *
 *  This started life as a clamped ±22° spring-loaded "peek", on the theory that
 *  a six-year-old who free-orbits an 8x8 board loses which end is theirs. The
 *  theory was half right and the fix is the RESET, not the clamp: rotate as far
 *  as you want, and one always-present button puts your side back at the bottom
 *  of the screen. Recoverable beats restricted.
 *
 *  Pitch is still clamped, because unlike yaw the ends of its range are actually
 *  broken: below CAM_PITCH_MIN_DEG the far rank collapses into a sliver and
 *  pieces hide behind each other, and above CAM_PITCH_MAX_DEG the board is a
 *  flat diagram with no depth cue at all and the pieces lose their silhouette.
 *  Those are legibility limits, not taste. */
export const CAM_PITCH_MIN_DEG = 30;
export const CAM_PITCH_MAX_DEG = 76;

/** How far a full-width drag swings the view, and a full-height drag tilts it.
 *  Dragging DOWN raises the camera — you are tipping the board's far edge toward
 *  you, the way you would with a real one on a table. */
export const CAM_DRAG_YAW_DEG = 180;
export const CAM_DRAG_PITCH_DEG = 70;

/** Pinch-to-zoom, as a multiplier on the fitted distance. The near end still
 *  keeps the whole board on screen; the far end is just breathing room. */
export const CAM_ZOOM_MIN = 0.72;
export const CAM_ZOOM_MAX = 1.4;

/** How fast the camera slides to a preset. Drag is 1:1 and never lerped — a
 *  direct-manipulation gesture that lags feels broken. */
export const CAM_EASE = 0.16;

/** The named views the on-screen buttons offer.
 *
 *  'home' also restores yaw and zoom, which is what makes it the recovery
 *  affordance rather than just another angle. */
export type CameraView = 'home' | 'low' | 'tilted' | 'top';

export const CAM_VIEW_PITCH: Record<Exclude<CameraView, 'home'>, number> = {
  low: 34,
  tilted: CAM_PITCH_DEG,
  top: 72,
};

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/** Every duration in the scene, in ms. Hand-integrated in update(dt) — there is
 *  no tween library in use in this repo (@tweenjs/tween.js is in package.json
 *  with zero call sites; leave it that way, a tween loop would fight the
 *  dt clamp). */
export const MOVE_MS = 260;
export const HOP_MS = 300;
/** Beat between hops of a multi-jump. Long enough that the kid SEES each capture
 *  land before the next one starts — the same reasoning as pit stop's BEAT_MS. */
export const CHAIN_BEAT_MS = 90;
export const CROWN_MS = 500;
export const WOBBLE_MS = 120;
/** Where in a capture hop the victim is removed. Deliberately NOT the end: the
 *  mover is directly overhead at 0.55, so cause and effect land together. Remove
 *  it on arrival and the kid sees a piece vanish for no visible reason. */
export const CAPTURE_AT = 0.55;
/** Reduced-motion durations. Note these SHORTEN rather than disappear — position
 *  is information, so a piece must still visibly travel. */
export const RM_MOVE_MS = 120;
export const RM_FADE_MS = 200;

// ---------------------------------------------------------------------------
// Engine contract
// ---------------------------------------------------------------------------

export interface CheckersSceneProps {
  /** Launcher level 1-10; selects the opponent. */
  level: number;
  /** Piece set id from styles.ts. */
  styleId: string;
  /** Which side the kid plays. The camera yaws to put it at the bottom of the
   *  screen; the board data is NEVER flipped. */
  kidSide: Side;
  /** Seeds the bot's PRNG so a reported bug is reproducible. */
  seed: number;
}

export interface CheckersCallbacks {
  /** A turn was completed by either side. `flagged` is the move-quality verdict
   *  for a KID turn and is always false for the bot's. */
  onTurn(by: Side, move: { captures: number; crowns: boolean }, flagged: boolean): void;
  /** Plain-words narration for the aria-live region. */
  onAnnounce(text: string): void;
  /** The opponent should say something — pool name, for the badge bubble. */
  onOpponentLine(pool: string): void;
  onThinking(thinking: boolean): void;
  /** True once the camera has left its home view, so the UI can offer the reset
   *  only when there is something to reset. */
  onViewMoved(moved: boolean): void;
  /** The game reached a natural end. */
  onGameOver(outcome: 'win' | 'loss' | 'draw', summary: CheckersOutcome): void;
}

export interface CheckersOutcome {
  kidTurns: number;
  flaggedTurns: number;
  kidCaptures: number;
  botCaptures: number;
  kidCrownings: number;
  reason: 'no-moves' | 'repetition' | 'no-progress' | 'adjudicated' | 'resigned';
}

/** The host owns NO game state; the engine owns NO React state. */
export interface CheckersEngine {
  resize(): void;
  setPaused(paused: boolean): void;
  /** Move to a named view. 'home' also restores yaw and zoom. */
  setView(view: CameraView): void;
  /** Rotate by a fixed step. The button path, so the camera is reachable
   *  without a drag — which is what makes it keyboard-operable. */
  spinView(deltaDeg: number): void;
  /** Step the tilt one notch, wrapping. Returns the view it landed on so the
   *  button can say what it did. */
  cycleTilt(): Exclude<CameraView, 'home'>;
  /** Give up. Ends the round without a natural result. */
  resign(): void;
  dispose(): void;
}
