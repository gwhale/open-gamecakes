// What a grown-up's word list is FOR.
//
// One list of twelve words is a spelling test in second grade and a vocabulary
// unit in fifth. Before this table the generator assumed the first case for
// every list ever added, which meant a parent who typed a vocabulary list got
// spelling questions and no way to say otherwise.
//
// This is the single source of truth for the choice. Three consumers read it
// and none of them keeps its own copy:
//
//   * ClassMaterialCard renders the picker from MODE_ORDER.
//   * /api/kids/class-material validates what comes back against it.
//   * generate-reading-challenge asks canServeMode() before using a list.
//
// A mode IS a ReadingType. That is deliberate: the kid picks a reading type on
// the launcher, and a list only intercepts the types it was added for, so the
// question still credits the skill that type maps to. Inventing a "vocabulary"
// mode outside the ReadingType union would have meant a question that scores
// against nothing.
//
// Type-only import: this module is pulled into a client component for its
// labels, and reading-content.ts is a large data file that should not follow it
// into the browser bundle.
import type { ReadingType } from '@/lib/games/shared/reading-content';

/** A reading type a parent's word list can actually drive.
 *
 *  The bar for being here is that the list supplies enough to build a fair
 *  question. 'rhyming' is absent because twelve spelling words rarely rhyme
 *  with each other; 'syllables' is absent because counting them from spelling
 *  alone is wrong often enough to teach the wrong thing. Both are better served
 *  by the authored library, which is what a list not covering them falls
 *  through to. */
export type ClassWordMode = Extract<
  ReadingType,
  'spelling' | 'sight-words' | 'word-meaning'
>;

export interface ClassWordModeSpec {
  mode: ClassWordMode;
  /** Grown-up facing, in the words a parent would use. Not the type name. */
  label: string;
  /** What the kid is actually asked to do. Shown under the checkbox. */
  hint: string;
  /** True when the mode needs a definition, not just the word. */
  needsGloss: boolean;
  /** How many usable entries the list needs before this mode can pose a fair
   *  question. Three for anything whose wrong answers come from the list
   *  itself: one right answer plus two distractors that are real. */
  minEntries: number;
}

/** Render order for the picker, and the order the API validates against. */
export const MODE_ORDER: readonly ClassWordModeSpec[] = [
  {
    mode: 'spelling',
    label: 'Spell it',
    hint: 'Hears the word, picks how it is written.',
    needsGloss: false,
    // Wrong answers are misspellings of the word itself, so one word is a
    // complete question on its own.
    minEntries: 1,
  },
  {
    mode: 'sight-words',
    label: 'Read it',
    hint: 'Sees the word, taps it out of a row.',
    needsGloss: false,
    // confusableWords() pads from misspellings when the list is short, so this
    // works at one word. Three is where the distractors start being other real
    // words from the list, which is the actual skill.
    minEntries: 1,
  },
  {
    // 'word-meaning' and NOT 'context-clues': this scores against L.x.6, the
    // words a class actually taught, rather than L.3.4 inference. See
    // migration 0049.
    mode: 'word-meaning',
    label: 'What it means',
    hint: 'Sees the word, picks the meaning. Needs definitions.',
    needsGloss: true,
    // The wrong answers are the OTHER definitions on the list. Two of them, so
    // three glossed words is the floor for a question that is not a giveaway.
    minEntries: 3,
  },
];

/** Old rows, and any list added before a mode picker existed, mean spelling and
 *  sight-words. Matches the column default in migration 0048; both exist so
 *  that a row read straight out of the database and a row that never reached
 *  the database behave the same. */
export const DEFAULT_MODES: readonly ClassWordMode[] = ['spelling', 'sight-words'];

const BY_MODE = new Map<string, ClassWordModeSpec>(MODE_ORDER.map((m) => [m.mode, m]));

export function isClassWordMode(value: unknown): value is ClassWordMode {
  return typeof value === 'string' && BY_MODE.has(value);
}

export function modeSpec(mode: ClassWordMode): ClassWordModeSpec {
  // Non-null: the only values of this type are the ones in the map.
  return BY_MODE.get(mode)!;
}

/** Clean whatever arrived from a client or an older row into a real mode list.
 *
 *  Unknown values are dropped rather than rejected. A row written by a newer
 *  deploy that names a mode this build has not shipped yet should lose that one
 *  mode, not take the whole list out of play. An empty result falls back to the
 *  default pair for the same reason. */
export function normalizeModes(raw: unknown): ClassWordMode[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<ClassWordMode>();
  for (const value of list) {
    if (isClassWordMode(value)) seen.add(value);
  }
  return seen.size > 0 ? [...seen] : [...DEFAULT_MODES];
}

/** The words this mode can actually be asked about.
 *
 *  For a gloss mode that is the words carrying a definition, not the whole
 *  list: a parent who defined four of twelve words has four vocabulary
 *  questions available, and the other eight are still perfectly good spelling
 *  words. */
export function usableEntries(
  mode: ClassWordMode,
  pool: readonly string[],
  glosses: Readonly<Record<string, string>>,
): string[] {
  if (!modeSpec(mode).needsGloss) return [...pool];
  return pool.filter((w) => {
    const gloss = glosses[w.toLocaleLowerCase()];
    return typeof gloss === 'string' && gloss.trim().length > 0;
  });
}

/** Whether this list can pose a fair question in this mode right now. */
export function canServeMode(
  mode: ClassWordMode,
  pool: readonly string[],
  glosses: Readonly<Record<string, string>>,
): boolean {
  return usableEntries(mode, pool, glosses).length >= modeSpec(mode).minEntries;
}
