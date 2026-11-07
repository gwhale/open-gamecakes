// `/games/pacman-cakey` — Cakey's Maze (Pac-Man-style chase).

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { mathSkillForGrade } from '@/lib/kids/defaults';
import PacmanCakeyShell from './PacmanCakeyShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;

export default async function PacmanCakeyPage(): Promise<React.ReactElement> {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = kidId
    ? await sb.from('kids').select('name, grade, grade_year').eq('id', kidId).maybeSingle()
    : { data: null };
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  const skillSlug = mathSkillForGrade(kidGrade);

  const [tiers, verbalTiers] = await Promise.all([
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, skillSlug),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  return (
    <PacmanCakeyShell
      kidName={kidName}
      kidGrade={kidGrade}
      kidFocus={tiers.focus}
      kidClassLists={tiers.classLists}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={skillSlug}
      verbalCurrentTier={verbalTiers.currentTier}
      verbalHighestTier={verbalTiers.highestTier}
    />
  );
}
