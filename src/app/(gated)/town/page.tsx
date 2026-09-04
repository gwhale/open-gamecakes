// /town — Gamecakes City explorable map.
//
// PR 3 ships an empty walkable city: kid taps anywhere, avatar walks,
// camera follows. All 8 regions visible as colored tiles. PR 4 adds
// building sprites + game launching; PR 5 adds fog of war + unlock.
//
// Server component reads the kid + their discoveries + last-known
// position + token balance directly from Supabase (skipping the
// /api/town/state round-trip per the plan: this page is the only
// caller, so a server-side query is one less hop and keeps the
// initial render dependency-free).
//
// Authentication piggybacks on the (gated) layout — every page in
// this group already requires a logged-in family. We re-resolve the
// active kid here because Server Components don't share state with
// the layout above them.

import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { isGuest, GUEST_KID_ID } from '@/lib/auth/guest';
import {
  REGIONS,
  getStarterRegions,
  findRegion,
  type Region,
} from '@/lib/town/regions';
import ThreeTownHost from '@/components/town/ThreeTownHost';
import NeedleTownHost from '@/components/town/NeedleTownHost';
import type { TokenNotice } from '@/components/town/TokenNoticeCard';
import { inferKidGrade } from '@/lib/trivia/infer-grade';
import { coerceCupcakeConfig, type CupcakeConfig } from '@/lib/cupcake/config';
import { clampLandLevel } from '@/lib/town/land-evolution';
import { isVehicleKind } from '@/lib/town/vehicles';
import { deriveTownTopicToken } from '@/lib/realtime/topic';

interface KidRow {
  id: string;
  name: string;
  avatar: string;
  cupcake_config: CupcakeConfig | null;
  family_id: string;
  /** Slug of the per-kid land this kid owns, or null. See migration 0043. */
  land_slug: string | null;
}

interface SpawnState {
  x: number;
  y: number;
  region_slug: string;
}

/** How recently the avatar position must have been saved for it to beat the
 *  home-base rule below. /town is not just "the page you open" — it's also
 *  where every game's Back button lands, and the engine force-saves the spot
 *  right before it navigates into a booth. So a position this fresh means "the
 *  kid stepped out and came back", and sending them home instead strands them
 *  on the mainland after playing on Chess Isle (bug ticket, 2026-07-25).
 *  Anything older is treated as a new visit, which still starts at home. */
const RESUME_WINDOW_MS = 30 * 60 * 1000;

/** Pick where to drop the avatar on first mount. A kid who OWNS a per-kid land
 *  (kids.land_slug) starts on their own land — it's their home base, so
 *  opening the town drops them there regardless of where they last wandered,
 *  UNLESS they were just here (see RESUME_WINDOW_MS), in which case we put them
 *  back exactly where they left. Otherwise: the last-known position, else the
 *  spawnPoint of the kid's most-recently-discovered starter region, else the
 *  catalog's first starter. */
function pickSpawn(
  position: SpawnState | null,
  discovered: string[],
  ownedLandSlug?: string | null,
  positionSavedAt?: string | null,
): SpawnState {
  const known = position && findRegion(position.region_slug) ? position : null;

  // Resuming a session in progress — beats home base, so a round trip through
  // a game doesn't move the kid.
  const savedMs = positionSavedAt ? Date.parse(positionSavedAt) : NaN;
  if (known && Number.isFinite(savedMs) && Date.now() - savedMs < RESUME_WINDOW_MS) {
    return known;
  }

  // Home base next: spawn on the kid's own land if they have one. Per-kid
  // lands are starters (unlock_cost 0), so they're always accessible.
  const home = ownedLandSlug ? findRegion(ownedLandSlug) : undefined;
  if (home) {
    return { x: home.spawnPoint.x, y: home.spawnPoint.y, region_slug: home.slug };
  }

  if (known) return known;

  // Find the most-recently-discovered starter (the kid likely played
  // there last). With only 2 starters today this is essentially
  // "town-square or cookie-corner"; the more general logic future-proofs
  // us if we ever add more starters.
  const starterSlugs = new Set(getStarterRegions().map((r) => r.slug));
  const recentStarter = [...discovered].reverse().find((s) => starterSlugs.has(s));
  const region: Region =
    (recentStarter ? findRegion(recentStarter) : undefined) ??
    getStarterRegions()[0] ??
    REGIONS[0];

  return {
    x: region.spawnPoint.x,
    y: region.spawnPoint.y,
    region_slug: region.slug,
  };
}

