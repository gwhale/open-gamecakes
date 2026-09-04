// Drawn cupcake avatar for Phaser scenes — the kid's customized
// character (the one they build in the Cakey Store) rendered from
// primitives so any 2D game can put the kid *in* the game as the treat
// they own. No asset pipeline: it reads the same WRAPPER/FROSTING/VARIETY
// tables as the SVG `CupcakeAvatar` and the 3D `town/three/avatar`, so a
// strawberry-wrapped, pink-frosted, cherry-topped cupcake looks the same
// whether it's on the shop preview, walking the 3D town, or flying the
// Flappy Math plane.
//
// Geometry is a direct port of CupcakeAvatar.tsx's 64x80 SVG viewBox,
// re-centered on the container origin (0,0) so callers place it like any
// other critter:
//
//   const cake = drawCupcake(scene, x, y, { config: kidConfig });
//   cake.setSize(32, 32);
//   scene.physics.world.enable(cake);   // caller owns the body
//
// Returns a bare Container (matching drawCakeyPlane / drawSwedishFish) —
// the hosting scene attaches physics + tweens so the swap is purely
// cosmetic and every game keeps its own collider size.

import * as Phaser from 'phaser';
import {
  type CupcakeConfig,
  PLAIN_CUPCAKE,
  WRAPPER_COLORS,
  FROSTING_COLORS,
  VARIETY_TRAITS,
} from '@/lib/cupcake/config';

export interface CupcakeSpriteOpts {
  /** The kid's saved cupcake. Defaults to PLAIN_CUPCAKE so a kid with no
   *  config (or a guest) still renders the free starter cupcake. */
  config?: CupcakeConfig;
  /** Extra scale on top of the variety scale (mini/classic/tall/fancy).
   *  1 = the baseline ~44px-tall cupcake that fits a 32px game body. */
  scale?: number;
  /** Container depth. */
  depth?: number;
}

// The SVG is authored in a 64x80 box with the cupcake centered on x=32
// and its visual mass around y=38 (wrapper base ~70, frosting tip ~18).
// Re-center on the container origin by subtracting that anchor.
const CX = 32;
const CY = 38;
const X = (n: number): number => n - CX;
const Y = (n: number): number => n - CY;

/** '#rrggbb' (config/SVG format) → 0xRRGGBB (Phaser graphics format). */
const toInt = (hex: string): number => parseInt(hex.replace('#', ''), 16);

/**
 * Draw the kid's cupcake character at (x, y). Supports all three Cakey
 * Store bases (cupcake / cakepop / layered), every wrapper + frosting +
 * topping, and the variety silhouette (scale / stacked frosting / foil
 * collar). Colors are pulled from the shared config tables, so unlocking
 * an upgrade in the store changes the in-game character with no game edit.
 */
export function drawCupcake(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts?: CupcakeSpriteOpts,
): Phaser.GameObjects.Container {
  const config = opts?.config ?? PLAIN_CUPCAKE;
  const traits = VARIETY_TRAITS[config.variety];
  const wrapper = WRAPPER_COLORS[config.wrapper];
  const frosting = FROSTING_COLORS[config.frosting];

  const container = scene.add.container(x, y);
  const g = scene.add.graphics();

  if (config.base === 'cupcake') {
    if (traits.collar) drawFoilCollar(g);
    drawPaperWrapper(g, wrapper);
    drawFrostingSwirl(g, frosting, traits.frostingStacks);
    drawTopping(g, config.topping, 0, 0);
  } else if (config.base === 'cakepop') {
    drawCakePop(g, frosting);
    drawTopping(g, config.topping, 0, 8); // nudge onto the ball face
  } else {
    drawLayeredCake(g, wrapper, frosting);
    drawTopping(g, config.topping, 0, 6); // nudge onto the top tier
  }

  container.add(g);
  // Variety scale mirrors the SVG's inner <g scale()>; extra opts.scale
  // lets a scene size the character to its body without touching config.
  container.setScale((opts?.scale ?? 1) * traits.scale);
  if (opts?.depth !== undefined) container.setDepth(opts.depth);
  return container;
}

// ---------------------------------------------------------------------------
// Layer drawers — one per SVG sub-component, same stacking order.
// ---------------------------------------------------------------------------

/** Kraft-paper trapezoid liner + pleat ridges + rim band. */
function drawPaperWrapper(
  g: Phaser.GameObjects.Graphics,
  colors: { paper: string; band: string; ridge: string },
): void {
  const paper = toInt(colors.paper);
  const band = toInt(colors.band);
  const ridge = toInt(colors.ridge);

  // Trapezoid — narrow base, wide top (top edge meets frosting at y=42).
  g.fillStyle(paper, 1);
  g.lineStyle(1, band, 1);
  g.beginPath();
  g.moveTo(X(18), Y(70));
  g.lineTo(X(14), Y(42));
  g.lineTo(X(50), Y(42));
  g.lineTo(X(46), Y(70));
  g.closePath();
  g.fillPath();
  g.strokePath();

  // Pleat ridges.
  g.lineStyle(0.8, ridge, 1);
  strokeSeg(g, 22, 44, 22, 68);
  strokeSeg(g, 32, 44, 32, 69);
  strokeSeg(g, 42, 44, 42, 68);

  // Rim band — darker stripe at the top edge.
  g.fillStyle(band, 1);
  g.fillRect(X(13), Y(40), 38, 3.2);
}

