import { describe, expect, it } from 'vitest';
import { REGIONS, findRegion, isAdjacentToDiscovered } from '@/lib/town/regions';
import { canWalkUpToUnlock, islandEntryLand, isOffshore, islandOf } from '@/lib/town/islands';
import { cityRectPx } from '@/lib/town/three/layout';
import { pickAirstrips } from '@/lib/town/three/airstrips';

const offshoreLands = REGIONS.filter((r) => !r.starter && isOffshore(r.slug));
const mainlandSlugs = REGIONS.filter((r) => !isOffshore(r.slug)).map((r) => r.slug);

describe('unlocking an island after flying there', () => {
  it('lands a pilot outside every land, so touching down cannot be the only way to pay', () => {
    const strips = pickAirstrips(REGIONS.map((r) => cityRectPx(r)), []);
    expect(strips.length).toBeGreaterThan(0);
    for (const s of strips) {
      for (const r of REGIONS) {
        const q = cityRectPx(r);
        const inside = s.center.x >= q.x0 && s.center.x <= q.x1 && s.center.y >= q.y0 && s.center.y <= q.y1;
        expect(inside, `${s.islandId} strip inside ${r.slug}`).toBe(false);
      }
    }
  });

  it('offers every offshore land on foot, though adjacency never would', () => {
    expect(offshoreLands.length).toBeGreaterThan(0);
    for (const r of offshoreLands) {
      expect(isAdjacentToDiscovered(r.slug, mainlandSlugs), r.slug).toBe(false);
      expect(canWalkUpToUnlock(r.slug, mainlandSlugs), r.slug).toBe(true);
    }
  });

  it('prices an island by its landing land, so a free sibling is no way in', () => {
    expect(findRegion('race-victory-lane')?.unlock_cost).toBe(0);
    expect(islandEntryLand('race-victory-lane')).toBe('race-pit-row');
    for (const r of offshoreLands) {
      const entry = findRegion(islandEntryLand(r.slug))!;
      expect(entry.unlock_cost, r.slug).toBeGreaterThan(0);
      expect(entry.unlock_cost, r.slug).toBeGreaterThanOrEqual(r.unlock_cost);
    }
    expect(islandEntryLand('cookie-corner')).toBe('cookie-corner');
  });

  it('still needs a discovered neighbour on the mainland', () => {
    const gated = REGIONS.filter((r) => !r.starter && !isOffshore(r.slug) && r.neighbors.length > 0);
    expect(gated.length).toBeGreaterThan(0);
    for (const r of gated) {
      expect(islandOf(r.slug).id).toBe('mainland');
      expect(canWalkUpToUnlock(r.slug, []), r.slug).toBe(false);
      expect(canWalkUpToUnlock(r.slug, [r.neighbors[0]]), r.slug).toBe(true);
    }
  });
});
