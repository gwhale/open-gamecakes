// The set is content, so most of it is a judgement call. These pin the few
// things that are not — the ones that would break a row, a route, or the page.

import { describe, expect, it } from 'vitest';
import { BAKING_ITEMS, findItem, isItemSlug } from './catalog';

describe('the baking item catalog', () => {
  it('has no duplicate slugs', () => {
    // A slug is a primary key component in kid_items. Two items sharing one
    // means the second can never be granted to a kid who holds the first, and
    // it would fail as a silent unique_violation rather than as an error.
    const slugs = BAKING_ITEMS.map((i) => i.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('uses slugs that survive a URL and a database column', () => {
    // These cross a route boundary and land in a text column. Anything needing
    // escaping is a bug waiting for the one item that has it.
    for (const item of BAKING_ITEMS) {
      expect(item.slug, item.name).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('gives every item something to render', () => {
    for (const item of BAKING_ITEMS) {
      expect(item.name.trim(), item.slug).not.toBe('');
      expect(item.emoji.trim(), item.slug).not.toBe('');
      expect(item.note.trim(), item.slug).not.toBe('');
    }
  });

  it('never explains what the items are for', () => {
    // The whole premise is that a kid wonders. A note that says why they are
    // collecting these has answered the question the feature is asking, and it
    // would ship without anyone noticing because it still reads fine.
    const spoilers = /recipe|assemble|ingredient|combine|craft|build a|makes a/i;
    for (const item of BAKING_ITEMS) {
      expect(spoilers.test(item.note), `${item.slug}: "${item.note}"`).toBe(false);
    }
  });

  it('validates slugs the way the grant route will', () => {
    expect(isItemSlug('whisk')).toBe(true);
    expect(isItemSlug('not-a-real-item')).toBe(false);
    expect(isItemSlug('')).toBe(false);
    expect(findItem('whisk')?.name).toBe('Whisk');
    expect(findItem('not-a-real-item')).toBeUndefined();
  });

  it('keeps the whisk, because a kid already has one', () => {
    // The whisk shipped as the ocean's only findable object and both kids have
    // a kid_deep_discoveries row for it. Renaming or dropping this slug orphans
    // that history.
    expect(isItemSlug('whisk')).toBe(true);
  });
});