/** Single or stacked soft-serve frosting swirl (three+ lobes). */
function drawFrostingSwirl(
  g: Phaser.GameObjects.Graphics,
  colors: { fill: string; shade: string; highlight: string },
  stacks: 1 | 2,
): void {
  const fill = toInt(colors.fill);
  const shade = toInt(colors.shade);
  const highlight = toInt(colors.highlight);

  fillStrokeEllipse(g, 32, 38, 22, 9, fill, shade);   // base lobe
  fillStrokeEllipse(g, 32, 29, 17, 8, fill, shade);   // mid lobe
  g.fillStyle(highlight, 0.55);
  g.fillEllipse(X(26), Y(27), 10, 4.4);               // front highlight
  fillStrokeEllipse(g, 32, 22, 12, 7, fill, shade);   // top lobe
  if (stacks === 2) {
    fillStrokeEllipse(g, 32, 15, 9, 5.5, fill, shade);
    fillStrokeEllipse(g, 32, 9.5, 6, 4, fill, shade);
  }
}

/** Foil-collar accent (fancy variety) — behind the wrapper. */
function drawFoilCollar(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xfde68a, 1);
  g.lineStyle(0.8, 0xb45309, 1);
  g.fillRect(X(9), Y(38), 46, 6);
  g.strokeRect(X(9), Y(38), 46, 6);
}

/** Cake pop — coated ball on a paper stick; frosting = candy coating. */
function drawCakePop(
  g: Phaser.GameObjects.Graphics,
  colors: { fill: string; shade: string; highlight: string },
): void {
  const fill = toInt(colors.fill);
  const shade = toInt(colors.shade);
  const highlight = toInt(colors.highlight);

  // Stick.
  g.fillStyle(0xe7cfa3, 1);
  g.lineStyle(0.6, 0xb08968, 1);
  g.fillRect(X(30.8), Y(40), 2.4, 34);
  g.strokeRect(X(30.8), Y(40), 2.4, 34);
  // Coated ball.
  fillStrokeCircle(g, 32, 30, 17, fill, shade, 1.3);
  // Shine.
  g.fillStyle(highlight, 0.6);
  g.fillEllipse(X(25), Y(24), 10, 6.8);
}

/** Layered cake — three sponge tiers (wrapper color) + frosting bands. */
function drawLayeredCake(
  g: Phaser.GameObjects.Graphics,
  wrapper: { paper: string; band: string; ridge: string },
  frosting: { fill: string; shade: string; highlight: string },
): void {
  const sponge = toInt(wrapper.paper);
  const spongeEdge = toInt(wrapper.band);
  const icing = toInt(frosting.fill);
  const icingEdge = toInt(frosting.shade);
  const icingHi = toInt(frosting.highlight);

  const tier = (tx: number, ty: number, tw: number, th: number): void => {
    g.fillStyle(sponge, 1);
    g.lineStyle(1, spongeEdge, 1);
    g.fillRoundedRect(X(tx), Y(ty), tw, th, 3);
    g.strokeRoundedRect(X(tx), Y(ty), tw, th, 3);
  };
  const band = (bx: number, by: number, bw: number): void => {
    g.fillStyle(icing, 1);
    g.lineStyle(0.6, icingEdge, 1);
    g.fillRoundedRect(X(bx), Y(by), bw, 5, 2.5);
    g.strokeRoundedRect(X(bx), Y(by), bw, 5, 2.5);
  };

  tier(12, 56, 40, 15);   // bottom
  band(11, 52.5, 42);
  tier(17.5, 42, 29, 13); // middle
  band(16.5, 38.5, 31);
  tier(23, 29, 18, 12);   // top
  // Domed frosting crown.
  fillStrokeEllipse(g, 32, 29, 10.5, 5, icing, icingEdge);
  g.fillStyle(icingHi, 0.6);
  g.fillEllipse(X(28.5), Y(27.5), 6.8, 3.2);
}

/** Topping — branches by kind, anchored near the frosting tip. `ox/oy`
 *  shift it for cakepop/layered bases (SVG uses the same offsets). */
