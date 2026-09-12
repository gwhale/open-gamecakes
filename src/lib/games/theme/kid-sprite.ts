// Drawn kid sprite — head + hair + face + torso + arms + legs + shoes,
// composed from Phaser primitives (no image assets). Originated in
// Water Balloons; extracted here so any Gamecakes scene can drop in
// a running-kid character without redoing all the geometry.
//
// Usage:
//   const k = createKid(scene, { x: 240, y: 380, dir: 1 });
//   // k.container has a Phaser arcade body and is auto-running.
//   ...
//   k.fallOver();   // when hit
//   k.standUp();    // after timer
//
// The class manages its own running tween, fall-over rotation, and
// stand-up flip. Hosting scenes only need to wire up the physics
// overlap and the hit→fallOver call.

import * as Phaser from 'phaser';
import { type KidPalette, KID_PALETTES } from './palette';

export type KidFacing = 1 | -1;

export interface KidSpriteHandle {
  /** Container with all parts. Has a Phaser.Physics.Arcade.Body. */
  container: Phaser.GameObjects.Container;
  body: Phaser.Physics.Arcade.Body;
  facing: KidFacing;
  palette: KidPalette;
  /** True while wet/lying down — overlap callbacks should skip. */
  wet: boolean;
  /** Optional 💦 emoji shown above when wet. */
  splash?: Phaser.GameObjects.Text;

  setFacing(dir: KidFacing): void;
  /** Hit by a balloon — stop running, lie down, show splash. */
  fallOver(): void;
  /** Recover — stand up, restart running, re-roll direction. */
  standUp(opts?: { speed?: number; verticalDriftRange?: number }): void;
  /** Stop the running tween (e.g. when round ends). */
  freeze(): void;
  /** Tear down all visuals + timers — call when scene shuts down. */
  destroy(): void;
}

/** Create a drawn-kid container at (x, y). If `palette` is omitted, a
 *  random one from KID_PALETTES is picked. The container has an arcade
 *  physics body sized to the head+torso (collision rect ≈ 22×50). */
