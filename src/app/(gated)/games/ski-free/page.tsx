// `/games/ski-free` — Meringue Downhill, a Ski Free-style math game.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { mathSkillForGrade } from '@/lib/kids/defaults';
import { coerceCupcakeConfig, type CupcakeConfig } from '@/lib/cupcake/config';
import SkiFreeShell from './SkiFreeShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;

/** Same convention as the other calibrated games: kindergarten-age kids
 *  track against counting, everyone else against addition. */

export default async function SkiFreePage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids').select('name, grade, grade_year, cupcake_config').eq('id', kidId!).maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  const skillSlug = mathSkillForGrade(kidGrade);

  // The skier IS the kid's Cakey Store cupcake. Guests / missing rows fall
  // back to the plain starter inside drawCupcake (no regression).
  const cupcakeConfig: CupcakeConfig | undefined = kidRow?.cupcake_config
    ? coerceCupcakeConfig(kidRow.cupcake_config)
    : undefined;

  const [tiers, verbalTiers] = await Promise.all([
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, skillSlug),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  return (
    <SkiFreeShell
      kidName={kidName}
      kidGrade={kidGrade}
      kidFocus={tiers.focus}
      kidClassLists={tiers.classLists}
      cupcakeConfig={cupcakeConfig}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={skillSlug}
      verbalCurrentTier={verbalTiers.currentTier}
      verbalHighestTier={verbalTiers.highestTier}
    />
  );
}