/** Map each per-kid land to the owning kid's cupcake so the town renders every
 *  kid land wearing its owner's avatar — no matter which kid is currently
 *  viewing. Ownership comes straight from kids.land_slug; a land no kid in
 *  this family owns is simply omitted (it keeps its emoji landmark). */
function buildLandCupcakes(
  familyKids: { land_slug: string | null; cupcake_config: CupcakeConfig | null }[],
): Record<string, CupcakeConfig> {
  const out: Record<string, CupcakeConfig> = {};
  for (const kid of familyKids) {
    if (!kid.land_slug) continue;
    out[kid.land_slug] = coerceCupcakeConfig(kid.cupcake_config);
  }
  return out;
}

/** Map each per-kid land to its OWNER kid's evolution level, so the land
 *  renders at the stage that kid bought regardless of who is viewing (mirrors
 *  buildLandCupcakes). Only non-zero levels are included; the renderer treats
 *  a missing slug as level 0 (Plot). */
function buildLandLevels(
  familyKids: { id: string; land_slug: string | null }[],
  levelRows: { kid_id: string; region_slug: string; level: number }[],
): Record<string, number> {
  const levelByKidRegion = new Map(
    levelRows.map((r) => [`${r.kid_id}:${r.region_slug}`, clampLandLevel(r.level)] as const),
  );
  const out: Record<string, number> = {};
  for (const kid of familyKids) {
    if (!kid.land_slug) continue;
    const level = levelByKidRegion.get(`${kid.id}:${kid.land_slug}`) ?? 0;
    if (level > 0) out[kid.land_slug] = level;
  }
  return out;
}

