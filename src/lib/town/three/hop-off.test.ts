import { describe, expect, it } from 'vitest';
import { nearestOpenSpot } from './hop-off';

const disc = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x - cx, y - cy) <= r;

describe('nearestOpenSpot', () => {
  it('stays put on open ground', () => {
    expect(nearestOpenSpot({ x: 5, y: 5 }, disc(0, 0, 100))).toEqual({ x: 5, y: 5 });
  });

  it('picks the closer of two islands, not the bigger', () => {
    const small = disc(300, 0, 100);
    const big = disc(-1500, 0, 1000);
    const spot = nearestOpenSpot({ x: 0, y: 0 }, (x, y) => small(x, y) || big(x, y));
    expect(spot && small(spot.x, spot.y)).toBe(true);
  });

  it('lands a little way up the beach', () => {
    const spot = nearestOpenSpot({ x: 0, y: 0 }, disc(300, 0, 150));
    expect(spot!.x).toBeGreaterThan(150);
    expect(spot!.x).toBeLessThanOrEqual(300);
  });

  it('settles for the first open ground on a strip too narrow to walk up', () => {
    const strip = (x: number, y: number) => x >= 200 && x <= 210 && Math.abs(y) < 500;
    const spot = nearestOpenSpot({ x: 0, y: 0 }, strip);
    expect(spot && strip(spot.x, spot.y)).toBe(true);
  });

  it('returns null when nothing is open', () => {
    expect(nearestOpenSpot({ x: 0, y: 0 }, () => false)).toBeNull();
  });
});
