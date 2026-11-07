// The Sugar Express ring — the centre-line maths, and nothing else.
//
// ZERO imports on purpose (same leaf discipline as bean.ts / race-track.ts).
// Two consumers must agree on this ellipse EXACTLY:
//
//   * engine.ts — flattens a terrain corridor under the rails, keeps the
//                 frosting mountain and the fireworks pad off the ring, and
//                 excludes the ring from the instanced decor scatter. All of
//                 that runs long BEFORE any `three` exists, so the maths cannot
//                 live in the mesh module.
//   * train.ts  — lays the actual rails, sleepers and drives the locomotive.
//
// Those two used to derive the ellipse independently from `mainlandBoundsPx`,
// tied together by nothing but a "MUST match train.ts" comment. That is the
// same trap race-track.ts documents (a mirrored circuit from one vector derived
// twice); with a *fitted* ring it would be far worse, so the fit lives here and
// both callers read the one answer.
//
// COORDINATES: city pixels, like regions/roads/beans. Scene units happen only
// at mesh placement via pxToScene* — never here.

/** An axis-aligned rect in city px. */
export interface TrackRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Centre + radii of the ring, city px. */
export interface TrainRing {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Clearance the fit actually achieved, px. Normally the `padClearPx` asked
   *  for; lower means the mainland got crowded enough that the ring had to
   *  accept a tighter berth to still go AROUND every land. */
  clearPx?: number;
  /** False only in the pathological case where no ellipse at all can avoid the
   *  lands, and the shore-only fallback ring is returned. Anything reading this
   *  as false is looking at a train that drives through a land. */
  clearsLands?: boolean;
}

const TAU = Math.PI * 2;

/** Ring samples per constraint check.
 *
 *  Spacing must stay comfortably UNDER the pad clearance, or the fitter approves
 *  a ring that clips a land between two samples (exactly the bug race-track.ts
 *  hit at 96 samples). This ring is ~20,000px around, so 720 samples ≈ 28px
 *  apart — less than half the 60px clearance, so an intrusion cannot hide. */
const SAMPLES = 720;

/** Ramanujan's approximation — good to ~1e-9 at these eccentricities. Used as
 *  the objective, because "longest ride" is the thing being maximised, not area
 *  (a fat round ring and a long thin one can share an area but not a lap). */
export function ellipseCircumference(rx: number, ry: number): number {
  const h = (rx - ry) ** 2 / (rx + ry) ** 2;
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function distToRect(px: number, py: number, r: TrackRect): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}

/** Does a ring at these radii satisfy every constraint? Exported so the check
 *  script can re-verify the chosen ring at a higher sample density. */
export function trainRingFits(
  o: {
    cx: number;
    cy: number;
    nd: (px: number, py: number) => number;
    pads: TrackRect[];
    railHalfPx: number;
    maxNd: number;
    padClearPx: number;
  },
  rx: number,
  ry: number,
  samples: number = SAMPLES,
): boolean {
  const { cx, cy, nd, pads, railHalfPx, maxNd, padClearPx } = o;
  // The rails, not the centre-line, are what must stay ashore and clear the
  // lands — so both rail edges are tested, plus the centre for the sleepers.
  const offs = [-railHalfPx, 0, railHalfPx];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const off of offs) {
      const x = cx + (rx + off) * ca;
      const y = cy + (ry + off) * sa;
      if (nd(x, y) > maxNd) return false; // out to sea
      for (const p of pads) {
        if (distToRect(x, y, p) < padClearPx) return false; // through a land
      }
    }
  }
  return true;
}

/** Fit the LONGEST ring that stays on the island and runs fully OUTSIDE every
 *  land pad.
 *
 *  Derived from the island's own bean + its real land rects, never hard-coded:
 *  the mainland's extent is a function of how many regions exist and how far the
 *  spread pushes them, so a literal radius silently rots the first time a land
 *  is added. (Race Island learned this the same way — see fitRaceTrack.)
 *
 *  rx and ry are searched INDEPENDENTLY. A single shared scale cannot solve the
 *  mainland: the lands sit on a grid, so clearing the east/west pair wants a
 *  longer rx while the north/south pair caps ry — tie them together and neither
 *  constraint is satisfiable at a useful size.
 *
 *  Maximising rather than taking the first hit matters because `fits` is NOT
 *  monotonic once pads are involved: shrinking the ring can push it INTO a land
 *  instead of away from one.
 */
