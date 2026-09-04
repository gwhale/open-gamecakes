// Reading challenge generator.
//
// Mirrors the shape of `generateMathChallenge` in the math side: take a
// tier + type, return one Challenge object. Keeps all the reading
// content in a pure JSON-y module (see reading-content.ts) so there's
// no runtime AI call per challenge — the adaptive engine handles
// calibration, this just picks a matching item.

import type { ChoiceChallenge } from '@/lib/games/shared/challenge';
import { poolForMode, misspell, confusableWords } from './focus-words';
import { canServeMode, isClassWordMode, usableEntries } from './class-modes';
import {
  READING_CONTENT,
  clampToAvailableTier,
  type ReadingType,
} from '@/lib/games/shared/reading-content';

/** Types the launcher can offer. 'mixed' rotates across all three. */
export type ReadingChallengeType = ReadingType | 'mixed';

/** Kid-facing name and glyph for each word kind.
 *
 *  Lives here, next to the types themselves, rather than in the launcher —
 *  the parent portal needs these labels too (to tell a parent WHICH kind to
 *  pick for a skill), and a second copy in a 'use client' component would be
 *  a duplicate that drifts. Labels are deliberately kid-legible: "Rhymes",
 *  not "phonological awareness". The standards mapping is verbalSkillFor(). */
export const READING_KINDS: Record<ReadingChallengeType, { label: string; emoji: string }> = {
  'letter-sounds':  { label: 'Letter Sounds', emoji: '🔊' },
  syllables:        { label: 'Syllables',     emoji: '👏' },
  rhyming:          { label: 'Rhymes',        emoji: '🎵' },
  'sight-words':    { label: 'Sight Words',   emoji: '👀' },
  'word-building':  { label: 'Big Words',     emoji: '🧱' },
  spelling:         { label: 'Spelling',      emoji: '✏️' },
  synonyms:         { label: 'Synonyms',      emoji: '🔁' },
  antonyms:         { label: 'Opposites',     emoji: '↔️' },
  'context-clues':  { label: 'Context',       emoji: '🔍' },
  'word-roots':     { label: 'Word Roots',    emoji: '🌱' },
  'word-meaning':   { label: 'Word Meanings', emoji: '💡' },
  'parts-of-speech':{ label: 'Word Jobs',     emoji: '🧩' },
  punctuation:      { label: 'Punctuation',   emoji: '❓' },
  comprehension:    { label: 'Story Sense',   emoji: '📖' },
  figurative:       { label: 'Word Play',     emoji: '🎭' },
  mixed:            { label: 'Mixed',         emoji: '🔀' },
};

/** What 'mixed' rotates across. Ordered foundational → advanced so the list
 *  reads like the skill progression it mirrors; the picker is uniform-random,
 *  so order has no effect on selection. */
const ALL_TYPES: ReadingType[] = [
  // phonics & phonological awareness
  'letter-sounds',
  'syllables',
  'rhyming',
  // word recognition & spelling
  'sight-words',
  'word-building',
  'spelling',
  // vocabulary & word structure
  'word-meaning',
  'synonyms',
  'antonyms',
  'context-clues',
  'word-roots',
  // grammar & conventions
  'parts-of-speech',
  'punctuation',
  // meaning
  'comprehension',
  'figurative',
];

/** Fisher-Yates shuffle — stable, no library. Returns a new array. */
function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** De-dup choices + strip any entry that equals the prompt itself (a few
 *  authored items have the target word in the distractor slot as a foot-
 *  gun; we filter those out rather than re-writing every one). */
function sanitizeChoices(item: { prompt: string; answer: string; choices: string[] }): string[] {
  const promptWord = extractPromptWord(item.prompt).toLowerCase();
  const seen = new Set<string>();
  const keep: string[] = [];
  for (const c of item.choices) {
    // Dedup is EXACT-CASE on purpose. It used to lowercase the key, which was
    // harmless while every choice in the library was lowercase — but the
    // capitalization items added 2026-07-26 distinguish their choices ONLY by
    // case ("The cat ran." / "the cat ran." / "the Cat ran."), and a
    // lowercased key collapsed all three into a single button, leaving the kid
    // a one-choice question. The anti-giveaway and answer checks below stay
    // case-insensitive, since those are about word identity, not spelling.
    if (seen.has(c)) continue;
    const key = c.toLowerCase();
    if (key === promptWord && key !== item.answer.toLowerCase()) continue;
    seen.add(c);
    keep.push(c);
  }
  // Guarantee the answer is present
  if (!keep.some((c) => c.toLowerCase() === item.answer.toLowerCase())) {
    keep.push(item.answer);
  }
  return keep;
}

