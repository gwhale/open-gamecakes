// POST /api/admin/family-action: the operator resets a family's password or PIN.
//
// Body: { familyId, action: 'reset-password' | 'reset-pin' }. The new value is
// generated here and returned once, for the operator to pass on. It is never stored
// in the clear. The attempt is recorded BEFORE the change, so no reset can happen
// without a record of it.
//
// A password reset signs the family out on every device, including kids' tablets.
// A PIN reset does not.

import { randomBytes, randomInt } from 'node:crypto';
import { type NextRequest } from 'next/server';
import { changeParentPin } from '@/lib/auth/parent-mode';
import { hasAdminElevation, isOperator } from '@/lib/auth/super-admin';
import { isSameOriginRequest } from '@/lib/http/same-origin';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/supabase/session';

const ACTIONS = ['reset-password', 'reset-pin'] as const;
type Action = (typeof ACTIONS)[number];

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginRequest(request)) return new Response('cross-site request rejected', { status: 403 });

  const user = await getCurrentUser();
  if (!user || !(await isOperator(user.id))) return new Response('not found', { status: 404 });
  if (!(await hasAdminElevation(user.id))) return json({ error: 'password_required' }, 401);

  const body = (await request.json().catch(() => null)) as { familyId?: unknown; action?: unknown } | null;
  const familyId = typeof body?.familyId === 'string' ? body.familyId : '';
  const action = ACTIONS.find((known) => known === body?.action) as Action | undefined;
  if (!familyId || !action) return json({ error: 'invalid_request' }, 400);

  const sb = supabaseServer();
  const { data: family } = await sb
    .from('families')
    .select('id, owner_user_id')
    .eq('id', familyId)
    .maybeSingle();
  if (!family) return json({ error: 'family_not_found' }, 404);
  if (action === 'reset-password' && !family.owner_user_id) return json({ error: 'family_has_no_login' }, 409);

  const { error: recordError } = await sb
    .from('admin_actions')
    .insert({ actor_user_id: user.id, family_id: familyId, action });
  if (recordError) {
    console.error('[admin] could not record action:', recordError.message);
    return json({ error: 'could_not_record' }, 500);
  }

  if (action === 'reset-password') {
    const password = randomBytes(12).toString('base64url');
    const { error } = await sb.auth.admin.updateUserById(family.owner_user_id as string, { password });
    if (error) {
      console.error('[admin] password reset failed:', error.message);
      return json({ error: 'reset_failed' }, 500);
    }
    return json({ value: password });
  }

  const pin = String(randomInt(100_000, 1_000_000));
  if (!(await changeParentPin(familyId, pin))) return json({ error: 'reset_failed' }, 500);
  return json({ value: pin });
}
