// Regression tests for the close-up camera losing its angle while the kid
// walks (see the header of camera-pose.ts for the three causes).
//
// Each test drives the rig frame by frame the way engine.ts does — desired pose
// from computeCamPose, then stepCamRig — and measures the yaw and pitch of the
// camera → aim vector, which is what the kid sees as "the camera angle".
//
// Before the fix, strafing at walk speed in the close-up swung that vector ~31°
// sideways (a 0.6 s unsmoothed lead of ~2u against a camera ~3.4u back) and it
// snapped back on stop. These tests fail by a wide margin if the lead comes back
// at close range, or if the aim point stops sharing the position's filter.

import { describe, expect, it } from 'vitest';
import {
  CAM_SMOOTH_S,
  LOOK_AHEAD_MAX_FRAC,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  computeCamPose,
  createCamRig,
  lookAheadGain,
  stepCamRig,
  type CamMode,
  type CamRig,
} from './camera-pose';
import { PX_PER_UNIT, WALK_SPEED_PX } from './types';

const WALK_U = WALK_SPEED_PX / PX_PER_UNIT; // ~3.4 u/s
const DEG = 180 / Math.PI;

interface World {
  rig: CamRig;
  x: number;
  z: number;
  zoom: number;
  mode: CamMode;
  yaw: number;
  ground: (x: number, z: number) => number;
}

function makeWorld(over: Partial<Omit<World, 'rig'>> = {}): World {
  return { rig: createCamRig(), x: 0, z: 0, zoom: ZOOM_MIN, mode: 'chase', yaw: 0, ground: () => 0, ...over };
}

/** Advances one frame: moves the avatar by vel·dt, then runs the camera. */
function frame(w: World, velX: number, velZ: number, dtS: number): void {
  w.x += velX * dtS;
  w.z += velZ * dtS;
  const desired = computeCamPose({
    ax: w.x,
    az: w.z,
    groundY: w.ground(w.x, w.z),
    velX,
    velZ,
    zoom: w.zoom,
    yaw: w.yaw,
    mode: w.mode,
    altB: 0,
  });
  stepCamRig(w.rig, desired, CAM_SMOOTH_S, dtS);
}

/** Yaw and pitch (degrees) of the camera → aim vector. */
function viewAngles(rig: CamRig): { yaw: number; pitch: number } {
  const dx = rig.look.x - rig.pos.x;
  const dy = rig.look.y - rig.pos.y;
  const dz = rig.look.z - rig.pos.z;
  return { yaw: Math.atan2(dx, dz) * DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) * DEG };
}

function angleGap(a: { yaw: number; pitch: number }, b: { yaw: number; pitch: number }) {
  let dYaw = Math.abs(a.yaw - b.yaw) % 360;
  if (dYaw > 180) dYaw = 360 - dYaw;
  return { yaw: dYaw, pitch: Math.abs(a.pitch - b.pitch) };
}

/** Runs `seconds` of frames at a constant velocity and returns the largest
 *  yaw/pitch departure from `ref` seen on any frame. */
function maxDrift(w: World, velX: number, velZ: number, seconds: number, ref: { yaw: number; pitch: number }, dtS = 1 / 60) {
  let yaw = 0;
  let pitch = 0;
  for (let t = 0; t < seconds; t += dtS) {
    frame(w, velX, velZ, dtS);
    const g = angleGap(viewAngles(w.rig), ref);
    yaw = Math.max(yaw, g.yaw);
    pitch = Math.max(pitch, g.pitch);
  }
  return { yaw, pitch };
}

function settle(w: World): { yaw: number; pitch: number } {
  for (let i = 0; i < 120; i++) frame(w, 0, 0, 1 / 60);
  return viewAngles(w.rig);
}

const DIRECTIONS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);

