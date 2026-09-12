// `/games/word-search` — Sprinkle Search, a word search built from this
// week's sight words when a grown-up has added them, the library otherwise.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { sightWordsSkillForGrade } from '@/lib/games/sight-words-skill';
import { currentGradeOf } from '@/lib/kids/grade';
import WordSearchShell from './WordSearchShell';

export default async function WordSearchPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('name, grade, grade_year')
    .eq('id', kidId!)
    .maybeSingle();

  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  // Grade-scoped slug: the skills table has sight-words-kindergarten /
  // -first-grade / -second-grade, never a bare "sight-words". The shell
  // derives the same slug through verbalSkillFor() for the attempt POST.
  const tiers = await getLauncherTiers(sb, kidId, 'reading', sightWordsSkillForGrade(kidGrade));

  return (
    <WordSearchShell
      kidName={kidName}
      kidGrade={kidGrade}
      kidClassLists={tiers.classLists}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
    />
  );
}
