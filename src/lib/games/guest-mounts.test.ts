// The mount table names modules and exports as strings, so TypeScript proves
// almost nothing about it: a wrong viewport constant, a renamed factory, a
// host that moved — all compile clean and fail as a blank page for a stranger
// who is seeing Gamecakes for the first time.
//
// This actually loads every row. Three of the names in the first draft of the
// table were wrong (SHARKS_VIEW_W, SKI_VIEW_W, and a route that did not exist)
// and this is what would have caught them.

import { describe, expect, it } from 'vitest';
import { GUEST_MOUNTS, GUEST_SCENE_PROPS, guestPlayableGames } from './guest-mounts';
import { UPSTREAM_GAMES } from './registry';
import { LOCAL_GAMES } from './registry.local';

describe('the guest mount table', () => {
  it('only names games upstream actually ships', () => {
    const upstream = new Set(UPSTREAM_GAMES.map((g) => g.slug));
    for (const slug of Object.keys(GUEST_MOUNTS)) {
      expect(upstream.has(slug), `${slug} is mounted but not in UPSTREAM_GAMES`).toBe(true);
    }
  });

  // A family's own games are not upstream's to demo, and their slugs carry a
  // child's name.
  it('never mounts a local game', () => {
    for (const g of LOCAL_GAMES) {
      expect(GUEST_MOUNTS[g.slug], `${g.slug} is a local game`).toBeUndefined();
    }
  });

  it('offers a real arcade, not one game', () => {
    const playable = guestPlayableGames();
    expect(playable.length).toBeGreaterThanOrEqual(10);
    // Derived from the registry, so a retired game leaves on its own.
    for (const g of playable) expect(g.retired ?? false).toBe(false);
  });

  it('starts every game somewhere a five-year-old can begin', () => {
    // Tier 2 is add/subtract within 10 on the catalog scale. If this drifts up
    // the arcade stops being a demo and becomes a wall.
    expect(GUEST_SCENE_PROPS.tier).toBeLessThanOrEqual(3);
    expect(GUEST_SCENE_PROPS.difficulty).toBe('easy');
  });

  // The one that matters. Every module resolves, every named export exists.
  it('gives every arcade game a real name to show', () => {
    // /play/[slug] hands GuestGameHost `game.label`, and every host renders it
    // as the visible title AND builds its canvas accessible name from it
    // (`${title} game area`). Eleven arcade games shipped with the title
    // dropped on the way through, so a screen reader announced
    // 'undefined game area' and the header sat empty. An empty or missing
    // label here is the same bug one step earlier.
    for (const g of guestPlayableGames()) {
      expect(g.label, `${g.slug} has no label`).toBeTruthy();
      expect(g.label.trim(), `${g.slug} has a blank label`).not.toBe('');
      expect(String(g.label)).not.toContain('undefined');
    }
  });

  it('resolves every host, factory and export it names', async () => {
    for (const [slug, mount] of Object.entries(GUEST_MOUNTS)) {
      const mod = await mount.load();
      expect(typeof mod.default, `${slug}: host has no default export`).toBe('function');

      if (mount.kind !== 'phaser') continue;

      const factory = await mount.factory();
      const [factoryKey, widthKey, heightKey] = mount.keys;

      // A PhaserSceneFactory is { key, create } — an object, not a function.
      // I asserted 'function' first and this caught it, which is the point.
      const sceneFactory = factory[factoryKey] as { key?: string; create?: unknown } | undefined;
      expect(sceneFactory, `${slug}: no export "${factoryKey}"`).toBeDefined();
      expect(typeof sceneFactory?.key, `${slug}: factory has no scene key`).toBe('string');
      expect(sceneFactory?.create, `${slug}: factory has no create()`).toBeTypeOf('function');
      expect(factory[widthKey], `${slug}: no export "${widthKey}"`).toBeTypeOf('number');
      expect(factory[heightKey], `${slug}: no export "${heightKey}"`).toBeTypeOf('number');
      expect(factory[widthKey] as number).toBeGreaterThan(0);
      expect(factory[heightKey] as number).toBeGreaterThan(0);
    }
  }, 30_000);
});
