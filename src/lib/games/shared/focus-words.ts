// This week's actual word list, from school.
//
// A grown-up adds it on the parent tab (class_material, migration 0047) and
// says what it is for (modes, migration 0048). From then on the reading types
// that list was added for draw from THOSE words rather than the authored
// library. That is the difference between practice that is roughly the right
// level and practice that is the thing on Friday's test.
//
// HOW IT GETS HERE
//
// Module-level singleton, deliberately — the same pattern and the same reason
// as session-duration.ts. The launcher and the game live in the same SPA page
// (the shell swaps components via state, no navigation), so a plain module
// variable survives the hand-off, and the alternative was threading a prop
// through nineteen shells and twenty-two scene prop types to reach a pure
// generator. GameLauncher sets it on "Play"; the reading generator reads it. A
// full reload clears it, which is fine: the kid always comes back through the
// launcher.
//
// WHY THE DISTRACTORS ARE GENERATED AND NOT AUTHORED
//
// The authored library ships a hand-written wrong answer for every item. A
// parent pasting twelve words cannot be asked to also invent thirty-six
// plausible misspellings, so they are derived — by making the mistakes kids
// actually make (doubling, dropping a silent e, swapping a vowel, spelling a
// sound the other way it can be spelled) rather than by scrambling letters,
// which produces obvious nonsense and teaches nothing.

import {
  type ClassWordMode,
  DEFAULT_MODES,
  normalizeModes,
} from '@/lib/games/shared/class-modes';

/** One list exactly as a grown-up added it, with what it is for. */
export interface ClassWordList {
  words: string[];
  /** Which reading types this list drives. See class-modes.ts. */
  modes: ClassWordMode[];
  /** Lowercased word -> definition, for the modes that need one. */
  glosses: Record<string, string>;
}

/** LISTS, PLURAL, AND NOT ONE MERGED POOL.
 *
 *  Flattening every active list into a single array was right while every list
 *  meant the same thing. It stops being right the moment a list carries its own
 *  modes: a spelling list and a vocabulary list merged together would serve
 *  vocabulary words as spelling questions, which is precisely the confusion
 *  this feature exists to remove. So the lists stay apart, and a mode collects
 *  only from the lists that asked for it. */
let lists: ClassWordList[] = [];

function clean(list: ClassWordList): ClassWordList {
  return {
    words: (list.words ?? []).map((w) => w.trim()).filter(Boolean),
    modes: normalizeModes(list.modes),
    glosses: list.glosses ?? {},
  };
}

/** Record the kid's active class lists (called from GameLauncher's Play
 *  handler). Empty = nothing set, fall back to the authored library. */
export function setClassLists(next: readonly ClassWordList[] | null | undefined): void {
  lists = (next ?? []).map(clean).filter((l) => l.words.length > 0);
}

export function getClassLists(): readonly ClassWordList[] {
  return lists;
}

/** The words available for one mode, pooled across every list that asked for
 *  it, plus the definitions those lists carry.
 *
 *  De-duped case-insensitively across lists: two weeks that both include
 *  "because" should not make it twice as likely to come up. The first list
 *  wins a word, and later definitions fill gaps rather than overwriting, so a
 *  word defined once stays defined even if a later list lists it bare. */
export function poolForMode(mode: ClassWordMode): {
  words: string[];
  glosses: Record<string, string>;
} {
  const seen = new Set<string>();
  const words: string[] = [];
  const glosses: Record<string, string> = {};
  for (const list of lists) {
    if (!list.modes.includes(mode)) continue;
    for (const w of list.words) {
      const key = w.toLocaleLowerCase();
      const gloss = list.glosses[key];
      if (gloss && !glosses[key]) glosses[key] = gloss;
      if (seen.has(key)) continue;
      seen.add(key);
      words.push(w);
    }
  }
  return { words, glosses };
}

