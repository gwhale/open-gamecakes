// Guards a frame-loop ORDERING invariant that has already shipped as a bug once.
//
// Cakey's speech-bubble anchor must be projected AFTER the camera is moved for
// the frame and BEFORE the frame is rendered. Project too early and the anchor
// silently describes the previous frame's camera — the bubble trails him
// whenever the camera moves, which is invisible while standing still.
//
// This asserts on source order, which is unusual. It earns its place because
// the invariant is purely positional: there is no runtime seam to assert on,
// nothing throws when it is violated, and the only symptom is a subtle visual
// lag that a human has to be moving to notice. See screen-anchor.ts for why
// both halves (position in the frame + updateMatrixWorld) are required.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const engineSource = readFileSync(
  fileURLToPath(new URL('./engine.ts', import.meta.url)),
  'utf8',
);

/** Index of a marker in the engine's frame loop, asserted to exist. */
function positionOf(marker: string): number {
  const index = engineSource.indexOf(marker);
  expect(index, `frame-loop marker not found in engine.ts: ${marker}`).toBeGreaterThan(-1);
  return index;
}

describe('town frame loop ordering', () => {
  it('projects Cakey’s bubble anchor after the camera moves and before the render', () => {
    const cameraMoved = positionOf('updateCamera(velPxX / PX_PER_UNIT');
    const projected = positionOf('if (cb.onCakeyMove) {');
    const rendered = positionOf('renderer.render(scene, camera)');

    expect(
      projected,
      'Cakey’s anchor is projected BEFORE updateCamera — it will describe the ' +
        'previous frame’s camera and the bubble will trail him while moving.',
    ).toBeGreaterThan(cameraMoved);

    expect(
      projected,
      'Cakey’s anchor is projected AFTER the render — it will be a frame stale.',
    ).toBeLessThan(rendered);
  });

  it('keeps the skydome recentre between the camera move and the render', () => {
    // Same class of invariant: the dome is camera-locked, so recentring it
    // before updateCamera (or after the render) makes the gradient lopsided.
    const cameraMoved = positionOf('updateCamera(velPxX / PX_PER_UNIT');
    const skyRecentred = positionOf('skyDome.position.copy(camera.position)');
    const rendered = positionOf('renderer.render(scene, camera)');

    expect(skyRecentred).toBeGreaterThan(cameraMoved);
    expect(skyRecentred).toBeLessThan(rendered);
  });
});
