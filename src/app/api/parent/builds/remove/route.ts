// POST /api/parent/builds/remove — a grown-up takes a piece out of the town.
//
// Form post from /parent/builds (field: id); answers with a 303 back there.
// The builder is refunded as if they had removed it themselves (see
// remove_town_build in 0059): passing p_kid = null is the grown-up override.
// After a removal it pings the family's builds channel, since no kid's town
// is there to announce it (see src/lib/realtime/build-broadcast.ts).

import { after, type NextRequest } from 'next/server';
import { requireParentModeOrJson } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import { UNDO_SECS } from '@/lib/town/builds';
import { announceBuildsChanged } from '@/lib/realtime/build-broadcast';

const BACK = '/parent/builds';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function back(query: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${BACK}?${query}` } });
}

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireParentModeOrJson('kid:manage');
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const form = await request.formData().catch(() => null);
  const id = form?.get('id');
  if (typeof id !== 'string' || !UUID_RE.test(id)) return back('error=bad_id');

  const { data, error } = await supabaseServer().rpc('remove_town_build', {
    p_kid: null,
    p_family: family.id,
    p_build: id,
    p_undo_secs: UNDO_SECS,
  });
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (error || row?.status !== 'removed') return back('error=remove_failed');
  // after(), not await or fire-and-forget: the grown-up's redirect doesn't
  // wait on Realtime, and the function stays alive until the ping is sent.
  after(() => announceBuildsChanged(family.id));
  return back('removed=1');
}
