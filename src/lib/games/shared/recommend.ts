// "Cakey recommends" — one tap that sets the launcher to the work the kid's
// grade is actually doing in school right now.
//
// The level grid gives a kid ten numbers and no reason to prefer any of
// them. Left alone they pick their ★ tier or whatever they picked last
// time, which drifts away from classwork: a second grader can sit on
// within-20 addition all year because it feels good, and nothing in the
// launcher ever suggests otherwise.
//
// So Cakey suggests. The target comes from the grade's CCSS critical area
// — the "instructional time should focus on" paragraph that opens each
// grade in the California framework — mapped onto the tier scale in
// generate-challenge.ts:
//
//   K  K.OA.A.2/A.5   putting together & taking apart within 10   → tier 2
//   1  1.OA.C.6       add & subtract within 20                    → tier 3
//   2  2.NBT.B.5      fluent add & subtract within 100            → tier 5
//   3  3.OA.C.7       multiply & divide within 100                → tier 7
//   4  4.NBT.B.5/6    multi-digit multiplication & division       → tier 8
//   5  5.NBT.B.5/6    multi-digit operations                      → tier 9
//
// Two rules keep the suggestion from being annoying rather than useful:
//
//   * It never suggests a step backwards. A kid already past their grade
//     target keeps their own tier — Cakey is a floor, not a ceiling.
//   * It never suggests a locked level, so tapping it always works.
//
// A grown-up can override all of it. The grade default is always roughly right
// and never exactly right — it cannot know that a class spent October on money,
// or that there is a times-tables quiz on Friday. `focus` (kids.focus_*,
// migration 0046) says so directly, and null — the normal state — leaves the
// grade default standing. Both paths, one function.

import { isMathKind, type QuestionMode, type MathKind } from './challenge-mode';
import {
  isReadingChallengeType,
  type ReadingChallengeType,
} from './generate-reading-challenge';

/** Levels above the kid's best tier that stay selectable. Mirrors
 *  UNLOCK_GRACE in GameLauncher — a suggestion the grid would render as 🔒
 *  is worse than no suggestion. */
const UNLOCK_GRACE = 4;

export interface CakeyPick {
  /** The level to select in the grid. Always unlocked, always 1–10. */
  level: number;
  /** Set when the pick is for math mode. */
  mathType?: MathKind;
  /** Set when the pick is for words mode. */
  readingType?: ReadingChallengeType;
  /** Kid-facing name for the work, e.g. "Times tables". Short. */
  headline: string;
  /** One sentence of why, in Cakey's voice. No jargon, no standard codes. */
  reason: string;
}

interface GradePlan {
  tier: number;
  mathType: MathKind;
  mathHeadline: string;
  readingType: ReadingChallengeType;
  readingHeadline: string;
  /** How the grade is named to the kid. */
  gradeLabel: string;
}

/** kids.grade is 0 for Kindergarten. */
const GRADE_PLANS: Record<number, GradePlan> = {
  0: {
    tier: 2,
    mathType: 'mixed',
    mathHeadline: 'Adding and taking away up to 10',
    readingType: 'letter-sounds',
    readingHeadline: 'Letter sounds',
    gradeLabel: 'Kindergarten',
  },
  1: {
    tier: 3,
    mathType: 'mixed',
    mathHeadline: 'Adding and taking away up to 20',
    readingType: 'rhyming',
    readingHeadline: 'Rhyming words',
    gradeLabel: '1st grade',
  },
  2: {
    tier: 5,
    mathType: 'mixed',
    mathHeadline: 'Big adding and taking away',
    readingType: 'sight-words',
    readingHeadline: 'Sight words',
    gradeLabel: '2nd grade',
  },
  3: {
    tier: 7,
    mathType: 'multiplication',
    mathHeadline: 'Times tables',
    readingType: 'synonyms',
    readingHeadline: 'Words that mean the same',
    gradeLabel: '3rd grade',
  },
  4: {
    tier: 8,
    mathType: 'division',
    mathHeadline: 'Dividing big numbers',
    readingType: 'context-clues',
    readingHeadline: 'Figuring words out',
    gradeLabel: '4th grade',
  },
  5: {
    tier: 9,
    mathType: 'mixed',
    mathHeadline: 'Big-number workouts',
    readingType: 'word-roots',
    readingHeadline: 'Word parts',
    gradeLabel: '5th grade',
  },
};

/** What a grown-up set on /parent, straight off the kids row. Every field is
 *  optional and null is the normal state. */
export interface KidFocus {
  focus_math?: string | null;
  focus_math_level?: number | null;
  focus_reading?: string | null;
  focus_reading_level?: number | null;
}

