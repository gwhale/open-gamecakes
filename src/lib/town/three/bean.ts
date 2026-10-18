// Shared jelly-bean island field — the SINGLE source of the bean shape, so the
// archipelago layout solver (islands.ts) and the engine's rendered beans use
// provably-identical geometry. That's what makes "no overlap in the solver"
// mean "clear water on screen" by construction. Pure functions: no `three`, no
// town imports — safe to pull into the leaf layout layer without a cycle.

/** Sandy shore ring beyond the play area (px). */
export const BEACH_PX = 80;

/** An inlet bitten out of a bean's coastline — a cove.
 *
 *  The bean is otherwise a convex wobble, which is why every shoreline in this
 *  town reads as a beach: there is nowhere for water to be surrounded by land.
 *  A cove is that missing shape, and it is one local inward pinch rather than a
 *  second silhouette system.
 *
 *  IT MUST BE APPLIED EVERYWHERE OR NOWHERE. This is the same contract the file
 *  header states: the solver spaces islands with beanShoreDist, the engine
 *  paints land with beanNd, and the terrain bake decides where a kid may walk
 *  with the same value. A cove passed to one and not another is a bay you can
 *  see and stand in, or one you can swim through and not see. It rides on the
 *  SolvedIsland so every consumer picks it up from the island it already holds,
 *  rather than each call site remembering. */
export interface CoveSpec {
  /** Bearing of the inlet from the bean centre, radians. DERIVED from the
   *  cove region's solved position — never a literal, for the same reason the
   *  engine derives its ferry ellipse from the bean instead of hard-coding a
   *  radius: a number typed here silently drifts off the coast the first time
   *  the layout moves. */
  ang: number;
  /** Angular half-width of the mouth, radians. How wide the bay opens. */
  halfWidth: number;
  /** How far it bites in, as a fraction of the local radius. 0.15 = the
   *  shoreline comes 15% closer to the centre at the mouth's midline. */
  depth: number;
  /** How far the two HEADLANDS push back out, same units.
   *
   *  These are what make it a bay rather than a dent, and the first cut did not
   *  have them. A cove is water with LAND ON BOTH SIDES of it; a lone inward
   *  pinch is only a bay if the coast around it stays put. This coast does not
   *  -- the mainland's own radius already falls from ~5500px to ~3100px across
   *  the arc the cove sits on, so a 600px bite on that slope just made an
   *  already-curving shoreline curve slightly harder. It measured correctly and
   *  read as nothing.
   *
   *  Pushing the shoulders OUT creates the two local maxima the eye needs. It
   *  is also free: a bigger radius can never put land in the sea, so autoFitPad
   *  has nothing to re-fit -- unlike depth, which it caps hard. */
  headland: number;
}

/** Signed angular difference, wrapped to (-PI, PI]. Without the wrap a cove
 *  authored near ±PI would bite the far side of the island instead. */
function angDelta(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** How much the coastline is pulled in at `ang`, as a 0..depth fraction.
 *  Gaussian rather than a cosine lobe so the bite is LOCAL: it falls to
 *  nothing well before the opposite coast, which a cosine never does. */
function coveBite(cove: CoveSpec | undefined, ang: number): number {
  if (!cove) return 0;
  const off = angDelta(ang, cove.ang);
  const d = off / cove.halfWidth;
  const inward = cove.depth * Math.exp(-(d * d));
  // Two headlands, one either side of the mouth, at 1.9 mouth-widths out --
  // far enough that they flank the bay instead of filling it in. Narrower than
  // the mouth (0.75x) so they read as points of land, not as swelling.
  const arm = 1.9 * cove.halfWidth;
  const w = 0.75 * cove.halfWidth;
  const l = (off - arm) / w;
  const r = (off + arm) / w;
  const out = cove.headland * (Math.exp(-(l * l)) + Math.exp(-(r * r)));
  // Positive = pulled in, negative = pushed out.
  return inward - out;
}

/** Per-angle ellipse radii for a bean of the given half-extents + auto-fit pad.
 *  `stretch` elongates the x radius: a jelly-bean look for small offshore islands
 *  (~1.3); near-round (~1.05) for the big mainland, whose silhouette is already
 *  irregular and which a 1.3× stretch would balloon out to sea. */
export function beanRadii(
  halfW: number,
  halfH: number,
  pad: number,
  ang: number,
  stretch: number,
  cove?: CoveSpec,
): { rx: number; ry: number } {
  const wob = 1 + 0.08 * Math.sin(ang * 2 + 0.7) + 0.05 * Math.sin(ang * 3 - 1.2);
  const fat = 1 + 0.2 * Math.cos(ang - 0.3);
  // Scales BOTH radii so the bite is a dent in the outline rather than a
  // squash of the whole ellipse.
  const bite = 1 - coveBite(cove, ang);
  return {
    rx: (halfW * pad * stretch + BEACH_PX) * wob * fat * bite,
    ry: (halfH * pad + BEACH_PX) * wob * bite,
  };
}

/** Normalized distance at (px,py) for a bean centered at (cx,cy): ~0 at center,
 *  1 at the shoreline, >1 out to sea. */
export function beanNd(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  pad: number,
  stretch: number,
  px: number,
  py: number,
  cove?: CoveSpec,
): number {
  const ang = Math.atan2(py - cy, px - cx);
  const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch, cove);
  return Math.hypot((px - cx) / rx, (py - cy) / ry);
}

/** Shoreline radius (where nd=1) in direction `ang` from the bean center. The
 *  layout solver spaces islands using exactly this — the same value the engine's
 *  bean renders as its coastline. */
export function beanShoreDist(
  halfW: number,
  halfH: number,
  pad: number,
  stretch: number,
  ang: number,
  cove?: CoveSpec,
): number {
  const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch, cove);
  return 1 / Math.hypot(Math.cos(ang) / rx, Math.sin(ang) / ry);
}

/** Auto-fit the pad so every region-rect corner (given RELATIVE to the bean
 *  center, so it's offset-invariant) sits comfortably inland (nd ≤ 0.9).
 *
 *  The cove is passed in on purpose. Fitting against the UNCARVED bean would
 *  pass a corner the carve then puts in the sea, and the first sign of it would
 *  be a booth standing in open water. Fitting against the carved one instead
 *  grows the pad until the bay is affordable — so an over-deep cove shows up as
 *  a bigger island, which is visible, rather than as drowned land, which is not. */
export function autoFitPad(
  halfW: number,
  halfH: number,
  stretch: number,
  cornersRel: Array<[number, number]>,
  cove?: CoveSpec,
): number {
  const inside = (pad: number): boolean =>
    cornersRel.every(([dx, dy]) => {
      const ang = Math.atan2(dy, dx);
      const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch, cove);
      return Math.hypot(dx / rx, dy / ry) <= 0.9;
    });
  let pad = 1.1;
  while (!inside(pad) && pad < 2.4) pad += 0.05;
  return pad;
}
