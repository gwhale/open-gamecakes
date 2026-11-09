// Musical Planets — the flat things in the 3D scene: music glyphs and labels,
// drawn on canvases and used as textures.
//
// Sharps and flats are drawn as strokes, not font glyphs, for the reason the
// old SVG staff gave: a glyph's baseline shifts from font to font, and a flat
// half a space off its line is a different note. The strokes are the SVG
// staff's, in its units, where one staff step is 6 px; GLYPH_PX canvas pixels
// stand for one of those units, and one scene unit is 24 of them (a staff step
// is 0.25 units).
//
// The treble clef is the one font glyph (Noto Music), because drawing a G clef
// by hand would be worse than any font's.
//
// No runtime `three` import; the namespace is passed in.

import type * as THREE_T from 'three';

type ThreeNS = typeof THREE_T;

/** Canvas pixels per SVG-staff unit. */
const GLYPH_PX = 8;
/** SVG-staff units per scene unit. */
export const SVG_PER_UNIT = 24;

export interface Flat2D {
  tex: THREE_T.CanvasTexture;
  /** Size in scene units. */
  w: number;
  h: number;
}

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function texOf(THREE: ThreeNS, c: HTMLCanvasElement): THREE_T.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A sharp or a flat, centred on the line or space it marks. 16 × 32 SVG
 *  units, so 0.67 × 1.33 scene units. */
export function accidentalTex(THREE: ThreeNS, acc: 1 | -1, color: string): Flat2D {
  const W = 16;
  const H = 32;
  const { c, g } = canvas(W * GLYPH_PX, H * GLYPH_PX);
  g.scale(GLYPH_PX, GLYPH_PX);
  g.strokeStyle = color;
  g.lineCap = 'round';
  const x = W / 2;
  const y = H / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, w: number): void => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  if (acc === 1) {
    line(x - 2.6, y - 11, x - 2.6, y + 12.5, 1.7);
    line(x + 2.6, y - 12.5, x + 2.6, y + 11, 1.7);
    line(x - 5.5, y - 2.2, x + 5.5, y - 5.2, 3.2);
    line(x - 5.5, y + 5.2, x + 5.5, y + 2.2, 3.2);
  } else {
    line(x - 3, y - 16 + 1, x - 3, y + 5, 1.7);
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(x - 3, y + 5);
    g.bezierCurveTo(x + 7, y, x + 6, y - 7, x - 3, y - 2.5);
    g.stroke();
  }
  return { tex: texOf(THREE, c), w: W / SVG_PER_UNIT, h: H / SVG_PER_UNIT };
}

/** The G clef. The returned plane is centred so that `gLineY` (scene units
 *  above the plane's centre) is where the curl wraps the G line. */
export function clefTex(THREE: ThreeNS, fontFamily: string, color: string): Flat2D & { gLineY: number } {
  const PX = 128; // canvas px per scene unit
  const W = 2.2;
  const H = 5;
  const { c, g } = canvas(W * PX, H * PX);
  // The old SVG drew the clef at 74 SVG units (3.08 scene units) with its
  // baseline half a unit under the G line.
  const size = (74 / SVG_PER_UNIT) * PX;
  const gLine = 3 * PX; // canvas y of the G line: room above for the clef's top
  g.fillStyle = color;
  g.font = `${size}px ${fontFamily}`;
  g.textBaseline = 'alphabetic';
  g.fillText('\u{1D11E}', 0.1 * PX, gLine + (0.5 / SVG_PER_UNIT) * PX);
  return { tex: texOf(THREE, c), w: W, h: H, gLineY: H / 2 - gLine / PX };
}

export interface LabelOpts {
  /** Text lines, top to bottom; the first is big. */
  lines: string[];
  fg?: string;
  bg?: string | null;
  /** Coloured dot above the text (a piano key in the scale). */
  dot?: string | null;
  fontFamily: string;
  /** Canvas size, px. */
  w?: number;
  h?: number;
  big?: number;
  small?: number;
}

/** A rounded label: a pill background (optional), a dot (optional), a big
 *  first line and smaller lines under it. */
export function labelCanvas(o: LabelOpts): HTMLCanvasElement {
  const w = o.w ?? 256;
  const h = o.h ?? 128;
  const { c, g } = canvas(w, h);
  if (o.bg) {
    g.fillStyle = o.bg;
    const r = Math.min(h / 2, 40);
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, r);
    g.fill();
  }
  let y = h / 2;
  const big = o.big ?? 64;
  const small = o.small ?? Math.round(big * 0.55);
  const total = (o.dot ? 30 : 0) + big + (o.lines.length - 1) * (small + 6);
  y = (h - total) / 2;
  if (o.dot) {
    g.fillStyle = o.dot;
    g.beginPath();
    g.arc(w / 2, y + 11, 11, 0, Math.PI * 2);
    g.fill();
    y += 30;
  }
  g.fillStyle = o.fg ?? '#18181b';
  g.textAlign = 'center';
  g.textBaseline = 'top';
  o.lines.forEach((line, i) => {
    const s = i === 0 ? big : small;
    g.font = `800 ${s}px ${o.fontFamily}`;
    g.fillText(line, w / 2, y);
    y += s + 6;
  });
  return c;
}

export function labelTex(THREE: ThreeNS, o: LabelOpts): THREE_T.CanvasTexture {
  return texOf(THREE, labelCanvas(o));
}

/** A round candy bubble with text in it: the tune mission's answer choices. */
export function bubbleTex(THREE: ThreeNS, text: string, color: string, fontFamily: string): THREE_T.CanvasTexture {
  const { c, g } = canvas(192, 192);
  const grad = g.createRadialGradient(76, 70, 10, 96, 96, 92);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.beginPath();
  g.arc(96, 96, 86, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#ffffff';
  g.stroke();
  g.fillStyle = '#18181b';
  g.font = `900 78px ${fontFamily}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 96, 102);
  return texOf(THREE, c);
}

/** A soft round dot with a hard core: the sparkle used for stars and the
 *  confetti, so a point reads round instead of square. */
export function sparkTex(THREE: ThreeNS): THREE_T.CanvasTexture {
  const { c, g } = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return texOf(THREE, c);
}

/** The night behind everything: a tall gradient from deep blueberry to a
 *  strawberry glow at the horizon. */
export function skyTex(THREE: ThreeNS): THREE_T.CanvasTexture {
  const { c, g } = canvas(4, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#140c33');
  grad.addColorStop(0.45, '#2c1a5c');
  grad.addColorStop(0.8, '#5b2a7a');
  grad.addColorStop(1, '#8a3b78');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 512);
  return texOf(THREE, c);
}

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** The glassy panel behind the staff: a rounded rectangle `w` × `h` scene
 *  units, drawn at that aspect so its corners stay round. */
export function panelTex(THREE: ThreeNS, w: number, h: number): THREE_T.CanvasTexture {
  const PX = 48;
  const { c, g } = canvas(Math.round(w * PX), Math.round(h * PX));
  const r = 0.55 * PX;
  g.fillStyle = 'rgba(20, 12, 51, 0.55)';
  g.beginPath();
  g.roundRect(3, 3, c.width - 6, c.height - 6, r);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(255, 244, 226, 0.35)';
  g.stroke();
  return texOf(THREE, c);
}