/** Pulls the uppercase target word out of prompts like
 *  "Rhymes with CAT" or "Tap: CAT" or "Means the same as BIG" — the
 *  word is always the last all-caps token. */
function extractPromptWord(prompt: string): string {
  const tokens = prompt.split(/[\s:]+/);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].replace(/[^A-Z]/g, '');
    if (t.length > 0 && t === tokens[i].toUpperCase()) return t;
  }
  return '';
}

/** "What does BRAVE mean?", built from the definitions a grown-up typed.
 *
 *  The wrong answers are the OTHER definitions on the list, never invented
 *  ones. A generated definition would be a guess presented to a child as fact,
 *  and a scrambled one is obvious nonsense that teaches the shape of the joke
 *  rather than the meaning of the word. Real definitions from the same list are
 *  also the harder, better question: they are all plausible, all pitched at the
 *  same level, and all things this kid is meant to know by Friday.
 *
 *  The word is spoken as well as printed, the same way spelling is, so a kid
 *  who cannot yet decode it can still be asked what it means.
 *
 *  Returns null when the list cannot field three distinct definitions; the
 *  caller falls back to the authored library rather than posing a question
 *  whose wrong answers repeat the right one. */
function meaningFromClass(
  pool: readonly string[],
  glosses: Readonly<Record<string, string>>,
): ChoiceChallenge | null {
  const glossed = usableEntries('word-meaning', pool, glosses);
  if (glossed.length === 0) return null;

  const word = glossed[Math.floor(Math.random() * glossed.length)];
  const answer = glosses[word.toLocaleLowerCase()].trim();

  const seen = new Set<string>([answer.toLocaleLowerCase()]);
  const wrong: string[] = [];
  for (const other of shuffle([...glossed])) {
    const g = glosses[other.toLocaleLowerCase()]?.trim();
    if (!g) continue;
    const key = g.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    wrong.push(g);
    if (wrong.length === 2) break;
  }
  if (wrong.length < 2) return null;

  return {
    kind: 'choice',
    prompt: `What does ${word.toLocaleUpperCase()} mean?`,
    subtext: 'From your word list',
    answer,
    choices: shuffle([answer, ...wrong]),
    speak: word,
  };
}

/** Build a question from THIS WEEK'S class list, in the mode it was added for.
 *
 *  When a grown-up has added a word list (class_material, migration 0047) it
 *  replaces the authored pool for the modes that list was added for (0048) —
 *  that is the entire point of adding it. Everything else about the question is
 *  identical, including the audio, so a class list is practised exactly the way
 *  the built-in words are and credits the same skill.
 *
 *  Returns null when there is no list, or when the list cannot supply enough
 *  distinct choices for a fair question; the caller then falls back to the
 *  library rather than posing something with two buttons that read the same.
 */
function fromFocusWords(readingType: ReadingType): ChoiceChallenge | null {
  // A list only intercepts the reading types it was added for. Everything else
  // falls through to the authored library, which is the correct answer rather
  // than a shortfall: twelve spelling words have nothing useful to say about
  // punctuation.
  if (!isClassWordMode(readingType)) return null;
  const { words: pool, glosses } = poolForMode(readingType);
  if (!canServeMode(readingType, pool, glosses)) return null;

  if (readingType === 'word-meaning') return meaningFromClass(pool, glosses);

  const word = pool[Math.floor(Math.random() * pool.length)];
  const answer = word.toLocaleLowerCase();

  if (readingType === 'spelling') {
    // Wrong answers are misspellings of THIS word, not other list words: the
    // question is how it is written, so the choices have to differ in spelling
    // alone.
    const wrong = misspell(answer, 2);
    if (wrong.length === 0) return null;
    return {
      kind: 'choice',
      prompt: 'Which one spells the word you heard?',
      subtext: 'From your word list',
      answer,
      choices: shuffle([answer, ...wrong]),
      speak: word,
    };
  }

  // Sight words: the skill is telling the list apart, so the list itself is
  // the best source of wrong answers.
  const wrong = confusableWords(answer, pool, 2);
  if (wrong.length === 0) return null;
  return {
    kind: 'choice',
    prompt: `Tap: ${word.toLocaleUpperCase()}`,
    subtext: 'From your word list',
    answer,
    choices: shuffle([answer, ...wrong]),
  };
}

