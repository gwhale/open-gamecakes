// What the baking items are FOR.
//
// catalog.ts has said since the first chest that the items "get assembled
// later". This is later. A recipe names a set of items; a kid who holds every
// one of them can bake it, once, and the treat gives them something to wear:
// a cupcake part from the Cakey Store, granted free. Find the ingredients,
// bake the cake, wear the cake.
//
// Dependency-free plain data like catalog.ts, and for the same reason: the
// collection page draws it, the bake route validates against it before it
// writes anything, and a test can read the whole set without an engine.
//
// INGREDIENTS ARE NOT USED UP. kid_items is append-only and a kid holds each
// item exactly once, so a recipe that consumed its ingredients would need the
// one thing that schema refuses to do. A recipe is a checklist, not a cost:
// once you have found the things, you can bake the thing. Baking it twice is
// stopped by the baked row, not by an empty pantry.
//
// REWARDS ARE EXISTING STORE PARTS. Every reward is a (kind, value) that is
// already in UNLOCK_CATALOG, so no new art and no new table. The bake route
// writes the same kid_cupcake_unlocks row the shop would, at cost_paid 0, and
// the Store shows it as owned. A kid who already bought the part is paid its
// price back instead, so baking never gives nothing. The finale hands over the
// two most expensive things in the shop, which is the point: the hard-to-find
// ingredients earn the hard-to-afford parts.
//
// A recipe's `line` is what Cakey says when it comes out of the oven. Same
// voice rules as the item notes: short, present tense, everyday words.

import type { UnlockKind } from '@/lib/cupcake/config';

export interface RecipeReward {
  /** A kid_cupcake_unlocks row: the Store part this recipe hands over. */
  kind: UnlockKind;
  value: string;
  /** What the kid reads, e.g. "Rainbow topping". */
  label: string;
}

export interface Recipe {
  /** Stable DB key. The baked row is kid_items `baked:<slug>`. Never rename. */
  slug: string;
  name: string;
  emoji: string;
  /** One line about the treat itself, shown before it is baked. */
  blurb: string;
  /** Item slugs from catalog.ts, every one required. */
  ingredients: readonly string[];
  rewards: readonly RecipeReward[];
  /** What Cakey says when it comes out of the oven. */
  line: string;
}

// Ordered by how many ingredients each needs, so the book reads as a climb
// and the first page is bakeable after a single good dive.
export const RECIPES: readonly Recipe[] = [
  {
    slug: 'sprinkle-cookies',
    name: 'Sprinkle Cookies',
    emoji: '🍪',
    blurb: 'Butter, sugar, flour, and a whole reef of sprinkles.',
    ingredients: ['flour', 'butter', 'sugar', 'sprinkles'],
    rewards: [{ kind: 'topping', value: 'sprinkles', label: 'Sprinkles topping' }],
    line: 'Sprinkle cookies! Cakey can smell them from here. Save me one.',
  },
  {
    slug: 'strawberry-shortcake',
    name: 'Strawberry Shortcake',
    emoji: '🍰',
    blurb: 'Whip the milk, pile on the strawberries. Pink all the way through.',
    ingredients: ['strawberries', 'milk', 'whisk', 'bowl'],
    rewards: [
      { kind: 'frosting', value: 'pink', label: 'Pink frosting' },
      { kind: 'wrapper', value: 'strawberry', label: 'Strawberry wrapper' },
    ],
    line: 'Strawberry shortcake! You whipped that yourself. I can tell.',
  },
  {
    slug: 'honey-chocolate-cake',
    name: 'Honey Chocolate Cake',
    emoji: '🍫',
    blurb: 'Dark, sticky and warm. Mind the oven. That is what the mitt is for.',
    ingredients: ['chocolate', 'honey', 'eggs', 'flour', 'oven-mitt'],
    rewards: [
      { kind: 'frosting', value: 'chocolate', label: 'Chocolate frosting' },
      { kind: 'wrapper', value: 'chocolate', label: 'Chocolate wrapper' },
    ],
    line: 'Honey chocolate cake. Sticky and warm. That is the good kind of sticky.',
  },
  {
    slug: 'birthday-cake',
    name: 'Birthday Cake',
    emoji: '🎂',
    blurb: 'A proper cake with one candle on top. Somebody was saving it for this.',
    ingredients: ['candle', 'eggs', 'flour', 'sugar', 'butter', 'milk', 'bowl', 'whisk'],
    rewards: [
      { kind: 'topping', value: 'candle', label: 'Candle topping' },
      { kind: 'hat', value: 'party', label: 'Party hat' },
    ],
    line: 'A birthday cake! One candle, never lit. Until now. Make a wish.',
  },
  {
    slug: 'rainbow-reef-cake',
    name: 'Rainbow Reef Cake',
    emoji: '🌈',
    blurb: 'Every single thing you found, all in one cake. As tall as the reef.',
    ingredients: [
      'whisk', 'eggs', 'sprinkles', 'bowl', 'flour', 'butter', 'milk', 'sugar',
      'oven-mitt', 'candle', 'honey', 'chocolate', 'strawberries',
    ],
    rewards: [
      { kind: 'topping', value: 'rainbow', label: 'Rainbow topping' },
      { kind: 'base', value: 'layered', label: 'Layered cake' },
    ],
    line: 'You used everything. Every last thing. That is the biggest cake Cakey has ever seen.',
  },
];

