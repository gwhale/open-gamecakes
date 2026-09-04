// Town map illustrations — per-region shape + landmark drawers, plus
// ribbon banner and ride-chip helpers. Lives in its own module so
// TownScene.ts doesn't balloon past 1500 lines.
//
// Every function takes (scene, opts) and renders into the passed
// scene. They do NOT manage scene lifecycle — caller owns ordering,
// depth, cleanup. Functions return void or a small handle when the
// caller might need to reach back.
//
// Aesthetic target: Disneyland Paris park map. Hand-illustrated feel
// without an asset pipeline — every shape is composed from
// Phaser.Graphics primitives + Phaser.Curves.QuadraticBezier curves +
// emoji as accents. The same rules every existing scene follows
// (Marble Maze, Water Balloons, etc.) — see `theme/decor.ts` for
// reusable scenery primitives.

import * as Phaser from 'phaser';
import { CAKE, GRASS, MOUNTAIN, RIBBON, SAND, TREE, WATER, WOOD } from '@/lib/games/theme/palette';
import type { Region } from '@/lib/town/regions';

export interface RegionDrawOpts {
  /** Top-left corner of the region's tile rect, in world pixel coords. */
  x: number;
  y: number;
  /** Tile rect dimensions, also pixel. Always 256×192 today (4×3 tiles)
   *  but we accept them as args so the helpers don't lock the layout in. */
  w: number;
  h: number;
  /** Region palette color in 0xRRGGBB form (caller already converted from hex). */
  themeColor: number;
  /** Z-depth for the shape's fill. Landmarks layer +1 above. */
  depth: number;
}

// ===========================================================================
// REGION SHAPES — one per region. Each fills the rect interior with an
// organic outline that suggests the region's theme. Approach detection
// + fog body still use the rect bounds; only the visual shape is custom.
// ===========================================================================

/** Town Square — circular plaza with a scalloped cobblestone border.
 *  The plaza fills most of the rect but reads as a round courtyard
 *  instead of a square tile, matching the central-hub aesthetic of
 *  Disneyland's Main Street roundabout. */
export function drawTownSquare(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2;
  const radius = Math.min(opts.w, opts.h) / 2 - 6;

  // Plaza fill — themeColor circle.
  scene.add
    .circle(cx, cy, radius, opts.themeColor, 0.95)
    .setStrokeStyle(3, CAKE.AMBER_DEEP, 1)
    .setDepth(opts.depth);

  // Cobblestone ring — small darker dots around the perimeter.
  const dotG = scene.add.graphics().setDepth(opts.depth + 0.05);
  dotG.fillStyle(CAKE.CHOCOLATE, 0.5);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
    const dx = cx + Math.cos(a) * (radius - 8);
    const dy = cy + Math.sin(a) * (radius - 8);
    dotG.fillCircle(dx, dy, 2.5);
  }
}

/** Town Square landmark — Cakey on a tiered pedestal in the center
 *  of the plaza. Three stacked rectangles shrinking upward read as a
 *  monument plinth. Cake emoji sits on top. */
export function drawTownSquareLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2;
  const d = opts.depth + 1;

  // Pedestal tiers
  scene.add.rectangle(cx, cy + 30, 64, 14, CAKE.CHOCOLATE, 1).setStrokeStyle(1, CAKE.CHOCOLATE_DEEP).setDepth(d);
  scene.add.rectangle(cx, cy + 18, 50, 14, CAKE.CHOCOLATE, 1).setStrokeStyle(1, CAKE.CHOCOLATE_DEEP).setDepth(d);
  scene.add.rectangle(cx, cy + 6, 38,  14, CAKE.CHOCOLATE, 1).setStrokeStyle(1, CAKE.CHOCOLATE_DEEP).setDepth(d);

  // Cakey statue — emoji on top of the pedestal, slight downshift to
  // sit ON the top tier rather than float above it.
  scene.add
    .text(cx, cy - 18, '🎂', { fontSize: '52px' })
    .setOrigin(0.5, 0.5)
    .setDepth(d + 0.1);
}

/** Cookie Corner — a giant cookie shape with a quarter-bite cut out
 *  of the upper-right. The "bite" is filled with grass (matching the
 *  world bed) so it reads as a cut, not just a darker patch. */
