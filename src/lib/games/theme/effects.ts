// Shared juice — splash bursts, sparkle bursts, score floaters,
// camera flash + shake combos.
//
// All effects are fire-and-forget: the caller invokes a function, the
// effect plays and self-destroys. No state to manage. Effects accept
// optional config so a Marble Maze treat collection (small sparkle) and
// a Water Balloons bullseye hit (big splash + camera shake) can both
// reuse the same primitive at different intensities.

import * as Phaser from 'phaser';
import { WATER } from './palette';

// ---------------------------------------------------------------------------
// Splash burst — cyan ring + droplet emojis arcing outward. Used for any
// water/balloon hit. `scale` controls the overall intensity (1.0 = standard
// kid hit, 1.8 = bullseye, 0.7 = balloon hitting ground).
// ---------------------------------------------------------------------------

export function splashAt(scene: Phaser.Scene, x: number, y: number, opts?: {
  scale?: number;
  color?: number;       // override ring color
  droplets?: number;    // count of droplet emojis (default 7)
  depth?: number;
}): void {
  const {
    scale = 1,
    color = WATER.SPLASH,
    droplets = 7,
    depth = 11,
  } = opts ?? {};

  // Expanding ring
  const ring = scene.add.circle(x, y, 16 * scale, color, 0)
    .setStrokeStyle(4, color).setDepth(depth);
  scene.tweens.add({
    targets: ring,
    scale: { from: 1, to: 3.2 },
    alpha: { from: 0.95, to: 0 },
    duration: 460,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });

  // Droplet shower
  for (let i = 0; i < droplets; i++) {
    const d = scene.add.text(
      x + (Math.random() - 0.5) * 32 * scale,
      y + (Math.random() - 0.5) * 18 * scale,
      '💧',
      { fontSize: `${Math.round(18 * scale)}px` },
    ).setOrigin(0.5).setDepth(depth + 1);
    const dir = (Math.random() - 0.5) * 80 * scale;
    scene.tweens.add({
      targets: d,
      x: d.x + dir,
      y: d.y - 32 * scale - Math.random() * 14,
      alpha: 0,
      scale: 0.6,
      duration: 540 + Math.random() * 140,
      ease: 'Cubic.easeOut',
      onComplete: () => d.destroy(),
    });
  }
}

// ---------------------------------------------------------------------------
// Sparkle burst — ✨ emojis tweening outward with alpha+scale fade. Used
// for treat collection (Marble Maze), correct-answer celebration, etc.
// Cheaper than splashAt — no ring, just emoji confetti.
// ---------------------------------------------------------------------------

export function sparkleAt(scene: Phaser.Scene, x: number, y: number, opts?: {
  count?: number;
  spread?: number;
  fontSize?: number;
  rise?: number;          // how far up the sparkles drift (px)
  depth?: number;
}): void {
  const { count = 5, spread = 20, fontSize = 12, rise = 18, depth = 5 } = opts ?? {};
  for (let i = 0; i < count; i++) {
    const sp = scene.add.text(
      x + (Math.random() - 0.5) * spread,
      y + (Math.random() - 0.5) * spread,
      '✨',
      { fontSize: `${fontSize}px` },
    ).setOrigin(0.5).setDepth(depth);
    scene.tweens.add({
      targets: sp,
      alpha: 0,
      scale: 0.5,
      y: sp.y - rise,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => sp.destroy(),
    });
  }
}

// ---------------------------------------------------------------------------
// Floating score number — "+5" rising up with scale + fade.
// ---------------------------------------------------------------------------

