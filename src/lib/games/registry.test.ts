import { describe, it, expect } from 'vitest';
import { GAME_REGISTRY, findGame, getLiveGames } from './registry';
import { LOCAL_GAMES } from './registry.local';

// The point of registry.local.ts is that a self-hosting family's games and an
// upstream release cannot collide: they are appends to two different files.
// These guard the properties that make that true.

describe('the local-games seam', () => {
  it('includes upstream games and this deployment\'s, in that order', () => {
    // Upstream's entries come first, so local ones cannot displace or reorder
    // them — anything keyed on position keeps working across an update.
    const localSlugs = new Set(LOCAL_GAMES.map((g) => g.slug));
    const head = GAME_REGISTRY.slice(0, GAME_REGISTRY.length - LOCAL_GAMES.length);
    expect(head.some((g) => localSlugs.has(g.slug))).toBe(false);
    expect(GAME_REGISTRY.length).toBe(head.length + LOCAL_GAMES.length);
  });

  it('actually surfaces this deployment\'s games', () => {
    // The load-bearing assertion. The ordering test above is self-consistent:
    // it passes whether or not LOCAL_GAMES is concatenated at all. This one
    // fails the moment the seam in registry.ts is removed or broken, which is
    // the only failure that would silently lose a family's games.
    for (const local of LOCAL_GAMES) {
      expect(GAME_REGISTRY.some((g) => g.slug === local.slug)).toBe(true);
      expect(findGame(local.slug)?.label).toBe(local.label);
    }
  });

  it('resolves every registered game by slug', () => {
    for (const game of GAME_REGISTRY) {
      expect(findGame(game.slug)?.slug).toBe(game.slug);
    }
  });

  it('has no duplicate slugs', () => {
    // A duplicate silently shadows the earlier entry, because findGame returns
    // the first match. registry.ts throws on this outside production; this
    // catches it in CI, where NODE_ENV is not production either way.
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const g of GAME_REGISTRY) {
      if (seen.has(g.slug)) dupes.push(g.slug);
      seen.add(g.slug);
    }
    expect(dupes).toEqual([]);
  });

  it('keeps retired games resolvable but out of the live list', () => {
    // Retired games stay reachable so old deep links and existing kid tickets
    // still resolve; they just leave the town map and the active menus.
    //
    // Currently VACUOUS by design: nothing is retired. Word Flap and Water
    // Balloons were the last two and were deleted outright rather than left in
    // the Graveyard. The assertion stays because the invariant is about the
    // `retired` flag, not about those two games — the next thing to carry it
    // gets checked. Retiring is still the softer option; deleting cost a doc
    // rewrite and left two kid tickets pointing at a slug with no game.
    const retired = GAME_REGISTRY.filter((g) => g.retired);
    const live = getLiveGames();
    for (const g of retired) {
      expect(findGame(g.slug)).toBeDefined();
      expect(live.some((l) => l.slug === g.slug)).toBe(false);
    }
  });

  it('gives every game a slug, label and glyph', () => {
    for (const g of GAME_REGISTRY) {
      expect(g.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/);
      expect(g.label.length).toBeGreaterThan(0);
      expect(g.glyph.length).toBeGreaterThan(0);
    }
  });
});