export function findRecipe(slug: string): Recipe | undefined {
  return RECIPES.find((r) => r.slug === slug);
}

/** The kid_items slug that records a bake. Lives in the same table as the
 *  ingredients because it is the same kind of fact — a permanent, once-only
 *  thing this kid did — and because the collection page already reads that
 *  table. collectionView() ignores slugs it does not know, so these never
 *  become a fourteenth ingredient card. */
export function bakedSlug(recipeSlug: string): string {
  return `baked:${recipeSlug}`;
}

export function isBakedSlug(itemSlug: string): boolean {
  return itemSlug.startsWith('baked:');
}

/** The recipe slug inside a baked row, or null for any other row. */
export function recipeOfBakedSlug(itemSlug: string): string | null {
  return isBakedSlug(itemSlug) ? itemSlug.slice('baked:'.length) : null;
}

/** How a bake is written into kid_items.source, beside `deep:` and `land:`. */
export function bakeSource(recipeSlug: string): string {
  return `bakery:${recipeSlug}`;
}

/** Idempotency key for the token refund when a reward part was already
 *  owned. token_transactions has a unique index on (kid, metadata.milestone_id),
 *  so a retried bake can never pay the same refund twice. */
export function bakeRefundKey(recipeSlug: string, reward: Pick<RecipeReward, 'kind' | 'value'>): string {
  return `bake:${recipeSlug}:${reward.kind}:${reward.value}`;
}

/** What the bake route tells the page about each reward. */
export interface BakeRewardResult extends RecipeReward {
  /** 'granted' = newly owned; 'refunded' = owned already, its Store price
   *  came back as tokens; 'owned' = owned already and the refund was paid on
   *  an earlier try. */
  outcome: 'granted' | 'refunded' | 'owned';
  /** Tokens paid back when the outcome is 'refunded', else 0. */
  tokens: number;
}

// ---------------------------------------------------------------------------
// What one kid's recipe book looks like.
// ---------------------------------------------------------------------------

export interface RecipeEntry {
  recipe: Recipe;
  /** Ingredient slugs the kid holds, in recipe order. */
  have: readonly string[];
  /** Ingredient slugs the kid does not hold yet, in recipe order. */
  missing: readonly string[];
  /** Every ingredient held and not yet baked — the button lights up. */
  ready: boolean;
  /** ISO timestamp of the bake, or null. */
  bakedAt: string | null;
}

export interface RecipeBookView {
  entries: RecipeEntry[];
  bakedCount: number;
  readyCount: number;
  total: number;
}

export function recipeBookView(
  held: ReadonlySet<string>,
  baked: ReadonlyMap<string, string>,
  recipes: readonly Recipe[] = RECIPES,
): RecipeBookView {
  const entries = recipes.map((recipe): RecipeEntry => {
    const have = recipe.ingredients.filter((s) => held.has(s));
    const missing = recipe.ingredients.filter((s) => !held.has(s));
    const bakedAt = baked.get(recipe.slug) ?? null;
    return {
      recipe,
      have,
      missing,
      ready: missing.length === 0 && bakedAt === null,
      bakedAt,
    };
  });
  return {
    entries,
    bakedCount: entries.filter((e) => e.bakedAt !== null).length,
    readyCount: entries.filter((e) => e.ready).length,
    total: entries.length,
  };
}
