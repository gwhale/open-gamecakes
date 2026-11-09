import { describe, expect, it } from 'vitest';
import { PIANO_HIGH, PIANO_LOW } from '@/lib/games/music/theory';
import {
  ORBIT_R,
  WHITE_COUNT,
  fitInBand,
  isBlack,
  keyX,
  ndcBands,
  pianoWindow,
  planetCamera,
  planetPos,
  spaceCamera,
  staffLayout,
  whiteIndex,
} from './layout';

describe('the circle', () => {
  it('puts C at the back and G clockwise of it, as the space camera sees it', () => {
    const c = planetPos(0);
    const g = planetPos(1);
    const f = planetPos(11);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(-ORBIT_R);
    // From above, looking toward -Z: clockwise from the top is to the right.
    expect(g.x).toBeGreaterThan(0);
    expect(f.x).toBeLessThan(0);
  });

  it('looks at a planet from outside the circle, toward the sun', () => {
    const p = planetPos(3);
    const cam = planetCamera(p, 0.85, 0.5, 0.2);
    expect(Math.hypot(cam.x, cam.z)).toBeGreaterThan(ORBIT_R);
    // Facing back along -outward: for the planet on the right, that is -X.
    expect(Math.sin(cam.yaw)).toBeCloseTo(1);
  });

  it('tips the space camera down at the circle', () => {
    const cam = spaceCamera(20, 0);
    expect(cam.y).toBeGreaterThan(0);
    expect(Math.atan2(cam.y, cam.z)).toBeCloseTo(cam.pitch);
  });
});

describe('the piano', () => {
  it('has fifteen white keys from C4 to C6', () => {
    expect(WHITE_COUNT).toBe(15);
    expect(whiteIndex(PIANO_LOW)).toBe(0);
    expect(whiteIndex(PIANO_HIGH)).toBe(14);
  });

  it('centres the keyboard and puts each black key between its whites', () => {
    expect(keyX(PIANO_LOW)).toBeCloseTo(-7);
    expect(keyX(PIANO_HIGH)).toBeCloseTo(7);
    for (let m = PIANO_LOW; m < PIANO_HIGH; m++) {
      if (!isBlack(m)) continue;
      expect(keyX(m)).toBeGreaterThan(keyX(m - 1));
      expect(keyX(m)).toBeLessThan(keyX(m + 1));
    }
  });

  it('shows the whole keyboard when there is room, the scale and a key each side when not', () => {
    expect(pianoWindow('G', false)).toEqual({ lo: 0, hi: 14 });
    // G4..G5 is white keys 4..11.
    expect(pianoWindow('G', true)).toEqual({ lo: 3, hi: 12 });
    // C4 is the bottom key: nothing to spare below it.
    expect(pianoWindow('C', true)).toEqual({ lo: 0, hi: 8 });
  });
});

describe('the staff', () => {
  it('keeps eight notes on a fourteen-unit staff, after any signature', () => {
    for (const marks of [0, 1, 6]) {
      const L = staffLayout(marks);
      expect(L.noteX(0)).toBeGreaterThan(L.sigX(Math.max(0, marks - 1)));
      expect(L.noteX(7)).toBeLessThanOrEqual(14);
    }
  });
});

describe('fitting a piece into a band', () => {
  const square = [-1, 1].flatMap((x) => [-1, 1].map((y) => ({ x, y, z: 0 })));

  it('fills the band and stays inside it', () => {
    const [band] = ndcBands(0.1, 0, [0.5, 0.5]);
    const { s, y } = fitInBand(square, 12, 1, band.y, band.h, 2);
    const tan = Math.tan((20 * Math.PI) / 180);
    const top = (y + s) / (12 * tan);
    const bottom = (y - s) / (12 * tan);
    expect(top).toBeLessThanOrEqual(band.y + band.h + 1e-3);
    expect(bottom).toBeGreaterThanOrEqual(band.y - band.h - 1e-3);
    expect(top - bottom).toBeGreaterThan(2 * band.h * 0.99);
  });

  it('gives way to width on a narrow screen', () => {
    const wide = fitInBand(square, 12, 1.5, 0, 0.5, 1.9);
    const narrow = fitInBand(square, 12, 0.45, 0, 0.5, 1.9);
    expect(narrow.s).toBeLessThan(wide.s);
  });
});
