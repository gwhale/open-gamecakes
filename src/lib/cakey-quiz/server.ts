import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { getActiveKid } from '@/lib/auth/active-kid';
import { isGuest } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import {
  isAdjustmentEligible,
  medianTier,
  tierForGrade,
  type QuizSubject,
  type SubjectPlacement,
} from './core';
import { currentGradeOf } from '@/lib/kids/grade';

export interface QuizRequestContext {
  sb: SupabaseClient;
  kidId: string;
  familyId: string | null;
  guest: boolean;
}

interface PlacementRow {
  subject: QuizSubject;
  current_tier: number;
  last_assessed_at: string | null;
}

export async function requireQuizContext(): Promise<QuizRequestContext | Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const kidId = await getActiveKid();
  if (!kidId) return Response.json({ error: 'no active kid' }, { status: 401 });

  const guest = isGuest(kidId);
  const sb = supabaseServer();
  if (!guest) {
    const { data: kid } = await sb
      .from('kids')
      .select('id')
      .eq('id', kidId)
      .eq('family_id', guard.family.id)
      .maybeSingle();
    if (!kid) return Response.json({ error: 'kid not in your family' }, { status: 403 });
  }

  return {
    sb,
    kidId,
    familyId: guest ? null : guard.family.id,
    guest,
  };
}

export async function resolvePlacements(
  context: QuizRequestContext,
): Promise<{
  placement: SubjectPlacement;
  rows: PlacementRow[];
  adjustmentEligible: boolean;
  nextAdjustmentAt: string | null;
}> {
  const { sb, kidId, familyId, guest } = context;
  const [{ data: placementData, error: placementError }, { data: kid }, { data: skillData }] =
    await Promise.all([
      sb
        .from('kid_subject_placements')
        .select('subject, current_tier, last_assessed_at')
        .eq('kid_id', kidId),
      sb.from('kids').select('grade, grade_year').eq('id', kidId).maybeSingle(),
      sb
        .from('kid_skills')
        .select('current_tier, total_attempts, skills!inner(subject)')
        .eq('kid_id', kidId),
    ]);

  if (placementError) throw new Error(`placement lookup failed: ${placementError.message}`);

  const rows = (placementData ?? []) as PlacementRow[];
  const practiced: Record<QuizSubject, number[]> = { math: [], reading: [] };
  for (const raw of skillData ?? []) {
    if ((raw.total_attempts as number) <= 0) continue;
    const skill = raw.skills as unknown as { subject: string };
    if (skill?.subject === 'math' || skill?.subject === 'reading') {
      practiced[skill.subject].push(raw.current_tier as number);
    }
  }

  const gradeTier = tierForGrade(currentGradeOf(kid));
  const bySubject = new Map(rows.map((row) => [row.subject, row]));
  const placement: SubjectPlacement = {
    math: bySubject.get('math')?.current_tier ?? medianTier(practiced.math) ?? gradeTier,
    reading: bySubject.get('reading')?.current_tier ?? medianTier(practiced.reading) ?? gradeTier,
  };

  if (!guest) {
    const missing = (['math', 'reading'] as const)
      .filter((subject) => !bySubject.has(subject))
      .map((subject) => ({
        kid_id: kidId,
        family_id: familyId,
        subject,
        current_tier: placement[subject],
      }));
    if (missing.length) {
      const { error } = await sb
        .from('kid_subject_placements')
        .upsert(missing, { onConflict: 'kid_id,subject' });
      if (error) throw new Error(`placement seed failed: ${error.message}`);
    }
  }

  const lastDates = rows
    .map((row) => row.last_assessed_at)
    .filter((value): value is string => Boolean(value))
    .sort();
  const latest = lastDates.at(-1) ?? null;
  const adjustmentEligible = !guest && isAdjustmentEligible(latest);
  const nextAdjustmentAt = latest
    ? new Date(new Date(latest).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    : null;

  return { placement, rows, adjustmentEligible, nextAdjustmentAt };
}
