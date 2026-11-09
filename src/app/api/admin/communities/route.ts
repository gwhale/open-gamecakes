// POST /api/admin/communities: the operator creates a community or changes who is
// in it. Each attempt is recorded BEFORE the change, as with family-action.
//
// This only records membership. Nothing kid-facing reads it.

import { type NextRequest } from 'next/server';
import { parseCommunityRequest } from '@/lib/admin/communities';
import { hasAdminElevation, isOperator } from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/supabase/session';

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response('cross-site request rejected', { status: 403 });

  const user = await getCurrentUser();
  if (!user || !(await isOperator(user.id))) return new Response('not found', { status: 404 });
  if (!(await hasAdminElevation(user.id))) return json({ error: 'password_required' }, 401);

  const req = parseCommunityRequest(await request.json().catch(() => null));
  if (!req) return json({ error: 'invalid_request' }, 400);

  const sb = supabaseServer();

  let communityName: string;
  if (req.action === 'create') {
    communityName = req.name;
  } else {
    const { data: community } = await sb.from('communities').select('name').eq('id', req.communityId).maybeSingle();
    if (!community) return json({ error: 'community_not_found' }, 404);
    communityName = community.name as string;
  }

  const familyId = req.action === 'add-family' || req.action === 'remove-family' ? req.familyId : null;
  if (familyId) {
    const { data: family } = await sb.from('families').select('id').eq('id', familyId).maybeSingle();
    if (!family) return json({ error: 'family_not_found' }, 404);
  }

  const { error: recordError } = await sb.from('admin_actions').insert({
    actor_user_id: user.id,
    family_id: familyId,
    action: `community-${req.action}`,
    detail: communityName,
  });
  if (recordError) {
    console.error('[admin] could not record action:', recordError.message);
    return json({ error: 'could_not_record' }, 500);
  }

  let error: { message: string } | null = null;
  if (req.action === 'create') {
    ({ error } = await sb.from('communities').insert({ name: req.name }));
  } else if (req.action === 'delete') {
    ({ error } = await sb.from('communities').delete().eq('id', req.communityId));
  } else if (req.action === 'add-family') {
    ({ error } = await sb
      .from('community_families')
      .upsert({ community_id: req.communityId, family_id: req.familyId }, { ignoreDuplicates: true }));
  } else {
    ({ error } = await sb
      .from('community_families')
      .delete()
      .eq('community_id', req.communityId)
      .eq('family_id', req.familyId));
  }
  if (error) {
    console.error('[admin] community change failed:', error.message);
    return json({ error: 'change_failed' }, 500);
  }
  return json({ ok: true });
}
