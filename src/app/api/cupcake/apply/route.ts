// POST /api/cupcake/apply — save a CupcakeConfig as the kid's current
// avatar choice.
//
// Body: a CupcakeConfig { base, wrapper, frosting, topping, variety, hat,
// glasses, face, hatColor, glassesColor, frostingColor, wrapperColor }. The
// fields added later (hat onward) may be omitted by an older
// client and default to plain.
//
// Auth: parent session + active kid cookie. Kid must belong to the
// family.
//
// Each purchasable field must be either:
//   - free (the PLAIN_CUPCAKE default, or a free extra like face 'smile'), OR
//   - listed in kid_cupcake_unlocks for this kid
// The hat and glasses colours are free; they only have to be in the palette.
// The frosting and wrapper colours are bought like parts ('none' is free).
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
  type UnlockKind,
  PLAIN_CUPCAKE,
  UNLOCK_KINDS,
  isFreeCupcakeOption,
  parseCupcakeConfigInput,
} from '@/lib/cupcake/config';

interface UnlockRow {
  kind: UnlockKind;
  value: string;
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
  const config = parseCupcakeConfigInput(body);
  if (!config) {
    return Response.json({ error: 'invalid config' }, { status: 400 });
  }

  // Guest stays on plain — any other config is rejected. The guest
  // sandbox lives outside the family/wallet model, so we don't want
  // it accumulating customization state.
  if (isGuest(kidId)) {
    const isPlain = (Object.keys(PLAIN_CUPCAKE) as Array<keyof typeof PLAIN_CUPCAKE>)
      .every((k) => config[k] === PLAIN_CUPCAKE[k]);
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
  // field is either free or owned. Cheaper than one query per field
  // and avoids race conditions across them.
  const { data: unlocksRaw } = await sb
    .from('kid_cupcake_unlocks')
    .select('kind, value')
    .eq('kid_id', kidId);
  const unlocks = (unlocksRaw ?? []) as UnlockRow[];
  const owned = new Set(unlocks.map((u) => `${u.kind}:${u.value}`));

  for (const kind of UNLOCK_KINDS) {
    const value = config[kind];
    if (isFreeCupcakeOption(kind, value)) continue;
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
