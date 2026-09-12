// The rules the page cannot be trusted to keep on its own.

import { describe, expect, it } from 'vitest';
import { collectionView } from './collection';
import { BAKING_ITEMS, type BakingItem } from './catalog';

const item = (slug: string, reveal: BakingItem['reveal']): BakingItem => ({
  slug,
  name: slug,
  emoji: '🧁',
  note: 'x',
  reveal,
});

const AT = '2026-09-09T12:00:00Z';

describe('a kid collection', () => {
  it('shows every silhouette when the kid holds nothing', () => {
    const v = collectionView(new Map());
    expect(v.entries.length).toBe(BAKING_ITEMS.length);
    expect(v.foundCount).toBe(0);
    expect(v.complete).toBe(false);
  });

  it('counts what the kid holds', () => {
    const v = collectionView(new Map([['whisk', AT]]));
    expect(v.foundCount).toBe(1);
    expect(v.entries.find((e) => e.item.slug === 'whisk')?.foundAt).toBe(AT);
  });

  it('keeps catalog order so the grid does not reshuffle on a find', () => {
    // A kid who finds the third item should not watch it jump to the front.
    const v = collectionView(new Map([['sprinkles', AT]]));
    expect(v.entries.map((e) => e.item.slug)).toEqual(
      BAKING_ITEMS.map((i) => i.slug),
    );
  });

  it('hides an unfound hidden item from the grid AND from the denominator', () => {
    // The whole reason this function exists. Nine cards over "1 of 10" would
    // announce the secret it is meant to keep.
    const catalog = [
      item('a', 'silhouette'),
      item('b', 'silhouette'),
      item('secret', 'hidden'),
    ];
    const v = collectionView(new Map([['a', AT]]), catalog);

    expect(v.entries.map((e) => e.item.slug)).toEqual(['a', 'b']);
    expect(v.total).toBe(2);
    expect(v.foundCount).toBe(1);
  });

  it('shows a hidden item once it is found', () => {
    const catalog = [item('a', 'silhouette'), item('secret', 'hidden')];
    const v = collectionView(new Map([['secret', AT]]), catalog);

    expect(v.entries.map((e) => e.item.slug)).toEqual(['a', 'secret']);
    expect(v.total).toBe(2);
    expect(v.foundCount).toBe(1);
  });

  it('is complete when every VISIBLE item is held, even with a secret left', () => {
    // Otherwise a kid who has found everything they can see is told they have
    // not, by a card they are not allowed to know about.
    const catalog = [item('a', 'silhouette'), item('secret', 'hidden')];
    const v = collectionView(new Map([['a', AT]]), catalog);
    expect(v.complete).toBe(true);
  });

  it('ignores held slugs that are not in the catalog', () => {
    // A retired item still has rows. It must not become an eleventh card or
    // push the denominator past the number of cards drawn.
    const v = collectionView(new Map([['whisk', AT], ['retired-thing', AT]]));
    expect(v.total).toBe(BAKING_ITEMS.length);
    expect(v.foundCount).toBe(1);
  });

  it('does not call an empty catalog complete', () => {
    expect(collectionView(new Map(), []).complete).toBe(false);
  });
});
