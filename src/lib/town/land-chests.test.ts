// The land chests are content, like the ocean's. These pin what would break a
// row or a route rather than taste.

import { describe, expect, it } from 'vitest';
import { LAND_CHESTS, findLandChest, landChestSource } from './land-chests';
import { DEEP_CHESTS } from '@/lib/deep/chest-catalog';
import { findItem } from '@/lib/items/catalog';

describe('the hidden land chests', () => {
  it('are three, one per hiding place', () => {
    expect(LAND_CHESTS).toHaveLength(3);
    expect(new Set(LAND_CHESTS.map((c) => c.spot)).size).toBe(3);
  });

  it('never share a slug with an ocean chest', () => {
    // The chest route looks a slug up in the ocean first. A land chest with an
    // ocean slug would silently become that ocean chest, cove check and all.
    const deep = new Set(DEEP_CHESTS.map((c) => c.slug));
    for (const c of LAND_CHESTS) expect(deep.has(c.slug), c.slug).toBe(false);
  });

  it('each hold a real item that no other chest holds', () => {
    // An item is held once per kid (kid_items PK). Two chests with one item
    // means the second chest can never be opened by a kid who has the first.
    const held = [...DEEP_CHESTS, ...LAND_CHESTS].map((c) => c.item);
    expect(new Set(held).size).toBe(held.length);
    for (const c of LAND_CHESTS) expect(findItem(c.item), c.slug).toBeDefined();
  });

  it('give hints that do not name the place outright', () => {
    for (const c of LAND_CHESTS) {
      expect(c.hint.trim(), c.slug).not.toBe('');
      expect(/\b(north|south|east|west|left|right)\b/i.test(c.hint), c.hint).toBe(false);
    }
  });

  it('write a source the town page can read back', () => {
    for (const c of LAND_CHESTS) {
      const source = landChestSource(c.slug);
      expect(source.startsWith('land:')).toBe(true);
      expect(findLandChest(source.slice('land:'.length))).toBe(c);
    }
  });
});
