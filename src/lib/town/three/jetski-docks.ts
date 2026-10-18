// Where the jet ski rental docks go, found on the SOLVED map.
//
// Pure: no `three`, no engine. The engine hands in the mainland's shape and the
// things a dock must keep clear of; this returns one dock per pick, each a
// beach point (where the kid stands to rent), a launch point out in the water
// (where the jet ski bobs and the ride starts) and the outward direction.
//
// The opposite of the hidden chests: a rental dock wants to be FOUND. Its score
// is how close it is to a land, so each dock sits on the stretch of coast
// nearest somewhere kids already are. Docks spread round the island (a minimum
// angle apart) so wherever a kid reaches the shore, one is not far.
//
// Kept clear of the ferry docks, the submarine jetty, the bridge and the hidden
// coast chest: a dock beside a ferry is clutter, and a dock beside the chest
// would give the chest away.

export interface Pt {
  x: number;
  y: number;
}

export interface JetskiDock {
  /** On the sand, just inland of the waterline: where the kid stands to rent. */
  beachPx: Pt;
  /** Where the visible waterline crosses the dock. */
  shorePx: Pt;
  /** Out in the water beside the dock's sea end: where the jet ski bobs and
   *  the ride starts. */
  skiPx: Pt;
  /** Unit vector from the beach out to sea. */
  out: Pt;
}

/** The dock model is 3 units long (192 px). It reaches this far inland of the
 *  waterline, so its landward end stands on wet sand ... */
const DOCK_LAND_PX = 60;
/** ... and its sea end this far out. */
const DOCK_SEA_PX = 132;
/** Waterline to the dock model's centre, px, for the engine to place it. */
export const JETSKI_DOCK_CENTRE_PX = (DOCK_SEA_PX - DOCK_LAND_PX) / 2;

export interface DockWorld {
  /** Mainland centre, px. */
  centre: Pt;
  /** Mainland normalised distance: < 1 land, 1 the shoreline. */
  nd(x: number, y: number): number;
  /** The nd where the sea surface meets the beach. The mainland's beach slopes
   *  a long way, so this is well past nd 1 (up to ~280 px out on the real map),
   *  and a dock anchored at nd 1 would end on sand. */
  waterlineNd: number;
  /** True where a jet ski may float (open water, clear of every island). */
  seaOk(x: number, y: number): boolean;
  /** Distance in px to the nearest land a kid plays in. Smaller is better. */
  nearLand(x: number, y: number): number;
  /** Points a dock must stay away from (ferry docks, sub jetty, bridge ends, chests). */
  avoid: readonly Pt[];
}

/** Number of docks round the mainland. */
export const JETSKI_DOCK_COUNT = 3;
/** Rays cast from the centre to find shore candidates. */
const RAYS = 96;
/** How far inland of the waterline the rent point sits, px: the dock's
 *  landward end and a little more, on the sand. */
const BEACH_IN_PX = DOCK_LAND_PX + 40;
/** The ski moors alongside the deck, just short of its sea end, px. */
const SKI_OUT_PX = DOCK_SEA_PX - 20;
/** The jet ski moors alongside the deck, this far to its side, px (the deck
 *  is 1.2 units wide, the ski 0.75). */
const SKI_SIDE_PX = 64;
/** No dock within this of anything in `avoid`, px. */
const AVOID_PX = 420;
/** Docks at least this far apart round the island, radians. */
const MIN_ANGLE = (Math.PI * 2) / JETSKI_DOCK_COUNT * 0.6;

function shoreR(w: DockWorld, ux: number, uy: number): number {
  let lo = 0;
  let hi = 12000;
  for (let it = 0; it < 24; it++) {
    const mid = (lo + hi) / 2;
    if (w.nd(w.centre.x + ux * mid, w.centre.y + uy * mid) < w.waterlineNd) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function pickJetskiDocks(w: DockWorld): JetskiDock[] {
  const cands: Array<JetskiDock & { ang: number; score: number }> = [];
  for (let i = 0; i < RAYS; i++) {
    const ang = (i / RAYS) * Math.PI * 2;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const r = shoreR(w, ux, uy);
    const shore = { x: w.centre.x + ux * r, y: w.centre.y + uy * r };
    const beachPx = { x: shore.x - ux * BEACH_IN_PX, y: shore.y - uy * BEACH_IN_PX };
    // Perpendicular, always to the same side, so every dock moors its ski alike.
    const skiPx = {
      x: shore.x + ux * SKI_OUT_PX - uy * SKI_SIDE_PX,
      y: shore.y + uy * SKI_OUT_PX + ux * SKI_SIDE_PX,
    };
    if (!w.seaOk(skiPx.x, skiPx.y)) continue;
    if (w.avoid.some((a) => Math.hypot(a.x - shore.x, a.y - shore.y) < AVOID_PX)) continue;
    cands.push({ beachPx, shorePx: shore, skiPx, out: { x: ux, y: uy }, ang, score: w.nearLand(beachPx.x, beachPx.y) });
  }
  // Best (nearest a land) first; ties keep ray order, so the result is stable.
  cands.sort((a, b) => a.score - b.score || a.ang - b.ang);
  const picked: typeof cands = [];
  for (const c of cands) {
    if (picked.length >= JETSKI_DOCK_COUNT) break;
    const apart = picked.every((p) => {
      const d = Math.abs(p.ang - c.ang) % (Math.PI * 2);
      return Math.min(d, Math.PI * 2 - d) >= MIN_ANGLE;
    });
    if (apart) picked.push(c);
  }
  return picked.map(({ beachPx, shorePx, skiPx, out }) => ({ beachPx, shorePx, skiPx, out }));
}
