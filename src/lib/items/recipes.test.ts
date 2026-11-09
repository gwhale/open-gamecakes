// The recipe book's promises, checked where a page would not notice them break.

import { describe, expect, it } from 'vitest';
import {
  RECIPES,
  bakeRefundKey,
  bakedSlug,
  findRecipe,
  isBakedSlug,
  recipeBookView,
  recipeOfBakedSlug,
  type Recipe,
} from './recipes';
import { BAKING_ITEMS, isItemSlug } from './catalog';
import { UNLOCK_CATALOG, isFreeCupcakeOption } from '@/lib/cupcake/config';

const AT = '2026-11-06T12:00:00Z';
const ALL = new Set(BAKING_ITEMS.map((i) => i.slug));

const recipe = (slug: string, ingredients: string[]): Recipe => ({
  slug,
  name: slug,
  emoji: '🧁',
  blurb: 'x',
  ingredients,
  rewards: [{ kind: 'topping', value: 'cherry', label: 'Cherry' }],
  line: 'x',
});

describe('the recipe catalog', () => {
  it('only asks for items a kid can actually find', () => {
    // An ingredient nobody can collect is a recipe nobody can bake, and the
    // page would happily draw it as "4 of 5" forever.
    for (const r of RECIPES) {
      for (const slug of r.ingredients) expect(isItemSlug(slug), `${r.slug} needs ${slug}`).toBe(true);
    }
  });

  it('never lists an ingredient twice', () => {
    for (const r of RECIPES) expect(new Set(r.ingredients).size).toBe(r.ingredients.length);
  });

  it('uses every item in at least one recipe', () => {
    // The whole point of the file: no item is left with nothing to be for.
    const used = new Set(RECIPES.flatMap((r) => r.ingredients));
    for (const item of BAKING_ITEMS) expect(used.has(item.slug), item.slug).toBe(true);
  });

  it('has a finale that needs everything', () => {
    const finale = RECIPES[RECIPES.length - 1];
    expect(new Set(finale.ingredients)).toEqual(ALL);
  });

  it('only rewards parts the Store already sells, none of them free', () => {
    // The bake route writes a kid_cupcake_unlocks row, so the (kind, value)
    // has to be one the Store knows how to show and price — and a free part
    // would be a reward that gives nothing.
    for (const r of RECIPES) {
      expect(r.rewards.length).toBeGreaterThan(0);
      for (const rw of r.rewards) {
        const sold = UNLOCK_CATALOG.find((c) => c.kind === rw.kind && c.value === rw.value);
        expect(sold, `${r.slug} rewards ${rw.kind}:${rw.value}`).toBeDefined();
        expect(isFreeCupcakeOption(rw.kind, rw.value)).toBe(false);
      }
    }
  });

  it('never hands the same part out twice across the book', () => {
    const seen = new Set<string>();
    for (const r of RECIPES) {
      for (const rw of r.rewards) {
        const key = `${rw.kind}:${rw.value}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  it('has unique slugs and finds them', () => {
    expect(new Set(RECIPES.map((r) => r.slug)).size).toBe(RECIPES.length);
    expect(findRecipe('birthday-cake')?.name).toBe('Birthday Cake');
    expect(findRecipe('nope')).toBeUndefined();
  });
});

describe('baked rows', () => {
  it('round-trip through the kid_items slug', () => {
    expect(bakedSlug('birthday-cake')).toBe('baked:birthday-cake');
    expect(isBakedSlug('baked:birthday-cake')).toBe(true);
    expect(isBakedSlug('whisk')).toBe(false);
    expect(recipeOfBakedSlug('baked:birthday-cake')).toBe('birthday-cake');
    expect(recipeOfBakedSlug('whisk')).toBeNull();
  });

  it('never collide with an ingredient slug', () => {
    for (const r of RECIPES) expect(isItemSlug(bakedSlug(r.slug))).toBe(false);
  });

  it('key each refund to one recipe and one part', () => {
    expect(bakeRefundKey('a', { kind: 'hat', value: 'party' })).toBe('bake:a:hat:party');
  });
});

describe('a kid recipe book', () => {
  it('is all missing when the kid holds nothing', () => {
    const v = recipeBookView(new Set(), new Map());
    expect(v.total).toBe(RECIPES.length);
    expect(v.readyCount).toBe(0);
    expect(v.bakedCount).toBe(0);
    for (const e of v.entries) expect(e.missing.length).toBe(e.recipe.ingredients.length);
  });

  it('splits have and missing in recipe order', () => {
    const v = recipeBookView(new Set(['b', 'c']), new Map(), [recipe('r', ['a', 'b', 'c', 'd'])]);
    expect(v.entries[0].have).toEqual(['b', 'c']);
    expect(v.entries[0].missing).toEqual(['a', 'd']);
    expect(v.entries[0].ready).toBe(false);
  });

  it('is ready only when every ingredient is held', () => {
    const v = recipeBookView(new Set(['a', 'b']), new Map(), [recipe('r', ['a', 'b'])]);
    expect(v.entries[0].ready).toBe(true);
    expect(v.readyCount).toBe(1);
  });

  it('stops being ready once baked, and remembers when', () => {
    const v = recipeBookView(new Set(['a']), new Map([['r', AT]]), [recipe('r', ['a'])]);
    expect(v.entries[0].ready).toBe(false);
    expect(v.entries[0].bakedAt).toBe(AT);
    expect(v.bakedCount).toBe(1);
    expect(v.readyCount).toBe(0);
  });

  it('makes everything ready for a kid who found everything', () => {
    const v = recipeBookView(ALL, new Map());
    expect(v.readyCount).toBe(RECIPES.length);
  });

  it('keeps catalog order', () => {
    const v = recipeBookView(ALL, new Map());
    expect(v.entries.map((e) => e.recipe.slug)).toEqual(RECIPES.map((r) => r.slug));
  });
});
