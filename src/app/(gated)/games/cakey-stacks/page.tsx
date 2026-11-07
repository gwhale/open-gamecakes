// `/games/cakey-stacks` — falling cake slices, in 3D or flat, with math gates.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { mathSkillForGrade } from '@/lib/kids/defaults';
import CakeyStacksShell from './CakeyStacksShell';
import { findGame, gameUnlockCost } from '@/lib/games/registry';
import { isGameUnlockedForKid } from '@/lib/games/unlock-gate';
import GameLockedCard from '@/components/games/GameLockedCard';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;
const GAME_SLUG = 'cakey-stacks';

export default async function CakeyStacksPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  // Priced game — gate BEFORE any of the setup work below. This one check is
  // the enforcement point for every way in: the All Games menu, the Town Square
  // booth, and a typed URL all land here. The menu's lock badge is presentation
  // only; this is the wall.
  if (!(await isGameUnlockedForKid(sb, kidId, GAME_SLUG))) {
    const game = findGame(GAME_SLUG)!;
    const { data: wallet } = await sb
      .from('kid_tokens').select('balance').eq('kid_id', kidId!).maybeSingle();
    return (
      <GameLockedCard
        gameSlug={GAME_SLUG}
        label={game.label}
        glyph={game.glyph}
        cost={gameUnlockCost(GAME_SLUG)}
        balance={(wallet?.balance as number | undefined) ?? 0}
      />
    );
  }

  const { data: kidRow } = await sb
    .from('kids')
    .select('name, grade, grade_year')
    .eq('id', kidId!)
    .maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  const skillSlug = mathSkillForGrade(kidGrade);

  const [tiers, verbalTiers] = await Promise.all([
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, skillSlug),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  return (
    <CakeyStacksShell
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
