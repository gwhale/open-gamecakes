// Grade-driven defaults for a kid — the single replacement for every
// name-matching heuristic that used to be scattered across the game pages.
//
// History: before kids.grade existed (migration 0015), games decided which
// skill a kid tracks against by sniffing the kid's NAME — `startsWith('char')`
// meant kindergarten. That heuristic was copy-pasted into fifteen game pages,
// the sight-words mapper, the parent dashboard and the recommendations route,
// and it hardcoded the founding family's children into the platform. The grade
// column has been in the database (and backfilled) since 0015; this module
// finishes the TODO that migration left behind. No name ever decides anything
// again — a kid's grade is data, and it lives in the kids table.
//
// All three helpers accept null/undefined because kids.grade is nullable by
// design: a brand-new family doesn't know each kid's grade at signup, and the
// parent fills it in from the dashboard later. The fallbacks below reproduce
// exactly what the old name-heuristics returned for an unrecognized name, so
// a kid with no grade set plays the same content before and after this change.

import type { Grade } from '@/lib/mastery/grade-baseline';

/** Which math skill a kid's play tracks against by default.
 *  Kindergarten counts; everyone else (including grade-unset) adds. */
export function mathSkillForGrade(grade: number | null | undefined): string {
  return grade === 0 ? 'counting-to-20' : 'add-within-20';
}

/** Which sight-words skill row a kid's reading play credits.
 *  One row per grade band — see lib/games/sight-words-skill.ts for the set. */
export function sightWordsSkillForGrade(grade: number | null | undefined): string {
  if (grade === 0) return 'sight-words-kindergarten';
  if (grade != null && grade >= 2) return 'sight-words-second-grade';
  return 'sight-words-first-grade';
}

/** Numeric kids.grade → the string Grade the mastery baseline understands.
 *  Null falls to '1' (the middle of the early-elementary band, matching the
 *  old unknown-name default); grades past 5 clamp to '5'. */
export function gradeLabel(grade: number | null | undefined): Grade {
  if (grade == null) return '1';
  if (grade <= 0) return 'K';
  if (grade >= 5) return '5';
  return String(grade) as Grade;
}
