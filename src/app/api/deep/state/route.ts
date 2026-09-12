// POST /api/deep/state — save where the submarine is, and how deep it got.
//
// Mirrors /api/town/position: called from a throttled timer while the kid is
// driving and once more on the way out, best-effort, 204 on almost every
// failure path so a fire-and-forget fetch never throws a scary error into the
// middle of a dive. If it fails, the next emit retries; if they all fail, the
// kid starts their next dive at the reef, which is where a new dive starts
// anyway.
//
// Auth + scoping match the rest of the API: session cookie scopes us to a
// family, lw_kid identifies the kid, and we re-check the kid belongs to the
// family before writing.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { DOMAIN_RADIUS_M, DEPTH_LIMIT_M } from '@/lib/deep/types';

interface StateBody {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Current depth (metres, positive). Used to raise deepest_m. */
  depth: number;
  /** True on the first save of a dive — bumps the dives counter. */
  first?: boolean;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function parseBody(raw: unknown): StateBody | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const x = num(b.x);
  const y = num(b.y);
  const z = num(b.z);
  const heading = num(b.heading);
  const depth = num(b.depth);
  if (x === null || y === null || z === null || heading === null || depth === null) return null;
  return { x, y, z, heading, depth, first: b.first === true };
}

const NO_CONTENT = new Response(null, { status: 204 });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson('play');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  // Guest can't reach /town/deep at all (the page redirects), but answer the
  // same way the town does so the client never needs to know the difference.
  if (isGuest(kidId)) return NO_CONTENT;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const body = parseBody(raw);
  if (!body) return Response.json({ error: 'invalid body shape' }, { status: 400 });

  // Clamp to the world the engine actually enforces. The engine already does
  // this every frame; doing it again here means a crafted POST cannot park a
  // kid ten kilometres out to sea, where their next dive would spawn them
  // outside the terrain with no way back.
  const x = clamp(body.x, -DOMAIN_RADIUS_M, DOMAIN_RADIUS_M);
  const z = clamp(body.z, -DOMAIN_RADIUS_M, DOMAIN_RADIUS_M);
  const y = clamp(body.y, -DEPTH_LIMIT_M, 0);
  const depth = clamp(body.depth, 0, DEPTH_LIMIT_M);

  const sb = supabaseServer();

  const { data: kidCheck } = await sb
    .from('kids')
    .select('id')
    .eq('id', kidId)
    .eq('family_id', family.id)
    .maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  // deepest_m and dives only ever go UP, so read the current row first and
  // take the max. Doing it in SQL would be one round trip instead of two, but
  // it would need an RPC, and this route is best-effort on a 4-second timer —
  // a lost race just means one save did not raise the record, and the next
  // one will.
  const { data: existing } = await sb
    .from('kid_deep_state')
    .select('deepest_m, dives')
    .eq('kid_id', kidId)
    .maybeSingle<{ deepest_m: number; dives: number }>();

  const { error } = await sb.from('kid_deep_state').upsert(
    {
      kid_id: kidId,
      family_id: family.id,
      x,
      y,
      z,
      heading: body.heading,
      deepest_m: Math.max(existing?.deepest_m ?? 0, depth),
      dives: (existing?.dives ?? 0) + (body.first ? 1 : 0),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'kid_id' },
  );

  if (error) {
    // Best-effort — log, don't surface. The next emit retries.
    console.warn('[deep/state] upsert failed:', error.message);
  }

  return NO_CONTENT;
}
