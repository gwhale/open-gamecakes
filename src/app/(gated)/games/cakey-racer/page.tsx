// `/games/cakey-racer` — Cakey Racer, the Victory Lane lap racer. Four laps of
// the candy circuit against three rivals, with boost gates for maths.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { mathSkillForGrade } from '@/lib/kids/defaults';
import { coerceCupcakeConfig, type CupcakeConfig } from '@/lib/cupcake/config';
import CakeyRacerShell from './CakeyRacerShell';
import { findGame, gameUnlockCost } from '@/lib/games/registry';
import { isGameUnlockedForKid } from '@/lib/games/unlock-gate';
import GameLockedCard from '@/components/games/GameLockedCard';
import { currentGradeOf } from '@/lib/kids/grade';

const SKILL_SUBJECT = 'math' as const;
const GAME_SLUG = 'cakey-racer';

/** Same convention as the other calibrated games: kindergarten-age kids track
 *  against counting, everyone else against addition. */

export default async function CakeyRacerPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  // Priced game — gate BEFORE doing any of the setup work below. This is the
  // enforcement point for every route in: the All Games menu, a town booth, and
  // a typed URL all land here.
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
    .from('kids').select('name, grade, grade_year, cupcake_config').eq('id', kidId!).maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;
  const kidGrade = currentGradeOf(kidRow);
  const skillSlug = mathSkillForGrade(kidGrade);

  // The kid's Cakey Store cupcake rides in the jeep, and its frosting colour
  // paints the bodywork. Guests / missing rows fall back inside the engine.
  const cupcakeConfig: CupcakeConfig | undefined = kidRow?.cupcake_config
    ? coerceCupcakeConfig(kidRow.cupcake_config)
    : undefined;

  const [tiers, verbalTiers] = await Promise.all([
    getLauncherTiers(sb, kidId, SKILL_SUBJECT, skillSlug),
    getLauncherTiers(sb, kidId, 'reading', 'synonyms'),
  ]);

  return (
    <CakeyRacerShell
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
