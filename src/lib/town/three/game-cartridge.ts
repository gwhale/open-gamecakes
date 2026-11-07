// A game in the town is a cartridge floating over its spot, showing the game.
//
// The shell comes from Blender (art/blender/game-cartridge.py). The label is built
// here because it changes per game: the cover captured from the game itself
// (public/games/covers/<slug>.jpg), with its name in a band underneath. A game with
// no cover (a new game, or a fork that never captured any) keeps a plain label with
// its glyph and name, the same fallback All Games uses.
//
// No runtime `three` import, as elsewhere in the town.

import type * as THREE from 'three';
import type { ThreeNS } from './types';

/** Must match art/blender/game-cartridge.py. */
export const CARTRIDGE = {
  width: 2.3,
  depth: 0.34,
  height: 2.1,
  labelW: 1.86,
  labelH: 1.35,
  labelY: 1.18,
  /** How far the cartridge's foot floats above the ground. */
  floatU: 0.85,
} as const;

const LABEL_PX_W = 512;
const LABEL_PX_H = 372;
const NAME_BAND_PX = 52;

/** The largest font size, stepping down, at which `text` fits `maxW`. */
export function fitFontPx(measure: (px: number) => number, maxW: number, startPx: number, minPx: number): number {
  for (let px = startPx; px > minPx; px -= 2) {
    if (measure(px) <= maxW) return px;
  }
  return minPx;
}

/** A label for one game. Drawn at once with the fallback, then redrawn when the
 *  cover arrives, so nothing waits on a picture to build the town. */
export function makeCartridgeLabel(
  THREE: ThreeNS,
  opts: { slug: string; label: string; glyph: string; color: number; fontFamily: string },
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = LABEL_PX_W;
  canvas.height = LABEL_PX_H;
  const ctx = canvas.getContext('2d')!;
  const picH = LABEL_PX_H - NAME_BAND_PX;
  const hex = `#${opts.color.toString(16).padStart(6, '0')}`;

  const drawName = (): void => {
    ctx.fillStyle = '#fffaf0';
    ctx.fillRect(0, picH, LABEL_PX_W, NAME_BAND_PX);
    ctx.fillStyle = '#2b2118';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const font = (px: number): string => `700 ${px}px ${opts.fontFamily}`;
    const px = fitFontPx((p) => {
      ctx.font = font(p);
      return ctx.measureText(opts.label).width;
    }, LABEL_PX_W - 28, 36, 18);
    ctx.font = font(px);
    ctx.fillText(opts.label, LABEL_PX_W / 2, picH + NAME_BAND_PX / 2 + 2);
  };

  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, LABEL_PX_W, picH);
  ctx.font = '150px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(opts.glyph, LABEL_PX_W / 2, picH / 2 + 10);
  drawName();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const cover = new Image();
  cover.onload = () => {
    // Cover the picture area, cropping any overflow, as object-fit: cover does.
    const scale = Math.max(LABEL_PX_W / cover.naturalWidth, picH / cover.naturalHeight);
    const w = cover.naturalWidth * scale;
    const h = cover.naturalHeight * scale;
    ctx.drawImage(cover, (LABEL_PX_W - w) / 2, (picH - h) / 2, w, h);
    drawName();
    tex.needsUpdate = true;
  };
  cover.src = `/games/covers/${opts.slug}.jpg`;
  return tex;
}
