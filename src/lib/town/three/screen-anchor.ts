// Projecting a world-space point to viewport percentages, for DOM overlays that
// have to sit on top of a moving 3D scene (Cakey's speech bubble).
//
// Extracted from the engine loop so it can be unit-tested: the camera-matrix
// refresh below is easy to drop and impossible to notice while standing still.
//
// Follows the town convention: no runtime `three` import, types only.

import type * as THREE from 'three';

export interface ScreenAnchor {
  /** 0..1 across the viewport, left → right. */
  xPct: number;
  /** 0..1 down the viewport, top → bottom. */
  yPct: number;
  /** False when the point is behind the camera or outside the frustum. */
  onScreen: boolean;
}

/**
 * Projects `point` (mutated in place, so callers can reuse one scratch vector)
 * into viewport percentages for the given camera.
 *
 * The `updateMatrixWorld()` call is load-bearing, but only in combination with
 * WHERE the caller sits in the frame. `project()` reads the camera's
 * `matrixWorldInverse`, which is normally refreshed only inside
 * `renderer.render()`. So the anchor is only current if BOTH hold:
 *
 *   1. the caller projects AFTER the camera has been moved for this frame —
 *      the town's engine loop calls this right after `updateCamera()`; and
 *   2. the camera's world matrix is recomputed from that new pose before
 *      projecting, which is what the call below does.
 *
 * Miss either and the anchor silently describes the PREVIOUS frame's camera:
 * invisible while standing still, obvious while riding a vehicle or the Sugar
 * Express, which is how Cakey's speech bubble came unstuck from him.
 *
 * (An earlier version of this comment claimed the call alone was sufficient.
 * It was not — at the time this ran before `updateCamera`, so recomputing the
 * matrix just reproduced the previous frame's pose and changed nothing.)
 */
export function projectToScreenPct(
  point: THREE.Vector3,
  camera: THREE.Camera,
): ScreenAnchor {
  camera.updateMatrixWorld();
  point.project(camera);
  return {
    xPct: point.x * 0.5 + 0.5,
    yPct: -point.y * 0.5 + 0.5,
    onScreen:
      point.z < 1 && point.x >= -1 && point.x <= 1 && point.y >= -1 && point.y <= 1,
  };
}
