// POST /api/town/ferry — pay the ferry fare (or arrive free by flying) and
// discover Chess Island.
//
// Chess Island is moated and has no walkable neighbours, so the normal
// /api/town/discover adjacency check rejects it. The ferry (1 token) and a
// flying rental (free) are the only ways in; both "arrive" here to persist the
// discovery + charge. The engine already revealed Chess locally on arrival, so
// this is the durable write behind that optimistic reveal — idempotent, so a
// fly-then-ferry or a retry never double-charges.
//
// Also serves Race Island, whose lands are likewise neighbour-less: you get
// there by BUS (1 token), by driving a rented ride over the Sugar Mile bridge
// (free), or by landing a flyer on it (free).
//
// Request body:  { region_slug: string, via: 'ferry' | 'bus' | 'drive' | 'fly' }
//   via === 'fly' | 'drive' → cost 0 (already paid to rent the ride)
//   via === 'ferry' | 'bus' → cost 1 (the fare), charged on the FIRST arrival
//                             only, which is what makes the trip home free
// Response 200:  { balance, status, region_slug }
//   status: 'discovered' | 'already_discovered' | 'insufficient_balance'
// Response 400/401/403/500: same shape as the rest of /api/town/*

import { type NextRequest } from 'next/server';
import { findRegion } from '@/lib/town/regions';
import { islandOf } from '@/lib/town/islands';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

/** Both paid transports cost the same single token. The fare is charged on the
 *  DISCOVERING arrival only (the RPC short-circuits once the island is known),
 *  so the trip home is always free and a kid can never be stranded offshore by
 *  an empty wallet. */
const TRANSIT_FARE = 1;

/** How the kid reached the island. Paid routes are the ones with no prior
 *  purchase; 'drive' and 'fly' are free because renting the ride already cost
 *  tokens. */
type ArrivalVia = 'ferry' | 'bus' | 'drive' | 'fly';
const PAID_VIA: ReadonlySet<ArrivalVia> = new Set<ArrivalVia>(['ferry', 'bus']);
/** Ledger reason per paid route, so the parent wallet doesn't label a bus trip
 *  as a boat trip. Must stay within the CHECK enum in 0035_bus_ride.sql. */
const VIA_REASON: Record<'ferry' | 'bus', string> = {
  ferry: 'ferry_ride',
  bus: 'bus_ride',
};

interface FerryBody {
  region_slug: string;
  via: ArrivalVia;
}

interface FerryRpcRow {
  balance: number;
  status: string;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(raw: unknown): FerryBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.region_slug !== 'string' || b.region_slug.length === 0) return null;
  if (b.via !== 'ferry' && b.via !== 'bus' && b.via !== 'drive' && b.via !== 'fly') return null;
  return { region_slug: b.region_slug, via: b.via };
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  const body = parseBody(raw);
  if (!body) return badRequest('invalid body shape');

  // Cost is server-decided, never trusted from the client (mirrors rent-vehicle).
  //
  // TWO parts, and the split matters:
  //   * the FARE buys the RIDE — charged only for public transport (ferry/bus).
  //     Arriving under your own power is fare-free; you already paid to rent it.
  //   * the LAND's unlock_cost buys the LAND — charged on EVERY route.
  //
  // That second half is new. Island lands have no walkable neighbour, so
  // /api/town/discover (which is what normally charges unlock_cost) rejects
  // them — meaning an entire island used to cost a kid just the 🪙1 fare, the
  // cheapest content in the game by a wide margin. Now a land costs the same
  // whether you walk, drive, fly or ride to it; only the fare differs.
  const paid = PAID_VIA.has(body.via);
  const fare = paid ? TRANSIT_FARE : 0;

  // Guest sandbox has no wallet — synthetic success keeps playtesting snappy.
  if (isGuest(kidId)) {
    return Response.json({ balance: 0, status: 'discovered', region_slug: body.region_slug });
  }

  // Catalog validation — must be a real, non-starter region (the ferry's island).
  const region = findRegion(body.region_slug);
  if (!region) return badRequest('unknown region');
  if (region.starter) return badRequest('starter regions need no ferry');
  const cost = fare + region.unlock_cost;

  const sb = supabaseServer();

  // Family-scope check, same defense-in-depth as the other town routes.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Two RPCs, picked by what the kid is actually being charged FOR — so the
  // parent ledger reads truthfully instead of filing every arrival as a boat
  // trip.
  //
  //   * paid transit → town_transit_ride (0035): fare + land, reason
  //     'ferry_ride' / 'bus_ride'.
  //   * arrived under own power → town_discover_region (0017): land only, reason
  //     'region_unlock' — the same RPC and the same reason a walk-up unlock uses,
  //     which is exactly what this is. Identical (balance, status) contract and
  //     the same idempotency, so it needs no new migration.
  const { data, error } = paid
    ? await sb.rpc('town_transit_ride', {
        p_kid: kidId,
        p_family: family.id,
        p_region_slug: region.slug,
        p_cost: cost,
        p_reason: VIA_REASON[body.via as 'ferry' | 'bus'],
      })
    : await sb.rpc('town_discover_region', {
        p_kid: kidId,
        p_family: family.id,
        p_region_slug: region.slug,
        p_cost: cost,
      });

  if (error) {
    console.warn('[town/ferry] rpc failed:', error.message);
    return Response.json({ error: 'ferry rpc failed' }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as FerryRpcRow | undefined;
  if (!row) {
    return Response.json({ error: 'ferry rpc returned no row' }, { status: 500 });
  }

  // ONE PAYMENT OPENS THE WHOLE ISLAND.
  // The fare + unlock_cost above bought the island, not just the land the kid
  // stepped onto, so grant every OTHER land on that island now — free. An
  // island is one place a kid decides to go; charging again for its far end
  // reads as being billed twice for the same trip.
  //
  // Granted through town_transit_ride at p_cost 0 rather than
  // town_discover_region, because that one deducts and writes an audit row
  // unconditionally — it would spray `region_unlock -0` rows across the parent
  // ledger. town_transit_ride skips both when the cost is zero. p_reason is
  // required by its guard but never written at zero cost.
  //
  // Guarded on a non-mainland island: islandOf() falls back to the mainland for
  // any unlisted region, and without this check a mainland arrival would hand
  // over every land in the town.
  const island = islandOf(region.slug);
  if (row.status === 'discovered' && island.id !== 'mainland') {
    const siblings = island.regions.filter((s) => s !== region.slug);
    for (const slug of siblings) {
      const { error: sibErr } = await sb.rpc('town_transit_ride', {
        p_kid: kidId,
        p_family: family.id,
        p_region_slug: slug,
        p_cost: 0,
        p_reason: 'ferry_ride',
      });
      // Best-effort: the kid already paid and the primary land is recorded, so a
      // failed sibling must not fail the whole arrival. They can still walk up
      // to it in-world (it is priced at 0), and a retry re-grants idempotently.
      if (sibErr) console.warn('[town/ferry] island sibling grant failed:', slug, sibErr.message);
    }
  }

  return Response.json({
    balance: row.balance,
    status: row.status,
    region_slug: region.slug,
  });
}
