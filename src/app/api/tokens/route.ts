// GET /api/tokens — current balance + recent transaction log for the
// active kid. Used by the wallet badge on /map and (future) the parent
// admin token page.
//
// Auth model matches the rest of /api/*: requireSessionOrJson()
// returns the parent's family; the active kid comes from the lw_kid
// cookie via getActiveKid(); we double-check the kid belongs to the
// family before returning data. Guest sandbox returns a synthetic
// zero-balance response so the wallet UI renders cleanly without
// having to special-case the URL.

import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

interface TokenTransactionRow {
  id: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface TokensResponse {
  balance: number;
  total_earned: number;
  total_spent: number;
  recent: TokenTransactionRow[];
}

export async function GET(): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest sandbox has no balance row — return a stable zero so UI doesn't
  // flicker between guest and real-kid sessions.
  if (isGuest(kidId)) {
    const empty: TokensResponse = {
      balance: 0,
      total_earned: 0,
      total_spent: 0,
      recent: [],
    };
    return Response.json(empty);
  }

  const sb = supabaseServer();

  // Family scope check — same defense-in-depth pattern as /api/attempts.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Balance row may not exist if the migration backfill hasn't run for
  // this kid yet (e.g. a kid created between deploy and migration).
  // Treat absence as zero — the next mint will create the row.
  const { data: balanceRow } = await sb
    .from('kid_tokens')
    .select('balance, total_earned, total_spent')
    .eq('kid_id', kidId)
    .maybeSingle();

  const { data: txRows } = await sb
    .from('token_transactions')
    .select('id, delta, reason, metadata, created_at')
    .eq('kid_id', kidId)
    .order('created_at', { ascending: false })
    .limit(20);

  const response: TokensResponse = {
    balance: (balanceRow?.balance as number | undefined) ?? 0,
    total_earned: (balanceRow?.total_earned as number | undefined) ?? 0,
    total_spent: (balanceRow?.total_spent as number | undefined) ?? 0,
    recent: (txRows ?? []) as TokenTransactionRow[],
  };

  return Response.json(response);
}
