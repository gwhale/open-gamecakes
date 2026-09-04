// Challenge mode — the one place that maps a game's chosen "mode" onto a
// concrete Challenge, plus the mode → skill mapping used for crediting.
//
// Every math game offers the player a pre-game toggle on the launcher:
//   * Math  — the usual arithmetic keypad questions
//   * Words — vocabulary / reading questions (multiple-choice)
//
// Words mode is NOT a single content set: the launcher shows a word-kind
// picker (Synonyms / Rhymes / Sight Words / Mixed), and that choice rides the
// `challengeMode` scene prop. Gameplay is identical either way — only the
// gate/collision question changes. The shared host modal already renders both
// a numeric keypad and a choice-button stack (see challenge.ts), so nothing
// downstream needs to know which mode is active.

import type { Challenge } from './challenge';
import {
  generateMathChallenge,
  generateMakeTenChallenge,
  type MathType,
} from './generate-challenge';
import {
  generateReadingChallenge,
  type ReadingChallengeType,
} from './generate-reading-challenge';
import { sightWordsSkillForGrade } from '@/lib/games/sight-words-skill';
import {
  generateConceptChallenge,
  isConceptType,
  type ConceptType,
} from './generate-concept-challenge';

/** The launcher toggle's two positions. Kept separate from ChallengeMode so
 *  the UI reasons about "math vs words" while the engine reasons about the
 *  concrete content type. */
export type QuestionMode = 'math' | 'verbal';

/** What the challenge generator actually produces at each gate — either 'math'
 *  or one of the reading content types. This is the value threaded through
 *  `sceneProps.challengeMode`; the scenes/hosts pass it straight to
 *  generateChallengeForMode without interpreting it. */
export type ChallengeMode = 'math' | ReadingChallengeType;

/** Everything the math-kind picker can emit: the four arithmetic operations
 *  plus the non-arithmetic concept domains (comparison, place value, skip
 *  counting, shapes, time & money). Arithmetic answers on the keypad, concepts
 *  answer on the choice buttons — generateChallengeForMode picks the renderer,
 *  so nothing upstream of it has to care which kind it is holding. */
export type MathKind = MathType | ConceptType;

export interface ChallengeModeOpts {
  /** Difficulty tier. Math uses the game's math tier; verbal uses the kid's
   *  reading tier (the shell decides which one to pass). */
  tier: number;
  /** Math-only: which operation or concept domain to draw from. Ignored in
   *  verbal mode. */
  mathType?: MathKind;
  /** Math-only: 'make-ten' swaps in the fill-in-the-blank generator (Flappy
   *  Math's variant). Ignored in verbal mode. */
  mathStyle?: 'standard' | 'make-ten';
}

/** Produce a Challenge for the chosen mode.
 *  - 'math'   → NumericChallenge (keypad)
 *  - any other value is a reading content type → ChoiceChallenge (buttons) */
export function generateChallengeForMode(
  mode: ChallengeMode,
  opts: ChallengeModeOpts,
): Challenge {
  if (mode !== 'math') {
    // `mode` IS the reading content type (synonyms / rhyming / sight-words /
    // mixed), which is exactly a ReadingChallengeType.
    return generateReadingChallenge(opts.tier, mode);
  }
  if (opts.mathStyle === 'make-ten') {
    return generateMakeTenChallenge();
  }
  // Concept domains answer on the SAME choice-button stack the reading path
  // uses, which is the whole reason they were cheap to add.
  const kind = opts.mathType ?? 'mixed';
  if (isConceptType(kind)) {
    return generateConceptChallenge(kind, opts.tier);
  }
  const ch = generateMathChallenge(opts.tier, kind);
  return { kind: 'numeric', prompt: ch.prompt, answer: ch.answer };
}

/** Which reading skill a verbal round credits, given the chosen word kind.
 *  Synonyms and rhyming have dedicated skill rows; sight-words (and 'mixed',
 *  which rotates across all three types) credit the kid's grade-appropriate
 *  sight-words skill — the grade-anchored reading skill, matching how Word
 *  Flap attributes all its reading play. The secondary-skill evidence engine
 *  (/api/attempts) spreads partial credit to the other reading skills the
 *  session exercised, so mixed play is not lost. */
