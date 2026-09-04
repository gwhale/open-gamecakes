// POST /api/town/position — save the avatar's last known spot.
//
// Called by PhaserTownHost from the throttled scene timer (every 3s
// while moving + once on shutdown). Best-effort: the route returns
// 204 even on most failure paths so the client's fire-and-forget
// fetch doesn't surface scary errors during normal play. If the
// position fails to save, the next emit retries; if all of them
// fail (e.g. network died), the kid just respawns at their starter
// region next visit — annoying but not corrupting.
//
// Auth + scoping match the rest of /api/town/*: parent session
// cookie scopes us to a family; lw_kid cookie identifies the kid;
// we double-check the kid belongs to the family.

import { type NextRequest } from 'next/server';
import { findRegion, WORLD_PX } from '@/lib/town/regions';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

interface PositionBody {
  region_slug: string;
  x: number;
  y: number;
}

function parseBody(raw: unknown): PositionBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.region_slug !== 'string' || b.region_slug.length === 0) return null;
  if (typeof b.x !== 'number' || !Number.isFinite(b.x)) return null;
  if (typeof b.y !== 'number' || !Number.isFinite(b.y)) return null;
  return { region_slug: b.region_slug, x: Math.round(b.x), y: Math.round(b.y) };
}

const NO_CONTENT = new Response(null, { status: 204 });

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest doesn't persist position — the sandbox always respawns at
  // the starter region. 204 keeps the client side simple (it can fire
  // the same POST regardless of whether the kid is real or guest).
  if (isGuest(kidId)) return NO_CONTENT;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const body = parseBody(raw);
  if (!body) return Response.json({ error: 'invalid body shape' }, { status: 400 });

  // Validate region against the catalog. Stops a typo on the client
  // from leaking into the table; also prevents a crafted POST from
  // jamming arbitrary text through to other readers.
  if (!findRegion(body.region_slug)) {
    return Response.json({ error: 'unknown region' }, { status: 400 });
  }

  // Clamp coords to the world rect. The scene clamps via Arcade
  // physics world bounds, but defense-in-depth is cheap.
  const x = Math.max(0, Math.min(WORLD_PX.w, body.x));
  const y = Math.max(0, Math.min(WORLD_PX.h, body.y));

  const sb = supabaseServer();

  // Family-scope check — same defense-in-depth as /api/attempts.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  const { error } = await sb
    .from('kid_avatar_position')
    .upsert(
      {
        kid_id: kidId,
        family_id: family.id,
        region_slug: body.region_slug,
        x,
        y,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'kid_id' },
    );

  if (error) {
    // Best-effort — log but don't surface; the next emit will retry.
    console.warn('[town/position] upsert failed:', error.message);
  }

  return NO_CONTENT;
}
