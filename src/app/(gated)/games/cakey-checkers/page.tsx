// `/games/cakey-checkers` — play a whole game of checkers against a Cakey.
//
// ⚠️ THIS REPORTS AGAINST ITS OWN SKILL, AND THAT IS A DELIBERATE DIVERGENCE
// FROM Chess Challenge. That route shares logic/chess-puzzles because it IS
// chess — same rules, same tactical vocabulary, same 64 squares — so two rows on
// the parent dashboard would be one child counted twice. Checkers shares none of
// it: no piece differentiation, no notation, forced captures, half the board in
// play. A kid can be good at one and bad at the other.
//
// The mechanical reason matters more than the taxonomic one. BOTH chess routes
// seed their launcher difficulty from kid_skills.current_tier. If checkers wrote
// into the chess skill, a kid who ground checkers to tier 8 would open Chess
// Challenge pre-set to level 8 and be handed Chef Gâteau on the strength of
// evidence containing no chess at all.
//
// Subject stays 'logic', so this costs one skills row and no new plumbing —
// 0025 already widened the CHECK and /api/attempts already accepts it. The row
// is seeded by 0040_seed_checkers_skill.sql, which must be applied BEFORE this
// code ships or the lookup misses, the launcher pins to tier 1 and attempts do
// not record.
//
// No unlock gate: the game is free. Chess Island already costs LAND.ISLAND via
// the ferry, and charging again would put a third booth on a land the kid
// already paid to reach behind another few days of saving.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import CakeyCheckersShell from './CakeyCheckersShell';

const SKILL_SUBJECT = 'logic' as const;
const SKILL_SLUG = 'checkers';

export default async function CakeyCheckersPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb.from('kids').select('name').eq('id', kidId!).maybeSingle();
  const kidName = (kidRow?.name as string | undefined) ?? undefined;

  const { data: skillRow } = await sb
    .from('skills')
    .select('id')
    .eq('subject', SKILL_SUBJECT)
    .eq('name', SKILL_SLUG)
    .maybeSingle();
  const skillId = skillRow?.id as string | undefined;

  let currentTier = 1;
  if (kidId && skillId) {
    const { data: ks } = await sb
      .from('kid_skills')
      .select('current_tier')
      .eq('kid_id', kidId)
      .eq('skill_id', skillId)
      .maybeSingle();
    if (ks?.current_tier && typeof ks.current_tier === 'number') {
      currentTier = ks.current_tier;
    }
  }

  return (
    <CakeyCheckersShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
    />
  );
}
