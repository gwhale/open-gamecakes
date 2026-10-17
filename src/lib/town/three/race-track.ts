// Race Island's circuit — the centre-line maths, and nothing else.
//
// ZERO imports on purpose (same leaf discipline as bean.ts). Two very different
// consumers need this geometry and must agree on it exactly:
//
//   * engine.ts  — pushes the ring into `roadSegs` BEFORE the instanced decor
//                  scatter runs, so gumdrops and lollipops don't sprout out of
//                  the tarmac. That happens ~200 lines before the city is built,
//                  which is why the maths cannot live in the mesh module.
//   * race-isle.ts — builds the actual ribbons, kerbs and props from it.
//
// Being import-free also means scripts/race-track-check.mjs can load it straight
// into node and assert the invariants that would otherwise need a WebGL context.
//
// COORDINATES: city pixels, the same space regions/roads/beans use. The mesh
// layer converts to scene units at the boundary via pxToScene* — never here.

/** A point or vector in city-pixel space. */
export interface TrackPt {
  x: number;
  y: number;
}

export interface RaceTrack {
  /** Ellipse centre + radii (city px). */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Half the driveable tarmac width (city px). */
  halfWidthPx: number;
  /** Total lap length (city px). */
  lengthPx: number;
  /** Arc-length-parameterised point. `t` wraps, so t and t+1 are the same spot.
   *  Uniform in DISTANCE, not angle — an ellipse sampled by angle bunches up at
   *  the hairpins, which would make kerb blocks visibly crowd there. */
  pointAt(t: number): TrackPt;
  /** Unit tangent (direction of travel) at `t`. */
  tangentAt(t: number): TrackPt;
  /** Unit vector 90° from the tangent — the ribbon's lateral axis.
   *
   *  ONE definition, used by every consumer. The 3D racer game shipped with a
   *  mirrored track because this vector was derived independently in two places
   *  and the two disagreed about sign; keeping it here means that cannot recur.
   *  Matches the game's corrected convention (tangent × UP in scene space). */
  sideAt(t: number): TrackPt;
  /** A point offset laterally from the centre-line. `u` is in HALF-WIDTHS:
   *  0 = racing line, ±1 = the kerbs. */
  offsetAt(t: number, u: number): TrackPt;
  /** The ring as straight segments — what roadSegs wants. */
  segments(count: number): Array<{ ax: number; ay: number; bx: number; by: number }>;
  /** `t` of the point nearest `p`. Used to line the start/finish up with
   *  wherever the bridge happens to land. */
  nearestT(p: TrackPt): number;
  /** How "straight" the track is at `t`, 0 (hairpin) .. 1 (dead straight).
   *  Drives where kerbs go (turns) versus the sugar shoulder (straights). */
  straightness(t: number): number;
}

const TAU = Math.PI * 2;
/** Arc-length lookup resolution. 720 keeps the worst-case spacing error on this
 *  circuit under half a pixel, which is far below anything visible. */
const LUT_N = 720;

const mod1 = (t: number): number => t - Math.floor(t);

export function makeRaceTrack(o: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  halfWidthPx: number;
}): RaceTrack {
  const { cx, cy, rx, ry, halfWidthPx } = o;

  const ex = (a: number): number => cx + rx * Math.cos(a);
  const ey = (a: number): number => cy + ry * Math.sin(a);

  // Cumulative arc length by angle, so `t` can be inverted to an angle.
  const cum = new Float64Array(LUT_N + 1);
  for (let i = 1; i <= LUT_N; i++) {
    const a0 = ((i - 1) / LUT_N) * TAU;
    const a1 = (i / LUT_N) * TAU;
    cum[i] = cum[i - 1] + Math.hypot(ex(a1) - ex(a0), ey(a1) - ey(a0));
  }
  const lengthPx = cum[LUT_N];

  /** t (by distance) → angle (by parameter). */
  const angleAt = (t: number): number => {
    const target = mod1(t) * lengthPx;
    let lo = 0;
    let hi = LUT_N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= target) lo = mid;
      else hi = mid;
    }
    const span = cum[hi] - cum[lo];
    const f = span > 0 ? (target - cum[lo]) / span : 0;
    return ((lo + f) / LUT_N) * TAU;
  };

  const pointAt = (t: number): TrackPt => {
    const a = angleAt(t);
    return { x: ex(a), y: ey(a) };
  };

  const tangentAt = (t: number): TrackPt => {
    const a = angleAt(t);
    // d/da of the ellipse.
    const dx = -rx * Math.sin(a);
    const dy = ry * Math.cos(a);
    const m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  };

  const sideAt = (t: number): TrackPt => {
    const tan = tangentAt(t);
    // Scene-space equivalent of tangent × UP, expressed in city px (px x → scene
    // x, px y → scene z, both monotonic, so the handedness carries over).
    return { x: -tan.y, y: tan.x };
  };

  const offsetAt = (t: number, u: number): TrackPt => {
    const p = pointAt(t);
    const s = sideAt(t);
    return { x: p.x + s.x * u * halfWidthPx, y: p.y + s.y * u * halfWidthPx };
  };

  const segments = (
    count: number,
  ): Array<{ ax: number; ay: number; bx: number; by: number }> => {
    const out: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
    for (let i = 0; i < count; i++) {
      const a = pointAt(i / count);
      const b = pointAt((i + 1) / count);
      out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    return out;
  };

  const nearestT = (p: TrackPt): number => {
    let bestT = 0;
    let bestD = Infinity;
    for (let i = 0; i < LUT_N; i++) {
      const t = i / LUT_N;
      const q = pointAt(t);
      const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        bestT = t;
      }
    }
    return bestT;
  };

  const straightness = (t: number): number => {
    // |cos(angle)| is 1 on the long straights (a = 0, π) and 0 at the hairpins
    // (a = ±π/2) for a wide ellipse. Cheap and exactly the split we want.
    return Math.abs(Math.cos(angleAt(t)));
  };

  return {
    cx, cy, rx, ry, halfWidthPx, lengthPx,
    pointAt, tangentAt, sideAt, offsetAt, segments, nearestT, straightness,
  };
}

