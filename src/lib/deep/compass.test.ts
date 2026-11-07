// The compass is the third thing in the deep that has to agree about which way
// the sub is pointing, and the first two both shipped mirrored at some point.
// So none of these assert against a remembered constant: every one starts from
// the submarine's OWN motion integration and asks where it actually ends up.
//
// A compass that is mirrored east-for-west reads perfectly in a screenshot.

import { describe, expect, it } from 'vitest';
import { cardinal, chartCoords, chartPoint, compassDegrees } from './compass';
import { DOMAIN_RADIUS_M } from './types';

/** Where the submarine ends up after driving forward, straight out of
 *  submarine.ts: position.x -= sin(h) * s, position.z -= cos(h) * s. */
const forwardPoint = (heading: number, dist = 100) => ({
  x: -Math.sin(heading) * dist,
  z: -Math.cos(heading) * dist,
});

const RAD = (deg: number) => (deg * Math.PI) / 180;

describe('compassDegrees', () => {
  it('calls heading 0 due north, because that is where the sub drives', () => {
    expect(forwardPoint(0).z).toBeLessThan(0); // -z ...
    expect(chartCoords(forwardPoint(0).x, forwardPoint(0).z).y).toBeGreaterThan(0); // ... is north
    expect(compassDegrees(0)).toBe(0);
    expect(cardinal(compassDegrees(0))).toBe('N');
  });

  it('grows COUNTER-clockwise: heading 90 degrees faces west, not east', () => {
    // The trap this whole file exists for. At h = pi/2 the sub travels -x.
    const p = forwardPoint(Math.PI / 2);
    expect(p.x).toBeLessThan(0);
    expect(compassDegrees(Math.PI / 2)).toBeCloseTo(270);
    expect(cardinal(compassDegrees(Math.PI / 2))).toBe('W');
  });

  it('names every quarter turn by where the sub would actually go', () => {
    // north/south read off Y, east/west off X, both from chartCoords.
    const cases: ReadonlyArray<[number, string, (c: { x: number; y: number }) => boolean]> = [
      [0, 'N', (c) => c.y > 0 && Math.abs(c.x) < 1],
      [Math.PI / 2, 'W', (c) => c.x < 0 && Math.abs(c.y) < 1],
      [Math.PI, 'S', (c) => c.y < 0 && Math.abs(c.x) < 1],
      [-Math.PI / 2, 'E', (c) => c.x > 0 && Math.abs(c.y) < 1],
    ];
    for (const [h, label, wentThatWay] of cases) {
      const p = forwardPoint(h);
      const c = chartCoords(p.x, p.z);
      expect(cardinal(compassDegrees(h)), `heading ${h}`).toBe(label);
      expect(wentThatWay(c), `heading ${h} travelled to ${JSON.stringify(c)}`).toBe(true);
    }
  });

  it('wraps a full turn back onto itself', () => {
    expect(compassDegrees(0)).toBeCloseTo(compassDegrees(Math.PI * 2));
    expect(compassDegrees(-Math.PI / 4)).toBeCloseTo(45);
  });

  it('never returns a negative or >=360 bearing, whatever it is handed', () => {
    for (const h of [-99, -Math.PI * 7, 0, Math.PI * 9, 123.456]) {
      const d = compassDegrees(h);
      expect(d, `heading ${h}`).toBeGreaterThanOrEqual(0);
      expect(d, `heading ${h}`).toBeLessThan(360);
    }
  });
});

describe('cardinal', () => {
  it('snaps to the nearest of the eight points', () => {
    expect(cardinal(0)).toBe('N');
    expect(cardinal(22)).toBe('N');
    expect(cardinal(23)).toBe('NE');
    expect(cardinal(45)).toBe('NE');
    expect(cardinal(90)).toBe('E');
    expect(cardinal(180)).toBe('S');
    expect(cardinal(315)).toBe('NW');
  });

  it('rolls 360 back to N rather than off the end of the array', () => {
    // Math.round(359/45) is 8, which indexes past the last point.
    expect(cardinal(359)).toBe('N');
    expect(cardinal(360)).toBe('N');
    expect(cardinal(-1)).toBe('N');
  });
});

describe('chartCoords', () => {
  it('counts Y northward, so up the chart is up the number line', () => {
    expect(chartCoords(0, -100)).toEqual({ x: 0, y: 100 });
    expect(chartCoords(0, 100)).toEqual({ x: 0, y: -100 });
    expect(chartCoords(217, -356)).toEqual({ x: 217, y: 356 });
  });

  it('gives whole metres — a kid reading a coordinate does not want decimals', () => {
    const c = chartCoords(12.7, -4.2);
    expect(Number.isInteger(c.x)).toBe(true);
    expect(Number.isInteger(c.y)).toBe(true);
  });
});

describe('chartPoint', () => {
  it('puts north at the TOP of the chart (screen y grows downward)', () => {
    expect(chartPoint(0, -DOMAIN_RADIUS_M, 50).cy).toBeCloseTo(-50);
    expect(chartPoint(0, DOMAIN_RADIUS_M, 50).cy).toBeCloseTo(50);
  });

  it('puts east on the RIGHT, matching bearingPhrase right-of-north', () => {
    expect(chartPoint(DOMAIN_RADIUS_M, 0, 50).cx).toBeCloseTo(50);
  });

  it('keeps the whole world inside the chart circle', () => {
    // The domain edge must land ON the rim, not past it, or the sub marker
    // walks outside the drawn circle at the boundary.
    const edge = chartPoint(DOMAIN_RADIUS_M, 0, 50);
    expect(Math.hypot(edge.cx, edge.cy)).toBeCloseTo(50);
  });
});
