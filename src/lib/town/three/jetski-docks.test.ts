// pickJetskiDocks on a synthetic mainland: an ellipse with a few lands and an
// open sea. The real map is checked by eye (see the PR); this pins the rules
// that make a spot a rental dock.

import { describe, expect, it } from 'vitest';
import { pickJetskiDocks, JETSKI_DOCK_COUNT, type DockWorld } from './jetski-docks';

const CX = 2000;
const CY = 1500;
const RX = 1800;
const RY = 1300;
const nd = (x: number, y: number): number => Math.hypot((x - CX) / RX, (y - CY) / RY);
const lands = [
  { x0: 1700, y0: 1200, x1: 2300, y1: 1800 },
  { x0: 400, y0: 1200, x1: 800, y1: 1600 }, // near the west coast
  { x0: 3200, y0: 900, x1: 3600, y1: 1300 }, // near the east coast
];
function distToRect(x: number, y: number, r: (typeof lands)[number]): number {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
}

const world: DockWorld = {
  centre: { x: CX, y: CY },
  nd,
  waterlineNd: 1.04, // the sea meets the beach past nd 1, as on the real map
  seaOk: (x, y) => nd(x, y) > 1.06,
  nearLand: (x, y) => Math.min(...lands.map((l) => distToRect(x, y, l))),
  avoid: [{ x: CX, y: CY - RY }], // a ferry dock on the north shore
};

describe('pickJetskiDocks', () => {
  const docks = pickJetskiDocks(world);

  it('places all of them on this map', () => {
    expect(docks).toHaveLength(JETSKI_DOCK_COUNT);
  });

  it('rents on dry sand and moors the ski out in open water', () => {
    for (const d of docks) {
      expect(nd(d.beachPx.x, d.beachPx.y)).toBeLessThan(1);
      expect(nd(d.beachPx.x, d.beachPx.y)).toBeGreaterThan(0.9);
      expect(world.seaOk(d.skiPx.x, d.skiPx.y)).toBe(true);
      expect(Math.hypot(d.out.x, d.out.y)).toBeCloseTo(1, 6);
    }
  });

  it('puts the first docks on the coast nearest the lands', () => {
    const west = docks.some((d) => d.beachPx.x < CX - RX * 0.8);
    const east = docks.some((d) => d.beachPx.x > CX + RX * 0.8);
    expect(west && east).toBe(true);
  });

  it('keeps clear of the ferry dock', () => {
    for (const d of docks) {
      expect(Math.hypot(d.shorePx.x - CX, d.shorePx.y - (CY - RY))).toBeGreaterThan(400);
    }
  });

  it('spreads them round the island', () => {
    const angs = docks.map((d) => Math.atan2(d.out.y, d.out.x));
    for (let i = 0; i < angs.length; i++) {
      for (let j = i + 1; j < angs.length; j++) {
        const dd = Math.abs(angs[i] - angs[j]) % (Math.PI * 2);
        expect(Math.min(dd, Math.PI * 2 - dd)).toBeGreaterThan(1.2);
      }
    }
  });

  it('is deterministic', () => {
    expect(pickJetskiDocks(world)).toEqual(docks);
  });

  it('places none where the sea is never open', () => {
    expect(pickJetskiDocks({ ...world, seaOk: () => false })).toEqual([]);
  });
});
