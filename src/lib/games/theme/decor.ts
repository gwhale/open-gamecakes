// Gamecakes shared scenery primitives.
//
// Every function takes a `Phaser.Scene` and renders into it. Functions
// return the created GameObject(s) so callers can grab them for tweens
// or further composition. They do NOT manage scene state — the caller
// owns positioning, depth, lifecycle.
//
// Why functions and not classes: scenery is fire-and-forget. Once drawn,
// it doesn't need to be referenced again 99% of the time. Functions
// keep the call site terse — `drawCakeySun(this, x, y)` reads like a
// sentence — without forcing every scene into a class hierarchy.

import * as Phaser from 'phaser';
import { CAKE, GRASS, SKY, SPRINKLE_COLORS, SUN, TREE, WOOD } from './palette';

// ---------------------------------------------------------------------------
// Sprinkle PRNG — splitmix32. Seeded so the same scene always shows the
// same sprinkle scatter (no flicker between renders). Marble Maze v1
// originated this; now any cake-themed scene can reuse it.
// ---------------------------------------------------------------------------

export function makeSprinklePrng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/** Scatter colorful flecks across a region. Cosmetic — doesn't affect
 *  gameplay. Identical output for identical seeds. */
export function drawSprinkles(scene: Phaser.Scene, opts: {
  bounds: { x: number; y: number; w: number; h: number };
  count?: number;
  seed?: number;
  alpha?: number;
  depth?: number;
}): Phaser.GameObjects.Graphics {
  const { bounds, count = 52, seed = 0xCAFE_42, alpha = 0.5, depth = 1 } = opts;
  const rand = makeSprinklePrng(seed);
  const g = scene.add.graphics().setDepth(depth).setAlpha(alpha);
  for (let i = 0; i < count; i++) {
    const sx = bounds.x + 18 + rand() * (bounds.w - 36);
    const sy = bounds.y + 18 + rand() * (bounds.h - 36);
    const col = SPRINKLE_COLORS[Math.floor(rand() * SPRINKLE_COLORS.length)];
    const angle = rand() * Math.PI;
    const half = 4 + rand() * 5;
    g.lineStyle(3, col);
    g.lineBetween(
      sx - Math.cos(angle) * half, sy - Math.sin(angle) * half,
      sx + Math.cos(angle) * half, sy + Math.sin(angle) * half,
    );
  }
  return g;
}

// ---------------------------------------------------------------------------
// Sky bands — three rectangles top→horizon for cheap depth without a real
// gradient. Caller passes the scene's view dimensions.
// ---------------------------------------------------------------------------

export function drawSkyBands(scene: Phaser.Scene, opts: {
  viewW: number;
  topH?: number;     // height of the top (brightest) band
  midH?: number;
  lowH?: number;
  depth?: number;
}): void {
  const { viewW, topH = 140, midH = 120, lowH = 60, depth = 0 } = opts;
  scene.add.rectangle(viewW / 2, topH / 2,            viewW, topH, SKY.TOP).setDepth(depth);
  scene.add.rectangle(viewW / 2, topH + midH / 2,     viewW, midH, SKY.MID).setDepth(depth);
  scene.add.rectangle(viewW / 2, topH + midH + lowH / 2, viewW, lowH, SKY.LOW).setDepth(depth);
}

// ---------------------------------------------------------------------------
// Cake-themed sun — disc + glow + 12 radiating rays + smiley face.
// The rays slowly rotate so the scene feels alive without being noisy.
// ---------------------------------------------------------------------------

export function drawCakeySun(scene: Phaser.Scene, x: number, y: number, opts?: {
  rays?: boolean;
  face?: boolean;
  rotateMs?: number;
  depth?: number;
}): void {
  const { rays = true, face = true, rotateMs = 24_000, depth = 1 } = opts ?? {};

  if (rays) {
    const rg = scene.add.graphics().setDepth(depth);
    rg.lineStyle(4, SUN.DISC, 0.85);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      rg.lineBetween(
        x + Math.cos(a) * 50, y + Math.sin(a) * 50,
        x + Math.cos(a) * 70, y + Math.sin(a) * 70,
      );
    }
    // Rotation pivots around 0,0, so we offset before rotating. Easiest
    // way is to translate the graphics object's position and let it spin
    // around its own origin.
    rg.x = x; rg.y = y;
    rg.translateCanvas?.(-x, -y);
    scene.tweens.add({
      targets: rg, rotation: Math.PI * 2,
      duration: rotateMs, repeat: -1, ease: 'Linear',
    });
  }

  // Glow halo
  scene.add.circle(x, y, 56, SUN.GLOW, 0.5).setDepth(depth);
  // Disc
  scene.add.circle(x, y, 42, SUN.DISC, 1).setDepth(depth);

  if (face) {
    const f = scene.add.graphics().setDepth(depth + 1);
    f.fillStyle(SUN.FACE, 1);
    f.fillCircle(x - 14, y - 4, 3);
    f.fillCircle(x + 14, y - 4, 3);
    f.lineStyle(3, SUN.FACE);
    f.beginPath();
    f.arc(x, y + 6, 14, 0.1 * Math.PI, 0.9 * Math.PI, false);
    f.strokePath();
  }
}