export function fitTrainRing(o: {
  cx: number;
  cy: number;
  /** Bean half-extents — the search is scaled off these, not off a bbox. */
  halfW: number;
  halfH: number;
  /** Island distance field: <1 inland, 1 at the shoreline, >1 at sea. */
  nd: (px: number, py: number) => number;
  /** Land pads the ring must run around. */
  pads: TrackRect[];
  /** Half the rail bed's width (gauge + sleeper overhang). */
  railHalfPx: number;
  /** How close to the shoreline the rails may get (1 = water's edge). */
  maxNd?: number;
  /** Clear space demanded between the rails and any land. */
  padClearPx?: number;
}): TrainRing {
  const maxNd = o.maxNd ?? 0.95;
  const padClearPx = o.padClearPx ?? 60;
  const cfg = {
    cx: o.cx,
    cy: o.cy,
    nd: o.nd,
    pads: o.pads,
    railHalfPx: o.railHalfPx,
    maxNd,
    padClearPx,
  };

  // Factors run PAST 1.0: the ring is meant to sit outside the lands, and the
  // bean's shoreline is `halfExtent * pad * stretch + beach` — comfortably
  // beyond the half-extents themselves.
  const F_HI = 1.35;
  const F_LO = 0.9;

  let best: TrainRing | null = null;
  let bestLen = 0;
  /** Sweep a factor box, keeping the longest ring that passes. Ordering the
   *  cheap circumference test before the sweep prunes most candidates outright. */
  const sweep = (xHi: number, xLo: number, yHi: number, yLo: number, step: number): void => {
    for (let rxF = xHi; rxF >= xLo - 1e-9; rxF -= step) {
      const rx = o.halfW * rxF;
      for (let ryF = yHi; ryF >= yLo - 1e-9; ryF -= step) {
        const ry = o.halfH * ryF;
        const len = ellipseCircumference(rx, ry);
        if (len <= bestLen) continue; // cheaper than a fits() sweep — test first
        if (!trainRingFits(cfg, rx, ry)) continue;
        bestLen = len;
        best = { cx: o.cx, cy: o.cy, rx, ry };
      }
    }
  };

  // Coarse pass, then refine around the winner. A single 0.01 sweep costs ~75ms
  // on a desktop — several hundred on the tablets the town is built for, paid
  // during town load. Coarse→fine gets the same ring for ~a fifth of the work.
  const COARSE = 0.04;
  const FINE = 0.005;

  /** Solve at one clearance. `payForFullSweep` buys the expensive last-resort
   *  fine grid when the coarse grid comes up empty — worth it once, at the
   *  clearance actually asked for, but not once per relaxation step. */
  const solveAt = (clearPx: number, payForFullSweep: boolean): TrainRing | null => {
    cfg.padClearPx = clearPx;
    best = null;
    bestLen = 0;
    sweep(F_HI, F_LO, F_HI, F_LO, COARSE);
    if (best) {
      const b = best as TrainRing;
      const bx = b.rx / o.halfW;
      const by = b.ry / o.halfH;
      // ±one coarse step around the winner, at fine resolution. `bestLen` carries
      // over, so this can only ever improve on the coarse answer.
      sweep(
        Math.min(F_HI, bx + COARSE),
        Math.max(F_LO, bx - COARSE),
        Math.min(F_HI, by + COARSE),
        Math.max(F_LO, by - COARSE),
        FINE,
      );
    } else if (payForFullSweep) {
      // The coarse grid found nothing. Rather than give up on a ring that a finer
      // grid might still fit, pay for the full sweep — this is the rare case.
      sweep(F_HI, F_LO, F_HI, F_LO, FINE);
    }
    return best;
  };

  // Give up CLEARANCE before giving up on clearing the lands at all: a ring
  // that hugs Caramel Cove is still a railway, whereas the blind shore-only
  // ellipse this used to fall back to drove straight through Sprinkle Shore —
  // the exact inscribed-ellipse bug the fitter was written to kill, reinstated
  // as the error path. The mainland is one land away from needing this:
  // clearance 60 and 80 fit today, 100 does not.
  //
  // The ladder runs on the CHEAP grid first. Paying for the full fine sweep the
  // moment the coarse grid missed (what this used to do) cost ~370ms for a ring
  // a 15ms coarse pass one rung down would have found — 30x the town-load
  // budget to buy a slightly wider berth. Fine grid is now the last resort.
  const LADDER = [1, 0.75, 0.5, 0.25, 0];
  for (const f of LADDER) {
    const clear = padClearPx * f;
    const ring = solveAt(clear, false);
    if (ring) return { ...ring, clearPx: clear, clearsLands: true };
  }
  // Every rung missed on the coarse grid. Now the full sweep earns its keep —
  // at the clearance asked for, then at none. Rare enough to be worth the wait.
  for (const clear of [padClearPx, 0]) {
    const ring = solveAt(clear, true);
    if (ring) return { ...ring, clearPx: clear, clearsLands: true };
  }

  // No ellipse anywhere in the factor box avoids the lands (a pathologically
  // crowded island). Stay ashore and flag it — a ring that grazes a land beats
  // a crash or no railway, but nothing should silently believe it is clear.
  return {
    cx: o.cx,
    cy: o.cy,
    rx: o.halfW * 0.95,
    ry: o.halfH * 0.95,
    clearPx: 0,
    clearsLands: false,
  };
}
