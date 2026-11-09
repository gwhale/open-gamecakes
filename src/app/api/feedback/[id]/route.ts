// PUT /api/feedback/[id] — update ticket status and/or ship_note (parent-only).

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  // Grown-up mode, not just a family session. The header has always said
  // "(parent-only)" but the guard was requireSessionOrJson, so a kid could
  // close their own ticket and write the ship note — exactly what the tickets
  // page describes as read-only for kids.
  const guard = await requireParentModeOrJson('ticket:triage');
  if (guard instanceof Response) return guard;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ('status' in body) {
    const status = body.status;
    if (status !== 'new' && status !== 'reviewed' && status !== 'done' && status !== 'wontfix') {
      return Response.json({ error: 'invalid status' }, { status: 400 });
    }
    updates.status = status;
  }

  if ('ship_note' in body) {
    const shipNote = body.ship_note;
    if (shipNote !== null && typeof shipNote !== 'string') {
      return Response.json({ error: 'invalid ship_note' }, { status: 400 });
    }
    updates.ship_note = shipNote;
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }

  const sb = supabaseServer();

  // IDOR guard: the ticket's kid must belong to the caller's family.
  // feedback has no family_id column, so verify via the kid_id join.
  const { data: existing } = await sb
    .from('feedback')
    .select('kid_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });
  const denied = await requireKidInFamily(existing.kid_id as string, guard.family.id);
  if (denied) return denied;

  const { error } = await sb.from('feedback').update(updates).eq('id', id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
