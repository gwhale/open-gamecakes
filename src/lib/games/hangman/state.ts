// Cakey's Candles — the guess-a-letter game, as pure state.
//
// This is the mechanic everyone knows as hangman, reframed: a birthday cake
// with a row of lit candles, and each wrong letter blows one out. When the
// last candle goes out the word is shown and said. No gallows, no stick
// figure, nothing dies; the slug stays `hangman` for the grown-ups who look
// for it by that name, and no kid-facing string uses it.
//
// The word is an AUDIO clue. The component speaks it (Cakey clip or browser
// voice) and never prints it until the word is solved or lost — the whole
// question is "what did you hear, and how is it spelled", so printing it
// would turn spelling into matching. That is a rendering rule, but the state
// enforces the half it can: `masked()` only ever reveals guessed letters.
//
// Pure functions over a plain object, no class, so the component can hold it
// in useState and a test can drive a whole word in three lines.

export interface CandleState {
  /** Lowercase, letters only. The pool guarantees that shape. */
  word: string;
  /** Letters tried so far, in order, right and wrong alike. */
  guessed: string[];
  misses: number;
  maxMisses: number;
}

export const VOWELS: readonly string[] = ['a', 'e', 'i', 'o', 'u'];

/** Candles by level. Fewer candles is less room for wrong letters. */
export function maxMissesForTier(level: number): number {
  const t = Math.max(1, Math.min(10, Math.round(level)));
  // Classic hangman gives six wrong guesses. The first cut gave 8/7/6 and a
  // five-word round, and a real round reported "37 candles blown out" — a
  // number that reads as failure however many words were spelled. George:
  // "hangman is usually ~15". Six candles at the easy tiers (where vowels are
  // already shown), down to four, over a three-word round caps a round's
  // misses at 18 and keeps the classic feel. UNPLAYTESTED with a real kid.
  if (t <= 3) return 6;
  if (t <= 6) return 5;
  return 4;
}

/** Levels 1–2 start with the vowels shown. A six-year-old guessing blind at
 *  seven letters is not spelling, they are lottery-picking; with the vowels in
 *  place the consonants are the actual spelling work. */
export function revealsVowels(level: number): boolean {
  return Math.round(level) <= 2;
}

/** Start a word. `reveal` letters count as already guessed and never as a
 *  miss, so a pre-revealed vowel the word lacks costs no candle. */
export function newRound(
  word: string,
  maxMisses: number,
  reveal: readonly string[] = [],
): CandleState {
  const w = word.toLocaleLowerCase();
  const guessed = reveal
    .map((l) => l.toLocaleLowerCase())
    .filter((l, i, arr) => l.length === 1 && w.includes(l) && arr.indexOf(l) === i);
  return { word: w, guessed, misses: 0, maxMisses: Math.max(1, maxMisses) };
}

export function isWon(s: CandleState): boolean {
  return s.word.split('').every((l) => s.guessed.includes(l));
}

export function isLost(s: CandleState): boolean {
  return s.misses >= s.maxMisses && !isWon(s);
}

export function isOver(s: CandleState): boolean {
  return isWon(s) || isLost(s);
}

export function candlesLeft(s: CandleState): number {
  return Math.max(0, s.maxMisses - s.misses);
}

/** Try a letter. A repeat, a non-letter, or a guess after the round ended is a
 *  no-op returning the SAME state, so the component can `if (next === state)`
 *  to skip a sound. Never throws — a stray keypress is not an error. */
export function guess(s: CandleState, letter: string): CandleState {
  const l = (letter ?? '').toLocaleLowerCase();
  if (l.length !== 1 || l < 'a' || l > 'z') return s;
  if (isOver(s)) return s;
  if (s.guessed.includes(l)) return s;
  const hit = s.word.includes(l);
  return {
    ...s,
    guessed: [...s.guessed, l],
    misses: hit ? s.misses : s.misses + 1,
  };
}

/** One entry per letter of the word: the letter if guessed, '_' otherwise.
 *  The only way the word's letters leave this module before the round ends. */
export function masked(s: CandleState): string[] {
  return s.word.split('').map((l) => (s.guessed.includes(l) ? l : '_'));
}

/** Letters tried that were not in the word — the blown-out candles, by name. */
export function wrongLetters(s: CandleState): string[] {
  return s.guessed.filter((l) => !s.word.includes(l));
}
