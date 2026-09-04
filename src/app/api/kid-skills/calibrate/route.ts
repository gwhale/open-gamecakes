// POST /api/kid-skills/calibrate — direct tier calibration from the
// parent skills overview card.
//
// Body: { kidId: string, skillId: string, tier: number }
//
// Sets kid_skills.current_tier to the given value, resets mastery_pct
// to 0 and recent_window to [], preserves total_attempts. Creates the
// kid_skills row if it doesn't exist (upsert).
//
// This replaces the "calibratedTier" field that used to live on the
// observation form. Direct calibration is a distinct action from
// logging an observation — separating them reduces form complexity
// and makes the intent clearer.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson, requireKidInFamily } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: NextRequest): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const kidId = typeof body.kidId === 'string' ? body.kidId : '';
  const skillId = typeof body.skillId === 'string' ? body.skillId : '';
  const tier = typeof body.tier === 'number' ? body.tier : 0;

  if (!kidId || !skillId) return Response.json({ error: 'kidId and skillId required' }, { status: 400 });
  if (tier < 1 || tier > 10) return Response.json({ error: 'tier must be 1-10' }, { status: 400 });

  // IDOR guard: this kid must belong to the caller's family.
  const denied = await requireKidInFamily(kidId, guard.family.id);
  if (denied) return denied;

  const sb = supabaseServer();

  // Preserve total_attempts if the row already exists.
  const { data: existing } = await sb
    .from('kid_skills')
    .select('total_attempts')
    .eq('kid_id', kidId)
    .eq('skill_id', skillId)
    .maybeSingle();

  const totalAttempts = (existing?.total_attempts as number | undefined) ?? 0;

  const { error } = await sb.from('kid_skills').upsert(
    {
      kid_id: kidId,
      skill_id: skillId,
      current_tier: tier,
      mastery_pct: 0,
      total_attempts: totalAttempts,
      recent_window: [],
    },
    { onConflict: 'kid_id,skill_id' },
  );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, currentTier: tier });
}
