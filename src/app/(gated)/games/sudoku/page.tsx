// `/games/sudoku` — Waffle Sudoku, Puzzle Island's first booth.
//
// Tracks against its OWN 'logic' skill (logic/sudoku, migration 0057) rather
// than sharing chess-puzzles' or checkers', for the reason checkers gave when
// it split from chess: the launcher seeds its difficulty from
// kid_skills.current_tier on the skill it reports to, and sudoku measures
// nothing chess or checkers measures. A kid who grinds waffles to tier 8
// should not be handed the island's chess champion on evidence containing no
// chess — nor should a chess tier decide how sparse their first waffle is.
//
// ⚠️ DEPLOY ORDER: apply 0057 BEFORE this code. The lookup below resolves the
// skill by (subject, name); if the row is missing the launcher pins to tier 1
// and attempts do not record. Recoverable, not corrupting — but avoid it.
//
// No kidGrade: sudoku has no grade baseline (there is no CCSS row for it), so
// "Level 1" is absolute, not grade-relative.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import SudokuShell from './SudokuShell';

const SKILL_SUBJECT = 'logic' as const;
const SKILL_SLUG = 'sudoku';

export default async function SudokuPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('name')
    .eq('id', kidId!)
    .maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;

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
    <SudokuShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
    />
  );
}
