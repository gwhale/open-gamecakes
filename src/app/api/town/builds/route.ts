// /api/town/builds — the family's town builds.
//
// GET  → { builds: TownBuild[] } for the whole family (every sibling's pieces).
// POST → place one piece. Body: { kind, gx, gy, rot }.
//
// Auth: requireSessionOrJson('play') + active kid cookie; the kid must belong
// to the current family. The price comes from the catalog (never the client),
// and the debit + the build row are written together by the place_town_build
// RPC (0059), so a kid is never charged for a piece that didn't land.
//
// Where a piece may go is checked twice. The engine knows the terrain (grass,
// roads, water, booths) and only offers cells that pass; this route re-checks
// what it can without the terrain: the cell is in the world, and it is not on a
// sibling's land. A hand-made request could still put a lamp in the sea — in
// its own family's town only, which harms no one.
//
// Guests have no family and no wallet: GET returns nothing and POST "places"
// without saving, so the demo town keeps its builds only until the page closes.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import {
  MAX_FAMILY_BUILDS,
  cellInWorld,
  findBuild,
  isBuildKind,
  siblingLandAt,
  type TownBuild,
} from '@/lib/town/builds';

const BUILD_COLUMNS = 'id, kid_id, kind, gx, gy, rot, created_at';

export async function GET(): Promise<Response> {
  const guard = await requireSessionOrJson('play');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });
  if (isGuest(kidId)) return Response.json({ builds: [] });

  const { data, error } = await supabaseServer()
    .from('town_builds')
    .select(BUILD_COLUMNS)
    .eq('family_id', family.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ builds: (data ?? []) as TownBuild[] });
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('play');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const { kind, gx, gy, rot } = b;
  if (!isBuildKind(kind)) return Response.json({ error: 'invalid kind' }, { status: 400 });
  if (!Number.isInteger(gx) || !Number.isInteger(gy)) {
    return Response.json({ error: 'invalid cell' }, { status: 400 });
  }
  const cx = gx as number;
  const cy = gy as number;
  const turn = rot === undefined ? 0 : rot;
  if (!Number.isInteger(turn) || (turn as number) < 0 || (turn as number) > 3) {
    return Response.json({ error: 'invalid rot' }, { status: 400 });
  }
  if (!cellInWorld(cx, cy)) return Response.json({ error: 'out_of_world' }, { status: 400 });
  const cost = findBuild(kind).cost;

  // Guest sandbox: nothing is saved and nothing is charged.
  if (isGuest(kidId)) {
    const build: TownBuild = {
      id: `guest-${crypto.randomUUID()}`,
      kid_id: kidId,
      kind,
      gx: cx,
      gy: cy,
      rot: turn as number,
      created_at: new Date().toISOString(),
    };
    return Response.json({ build, balance: null, cost });
  }

  const sb = supabaseServer();

  // Family-scope check, and the lands of every other kid in the family.
  const { data: kids } = await sb.from('kids').select('id, land_slug').eq('family_id', family.id);
  const rows = (kids ?? []) as Array<{ id: string; land_slug: string | null }>;
  if (!rows.some((k) => k.id === kidId)) {
    return Response.json({ error: 'kid not in family' }, { status: 403 });
  }
  const siblingLands = rows
    .filter((k) => k.id !== kidId && k.land_slug)
    .map((k) => k.land_slug as string);
  if (siblingLandAt(cx, cy, siblingLands)) {
    return Response.json({ error: 'sibling_land' }, { status: 400 });
  }

  const { data, error } = await sb.rpc('place_town_build', {
    p_kid: kidId,
    p_family: family.id,
    p_kind: kind,
    p_gx: cx,
    p_gy: cy,
    p_rot: turn,
    p_cost: cost,
    p_max: MAX_FAMILY_BUILDS,
  });
  if (error) return Response.json({ error: `place_failed: ${error.message}` }, { status: 500 });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { balance: number; build_id: string | null; created_at: string | null; status: string }
    | undefined;
  const status = row?.status ?? 'place_failed';
  if (status !== 'placed' || !row?.build_id) {
    return Response.json({ error: status, balance: row?.balance ?? 0, cost }, { status: 400 });
  }

  const build: TownBuild = {
    id: row.build_id,
    kid_id: kidId,
    kind,
    gx: cx,
    gy: cy,
    rot: turn as number,
    created_at: row.created_at ?? new Date().toISOString(),
  };
  return Response.json({ build, balance: row.balance, cost });
}
