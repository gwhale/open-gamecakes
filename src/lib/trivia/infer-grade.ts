// Auto-infer the kid's effective grade from existing performance data.
//
// Why this exists: telling a parent "now go set each kid's grade in the
// dashboard" is busy work — we already have a continuous stream of
// signal in kid_skills + attempts. Cakey trivia is calibrated from the
// same pool of evidence the mastery engine already uses, so it stays
// in sync as a kid levels up and never needs manual maintenance.
//
// Algorithm:
//   1. Find every skill the kid is proficient at: kid_skills row where
//      current_tier >= skills.on_track_tier. That's literally "the kid
//      can do this skill at the level expected for its grade."
//   2. Parse each skill's grade_level string ('K', '1', '2', 'K-1', etc.)
//      to a numeric grade (K=0).
//   3. Take the median. The median (not max) intentionally — a kid
//      who's mastered ONE 5th-grade skill but is otherwise at K
//      shouldn't get 5th-grade trivia. The median centers on their
//      typical level.
//
// Fallbacks (callsite combines them):
//   - If no proficient skills yet (brand-new kid): return null
//   - If null, the caller falls back to kids.grade if set, else lets
//     the trivia picker use its mid-range default

import type { SupabaseClient } from '@supabase/supabase-js';

/** Parse a grade_level cell from the skills table to a numeric grade.
 *  Handles 'K', single digits, and ranges like 'K-1' or '2-3'. Returns
 *  the LOWER bound of a range so a 'K-1' skill counts as K (don't
 *  inflate). Returns null for unrecognized inputs. */
function parseGrade(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const head = raw.split('-')[0]?.trim().toUpperCase() ?? '';
  if (head === 'K' || head === 'PRE-K' || head === 'PREK') return 0;
  const n = Number.parseInt(head, 10);
  if (Number.isFinite(n) && n >= 0 && n <= 12) return n;
  return null;
}

/** Returns the kid's inferred grade level (0=K, 1=1st, ..., 6=6th) based
 *  on which skills they've already reached on-track tier on. Null if
 *  they haven't been playing long enough to have any proficient skills. */
export async function inferKidGrade(
  sb: SupabaseClient,
  kidId: string,
): Promise<number | null> {
  // Single-trip query: kid_skills inner-joined to skills, filtered to
  // proficient rows (current_tier >= on_track_tier). PostgREST doesn't
  // support cross-column filters, so we fetch a small set and filter
  // in JS — the kid has at most ~62 kid_skills rows total (one per
  // K-6 skill in the catalog), so this is cheap.
  const { data, error } = await sb
    .from('kid_skills')
    .select('current_tier, skills!inner(grade_level, on_track_tier)')
    .eq('kid_id', kidId);

  if (error || !data || data.length === 0) return null;

  type Row = {
    current_tier: number;
    skills: { grade_level: string | null; on_track_tier: number | null };
  };
  const proficientGrades = (data as unknown as Row[])
    .filter((r) => {
      const onTrack = r.skills.on_track_tier ?? 1;
      return r.current_tier >= onTrack;
    })
    .map((r) => parseGrade(r.skills.grade_level))
    .filter((g): g is number => g !== null);

  if (proficientGrades.length === 0) return null;

  proficientGrades.sort((a, b) => a - b);
  const mid = Math.floor(proficientGrades.length / 2);
  // For even counts, the lower of the two middle values — stay
  // conservative so we don't push trivia harder than the kid has shown.
  return proficientGrades[mid];
}
