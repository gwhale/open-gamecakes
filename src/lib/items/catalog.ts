// What a kid can collect, and nothing about where it is found.
//
// Dependency-free content module (no `three`, no React, no DB) exactly like
// creatures.ts and cakey-lines.ts, so the set can be read and argued with
// without opening an engine or a route. Three consumers that cannot import
// each other share it: the collection page renders it, the grant route
// validates a slug against it before writing a row, and (from the next branch)
// the ocean's chest catalog says which chest holds which one.
//
// WHERE AN ITEM IS FOUND IS DELIBERATELY NOT IN HERE. The first ten all come
// out of chests in the Sunken Batterlands, which makes it tempting to give each
// one a depth and be done. That would weld the whole collectible system to the
// ocean on day one. A chest on land, a game reward, a Story Oven prize — each
// of those wants to grant an item without inventing a depth for it. Placement
// lives with the thing doing the placing.
//
// THESE GET ASSEMBLED LATER. The set is not a scoreboard; the items are
// ingredients and they are going somewhere. That is why this is a fixed,
// authored list rather than a random drop table, why `slug` is a stable DB key,
// and why a kid holds each one exactly once. What they assemble INTO is not
// built and is not described here — a kid who finds a whisk should wonder, and
// a file that explains the ending in a comment has answered them.
//
// VOICE. `note` is what the kid reads once they have the thing. Same rules as
// the radio: short, present tense, one idea, everyday words, never scary, and
// never an explanation. A note that hints at what the items are for is wrong.

/** How an item a kid does NOT have yet appears in the collection. */
export type ItemReveal =
  /** Shown as an outline with its name — a visible checklist. */
  | 'silhouette'
  /** Not shown at all until found. The kid does not know it exists. */
  | 'hidden';

export interface BakingItem {
  /** Stable DB key. Never rename — rows in kid_items point at this. */
  slug: string;
  /** What a kid would call it. */
  name: string;
  emoji: string;
  /** One line, kid-voiced, shown once it has been found. */
  note: string;
  /** How it appears before it is found. See ItemReveal. */
  reveal: ItemReveal;
}

// Ordered roughly the way a kid meets them — shallow first — because that is
// also the order the collection page reads best in. Nothing depends on the
// order; it is a display choice.
export const BAKING_ITEMS: readonly BakingItem[] = [
  {
    slug: 'whisk',
    name: 'Whisk',
    emoji: '🥄',
    note: 'A whisk. At the bottom of the sea. Someone was baking down here.',
    reveal: 'silhouette',
  },
  {
    slug: 'eggs',
    name: 'Carton of eggs',
    emoji: '🥚',
    note: 'Six eggs, and not one of them cracked. That is the strange part.',
    reveal: 'silhouette',
  },
  {
    slug: 'sprinkles',
    name: 'Jar of sprinkles',
    emoji: '🌈',
    note: 'The whole reef is this colour. Now you know why.',
    reveal: 'silhouette',
  },
  {
    slug: 'bowl',
    name: 'Mixing bowl',
    emoji: '🥣',
    note: 'Big enough to mix in. Currently full of sea.',
    reveal: 'silhouette',
  },
  {
    slug: 'flour',
    name: 'Bag of flour',
    emoji: '🌾',
    note: 'Still dry inside. Nobody can explain that and nobody is trying.',
    reveal: 'silhouette',
  },
  {
    slug: 'butter',
    name: 'Block of butter',
    emoji: '🧈',
    note: 'Cold, which down here is not much of an achievement.',
    reveal: 'silhouette',
  },
  {
    slug: 'milk',
    name: 'Bottle of milk',
    emoji: '🥛',
    note: 'Sealed, and somehow still cold. The lid has a little cake on it.',
    reveal: 'silhouette',
  },
  {
    slug: 'sugar',
    name: 'Tin of sugar',
    emoji: '🍚',
    note: 'Heavier than it looks. It rattles when you turn it.',
    reveal: 'silhouette',
  },
  {
    slug: 'oven-mitt',
    name: 'Oven mitt',
    emoji: '🧤',
    note: 'One mitt. Somewhere down there is the other one.',
    reveal: 'silhouette',
  },
  {
    slug: 'candle',
    name: 'One birthday candle',
    emoji: '🕯️',
    note: 'Never lit. Someone was saving it.',
    reveal: 'silhouette',
  },
];

export function findItem(slug: string): BakingItem | undefined {
  return BAKING_ITEMS.find((i) => i.slug === slug);
}

/** Guard for anything crossing a route boundary. The DB column is free-form
 *  text on purpose (matching kid_region_discoveries and kid_deep_discoveries),
 *  so this is what stops a typo becoming an orphan row nobody can render. */
export function isItemSlug(slug: string): boolean {
  return BAKING_ITEMS.some((i) => i.slug === slug);
}
