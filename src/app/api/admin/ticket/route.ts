// POST /api/admin/ticket: the operator sets any family's ticket status from
// /admin. Same guard and same record-first rule as the other admin routes; the
// family's own /tickets page keeps its parent-only route (api/feedback/[id]).

import { type NextRequest } from 'next/server';
import { parseTicketStatusRequest } from '@/lib/admin/tickets';
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

  const req = parseTicketStatusRequest(await request.json().catch(() => null));
  if (!req) return json({ error: 'invalid_request' }, 400);

  const sb = supabaseServer();
  const { data: ticket } = await sb.from('feedback').select('id, family_id, title, status').eq('id', req.id).maybeSingle();
  if (!ticket) return json({ error: 'ticket_not_found' }, 404);
  if (ticket.status === req.status) return json({ ok: true });

  const { error: recordError } = await sb.from('admin_actions').insert({
    actor_user_id: user.id,
    family_id: (ticket.family_id as string | null) ?? null,
    action: 'ticket-status',
    detail: `${String(ticket.title).slice(0, 80)}: ${ticket.status} to ${req.status}`,
  });
  if (recordError) {
    console.error('[admin] could not record action:', recordError.message);
    return json({ error: 'could_not_record' }, 500);
  }

  const { error } = await sb.from('feedback').update({ status: req.status }).eq('id', req.id);
  if (error) {
    console.error('[admin] ticket status change failed:', error.message);
    return json({ error: 'change_failed' }, 500);
  }
  return json({ ok: true });
}
