// The class-list rule is the feature. These pin it: the kid's list wins when
// it can fill a round, the library steps in by tier when it cannot, and the
// two are never mixed.

import { afterEach, describe, expect, it } from 'vitest';
import { makeRng } from '@/lib/games/opponents/rng';
import { setClassLists, type ClassWordList } from '@/lib/games/shared/focus-words';
import {
  MIN_ROUND_WORDS,
  classListSuffices,
  classWordsFor,
  libraryTierFor,
  libraryWordsFor,
  usableWords,
  wordsForRound,
} from './pool';
import { wordSearchTier } from '@/lib/games/word-search/generate';

const spelling = (words: string[], glosses: Record<string, string> = {}): ClassWordList => ({
  words,
  modes: ['spelling'],
  glosses,
});
const sight = (words: string[]): ClassWordList => ({ words, modes: ['sight-words'], glosses: {} });

afterEach(() => setClassLists([]));

describe('usableWords', () => {
  it('keeps letters-only words, lowercased and de-duplicated', () => {
    expect(usableWords(['Cat', 'cat', "I'm", 'ice cream', 'dog-house', 'DOG', '', ' sun '])).toEqual([
      'cat',
      'dog',
      'sun',
    ]);
  });

  it('applies length limits inclusively and drops one-letter words by default', () => {
    expect(usableWords(['a', 'go', 'three', 'sixsix'], { maxLen: 5 })).toEqual(['go', 'three']);
    expect(usableWords(['go', 'three'], { minLen: 3 })).toEqual(['three']);
  });
});

describe('class first, when the list suffices', () => {
  it('uses ONLY class words when the mode pool has at least MIN_ROUND_WORDS usable', () => {
    setClassLists([spelling(['brave', 'quiet', 'because', 'friend'])]);
    const round = wordsForRound('spelling', 3, 5, makeRng(1));
    expect(round.source).toBe('class');
    expect(round.words.length).toBe(4);
    expect(new Set(round.words)).toEqual(new Set(['brave', 'quiet', 'because', 'friend']));
  });

  it('caps a class round at the requested count', () => {
    setClassLists([spelling(['one', 'two', 'six', 'ten', 'red', 'big', 'hat', 'pig'])]);
    const round = wordsForRound('spelling', 1, 5, makeRng(2));
    expect(round.source).toBe('class');
    expect(round.words.length).toBe(5);
  });

  it('carries the glosses for the words it picked, keyed lowercase', () => {
    setClassLists([spelling(['Brave', 'quiet', 'sudden'], { brave: 'not afraid', sudden: 'happening fast' })]);
    const round = wordsForRound('spelling', 1, 5, makeRng(3));
    expect(round.glosses).toEqual({ brave: 'not afraid', sudden: 'happening fast' });
  });

  it('a class list is the class list at any level', () => {
    setClassLists([sight(['the', 'and', 'see', 'you'])]);
    for (const level of [1, 5, 10]) {
      expect(wordsForRound('sight-words', level, 8, makeRng(4)).source).toBe('class');
    }
  });

  it('only draws from lists that were added for the game\'s mode', () => {
    setClassLists([spelling(['brave', 'quiet', 'sudden', 'friend'])]);
    // A spelling list says nothing about sight words: library.
    expect(wordsForRound('sight-words', 1, 4, makeRng(5)).source).toBe('library');
    expect(wordsForRound('spelling', 1, 4, makeRng(5)).source).toBe('class');
  });

  it('pools across lists for the same mode without duplicates', () => {
    setClassLists([spelling(['brave', 'quiet']), spelling(['Quiet', 'sudden'])]);
    expect(classWordsFor('spelling').words).toEqual(['brave', 'quiet', 'sudden']);
    expect(classListSuffices('spelling')).toBe(true);
  });

  it('never mixes: a class round contains no library word', () => {
    setClassLists([sight(['zebra', 'yak', 'quokka', 'lemur', 'otter'])]);
    const round = wordsForRound('sight-words', 1, 8, makeRng(6));
    expect(round.source).toBe('class');
    for (const w of round.words) expect(['zebra', 'yak', 'quokka', 'lemur', 'otter']).toContain(w);
  });
});

describe('library fallback', () => {
  it('falls back to the library when there is no list', () => {
    const round = wordsForRound('sight-words', 1, 4, makeRng(7), { maxLen: 5 });
    expect(round.source).toBe('library');
    expect(round.words.length).toBe(4);
    expect(round.glosses).toEqual({});
  });

  it('falls back when the list has fewer than MIN_ROUND_WORDS usable words', () => {
    setClassLists([spelling(['brave', 'quiet'])]);
    expect(MIN_ROUND_WORDS).toBe(3);
    expect(classListSuffices('spelling')).toBe(false);
    expect(wordsForRound('spelling', 1, 5, makeRng(8)).source).toBe('library');
  });

  it('falls back when the grid limits leave the list too short', () => {
    // Twelve words on the sheet, but only two fit a 6×6 grid.
    setClassLists([
      sight(['go', 'me', 'butterfly', 'chocolate', 'important', 'different', 'beautiful', 'adventure']),
    ]);
    expect(classListSuffices('sight-words', { maxLen: 5 })).toBe(false);
    expect(wordsForRound('sight-words', 1, 4, makeRng(9), { maxLen: 5 }).source).toBe('library');
    // And the same list at a 12×12 grid is fine.
    expect(classListSuffices('sight-words', { maxLen: 11 })).toBe(true);
  });

  it('maps the ten launcher levels onto the five library tiers', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(libraryTierFor)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it('draws by tier: level 1 is short words, level 10 is long ones', () => {
    const low = libraryWordsFor('sight-words', 1, 4);
    const high = libraryWordsFor('sight-words', 10, 4);
    const avg = (xs: string[]) => xs.reduce((s, w) => s + w.length, 0) / xs.length;
    expect(avg(low)).toBeLessThan(avg(high));
  });

  it('fills every word-search tier and every candle round from the library', () => {
    for (let level = 1; level <= 10; level += 1) {
      const cfg = wordSearchTier(level);
      const ws = wordsForRound('sight-words', level, cfg.count, makeRng(level), { maxLen: cfg.maxLen });
      expect(ws.words.length, `word search level ${level}`).toBe(cfg.count);
      for (const w of ws.words) expect(w.length).toBeLessThanOrEqual(cfg.maxLen);
      const hm = wordsForRound('spelling', level, 5, makeRng(level));
      expect(hm.words.length, `candles level ${level}`).toBe(5);
    }
  });

  it('is letters-only from the library too', () => {
    // Word Memory's list 9 carries "I'm"; it must not reach a grid.
    const words = libraryWordsFor('sight-words', 9, 40);
    for (const w of words) expect(w).toMatch(/^[a-z]+$/);
  });
});

describe('determinism', () => {
  it('the same seed gives the same round', () => {
    const a = wordsForRound('sight-words', 4, 6, makeRng(42), { maxLen: 7 });
    const b = wordsForRound('sight-words', 4, 6, makeRng(42), { maxLen: 7 });
    expect(a).toEqual(b);
  });

  it('a different seed usually gives a different order', () => {
    const a = wordsForRound('spelling', 5, 5, makeRng(1));
    const b = wordsForRound('spelling', 5, 5, makeRng(2));
    expect(a.words).not.toEqual(b.words);
  });
});
