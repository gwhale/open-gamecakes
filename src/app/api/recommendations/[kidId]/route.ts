// GET /api/recommendations/[kidId] — variety-seeking "what should I play next".
//
// Loads skills + kid_skills + recent attempts, runs pickNext(), returns
// top 3 recommendations. Called by the /map page and (later) the parent
// dashboard to give kids a "Next up" nudge.

import { type NextRequest } from 'next/server';
import { requireSessionOrJson } from '@/lib/auth/api-guard';
import { supabaseServer } from '@/lib/supabase/server';
import { pickNext } from '@/lib/recommendations/next-play';
import { gradeLabel } from '@/lib/kids/defaults';
import type { Kid, Skill, KidSkill, Attempt } from '@/lib/types';
import { currentGradeOf } from '@/lib/kids/grade';



export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kidId: string }> },
): Promise<Response> {
  const guard = await requireSessionOrJson();
  if (guard instanceof Response) return guard;
  const { family } = guard;

  const { kidId } = await params;
  const sb = supabaseServer();
  // Family-scoped guard: kid must belong to this parent's family.
  const { data: kidCheck } = await sb.from('kids')
    .select('id').eq('id', kidId).eq('family_id', family.id).maybeSingle();
  if (!kidCheck) return Response.json({ error: 'kid not in your family' }, { status: 403 });

  const [kidRes, skillsRes, ksRes, attemptsRes] = await Promise.all([
    sb.from('kids').select('id, name, avatar, grade, grade_year').eq('id', kidId).maybeSingle(),
    sb.from('skills').select('*'),
    sb.from('kid_skills').select('*').eq('kid_id', kidId),
    sb
      .from('attempts')
      .select('*')
      .eq('kid_id', kidId)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);

  if (kidRes.error || !kidRes.data) {
    return Response.json({ error: 'kid not found' }, { status: 404 });
  }
  if (skillsRes.error) {
    return Response.json({ error: `skills: ${skillsRes.error.message}` }, { status: 500 });
  }

  const kid = kidRes.data as Pick<Kid, 'id' | 'name' | 'avatar' | 'grade' | 'grade_year'>;
  const skills = (skillsRes.data ?? []) as Skill[];
  const kidSkills = (ksRes.data ?? []) as KidSkill[];
  const recentAttempts = (attemptsRes.data ?? []) as Attempt[];

  const recommendations = pickNext({
    skills,
    kidSkills,
    recentAttempts,
    options: {
      limit: 3,
      onlyGamifiable: true,
      kidGrade: gradeLabel(currentGradeOf(kid)),
    },
  });

  return Response.json({
    kid: { id: kid.id, name: kid.name, avatar: kid.avatar },
    recommendations,
  });
}
