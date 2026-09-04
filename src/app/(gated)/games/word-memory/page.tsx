// `/games/word-memory` — Sight-word memory match (5×5 grid, center blank).

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { sightWordsSkillForGrade } from '@/lib/games/sight-words-skill';
import WordMemoryShell from './WordMemoryShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'reading' as const;

export default async function WordMemoryPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('name, grade, grade_year')
    .eq('id', kidId!)
    .maybeSingle();

  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  // Grade-scoped slug — the skills table has sight-words-kindergarten /
  // sight-words-first-grade / sight-words-second-grade, not a bare
  // "sight-words." Using the wrong slug silently 400s /api/attempts.
  const SKILL_SLUG = sightWordsSkillForGrade(currentGradeOf(kidRow));

  const { data: skillRow } = await sb
    .from('skills')
    .select('id')
    .eq('subject', SKILL_SUBJECT)
    .eq('name', SKILL_SLUG)
    .maybeSingle();
  const skillId = skillRow?.id as string | undefined;

  let currentTier = 1;
  if (kidId && skillId) {
    const { data: ks } = await sb
      .from('kid_skills')
      .select('current_tier')
      .eq('kid_id', kidId)
      .eq('skill_id', skillId)
      .maybeSingle();
    if (ks?.current_tier && typeof ks.current_tier === 'number') {
      currentTier = ks.current_tier;
    }
  }

  return (
    <WordMemoryShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
    />
  );
}
