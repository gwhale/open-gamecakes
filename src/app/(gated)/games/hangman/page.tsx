// `/games/hangman` — Cakey's Candles. Hear a word, spell it
// before the candles blow out. Built from this week's spelling words when a
// grown-up has added them, the library otherwise.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { getLauncherTiers } from '@/lib/mastery/launcher-tiers';
import { verbalSkillFor } from '@/lib/games/shared/challenge-mode';
import CandlesShell from './CandlesShell';

export default async function CandlesPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const [{ data: kidRow }, tiers] = await Promise.all([
    sb.from('kids').select('name').eq('id', kidId!).maybeSingle(),
    // spelling-patterns — the row the shell credits, via the same function.
    getLauncherTiers(sb, kidId, 'reading', verbalSkillFor('spelling').slug),
  ]);

  const kidName = (kidRow?.name as string | undefined) ?? undefined;

  return (
    <CandlesShell
      kidName={kidName}
      kidClassLists={tiers.classLists}
      currentTier={tiers.currentTier}
      highestTier={tiers.highestTier}
    />
  );
}