function drawTopping(
  g: Phaser.GameObjects.Graphics,
  kind: CupcakeConfig['topping'],
  ox: number,
  oy: number,
): void {
  if (kind === 'none') return;
  const ax = (n: number): number => X(n + ox);
  const ay = (n: number): number => Y(n + oy);

  if (kind === 'cherry') {
    g.lineStyle(1.4, 0x15803d, 1); // stem
    g.beginPath();
    g.moveTo(ax(32), ay(17));
    g.lineTo(ax(38), ay(9));
    g.strokePath();
    g.fillStyle(0x22c55e, 1); // leaf
    g.fillTriangle(ax(38), ay(9), ax(42), ay(8), ax(41), ay(11));
    fillStrokeCircle(g, 32 + ox, 18 + oy, 4.5, 0xdc2626, 0x7f1d1d, 0.8);
    g.fillStyle(0xfecaca, 0.85);
    g.fillCircle(ax(30), ay(16.5), 1.4);
    return;
  }

  if (kind === 'sprinkles') {
    const dots: ReadonlyArray<[number, number, number]> = [
      [22, 20, 0xfb7185], [28, 17, 0xfbbf24], [34, 20, 0x3b82f6],
      [38, 24, 0xa855f7], [24, 26, 0x22c55e], [32, 14, 0xf9a8d4],
    ];
    for (const [sx, sy, col] of dots) {
      g.fillStyle(col, 1);
      g.fillCircle(ax(sx), ay(sy), 1.3);
    }
    return;
  }

  if (kind === 'candle') {
    g.fillStyle(0xfef3c7, 1); // wax
    g.lineStyle(0.5, 0xca8a04, 1);
    g.fillRect(ax(30.5), ay(9), 3, 11);
    g.strokeRect(ax(30.5), ay(9), 3, 11);
    g.fillStyle(0xfbbf24, 1); // stripe
    g.fillRect(ax(30.5), ay(13), 3, 1.5);
    g.fillStyle(0x1f2937, 1); // wick
    g.fillRect(ax(31.7), ay(6), 0.6, 3);
    g.fillStyle(0xfbbf24, 1); // flame outer
    g.fillEllipse(ax(32), ay(4.5), 4, 6);
    g.fillStyle(0xfef3c7, 1); // flame inner
    g.fillEllipse(ax(32), ay(4.5), 1.8, 3.6);
    return;
  }

  if (kind === 'star') {
    const pts: ReadonlyArray<[number, number]> = [
      [0, -7], [2, -2], [7, -2], [3, 1], [4.5, 6],
      [0, 3], [-4.5, 6], [-3, 1], [-7, -2], [-2, -2],
    ];
    g.fillStyle(0xfbbf24, 1);
    g.lineStyle(0.8, 0xb45309, 1);
    g.beginPath();
    pts.forEach(([dx, dy], i) => {
      const pxv = ax(32 + dx);
      const pyv = ay(14 + dy);
      if (i === 0) g.moveTo(pxv, pyv);
      else g.lineTo(pxv, pyv);
    });
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0xfde68a, 0.7);
    g.fillCircle(ax(32), ay(14), 2);
    return;
  }

  if (kind === 'rainbow') {
    const cx = ax(32);
    const cy = ay(18);
    const arch = (r: number, col: number): void => {
      g.lineStyle(2.5, col, 1);
      g.beginPath();
      // Top semicircle: 180deg -> 360deg sweeps over the top in Phaser's
      // y-down space (270deg = up).
      g.arc(cx, cy, r, Math.PI, Math.PI * 2, false);
      g.strokePath();
    };
    arch(10, 0xfb7185);
    arch(7, 0xfbbf24);
    arch(4, 0x3b82f6);
    // Cloud ends.
    g.fillStyle(0xffffff, 1);
    g.lineStyle(0.6, 0xcbd5e1, 1);
    fillStrokeCircle(g, 32 - 10 + ox, 18 + oy, 2.5, 0xffffff, 0xcbd5e1, 0.6);
    fillStrokeCircle(g, 32 + 10 + ox, 18 + oy, 2.5, 0xffffff, 0xcbd5e1, 0.6);
    return;
  }
}

// ---------------------------------------------------------------------------
// Small graphics helpers (SVG rx/ry → Phaser full width/height).
// ---------------------------------------------------------------------------

function strokeSeg(
  g: Phaser.GameObjects.Graphics,
  x1: number, y1: number, x2: number, y2: number,
): void {
  g.beginPath();
  g.moveTo(X(x1), Y(y1));
  g.lineTo(X(x2), Y(y2));
  g.strokePath();
}

function fillStrokeEllipse(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, rx: number, ry: number,
  fill: number, stroke: number,
): void {
  g.fillStyle(fill, 1);
  g.lineStyle(1, stroke, 1);
  g.fillEllipse(X(cx), Y(cy), rx * 2, ry * 2);
  g.strokeEllipse(X(cx), Y(cy), rx * 2, ry * 2);
}

function fillStrokeCircle(
  g: Phaser.GameObjects.Graphics,
  cx: number, cy: number, r: number,
  fill: number, stroke: number, lineW: number,
): void {
  g.fillStyle(fill, 1);
  g.lineStyle(lineW, stroke, 1);
  g.fillCircle(X(cx), Y(cy), r);
  g.strokeCircle(X(cx), Y(cy), r);
}
