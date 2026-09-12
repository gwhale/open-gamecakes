// A six-year-old dived this and reported that "163m southeast" meant nothing
// to him. He was right, and these pin the replacement.
//
// Left/right is exactly the kind of maths that ships mirrored and passes review
// — the phrasing reads fine either way, and only a kid steering the wrong way
// finds out. So the sub's own motion integration is repeated here as the source
// of truth for which way "forward" is.

import { describe, expect, it } from 'vitest';
import { bearingPhrase } from './sonar';

/** Where the submarine ends up after moving forward, straight out of
 *  submarine.ts: position.x -= sin(h) * s, position.z -= cos(h) * s. */
const forwardPoint = (heading: number, dist = 100) => ({
  x: -Math.sin(heading) * dist,
  z: -Math.cos(heading) * dist,
});

const ORIGIN = { x: 0, z: 0 };

describe('bearingPhrase', () => {
  it('calls the direction the sub is actually travelling "straight ahead"', () => {
    // Whatever the heading, the place the sub would REACH by driving forward
    // has to read as ahead. This is the assertion that catches a mirrored axis.
    for (const h of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.4]) {
      expect(bearingPhrase(ORIGIN, forwardPoint(h), h), `heading ${h}`).toBe('straight ahead');
    }
  });

  it('calls the opposite direction "right behind you"', () => {
    for (const h of [0, Math.PI / 2, Math.PI, 2.4]) {
      const back = forwardPoint(h, -100);
      expect(bearingPhrase(ORIGIN, back, h), `heading ${h}`).toBe('right behind you');
    }
  });

  it('puts a contact off the starboard beam on the RIGHT', () => {
    // Facing -z (heading 0), right is +x. Established by forward x up.
    expect(bearingPhrase(ORIGIN, { x: 100, z: 0 }, 0)).toBe('to your right');
    expect(bearingPhrase(ORIGIN, { x: -100, z: 0 }, 0)).toBe('to your left');
  });

  it('keeps left and right correct after the sub turns around', () => {
    // Facing +z (heading pi), the world flips: +x is now on the left.
    expect(bearingPhrase(ORIGIN, { x: 100, z: 0 }, Math.PI)).toBe('to your left');
    expect(bearingPhrase(ORIGIN, { x: -100, z: 0 }, Math.PI)).toBe('to your right');
  });

  it('distinguishes a slight turn from a beam contact from something behind', () => {
    const at = (deg: number) => {
      const r = (deg * Math.PI) / 180;
      // Rotate the forward vector (heading 0 => -z) by `deg` toward +x.
      return { x: Math.sin(r) * 100, z: -Math.cos(r) * 100 };
    };
    expect(bearingPhrase(ORIGIN, at(10), 0)).toBe('straight ahead');
    expect(bearingPhrase(ORIGIN, at(45), 0)).toBe('ahead, a bit to your right');
    expect(bearingPhrase(ORIGIN, at(90), 0)).toBe('to your right');
    expect(bearingPhrase(ORIGIN, at(135), 0)).toBe('behind you, to your right');
    expect(bearingPhrase(ORIGIN, at(-45), 0)).toBe('ahead, a bit to your left');
  });

  it('never says a compass direction', () => {
    // The whole point. If one of these words comes back, the change regressed.
    const banned = /north|south|east|west/i;
    for (let deg = 0; deg < 360; deg += 7) {
      const r = (deg * Math.PI) / 180;
      const p = { x: Math.sin(r) * 80, z: -Math.cos(r) * 80 };
      for (const h of [0, 1.1, Math.PI, -2.2]) {
        expect(bearingPhrase(ORIGIN, p, h)).not.toMatch(banned);
      }
    }
  });

  it('handles a contact on top of the sub without dividing by zero', () => {
    expect(bearingPhrase(ORIGIN, { x: 0, z: 0 }, 1)).toBe('right here');
  });
});
