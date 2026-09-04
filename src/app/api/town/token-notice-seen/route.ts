// POST /api/town/token-notice-seen — mark parent token-change notices as seen.
//
// Called by ThreeTownHost as the kid dismisses each "a grown-up added/removed
// coins" card, so it doesn't re-show. Records one row per token_transactions.id
// in kid_token_notice_seen. Idempotent (composite PK) — a repeat is a no-op.
//
// Request body:  { transaction_ids: string[] }  (uuids; 1..50)
// Response 200:  { ok: true }
// Response 400/401/403/500: same shape as the rest of /api/town/*

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const ids = (raw as Record<string, unknown>).transaction_ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) return null;
  const ok = ids.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
  return ok.length > 0 ? ok : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest sandbox has no wallet / no parent grants — synthetic success.
  if (isGuest(kidId)) return Response.json({ ok: true });

  const raw = await request.json().catch(() => null);
  const ids = parseBody(raw);
  if (!ids) return badRequest('invalid body shape');

  const sb = supabaseServer();

  // Family-scope check, same defense-in-depth as the other town routes.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Insert-ignore: composite PK (kid_id, transaction_id) makes repeats no-ops.
  const rows = ids.map((transaction_id) => ({
    kid_id: kidId,
    family_id: family.id,
    transaction_id,
  }));
  const { error } = await sb
    .from('kid_token_notice_seen')
    .upsert(rows, { onConflict: 'kid_id,transaction_id', ignoreDuplicates: true });

  if (error) {
    console.warn('[town/token-notice-seen] upsert failed:', error.message);
    return Response.json({ error: 'token-notice-seen write failed' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
