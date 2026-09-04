// GET /api/town/state — everything the Phaser town scene needs to
// render itself for the active kid.
//
// One round-trip on /town page load: catalog (static), discovered
// region slugs, last known avatar position, and current token balance.
// PR 3's town page calls this server-side from the route segment so
// the initial scene render has everything inline; PR 4+ will also
// re-fetch client-side after a successful unlock to refresh
// `discovered` and `balance` without a full page reload.
//
// Auth model matches /api/attempts and /api/tokens: the parent's
// session cookie scopes us to a family; the active kid comes from
// the lw_kid cookie. We double-check the kid belongs to the family
// to defend against a stale cookie pointing at a kid from a
// different household. Guest sandbox returns a synthetic response
// (starters unlocked, balance 0, no position) so the scene works
// in playtesting without a real wallet.

import { REGIONS, getStarterRegions } from '@/lib/town/regions';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

interface TownPosition {
  region_slug: string;
  x: number;
  y: number;
}

interface TownStateResponse {
  /** Full region catalog. Static — included so the client doesn't
   *  need a second round-trip. Cheap (8 small objects). */
  regions: typeof REGIONS;
  /** Slugs of regions this kid has discovered, including starters. */
  discovered: string[];
  /** Where the avatar was last standing, or null if the kid hasn't
   *  moved yet (scene defaults to the spawnPoint of their most
   *  recently-discovered starter region). */
  position: TownPosition | null;
  /** Current spendable token balance — also returned by /api/tokens
   *  but inlined here so the unlock UI can render with one fetch. */
  balance: number;
}

export async function GET(): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest sandbox: synthesize a stable shape so the scene mounts
  // cleanly during playtesting. Starters are revealed; nothing
  // earned, nothing spent, no persisted position.
  if (isGuest(kidId)) {
    const synthetic: TownStateResponse = {
      regions: REGIONS,
      discovered: getStarterRegions().map((r) => r.slug),
      position: null,
      balance: 0,
    };
    return Response.json(synthetic);
  }

  const sb = supabaseServer();

  // Family-scope check — cheap defense-in-depth even though the
  // cookie is httpOnly and can't be forged from JS.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Three reads in parallel — each is independent and small.
  const [discoveriesRes, positionRes, balanceRes] = await Promise.all([
    sb.from('kid_region_discoveries')
      .select('region_slug')
      .eq('kid_id', kidId),
    sb.from('kid_avatar_position')
      .select('region_slug, x, y')
      .eq('kid_id', kidId)
      .maybeSingle(),
    sb.from('kid_tokens')
      .select('balance')
      .eq('kid_id', kidId)
      .maybeSingle(),
  ]);

  // Discoveries should always have at least the two starter rows
  // (seeded by 0017 + the kids_init_town_starters trigger). If the
  // read errors, we return an empty array — the scene will still
  // render with all regions fogged, which is recoverable on retry.
  const discovered = (discoveriesRes.data ?? []).map(
    (row) => row.region_slug as string,
  );

  // Position is null until the kid first walks somewhere. The scene
  // falls back to the catalog spawnPoint of the most recently
  // discovered starter region.
  const position = positionRes.data
    ? {
        region_slug: positionRes.data.region_slug as string,
        x: positionRes.data.x as number,
        y: positionRes.data.y as number,
      }
    : null;

  // Balance row should exist (kids_init_tokens trigger + 0016 seed).
  // If it doesn't for some reason, treat as zero — the next mint
  // will create the row.
  const balance = (balanceRes.data?.balance as number | undefined) ?? 0;

  const response: TownStateResponse = {
    regions: REGIONS,
    discovered,
    position,
    balance,
  };

  return Response.json(response);
}