export function drawCookieCorner(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2;
  const radius = Math.min(opts.w, opts.h) / 2 - 4;

  scene.add.circle(cx, cy, radius, opts.themeColor, 0.95)
    .setStrokeStyle(3, CAKE.CHOCOLATE, 1)
    .setDepth(opts.depth);

  // Bite — smaller circle in grass color, positioned upper-right of
  // the cookie so it eats into the silhouette.
  scene.add.circle(cx + radius * 0.55, cy - radius * 0.55, radius * 0.4, GRASS.LIT, 1)
    .setDepth(opts.depth + 0.01);

  // Chocolate chips scattered across the cookie face.
  const chipG = scene.add.graphics().setDepth(opts.depth + 0.02);
  chipG.fillStyle(CAKE.CHOCOLATE_DEEP, 0.85);
  const chipPositions: Array<[number, number]> = [
    [-30, -10], [10, 18], [-12, 30], [25, -22], [-40, 15], [38, 5],
  ];
  for (const [dx, dy] of chipPositions) {
    chipG.fillCircle(cx + dx, cy + dy, 4);
  }
}

/** Cookie Corner landmark — three peaked-roof storefronts in a row,
 *  evoking a tiny shop street like Disneyland's Main Street. The
 *  storefronts are deliberately smaller than the cookie so they read
 *  as a feature *on* the region rather than the region itself. */
export function drawCookieCornerLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2 + 30;
  const d = opts.depth + 1;

  const shops: Array<{ x: number; roof: number; body: number }> = [
    { x: cx - 50, roof: CAKE.STRAWBERRY,  body: 0xfff7ed },
    { x: cx,      roof: CAKE.MINT_DARK,   body: 0xfff7ed },
    { x: cx + 50, roof: 0x60a5fa,          body: 0xfff7ed },
  ];
  for (const shop of shops) {
    // Body
    scene.add.rectangle(shop.x, cy, 32, 28, shop.body, 1).setStrokeStyle(1, CAKE.CHOCOLATE).setDepth(d);
    // Roof — triangle on top
    const roof = scene.add.graphics().setDepth(d + 0.01);
    roof.fillStyle(shop.roof, 1);
    roof.beginPath();
    roof.moveTo(shop.x - 18, cy - 14);
    roof.lineTo(shop.x, cy - 26);
    roof.lineTo(shop.x + 18, cy - 14);
    roof.closePath();
    roof.fillPath();
    roof.lineStyle(1, CAKE.CHOCOLATE, 1);
    roof.strokePath();
    // Tiny door
    scene.add.rectangle(shop.x, cy + 6, 8, 14, CAKE.CHOCOLATE, 1).setDepth(d + 0.02);
  }
}

/** Library of Lemon — open book shape. Two trapezoid pages tilted
 *  toward each other meet at a vertical spine. Horizontal squiggles
 *  on each page suggest text. */
export function drawLibraryOfLemon(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2;
  const halfW = opts.w / 2 - 12;
  const halfH = opts.h / 2 - 18;
  const d = opts.depth;

  const g = scene.add.graphics().setDepth(d);
  g.fillStyle(opts.themeColor, 0.97);

  // Left page — tilted trapezoid (top edge slopes up to the spine).
  g.beginPath();
  g.moveTo(cx - halfW, cy + halfH);              // bottom-left outer
  g.lineTo(cx - 4,     cy + halfH - 8);          // bottom-left near spine
  g.lineTo(cx - 4,     cy - halfH + 4);          // top-left near spine
  g.lineTo(cx - halfW, cy - halfH + 12);         // top-left outer (slightly lower than spine)
  g.closePath();
  g.fillPath();

  // Right page — mirror.
  g.beginPath();
  g.moveTo(cx + halfW, cy + halfH);
  g.lineTo(cx + 4,     cy + halfH - 8);
  g.lineTo(cx + 4,     cy - halfH + 4);
  g.lineTo(cx + halfW, cy - halfH + 12);
  g.closePath();
  g.fillPath();

  // Page outlines.
  g.lineStyle(2, CAKE.CHOCOLATE, 0.9);
  g.strokeRect(cx - halfW, cy - halfH + 8, halfW - 4, halfH * 2 - 12);
  g.strokeRect(cx + 4,     cy - halfH + 8, halfW - 4, halfH * 2 - 12);

  // Spine — darker line down the middle.
  g.lineStyle(4, CAKE.CHOCOLATE_DEEP, 1);
  g.lineBetween(cx, cy - halfH + 4, cx, cy + halfH - 4);

  // Text-line squiggles — three horizontal lines per page.
  const lineG = scene.add.graphics().setDepth(d + 0.01);
  lineG.lineStyle(1.5, CAKE.CHOCOLATE, 0.5);
  for (let i = 0; i < 3; i++) {
    const ly = cy - 18 + i * 18;
    lineG.lineBetween(cx - halfW + 14, ly, cx - 12, ly);
    lineG.lineBetween(cx + 12, ly, cx + halfW - 14, ly);
  }
}

