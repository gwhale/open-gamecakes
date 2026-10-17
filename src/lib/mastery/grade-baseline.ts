// Grade-anchored difficulty baseline — the heart of "relative levels".
//
// Decision (2026-07-07): a kid-facing "Level 1" must mean "Level 1 FOR
// YOUR GRADE." A 3rd grader and a 1st grader both tap the same "Level 1"
// button, but the 3rd grader gets 24 + 38 while the 1st grader gets 3 + 4.
//
// We do this WITHOUT adding a second difficulty axis. Games already
// generate content from an absolute tier (1–10, see generate-challenge.ts).
// We only shift where a given kid's Level 1 lands on that absolute scale:
//
//     absoluteTier = clamp( gradeBaselineTier(grade) + (level - 1), 1, 10 )
//
// So "level" is grade-relative and kid-facing; "tier" stays absolute and
// drives the actual content generator. One multiplication of concerns,
// removed.
//
// Absolute tier legend — this is the SKILLS CATALOG scale (the one with
// CCSS codes on it), which generate-challenge.ts was re-pointed at on
// 2026-09-03. Keep the two in sync; they used to disagree.
//
//   1  add within 5                 K.OA.A.5
//   2  add & subtract within 10     K.OA.A.2 · 1.OA.C.6
//   3  add & subtract within 20     1.OA.C.6 · 2.OA.B.2
//   4  two-digit ± one-digit        1.NBT.C.4
//   5  add & subtract within 100    2.NBT.B.5
//   6  multiply within 25           2.OA.C.4 · 3.OA.A.1
//   7  multiply & divide within 100 3.OA.C.7
//   8  multi-digit ops              4.NBT.B.4/5/6
//   9  larger multi-digit ops       5.NBT.B.5/6
//  10  the everything-mix (7–9)

export type Grade = 'K' | '1' | '2' | '3' | '4' | '5';

export const GRADE_ORDER: readonly Grade[] = ['K', '1', '2', '3', '4', '5'];

export const MIN_TIER = 1;
export const MAX_TIER = 10;

/**
 * ⭐ THE PEDAGOGICAL DIAL ⭐
 *
 * The absolute tier a kid's *Level 1* maps to, by the grade they're
 * entering. This encodes "what should the easiest level feel like for a
 * kid at this grade?" — the one judgment call that shapes the whole
 * experience.
 *
 * Level 1 is the on-ramp, not the target: it sits at the bottom of the
 * grade's own band so the first tap is always winnable, and the grade's
 * on-track standard is a level or two up. Reading across:
 *
 *   K  · L1 → tier 1  · 3 + 2
 *   1  · L1 → tier 2  · 8 − 3          L2 → within 20
 *   2  · L1 → tier 3  · 14 + 5         L3 → within 100
 *   3  · L1 → tier 5  · 47 + 26        L3 → × and ÷ within 100
 *   4  · L1 → tier 7  · 56 ÷ 8         L2 → multi-digit
 *   5  · L1 → tier 8  · 34 × 7
 *
 * Tune by the game-feel doubling/halving rule (see project_gamecakes_game_feel):
 * if a grade's Level 1 plays too easy in a real sitting, bump that grade's
 * baseline up ONE tier and playtest — don't fine-slice.
 *
 * Revised 2026-09-03 alongside the tier-scale collapse. The previous table
 * (K:1, 1:2, 2:4, 3:6, 4:8, 5:9) was written against the old hand-rolled
 * ladder where tier 4 meant "subtract within 10" and tier 9 meant "9 × 9";
 * carrying those numbers onto the catalog scale would have put a 4th grader's
 * Level 1 on multiply-within-25 and a 5th grader's on tier 9 with two levels
 * of headroom. NEEDS A PLAYTEST before it is treated as settled.
 */
export const GRADE_BASELINE_TIER: Record<Grade, number> = {
  K: 1,
  '1': 2,
  '2': 3,
  '3': 5,
  '4': 7,
  '5': 8,
};

/** Clamp any number into the valid absolute-tier band [1, 10]. */
export function clampTier(tier: number): number {
  return Math.max(MIN_TIER, Math.min(MAX_TIER, Math.round(tier)));
}

/** The absolute content tier for a given grade + kid-facing level. */
export function levelToTier(grade: Grade, level: number): number {
  const baseline = GRADE_BASELINE_TIER[grade] ?? MIN_TIER;
  return clampTier(baseline + (level - 1));
}

/** Inverse of levelToTier — turn an absolute tier back into the kid-facing
 *  level for display (e.g. the adaptive engine bumped their tier; what
 *  "level" do we show?). Never returns below 1. */
export function tierToLevel(grade: Grade, tier: number): number {
  const baseline = GRADE_BASELINE_TIER[grade] ?? MIN_TIER;
  return Math.max(1, clampTier(tier) - baseline + 1);
}

/** How many kid-facing levels a grade actually has room for on the 1–10
 *  scale. A 3rd grader starting at tier 5 has 6 levels (5→10); a
 *  Kindergartener has all 10. Drives the level-select grid length so we
 *  never show a level that maps past tier 10. */
export function levelCountForGrade(grade: Grade): number {
  return MAX_TIER - (GRADE_BASELINE_TIER[grade] ?? MIN_TIER) + 1;
}
