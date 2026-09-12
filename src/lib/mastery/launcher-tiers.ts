// Launcher tier lookup — what the level-select grid should unlock.
//
// Every game tracks mastery against ONE skill slug (its primary skill),
// but the 10-level grid in GameLauncher spans the kid's whole subject
// progression (level 1 = counting, level 8+ = multiplication). Unlocking
// from just the primary skill's tier punished kids unfairly: a kid
// calibrated to tier 9 on subtract-within-10 was locked to levels 1-3 in
// every math game because those games happen to track add-within-20.
//
// A teacher doesn't re-gate a kid per worksheet — if they've shown they
// can do harder work ANYWHERE in the subject, they've earned the right
// to try it everywhere. So:
//   * currentTier — the game's own skill, drives the ★ "your level"
//     marker and the default selection (where this kid usually plays
//     THIS game).
//   * highestTier — the kid's best tier across ALL skills in the
//     subject (game-earned or parent-calibrated), drives unlocking.
//
// Server-side only (uses the secret-key client passed by the caller).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';
import { normalizeModes } from '@/lib/games/shared/class-modes';

/** One `class_material` row as the database hands it back. `modes` is text[]
 *  and `glosses` is jsonb, so both arrive loosely typed and are narrowed here
 *  rather than trusted onward. */
interface MaterialRow {
  words: string[] | null;
  modes: unknown;
  glosses: unknown;
}

/** jsonb -> a plain word/definition map, dropping anything that is not a pair
 *  of non-empty strings. A malformed map costs the list its definitions, not
 *  the round. */
function cleanGlosses(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'string') continue;
    const k = key.trim().toLocaleLowerCase();
    const v = value.trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/** The four kids.focus_* columns, in one place so the ~21 game pages that need
 *  them do not each carry their own copy of the column list. */
export const KID_FOCUS_COLUMNS =
  'focus_math, focus_math_level, focus_reading, focus_reading_level';

export interface LauncherTiers {
  /** Tier on the game's own skill — the ★ marker / default level. */
  currentTier: number;
  /** Best tier anywhere in the subject — drives which levels unlock. */
  highestTier: number;
  /** What a grown-up pinned for this kid, or null. Fetched here because every
   *  game page already awaits this function — threading a fifth prop from 21
   *  pages to get one nullable row was the alternative. */
  focus: KidFocus | null;
  /** This kid's ACTIVE class lists, each kept whole with the modes it was
   *  added for. Empty when a grown-up has not added one. The launcher hands
   *  these to setClassLists() on Play; the reading generator then draws the
   *  modes a list claims from that list instead of the authored library.
   *
   *  Deliberately not flattened: see the comment at the merge below. */
  classLists: ClassWordList[];
}

export async function getLauncherTiers(
  sb: SupabaseClient,
  kidId: string | null,
  subject: 'math' | 'reading',
  skillSlug: string,
): Promise<LauncherTiers> {
  if (!kidId) return { currentTier: 1, highestTier: 1, focus: null, classLists: [] };

  const [{ data: rows }, { data: placement }, { data: kidRow }, { data: materialRows }] =
    await Promise.all([
      sb
        .from('kid_skills')
        .select('current_tier, total_attempts, skills!inner(name, subject)')
        .eq('kid_id', kidId)
        .eq('skills.subject', subject),
      sb
        .from('kid_subject_placements')
        .select('current_tier')
        .eq('kid_id', kidId)
        .eq('subject', subject)
        .maybeSingle(),
      sb.from('kids').select(KID_FOCUS_COLUMNS).eq('id', kidId).maybeSingle(),
      sb
        .from('class_material')
        .select('words, modes, glosses')
        .eq('kid_id', kidId)
        .eq('kind', 'words')
        .eq('active', true),
    ]);

  // Each list is kept whole, with its own modes and definitions.
  //
  // This used to flatten every list into one deduped array, which was right
  // while every list meant the same thing. It is not right now: merging a
  // spelling list with a vocabulary list would let spelling questions draw
  // words that were only ever added to be defined. De-duplication moved down to
  // poolForMode(), which can do it per mode and therefore correctly.
  const classLists: ClassWordList[] = [];
  for (const row of (materialRows ?? []) as MaterialRow[]) {
    const words = (row.words ?? []).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) continue;
    classLists.push({
      words,
      modes: normalizeModes(row.modes),
      // jsonb arrives as unknown; anything that is not a string map is treated
      // as no definitions rather than trusted into a question.
      glosses: cleanGlosses(row.glosses),
    });
  }

  const placementTier =
    typeof placement?.current_tier === 'number' ? placement.current_tier : 1;
  let currentTier = placementTier;
  let highestTier = placementTier;
  for (const row of rows ?? []) {
    const tier = row.current_tier as number;
    if (typeof tier !== 'number' || tier < 1) continue;
    const skill = row.skills as unknown as { name: string; subject: string };
    // A placement quiz guides untouched games, but once this exact skill has
    // real play evidence its own mastery remains the more specific signal.
    if (skill?.name === skillSlug && (row.total_attempts as number) > 0) currentTier = tier;
    if (tier > highestTier) highestTier = tier;
  }

  return {
    currentTier,
    highestTier,
    focus: (kidRow as KidFocus | null) ?? null,
    classLists,
  };
}