export default async function TownPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise. `?mp=1` is the Phase-A multiplayer
  // opt-in flag — the town presence layer only activates when it's present,
  // so we can ship the plumbing without exposing it to every kid yet. The
  // flag is removed (multiplayer becomes default) in PR 3.
  searchParams: Promise<{ mp?: string; renderer?: string }>;
}): Promise<React.ReactElement> {
  const kidId = await getActiveKid();
  if (!kidId) redirect('/kids');

  const query = await searchParams;
  const mpEnabled = query.mp === '1';
  // Spike-only renderer switch. The public/default path remains the proven
  // imperative Three town until the Needle production gate passes.
  //
  // This is NOT a drop-in host swap: the Needle spike renders one authored dome
  // and carries no gameplay, saves, minimap or multiplayer. It therefore takes
  // only a title, and each branch returns it explicitly rather than aliasing a
  // shared `TownHost` — an alias would have silently dropped every other prop.
  const useNeedle =
    process.env.NEXT_PUBLIC_ENABLE_NEEDLE_TOWN === '1' && query.renderer === 'needle';
  const sb = supabaseServer();

  // Guest sandbox: synthesize a fresh kid view without touching the
  // wallet/discoveries tables. Same shape as a real kid so the host
  // doesn't need to special-case this branch.
  if (isGuest(kidId)) {
    const starters = getStarterRegions().map((r) => r.slug);
    const guestSpawn = pickSpawn(null, starters);

    // A guest has no family of their own, but the per-kid lands are baked into
    // the world map as fixed landmarks — so a guest should still see them
    // evolved to the stage their real owner bought, and wearing that owner's
    // cupcake. Without this the guest branch passed no landLevels/landCupcakes
    // at all, so every land rendered as a bare Plot and an owner's Castle
    // "didn't show up" in a guest preview (bug, 2026-07-26). Owners come from
    // kids.land_slug; oldest-created wins if two families' kids somehow claim
    // the same slot (the guest view is a demo, not a ledger). Same builders as
    // the real-kid path.
    const kidLandSlugs = REGIONS.filter((r) => r.kidLand).map((r) => r.slug);
    let guestLandCupcakes: Record<string, CupcakeConfig> = {};
    let guestLandLevels: Record<string, number> = {};
    {
      const { data: ownerKidsData } = await sb
        .from('kids')
        .select('id, land_slug, cupcake_config')
        .in('land_slug', kidLandSlugs)
        .order('created_at', { ascending: true });
      const seen = new Set<string>();
      const ownerKids = ((ownerKidsData ?? []) as {
        id: string;
        land_slug: string | null;
        cupcake_config: CupcakeConfig | null;
      }[]).filter((k) => {
        if (!k.land_slug || seen.has(k.land_slug)) return false;
        seen.add(k.land_slug);
        return true;
      });
      if (ownerKids.length) {
        const { data: rowsData } = await sb
          .from('kid_region_discoveries')
          .select('kid_id, region_slug, level')
          .in('kid_id', ownerKids.map((k) => k.id))
          .in('region_slug', kidLandSlugs);
        guestLandCupcakes = buildLandCupcakes(ownerKids);
        guestLandLevels = buildLandLevels(
          ownerKids,
          (rowsData ?? []) as { kid_id: string; region_slug: string; level: number }[],
        );
      }
    }

    if (useNeedle) return <NeedleTownHost title="Guest's City" />;

    return (
      <ThreeTownHost
        title="Guest's City"
        kidName="Guest"
        avatar="🎯"
        spawnRegionSlug={guestSpawn.region_slug}
        spawnX={guestSpawn.x}
        spawnY={guestSpawn.y}
        initialDiscovered={starters}
        initialBalance={0}
        seenStorySlugs={[]}
        tokenNotices={[]}
        landCupcakes={guestLandCupcakes}
        landLevels={guestLandLevels}
        isGuest
      />
    );
  }

  // Real kid path. Four reads in parallel (same shape as /api/town/state).
  // We don't bother with a family-scope kid check here because the
  // (gated) layout already established the family, and getActiveKid
  // is set via /api/kids/select which validates family ownership.
  // Adding another check would be belt-and-suspenders without
  // meaningful safety improvement at this layer.
  // Recent parent token grants/removals (the only EXTERNAL wallet changes — a
  // grown-up added or removed coins) surface as one-time story cards. Bound to a
  // short window so first-time adoption can't retro-spam a long history.
  const tokenNoticeWindow = new Date();
  tokenNoticeWindow.setDate(tokenNoticeWindow.getDate() - 7);
  const tokenNoticeWindowIso = tokenNoticeWindow.toISOString();
  const [
    kidRes,
    discoveriesRes,
    positionRes,
    balanceRes,
    rentalsRes,
    storySeenRes,
    tokenGrantsRes,
    tokenNoticeSeenRes,
  ] = await Promise.all([
    sb.from('kids').select('id, name, avatar, cupcake_config, family_id, land_slug').eq('id', kidId).maybeSingle(),
    sb.from('kid_region_discoveries').select('region_slug, discovered_at')
      .eq('kid_id', kidId)
      .order('discovered_at', { ascending: true }),
    sb.from('kid_avatar_position')
      .select('region_slug, x, y, updated_at')
      .eq('kid_id', kidId)
      .maybeSingle(),
    sb.from('kid_tokens').select('balance').eq('kid_id', kidId).maybeSingle(),
    // Active (non-expired) vehicle rentals — the rides the kid can hop on free
    // today. Expiry is server-side (next UTC midnight); anything past is ignored.
    sb.from('kid_vehicle_rentals')
      .select('vehicle_kind')
      .eq('kid_id', kidId)
      .gt('expires_at', new Date().toISOString()),
    // Story alerts this kid has already seen — so the town host doesn't re-toast
    // a world-event story they've dismissed. Replay stays available regardless.
    sb.from('kid_story_seen').select('story_slug').eq('kid_id', kidId),
    // Recent parent grants/removals in the window (newest first).
    sb.from('token_transactions')
      .select('id, delta, metadata, created_at')
      .eq('kid_id', kidId)
      .eq('reason', 'parent_grant')
      .gt('created_at', tokenNoticeWindowIso)
      .order('created_at', { ascending: false })
      .limit(8),
    // Which of those the kid has already been shown (tiny per-kid table).
    sb.from('kid_token_notice_seen').select('transaction_id').eq('kid_id', kidId),
  ]);

  const kid = kidRes.data as KidRow | null;
  if (!kid) redirect('/kids');

  // Stale lw_kid cookie pointing at a kid that no longer exists OR
  // the guest UUID slipping through past the isGuest check. Both
  // recover by sending the user to pick a valid kid.
  if (kid.id === GUEST_KID_ID) redirect('/kids');

  const discovered = (discoveriesRes.data ?? []).map(
    (row) => row.region_slug as string,
  );
  const positionRow = positionRes.data
    ? {
        region_slug: positionRes.data.region_slug as string,
        x: positionRes.data.x as number,
        y: positionRes.data.y as number,
      }
    : null;

  const positionSavedAt = (positionRes.data?.updated_at as string | undefined) ?? null;
  const spawn = pickSpawn(positionRow, discovered, (kid.land_slug as string | null) ?? null, positionSavedAt);
  const balance = (balanceRes.data?.balance as number | undefined) ?? 0;
  const rentals = (rentalsRes.data ?? [])
    .map((r) => r.vehicle_kind as string)
    .filter(isVehicleKind);
  const seenStorySlugs = (storySeenRes.data ?? []).map(
    (row) => row.story_slug as string,
  );

  // Unseen parent grants/removals → token-change cards (chronological, capped).
  const noticeSeen = new Set(
    (tokenNoticeSeenRes.data ?? []).map((r) => r.transaction_id as string),
  );
  const tokenNotices: TokenNotice[] = (tokenGrantsRes.data ?? [])
    .filter((t) => !noticeSeen.has(t.id as string))
    .slice(0, 5)
    .reverse() // oldest → newest so a kid reads them in order
    .map((t) => {
      const meta = (t.metadata ?? {}) as Record<string, unknown>;
      const note = typeof meta.note === 'string' ? meta.note : undefined;
      return { id: t.id as string, delta: t.delta as number, note };
    });

  // Per-kid land icons: every kid in the family so each per-kid land renders
  // that kid's own cupcake avatar as its landmark, independent of the viewer.
  // Cakey's trivia calibrates to the kid's inferred grade (median of the skills
  // they're proficient at) — fetched alongside the family roster.
  const [familyKidsRes, kidGrade] = await Promise.all([
    sb.from('kids').select('id, name, land_slug, cupcake_config').eq('family_id', kid.family_id),
    inferKidGrade(sb, kid.id),
  ]);
  const familyKids = (familyKidsRes.data ?? []) as {
    id: string;
    name: string;
    land_slug: string | null;
    cupcake_config: CupcakeConfig | null;
  }[];
  const landCupcakes = buildLandCupcakes(familyKids);

  // Per-kid land evolution levels — family-wide (like landCupcakes) so each
  // owner's land renders at the level THEY bought, regardless of viewer.
  const ownedLandSlugs = REGIONS.filter((r) => r.kidLand).map((r) => r.slug);
  const landLevelRows = ownedLandSlugs.length
    ? (
        await sb
          .from('kid_region_discoveries')
          .select('kid_id, region_slug, level')
          .in('kid_id', familyKids.map((k) => k.id))
          .in('region_slug', ownedLandSlugs)
      ).data ?? []
    : [];
  const landLevels = buildLandLevels(
    familyKids,
    landLevelRows as { kid_id: string; region_slug: string; level: number }[],
  );

  // Multiplayer plumbing (Phase A, behind ?mp=1). Derive the family's town
  // channel token server-side — the browser only ever receives the hashed
  // token, never the family_id. `null` when the flag is off OR the server
  // secret is unset, in which case the host runs in single-player mode.
  const topicToken = mpEnabled ? deriveTownTopicToken(kid.family_id) : null;

  if (useNeedle) return <NeedleTownHost title={`${kid.name}'s City`} />;

  return (
    <ThreeTownHost
      title={`${kid.name}'s City`}
      kidName={kid.name}
      kidGrade={kidGrade}
      avatar={kid.avatar}
      spawnRegionSlug={spawn.region_slug}
      spawnX={spawn.x}
      spawnY={spawn.y}
      initialDiscovered={discovered}
      initialBalance={balance}
      initialRentals={rentals}
      seenStorySlugs={seenStorySlugs}
      tokenNotices={tokenNotices}
      cupcakeConfig={coerceCupcakeConfig(kid.cupcake_config)}
      landCupcakes={landCupcakes}
      landLevels={landLevels}
      ownedLandSlug={(kid.land_slug as string | null) ?? undefined}
      kidId={kid.id}
      topicToken={topicToken}
    />
  );
}
