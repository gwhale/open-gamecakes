// Cakey keeps a kid company when they are near him.
//
// "Make Cakey lightly follow the user when nearby in case they need
// something" (2026-11-07). Lightly means three things, each a number here:
//   - only when the kid is already near (CAKEY_FOLLOW_PX); a kid across the
//     island still meets him wandering, as before;
//   - he stands BESIDE the kid (CAKEY_FOLLOW_GAP_PX), never on top of them,
//     and does not move again for every small step (the slack);
//   - he is always slower than the kid (WALK_SPEED_PX = 220), so a kid who
//     walks off on purpose leaves him behind, and he goes back to wandering.

type Pt = { x: number; y: number };

/** Kid within this of Cakey (px): he follows. Beyond it he wanders. */
export const CAKEY_FOLLOW_PX = 380;
/** Where he stops: this far from the kid, on his own side of them (px). */
export const CAKEY_FOLLOW_GAP_PX = 110;
/** He stays put until the kid is this much further than the gap (px). */
export const CAKEY_FOLLOW_SLACK_PX = 50;
/** His follow speed, from his amble near the kid to a brisk walk at the edge
 *  of follow range. Both under the kid's 220. */
export const CAKEY_FOLLOW_SPEED_MIN_PX = 95;
export const CAKEY_FOLLOW_SPEED_MAX_PX = 165;

/** Where Cakey should walk to keep the kid company, or null if he is close
 *  enough already (or the kid is out of range). The spot is on the line from
 *  the kid to Cakey, so he walks up to them and stops alongside rather than
 *  walking through them. */
export function cakeyFollowSpot(kid: Pt, cakey: Pt): Pt | null {
  const dx = cakey.x - kid.x;
  const dy = cakey.y - kid.y;
  const d = Math.hypot(dx, dy);
  if (d >= CAKEY_FOLLOW_PX) return null;
  if (d <= CAKEY_FOLLOW_GAP_PX + CAKEY_FOLLOW_SLACK_PX) return null;
  return {
    x: kid.x + (dx / d) * CAKEY_FOLLOW_GAP_PX,
    y: kid.y + (dy / d) * CAKEY_FOLLOW_GAP_PX,
  };
}

/** How fast he follows (px/s): quicker the further behind he is. */
export function cakeyFollowSpeed(distToKid: number): number {
  const lo = CAKEY_FOLLOW_GAP_PX + CAKEY_FOLLOW_SLACK_PX;
  const t = Math.max(0, Math.min(1, (distToKid - lo) / (CAKEY_FOLLOW_PX - lo)));
  return CAKEY_FOLLOW_SPEED_MIN_PX + t * (CAKEY_FOLLOW_SPEED_MAX_PX - CAKEY_FOLLOW_SPEED_MIN_PX);
}
