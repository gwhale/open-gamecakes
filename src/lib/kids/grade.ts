// Deriving a kid's CURRENT grade from a stored assertion plus its date.
//
// Why this exists: kids.grade used to be a bare number, and nothing in the app
// ever wrote it (there is no parent UI for grade, despite migration 0015's
// comment promising one). So it could only rot. It sat a full school year out
// of date until 2026-08-28, silently — grade drives the [grade-1, grade+1]
// trivia window and the mastery baseline, so a stale value just serves last
// year's content with nothing anywhere to indicate why.
//
// Migration 0044 adds kids.grade_year: the school year in which kids.grade was
// true. Today's grade is then a pure function of the two plus the clock, so it
// advances every August by itself — no cron job, no scheduled task, no annual
// chore, and nothing to forget.

/** A school year named by its START year: 2026-08-01 .. 2027-07-31 is 2026.
 *  August is the boundary because that is when US grades roll over. UTC is
 *  used so the result is deterministic on a server and in tests; the few
 *  hours of skew around Aug 1 cannot change anyone's grade meaningfully. */
export function schoolYearOf(now: Date = new Date()): number {
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** The grade a kid is in NOW, given the grade they were in during
 *  `gradeYear`. Clamped to the 0..12 range kids.grade is checked against.
 *
 *  - grade null (never set) stays null: callers already treat that as
 *    "unknown" and fall back to a middle-of-range default.
 *  - gradeYear null (a row predating 0044's backfill) trusts grade as-is
 *    rather than inventing an anchor — no silent advancement from a guess. */
export function currentGrade(
  grade: number | null | undefined,
  gradeYear: number | null | undefined,
  now: Date = new Date(),
): number | null {
  if (grade == null) return null;
  if (gradeYear == null) return grade;
  const advanced = grade + (schoolYearOf(now) - gradeYear);
  return Math.min(12, Math.max(0, advanced));
}

/** Row-shaped convenience for the ~18 call sites that select a kid and want
 *  the derived grade. Accepts the loose shapes Supabase hands back. */
export function currentGradeOf(
  row: { grade?: number | null; grade_year?: number | null } | null | undefined,
  now: Date = new Date(),
): number | null {
  return currentGrade(row?.grade, row?.grade_year, now);
}

/** Grade labels in order, matching the `skills.grade_level` vocabulary.
 *  Index doubles as the numeric grade (K = 0). */
export const GRADE_LABELS = ['K', '1', '2', '3', '4', '5', '6'] as const;

/**
 * Is a skill's grade band at or below the kid's own grade?
 *
 * `skills.grade_level` is a band string — 'K', '2', 'K-1', '2-3'. The MIN of
 * the band decides: a 'K-2' standard is already expected of a 2nd grader, so
 * it counts; a '4' standard does not count against a 2nd grader, it is
 * enrichment (and the skills list already labels it that way).
 *
 * Used to scope the parent dashboard's "on track" denominator. Before this,
 * that fraction divided by every standard in the catalog K-6, so a 1st grader
 * was permanently measured against long division and percents.
 *
 * Returns true when the kid's grade is unknown — an unscoped denominator is
 * wrong, but a denominator of zero is worse.
 */
export function isAtOrBelowGrade(
  gradeLevel: string | null | undefined,
  kidGrade: number | null | undefined,
): boolean {
  if (kidGrade == null) return true;
  if (!gradeLevel) return false;
  const min = GRADE_LABELS.indexOf(
    gradeLevel.split('-')[0].trim() as (typeof GRADE_LABELS)[number],
  );
  // An unrecognized band (a grade past 6, a typo) is not something we can
  // hold a kid to.
  if (min < 0) return false;
  return min <= kidGrade;
}