export function createKid(scene: Phaser.Scene, opts: {
  x: number;
  y: number;
  dir?: KidFacing;
  palette?: KidPalette;
  speed?: number;            // initial horizontal velocity magnitude
  verticalDriftRange?: number; // ±half-range of initial vy
  depth?: number;
}): KidSpriteHandle {
  const {
    x, y,
    dir = 1,
    palette = KID_PALETTES[Math.floor(Math.random() * KID_PALETTES.length)],
    speed = 90,
    verticalDriftRange = 16,
    depth = 10,
  } = opts;

  const c = scene.add.container(x, y).setDepth(depth);

  // Legs — origin at top so rotation pivots from the hip.
  const legL = scene.add.rectangle(-5, 14, 7, 18, palette.pants).setOrigin(0.5, 0);
  const legR = scene.add.rectangle( 5, 14, 7, 18, palette.pants).setOrigin(0.5, 0);
  const shoeL = scene.add.rectangle(-5, 32, 9, 4, 0x1f2937).setOrigin(0.5, 0);
  const shoeR = scene.add.rectangle( 5, 32, 9, 4, 0x1f2937).setOrigin(0.5, 0);

  // Torso (shirt)
  const torso = scene.add.rectangle(0, 0, 18, 24, palette.shirt)
    .setStrokeStyle(1, 0x000000, 0.15);

  // Arms — origin at shoulder.
  const armL = scene.add.rectangle(-11, -4, 5, 16, palette.skin).setOrigin(0.5, 0);
  const armR = scene.add.rectangle( 11, -4, 5, 16, palette.skin).setOrigin(0.5, 0);

  // Head (skin) + hair cap.
  const head = scene.add.circle(0, -16, 9, palette.skin).setStrokeStyle(1, 0x000000, 0.15);
  const hair = scene.add.graphics();
  hair.fillStyle(palette.hair, 1);
  hair.fillEllipse(0, -22, 18, 9);
  hair.fillRect(-9, -22, 18, 4);
  hair.fillRect(-7, -19, 14, 3);

  // Face — eyes + smile.
  const face = scene.add.graphics();
  face.fillStyle(0x111827, 1);
  face.fillCircle(-3, -16, 1.2);
  face.fillCircle( 3, -16, 1.2);
  face.lineStyle(1, 0x111827);
  face.beginPath();
  face.arc(0, -13, 2.2, 0.1 * Math.PI, 0.9 * Math.PI, false);
  face.strokePath();

  c.add([legL, legR, shoeL, shoeR, torso, armL, armR, head, hair, face]);
  c.setScale(dir, 1);

  // Physics body
  scene.physics.world.enable(c);
  const body = c.body as Phaser.Physics.Arcade.Body;
  body.setSize(22, 50);
  body.setOffset(-11, -25);
  body.setAllowGravity(false);
  body.setCollideWorldBounds(false);
  const initVx = dir * speed;
  const initVy = (Math.random() - 0.5) * verticalDriftRange;
  body.setVelocity(initVx, initVy);

  // Track tweens we own so we can destroy cleanly. Phaser will GC
  // tweens when their targets are destroyed, but tracking lets us stop
  // them on freeze/fallOver without waiting for destruction.
  const tweens: Phaser.Tweens.Tween[] = [];

  const startRunning = (): void => {
    // Reset rest pose
    legL.setAngle(-22); armR.setAngle(-22);
    legR.setAngle( 22); armL.setAngle( 22);
    // Two opposed swing tweens — the "mirror" gait pattern.
    tweens.push(scene.tweens.add({
      targets: [legL, armR],
      angle: { from: -22, to: 22 },
      duration: 220,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
    tweens.push(scene.tweens.add({
      targets: [legR, armL],
      angle: { from: 22, to: -22 },
      duration: 220,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
    // Body bob ±2 px on the container.
    tweens.push(scene.tweens.add({
      targets: c,
      y: c.y - 2,
      duration: 220,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    }));
  };
  const stopAllTweens = (): void => {
    for (const t of tweens) t.remove();
    tweens.length = 0;
  };
  startRunning();

  const handle: KidSpriteHandle = {
    container: c, body, facing: dir, palette, wet: false,

    setFacing(d: KidFacing): void {
      this.facing = d;
      c.setScale(d, 1);
    },

    fallOver(): void {
      this.wet = true;
      stopAllTweens();
      body.setVelocity(0, 0);
      scene.tweens.add({
        targets: c,
        angle: 90 * this.facing,
        duration: 260,
        ease: 'Cubic.easeOut',
      });
      this.splash = scene.add.text(c.x, c.y - 28, '💦', { fontSize: '28px' })
        .setOrigin(0.5).setDepth(c.depth + 1);
    },

    standUp(opts?: { speed?: number; verticalDriftRange?: number }): void {
      const newSpeed = opts?.speed ?? speed;
      const newDrift = opts?.verticalDriftRange ?? verticalDriftRange;
      scene.tweens.add({
        targets: c,
        angle: 0,
        duration: 220,
        ease: 'Back.easeOut',
      });
      this.splash?.destroy();
      this.splash = undefined;
      const newDir: KidFacing = Math.random() < 0.5 ? -1 : 1;
      this.setFacing(newDir);
      const jitter = newSpeed * (0.85 + Math.random() * 0.3);
      body.setVelocity(newDir * jitter, (Math.random() - 0.5) * newDrift);
      this.wet = false;
      startRunning();
    },

    freeze(): void {
      stopAllTweens();
      body.setVelocity(0, 0);
    },

    destroy(): void {
      stopAllTweens();
      this.splash?.destroy();
      c.destroy();
    },
  };
  return handle;
}

/** Pick `count` distinct palettes from KID_PALETTES (no repeats unless
 *  count > available palettes). Use this when spawning a small crowd so
 *  the kids don't accidentally look identical. */
export function pickDistinctPalettes(count: number): KidPalette[] {
  const pool = [...KID_PALETTES];
  const out: KidPalette[] = [];
  for (let i = 0; i < count; i++) {
    if (pool.length === 0) {
      out.push(KID_PALETTES[Math.floor(Math.random() * KID_PALETTES.length)]);
      continue;
    }
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}
