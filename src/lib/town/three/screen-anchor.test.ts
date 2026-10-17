// Regression tests for Cakey's speech bubble coming unstuck from him while the
// camera moved (riding a vehicle / the Sugar Express).
//
// The bug had two halves. This file covers the one that is a silent trap: the
// projection read the camera's matrixWorldInverse, which is only refreshed
// inside renderer.render(). The town projects BEFORE it renders, so without an
// explicit refresh the bubble tracked a camera position one frame old.
//
// The other half — the report being throttled to ~11Hz while the overlay wrote
// the DOM at 60Hz — lives in the engine's frame loop and is covered by the
// comment in types.ts.

import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectToScreenPct } from './screen-anchor';

function makeCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  return camera;
}

describe('projectToScreenPct', () => {
  it('puts a point straight ahead of the camera at the centre of the viewport', () => {
    const result = projectToScreenPct(new Vector3(0, 0, 0), makeCamera());
    expect(result.xPct).toBeCloseTo(0.5, 5);
    expect(result.yPct).toBeCloseTo(0.5, 5);
    expect(result.onScreen).toBe(true);
  });

  it('tracks the camera the SAME frame it moves', () => {
    // This is the regression. Drop the updateMatrixWorld() call in
    // screen-anchor.ts and this fails: the projection keeps returning 0.5
    // because matrixWorldInverse still describes the camera's old position.
    const camera = makeCamera();
    const before = projectToScreenPct(new Vector3(0, 0, 0), camera);
    expect(before.xPct).toBeCloseTo(0.5, 5);

    // Slide the camera right without rendering anything.
    camera.position.x = 4;
    const after = projectToScreenPct(new Vector3(0, 0, 0), camera);

    // The point must now appear LEFT of centre, immediately.
    expect(after.xPct).toBeLessThan(0.4);
  });

  it('keeps tracking as the camera moves repeatedly, without drift', () => {
    const camera = makeCamera();
    const seen: number[] = [];
    for (let x = 0; x <= 3; x++) {
      camera.position.x = x;
      seen.push(projectToScreenPct(new Vector3(0, 0, 0), camera).xPct);
    }
    // Strictly decreasing: every camera step moves the point further left.
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeLessThan(seen[i - 1]);
    }
  });

  it('reports a point behind the camera as off-screen', () => {
    const camera = makeCamera();
    // Camera sits at z=10 looking at the origin, so z=50 is behind it.
    const result = projectToScreenPct(new Vector3(0, 0, 50), camera);
    expect(result.onScreen).toBe(false);
  });

  it('flips the Y axis — NDC is +up, CSS top is +down', () => {
    // A point ABOVE the camera's centre must land in the TOP half (yPct < 0.5).
    const result = projectToScreenPct(new Vector3(0, 2, 0), makeCamera());
    expect(result.yPct).toBeLessThan(0.5);
  });
});
