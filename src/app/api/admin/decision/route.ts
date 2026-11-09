// POST /api/admin/decision: the operator answers (or reopens) an ask in
// admin_decisions. Same guard and record-first rule as the other admin routes.

import { type NextRequest } from 'next/server';
import { parseDecisionRequest } from '@/lib/admin/decisions';
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

  const req = parseDecisionRequest(await request.json().catch(() => null));
  if (!req) return json({ error: 'invalid_request' }, 400);

  const sb = supabaseServer();
  const { data: decision } = await sb.from('admin_decisions').select('id, title, options').eq('id', req.id).maybeSingle();
  if (!decision) return json({ error: 'decision_not_found' }, 404);
  if (req.action === 'answer' && !(decision.options as string[]).includes(req.answer)) {
    return json({ error: 'not_an_option' }, 400);
  }

  const { error: recordError } = await sb.from('admin_actions').insert({
    actor_user_id: user.id,
    family_id: null,
    action: 'decision-answer',
    detail: `${String(decision.title).slice(0, 80)}: ${req.action === 'answer' ? req.answer : 'reopened'}`,
  });
  if (recordError) {
    console.error('[admin] could not record action:', recordError.message);
    return json({ error: 'could_not_record' }, 500);
  }

  const update =
    req.action === 'answer'
      ? { status: 'answered', answer: req.answer, note: req.note || null, answered_at: new Date().toISOString() }
      : { status: 'open', answer: null, answered_at: null };
  const { error } = await sb.from('admin_decisions').update(update).eq('id', req.id);
  if (error) {
    console.error('[admin] decision update failed:', error.message);
    return json({ error: 'change_failed' }, 500);
  }
  return json({ ok: true });
}
