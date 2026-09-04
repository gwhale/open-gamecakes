// POST /api/land/upgrade — spend Sugar Tokens to evolve a kid's own land one
// stage (Plot → Cottage → Tower → Castle). See src/lib/town/land-evolution.ts.
//
// Body: { regionSlug: string }
//
// Auth: requireSessionOrJson (parent cookie) + active kid cookie. The active
// kid must be the LAND'S OWNER — kid.name (case-insensitive) must equal the
// kids.land_slug. This is owner-only: a kid evolves THEIR land with
// their own tokens; one sibling cannot upgrade the other's land.
//
// Spend + level bump happen atomically in the upgrade_kid_land RPC (0027),
// which locks the wallet, guards p_expected_level against double/stale buys,
// deducts the server-derived cost, and writes a 'land_upgrade' ledger row.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { findRegion } from '@/lib/town/regions';
import {
  clampLandLevel,
  costForLevel,
  MAX_LAND_LEVEL,
} from '@/lib/town/land-evolution';

interface UpgradeBody {
  regionSlug: string;
}

function isValidBody(x: unknown): x is UpgradeBody {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  return typeof b.regionSlug === 'string' && b.regionSlug.length > 0;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });
  if (isGuest(kidId)) {
    return Response.json({ error: 'guest cannot upgrade' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  if (!isValidBody(body)) {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  const region = findRegion(body.regionSlug);
  if (!region || !region.kidLand) {
    return Response.json({ error: 'not_a_land' }, { status: 400 });
  }

  const sb = supabaseServer();

  // Family-scope + owner check in one read: the active kid must belong to this
  // family AND own this land (kids.land_slug — DB data, never a name match).
  const { data: kid } = await sb
    .from('kids')
    .select('id, land_slug')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) {
    return Response.json({ error: 'kid not in family' }, { status: 403 });
  }
  if (((kid.land_slug as string | null) ?? null) !== region.slug) {
    return Response.json({ error: 'not_owner' }, { status: 403 });
  }

  // Current level from the land's discovery row (starters always have one).
  const { data: landRow } = await sb
    .from('kid_region_discoveries')
    .select('level')
    .eq('kid_id', kidId)
    .eq('region_slug', region.slug)
    .maybeSingle();
  // A STARTER land needs no discovery row to be owned — the catalog says every
  // kid has it from day one, and the client renders it unfogged off `starter`
  // alone with no DB read. The row only exists here to carry `level`.
  //
  // Materialize it on demand rather than rejecting. Starter membership lives in
  // TWO places that had drifted: regions.ts marks four regions `starter: true`,
  // while the kids_init_town_starters trigger hardcodes only town-square and
  // cookie-corner. The per-kid lands (see regions.local.ts) were added
  // to the catalog afterwards with no trigger update and no backfill, so NO kid
  // had a row for their own land and every upgrade died here as 'land_not_owned'
  // — the panel showed "Could not upgrade — try again." and land_upgrade never
  // once succeeded in production.
  //
  // Deriving the row from the TS catalog at the point of use is what stops this
  // recurring: the catalog is authoritative, so a fifth starter added later can
  // never again be un-buildable just because the trigger wasn't updated too.
  let currentLevel: number;
  if (!landRow) {
    if (!region.starter) {
      return Response.json({ error: 'land_not_owned' }, { status: 400 });
    }
    const { error: seedErr } = await sb
      .from('kid_region_discoveries')
      .upsert(
        { kid_id: kidId, family_id: family.id, region_slug: region.slug },
        { onConflict: 'kid_id,region_slug', ignoreDuplicates: true },
      );
    if (seedErr) {
      return Response.json(
        { error: `land_seed_failed: ${seedErr.message}` },
        { status: 500 },
      );
    }
    currentLevel = 0; // a freshly materialized starter is always at Plot
  } else {
    currentLevel = clampLandLevel(landRow.level);
  }
  const nextLevel = currentLevel + 1;
  if (nextLevel > MAX_LAND_LEVEL) {
    return Response.json({ error: 'maxed', level: currentLevel }, { status: 400 });
  }

  // Server-authoritative cost — never trust a client price.
  const cost = costForLevel(nextLevel);
  if (cost === null) {
    return Response.json({ error: 'maxed', level: currentLevel }, { status: 400 });
  }

  const { data: rpcData, error: rpcErr } = await sb.rpc('upgrade_kid_land', {
    p_kid: kidId,
    p_family: family.id,
    p_region_slug: region.slug,
    p_expected_level: currentLevel,
    p_cost: cost,
    p_max_level: MAX_LAND_LEVEL,
  });
  if (rpcErr) {
    return Response.json(
      { error: `upgrade_failed: ${rpcErr.message}` },
      { status: 500 },
    );
  }

  const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
  const status = (row?.status as string | undefined) ?? 'unknown';
  const level = (row?.level as number | undefined) ?? currentLevel;
  const balance = (row?.balance as number | undefined) ?? 0;

  if (status !== 'upgraded') {
    // stale / maxed / insufficient_balance / unknown_land — 400 with detail so
    // the client can refresh its view without surfacing a hard error.
    return Response.json({ error: status, level, balance }, { status: 400 });
  }

  return Response.json({ regionSlug: region.slug, level, balance, status });
}
