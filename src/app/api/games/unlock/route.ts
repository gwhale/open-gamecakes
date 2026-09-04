// POST /api/games/unlock — spend Sugar Tokens to unlock one game, forever.
//
// Body: { gameSlug: string }
//
// Games have always come free with their land. A game may now carry its own
// price (GameInfo.unlock_cost, from the GAME tier in lib/tokens/economy). Every
// game that existed before that field stays at 0 and never gates — re-gating
// something a kid already plays would be taking it away — so in practice this
// route only ever fires for games added from here on.
//
// The spend + entitlement happen atomically in unlock_kid_game (0037), which
// locks the wallet, treats a repeat purchase as idempotent rather than a second
// charge, and writes a 'game_unlock' ledger row.
//
// Response 200: { gameSlug, balance, status }
//   status: 'unlocked' | 'already_unlocked' | 'insufficient_balance'

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { findGame, gameUnlockCost } from '@/lib/games/registry';

interface UnlockBody {
  gameSlug: string;
}

function isValidBody(x: unknown): x is UnlockBody {
  if (!x || typeof x !== 'object') return false;
  const b = x as Record<string, unknown>;
  return typeof b.gameSlug === 'string' && b.gameSlug.length > 0;
}

interface UnlockRow {
  balance: number;
  status: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  const raw = await request.json().catch(() => null);
  if (!isValidBody(raw)) {
    return Response.json({ error: 'invalid body shape' }, { status: 400 });
  }

  // Validate against the catalog before touching the DB, so a crafted slug
  // can't create an entitlement row for a game that doesn't exist.
  const game = findGame(raw.gameSlug);
  if (!game) return Response.json({ error: 'unknown game' }, { status: 400 });

  // Server-derived price — never trust a client number (same rule as
  // rent-vehicle, land upgrade and the transit fare).
  const cost = gameUnlockCost(game.slug);
  if (cost <= 0) {
    // Free game: nothing to buy. Say so rather than writing a 0-cost row, so a
    // client bug can't quietly fill the table with entitlements nobody needs.
    return Response.json({ gameSlug: game.slug, balance: 0, status: 'already_unlocked' });
  }

  // Guest sandbox has no wallet — synthetic success keeps playtesting snappy,
  // matching the ferry/transit route.
  if (isGuest(kidId)) {
    return Response.json({ gameSlug: game.slug, balance: 0, status: 'unlocked' });
  }

  const sb = supabaseServer();

  // Family-scope check — same defense-in-depth as the other spend routes.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  const { data, error } = await sb.rpc('unlock_kid_game', {
    p_kid: kidId,
    p_family: family.id,
    p_game_slug: game.slug,
    p_cost: cost,
  });

  if (error) {
    console.warn('[games/unlock] rpc failed:', error.message);
    return Response.json({ error: 'unlock rpc failed' }, { status: 500 });
  }

  const row = (Array.isArray(data) ? data[0] : data) as UnlockRow | undefined;
  if (!row) {
    return Response.json({ error: 'unlock rpc returned no row' }, { status: 500 });
  }

  return Response.json({
    gameSlug: game.slug,
    balance: row.balance,
    status: row.status,
  });
}
