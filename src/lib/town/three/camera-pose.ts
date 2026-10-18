// The town's follow camera: where it wants to be, and how it gets there.
//
// Extracted from engine.ts updateCamera so the angle can be unit-tested. The
// close-up camera (chase mode at the nearest zoom, ~3.4u behind the cupcake and
// ~2u up) swung 30-40° sideways whenever the kid strafed and snapped back when
// they stopped. Three things caused it, all invisible on a still frame:
//
//   1. A fixed 0.6 s velocity look-ahead on the aim point, unchanged since the
//      camera sat ~11u back. At walk speed that is ~2u, which at close range
//      is more than half the camera's distance to the cupcake.
//   2. The camera position was damped (0.18 s) but the aim point was not, so
//      while walking the camera trailed by ~0.6u and the aim did not: the view
//      direction changed with speed and settled after every stop.
//   3. Ground height reached the camera height through the damper but reached
//      the aim height raw, so pitch wobbled on every slope change, and the
//      terrain clamp was applied to the damper's TARGET, so a hill behind the
//      cupcake yanked the filter rather than just the rendered camera.
//
// The fix is structural rather than tuned: the camera and its aim point are
// both expressed as the same anchor (avatar position + ground height) plus a
// per-mode offset, and both run through the SAME critically-damped filter with
// the same smoothing time. The filter is linear, so two inputs that differ by a
// constant produce two outputs that differ by the same constant — the view
// direction cannot change while the kid walks, turns, stops or climbs, only
// while the offset itself changes (zoom, rotate buttons, mode switch, flying
// altitude, look-ahead in the far modes). Ground height therefore gets smoothed
// exactly once, by that shared filter, for both heights. The terrain clamp is
// applied by the engine to the rendered camera AFTER smoothing.
//
// Look-ahead survives only where it reads as intended: it is scaled by zoom
// (0 at or below the default zoom for chase/action), and capped as a fraction
// of the camera's horizontal distance so no speed can swing the view by more
// than a few degrees.
//
// Follows the town convention: no runtime `three` import.

import { CAM_BACK_U, CAM_HEIGHT_U, SHOULDER_BACK_U, SHOULDER_HEIGHT_U, SHOULDER_LOOK_U } from './types';

// Zoom = chase-camera distance multiplier (1 = default, higher = further out).
export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3.4;
export const ZOOM_DEFAULT = 1.5;

/** How quickly the camera eases to its target (seconds ≈ time-to-target).
 *  Replaced the old per-frame CAM_LERP fraction, which was frame-rate-DEPENDENT
 *  (the camera drifted differently at 30fps vs 60fps). Re-tuned by feel. Used
 *  for the camera position AND the aim point — they must share it, see above. */
export const CAM_SMOOTH_S = 0.18;

/** Seconds of travel the aim point leads by at full look-ahead (the old fixed
 *  value, now only reached in the far views). */
export const LOOK_AHEAD_S = 0.6;
/** The look-ahead offset never exceeds this fraction of the camera's horizontal
 *  distance from the cupcake: atan(0.12) ≈ 7° of swing at most, at any speed. */
export const LOOK_AHEAD_MAX_FRAC = 0.12;

export type CamMode = 'chase' | 'action' | 'drone' | 'sky';

/** The jet ski's chase camera: low and close behind the ski, aiming a little
 *  ahead of it, so the water rushes at the lens the way a jet ski game frames
 *  it. Used instead of the normal chase pose while a sail ride is ridden in
 *  'chase' mode; the engine also swings the yaw round behind the ski's heading,
 *  so the offset below is always "behind the ski". Zoom still pulls it out. */
export const SKI_BACK_U = 3.4;
export const SKI_HEIGHT_U = 1.5;
export const SKI_LOOK_U = 0.7;
/** How far ahead of the ski the camera aims, scene units. Measured along the
 *  camera's own forward, so it never swings the view sideways. */
export const SKI_LEAD_U = 2.2;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CamPoseInput {
  /** Avatar position, scene units. */
  ax: number;
  az: number;
  /** Terrain height under the avatar, scene units (raw — the rig smooths it). */
  groundY: number;
  /** Avatar velocity, scene units per second. */
  velX: number;
  velZ: number;
  zoom: number;
  /** The yaw the camera sits at (camYaw plus any drone orbit). */
  yaw: number;
  mode: CamMode;
  /** Flying altitude bonus (0 on foot). */
  altB: number;
  /** Riding a jet ski: 'chase' becomes the low ski camera (SKI_*). */
  ski?: boolean;
}

export interface CamPose {
  pos: Vec3;
  look: Vec3;
}

/** How much of LOOK_AHEAD_S a mode/zoom gets, 0..1. The close views get none:
 *  at a few units back, any lead is a large angle. The far views keep the old
 *  feel, growing in as the kid zooms out. */
export function lookAheadGain(mode: CamMode, zoom: number): number {
  if (mode === 'drone' || mode === 'sky') return 1;
  const t = (zoom - ZOOM_DEFAULT) / (ZOOM_MAX - ZOOM_DEFAULT);
  return Math.min(1, Math.max(0, t));
}