/** Library landmark — large open-book emoji centered above the
 *  drawn pages so the region's thematic icon is unmissable. */
export function drawLibraryOfLemonLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2 - 40;
  scene.add
    .text(cx, cy, '📖', { fontSize: '40px' })
    .setOrigin(0.5, 0.5)
    .setDepth(opts.depth + 1);
}

/** Frosting Fields — rolling-hill silhouette. Top edge waves with
 *  three humps via QuadraticBezier; sides + bottom are straight. */
export function drawFrostingFields(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const right = opts.x + opts.w - 4;
  const bottom = opts.y + opts.h - 4;
  const baseTop = opts.y + 28;
  const d = opts.depth;

  const g = scene.add.graphics().setDepth(d);
  g.fillStyle(opts.themeColor, 0.95);
  g.lineStyle(3, CAKE.STRAWBERRY_DEEP, 1);

  g.beginPath();
  g.moveTo(left, bottom);
  g.lineTo(left, baseTop + 12);
  // Three rolling humps drawn as quadratic curves between the side
  // anchors. Each hump's peak is `humpRise` above baseTop.
  const span = (right - left) / 3;
  const humpRise = 18;
  const a = new Phaser.Math.Vector2(left,           baseTop + 12);
  const b = new Phaser.Math.Vector2(left + span,    baseTop - humpRise);
  const c = new Phaser.Math.Vector2(left + span * 2,baseTop - humpRise);
  const d2 = new Phaser.Math.Vector2(right,         baseTop + 12);

  // Approximate the wavy top by sampling 3 quadratic curves and
  // tracing them with lineTo. Phaser.Graphics path doesn't have
  // quadraticCurveTo, but the Curves API can sample points.
  const sampleStep = 6; // px between path samples — finer = smoother
  const curves = [
    new Phaser.Curves.QuadraticBezier(a, new Phaser.Math.Vector2(left + span / 2, baseTop - humpRise), b),
    new Phaser.Curves.QuadraticBezier(b, new Phaser.Math.Vector2(left + span * 1.5, baseTop + humpRise), c),
    new Phaser.Curves.QuadraticBezier(c, new Phaser.Math.Vector2(left + span * 2.5, baseTop - humpRise), d2),
  ];
  for (const curve of curves) {
    const len = curve.getLength();
    const steps = Math.max(8, Math.floor(len / sampleStep));
    for (let s = 1; s <= steps; s++) {
      const p = curve.getPoint(s / steps);
      g.lineTo(p.x, p.y);
    }
  }
  g.lineTo(right, bottom);
  g.closePath();
  g.fillPath();
  g.strokePath();
}

/** Frosting Fields landmark — flower scatter on the hills. Tulip
 *  emojis at varied positions feel like a Mary Blair flower field. */
export function drawFrostingFieldsLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2;
  const cy = opts.y + opts.h / 2;
  const d = opts.depth + 1;

  const flowers: Array<[number, number, number]> = [
    [-70, 10, 26], [-30, 30, 22], [10, 0, 30], [50, 25, 24], [78, -5, 22],
  ];
  for (const [dx, dy, size] of flowers) {
    scene.add
      .text(cx + dx, cy + dy, '🌷', { fontSize: `${size}px` })
      .setOrigin(0.5, 0.5)
      .setDepth(d);
  }
}

/** Sprinkle Shore — beach + sherbet sea split by a diagonal coastline.
 *  The lower-left half is sand (tan), the upper-right half is the
 *  rainbow sea (banded blues/teals). Wave ripples drawn on the sea. */
export function drawSprinkleShore(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const top = opts.y + 4;
  const right = opts.x + opts.w - 4;
  const bottom = opts.y + opts.h - 4;
  const d = opts.depth;

  // Sea half — fill the upper-right triangle area in cyan, then layer
  // a ripple band of slightly darker blue.
  const sea = scene.add.graphics().setDepth(d);
  sea.fillStyle(WATER.BALLOON_HI, 0.95);
  sea.beginPath();
  sea.moveTo(left, top);
  sea.lineTo(right, top);
  sea.lineTo(right, bottom);
  // Diagonal coastline (right edge bottom → left edge upper-third)
  sea.lineTo(left, top + (bottom - top) * 0.55);
  sea.closePath();
  sea.fillPath();
  sea.lineStyle(2, WATER.BALLOON_DEEP, 0.9);
  sea.strokePath();

  // Sand half — fill the lower-left triangle.
  const sand = scene.add.graphics().setDepth(d + 0.01);
  sand.fillStyle(SAND.PALE, 0.96);
  sand.beginPath();
  sand.moveTo(left, top + (bottom - top) * 0.55);
  sand.lineTo(right, bottom);
  sand.lineTo(left, bottom);
  sand.closePath();
  sand.fillPath();
  sand.lineStyle(2, SAND.DEEP, 0.85);
  sand.strokePath();

  // Wave ripples on the sea — three horizontal curves.
  const wave = scene.add.graphics().setDepth(d + 0.02);
  wave.lineStyle(2, WATER.BALLOON, 0.7);
  for (let i = 0; i < 3; i++) {
    const wy = top + 22 + i * 16;
    wave.beginPath();
    wave.moveTo(left + 12, wy);
    wave.lineTo(left + 26, wy - 3);
    wave.lineTo(left + 40, wy);
    wave.lineTo(left + 54, wy - 3);
    wave.lineTo(left + 68, wy);
    wave.lineTo(left + 82, wy - 3);
    wave.strokePath();
  }
}

