// The words a word game plays with — this week's list first, the library after.
//
// A grown-up adds spelling / sight words per kid on the parent Standards tab
// (class_material). The reading generator already prefers those over the
// authored library for the modes a list was added for; this is the same rule
// for games that need a SET of words at once (a word search grid, a run of
// candle words) rather than one question at a time.
//
// THE RULE, in one place so both games and the launcher preview agree:
//
//   * The class pool for the game's mode is filtered to what the game can
//     actually use (letters only, within the grid's length limits). If that
//     leaves at least MIN_ROUND_WORDS, the round is ONLY class words — a class
//     list is the class list at any level, exactly as generateReadingChallenge
//     treats it. The round may be shorter than the game's usual count; that is
//     the list's size and it is still Friday's test.
//   * Otherwise the built-in library by tier. Never a mix: a kid told "from
//     your word list" should not find "butterfly" in the grid when it was not
//     on the sheet.
//
// The launcher shows which source is in use, and `source` is what it reads.
//
// Letters only, lowercase: "I'm" and "ice cream" are real list entries but a
// hyphen or space in a word-search line or a candle word is an unguessable
// character for a seven-year-old, so those entries fall out of the usable set
// rather than being mangled into "im" / "icecream".

import { type ClassWordMode } from '@/lib/games/shared/class-modes';
import { getClassLists, poolForMode, type ClassWordList } from '@/lib/games/shared/focus-words';
import { READING_CONTENT } from '@/lib/games/shared/reading-content';
import { WORD_LISTS } from '@/components/games/word-memory/word-lists';

export type WordSource = 'class' | 'library';

export interface WordLimits {
  /** Inclusive. Defaults to 2 — a one-letter word is not a search or a spell. */
  minLen?: number;
  /** Inclusive. Defaults to no limit; a grid passes its own. */
  maxLen?: number;
}

export interface RoundWords {
  /** Lowercase, letters only, de-duplicated. */
  words: string[];
  /** Lowercase word -> definition, for the words that have one. Only ever
   *  non-empty for class words; the library carries no glosses. */
  glosses: Record<string, string>;
  source: WordSource;
}

/** The floor for a round to be a round. taps_total on the attempt is one per
 *  word, and the mastery engine treats fewer than three taps as noise, so a
 *  two-word class list falls through to the library rather than logging a
 *  round nobody can learn from. */
export const MIN_ROUND_WORDS = 3;

const LETTERS = /^[a-z]+$/;

/** Lowercase, letters-only, in range, de-duplicated, original order. */
export function usableWords(words: readonly string[], limits: WordLimits = {}): string[] {
  const minLen = limits.minLen ?? 2;
  const maxLen = limits.maxLen ?? Number.POSITIVE_INFINITY;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of words) {
    const w = (raw ?? '').trim().toLocaleLowerCase();
    if (!LETTERS.test(w)) continue;
    if (w.length < minLen || w.length > maxLen) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

/** What this mode's class pool can offer the game, after the game's own
 *  limits. Pure over `lists` so a launcher can ask before Play. */
export function classWordsFor(
  mode: ClassWordMode,
  limits: WordLimits = {},
  lists: readonly ClassWordList[] = getClassLists(),
): { words: string[]; glosses: Record<string, string> } {
  const pool = poolForMode(mode, lists);
  const words = usableWords(pool.words, limits);
  const glosses: Record<string, string> = {};
  for (const w of words) {
    if (pool.glosses[w]) glosses[w] = pool.glosses[w];
  }
  return { words, glosses };
}

/** Whether a round in this mode would come from the kid's list. The launcher
 *  preview and the game must agree on this, so both call it. */
export function classListSuffices(
  mode: ClassWordMode,
  limits: WordLimits = {},
  lists: readonly ClassWordList[] = getClassLists(),
): boolean {
  return classWordsFor(mode, limits, lists).words.length >= MIN_ROUND_WORDS;
}

/** Launcher levels run 1..10; the authored reading library has five tiers. */
export function libraryTierFor(level: number): number {
  const lvl = Math.max(1, Math.min(10, Math.round(level)));
  return Math.min(5, Math.ceil(lvl / 2));
}

/** The authored words for one mode at one launcher level, unfiltered.
 *
 *  sight-words: the tier's sight-word answers plus Word Memory's list for
 *  that level — the two libraries were written for different games and
 *  together give a level ~25 words, enough that a 12×12 grid is not the same
 *  ten every time.
 *  spelling: the tier's spelling answers. Rule-based items ("Add -ing to RUN")
 *  contribute their answer ("running"), which is a perfectly good word to
 *  spell out loud. */
function libraryRaw(mode: ClassWordMode, level: number): string[] {
  const tier = libraryTierFor(level);
  if (mode === 'sight-words') {
    const authored = (READING_CONTENT['sight-words'][tier] ?? []).map((i) => i.answer);
    const memory = WORD_LISTS[Math.max(1, Math.min(10, Math.round(level)))] ?? [];
    return [...authored, ...memory];
  }
  if (mode === 'spelling') {
    return (READING_CONTENT.spelling[tier] ?? []).map((i) => i.answer);
  }
  // word-meaning has no letters-only library of its own; neither game asks
  // for it today. Fall back to the sight words rather than an empty round.
  return (READING_CONTENT['sight-words'][tier] ?? []).map((i) => i.answer);
}

/** Library words for a level, widened to neighbouring levels when the length
 *  limits leave too few. A tier-1 6×6 grid asks for words of five letters or
 *  fewer, and tier 5's library is mostly longer than that — the widening is
 *  what stops a grid coming up short after the filter. Nearer levels first,
 *  lower before higher, so the words stay as close to the kid's level as the
 *  limits allow. */
export function libraryWordsFor(
  mode: ClassWordMode,
  level: number,
  need: number,
  limits: WordLimits = {},
): string[] {
  const lvl = Math.max(1, Math.min(10, Math.round(level)));
  const out = usableWords(libraryRaw(mode, lvl), limits);
  for (let step = 1; out.length < need && step <= 9; step += 1) {
    for (const l of [lvl - step, lvl + step]) {
      if (l < 1 || l > 10) continue;
      out.push(...usableWords(libraryRaw(mode, l), limits));
    }
    // Widening can re-add a word that a nearer level already offered.
    const dedup = usableWords(out, limits);
    out.length = 0;
    out.push(...dedup);
  }
  return out;
}

/** Fisher–Yates with the caller's rng, so a round is reproducible. */
export function shuffleWith<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The words for one round: class list if it suffices, library by level if not.
 *
 * `count` is how many the game would like. A class round returns up to that
 * many (fewer when the list is short); a library round returns exactly that
 * many unless the library itself runs dry under the limits, which the tests
 * pin as not happening for either game's configuration.
 */
export function wordsForRound(
  mode: ClassWordMode,
  level: number,
  count: number,
  rng: () => number,
  limits: WordLimits = {},
  lists: readonly ClassWordList[] = getClassLists(),
): RoundWords {
  const fromClass = classWordsFor(mode, limits, lists);
  if (fromClass.words.length >= MIN_ROUND_WORDS) {
    const words = shuffleWith(fromClass.words, rng).slice(0, count);
    const glosses: Record<string, string> = {};
    for (const w of words) if (fromClass.glosses[w]) glosses[w] = fromClass.glosses[w];
    return { words, glosses, source: 'class' };
  }
  const library = libraryWordsFor(mode, level, count, limits);
  return { words: shuffleWith(library, rng).slice(0, count), glosses: {}, source: 'library' };
}
