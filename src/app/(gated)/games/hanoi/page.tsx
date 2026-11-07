// `/games/hanoi` — Cake Shift: Tower of Hanoi on three cake stands.
//
// The slug is `hanoi` (the puzzle's name, and the skill's) while the kid-facing
// name is Cake Shift — see src/lib/games/hanoi/name.ts for why the two are
// kept apart.

import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import { HANOI_SLUG } from '@/lib/games/hanoi/name';
import HanoiShell from './HanoiShell';

// Tracks against its own 'logic' skill (migration 0058) — no arithmetic, no
// word gate. Free, like every Puzzle Island booth: the island is one purchase.
const SKILL_SUBJECT = 'logic' as const;
const SKILL_SLUG = HANOI_SLUG;

export default async function HanoiPage() {
  const kidId = await getActiveKid();
  const sb = supabaseServer();

  const { data: kidRow } = await sb
    .from('kids')
    .select('name')
    .eq('id', kidId!)
    .maybeSingle();
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
    <HanoiShell
      kidName={kidName}
      currentTier={currentTier}
      skillSubject={SKILL_SUBJECT}
      skillSlug={SKILL_SLUG}
    />
  );
}
