// Compass and chart maths for the submarine's instrument panel.
//
// Kept out of the component and next to sonar.ts on purpose: this is the third
// place in the deep that has to agree about which way the submarine is facing,
// and the previous two both had to be pinned by a test before they were right.
// A mirrored axis reads perfectly in review and is only found by a kid steering
// the wrong way.
//
// THE FRAME, once, so nothing has to re-derive it:
//
//   The sub integrates motion as  x -= sin(h) * s,  z -= cos(h) * s
//   (submarine.ts). So at heading 0 it travels toward -z.
//
//   We therefore call -z NORTH. That choice makes heading 0 due north, puts
//   +x on the EAST side (bearingPhrase already establishes right-of-north as
//   +x), and leaves the chart drawable with no flips: screen-up is -z is north.
//
//   One consequence that trips people up: heading grows COUNTER-clockwise.
//   At h = 90° the sub faces -x, which is WEST, not east. Compass degrees are
//   therefore 360 - h, not h.

import { DOMAIN_RADIUS_M } from './types';

/** Heading in radians -> compass degrees, 0 = north, 90 = east. */
export function compassDegrees(heading: number): number {
  return ((((-heading * 180) / Math.PI) % 360) + 360) % 360;
}

const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** The eight-point name for a compass bearing.
 *
 *  Eight and not sixteen: "NNE" is a word a seven-year-old has to decode rather
 *  than read, and the sonar deliberately stopped speaking in compass points for
 *  exactly that reason (see sonar.ts). This label is a thing to LOOK AT next to
 *  a needle, not an instruction to follow. */
export function cardinal(deg: number): string {
  return POINTS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/** Where the sub sits on the chart, in metres, as a kid would write it down.
 *
 *  Reported as X/Y rather than the engine's x/z because the point of putting
 *  numbers on screen is the coordinate plane they will meet in class: Y counts
 *  NORTH, so up the chart is up the number line. Handing a kid a "z" that grows
 *  downward would teach the wrong thing in the name of matching our variable
 *  names. */
export function chartCoords(x: number, z: number): { x: number; y: number } {
  return { x: Math.round(x), y: Math.round(-z) };
}

/** World metres -> a position inside a unit chart circle of the given radius,
 *  centred on the origin. Screen y grows downward, which is what makes north
 *  (-z) come out at the top with no extra flip. */
export function chartPoint(
  x: number,
  z: number,
  radiusPx: number,
): { cx: number; cy: number } {
  const scale = radiusPx / DOMAIN_RADIUS_M;
  return { cx: x * scale, cy: z * scale };
}
