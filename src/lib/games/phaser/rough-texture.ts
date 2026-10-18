// Rough.js → Phaser texture helper.
//
// Phaser doesn't natively render rough.js (which produces SVG paths /
// Canvas drawings with a hand-sketched feel). Bridge: draw rough to an
// offscreen HTMLCanvasElement via rough's canvas backend, then register
// that canvas as a Phaser texture. The texture can be used as a sprite
// or blitted onto the scene like any other asset.
//
// Preserves the "Gamecakes hand-drawn" aesthetic as we port games from
// SVG + rough.js into Phaser scene rendering.

import rough from 'roughjs';

export interface RoughGridOptions {
  rows: number;
  cols: number;
  cell: number;
  /** Outer padding inside the canvas. */
  padding?: number;
  /** Stroke color (any CSS color string). Default: sky-300. */
  stroke?: string;
  strokeWidth?: number;
  /** rough.js roughness (0 = straight, 3 = very wobbly). Default: 1.5. */
  roughness?: number;
  /** Deterministic seed so lines don't change on every restart. */
  seed?: number;
}

/** Build a Phaser texture key unique to the given grid params. Caller
 *  passes this to `scene.textures.exists(key)` to avoid redraws. */
export function roughGridTextureKey(opts: RoughGridOptions): string {
  return `rough-grid-${opts.rows}x${opts.cols}-${opts.cell}-${opts.stroke ?? 'default'}`;
}

/**
 * Render a rough-drawn grid to an HTMLCanvasElement. Pure — no Phaser
 * imports. The caller (inside a scene `create()`) passes the result to
 * `scene.textures.addCanvas(key, canvas)`.
 */
export function drawRoughGrid(opts: RoughGridOptions): HTMLCanvasElement {
  const {
    rows,
    cols,
    cell,
    padding = 0,
    stroke = '#7dd3fc',
    strokeWidth = 2,
    roughness = 1.5,
    seed = 42,
  } = opts;

  const width = cols * cell + padding * 2;
  const height = rows * cell + padding * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const rc = rough.canvas(canvas);
  const drawOpts = { stroke, strokeWidth, roughness, seed };

  // Vertical lines
  for (let c = 0; c <= cols; c++) {
    const x = padding + c * cell;
    rc.line(x, padding, x, padding + rows * cell, drawOpts);
  }
  // Horizontal lines
  for (let r = 0; r <= rows; r++) {
    const y = padding + r * cell;
    rc.line(padding, y, padding + cols * cell, y, drawOpts);
  }

  return canvas;
}

/**
 * Register the rough grid as a Phaser texture if not already cached.
 * Returns the texture key the caller should use when creating the image.
 *
 * Call inside `scene.create()` — needs a live textures manager.
 */
export function ensureRoughGridTexture(
  scene: Phaser.Scene,
  opts: RoughGridOptions,
): string {
  const key = roughGridTextureKey(opts);
  if (scene.textures.exists(key)) return key;
  const canvas = drawRoughGrid(opts);
  scene.textures.addCanvas(key, canvas);
  return key;
}