describe('close-up camera angle', () => {
  it('holds yaw and pitch within 2° while walking in any direction', () => {
    for (const dir of DIRECTIONS) {
      const w = makeWorld();
      const idle = settle(w);
      const drift = maxDrift(w, Math.sin(dir) * WALK_U, Math.cos(dir) * WALK_U, 2, idle);
      expect(drift.yaw, `walking at ${Math.round(dir * DEG)}°`).toBeLessThan(2);
      expect(drift.pitch, `walking at ${Math.round(dir * DEG)}°`).toBeLessThan(2);
    }
  });

  it('does not snap when the kid stops', () => {
    for (const dir of DIRECTIONS) {
      const w = makeWorld();
      const idle = settle(w);
      maxDrift(w, Math.sin(dir) * WALK_U, Math.cos(dir) * WALK_U, 1.5, idle);
      // Every frame of the stop, not just the end state: the old rig's lead
      // vanished in one frame, which is the snap.
      let prev = viewAngles(w.rig);
      for (let i = 0; i < 60; i++) {
        frame(w, 0, 0, 1 / 60);
        const now = viewAngles(w.rig);
        expect(angleGap(now, idle).yaw).toBeLessThan(2);
        expect(angleGap(now, prev).yaw).toBeLessThan(0.5);
        expect(angleGap(now, prev).pitch).toBeLessThan(0.5);
        prev = now;
      }
    }
  });

  it('holds while turning (walking a circle) and at uneven frame rates', () => {
    const w = makeWorld();
    const idle = settle(w);
    let worst = 0;
    // 30fps with every third frame a 50 ms hitch (the engine's dt cap).
    for (let i = 0; i < 240; i++) {
      const dtS = i % 3 === 2 ? 0.05 : 1 / 30;
      const heading = i * 0.05;
      frame(w, Math.sin(heading) * WALK_U, Math.cos(heading) * WALK_U, dtS);
      worst = Math.max(worst, angleGap(viewAngles(w.rig), idle).yaw);
    }
    expect(worst).toBeLessThan(2);
  });

  it('keeps pitch steady walking onto, up and off a slope', () => {
    // Flat for 2u, then a 35% grade for 4u (1.4u of climb), then flat again.
    const ground = (_x: number, z: number) => {
      const d = -z; // walking toward -z, away from the camera at yaw 0
      if (d < 2) return 0;
      if (d < 6) return (d - 2) * 0.35;
      return 1.4;
    };
    for (const zoom of [ZOOM_MIN, ZOOM_DEFAULT]) {
      const w = makeWorld({ ground, zoom });
      const idle = settle(w);
      const drift = maxDrift(w, 0, -WALK_U, 3, idle);
      expect(drift.pitch, `zoom ${zoom}`).toBeLessThan(1);
      expect(drift.yaw, `zoom ${zoom}`).toBeLessThan(1);
    }
  });

  it('applies the same hold to the action cam at its default zoom', () => {
    const w = makeWorld({ mode: 'action', zoom: ZOOM_DEFAULT });
    const idle = settle(w);
    const drift = maxDrift(w, WALK_U, 0, 2, idle);
    expect(drift.yaw).toBeLessThan(2);
  });
});

describe('look-ahead outside the close-up', () => {
  it('is zero for chase and action at or below the default zoom', () => {
    for (const mode of ['chase', 'action'] as const) {
      expect(lookAheadGain(mode, ZOOM_MIN)).toBe(0);
      expect(lookAheadGain(mode, ZOOM_DEFAULT)).toBe(0);
      expect(lookAheadGain(mode, ZOOM_MAX)).toBe(1);
    }
  });

  it('still leads the far chase view, but never by more than the cap', () => {
    const w = makeWorld({ zoom: ZOOM_MAX });
    const idle = settle(w);
    const capDeg = Math.atan(LOOK_AHEAD_MAX_FRAC) * DEG;
    // Walk speed and a fast ride (5× walk): visible lead, bounded swing.
    for (const speed of [WALK_U, WALK_U * 5]) {
      const drift = maxDrift(w, speed, 0, 2, idle);
      expect(drift.yaw).toBeGreaterThan(0.5);
      expect(drift.yaw).toBeLessThanOrEqual(capDeg + 0.5);
      settle(w);
    }
  });
});
