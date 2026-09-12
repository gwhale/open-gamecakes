// The region catalog's invariants used to live in comments and dev-only
// console.warn()s at the bottom of regions.ts. A warning nobody reads is not a
// gate; these make the same promises fail a build.

import { describe, expect, it } from 'vitest';
import { REGIONS, WORLD_TILES, findRegion, type Region } from './regions';
import { ISLANDS, islandOf } from './islands';
import { GAME_REGISTRY, getLiveGames } from '@/lib/games/registry';
import { LAND } from '@/lib/tokens/economy';

const isOffshore = (r: Region): boolean => islandOf(r.slug).id !== 'mainland';

describe('region catalog', () => {
  it('has unique, URL-safe slugs', () => {
    const slugs = REGIONS.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  // Adjacency is deliberately NOT symmetric: a landing land lists no
  // neighbours (the moat), while its island siblings list it, so they can be
  // walked to once you are ashore. Only resolution is checked.
  it('every neighbour resolves', () => {
    for (const r of REGIONS) {
      for (const n of r.neighbors) expect(findRegion(n), `${r.slug} → ${n}`).toBeDefined();
    }
  });

  it('every game a region lists exists in the registry, and is placed only once', () => {
    const known = new Set(GAME_REGISTRY.map((g) => g.slug));
    const seen = new Map<string, string>();
    for (const r of REGIONS) {
      for (const g of r.games) {
        expect(known.has(g), `${r.slug} lists unknown game ${g}`).toBe(true);
        expect(seen.get(g), `${g} placed in both ${seen.get(g)} and ${r.slug}`).toBeUndefined();
        seen.set(g, r.slug);
      }
    }
  });

  it('every live game is placed in a region', () => {
    const placed = new Set(REGIONS.flatMap((r) => r.games));
    for (const g of getLiveGames()) expect(placed.has(g.slug), `${g.slug} is unplaced`).toBe(true);
  });

  it('every rect is inside the world grid', () => {
    for (const r of REGIONS) {
      expect(r.tile.x, r.slug).toBeGreaterThanOrEqual(0);
      expect(r.tile.y, r.slug).toBeGreaterThanOrEqual(0);
      expect(r.tile.x + r.size.w, r.slug).toBeLessThanOrEqual(WORLD_TILES.w);
      expect(r.tile.y + r.size.h, r.slug).toBeLessThanOrEqual(WORLD_TILES.h);
    }
  });

  it('mainland rects never overlap (offshore rects are bookkeeping and exempt)', () => {
    const main = REGIONS.filter((r) => !isOffshore(r));
    for (let a = 0; a < main.length; a += 1) {
      for (let b = a + 1; b < main.length; b += 1) {
        const A = main[a];
        const B = main[b];
        const apart =
          A.tile.x + A.size.w <= B.tile.x ||
          B.tile.x + B.size.w <= A.tile.x ||
          A.tile.y + A.size.h <= B.tile.y ||
          B.tile.y + B.size.h <= A.tile.y;
        expect(apart, `${A.slug} overlaps ${B.slug}`).toBe(true);
      }
    }
  });

  it('every island region exists in the catalog', () => {
    for (const isl of ISLANDS) {
      for (const slug of isl.regions) expect(findRegion(slug), `${isl.id} → ${slug}`).toBeDefined();
    }
  });
});

describe('islands are one purchase', () => {
  it('the landing land carries LAND.ISLAND, is moated, and is never a starter', () => {
    for (const isl of ISLANDS) {
      const landing = findRegion(isl.regions[0])!;
      expect(landing.unlock_cost, `${landing.slug}`).toBe(LAND.ISLAND);
      expect(landing.neighbors, `${landing.slug} must have no walkable neighbour`).toEqual([]);
      expect(landing.starter, landing.slug).toBe(false);
    }
  });

  it('every other land on an island is free', () => {
    for (const isl of ISLANDS) {
      for (const slug of isl.regions.slice(1)) {
        expect(findRegion(slug)!.unlock_cost, slug).toBe(0);
      }
    }
  });

  it('ferry islands wear different ribbons, so their boats read differently', () => {
    const ribbons = ISLANDS.filter((i) => i.transport === 'ferry').map((i) => findRegion(i.regions[0])!.ribbon);
    expect(new Set(ribbons).size).toBe(ribbons.length);
  });
});

describe('Puzzle Island', () => {
  it('is an offshore, ferry-served land of logic and word puzzles — never math', () => {
    const p = findRegion('puzzle-isle')!;
    expect(p).toBeDefined();
    expect(isOffshore(p)).toBe(true);
    expect(islandOf('puzzle-isle').transport).toBe('ferry');
    // "Logic-only" was the promise when the island shipped scenic. The word
    // booths (Sprinkle Search, Cakey's Candles) are reading games — puzzles a
    // kid wins by looking and listening, not by a math gate — so the island's
    // rule is now "no math", and either 'logic' or 'reading' belongs here.
    for (const g of p.games) {
      expect(['logic', 'reading'], g).toContain(GAME_REGISTRY.find((x) => x.slug === g)?.subject);
    }
  });
});
