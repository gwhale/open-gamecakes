// `/games/sharks-minnows` — Sharks & Minnows with level select.
//
// Flow: GameLauncher (level + math type selection) → SharksAndMinnows game.
// Server component fetches kid name + launcher tiers and renders a client
// "shell" that manages the launcher → game state (no page reload).

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import SharksShell from './SharksShell';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;
const SKILL_SLUG = 'add-within-20';

export default async function SharksAndMinnowsPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const [kidRes, tiers, verbalTiers] = await Promise.all([
    sb.from('kids').select('name, grade, grade_year').eq('id', kidId!).maybeSingle(),
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, SKILL_SLUG),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  const kidName = (kidRes.data?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRes.data);

  return (
    <SharksShell
      kidName={kidName}
      kidGrade={kidGrade}
      kidFocus={tiers.focus}
      kidClassLists={tiers.classLists}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
      verbalCurrentTier={verbalTiers.currentTier}
      verbalHighestTier={verbalTiers.highestTier}
    />
  );
}
