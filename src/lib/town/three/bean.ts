// Shared jelly-bean island field — the SINGLE source of the bean shape, so the
// archipelago layout solver (islands.ts) and the engine's rendered beans use
// provably-identical geometry. That's what makes "no overlap in the solver"
// mean "clear water on screen" by construction. Pure functions: no `three`, no
// town imports — safe to pull into the leaf layout layer without a cycle.

/** Sandy shore ring beyond the play area (px). */
export const BEACH_PX = 80;

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
): { rx: number; ry: number } {
  const wob = 1 + 0.08 * Math.sin(ang * 2 + 0.7) + 0.05 * Math.sin(ang * 3 - 1.2);
  const fat = 1 + 0.2 * Math.cos(ang - 0.3);
  return {
    rx: (halfW * pad * stretch + BEACH_PX) * wob * fat,
    ry: (halfH * pad + BEACH_PX) * wob,
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
): number {
  const ang = Math.atan2(py - cy, px - cx);
  const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch);
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
): number {
  const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch);
  return 1 / Math.hypot(Math.cos(ang) / rx, Math.sin(ang) / ry);
}

/** Auto-fit the pad so every region-rect corner (given RELATIVE to the bean
 *  center, so it's offset-invariant) sits comfortably inland (nd ≤ 0.9). */
export function autoFitPad(
  halfW: number,
  halfH: number,
  stretch: number,
  cornersRel: Array<[number, number]>,
): number {
  const inside = (pad: number): boolean =>
    cornersRel.every(([dx, dy]) => {
      const ang = Math.atan2(dy, dx);
      const { rx, ry } = beanRadii(halfW, halfH, pad, ang, stretch);
      return Math.hypot(dx / rx, dy / ry) <= 0.9;
    });
  let pad = 1.1;
  while (!inside(pad) && pad < 2.4) pad += 0.05;
  return pad;
}
