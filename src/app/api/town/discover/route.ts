// POST /api/town/discover — spend tokens to reveal a fogged region.
//
// Called by PhaserTownHost when the kid confirms the unlock modal.
// The route's job is the catalog-side validations (region exists,
// not a starter, adjacent to a discovered region) — the actual
// atomic spend (balance check + deduct + insert discovery + write
// audit row) happens inside the town_discover_region Postgres
// function defined in migration 0017.
//
// Why split: the catalog lives in TS and the RPC lives in SQL. The
// RPC can't validate adjacency (it has no view of the catalog) and
// the route can't atomically spend (multi-statement transactions
// aren't exposed by supabase-js). Each layer enforces what it can.
//
// Request body:  { region_slug: string }
// Response 200:  { balance, status, region_slug }
//   status one of: 'discovered' | 'already_discovered' | 'insufficient_balance'
// Response 400:  { error } — bad body, unknown region, starter region,
//                            or adjacency not satisfied
// Response 401/403: same as the rest of /api/town/* — no kid, no family

import { type NextRequest } from 'next/server';
import { findRegion, isAdjacentToDiscovered } from '@/lib/town/regions';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

interface DiscoverBody {
  region_slug: string;
}

interface DiscoverRpcRow {
  balance: number;
  status: string;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(raw: unknown): DiscoverBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.region_slug !== 'string' || b.region_slug.length === 0) return null;
  return { region_slug: b.region_slug };
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest sandbox doesn't have a wallet — synthetic success keeps
  // the playtesting flow snappy without polluting real data.
  if (isGuest(kidId)) {
    return Response.json({
      balance: 0,
      status: 'discovered',
      region_slug: '',
    });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const body = parseBody(raw);
  if (!body) return badRequest('invalid body shape');

  // Catalog validations — must pass before we touch the database.
  const region = findRegion(body.region_slug);
  if (!region) return badRequest('unknown region');
  if (region.starter) return badRequest('starter regions are already discovered');

  const sb = supabaseServer();

  // Family-scope check, same defense-in-depth as the other town routes.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Adjacency check — the kid must already have at least one of the
  // target's neighbors discovered. This enforces the "approach to
  // unlock" rule at the API layer; the scene's approach-fog event
  // already gates this client-side, but we verify server-side too.
  const { data: discoveriesData } = await sb
    .from('kid_region_discoveries')
    .select('region_slug')
    .eq('kid_id', kidId);
  const discovered = (discoveriesData ?? []).map(
    (row) => row.region_slug as string,
  );

  if (!isAdjacentToDiscovered(region.slug, discovered)) {
    return badRequest('region not adjacent to a discovered one');
  }

  // Hand off to the atomic RPC. It checks balance under FOR UPDATE
  // lock so two concurrent discovers can't both spend the wallet down.
  const { data, error } = await sb.rpc('town_discover_region', {
    p_kid: kidId,
    p_family: family.id,
    p_region_slug: region.slug,
    p_cost: region.unlock_cost,
  });

  if (error) {
    console.warn('[town/discover] rpc failed:', error.message);
    return Response.json(
      { error: 'discover rpc failed' },
      { status: 500 },
    );
  }

  // Postgres SETOF returns an array; the function yields one row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | DiscoverRpcRow
    | undefined;
  if (!row) {
    return Response.json(
      { error: 'discover rpc returned no row' },
      { status: 500 },
    );
  }

  return Response.json({
    balance: row.balance,
    status: row.status,
    region_slug: region.slug,
  });
}
