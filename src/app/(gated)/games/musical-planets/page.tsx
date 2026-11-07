// `/games/musical-planets` — the circle of fifths for beginner pianists.
//
// Deliberately thinner than the other game pages: there is no skill row and no
// tier to look up. The PRD keeps progress on the device with no account, so
// nothing here posts an attempt or reads kid_skills; the page only needs the
// kid's name for the header.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import MusicalPlanetsHost from '@/components/games/music/MusicalPlanetsHost';
import { MUSICAL_PLANETS_SLUG } from '@/lib/games/music/name';

export default async function MusicalPlanetsPage() {
  const kidId = await getActiveKid();
  const { data: kidRow } = await supabaseServer()
    .from('kids')
    .select('name')
    .eq('id', kidId!)
    .maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;

  return <MusicalPlanetsHost gameSlug={MUSICAL_PLANETS_SLUG} kidName={kidName} />;
}
