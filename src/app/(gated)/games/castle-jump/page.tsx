// `/games/castle-jump` — Cakey Castle Jump, a vertical bounce-climb where
// math gates block the way to the top of the castle.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { mathSkillForGrade } from '@/lib/kids/defaults';
import CastleJumpShell from './CastleJumpShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;

/** Same convention as the other calibrated games: kindergarten-age kids
 *  track against counting, everyone else against addition. */

export default async function CastleJumpPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids').select('name, grade, grade_year').eq('id', kidId!).maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  const skillSlug = mathSkillForGrade(kidGrade);

  const [tiers, verbalTiers] = await Promise.all([
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, skillSlug),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  return (
    <CastleJumpShell
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