/** Sprinkle Shore landmark — small sailboat on the sea side. */
export function drawSprinkleShoreLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w / 2 + 30;
  const cy = opts.y + opts.h / 2 - 22;
  const d = opts.depth + 1;

  // Hull
  const hull = scene.add.graphics().setDepth(d);
  hull.fillStyle(CAKE.CHOCOLATE, 1);
  hull.beginPath();
  hull.moveTo(cx - 20, cy + 12);
  hull.lineTo(cx + 20, cy + 12);
  hull.lineTo(cx + 14, cy + 22);
  hull.lineTo(cx - 14, cy + 22);
  hull.closePath();
  hull.fillPath();
  hull.lineStyle(1, CAKE.CHOCOLATE_DEEP, 1);
  hull.strokePath();

  // Mast
  hull.lineStyle(2, CAKE.CHOCOLATE_DEEP, 1);
  hull.lineBetween(cx, cy + 12, cx, cy - 24);

  // Sail (white triangle)
  const sail = scene.add.graphics().setDepth(d + 0.01);
  sail.fillStyle(0xffffff, 1);
  sail.beginPath();
  sail.moveTo(cx + 1, cy - 24);
  sail.lineTo(cx + 22, cy + 8);
  sail.lineTo(cx + 1, cy + 8);
  sail.closePath();
  sail.fillPath();
  sail.lineStyle(1, CAKE.CHOCOLATE, 1);
  sail.strokePath();
}

/** Meringue Mountain — three jagged snow-capped peaks dominating
 *  the lower 2/3 of the rect, sky tint above. */
export function drawMeringueMountain(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const right = opts.x + opts.w - 4;
  const top = opts.y + 4;
  const bottom = opts.y + opts.h - 4;
  const d = opts.depth;

  // Sky band on top
  scene.add
    .rectangle((left + right) / 2, (top + (top + bottom) / 2) / 2, right - left, (bottom - top) * 0.35, opts.themeColor, 0.85)
    .setDepth(d);

  // Mountain rock base — large filled trapezoid covering the lower
  // 65% of the rect.
  const rock = scene.add.graphics().setDepth(d + 0.01);
  rock.fillStyle(MOUNTAIN.ROCK, 0.97);

  const baseY = bottom;
  const peakBaseY = top + (bottom - top) * 0.35;
  const peaks: Array<{ x: number; y: number; topY: number }> = [
    { x: left + (right - left) * 0.18, y: peakBaseY,      topY: top + 14 },
    { x: left + (right - left) * 0.50, y: peakBaseY - 12, topY: top + 4  },
    { x: left + (right - left) * 0.82, y: peakBaseY,      topY: top + 22 },
  ];

  rock.beginPath();
  rock.moveTo(left, baseY);
  rock.lineTo(left, peakBaseY + 10);
  for (const peak of peaks) {
    rock.lineTo(peak.x - 32, peak.y);
    rock.lineTo(peak.x, peak.topY);
    rock.lineTo(peak.x + 32, peak.y);
  }
  rock.lineTo(right, peakBaseY + 10);
  rock.lineTo(right, baseY);
  rock.closePath();
  rock.fillPath();
  rock.lineStyle(2, MOUNTAIN.ROCK_DARK, 1);
  rock.strokePath();

  // Snow caps — smaller triangles atop each peak.
  const snow = scene.add.graphics().setDepth(d + 0.02);
  snow.fillStyle(MOUNTAIN.SNOW, 1);
  for (const peak of peaks) {
    snow.beginPath();
    snow.moveTo(peak.x - 14, peak.topY + 12);
    snow.lineTo(peak.x, peak.topY);
    snow.lineTo(peak.x + 14, peak.topY + 12);
    snow.lineTo(peak.x + 5, peak.topY + 14);
    snow.lineTo(peak.x, peak.topY + 10);
    snow.lineTo(peak.x - 5, peak.topY + 14);
    snow.closePath();
    snow.fillPath();
  }
  snow.lineStyle(1, MOUNTAIN.SNOW_EDGE, 1);
  snow.strokePath();
}

