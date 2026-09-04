// POST /api/cupcake/apply — save a CupcakeConfig as the kid's current
// avatar choice.
//
// Body: a complete CupcakeConfig { wrapper, frosting, topping, variety }
//
// Auth: parent session + active kid cookie. Kid must belong to the
// family.
//
// Each field must be either:
//   - the plain default (in PLAIN_CUPCAKE), OR
//   - listed in kid_cupcake_unlocks for this kid
//
// Anything else is rejected — prevents a client from setting an
// option they haven't earned. The validation is server-authoritative;
// don't trust the UI's gating alone.

import { NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import {
  type CupcakeConfig,
  PLAIN_CUPCAKE,
  isValidCupcakeConfig,
} from '@/lib/cupcake/config';

interface UnlockRow {
  kind: 'base' | 'wrapper' | 'frosting' | 'topping' | 'variety';
  value: string;
}

export async function POST(req: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
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
  if (!isValidCupcakeConfig(body)) {
    return Response.json({ error: 'invalid config' }, { status: 400 });
  }
  const config = body as CupcakeConfig;

  // Guest stays on plain — any other config is rejected. The guest
  // sandbox lives outside the family/wallet model, so we don't want
  // it accumulating customization state.
  if (isGuest(kidId)) {
    const isPlain =
      config.base === PLAIN_CUPCAKE.base &&
      config.wrapper === PLAIN_CUPCAKE.wrapper &&
      config.frosting === PLAIN_CUPCAKE.frosting &&
      config.topping === PLAIN_CUPCAKE.topping &&
      config.variety === PLAIN_CUPCAKE.variety;
    if (!isPlain) {
      return Response.json({ error: 'guest must stay plain' }, { status: 403 });
    }
    return Response.json({ config });
  }

  const sb = supabaseServer();

  // Family-scope check.
  const { data: kid } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kid) {
    return Response.json({ error: 'kid not in family' }, { status: 403 });
  }

  // Fetch ownership ledger for this kid in one query, then check each
  // field is either plain-default or owned. Cheaper than 4 single-
  // option queries and avoids race conditions across them.
  const { data: unlocksRaw } = await sb
    .from('kid_cupcake_unlocks')
    .select('kind, value')
    .eq('kid_id', kidId);
  const unlocks = (unlocksRaw ?? []) as UnlockRow[];
  const owned = new Set(unlocks.map((u) => `${u.kind}:${u.value}`));

  const fields: Array<['base' | 'wrapper' | 'frosting' | 'topping' | 'variety', string, string]> = [
    ['base',     config.base,     PLAIN_CUPCAKE.base],
    ['wrapper',  config.wrapper,  PLAIN_CUPCAKE.wrapper],
    ['frosting', config.frosting, PLAIN_CUPCAKE.frosting],
    ['topping',  config.topping,  PLAIN_CUPCAKE.topping],
    ['variety',  config.variety,  PLAIN_CUPCAKE.variety],
  ];
  for (const [kind, value, plainValue] of fields) {
    if (value === plainValue) continue;
    if (!owned.has(`${kind}:${value}`)) {
      return Response.json(
        { error: `not_owned: ${kind}.${value}` },
        { status: 403 },
      );
    }
  }

  // All fields validated — save.
  const { error: updateErr } = await sb
    .from('kids')
    .update({ cupcake_config: config })
    .eq('id', kidId);
  if (updateErr) {
    return Response.json(
      { error: `update_failed: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({ config });
}
