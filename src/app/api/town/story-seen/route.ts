// POST /api/town/story-seen — mark a story alert as seen by the active kid.
//
// Called by ThreeTownHost when the kid watches or dismisses a Story Alert
// (either action counts as "seen"). Records one row in kid_story_seen so the
// toast doesn't reappear on the next visit. Stories stay replayable from
// Cakey's panel regardless — this only silences the auto-toast.
//
// Unlike /api/town/discover there is NO token spend, so no RPC is needed: the
// write is a plain insert-ignore upsert against a composite-PK table, which is
// idempotent by construction (a replay after "seen" is a harmless no-op).
//
// Request body:  { story_slug: string }
// Response 200:  { ok: true }
// Response 400:  { error } — bad body or unknown story slug
// Response 401/403/500: same shape as the rest of /api/town/*

import { type NextRequest } from 'next/server';
import { isStorySlug } from '@/lib/town/story-events';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';

interface StorySeenBody {
  story_slug: string;
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function parseBody(raw: unknown): StorySeenBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  // isStorySlug validates both "is a string" and "is a known story".
  if (!isStorySlug(b.story_slug)) return null;
  return { story_slug: b.story_slug };
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest sandbox has no persisted state — synthetic success keeps the flow
  // snappy without writing rows. Guests re-see stories each mount (acceptable,
  // matches the guest wallet/discoveries behavior).
  if (isGuest(kidId)) {
    return Response.json({ ok: true });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest('invalid json');
  }
  const body = parseBody(raw);
  if (!body) return badRequest('invalid body shape');

  const sb = supabaseServer();

  // Family-scope check, same defense-in-depth as the other town routes.
  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // Insert-ignore: composite PK (kid_id, story_slug) makes a repeat seen a
  // no-op, so replays never error.
  const { error } = await sb.from('kid_story_seen').upsert(
    { kid_id: kidId, family_id: family.id, story_slug: body.story_slug },
    { onConflict: 'kid_id,story_slug', ignoreDuplicates: true },
  );

  if (error) {
    console.warn('[town/story-seen] upsert failed:', error.message);
    return Response.json({ error: 'story-seen write failed' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
