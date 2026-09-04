// Turning tier numbers into something a parent can act on.
//
// THE PROBLEM THIS SOLVES
// The portal shows "tier 10". A parent who does not live in this schema has no
// way to know whether 10 is good, bad, or the maximum. The number is only
// meaningful RELATIVE to that skill's `on_track_tier` — the tier expected for
// its grade level — and that comparison was never surfaced anywhere.
//
// So: never show a bare tier. Show the comparison, and keep the raw number as
// secondary detail for anyone who wants it.

export type GradeStanding = 'ahead' | 'on-track' | 'behind' | 'unknown';

export interface GradeLevel {
  standing: GradeStanding;
  /** Tiers above (+) or below (−) the grade-level target. 0 when on track. */
  delta: number;
  /** Plain-language summary. The thing to actually render. */
  label: string;
  /** Tailwind text colour matching the standing. */
  tone: string;
}

/** Compare a kid's current tier against the grade-level target for that skill.
 *
 *  `onTrackTier` is null for skills with no grade expectation (Chess Puzzles) —
 *  those are 'unknown' rather than being scored against a target that does not
 *  exist. Saying a kid is "behind" at chess because the column is null would be
 *  a lie invented by arithmetic. */
export function gradeLevel(currentTier: number, onTrackTier: number | null): GradeLevel {
  if (onTrackTier == null) {
    return {
      standing: 'unknown',
      delta: 0,
      label: 'No grade level for this one',
      tone: 'text-zinc-400',
    };
  }
  const delta = currentTier - onTrackTier;
  if (delta === 0) {
    return { standing: 'on-track', delta, label: 'Right on track', tone: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (delta > 0) {
    return {
      standing: 'ahead',
      delta,
      label: `${delta} tier${delta === 1 ? '' : 's'} above grade level`,
      tone: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  const behind = -delta;
  return {
    standing: 'behind',
    delta,
    label: `${behind} tier${behind === 1 ? '' : 's'} below grade level`,
    tone: 'text-rose-600 dark:text-rose-400',
  };
}

/** One-line explainer for the tier scale itself, for tooltips and glossaries. */
export const TIER_EXPLAINER =
  'Every skill runs from tier 1 to tier 10, getting harder each step. What matters is not the number but how it compares to the tier expected for that grade.';
