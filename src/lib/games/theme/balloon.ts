// Drawn balloon sprite — Container with body, knot, highlight, eyes,
// smile. Originated in Water Balloons; extracted so any future game
// (party scene, fireworks game, balloon-pop, ...) can drop in a
// brand-consistent balloon.

import * as Phaser from 'phaser';
import { WATER } from './palette';

export interface BalloonOpts {
  x: number;
  y: number;
  /** Body color. Defaults to water blue. */
  color?: number;
  /** Knot/seam color. Defaults to a darker shade of `color`. */
  colorDeep?: number;
  /** Highlight color. Defaults to a lighter shade of `color`. */
  colorLight?: number;
  /** Body radius. Default 16. */
  radius?: number;
  /** Show cartoon eyes + smile. Default true. */
  hasFace?: boolean;
  depth?: number;
}

/** Make a Container holding the balloon graphics + face. Caller is
 *  responsible for adding a physics body if needed (see Water Balloons
 *  for the full launch flow). */
export function makeBalloon(scene: Phaser.Scene, opts: BalloonOpts): Phaser.GameObjects.Container {
  const {
    x, y,
    color = WATER.BALLOON,
    colorDeep = WATER.BALLOON_DEEP,
    colorLight = WATER.BALLOON_HI,
    radius = 16,
    hasFace = true,
    depth = 12,
  } = opts;

  const c = scene.add.container(x, y).setDepth(depth);

  // Body + drop shadow + highlight + knot
  const g = scene.add.graphics();
  g.fillStyle(0x1e3a8a, 0.3).fillCircle(2, 3, radius);
  g.fillStyle(color, 1).fillCircle(0, 0, radius);
  g.fillStyle(colorLight, 0.85).fillCircle(-5, -6, radius * 0.45);
  g.fillStyle(colorDeep, 1)
    .fillTriangle(-3, radius, 3, radius, 0, radius + 6);
  c.add(g);

  if (hasFace) {
    // Eyes — two whites + black pupils + tiny glints.
    const eyeL = scene.add.graphics();
    eyeL.fillStyle(0xffffff, 1).fillCircle(-5, -2, 4);
    eyeL.fillStyle(0x111827, 1).fillCircle(-5, -2, 2.4);
    eyeL.fillStyle(0xffffff, 1).fillCircle(-4, -3, 0.8);
    const eyeR = scene.add.graphics();
    eyeR.fillStyle(0xffffff, 1).fillCircle(5, -2, 4);
    eyeR.fillStyle(0x111827, 1).fillCircle(5, -2, 2.4);
    eyeR.fillStyle(0xffffff, 1).fillCircle(6, -3, 0.8);
    c.add([eyeL, eyeR]);

    // Smile arc.
    const mouth = scene.add.graphics();
    mouth.lineStyle(1.5, 0x111827, 1);
    mouth.beginPath();
    mouth.arc(0, 4, 2.5, 0.1 * Math.PI, 0.9 * Math.PI, false);
    mouth.strokePath();
    c.add(mouth);
  }

  return c;
}
