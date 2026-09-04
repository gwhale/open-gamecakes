// Shared helper for reading games that log against the sight-words skill.
//
// The `skills` table has one sight-words row per grade:
//   - sight-words-kindergarten
//   - sight-words-first-grade
//   - sight-words-second-grade
//
// Games like Word Flap and Word Memory need to log their sessions against
// ONE of those, scoped to the kid's grade. This file is the single source
// of truth for that mapping so the games stay consistent — and so we don't
// re-create the bug where Word Memory tried to log against the nonexistent
// slug `sight-words`.
//
// The mapping is grade-driven (kids.grade, migration 0015) — the original
// name-based heuristic and its TODO are gone; see lib/kids/defaults.ts.

/** Every sight-words skill row, as one enumerable set.
 *
 *  Exists because sightWordsSkillForGrade() is a function OF THE KID, so it
 *  cannot be inverted by probing: the parent portal needs to know that all
 *  three rows are drilled by the same 'sight-words' word kind, and probing
 *  the function with one grade only ever reveals one row. */
export const SIGHT_WORDS_SKILLS = [
  'sight-words-kindergarten',
  'sight-words-first-grade',
  'sight-words-second-grade',
] as const;

export { sightWordsSkillForGrade } from '@/lib/kids/defaults';