export function floatScore(scene: Phaser.Scene, opts: {
  x: number; y: number;
  label: string;
  color?: string;          // CSS color string
  fontSize?: number;
  rise?: number;
  depth?: number;
}): void {
  const {
    x, y, label,
    color = '#facc15',
    fontSize = 28,
    rise = 50,
    depth = 60,
  } = opts;
  const t = scene.add.text(x, y, label, {
    fontSize: `${fontSize}px`,
    fontStyle: 'bold',
    color,
    stroke: '#000000',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(depth);
  scene.tweens.add({
    targets: t,
    y: y - rise,
    alpha: { from: 1, to: 0 },
    scale: { from: 0.6, to: 1.2 },
    duration: 720,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

// ---------------------------------------------------------------------------
// Big-hit camera fx — flash + shake combo. Use sparingly: only on the
// most satisfying scoring events (bullseye, boss hit, perfect run).
// ---------------------------------------------------------------------------

export function bigHitFx(scene: Phaser.Scene, opts?: {
  flashMs?: number;
  flashColor?: [number, number, number];   // RGB 0-255
  shakeMs?: number;
  shakeIntensity?: number;
}): void {
  const {
    flashMs = 140,
    flashColor = [255, 255, 255],
    shakeMs = 160,
    shakeIntensity = 0.006,
  } = opts ?? {};
  scene.cameras.main.flash(flashMs, flashColor[0], flashColor[1], flashColor[2]);
  scene.cameras.main.shake(shakeMs, shakeIntensity);
}

// ---------------------------------------------------------------------------
// Confetti burst — celebratory mix of sprinkles + sparkles + colored
// confetti dots. Used for round-end fanfare, level-up, etc.
// ---------------------------------------------------------------------------

export function confettiBurst(scene: Phaser.Scene, opts: {
  x: number; y: number;
  count?: number;
  spread?: number;
  depth?: number;
}): void {
  const { x, y, count = 24, spread = 80, depth = 60 } = opts;
  const colors = [0xfb7185, 0xfbbf24, 0x60a5fa, 0xa855f7, 0x10b981];
  for (let i = 0; i < count; i++) {
    const dot = scene.add.rectangle(
      x, y, 4 + Math.random() * 4, 6 + Math.random() * 5,
      colors[Math.floor(Math.random() * colors.length)],
    ).setDepth(depth);
    const ang = Math.random() * Math.PI * 2;
    const dist = spread + Math.random() * spread;
    scene.tweens.add({
      targets: dot,
      x: x + Math.cos(ang) * dist,
      y: y + Math.sin(ang) * dist,
      angle: { from: 0, to: (Math.random() - 0.5) * 720 },
      alpha: 0,
      duration: 900 + Math.random() * 300,
      ease: 'Cubic.easeOut',
      onComplete: () => dot.destroy(),
    });
  }
}

// ---------------------------------------------------------------------------
// Rising air bubbles — a continuous ambient stream for SUBMERGED scenes (the
// shark games). Bubbles rise from the seabed, wobble side-to-side, grow, and
// fade/pop near the surface, so the water reads as real water instead of a flat
// fill. Fire-and-forget like the rest of this module: call once during scene
// setup; Phaser reaps the container, timer, and tweens on scene SHUTDOWN.
//
// Bubbles live in a Container created at call time. Call this BEFORE spawning
// the fish so the container sits earlier in the display list and every bubble
// (even ones spawned mid-game) renders BEHIND the fish — no depth juggling.
// ---------------------------------------------------------------------------

export function riseBubbles(scene: Phaser.Scene, opts?: {
  xMin?: number;
  xMax?: number;
  yBottom?: number;      // spawn line (seabed)
  yTop?: number;         // surface where bubbles pop
  intervalMs?: number;   // spawn cadence
  color?: number;
  depth?: number;        // omit to inherit display-list order (behind fish)
}): void {
  const {
    xMin = 20,
    xMax = 780,
    yBottom = 480,
    yTop = 30,
    intervalMs = 360,
    color = WATER.BALLOON_HI,
    depth,
  } = opts ?? {};

  const layer = scene.add.container(0, 0);
  if (depth !== undefined) layer.setDepth(depth);

  const reduce =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // Reduced motion: skip the rising stream — a few faint STATIC bubbles keep
  // the look without any vestibular motion.
  if (reduce) {
    for (let i = 0; i < 6; i++) {
      const x = xMin + Math.random() * (xMax - xMin);
      const y = yTop + Math.random() * (yBottom - yTop);
      layer.add(scene.add.circle(x, y, 2 + Math.random() * 3, color, 0.28));
    }
    return;
  }

  const spawn = (): void => {
    const x = xMin + Math.random() * (xMax - xMin);
    const r = 2 + Math.random() * 4;
    const bub = scene.add.circle(x, yBottom, r, color, 0.42);
    // Off-center white highlight so it reads as a round air bubble, not a dot.
    const hi = scene.add.circle(x - r * 0.3, yBottom - r * 0.3, Math.max(1, r * 0.35), 0xffffff, 0.7);
    layer.add(bub);
    layer.add(hi);

    // Side-to-side wobble (independent of the rise) on both circle + highlight.
    const wobble = 6 + Math.random() * 8;
    const wob = scene.tweens.add({
      targets: [bub, hi],
      x: `+=${wobble}`,
      duration: 500 + Math.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Rise + grow + fade near the top, then pop (destroy).
    scene.tweens.add({
      targets: [bub, hi],
      y: `-=${yBottom - yTop}`,
      scale: { from: 1, to: 1.25 },
      duration: 2200 + Math.random() * 1000,
      ease: 'Sine.easeIn',
      onUpdate: (tw) => {
        const a = tw.progress > 0.75 ? (1 - tw.progress) / 0.25 : 1;
        bub.setAlpha(0.42 * a);
        hi.setAlpha(0.7 * a);
      },
      onComplete: () => {
        wob.stop();
        bub.destroy();
        hi.destroy();
      },
    });
  };

  scene.time.addEvent({ delay: intervalMs, loop: true, callback: spawn });
  // Prime a couple so the water isn't empty the instant the scene opens.
  spawn();
  scene.time.delayedCall(intervalMs / 2, spawn);
}
