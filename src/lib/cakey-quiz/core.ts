import { generateMathChallenge } from '@/lib/games/shared/generate-challenge';
import { mathSkillFor } from '@/lib/games/shared/challenge-mode';
import {
  generateReadingChallenge,
  type ReadingChallengeType,
} from '@/lib/games/shared/generate-reading-challenge';
import { verbalSkillFor } from '@/lib/games/shared/challenge-mode';

export type QuizSubject = 'math' | 'reading';
export type QuizQuestionKind = 'numeric' | 'choice';

export interface StoredQuizQuestion {
  id: string;
  subject: QuizSubject;
  tier: number;
  skillSlug: string;
  kind: QuizQuestionKind;
  prompt: string;
  subtext?: string;
  choices?: string[];
  answer: string;
}

export type PublicQuizQuestion = Omit<StoredQuizQuestion, 'answer' | 'skillSlug'>;

export interface QuizAnswer {
  questionId: string;
  response: string;
  correct: boolean;
  answeredAt: string;
}

export interface SubjectPlacement {
  math: number;
  reading: number;
}

const READING_TYPES_BY_TIER: readonly (readonly ReadingChallengeType[])[] = [
  ['letter-sounds', 'rhyming', 'sight-words'],
  ['letter-sounds', 'syllables', 'sight-words'],
  ['syllables', 'rhyming', 'spelling'],
  ['sight-words', 'spelling', 'synonyms'],
  ['synonyms', 'antonyms', 'punctuation'],
  ['context-clues', 'comprehension', 'parts-of-speech'],
  ['context-clues', 'word-building', 'parts-of-speech'],
  ['word-building', 'comprehension', 'figurative'],
  ['word-roots', 'figurative', 'comprehension'],
  ['word-roots', 'figurative', 'comprehension'],
];

export function clampTier(tier: number): number {
  return Math.max(1, Math.min(10, Math.round(tier)));
}

export function questionTiers(baseTier: number): number[] {
  const base = clampTier(baseTier);
  return [
    clampTier(base - 1),
    base,
    base,
    clampTier(base + 1),
    clampTier(base + 1),
  ];
}

export function scorePlacement(startTier: number, correct: number): number {
  if (correct >= 4) return clampTier(startTier + 1);
  if (correct <= 1) return clampTier(startTier - 1);
  return clampTier(startTier);
}

export function medianTier(tiers: readonly number[]): number | null {
  const valid = tiers.filter((tier) => Number.isFinite(tier) && tier >= 1 && tier <= 10);
  if (valid.length === 0) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Grade fallback used only before a kid has played enough to create evidence.
 *  Tier 2 is roughly the kindergarten baseline; each grade advances one tier. */
export function tierForGrade(grade: number | null | undefined): number {
  if (grade == null || !Number.isFinite(grade)) return 1;
  return clampTier(grade + 2);
}

function readingTypeFor(tier: number, offset: number): ReadingChallengeType {
  const pool = READING_TYPES_BY_TIER[clampTier(tier) - 1];
  return pool[offset % pool.length];
}

export function buildQuizQuestions(placement: SubjectPlacement): StoredQuizQuestion[] {
  const mathTiers = questionTiers(placement.math);
  const readingTiers = questionTiers(placement.reading);
  const math: StoredQuizQuestion[] = mathTiers.map((tier, index) => {
    const challenge = generateMathChallenge(tier, 'mixed');
    return {
      id: `math-${index + 1}`,
      subject: 'math',
      tier,
      skillSlug: mathSkillForTier(tier),
      kind: 'numeric',
      prompt: challenge.prompt,
      answer: String(challenge.answer),
    };
  });
  const reading: StoredQuizQuestion[] = readingTiers.map((tier, index) => {
    const type = readingTypeFor(tier, index);
    const challenge = generateReadingChallenge(tier, type);
    return {
      id: `reading-${index + 1}`,
      subject: 'reading',
      tier,
      skillSlug: verbalSkillFor(type, null, tier).slug,
      kind: 'choice',
      prompt: challenge.prompt,
      subtext: challenge.subtext,
      choices: challenge.choices,
      answer: challenge.answer,
    };
  });

  return math.flatMap((question, index) => [question, reading[index]]);
}

export function publicQuestion(question: StoredQuizQuestion): PublicQuizQuestion {
  return {
    id: question.id,
    subject: question.subject,
    tier: question.tier,
    kind: question.kind,
    prompt: question.prompt,
    ...(question.subtext ? { subtext: question.subtext } : {}),
    ...(question.choices ? { choices: question.choices } : {}),
  };
}

export function answerMatches(question: StoredQuizQuestion, response: string): boolean {
  return response.trim().toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase();
}

export function mathSkillForTier(tier: number): string {
  // Single source of truth for tier -> math skill: challenge-mode's
  // mathSkillFor(), the same function the games credit with. The placement
  // quiz used to keep its own third mapping here (tier 1 -> counting-to-20
  // for what is actually an addition problem; nothing ever credited
  // multiply-within-25 or either double-digit skill), so a placement result
  // and a game round at the same tier landed on different skill rows.
  //
  // The quiz generates with mathType 'mixed', so it asks for 'mixed'.
  return mathSkillFor('mixed', clampTier(tier)).slug;
}

export function isAdjustmentEligible(
  lastAssessedAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastAssessedAt) return true;
  const last = new Date(lastAssessedAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= 7 * 24 * 60 * 60 * 1000;
}