export function verbalSkillFor(
  verbalType: ReadingChallengeType,
  /** kids.grade (0 = K), nullable — grade decides the sight-words band. */
  kidGrade?: number | null,
  /** The kid's verbal tier. Only 'comprehension' reads it — that one type
   *  spans two skill rows (K-1 vs grade 2), and the tier is what separates
   *  them. Optional so a caller without a tier still attributes sensibly. */
  tier?: number,
): { subject: 'reading'; slug: string } {
  switch (verbalType) {
    case 'synonyms':
    // Antonyms fold into the synonyms skill — its CCSS descriptor
    // (L.K.5/L.1.5) is literally "word relationships: synonyms, antonyms" —
    // so no separate skill row is needed.
    case 'antonyms':
      return { subject: 'reading', slug: 'synonyms' };
    case 'rhyming':
      return { subject: 'reading', slug: 'rhyming-words' };
    case 'context-clues':
      return { subject: 'reading', slug: 'context-clues' };
    // Its own row (0049), NOT context-clues. Knowing what a word you were
    // taught means (L.x.6) is a different ability from deducing an unknown one
    // from the sentence around it (L.3.4), and this is the type a grown-up's
    // class word list drives — folding it into context-clues would show a
    // second grader drilling Friday's list as doing grade 3-4 inference.
    case 'word-meaning':
      return { subject: 'reading', slug: 'word-meaning' };

    // --- added 2026-07-26: the nine types that close the standards gap ---
    case 'letter-sounds':
      return { subject: 'reading', slug: 'letter-sounds' };
    case 'syllables':
      return { subject: 'reading', slug: 'phonological-awareness' };
    // Tiers 1-3 are one-sentence literal recall (RL.K.1); tiers 4-5 are
    // passages with inference (RL.2.1). Two rows, one picker entry — the
    // kid should not have to know which grade band they are in.
    case 'comprehension':
      return {
        subject: 'reading',
        slug: (tier ?? 1) >= 4 ? 'reading-comprehension' : 'simple-comprehension',
      };
    case 'punctuation':
      return { subject: 'reading', slug: 'capitalization-punctuation' };
    case 'parts-of-speech':
      return { subject: 'reading', slug: 'parts-of-speech' };
    // NB: the skills row is `multisyllabic-words`, not `-decoding`.
    case 'word-building':
      return { subject: 'reading', slug: 'multisyllabic-words' };
    case 'spelling':
      return { subject: 'reading', slug: 'spelling-patterns' };
    case 'figurative':
      return { subject: 'reading', slug: 'figurative-language' };
    case 'word-roots':
      return { subject: 'reading', slug: 'greek-latin-roots' };

    case 'sight-words':
    case 'mixed':
    default:
      return { subject: 'reading', slug: sightWordsSkillForGrade(kidGrade) };
  }
}

/** Which math skill a round credits, given the chosen operation and tier.
 *
 *  The math mirror of verbalSkillFor(). Until 2026-09-03 there was no
 *  mirror: every math game hard-coded `SKILL_SLUG = 'add-within-20'` on its
 *  page, so a third grader doing 7 × 8 at tier 7 logged mastery against
 *  1.OA.C.6 — a first-grade addition standard — and multiply-within-25,
 *  the double-digit skills and divide-within-100 never received a single
 *  gameplay attempt. The catalog was CCSS-aligned; the crediting was not.
 *
 *  Slugs here must exist in the skills table (see 0006_ccss_standards.sql
 *  and 0007_k6_competency_framework.sql) — /api/attempts looks them up by
 *  (subject, name) and 400s on a miss.
 *
 *  Tier bands follow generate-challenge.ts. Keep the two in sync. */
export function mathSkillFor(
  mathType: MathKind,
  tier: number,
): { subject: 'math'; slug: string } {
  const t = Math.max(1, Math.min(10, Math.round(tier)));
  const slug = (s: string) => ({ subject: 'math' as const, slug: s });

  switch (mathType) {
    // --- concept domains (choice buttons), added 2026-09-03 ---
    case 'compare':
      return slug('number-comparison');
    case 'place-value':
      return slug('place-value');
    case 'skip-count':
      return slug('skip-counting');
    case 'shapes':
      // K.G is flat shapes; solids are 1.G.A.2 and arrive with the tier-4
      // branch in generateShapes(). Credit whichever the kid was asked.
      return slug(t <= 3 ? 'shapes-2d' : 'shapes-3d');
    case 'time-money':
      return slug('time-and-money');
    case 'fractions':
      // The same drawing carries three grades. Below grade 3 the question is
      // "how many equal pieces" — that is 1.G.A.3 / 2.G.A.3, a GEOMETRY
      // standard, not a fraction one. Grade 3 names a/b (3.NF.A.1) and then
      // compares two wholes (3.NF.A.3.d). Credit what was actually asked.
      if (t <= 3) return slug('shapes-2d');
      return slug(t >= 8 ? 'equivalent-fractions' : 'fraction-concepts');
    case 'area':
      return slug('area-and-perimeter');

    case 'addition':
      if (t <= 2) return slug('add-within-10');
      if (t === 3) return slug('add-within-20');
      if (t <= 5) return slug('add-double-digit');
      if (t <= 7) return slug('add-subtract-within-100');
      return slug('multi-digit-operations');

    case 'subtraction':
      if (t <= 2) return slug('subtract-within-10');
      if (t === 3) return slug('subtract-within-20');
      if (t <= 5) return slug('subtract-double-digit');
      if (t <= 7) return slug('add-subtract-within-100');
      return slug('multi-digit-operations');

    case 'multiplication':
      if (t <= 6) return slug('multiply-within-25');
      if (t === 7) return slug('multiply-within-100');
      return slug('multi-digit-multiply');

    case 'division':
      if (t <= 7) return slug('divide-within-100');
      return slug('long-division');

    case 'mixed':
    default:
      // 'mixed' draws from whatever the tier teaches, so credit the skill
      // that tier is ABOUT rather than guessing an operation.
      if (t <= 2) return slug('add-within-10');
      if (t === 3) return slug('add-within-20');
      if (t <= 5) return slug('add-subtract-within-100');
      if (t === 6) return slug('multiply-within-25');
      if (t === 7) return slug('multiply-within-100');
      return slug('multi-digit-operations');
  }
}

/** Every value the launcher's math-kind picker can hold. Used to validate a
 *  `?op=` deep link before it is trusted as state. */
const MATH_KINDS: readonly MathKind[] = [
  'addition',
  'subtraction',
  'multiplication',
  'division',
  'mixed',
  'compare',
  'place-value',
  'skip-count',
  'shapes',
  'time-money',
  'fractions',
  'area',
];

export function isMathKind(value: string | null | undefined): value is MathKind {
  return value != null && (MATH_KINDS as readonly string[]).includes(value);
}
