// POST /api/bakery/bake — turn a full set of ingredients into a treat, once.
//
// Body: { recipe_slug: string }
//
// The body names a RECIPE. What it needs and what it gives are decided here,
// from lib/items/recipes.ts, so a crafted request cannot bake with an empty
// pantry or mint a part of its choosing. Same shape as /api/deep/chest for
// the same reason: a route that hands out something must not trust the page
// it was called from.
//
// WHAT A BAKE WRITES, in order:
//   1. One kid_cupcake_unlocks row per reward, at cost_paid 0 — exactly the
//      row the Cakey Store writes when the part is bought, so the Store shows
//      it as owned with no new code. If the row already exists (the kid bought
//      it, or a previous bake crashed after writing it), the part's price is
//      paid back instead through mint_tokens, keyed on metadata.milestone_id
//      so the refund can only ever happen once per (recipe, part).
//   2. The baked row in kid_items (`baked:<slug>`, source `bakery:<slug>`),
//      which is what stops a second bake.
//
// Rewards before the record, not after. If this dies between the two, the kid
// can tap Bake again: step 1 is idempotent (a duplicate unlock becomes a
// refund attempt that the unique index dedupes), so the retry finishes the
// job and pays nothing twice. The other order would leave a baked row with no
// reward and no way back.
//
// NOT A TRANSACTION, like the chest route. A half-write here is finished by
// a retry, where a rollback would erase an unlock the kid watched appear.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { UNLOCK_CATALOG } from '@/lib/cupcake/config';
import {
  bakeRefundKey,
  bakeSource,
  bakedSlug,
  findRecipe,
  type BakeRewardResult,
} from '@/lib/items/recipes';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('play');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });
  // A guest holds nothing, so no recipe can be ready; and the sandbox writes
  // nothing. Same answer the unlock route gives.
  if (isGuest(kidId)) return Response.json({ error: 'guest cannot bake' }, { status: 403 });

  let raw: { recipe_slug?: unknown } | null;
  try {
    raw = (await request.json()) as { recipe_slug?: unknown };
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const slug = raw?.recipe_slug;
  if (typeof slug !== 'string' || slug.length === 0) {
    return Response.json({ error: 'invalid body shape' }, { status: 400 });
  }
  const recipe = findRecipe(slug);
  if (!recipe) return Response.json({ error: 'unknown recipe' }, { status: 400 });

  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidRow) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // One read of the pantry answers both "is it baked already" and "is it
  // ready": the baked row lives in the same table as the ingredients.
  const wanted = [...recipe.ingredients, bakedSlug(recipe.slug)];
  const { data: rows, error: readErr } = await sb
    .from('kid_items')
    .select('item_slug')
    .eq('kid_id', kidId)
    .in('item_slug', wanted);
  if (readErr) {
    console.warn('[bakery/bake] kid_items read failed:', readErr.message);
    return Response.json({ error: 'read_failed' }, { status: 500 });
  }
  const held = new Set((rows ?? []).map((r) => r.item_slug as string));

  if (held.has(bakedSlug(recipe.slug))) {
    return Response.json({ baked: true, alreadyBaked: true, rewards: [] });
  }

  const missing = recipe.ingredients.filter((s) => !held.has(s));
  if (missing.length > 0) {
    return Response.json({ error: 'missing_ingredients', missing }, { status: 400 });
  }

  // ---- 1. The rewards. ----
  const rewards: BakeRewardResult[] = [];
  let balance: number | null = null;

  for (const reward of recipe.rewards) {
    const { error: insertErr } = await sb.from('kid_cupcake_unlocks').insert({
      kid_id: kidId,
      kind: reward.kind,
      value: reward.value,
      cost_paid: 0,
    });

    if (!insertErr) {
      rewards.push({ ...reward, outcome: 'granted', tokens: 0 });
      continue;
    }
    if (insertErr.code !== '23505') {
      // Nothing recorded yet, so the kid can simply try again.
      console.warn('[bakery/bake] unlock insert failed:', insertErr.message);
      return Response.json({ error: `grant_failed: ${insertErr.message}` }, { status: 500 });
    }

    // Owned already: pay the Store price back, once.
    const sold = UNLOCK_CATALOG.find((c) => c.kind === reward.kind && c.value === reward.value);
    const price = sold?.cost ?? 0;
    const { data: mintData, error: mintErr } = await sb.rpc('mint_tokens', {
      p_kid: kidId,
      p_family: family.id,
      p_delta: price,
      p_reason: 'cupcake_unlock',
      p_metadata: {
        milestone_id: bakeRefundKey(recipe.slug, reward),
        bake: recipe.slug,
        kind: reward.kind,
        value: reward.value,
        refund: true,
      },
    });
    if (mintErr) {
      console.warn('[bakery/bake] refund failed:', mintErr.message);
      return Response.json({ error: `refund_failed: ${mintErr.message}` }, { status: 500 });
    }
    const row = Array.isArray(mintData) ? mintData[0] : mintData;
    if (row?.balance != null) balance = row.balance as number;
    rewards.push(
      row?.was_minted
        ? { ...reward, outcome: 'refunded', tokens: price }
        : { ...reward, outcome: 'owned', tokens: 0 },
    );
  }

  // ---- 2. The record. ----
  const { error: bakeErr } = await sb.from('kid_items').insert({
    kid_id: kidId,
    family_id: family.id,
    item_slug: bakedSlug(recipe.slug),
    source: bakeSource(recipe.slug),
  });
  if (bakeErr && bakeErr.code !== '23505') {
    // The rewards are in. Say so, and let the retry write the record.
    console.warn('[bakery/bake] baked row failed:', bakeErr.message);
    return Response.json({ error: `record_failed: ${bakeErr.message}`, rewards }, { status: 500 });
  }

  return Response.json({
    baked: true,
    alreadyBaked: false,
    recipe: { slug: recipe.slug, name: recipe.name, emoji: recipe.emoji, line: recipe.line },
    rewards,
    balance,
  });
}