/** The camera's DESIRED pose this frame — unsmoothed. Feed it to stepCamRig. */
export function computeCamPose(input: CamPoseInput): CamPose {
  const { ax, az, groundY: gY, velX, velZ, zoom, yaw, mode, altB, ski } = input;
  // Chase = over the shoulder at the default zoom (s = 1). Distance and
  // height grow faster than linearly as the kid zooms out, so the widest
  // zoom still reaches the old steep diorama view (~24u back, ~22u up).
  const s = zoom / ZOOM_DEFAULT;
  let backU = SHOULDER_BACK_U * Math.pow(s, 1.6) + altB * 0.9;
  let heightU = Math.max(2, SHOULDER_HEIGHT_U * Math.pow(s, 2.2)) + altB * 1.25;
  let lookU = SHOULDER_LOOK_U + altB * 0.85;
  if (ski && mode === 'chase') {
    const back = SKI_BACK_U * Math.pow(s, 1.4);
    return {
      pos: { x: ax + back * Math.sin(yaw), y: gY + SKI_HEIGHT_U * Math.pow(s, 1.8), z: az + back * Math.cos(yaw) },
      look: { x: ax - SKI_LEAD_U * Math.sin(yaw), y: gY + SKI_LOOK_U, z: az - SKI_LEAD_U * Math.cos(yaw) },
    };
  }
  if (mode === 'action') {
    // Low + close: the ground rushes past and turns bank across the frame.
    backU = CAM_BACK_U * zoom * 0.6 + altB * 0.55;
    heightU = 1.15 + altB * 1.05;
    lookU = 1.0 + altB * 0.95;
  } else if (mode === 'drone') {
    backU = CAM_BACK_U * zoom * 1.45 + altB * 0.9;
    heightU = CAM_HEIGHT_U * zoom * 1.5 + altB * 1.2;
    lookU = 0.8 + altB * 0.85;
  } else if (mode === 'sky') {
    // High kite cam looking steeply down.
    backU = CAM_BACK_U * zoom * 0.85 + altB * 0.5;
    heightU = CAM_HEIGHT_U * zoom * 2.4 + altB * 1.35;
    lookU = 0.3 + altB * 0.8;
  }

  // Look-ahead toward the travel direction, scaled by mode/zoom and capped as
  // a fraction of the camera distance (see the header for why).
  let leadX = velX * LOOK_AHEAD_S * lookAheadGain(mode, zoom);
  let leadZ = velZ * LOOK_AHEAD_S * lookAheadGain(mode, zoom);
  const lead = Math.hypot(leadX, leadZ);
  const maxLead = backU * LOOK_AHEAD_MAX_FRAC;
  if (lead > maxLead) {
    leadX *= maxLead / lead;
    leadZ *= maxLead / lead;
  }

  // Camera offset (behind the avatar) rotated by the yaw. Both points ride the
  // same ground height so the pitch does not depend on the slope.
  return {
    pos: { x: ax + backU * Math.sin(yaw), y: gY + heightU, z: az + backU * Math.cos(yaw) },
    look: { x: ax + leadX, y: gY + lookU, z: az + leadZ },
  };
}

/** Filter state for one axis of one point. */
interface Damped {
  value: number;
  vel: number;
}

export interface CamRig {
  pos: Vec3;
  look: Vec3;
  /** False until the first step, which snaps to the desired pose. */
  ready: boolean;
  readonly axes: Damped[];
}

export function createCamRig(): CamRig {
  return {
    pos: { x: 0, y: 0, z: 0 },
    look: { x: 0, y: 0, z: 0 },
    ready: false,
    axes: Array.from({ length: 6 }, () => ({ value: 0, vel: 0 })),
  };
}

/** Critically-damped spring (Game Programming Gems 4, 1.10 — the same filter
 *  maath's damp3 runs, minus its 0.001 snap-to-target and overshoot clamp,
 *  which fire per axis at different moments and break the linearity the rig
 *  relies on). */
function smoothDamp(d: Damped, target: number, smoothS: number, dtS: number): void {
  if (dtS <= 0) return;
  const omega = 2 / Math.max(0.0001, smoothS);
  const x = omega * dtS;
  const k = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = d.value - target;
  const temp = (d.vel + omega * change) * dtS;
  d.vel = (d.vel - omega * temp) * k;
  d.value = target + (change + temp) * k;
}

/** Eases the rig toward `desired` — position and aim through the same filter. */
export function stepCamRig(rig: CamRig, desired: CamPose, smoothS: number, dtS: number): void {
  const targets = [desired.pos.x, desired.pos.y, desired.pos.z, desired.look.x, desired.look.y, desired.look.z];
  if (!rig.ready) {
    targets.forEach((t, i) => {
      rig.axes[i].value = t;
      rig.axes[i].vel = 0;
    });
    rig.ready = true;
  } else {
    targets.forEach((t, i) => smoothDamp(rig.axes[i], t, smoothS, dtS));
  }
  const a = rig.axes;
  rig.pos.x = a[0].value;
  rig.pos.y = a[1].value;
  rig.pos.z = a[2].value;
  rig.look.x = a[3].value;
  rig.look.y = a[4].value;
  rig.look.z = a[5].value;
}