/** Axis-aligned rect in city px (mirrors layout.RectPx without importing it —
 *  this module must stay leaf-level). */
export interface TrackRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const distToRect = (p: TrackPt, r: TrackRect): number => {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
  const dy = Math.max(r.y0 - p.y, 0, p.y - r.y1);
  return Math.hypot(dx, dy);
};

/** Fit the largest circuit that still fits the island.
 *
 *  DERIVED, not hard-coded. Race Island has already been resized once (#217
 *  gave it +25% land via per-island knobs) and a literal `rx = 2000` would have
 *  silently drifted off the coast when that landed. This re-solves from whatever
 *  the island currently is.
 *
 *  Two constraints, both sampled around the ring:
 *    * the tarmac stays on land — `nd` at the OUTER edge must not exceed
 *      `maxNd` (1.0 is the waterline; 0.97 keeps the kerb on dry sand);
 *    * the tarmac clears the land pads by `padClearPx`, so the circuit runs
 *      around Pit Row and Victory Lane rather than through them.
 */
export function fitRaceTrack(o: {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
  halfWidthPx: number;
  /** Island distance field: <1 inland, 1 at the shoreline, >1 at sea. */
  nd: (px: number, py: number) => number;
  /** Land pads the circuit must run around. */
  pads: TrackRect[];
  maxNd?: number;
  padClearPx?: number;
}): RaceTrack {
  const { cx, cy, halfW, halfH, halfWidthPx, nd, pads } = o;
  const maxNd = o.maxNd ?? 0.97;
  const padClear = o.padClearPx ?? 60;
  /** Ring samples per constraint check.
   *
   *  Must be FINER than anything that later verifies the result, or the fitter
   *  approves a circuit that a denser check rejects — at 96 this accepted a ring
   *  clipping a land pad between two samples. At 360 the spacing is ~20px on
   *  this circuit, well under the 60px clearance margin, so an intrusion can no
   *  longer hide between samples. */
  const SAMPLES = 360;

  const fits = (rx: number, ry: number): boolean => {
    const t = makeRaceTrack({ cx, cy, rx, ry, halfWidthPx });
    for (let i = 0; i < SAMPLES; i++) {
      const u = i / SAMPLES;
      // Outer edge is what has to stay ashore, not the centre-line.
      for (const edge of [-1, 1]) {
        const p = t.offsetAt(u, edge);
        if (nd(p.x, p.y) > maxNd) return false;
      }
      const c = t.pointAt(u);
      for (const pad of pads) {
        if (distToRect(c, pad) < halfWidthPx + padClear) return false;
      }
    }
    return true;
  };

  // Search rx and ry INDEPENDENTLY, and keep the largest ring that passes.
  //
  // A single shared scale cannot solve this island. The shoreline caps ry hard
  // (the island is ~4x wider than it is tall, so the short axis hits the water
  // first), while pad clearance wants the ring to bulge OUT past the pads —
  // which needs a longer rx, not a smaller ellipse. Tying them together makes
  // the two constraints unsatisfiable and drops you into the fallback.
  //
  // Maximising area rather than taking the first hit matters for the same
  // reason: `fits` is not monotonic once pads are involved, because shrinking
  // the ring can push it INTO a pad instead of away from one.
  let best: { rx: number; ry: number } | null = null;
  let bestArea = 0;
  for (let i = 0; i <= 14; i++) {
    const fx = 0.98 - i * 0.04;
    for (let j = 0; j <= 14; j++) {
      const fy = 0.98 - j * 0.04;
      const rx = halfW * fx;
      const ry = halfH * fy;
      const area = rx * ry;
      if (area <= bestArea) continue; // cheaper than fits(), so test it first
      if (!fits(rx, ry)) continue;
      bestArea = area;
      best = { rx, ry };
    }
  }
  // Nothing fits (a pathologically small island): fall back to a ring that at
  // least stays ashore, and let the pad overlap go — an ugly circuit is far
  // better than a crash or an invisible one.
  const fallback = { rx: halfW * 0.6, ry: halfH * 0.6 };
  const chosen = best ?? fallback;
  return makeRaceTrack({ cx, cy, rx: chosen.rx, ry: chosen.ry, halfWidthPx });
}
