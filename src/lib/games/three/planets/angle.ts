// Where planet i sits on the circle: 0 at the top, clockwise. layout.ts turns
// this into world positions; the rocket's flight and the lit arc use it too.
export function planetAngle(i: number, n = 12): number {
  return Math.PI / 2 - (i / n) * Math.PI * 2;
}
