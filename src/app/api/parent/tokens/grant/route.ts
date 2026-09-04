// POST /api/parent/tokens/grant — manually credit OR debit a kid's wallet (Sugar Tokens).
//
// Two callers, one write path:
//   • The /parent/tokens page posts a plain HTML form (progressive
//     enhancement, no JS) with two submit buttons (Add / Remove) →
//     we 303-redirect back with ?granted / ?removed / ?error.
//   • The "Give Sugar Tokens" panel on /parent/kid/[kidId] posts JSON (fetch) →
//     we return JSON { ok, balance, granted } so it can update the balance
//     in place without a reload. The panel only ever gifts, so it's add-only.
// The content-type decides the response shape; the auth + mint logic is shared.
//
// Body:
//   kidId: uuid
//   delta: int 1..GRANT_MAX  (magnitude; always positive)
//   action?: 'add' | 'remove'  (form only; default 'add'; remove is clamped to balance)
//   note?: string (free text — e.g. "Chores", stored in metadata.note)
//
// Behavior:
//   - Auth: must be a logged-in parent who owns the kid's family.
//   - Calls the mint_tokens RPC with reason='parent_grant'. Idempotency
//     skips automatically because parent grants don't carry an attempt_id.

import { type NextRequest } from 'next/server';
import { getCurrentFamily } from '@/lib/auth/family';
import { isParentMode } from '@/lib/auth/parent-mode';
import { supabaseServer } from '@/lib/supabase/server';

/** Soft cap to keep accidental keystrokes from gifting a million Sugar Tokens.
 *  Parents can grant multiple times; this just guards a typo in the field. */
const GRANT_MAX = 100;

const TOKENS_PATH = '/parent/tokens';

function redirect303(url: string): Response {
  return new Response(null, { status: 303, headers: { Location: url } });
}

interface MintRpcRow {
  balance: number;
  was_minted: boolean;
}

export async function POST(request: NextRequest): Promise<Response> {
  const isJson = (request.headers.get('content-type') ?? '').includes('application/json');

  // Shape-aware failure: JSON callers get a status + JSON; form callers get a
  // 303 back to the tokens page with an ?error code.
  const fail = (code: string, status: number): Response =>
    isJson
      ? Response.json({ ok: false, error: code }, { status })
      : redirect303(`${TOKENS_PATH}?error=${code}`);

  const family = await getCurrentFamily();
  if (!family) return isJson ? Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) : redirect303('/login');

  // Grown-up-only: gifting/removing Sugar Tokens is a parent action. Even
  // though the family session is valid, a kid in the driver's seat must not
  // be able to credit their own wallet by POSTing here directly.
  if (!(await isParentMode(family.id))) {
    return isJson
      ? Response.json({ ok: false, error: 'grown_up_mode_required' }, { status: 403 })
      : redirect303('/grownups?redirect=/parent/tokens');
  }

  // Parse either JSON (the "Give Sugar Tokens" panel) or form-encoded (the
  // /parent/tokens admin form) into the same fields.
  let kidId = '';
  let deltaRaw = '';
  let note = '';
  let action: 'add' | 'remove' = 'add';
  if (isJson) {
    // The JSON panel only ever gifts Sugar Tokens, so action stays 'add'.
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    kidId = String(body.kidId ?? '').trim();
    deltaRaw = String(body.delta ?? '').trim();
    note = String(body.note ?? '').trim().slice(0, 200);
  } else {
    const form = await request.formData();
    kidId = String(form.get('kidId') ?? '').trim();
    deltaRaw = String(form.get('delta') ?? '').trim();
    note = String(form.get('note') ?? '').trim().slice(0, 200);
    // Two submit buttons on the form post action=add|remove. Default to add so an
    // old cached form (single "Grant" button, no action field) still credits.
    action = String(form.get('action') ?? 'add').trim() === 'remove' ? 'remove' : 'add';
  }

  if (!kidId) return fail('missing_kid', 400);

  const amount = Number.parseInt(deltaRaw, 10);
  if (!Number.isFinite(amount) || amount < 1 || amount > GRANT_MAX) {
    return fail('bad_amount', 400);
  }

  const sb = supabaseServer();

  // Family-scope check — kid must belong to this parent's family.
  const { data: kid } = await sb
    .from('kids')
    .select('id, name')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) return fail('unknown_kid', 403);

  // Resolve the signed delta. Removals are clamped to the current balance so a
  // parent can never push a wallet negative (mint_tokens accepts negatives —
  // the store debits the same way — but the wallet floor is our rule).
  let delta = amount;
  if (action === 'remove') {
    const { data: wallet } = await sb
      .from('kid_tokens')
      .select('balance')
      .eq('kid_id', kidId)
      .maybeSingle();
    const balance = (wallet?.balance as number | undefined) ?? 0;
    const take = Math.min(amount, balance);
    if (take <= 0) return fail('nothing_to_remove', 400);
    delta = -take;
  }

  const metadata: Record<string, unknown> = {
    granted_by_user_id: family.owner_user_id,
    action,
  };
  if (note) metadata.note = note;

  const { data, error } = await sb.rpc('mint_tokens', {
    p_kid: kidId,
    p_family: family.id,
    p_delta: delta,
    p_reason: 'parent_grant',
    p_metadata: metadata,
  });

  if (error) {
    console.warn('[parent/tokens/grant] mint_tokens failed:', error.message);
    return fail('mint_failed', 500);
  }

  // Sanity check the RPC returned a minted row. mint_tokens always returns one.
  const row = (Array.isArray(data) ? data[0] : data) as MintRpcRow | undefined;
  if (!row || !row.was_minted) {
    return fail('mint_failed', 500);
  }

  const magnitude = Math.abs(delta);
  if (isJson) {
    return Response.json({ ok: true, balance: row.balance, granted: magnitude });
  }
  const param = action === 'remove' ? 'removed' : 'granted';
  return redirect303(`${TOKENS_PATH}?${param}=${magnitude}&kid=${kidId}`);
}
