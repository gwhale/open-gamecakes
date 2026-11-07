import { describe, expect, it } from 'vitest';
import {
  BUILD_CATALOG,
  CELL_PX,
  cellCenterPx,
  cellInWorld,
  cellOfPx,
  roadMask,
  siblingLandAt,
} from './builds';
import { BUILD } from '@/lib/tokens/economy';
import { findRegion } from './regions';
import { cityCenterPx, cityRectPx } from './three/layout';

describe('town build grid', () => {
  it('maps a point to the square that contains it, and back to its centre', () => {
    expect(cellOfPx(0, 0)).toEqual({ gx: 0, gy: 0 });
    expect(cellOfPx(63.9, 64)).toEqual({ gx: 0, gy: 1 });
    expect(cellOfPx(-1, -65)).toEqual({ gx: -1, gy: -2 });
    expect(cellCenterPx(2, -1)).toEqual({ x: 2.5 * CELL_PX, y: -0.5 * CELL_PX });
  });

  it('bounds squares to the world', () => {
    const c = cityCenterPx('town-square');
    const { gx, gy } = cellOfPx(c.x, c.y);
    expect(cellInWorld(gx, gy)).toBe(true);
    expect(cellInWorld(gx + 100_000, gy)).toBe(false);
  });

  it('refuses a square on a sibling land and allows one outside it', () => {
    const region = findRegion('town-square')!;
    const c = cityCenterPx(region.slug);
    const inside = cellOfPx(c.x, c.y);
    expect(siblingLandAt(inside.gx, inside.gy, [region.slug])).toBe(region.slug);
    const rc = cityRectPx(region);
    const outside = cellOfPx(rc.x1 + CELL_PX * 3, c.y);
    expect(siblingLandAt(outside.gx, outside.gy, [region.slug])).toBeNull();
    // No siblings, no limit.
    expect(siblingLandAt(inside.gx, inside.gy, [])).toBeNull();
  });

  it('joins a road square to its road neighbours (N=1 E=2 S=4 W=8)', () => {
    const roads = new Set(['5,4', '6,5', '5,6', '4,5']);
    const has = (gx: number, gy: number): boolean => roads.has(`${gx},${gy}`);
    expect(roadMask(5, 5, has)).toBe(15); // crossing
    roads.delete('4,5');
    roads.delete('5,6');
    expect(roadMask(5, 5, has)).toBe(1 | 2); // corner
    expect(roadMask(20, 20, has)).toBe(0); // lone square
  });

  it('prices every piece from the economy ladder', () => {
    const byKind = Object.fromEntries(BUILD_CATALOG.map((b) => [b.kind, b.cost]));
    expect(byKind).toEqual({
      road: BUILD.ROAD,
      fence: BUILD.FENCE,
      flowers: BUILD.FLOWERS,
      lamp: BUILD.LAMP,
      bench: BUILD.BENCH,
      tree: BUILD.TREE,
      'cotton-tree': BUILD.COTTON_TREE,
      'gumdrop-pine': BUILD.GUMDROP_PINE,
      'cane-palm': BUILD.CANE_PALM,
      house: BUILD.HOUSE,
    });
  });
});