/** Meringue Mountain landmark — sun in the upper-right corner of the
 *  rect to add a "mountain at sunrise" warmth. The mountain shape
 *  itself is the dominant landmark; the sun is an accent. */
export function drawMeringueMountainLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const cx = opts.x + opts.w - 32;
  const cy = opts.y + 32;
  const d = opts.depth + 1;

  // Glow halo
  scene.add.circle(cx, cy, 22, CAKE.AMBER, 0.45).setDepth(d);
  // Sun disc
  scene.add.circle(cx, cy, 16, CAKE.AMBER, 1).setDepth(d + 0.01);
  // Rays
  const rays = scene.add.graphics().setDepth(d + 0.02);
  rays.lineStyle(2, CAKE.AMBER_DEEP, 0.85);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    rays.lineBetween(
      cx + Math.cos(a) * 19,
      cy + Math.sin(a) * 19,
      cx + Math.cos(a) * 26,
      cy + Math.sin(a) * 26,
    );
  }
}

/** Caramel Cove — golden ground with a curved bay biting into the
 *  left edge. Filled with water blue. */
export function drawCaramelCove(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const top = opts.y + 4;
  const right = opts.x + opts.w - 4;
  const bottom = opts.y + opts.h - 4;
  const d = opts.depth;

  // Land base — fill the rect minus the bay.
  const land = scene.add.graphics().setDepth(d);
  land.fillStyle(opts.themeColor, 0.95);
  land.beginPath();
  land.moveTo(left, top);
  land.lineTo(right, top);
  land.lineTo(right, bottom);
  land.lineTo(left, bottom);
  land.closePath();
  land.fillPath();
  land.lineStyle(2, SAND.DEEP, 0.9);
  land.strokePath();

  // Bay — semicircle biting in from the left edge, filled with water.
  const bayCx = left + 12;
  const bayCy = (top + bottom) / 2;
  const bayR = 50;
  const bay = scene.add.graphics().setDepth(d + 0.01);
  bay.fillStyle(WATER.BALLOON_HI, 0.95);
  bay.fillCircle(bayCx, bayCy, bayR);
  bay.lineStyle(2, WATER.BALLOON_DEEP, 0.85);
  bay.strokeCircle(bayCx, bayCy, bayR);

  // Ripple inside the bay
  const ripple = scene.add.graphics().setDepth(d + 0.02);
  ripple.lineStyle(1.5, WATER.BALLOON, 0.7);
  for (let i = 1; i < 3; i++) {
    ripple.strokeCircle(bayCx, bayCy, bayR - i * 12);
  }
}

/** Caramel Cove landmark — anchor + tiny dock pier extending into
 *  the bay. */
export function drawCaramelCoveLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const top = opts.y + 4;
  const bottom = opts.y + opts.h - 4;
  const bayCy = (top + bottom) / 2;
  const d = opts.depth + 1;

  // Dock plank extending from land into bay
  scene.add.rectangle(left + 50, bayCy, 36, 10, WOOD.PLANK_LIGHT, 1)
    .setStrokeStyle(1, WOOD.POST_DARK, 1).setDepth(d);
  // Two short pilings under the dock
  scene.add.rectangle(left + 42, bayCy + 12, 4, 12, WOOD.POST_DARK, 1).setDepth(d);
  scene.add.rectangle(left + 58, bayCy + 12, 4, 12, WOOD.POST_DARK, 1).setDepth(d);

  // Anchor emoji on the dock
  scene.add
    .text(left + 80, bayCy - 4, '⚓', { fontSize: '32px' })
    .setOrigin(0.5, 0.5)
    .setDepth(d + 0.01);
}

/** Cakey Castle — castle silhouette with battlement crenellations
 *  on the top edge. The pink theme color reads as fairy-tale tower
 *  walls. */
