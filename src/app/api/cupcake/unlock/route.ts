// POST /api/cupcake/unlock — debit tokens to unlock a cupcake option.
//
// Body: { kind: 'wrapper' | 'frosting' | 'topping' | 'variety', value: string }
//
// Auth: requireSessionOrJson (parent cookie) + active kid cookie.
// Kid must belong to the current family.
//
// Flow:
//   1. Validate body + look up the cost from UNLOCK_CATALOG.
//   2. Check kid_tokens.balance >= cost. Reject 400 if not.
//   3. INSERT kid_cupcake_unlocks (kid_id, kind, value, cost_paid) —
//      the primary key (kid_id, kind, value) gives us idempotency:
//      a duplicate request for the same option fails with
//      unique_violation BEFORE we touch the wallet.
//   4. Call mint_tokens RPC with delta = -cost. The RPC accepts
//      negative deltas and updates total_spent automatically.
//   5. Return { balance, owned: { kind, value } }.
//
// If step 4 fails after step 3 succeeded, the unlock row exists but
// no tokens were debited — the kid gets the option for free. That's
// the failure mode I prefer over "tokens spent but no option owned"
// (which a kid notices immediately). Acceptable for current scale;
// a real transaction-safe version would need a single RPC.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { UNLOCK_CATALOG } from '@/lib/cupcake/config';

interface UnlockBody {
  kind: 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety';
  value: string;
}

function isValidBody(x: unknown): x is UnlockBody {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  return (
    typeof b.kind === 'string' &&
    ['base', 'wrapper', 'frosting', 'topping', 'variety'].includes(b.kind) &&
    typeof b.value === 'string' &&
    b.value.length > 0
  );
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });
  // Guest can't unlock — sandbox has no real wallet.
  if (isGuest(kidId)) {
    return Response.json({ error: 'guest cannot unlock' }, { status: 403 });
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

  const item = UNLOCK_CATALOG.find(
    (c) => c.kind === body.kind && c.value === body.value,
  );
  if (!item) {
    return Response.json({ error: 'unknown unlock' }, { status: 400 });
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

  // Balance check — fail fast if the kid can't afford. The UI also
  // gates the button, but server validation is the source of truth.
  const { data: wallet } = await sb
    .from('kid_tokens')
    .select('balance')
    .eq('kid_id', kidId)
    .maybeSingle();
  const balance = (wallet?.balance as number | undefined) ?? 0;
  if (balance < item.cost) {
    return Response.json(
      { error: 'insufficient_balance', balance, cost: item.cost },
      { status: 400 },
    );
  }

  // Insert the entitlement first — the primary key (kid_id, kind,
  // value) makes this idempotent. If the row already exists, we
  // return success-with-cached-balance and skip the debit.
  const { error: insertErr } = await sb
    .from('kid_cupcake_unlocks')
    .insert({
      kid_id: kidId,
      kind: body.kind,
      value: body.value,
      cost_paid: item.cost,
    });
  if (insertErr) {
    // unique_violation is expected for double-tap or stale-client
    // retries — treat as a successful no-op so the client UI can
    // refresh without surfacing an error.
    if (insertErr.code === '23505') {
      return Response.json({
        balance,
        owned: { kind: body.kind, value: body.value },
        alreadyOwned: true,
      });
    }
    return Response.json(
      { error: `insert_failed: ${insertErr.message}` },
      { status: 500 },
    );
  }

  // Debit tokens via the shared mint_tokens RPC with a negative
  // delta. The RPC updates total_spent automatically (mirrors the
  // existing parent-grant + session-drip flows).
  const { data: mintData, error: mintErr } = await sb.rpc('mint_tokens', {
    p_kid: kidId,
    p_family: family.id,
    p_delta: -item.cost,
    p_reason: 'cupcake_unlock',
    p_metadata: {
      kind: body.kind,
      value: body.value,
    },
  });

  if (mintErr) {
    // Unlock row exists but debit failed — kid got the option for
    // free. Log + return success so the UI still updates. A future
    // reconciliation job could catch these.
    console.warn('[cupcake/unlock] debit failed:', mintErr.message);
    return Response.json({
      balance,
      owned: { kind: body.kind, value: body.value },
      debitFailed: true,
    });
  }

  const row = Array.isArray(mintData) ? mintData[0] : mintData;
  const newBalance = (row?.balance as number | undefined) ?? balance - item.cost;

  return Response.json({
    balance: newBalance,
    owned: { kind: body.kind, value: body.value },
  });
}
