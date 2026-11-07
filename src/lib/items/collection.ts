// What one kid's collection looks like — which cards to draw, and the score.
//
// Pulled out of the page as a pure function for the same reason resume.ts was
// pulled out of the deep engine: it is a rule about FEEL rather than about
// data, and it is the kind of thing that gets quietly "simplified" by someone
// who reads the page and not the reason.
//
// THE DENOMINATOR ONLY COUNTS WHAT THE KID CAN SEE. Today every item is a
// 'silhouette', so a total of BAKING_ITEMS.length would be correct and this
// function would look like ceremony. The moment one item is 'hidden', it stops
// being correct in a way nobody would catch by looking: nine cards above the
// words "2 of 10" tells the kid a secret item exists, which is the one thing a
// hidden item is for. The test for that case is the point of this file.

import { BAKING_ITEMS, type BakingItem } from './catalog';

export interface CollectionEntry {
  item: BakingItem;
  /** ISO timestamp, or null when the kid does not hold it. */
  foundAt: string | null;
}

export interface CollectionView {
  /** In catalog order — found items and silhouettes, hidden ones omitted. */
  entries: CollectionEntry[];
  foundCount: number;
  /** Denominator. Never BAKING_ITEMS.length — see the header. */
  total: number;
  complete: boolean;
}

export function collectionView(
  held: ReadonlyMap<string, string>,
  catalog: readonly BakingItem[] = BAKING_ITEMS,
): CollectionView {
  const entries: CollectionEntry[] = [];

  for (const item of catalog) {
    const foundAt = held.get(item.slug) ?? null;
    // A hidden item the kid does not hold does not exist as far as the page is
    // concerned — no card, and no place in the count.
    if (!foundAt && item.reveal === 'hidden') continue;
    entries.push({ item, foundAt });
  }

  const foundCount = entries.filter((e) => e.foundAt !== null).length;
  return {
    entries,
    foundCount,
    total: entries.length,
    // An empty catalog is not a completed one. Guarding this here rather than
    // in the page keeps the "That is all of them" footer honest everywhere.
    complete: entries.length > 0 && foundCount === entries.length,
  };
}
