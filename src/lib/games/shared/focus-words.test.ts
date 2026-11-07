// A class list is only useful if the questions built from it are fair. The
// risks are specific: a "wrong" answer that is actually right, two buttons
// that read the same, or a distractor so obviously wrong the question answers
// itself.

import { afterEach, describe, expect, it } from 'vitest';
import { setFocusWords, getFocusWords, hasFocusWords, misspell, confusableWords } from './focus-words';
import { generateReadingChallenge } from './generate-reading-challenge';

const LIST = ['because', 'friend', 'beautiful', 'through', 'people', 'thought'];

afterEach(() => setFocusWords([]));

describe('the focus-words singleton', () => {
  it('trims and drops blanks', () => {
    setFocusWords(['  cat ', '', '   ', 'dog']);
    expect(getFocusWords()).toEqual(['cat', 'dog']);
    expect(hasFocusWords()).toBe(true);
  });

  it('clears back to nothing', () => {
    setFocusWords(['cat']);
    setFocusWords(null);
    expect(hasFocusWords()).toBe(false);
  });
});

describe('misspell', () => {
  it('never returns the correct spelling', () => {
    for (const w of [...LIST, 'cat', 'a', 'to', 'stopped']) {
      expect(misspell(w, 3)).not.toContain(w);
    }
  });

  it('returns distinct candidates', () => {
    for (const w of LIST) {
      const out = misspell(w, 3);
      expect(new Set(out).size).toBe(out.length);
    }
  });

  // The first version of this test measured "closeness" as shared letters,
  // which is the wrong tool twice over: a pure scramble scores 100%, and
  // nation -> nashun (a real phonetic misspelling, and the most useful one in
  // the set) scores badly. So test the failure modes that actually make a
  // question unfair instead.
  it('stays the same rough length', () => {
    for (const w of [...LIST, 'cat', 'and', 'stopped', 'nation']) {
      for (const m of misspell(w, 3)) {
        expect(Math.abs(m.length - w.length), `${w} -> ${m}`).toBeLessThanOrEqual(3);
      }
    }
  });

  // The one that would really bite: a "wrong" spelling that is another word on
  // the list is a second correct answer on screen.
  it('never produces another word from the same list', () => {
    const lower = LIST.map((w) => w.toLowerCase());
    for (const w of LIST) {
      for (const m of misspell(w, 3)) {
        expect(lower, `${w} -> ${m} collides with a list word`).not.toContain(m);
      }
    }
  });

  it('copes with a word too short to transform', () => {
    expect(() => misspell('a', 2)).not.toThrow();
  });
});

describe('confusableWords', () => {
  it('prefers other words from the list', () => {
    const out = confusableWords('friend', LIST, 2);
    expect(out).not.toContain('friend');
    expect(out.every((w) => LIST.includes(w))).toBe(true);
  });

  it('falls back to near-misses when the list is too small', () => {
    const out = confusableWords('cat', ['cat'], 2);
    expect(out.length).toBe(2);
    expect(out).not.toContain('cat');
  });
});

describe('challenges built from a class list', () => {
  it('draws spelling from the list, speaks it, and never prints it', () => {
    setFocusWords(LIST);
    for (let i = 0; i < 200; i++) {
      const c = generateReadingChallenge(3, 'spelling');
      expect(LIST).toContain(c.answer);
      expect(c.speak).toBe(c.answer);
      expect(c.prompt.toLowerCase()).not.toContain(c.answer);
      expect(c.choices).toContain(c.answer);
      expect(new Set(c.choices).size).toBe(c.choices.length);
      // Exactly one choice can be right.
      expect(c.choices.filter((x) => x === c.answer).length).toBe(1);
    }
  });

  it('draws sight words from the list and shows the word', () => {
    setFocusWords(LIST);
    for (let i = 0; i < 200; i++) {
      const c = generateReadingChallenge(1, 'sight-words');
      expect(LIST).toContain(c.answer);
      expect(c.prompt).toBe(`Tap: ${c.answer.toUpperCase()}`);
      expect(new Set(c.choices).size).toBe(c.choices.length);
    }
  });

  it('ignores the tier — a class list is the class list at any level', () => {
    setFocusWords(LIST);
    for (const tier of [1, 5, 10]) {
      expect(LIST).toContain(generateReadingChallenge(tier, 'spelling').answer);
    }
  });

  it('leaves every other reading type on the authored library', () => {
    setFocusWords(LIST);
    for (const type of ['synonyms', 'rhyming', 'letter-sounds'] as const) {
      for (let i = 0; i < 50; i++) {
        // Checked by the marker the class-list path stamps on, not by whether
        // the answer happens to appear in LIST. The authored library legitimately
        // contains some of these words itself (reading-content.ts has
        // "Means the same as PRETTY" -> beautiful), so a word match proved
        // nothing and failed at random about once in a hundred runs.
        expect(generateReadingChallenge(3, type).subtext).not.toBe('From your word list');
      }
    }
  });

  it('falls back to the library when no list is set', () => {
    setFocusWords([]);
    const c = generateReadingChallenge(3, 'spelling');
    expect(c.subtext).not.toBe('From your word list');
  });
});
