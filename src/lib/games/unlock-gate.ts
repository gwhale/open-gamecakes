// Server-side entitlement check for priced games.
//
// A game page is the ONE gate that matters: the All Games menu and the town
// booth both just navigate to /games/<slug>, so gating the page covers both and
// also covers a kid (or a curious parent) typing the URL directly. The menu's
// lock badge is presentation; this is enforcement.
//
// Free games — everything that existed before GameInfo.unlock_cost — short
// circuit to true without a query, so this costs nothing on the pages that
// don't need it.

import type { SupabaseClient } from '@supabase/supabase-js';
import { isGuest } from '@/lib/auth/guest';
import { gameUnlockCost } from '@/lib/games/registry';

/** Is this kid entitled to play this game right now? */
export async function isGameUnlockedForKid(
  sb: SupabaseClient,
  kidId: string | null,
  gameSlug: string,
): Promise<boolean> {
  // Free game (no unlock_cost in the registry) — nothing to own.
  if (gameUnlockCost(gameSlug) <= 0) return true;
  if (!kidId) return false;
  // The guest sandbox has no wallet and no entitlement rows; gating it would
  // make the demo unplayable for the exact games we most want shown off.
  if (isGuest(kidId)) return true;

  const { data } = await sb
    .from('kid_game_unlocks')
    .select('game_slug')
    .eq('kid_id', kidId)
    .eq('game_slug', gameSlug)
    .maybeSingle();
  return Boolean(data);
}

/** Every priced game this kid already owns — for the All Games menu, which
 *  needs the whole set at once rather than one lookup per card. */
export async function unlockedGamesForKid(
  sb: SupabaseClient,
  kidId: string | null,
): Promise<Set<string>> {
  if (!kidId) return new Set();
  const { data } = await sb
    .from('kid_game_unlocks')
    .select('game_slug')
    .eq('kid_id', kidId);
  return new Set((data ?? []).map((r) => r.game_slug as string));
}