export interface CakeyPickInput {
  /** Which question mode the launcher is currently showing. */
  mode: QuestionMode;
  /** kids.grade — 0 = K. Null for guests or before a grade is set. */
  grade?: number | null;
  /** The kid's ★ tier in the active mode. */
  currentTier: number;
  /** Best tier reached in the active mode's subject — sets the lock line. */
  maxReached: number;
  /** Grown-up override. Absent or null anywhere means "use the grade default"
   *  for that field, so a parent can pin the KIND without pinning the level. */
  focus?: KidFocus | null;
}

/**
 * What Cakey suggests for this kid, in this mode, right now.
 *
 * Returns null when there is nothing useful to say — no grade on file and
 * no play history to build on. A missing chip reads better than a chip
 * that recommends "level 1" to everyone.
 */
export function cakeyRecommends(input: CakeyPickInput): CakeyPick | null {
  const { mode, grade, currentTier, maxReached, focus } = input;
  const plan = grade == null ? null : GRADE_PLANS[grade];
  const verbal = mode === 'verbal';

  // A grown-up's pick, if there is one and it is a kind we can still generate.
  // An unrecognised value — a domain that was renamed, a typo from a hand-run
  // UPDATE — falls through to the grade default rather than posing a question
  // nobody can answer.
  const setKind = verbal ? focus?.focus_reading : focus?.focus_math;
  const setLevel = verbal ? focus?.focus_reading_level : focus?.focus_math_level;
  const pinnedKind =
    setKind != null && (verbal ? isReadingChallengeType(setKind) : isMathKind(setKind))
      ? setKind
      : null;
  const pinnedLevel =
    typeof setLevel === 'number' && setLevel >= 1 && setLevel <= 10 ? setLevel : null;

  if (!plan && !pinnedKind && currentTier <= 1) return null;

  const ceiling = Math.min(10, Math.max(1, maxReached) + UNLOCK_GRACE);

  // A grown-up's level is honoured as given, including downward. The
  // never-go-backwards rule protects the kid from a stale GRADE default, not
  // from an adult who knows the class is revisiting something.
  const level =
    pinnedLevel != null
      ? Math.max(1, Math.min(ceiling, pinnedLevel))
      : Math.max(
          1,
          Math.min(ceiling, Math.max(plan ? plan.tier : currentTier, currentTier)),
        );

  const reachedPastGrade = pinnedKind == null && plan != null && level > plan.tier;
  const kindLabel = pinnedKind ? (KIND_LABELS[pinnedKind] ?? 'Your practice') : null;
  const subject = verbal ? 'words' : 'math';

  const reason = pinnedKind
    ? 'This is what you are working on right now.'
    : !plan
      ? 'Picking up from your last round.'
      : reachedPastGrade
        ? `You are already past ${plan.gradeLabel} ${subject} — here is the next step up.`
        : `This is what ${plan.gradeLabel} is working on.`;

  if (verbal) {
    return {
      level,
      readingType: (pinnedKind as ReadingChallengeType) ?? plan?.readingType ?? 'mixed',
      headline: kindLabel ?? plan?.readingHeadline ?? 'Where you left off',
      reason,
    };
  }

  return {
    level,
    mathType: (pinnedKind as MathKind) ?? plan?.mathType ?? 'mixed',
    headline: kindLabel ?? plan?.mathHeadline ?? 'Where you left off',
    reason,
  };
}

/** Kid-facing names for a pinned kind. The grade plans carry their own
 *  headlines; a grown-up's pick arrives as a raw slug, so it needs one too.
 *  Same voice: what the kid would call it, not what the standard calls it. */
const KIND_LABELS: Record<string, string> = {
  addition: 'Adding',
  subtraction: 'Taking away',
  multiplication: 'Times tables',
  division: 'Sharing out',
  mixed: 'A bit of everything',
  compare: 'Bigger or smaller',
  'place-value': 'Tens and ones',
  'skip-count': 'Counting patterns',
  shapes: 'Shapes',
  'time-money': 'Time & money',
  fractions: 'Fair shares',
  area: 'Covering',
  'letter-sounds': 'Letter sounds',
  syllables: 'Word beats',
  rhyming: 'Rhyming words',
  'sight-words': 'Sight words',
  'word-building': 'Building words',
  spelling: 'Spelling',
  synonyms: 'Words that mean the same',
  antonyms: 'Opposites',
  'context-clues': 'Figuring words out',
  'word-roots': 'Word parts',
  'parts-of-speech': 'Word jobs',
  punctuation: 'Punctuation',
  comprehension: 'Reading closely',
  figurative: 'Picture language',
};
