// POST /api/town/clear-storm — pay a few Sugar Tokens to blow a weather storm's
// pink fog off a re-locked game land (the alternative to waiting it out free).
//
// Body: { region_slug: string }
//
// Auth: requireSessionOrJson (parent cookie) + active kid cookie; the kid must
// belong to the current family. Mirrors /api/cupcake/unlock's ad-hoc spend.
//
// Flow:
//   1. Validate body.
//   2. Check kid_tokens.balance >= STORM_CLEAR_COST. Reject 400 if short.
//   3. Debit via the shared mint_tokens RPC with reason 'storm_clear'
//      (0028 extends the reason CHECK — without it the debit fails silently).
//   4. Return { balance }.
//
// The storm itself is a client-side ambient event; this route only moves
// tokens. Guests have no real wallet, so they clear free (mirrors discover).

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { STORM_CLEAR_COST } from '@/lib/town/weather-config';

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });
  // Guest sandbox has no real wallet — clear free (mirrors /api/town/discover).
  if (isGuest(kidId)) {
    return Response.json({ balance: 0, cleared: true });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const regionSlug =
    body && typeof body === 'object' && typeof (body as { region_slug?: unknown }).region_slug === 'string'
      ? (body as { region_slug: string }).region_slug
      : null;
  if (!regionSlug) {
    return Response.json({ error: 'invalid body' }, { status: 400 });
  }

  const sb = supabaseServer();

  // Family-scope check — kid must belong to this parent's family.
  const { data: kid } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) {
    return Response.json({ error: 'kid not in family' }, { status: 403 });
  }

  // Balance check — server is the source of truth even though the UI gates it.
  const { data: wallet } = await sb
    .from('kid_tokens')
    .select('balance')
    .eq('kid_id', kidId)
    .maybeSingle();
  const balance = (wallet?.balance as number | undefined) ?? 0;
  if (balance < STORM_CLEAR_COST) {
    return Response.json(
      { error: 'insufficient_balance', balance, cost: STORM_CLEAR_COST },
      { status: 400 },
    );
  }

  // Debit via the shared mint_tokens RPC (negative delta = spend).
  const { data: mintData, error: mintErr } = await sb.rpc('mint_tokens', {
    p_kid: kidId,
    p_family: family.id,
    p_delta: -STORM_CLEAR_COST,
    p_reason: 'storm_clear',
    p_metadata: { region_slug: regionSlug },
  });
  if (mintErr) {
    return Response.json({ error: `debit_failed: ${mintErr.message}` }, { status: 500 });
  }

  const row = Array.isArray(mintData) ? mintData[0] : mintData;
  const newBalance = (row?.balance as number | undefined) ?? balance - STORM_CLEAR_COST;
  return Response.json({ balance: newBalance, cleared: true });
}
