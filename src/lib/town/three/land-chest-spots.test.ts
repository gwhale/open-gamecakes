// pickLandChestSpots on a synthetic mainland: an ellipse with a few lands, a
// road between them and a mountain. The real map is checked by eye (see the PR);
// this pins the rules that make a spot a hiding place.

import { describe, expect, it } from 'vitest';
import { pickLandChestSpots, type SpotWorld } from './land-chest-spots';

const CX = 2000;
const CY = 1500;
const RX = 1800;
const RY = 1300;
const lands = [
  { x0: 1700, y0: 1200, x1: 2300, y1: 1800 }, // town square, centre
  { x0: 700, y0: 1100, x1: 1100, y1: 1500 },
  { x0: 2900, y0: 900, x1: 3300, y1: 1300 },
];
const road = { ax: 900, ay: 1300, bx: 3100, by: 1100 };

function distToRect(x: number, y: number, r: (typeof lands)[number]): number {
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}
function distToSeg(x: number, y: number): number {
  const vx = road.bx - road.ax;
  const vy = road.by - road.ay;
  const t = Math.max(0, Math.min(1, ((x - road.ax) * vx + (y - road.ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (road.ax + t * vx), y - (road.ay + t * vy));
}

const world: SpotWorld = {
  bounds: { x0: CX - RX, y0: CY - RY, x1: CX + RX, y1: CY + RY },
  centre: { x: CX, y: CY },
  nd: (x, y) => Math.hypot((x - CX) / RX, (y - CY) / RY),
  clearance: (x, y) => Math.min(...lands.map((l) => distToRect(x, y, l)), distToSeg(x, y)),
  mountain: { x: 2600, y: 2100, r: 340 },
};

describe('pickLandChestSpots', () => {
  const spots = pickLandChestSpots(world);

  it('finds all three on this map', () => {
    expect(spots.mountain).not.toBeNull();
    expect(spots.coast).not.toBeNull();
    expect(spots.hollow).not.toBeNull();
  });

  it('keeps every chest on land and away from anything built', () => {
    for (const p of Object.values(spots)) {
      expect(world.nd(p!.x, p!.y)).toBeLessThan(0.95);
      expect(world.clearance(p!.x, p!.y)).toBeGreaterThanOrEqual(60);
    }
  });

  it('puts the coast chest by the coast and the hollow one inland', () => {
    const c = world.nd(spots.coast!.x, spots.coast!.y);
    const h = world.nd(spots.hollow!.x, spots.hollow!.y);
    expect(c).toBeGreaterThanOrEqual(0.78);
    expect(h).toBeLessThanOrEqual(0.72);
  });

  it('puts the mountain chest on the side facing away from town', () => {
    const m = world.mountain;
    const away = { x: m.x - CX, y: m.y - CY };
    const out = { x: spots.mountain!.x - m.x, y: spots.mountain!.y - m.y };
    expect(away.x * out.x + away.y * out.y).toBeGreaterThan(0);
    expect(Math.hypot(out.x, out.y)).toBeLessThan(m.r);
  });

  it('keeps the three apart, so they are three hiding places', () => {
    const minSep = (world.bounds.x1 - world.bounds.x0) * 0.3;
    const h = spots.hollow!;
    for (const o of [spots.coast!, spots.mountain!]) {
      expect(Math.hypot(h.x - o.x, h.y - o.y)).toBeGreaterThanOrEqual(minSep);
    }
  });

  it('is deterministic: the same map hides them in the same places', () => {
    expect(pickLandChestSpots(world)).toEqual(spots);
  });

  it('returns null rather than a bad spot when nowhere qualifies', () => {
    const crowded: SpotWorld = { ...world, clearance: () => 10 };
    const none = pickLandChestSpots(crowded);
    expect(none).toEqual({ mountain: null, coast: null, hollow: null });
  });
});
