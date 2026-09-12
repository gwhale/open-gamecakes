// `/games/math-asteroids` — Asteroids-inspired math game.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { coerceCupcakeConfig, type CupcakeConfig } from '@/lib/cupcake/config';
import AsteroidsShell from './AsteroidsShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;
const SKILL_SLUG = 'add-within-20';

export default async function MathAsteroidsPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const [kidRes, tiers, verbalTiers] = await Promise.all([
    sb.from('kids').select('name, grade, grade_year, cupcake_config').eq('id', kidId!).maybeSingle(),
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, SKILL_SLUG),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  const kidName = (kidRes.data?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRes.data);

  // Real kids pilot their Cakey Store cupcake; guests fly a bare ship.
  const cupcakeConfig: CupcakeConfig | undefined = kidRes.data?.cupcake_config
    ? coerceCupcakeConfig(kidRes.data.cupcake_config)
    : undefined;

  return (
    <AsteroidsShell
      kidName={kidName}
      kidGrade={kidGrade}
      kidFocus={tiers.focus}
      kidClassLists={tiers.classLists}
      cupcakeConfig={cupcakeConfig}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
      verbalCurrentTier={verbalTiers.currentTier}
      verbalHighestTier={verbalTiers.highestTier}
    />
  );
}
