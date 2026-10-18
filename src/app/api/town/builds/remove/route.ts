// POST /api/town/builds/remove — take one of your own pieces back.
//
// Body: { id }. A kid may remove only what they built. The refund is decided
// by the remove_town_build RPC on the server clock: the full price within
// UNDO_SECS of placing it, half after that.
//
// Guests: nothing was saved, so there is nothing to delete; the client drops
// the piece itself.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { UNDO_SECS } from '@/lib/town/builds';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const id = body && typeof body === 'object' ? (body as { id?: unknown }).id : null;
  if (isGuest(kidId)) return Response.json({ removed: true, refund: 0, balance: null });
  if (typeof id !== 'string' || !UUID_RE.test(id)) {
    return Response.json({ error: 'invalid id' }, { status: 400 });
  }

  const sb = supabaseServer();
  const { data: kid } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) return Response.json({ error: 'kid not in family' }, { status: 403 });

  const { data, error } = await sb.rpc('remove_town_build', {
    p_kid: kidId,
    p_family: family.id,
    p_build: id,
    p_undo_secs: UNDO_SECS,
  });
  if (error) return Response.json({ error: `remove_failed: ${error.message}` }, { status: 500 });
  const row = (Array.isArray(data) ? data[0] : data) as
    | { balance: number; refund: number; status: string }
    | undefined;
  const status = row?.status ?? 'remove_failed';
  if (status !== 'removed') {
    return Response.json({ error: status }, { status: status === 'not_yours' ? 403 : 400 });
  }
  return Response.json({ removed: true, refund: row?.refund ?? 0, balance: row?.balance ?? 0 });
}