// ---------------------------------------------------------------------------
// Cake-themed cloud — four overlapping puffs that drift across the
// viewport horizontally. Drift speed is "seconds per viewport width × 4"
// so picking 6–14 yields a believable spread of cloud speeds.
// ---------------------------------------------------------------------------

export function drawCakeyCloud(scene: Phaser.Scene, opts: {
  x: number;
  y: number;
  scale?: number;
  driftSpeedSec?: number;
  viewW?: number;        // for off-screen wrap; if omitted, no drift
  depth?: number;
}): Phaser.GameObjects.Container {
  const { x, y, scale = 1, driftSpeedSec, viewW, depth = 1 } = opts;
  const c = scene.add.container(x, y).setDepth(depth);
  c.add(scene.add.circle(0,            0,    24 * scale, 0xffffff, 0.95));
  c.add(scene.add.circle(22 * scale,   2,    19 * scale, 0xffffff, 0.95));
  c.add(scene.add.circle(-20 * scale,  4,    16 * scale, 0xffffff, 0.9));
  c.add(scene.add.circle(8 * scale,    -8,   14 * scale, 0xffffff, 0.85));

  if (driftSpeedSec && viewW) {
    scene.tweens.add({
      targets: c,
      x: viewW + 80,
      duration: driftSpeedSec * 1000 * 4,
      onComplete: () => c.setX(-80),
      repeat: -1,
    });
  }
  return c;
}

// ---------------------------------------------------------------------------
// Tree — trunk + 4-circle canopy with a gentle sway tween.
// ---------------------------------------------------------------------------

export function drawTree(scene: Phaser.Scene, opts: {
  x: number;
  baseY: number;
  scale?: number;
  swayMs?: number;
  depth?: number;
}): void {
  const { x, baseY, scale: s = 1, swayMs = 3500, depth = 1 } = opts;

  // Trunk
  scene.add.rectangle(x, baseY - 28 * s, 14 * s, 56 * s, TREE.TRUNK)
    .setStrokeStyle(2, TREE.TRUNK_DARK).setDepth(depth);

  // Canopy
  const canopy = scene.add.container(x, baseY - 70 * s).setDepth(depth);
  canopy.add(scene.add.circle(0,        0,      34 * s, TREE.CANOPY,    1));
  canopy.add(scene.add.circle(-24 * s,  8,      26 * s, TREE.CANOPY,    1));
  canopy.add(scene.add.circle( 24 * s,  8,      26 * s, TREE.CANOPY,    1));
  canopy.add(scene.add.circle( 0,       -22 * s, 22 * s, TREE.CANOPY_HI, 1));

  scene.tweens.add({
    targets: canopy,
    angle: { from: -2, to: 2 },
    duration: swayMs,
    yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
  });
}

// ---------------------------------------------------------------------------
// Wood-plank fence — fills `viewW` horizontally at the given y.
// Knothole detail at given x positions for a hand-built feel.
// ---------------------------------------------------------------------------

export function drawFence(scene: Phaser.Scene, opts: {
  viewW: number;
  y: number;
  height?: number;
  postSpacing?: number;
  knotholes?: ReadonlyArray<number>;   // x-coords for knothole circles
  depth?: number;
}): void {
  const { viewW, y, height = 36, postSpacing = 56, knotholes = [], depth = 2 } = opts;

  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(WOOD.PALE);
  g.fillRect(0, y, viewW, height);
  g.lineStyle(3, WOOD.PALE_DEEP);
  for (let x = 8; x < viewW; x += postSpacing) {
    g.lineBetween(x, y, x, y + height);
  }
  // Horizontal beams across the fence
  g.lineBetween(0, y + 10,  viewW, y + 10);
  g.lineBetween(0, y + 30,  viewW, y + 30);

  for (const kx of knotholes) {
    scene.add.circle(kx, y + height / 2, 3, WOOD.PALE_DEEP, 0.7).setDepth(depth + 1);
  }
}

