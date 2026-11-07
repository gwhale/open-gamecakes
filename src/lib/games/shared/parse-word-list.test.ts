// What a grown-up types is not a data format, so the parser has to be generous
// about shape and strict about one thing: never turning half a definition into
// a spelling word.

import { describe, it, expect } from 'vitest';
import { parseWordList, MAX_WORDS } from './parse-word-list';

describe('parseWordList', () => {
  it('takes a plain list, one per line', () => {
    const { words, glosses } = parseWordList('because\nfriend\nbeautiful');
    expect(words).toEqual(['because', 'friend', 'beautiful']);
    expect(glosses).toEqual({});
  });

  it('still takes a comma-separated run on one line', () => {
    // How the box worked before meanings existed, and how people paste.
    expect(parseWordList('cat, dog, bird').words).toEqual(['cat', 'dog', 'bird']);
  });

  it('splits a definition off with =, : or a spaced dash', () => {
    const { words, glosses } = parseWordList(
      'brave = not afraid\ncalm: settled and quiet\neager - keen to do it',
    );
    expect(words).toEqual(['brave', 'calm', 'eager']);
    expect(glosses).toEqual({
      brave: 'not afraid',
      calm: 'settled and quiet',
      eager: 'keen to do it',
    });
  });

  it('keeps commas inside a definition instead of splitting on them', () => {
    // The whole reason a line with a separator is never comma-split.
    const { words, glosses } = parseWordList('brave = bold, fearless, steady');
    expect(words).toEqual(['brave']);
    expect(glosses.brave).toBe('bold, fearless, steady');
  });

  it('does not split a hyphenated word on its own hyphen', () => {
    const { words, glosses } = parseWordList('well-known = famous');
    expect(words).toEqual(['well-known']);
    expect(glosses['well-known']).toBe('famous');
  });

  it('takes the FIRST separator when a definition contains another', () => {
    const { words, glosses } = parseWordList('equals = the same as: identical');
    expect(words).toEqual(['equals']);
    expect(glosses.equals).toBe('the same as: identical');
  });

  it('mixes bare words and defined words in one paste', () => {
    const { words, glosses } = parseWordList('cat\nbrave = not afraid\ndog, bird');
    expect(words).toEqual(['cat', 'brave', 'dog', 'bird']);
    expect(Object.keys(glosses)).toEqual(['brave']);
  });

  it('de-dupes case-insensitively but keeps the definition that was given', () => {
    const { words, glosses } = parseWordList('Brave\nbrave = not afraid');
    expect(words).toEqual(['Brave']);
    expect(glosses.brave).toBe('not afraid');
  });

  it('drops blank lines and stray whitespace', () => {
    expect(parseWordList('  cat  \n\n   \n dog \n').words).toEqual(['cat', 'dog']);
  });

  it('caps a runaway paste', () => {
    const many = Array.from({ length: MAX_WORDS + 25 }, (_, i) => `w${i}`).join('\n');
    expect(parseWordList(many).words).toHaveLength(MAX_WORDS);
  });

  it('returns empty for junk input rather than throwing', () => {
    expect(parseWordList(null)).toEqual({ words: [], glosses: {} });
    expect(parseWordList(undefined).words).toEqual([]);
    expect(parseWordList(42).words).toEqual([]);
    expect(parseWordList(['cat', 'dog']).words).toEqual(['cat', 'dog']);
  });
});