/* ── compatibility shims ─────────────────────────────────────────────────
 *
 * The bare-array form predates modes. It is still the shape a caller wants
 * when it has words and no opinion about what they are for, so it maps onto
 * one list carrying the default modes — exactly what such a list did before
 * modes existed. */

export function setFocusWords(next: readonly string[] | null | undefined): void {
  const words = (next ?? []).map((w) => w.trim()).filter(Boolean);
  setClassLists(words.length > 0 ? [{ words, modes: [...DEFAULT_MODES], glosses: {} }] : []);
}

/** Every class word in play, whatever mode it belongs to. */
export function getFocusWords(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const w of list.words) {
      const key = w.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(w);
    }
  }
  return out;
}

export function hasFocusWords(): boolean {
  return lists.some((l) => l.words.length > 0);
}

const VOWELS = 'aeiou';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  return items[randInt(0, items.length - 1)];
}

/** Sounds that can be spelled more than one way. A kid choosing between them
 *  is doing the actual work of English spelling. */
const SOUND_SWAPS: [RegExp, string][] = [
  [/ck/g, 'k'],
  [/ph/g, 'f'],
  [/^c/, 'k'],
  [/^k/, 'c'],
  [/s$/, 'z'],
  [/tion/g, 'shun'],
  [/ai/g, 'ay'],
  [/ay/g, 'ai'],
  [/ee/g, 'ea'],
  [/ea/g, 'ee'],
  [/oa/g, 'oe'],
  [/igh/g, 'ie'],
];

/**
 * Plausible ways this word gets spelled wrong.
 *
 * Ordered roughly by how common the mistake is, and every rule is one a kid
 * actually makes. Returns fewer than asked when a short word has no room for
 * the transformation — the caller pads from elsewhere rather than inventing.
 */
export function misspell(word: string, count = 2): string[] {
  const w = word.toLocaleLowerCase();
  const out = new Set<string>();

  const add = (candidate: string) => {
    if (candidate && candidate !== w && candidate.length > 1) out.add(candidate);
  };

  // Double a consonant. The single most common spelling error there is.
  for (let i = 1; i < w.length && out.size < 8; i += 1) {
    if (!VOWELS.includes(w[i]) && w[i] !== w[i - 1]) {
      add(w.slice(0, i) + w[i] + w.slice(i));
    }
  }

  // Drop a silent e, or add one that does not belong.
  if (w.endsWith('e')) add(w.slice(0, -1));
  else add(`${w}e`);

  // Swap a vowel for a neighbour — "bed" / "bad", the classic.
  for (let i = 0; i < w.length && out.size < 12; i += 1) {
    if (VOWELS.includes(w[i])) {
      const other = pick(VOWELS.replace(w[i], '').split(''));
      add(w.slice(0, i) + other + w.slice(i + 1));
    }
  }

  // Spell a sound the other legal way.
  for (const [from, to] of SOUND_SWAPS) {
    if (from.test(w)) add(w.replace(from, to));
  }

  // Shuffle so the same word does not always produce the same two wrong
  // answers — a kid who sees "becuase" every time learns the pair, not the word.
  const all = [...out];
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count);
}

/** Other words from the list that look confusable with this one — same length
 *  or one off, sharing a first or last letter. For sight words the real skill
 *  is telling the list apart, so the list is the best source of wrong answers;
 *  near-misses are generated only when it cannot supply enough. */
export function confusableWords(word: string, pool: readonly string[], count = 2): string[] {
  const w = word.toLocaleLowerCase();
  const scored = pool
    .map((p) => p.toLocaleLowerCase())
    .filter((p) => p !== w)
    .map((p) => {
      let score = 0;
      if (Math.abs(p.length - w.length) <= 1) score += 2;
      if (p[0] === w[0]) score += 2;
      if (p[p.length - 1] === w[w.length - 1]) score += 1;
      return { p, score: score + Math.random() };
    })
    .sort((a, b) => b.score - a.score);

  const out = scored.slice(0, count).map((s) => s.p);
  if (out.length < count) out.push(...misspell(w, count - out.length));
  return out;
}
