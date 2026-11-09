// Keeping things in town from standing on each other.
//
// Pure: positions in city px, no `three`. Each placed thing is a circle, which is
// close enough for "these two visibly overlap", and easy to check across the map.

export interface Footprint {
  id: string;
  x: number;
  y: number;
  /** Radius of what you can see, city px. */
  r: number;
}

/** Footprint radii, city px. Tall things count their full width. */
export const FOOTPRINT_R = {
  /** A game cartridge or shop, from its tap area. */
  booth: 80,
  /** A trampoline's outer ring is 0.94u. */
  trampoline: 62,
  fireworks: 55,
  tree: 45,
  chest: 40,
} as const;

/** Every pair whose circles touch. */
export function findOverlaps(items: readonly Footprint[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r) out.push([a.id, b.id]);
    }
  }
  return out;
}

/** True if a circle at (x, y) touches none of `items`. */
export function isClearOf(x: number, y: number, r: number, items: readonly Footprint[]): boolean {
  return items.every((it) => Math.hypot(it.x - x, it.y - y) >= it.r + r);
}

/** The first accepted point at or around `from`, searching outward in rings, or
 *  null if none within `maxPx`. Same input, same answer. */
export function nearestAccepted(
  from: { x: number; y: number },
  accept: (x: number, y: number) => boolean,
  maxPx = 480,
  stepPx = 40,
): { x: number; y: number } | null {
  if (accept(from.x, from.y)) return { x: from.x, y: from.y };
  for (let radius = stepPx; radius <= maxPx; radius += stepPx) {
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      const x = from.x + Math.cos(a) * radius;
      const y = from.y + Math.sin(a) * radius;
      if (accept(x, y)) return { x, y };
    }
  }
  return null;
}
