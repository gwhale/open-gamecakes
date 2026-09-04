// PUT /api/observations/[id] — edit an existing observation.
//
// Only the parent admin gate protects this route (via explicit cookie check,
// not the route-group layout). The kid_id on the observation is immutable —
// you can't reassign an observation to a different kid via edit.
//
// Editable fields: kind, title, body, skill_id. Calibrated_tier is NOT
// editable via this route — use /api/kid-skills/calibrate for direct tier
// changes (the observation form no longer exposes calibration inline).

import { type NextRequest } from 'next/server';
import { requireParentModeOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireParentModeOrJson();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  if (!id) return Response.json({ error: 'missing id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  // Build update object with only the fields that were provided.
  const update: Record<string, unknown> = {};
  if (typeof body.kind === 'string' && ['note', 'homework', 'writing', 'teacher_report'].includes(body.kind)) {
    update.kind = body.kind;
  }
  if (body.title !== undefined) {
    update.title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null;
  }
  if (typeof body.body === 'string' && body.body.trim()) {
    update.body = body.body.trim();
  }
  if (body.skillId !== undefined) {
    update.skill_id = typeof body.skillId === 'string' && body.skillId ? body.skillId : null;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'nothing to update' }, { status: 400 });
  }

  const sb = supabaseServer();

  // IDOR guard: the observation's kid must belong to the caller's family.
  // observations has no family_id column, so verify via the kid_id join.
  const { data: existing } = await sb
    .from('observations')
    .select('kid_id')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 });
  const denied = await requireKidInFamily(existing.kid_id as string, guard.family.id);
  if (denied) return denied;

  const { error } = await sb.from('observations').update(update).eq('id', id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