/** Spelling only works out loud.
 *
 *  "Which spelling is correct? cat / kat / catt" is not a spelling question —
 *  the kid picks whichever shape looks most familiar and never has to know
 *  what the word is. A real spelling item is: hear the word, then choose how it
 *  is written. So the target word becomes AUDIO and leaves the prompt entirely.
 *
 *  The rule-based items are different and keep their printed prompt: "Add -ing
 *  to RUN" has to show RUN, because applying the doubling rule to a word you
 *  were told is the skill (L.2.2.D, L.3.2.E). Those still speak the answer, so
 *  the kid hears the word they are building.
 *
 *  Cakey says it when a clip exists; the browser voice covers everything else,
 *  and the modal always shows a replay button. See lib/town/cakey-voice.ts and
 *  scripts/render-cakey-voice.mjs. */
const GENERIC_SPELLING_PROMPT = /^which spelling is correct\??$/i;

function spellingAudio(
  readingType: ReadingType,
  item: { prompt: string; answer: string },
): { prompt: string; speak?: string } {
  if (readingType !== 'spelling') return { prompt: item.prompt };
  return {
    prompt: GENERIC_SPELLING_PROMPT.test(item.prompt.trim())
      ? 'Which one spells the word you heard?'
      : item.prompt,
    speak: item.answer,
  };
}

/** Pick a tier-appropriate reading challenge.
 *  - `type` 'mixed' rotates across all three reading types each call.
 *  - If the kid's current tier is past the authored content, clamp to
 *    the top tier rather than returning null. */
export function generateReadingChallenge(
  tier: number,
  type: ReadingChallengeType = 'mixed',
): ChoiceChallenge {
  const readingType: ReadingType =
    type === 'mixed'
      ? ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)]
      : type;

  // A grown-up's list wins over the authored library for the two types it can
  // serve. Checked before the pool lookup so the tier never even matters — the
  // class list is the class list at any level.
  const fromClass = fromFocusWords(readingType);
  if (fromClass) return fromClass;

  const actualTier = clampToAvailableTier(readingType, tier);
  const pool = READING_CONTENT[readingType][actualTier] ?? [];

  // Defensive fallback: should never hit in practice since content library
  // covers tiers 1..5 for every type.
  if (pool.length === 0) {
    return {
      kind: 'choice',
      prompt: '(no content)',
      answer: '—',
      choices: ['—'],
    };
  }

  const item = pool[Math.floor(Math.random() * pool.length)];
  const choices = shuffle(sanitizeChoices(item));
  const { prompt, speak } = spellingAudio(readingType, item);

  return {
    kind: 'choice',
    prompt,
    subtext: item.subtext,
    answer: item.answer,
    choices,
    ...(speak ? { speak } : {}),
  };
}

/** Every word the spelling questions need spoken, deduped.
 *
 *  Exported so scripts/render-cakey-voice.mjs can add them to the audio corpus
 *  — the renderer reads the real module rather than a hand-kept list, so a word
 *  added to the content library is rendered on the next run instead of quietly
 *  falling through to the browser voice forever. */
export function spellingSpokenWords(): string[] {
  const words = new Set<string>();
  for (const byTier of Object.values(READING_CONTENT.spelling ?? {})) {
    for (const item of byTier ?? []) words.add(item.answer);
  }
  return [...words].sort();
}

/** Is this string one of the word kinds the picker offers? Used to validate a
 *  `?op=` deep link before trusting it as state — READING_KINDS is the single
 *  source, so a new type is recognised the moment it has a picker entry. */
export function isReadingChallengeType(
  value: string | null | undefined,
): value is ReadingChallengeType {
  return value != null && Object.prototype.hasOwnProperty.call(READING_KINDS, value);
}