export function drawCakeyCastle(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const right = opts.x + opts.w - 4;
  const top = opts.y + 4;
  const bottom = opts.y + opts.h - 4;
  const d = opts.depth;

  const g = scene.add.graphics().setDepth(d);
  g.fillStyle(opts.themeColor, 0.95);

  // Castle silhouette walks the top edge with crenellations — a series
  // of up/down notches like a battlement parapet.
  g.beginPath();
  g.moveTo(left, bottom);
  g.lineTo(left, top + 24);
  // 6 crenellations evenly spaced
  const crenW = (right - left) / 7;
  let x = left;
  for (let i = 0; i < 6; i++) {
    g.lineTo(x + crenW * 0.5, top + 24);
    g.lineTo(x + crenW * 0.5, top + 8);
    g.lineTo(x + crenW * 1.0, top + 8);
    g.lineTo(x + crenW * 1.0, top + 24);
    x += crenW;
  }
  g.lineTo(right, top + 24);
  g.lineTo(right, bottom);
  g.closePath();
  g.fillPath();
  g.lineStyle(2, CAKE.STRAWBERRY_DEEP, 0.9);
  g.strokePath();

  // Castle gate at center-bottom
  const gateX = (left + right) / 2;
  scene.add
    .rectangle(gateX, bottom - 18, 28, 36, CAKE.CHOCOLATE_DEEP, 1)
    .setDepth(d + 0.01);
  // Arched top of gate
  const arch = scene.add.graphics().setDepth(d + 0.02);
  arch.fillStyle(CAKE.CHOCOLATE_DEEP, 1);
  arch.fillCircle(gateX, bottom - 36, 14);

  // Stone-block accents on the wall
  const stones = scene.add.graphics().setDepth(d + 0.01);
  stones.lineStyle(1, CAKE.STRAWBERRY_DEEP, 0.4);
  for (let row = 0; row < 3; row++) {
    const ly = top + 36 + row * 18;
    stones.lineBetween(left + 6, ly, right - 6, ly);
  }
}

/** Cakey Castle landmark — three towers rising above the silhouette
 *  top edge with conical roofs and tiny flags. */
export function drawCakeyCastleLandmark(scene: Phaser.Scene, opts: RegionDrawOpts): void {
  const left = opts.x + 4;
  const right = opts.x + opts.w - 4;
  const top = opts.y + 4;
  const d = opts.depth + 1;

  const towers: Array<{ x: number; height: number }> = [
    { x: left + (right - left) * 0.22, height: 36 },
    { x: left + (right - left) * 0.50, height: 56 },
    { x: left + (right - left) * 0.78, height: 36 },
  ];

  for (const tower of towers) {
    // Tower body
    scene.add
      .rectangle(tower.x, top - tower.height / 2 + 12, 22, tower.height, CAKE.STRAWBERRY, 1)
      .setStrokeStyle(2, CAKE.STRAWBERRY_DEEP, 1)
      .setDepth(d);
    // Conical roof
    const roof = scene.add.graphics().setDepth(d + 0.01);
    roof.fillStyle(CAKE.STRAWBERRY_DARK, 1);
    roof.beginPath();
    roof.moveTo(tower.x - 14, top - tower.height + 12);
    roof.lineTo(tower.x, top - tower.height - 8);
    roof.lineTo(tower.x + 14, top - tower.height + 12);
    roof.closePath();
    roof.fillPath();
    roof.lineStyle(1, CAKE.STRAWBERRY_DARK, 1);
    roof.strokePath();
    // Flag
    scene.add
      .text(tower.x + 7, top - tower.height - 12, '🚩', { fontSize: '14px' })
      .setOrigin(0.5, 0.5)
      .setDepth(d + 0.02);
  }
}

// ===========================================================================
// REGION DISPATCHER — pick the right shape + landmark drawer per slug.
// Keeps the TownScene loop concise (one call per region instead of a
// switch statement at every render site).
// ===========================================================================

const SHAPE_DRAWERS: Record<string, (scene: Phaser.Scene, opts: RegionDrawOpts) => void> = {
  'town-square':       drawTownSquare,
  'cookie-corner':     drawCookieCorner,
  'library-of-lemon':  drawLibraryOfLemon,
  'frosting-fields':   drawFrostingFields,
  'sprinkle-shore':    drawSprinkleShore,
  'meringue-mountain': drawMeringueMountain,
  'caramel-cove':      drawCaramelCove,
  'cakey-castle':      drawCakeyCastle,
};

const LANDMARK_DRAWERS: Record<string, (scene: Phaser.Scene, opts: RegionDrawOpts) => void> = {
  'town-square':       drawTownSquareLandmark,
  'cookie-corner':     drawCookieCornerLandmark,
  'library-of-lemon':  drawLibraryOfLemonLandmark,
  'frosting-fields':   drawFrostingFieldsLandmark,
  'sprinkle-shore':    drawSprinkleShoreLandmark,
  'meringue-mountain': drawMeringueMountainLandmark,
  'caramel-cove':      drawCaramelCoveLandmark,
  'cakey-castle':      drawCakeyCastleLandmark,
};

/** Resolve the right drawer for a region's slug and run it. Falls back
 *  to a plain rect for unknown slugs (shouldn't happen post-migration
 *  but the catalog could grow). */
