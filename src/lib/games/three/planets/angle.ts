// Where planet i sits on the circle. Shared by the 3D engine and the flat
// fallback so the two layouts can never disagree. 0 at the top, clockwise.
export function planetAngle(i: number, n = 12): number {
  return Math.PI / 2 - (i / n) * Math.PI * 2;
}
