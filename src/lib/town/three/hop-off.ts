// Where a kid lands when they hop off a jet ski. Pure: the engine says what counts
// as open ground, and this finds the closest of it.

export interface Spot {
  x: number;
  y: number;
}

const RING_STEP_PX = 24;
/** Well past the far edge of the sea a ride can reach. */
const SEARCH_MAX_PX = 8000;
/** Points on a ring are no further apart than this. */
const ARC_STEP_PX = 48;
/** How far up the beach from the first open ground, so a kid doesn't stand with
 *  their feet exactly on the line they were stopped by. */
const INLAND_PX = 48;

/** The closest open spot to `from`, or null if there's none in reach. */
export function nearestOpenSpot(from: Spot, isOpen: (x: number, y: number) => boolean): Spot | null {
  if (isOpen(from.x, from.y)) return { x: from.x, y: from.y };
  for (let r = RING_STEP_PX; r <= SEARCH_MAX_PX; r += RING_STEP_PX) {
    const points = Math.ceil((2 * Math.PI * r) / ARC_STEP_PX);
    for (let i = 0; i < points; i += 1) {
      const a = (i / points) * 2 * Math.PI;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      if (!isOpen(from.x + dx * r, from.y + dy * r)) continue;
      const far = r + INLAND_PX;
      return isOpen(from.x + dx * far, from.y + dy * far)
        ? { x: from.x + dx * far, y: from.y + dy * far }
        : { x: from.x + dx * r, y: from.y + dy * r };
    }
  }
  return null;
}
