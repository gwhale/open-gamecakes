import { describe, expect, it } from 'vitest';
import { REGIONS } from '@/lib/town/regions';
import { boothOffsetsPx, townSquareShopsPx } from './city3d';
import { FOOTPRINT_R, findOverlaps, isClearOf, nearestAccepted, type Footprint } from './town-clearance';

describe('findOverlaps', () => {
  it('reports only pairs that really touch', () => {
    const items: Footprint[] = [
      { id: 'a', x: 0, y: 0, r: 10 },
      { id: 'b', x: 15, y: 0, r: 10 },
      { id: 'c', x: 100, y: 0, r: 10 },
    ];
    expect(findOverlaps(items)).toEqual([['a', 'b']]);
  });
});

describe('nearestAccepted', () => {
  it('keeps a spot that is already fine', () => {
    expect(nearestAccepted({ x: 5, y: 5 }, () => true)).toEqual({ x: 5, y: 5 });
  });

  it('moves off a blocked spot by no more than it has to', () => {
    const blocker: Footprint[] = [{ id: 'b', x: 0, y: 0, r: 100 }];
    const p = nearestAccepted({ x: 10, y: 0 }, (x, y) => isClearOf(x, y, 20, blocker))!;
    expect(isClearOf(p.x, p.y, 20, blocker)).toBe(true);
    expect(Math.hypot(p.x, p.y)).toBeLessThan(180);
  });

  it('gives up rather than place something anywhere', () => {
    expect(nearestAccepted({ x: 0, y: 0 }, () => false)).toBeNull();
  });
});

describe('games and shops on the real map', () => {
  it('never stand on each other in any land', () => {
    for (const region of REGIONS) {
      const items: Footprint[] = boothOffsetsPx(region, region.games.length).map((p, i) => ({
        id: region.games[i],
        x: p.x,
        y: p.y,
        r: FOOTPRINT_R.booth,
      }));
      if (region.slug === 'town-square') {
        const { store, garage } = townSquareShopsPx(region);
        items.push({ id: 'store', ...store, r: FOOTPRINT_R.booth }, { id: 'garage', ...garage, r: FOOTPRINT_R.booth });
      }
      expect(findOverlaps(items), region.slug).toEqual([]);
    }
  });
});
