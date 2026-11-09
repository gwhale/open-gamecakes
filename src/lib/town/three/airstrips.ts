// Where each island's airstrip goes.
//
// The Buttercream Biplane used to be rentable only at the Cakey Garage on Town
// Square, so a kid who had flown out to Chess Island and hopped off had no way
// to fly home but the ferry. Now every island has an airstrip: a runway on open
// grass with a hangar kiosk beside it where the plane can be rented or boarded,
// and a parked plane waiting on the strip. A pilot who hops off over a strip
// glides down onto it.
//
// Pure and THREE-free on purpose, like soccer-pitch.ts and for the same reason:
// the engine needs the footprints long before there is a mesh (to flatten the
// ground under them and keep the tree scatter off), and a placement that can
// drift into the sea with nobody noticing is the bug that module exists to
// kill. Same recipe: search the ISLAND'S OWN BEAN, require every corner on
// grass, keep clear of every land rect and every other reserved footprint, and
// prefer the spot nearest the island's centre so the strip reads as the
// island's field rather than a far shore.

import { allIslands, type SolvedIsland } from '@/lib/town/islands';
import { beanNd, beanShoreDist } from './bean';
import type { RectPx } from './layout';

/** nd past which grass gives way to sand; matches soccer-pitch.ts. */
const GRASS_ND = 0.82;
/** Grass to keep between the strip and every land rect / reserved footprint. */
const CLEAR_PX = 160;
/** The runway, in city px. Long enough for the landing glide to read as a
 *  landing; the short form is tried on islands the full one does not fit. */
export const STRIP_LENGTH_PX = 560;
const STRIP_LENGTH_SHORT_PX = 380;
export const STRIP_WIDTH_PX = 120;
/** Scan resolution across an island's extent. */
const GRID = 28;

export interface Airstrip {
  islandId: string;
  /** Runway centre, city px. */
  center: { x: number; y: number };
  /** 0: the runway runs east-west; Math.PI / 2: north-south. Axis-aligned only,
   *  so every footprint stays an ordinary rect the engine already knows how to
   *  flatten, exclude and test. */
  headingRad: number;
  lengthPx: number;
  widthPx: number;
  /** The runway's footprint. */
  rect: RectPx;
  /** Where the parked plane stands (one end of the runway, nose along it). */
  parkPx: { x: number; y: number };
  /** The hangar kiosk: beside the runway's middle, on the side nearer the
   *  island's centre so it is the first thing a kid walking over meets. */
  kioskPx: { x: number; y: number };
}

function rectOf(c: { x: number; y: number }, w: number, h: number): RectPx {
  return { x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 };
}

function overlapsWithin(a: RectPx, b: RectPx, gap: number): boolean {
  return !(a.x1 + gap < b.x0 || a.x0 - gap > b.x1 || a.y1 + gap < b.y0 || a.y0 - gap > b.y1);
}

/** One strip per island, or none for an island too small to hold even the
 *  short runway on grass. Deterministic: the same world gives the same strips,
 *  which the engine relies on (it computes them once for the flat mask and
 *  trusts the result when it builds the meshes). */
export function pickAirstrips(zoneRects: readonly RectPx[], reserved: readonly RectPx[]): Airstrip[] {
  const out: Airstrip[] = [];
  for (const isle of allIslands()) {
    const strip = pickOne(isle, zoneRects, reserved.concat(out.map((s) => s.rect)));
    if (strip) out.push(strip);
  }
  return out;
}

function pickOne(isle: SolvedIsland, zoneRects: readonly RectPx[], reserved: readonly RectPx[]): Airstrip | null {
  const nd = (x: number, y: number): number =>
    beanNd(isle.center.x, isle.center.y, isle.halfW, isle.halfH, isle.pad, isle.stretch, x, y, isle.cove);

  // The island's extent, sampled from its real shoreline.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < 64; i += 1) {
    const ang = (i / 64) * Math.PI * 2;
    const r = beanShoreDist(isle.halfW, isle.halfH, isle.pad, isle.stretch, ang, isle.cove);
    x0 = Math.min(x0, isle.center.x + Math.cos(ang) * r);
    x1 = Math.max(x1, isle.center.x + Math.cos(ang) * r);
    y0 = Math.min(y0, isle.center.y + Math.sin(ang) * r);
    y1 = Math.max(y1, isle.center.y + Math.sin(ang) * r);
  }

  // Run the strip along the island's longer axis, so it lies with the land.
  const headings: number[] = x1 - x0 >= y1 - y0 ? [0, Math.PI / 2] : [Math.PI / 2, 0];

  for (const lengthPx of [STRIP_LENGTH_PX, STRIP_LENGTH_SHORT_PX]) {
    for (const heading of headings) {
      const w = heading === 0 ? lengthPx : STRIP_WIDTH_PX;
      const h = heading === 0 ? STRIP_WIDTH_PX : lengthPx;
      // Kiosk and parked plane are part of the footprint for clearance.
      const padW = w + (heading === 0 ? 0 : 140);
      const padH = h + (heading === 0 ? 140 : 0);
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (let gx = 0; gx <= GRID; gx += 1) {
        for (let gy = 0; gy <= GRID; gy += 1) {
          const c = { x: x0 + ((x1 - x0) * gx) / GRID, y: y0 + ((y1 - y0) * gy) / GRID };
          const r = rectOf(c, padW, padH);
          if (
            nd(r.x0, r.y0) > GRASS_ND ||
            nd(r.x1, r.y0) > GRASS_ND ||
            nd(r.x0, r.y1) > GRASS_ND ||
            nd(r.x1, r.y1) > GRASS_ND
          )
            continue;
          if (zoneRects.some((z) => overlapsWithin(r, z, CLEAR_PX))) continue;
          if (reserved.some((z) => overlapsWithin(r, z, CLEAR_PX))) continue;
          const d = Math.hypot(c.x - isle.center.x, c.y - isle.center.y);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (!best) continue;
      const rect = rectOf(best, w, h);
      // Kiosk on the side of the strip that faces the island's centre.
      const toCentre = heading === 0 ? Math.sign(isle.center.y - best.y) || 1 : Math.sign(isle.center.x - best.x) || 1;
      const kioskPx =
        heading === 0
          ? { x: best.x, y: best.y + toCentre * (STRIP_WIDTH_PX / 2 + 70) }
          : { x: best.x + toCentre * (STRIP_WIDTH_PX / 2 + 70), y: best.y };
      const parkPx =
        heading === 0 ? { x: best.x - lengthPx * 0.36, y: best.y } : { x: best.x, y: best.y - lengthPx * 0.36 };
      return { islandId: isle.id, center: best, headingRad: heading, lengthPx, widthPx: STRIP_WIDTH_PX, rect, parkPx, kioskPx };
    }
  }
  return null;
}
