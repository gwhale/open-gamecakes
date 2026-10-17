// `/games/chess-challenge` — play a whole game against an ELO-labelled Cakey.
//
// Deliberately reports against the SAME skill as Chess Puzzles. A kid's chess
// ability is one thing as far as the parent dashboard is concerned, and splitting
// it would put two chess rows on that dashboard measuring the same child. The
// games stay separable in telemetry via attempts.game_slug.
//
// That sharing is why there is no new migration here: the logic/chess-puzzles
// skill was seeded by 0022 and repointed to 'logic' by 0025.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import ChessChallengeShell from './ChessChallengeShell';

const SKILL_SUBJECT = 'logic' as const;
const SKILL_SLUG = 'chess-puzzles';

export default async function ChessChallengePage() {
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
    <ChessChallengeShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
    />
  );
}