export function drawRegionShape(scene: Phaser.Scene, region: Region, opts: RegionDrawOpts): void {
  const drawer = SHAPE_DRAWERS[region.slug];
  if (drawer) {
    drawer(scene, opts);
  } else {
    scene.add
      .rectangle(opts.x + opts.w / 2, opts.y + opts.h / 2, opts.w, opts.h, opts.themeColor, 0.6)
      .setDepth(opts.depth);
  }
}

export function drawRegionLandmark(scene: Phaser.Scene, region: Region, opts: RegionDrawOpts): void {
  const drawer = LANDMARK_DRAWERS[region.slug];
  if (drawer) drawer(scene, opts);
}

// ===========================================================================
// RIBBON BANNERS — Disney-style scrollwork labels for region names and
// the map title.
// ===========================================================================

interface RibbonOpts {
  x: number;
  y: number;
  text: string;
  ribbonKey: 'STRAWBERRY' | 'MINT' | 'AMBER' | 'BLUE' | 'PINK' | 'PURPLE';
  fontSize?: number;
  depth?: number;
}

/** Per-region scroll ribbon. Center rectangle in the chosen ribbon
 *  color with V-notched tails on each end (the classic banner shape).
 *  Text rendered on top in white with a dark stroke for legibility. */
export function drawRibbonBanner(scene: Phaser.Scene, opts: RibbonOpts): void {
  const fontSize = opts.fontSize ?? 14;
  const depth = opts.depth ?? 4;

  // Probe text size first so the ribbon hugs the label width.
  const label = scene.add
    .text(opts.x, opts.y, opts.text, {
      fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#0f172a',
      strokeThickness: 2,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(depth + 0.1);

  const padX = 14;
  const padY = 6;
  const tailW = 10;
  const w = label.width + padX * 2;
  const h = label.height + padY * 2;

  const fillKey = opts.ribbonKey as keyof typeof RIBBON;
  const deepKey = `${opts.ribbonKey}_DEEP` as keyof typeof RIBBON;
  const fill = RIBBON[fillKey] as number;
  const deep = RIBBON[deepKey] as number;

  const ribbon = scene.add.graphics().setDepth(depth);

  // Tail notches behind the main rectangle (deeper shade for shadow).
  ribbon.fillStyle(deep, 1);
  // Left tail
  ribbon.beginPath();
  ribbon.moveTo(opts.x - w / 2 - tailW, opts.y - h / 2);
  ribbon.lineTo(opts.x - w / 2 + 4,    opts.y - h / 2);
  ribbon.lineTo(opts.x - w / 2 + 4,    opts.y + h / 2);
  ribbon.lineTo(opts.x - w / 2 - tailW, opts.y + h / 2);
  ribbon.lineTo(opts.x - w / 2,        opts.y);
  ribbon.closePath();
  ribbon.fillPath();
  // Right tail
  ribbon.beginPath();
  ribbon.moveTo(opts.x + w / 2 + tailW, opts.y - h / 2);
  ribbon.lineTo(opts.x + w / 2 - 4,    opts.y - h / 2);
  ribbon.lineTo(opts.x + w / 2 - 4,    opts.y + h / 2);
  ribbon.lineTo(opts.x + w / 2 + tailW, opts.y + h / 2);
  ribbon.lineTo(opts.x + w / 2,        opts.y);
  ribbon.closePath();
  ribbon.fillPath();

  // Main ribbon body — filled rectangle in the chosen ribbon color.
  ribbon.fillStyle(fill, 1);
  ribbon.fillRoundedRect(opts.x - w / 2, opts.y - h / 2, w, h, 4);
  // Outline for definition.
  ribbon.lineStyle(1.5, deep, 1);
  ribbon.strokeRoundedRect(opts.x - w / 2, opts.y - h / 2, w, h, 4);

  // Ensure the label sits on top of everything ribbon-related.
  label.setDepth(depth + 0.15);
}

/** Map title banner — bigger ribbon for "Gamecakes City" at top center.
 *  Uses strawberry pink with deeper scrollwork ends for the brand
 *  feel. Font is larger and serif-styled. */
export function drawTitleBanner(scene: Phaser.Scene, x: number, y: number): void {
  const text = '🎂 Gamecakes City 🎂';
  const fontSize = 28;

  const label = scene.add
    .text(x, y, text, {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: `${fontSize}px`,
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#7f1d1d',
      strokeThickness: 3,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(11);

  const padX = 24;
  const padY = 12;
  const tailW = 28;
  const w = label.width + padX * 2;
  const h = label.height + padY * 2;

  const fill = RIBBON.STRAWBERRY;
  const deep = RIBBON.STRAWBERRY_DEEP;

  const ribbon = scene.add.graphics().setDepth(10);

  // Tails (shadow shade)
  ribbon.fillStyle(deep, 1);
  // Left
  ribbon.beginPath();
  ribbon.moveTo(x - w / 2 - tailW, y - h / 2 - 4);
  ribbon.lineTo(x - w / 2 + 6,    y - h / 2);
  ribbon.lineTo(x - w / 2 + 6,    y + h / 2);
  ribbon.lineTo(x - w / 2 - tailW, y + h / 2 + 4);
  ribbon.lineTo(x - w / 2 - 4,    y);
  ribbon.closePath();
  ribbon.fillPath();
  // Right
  ribbon.beginPath();
  ribbon.moveTo(x + w / 2 + tailW, y - h / 2 - 4);
  ribbon.lineTo(x + w / 2 - 6,    y - h / 2);
  ribbon.lineTo(x + w / 2 - 6,    y + h / 2);
  ribbon.lineTo(x + w / 2 + tailW, y + h / 2 + 4);
  ribbon.lineTo(x + w / 2 + 4,    y);
  ribbon.closePath();
  ribbon.fillPath();

  // Main body
  ribbon.fillStyle(fill, 1);
  ribbon.fillRoundedRect(x - w / 2, y - h / 2, w, h, 8);
  // Inner scrollwork stripe
  ribbon.fillStyle(CAKE.AMBER, 1);
  ribbon.fillRoundedRect(x - w / 2 + 6, y - h / 2 + 4, w - 12, 3, 1);
  ribbon.fillRoundedRect(x - w / 2 + 6, y + h / 2 - 7, w - 12, 3, 1);
  // Outline
  ribbon.lineStyle(2, deep, 1);
  ribbon.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 8);

  label.setDepth(12);
}

// ===========================================================================
// RIDE CHIPS — Disney-style numbered colored disks beside each game
// building. Region color + sequential 1–10 numbering across the map.
// ===========================================================================

/** Numbered ride chip — small colored disk with a bold number, like
 *  the attraction markers on a Disney park map. Drawn at (x, y) with
 *  the ribbon color matching the region. */
export function drawNumberChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  number: number,
  regionColor: number,
  depth: number,
): void {
  // Outer ring (white halo) so the chip pops on any background.
  scene.add.circle(x, y, 18, 0xffffff, 1).setDepth(depth);
  // Color disc
  scene.add
    .circle(x, y, 15, regionColor, 1)
    .setStrokeStyle(2, CAKE.CHOCOLATE_DEEP, 0.85)
    .setDepth(depth + 0.05);
  // Number text
  scene.add
    .text(x, y, String(number), {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#0f172a',
      strokeThickness: 2,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(depth + 0.1);
}

// ===========================================================================
// WORLD BED — lush green grass base + sky band at top. Replaces the
// flat sky-blue background with the Disneyland-Paris green park bed.
// ===========================================================================

/** World background — sky band on top 30%, grass band on bottom 70%.
 *  Both span the full world width. Trees and clouds layer on top via
 *  drawScenery in TownScene. */
export function drawWorldBed(scene: Phaser.Scene, worldW: number, worldH: number): void {
  const skyH = Math.floor(worldH * 0.3);
  const grassH = worldH - skyH;

  // Sky band — soft cyan/lavender at top fading to mint at horizon.
  scene.add.rectangle(worldW / 2, skyH / 2, worldW, skyH, 0xc7e9ff, 1).setDepth(0);

  // Grass bed — cake-mint LIT covers the lower 70%.
  scene.add.rectangle(worldW / 2, skyH + grassH / 2, worldW, grassH, GRASS.LIT, 1).setDepth(0);

  // Subtle horizon line — slightly darker green band where sky meets
  // grass; reads as a distant tree line without drawing actual trees.
  scene.add.rectangle(worldW / 2, skyH + 2, worldW, 4, GRASS.SHADOW, 0.4).setDepth(0.05);

  // Texture flecks on the grass — small scattered green dots so the
  // ground reads as ground rather than a flat color block.
  const fleck = scene.add.graphics().setDepth(0.1);
  fleck.fillStyle(TREE.CANOPY, 0.3);
  // Deterministic seed so flecks don't reflow on each mount.
  let s = 0xa55_4321;
  const rand = () => {
    s = (s + 0x9e37_79b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0_aaad);
    t ^= t >>> 15;
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 200; i++) {
    const fx = rand() * worldW;
    const fy = skyH + rand() * grassH;
    fleck.fillCircle(fx, fy, 1.5 + rand() * 1.5);
  }
}