// ---------------------------------------------------------------------------
// Grass — three bands lit→shadow, plus optional dark-green blade tufts
// for texture.
// ---------------------------------------------------------------------------

export function drawGrass(scene: Phaser.Scene, opts: {
  viewW: number;
  topY: number;
  bottomY: number;
  blades?: number;
  depth?: number;
  seed?: number;
}): void {
  const { viewW, topY, bottomY, blades = 90, depth = 0, seed = 0xC4FE } = opts;
  const totalH = bottomY - topY;
  const litH = totalH * 0.32;
  const midH = totalH * 0.55;
  const shadowH = totalH * 0.13;

  scene.add.rectangle(viewW / 2, topY + litH / 2, viewW, litH, GRASS.LIT).setDepth(depth);
  scene.add.rectangle(viewW / 2, topY + litH + midH / 2, viewW, midH, GRASS.MID).setDepth(depth);
  scene.add.rectangle(viewW / 2, topY + litH + midH + shadowH / 2, viewW, shadowH, GRASS.SHADOW).setDepth(depth);

  if (blades > 0) {
    const rand = makeSprinklePrng(seed);
    const bg = scene.add.graphics().setDepth(depth + 3).setAlpha(0.65);
    bg.lineStyle(2, GRASS.SHADOW);
    for (let i = 0; i < blades; i++) {
      const bx = 8 + rand() * (viewW - 16);
      const by = topY + 5 + rand() * (totalH - 10);
      bg.lineBetween(bx, by, bx + (rand() - 0.5) * 4, by - 6 - rand() * 5);
    }
  }
}

// ---------------------------------------------------------------------------
// Frosting drizzle on a wall segment — used by Marble Maze's strawberry
// walls. Just a thin white rect on top.
// ---------------------------------------------------------------------------

export function drawFrostingDrizzle(scene: Phaser.Scene, opts: {
  x: number; y: number; w: number;
  depth?: number;
}): void {
  const { x, y, w, depth = 6 } = opts;
  const g = scene.add.graphics().setDepth(depth).setAlpha(0.45);
  g.fillStyle(CAKE.FROSTING).fillRect(x + 2, y, w - 4, 3);
}

// ---------------------------------------------------------------------------
// Sprinkler — a base stub plus continuously firing arc droplets. The
// returned cleanup function stops the firing (in case the caller wants
// to remove a sprinkler mid-game).
// ---------------------------------------------------------------------------

export function drawSprinkler(scene: Phaser.Scene, opts: {
  x: number; y: number;
  depth?: number;
}): void {
  const { x, y, depth = 3 } = opts;
  scene.add.rectangle(x, y, 8, 6, 0x6b7280).setDepth(depth);

  // Three staggered emitters so the spray reads as continuous.
  for (let i = 0; i < 3; i++) {
    const fire = (): void => {
      const drop = scene.add.text(x, y, '💧', { fontSize: '12px' })
        .setOrigin(0.5).setDepth(depth);
      const dir = Math.random() < 0.5 ? -1 : 1;
      scene.tweens.add({
        targets: drop,
        x: x + dir * (20 + Math.random() * 30),
        y: y - 30 - Math.random() * 20,
        alpha: { from: 0.9, to: 0 },
        scale: { from: 1, to: 0.6 },
        duration: 900 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => { drop.destroy(); fire(); },
      });
    };
    scene.time.delayedCall(i * 280, fire);
  }
}

// ---------------------------------------------------------------------------
// Cake bands — the strawberry/vanilla/mint three-layer background that
// Marble Maze uses. Caller passes view dimensions.
// ---------------------------------------------------------------------------

export function drawCakeBands(scene: Phaser.Scene, opts: {
  viewW: number; viewH: number;
  depth?: number;
}): void {
  const { viewW, viewH, depth = 0 } = opts;
  const band = viewH / 3;
  scene.add.rectangle(viewW / 2, band * 0.5, viewW, band, 0xd1fae5).setDepth(depth);  // mint top
  scene.add.rectangle(viewW / 2, band * 1.5, viewW, band, CAKE.VANILLA).setDepth(depth);
  scene.add.rectangle(viewW / 2, band * 2.5, viewW, band, 0xfce7f3).setDepth(depth);  // strawberry tint

  // Frosting seams between layers
  const fg = scene.add.graphics().setDepth(depth + 1).setAlpha(0.4);
  fg.fillStyle(CAKE.FROSTING);
  fg.fillRect(0, band - 3, viewW, 6);
  fg.fillRect(0, band * 2 - 3, viewW, 6);
}
