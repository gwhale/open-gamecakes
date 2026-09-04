// Modes decide what a word list is FOR. The two things worth pinning down are
// that an unusable mode never poses a question, and that two lists with
// different purposes never bleed into each other.

import { describe, it, expect, afterEach } from 'vitest';
import {
  DEFAULT_MODES,
  canServeMode,
  isClassWordMode,
  normalizeModes,
  usableEntries,
} from './class-modes';
import { setClassLists, poolForMode, getFocusWords } from './focus-words';
import { generateReadingChallenge } from './generate-reading-challenge';

afterEach(() => setClassLists([]));

describe('normalizeModes', () => {
  it('keeps known modes and drops unknown ones', () => {
    expect(normalizeModes(['spelling', 'nonsense'])).toEqual(['spelling']);
  });

  it('falls back to the default pair when nothing survives', () => {
    // Old rows, and anything a newer deploy wrote that this build cannot read.
    expect(normalizeModes(['nonsense'])).toEqual([...DEFAULT_MODES]);
    expect(normalizeModes(null)).toEqual([...DEFAULT_MODES]);
    expect(normalizeModes([])).toEqual([...DEFAULT_MODES]);
  });

  it('de-dupes', () => {
    expect(normalizeModes(['spelling', 'spelling'])).toEqual(['spelling']);
  });

  it('recognises exactly the shipped modes', () => {
    expect(isClassWordMode('word-meaning')).toBe(true);
    expect(isClassWordMode('rhyming')).toBe(false);
    expect(isClassWordMode(7)).toBe(false);
  });
});

describe('usableEntries / canServeMode', () => {
  const words = ['brave', 'calm', 'eager', 'plain'];
  const glosses = { brave: 'not afraid', calm: 'settled', eager: 'keen' };

  it('counts every word for a mode that needs no meanings', () => {
    expect(usableEntries('spelling', words, glosses)).toHaveLength(4);
    expect(canServeMode('spelling', ['solo'], {})).toBe(true);
  });

  it('counts only the defined words for the meaning mode', () => {
    // "plain" has no definition, so it is not a vocabulary question — but it is
    // still a perfectly good spelling word above.
    expect(usableEntries('word-meaning', words, glosses)).toEqual(['brave', 'calm', 'eager']);
  });

  it('refuses the meaning mode below three definitions', () => {
    // One right answer plus two real distractors, or it is a giveaway.
    expect(canServeMode('word-meaning', words, glosses)).toBe(true);
    expect(canServeMode('word-meaning', words, { brave: 'not afraid' })).toBe(false);
  });

  it('treats a blank definition as no definition', () => {
    expect(usableEntries('word-meaning', ['a'], { a: '   ' })).toEqual([]);
  });
});

describe('poolForMode', () => {
  it('keeps lists with different purposes apart', () => {
    // The regression this whole shape exists to prevent: a vocabulary word
    // turning up as a spelling question because the lists were merged.
    setClassLists([
      { words: ['because', 'friend'], modes: ['spelling'], glosses: {} },
      {
        words: ['brave', 'calm', 'eager'],
        modes: ['word-meaning'],
        glosses: { brave: 'not afraid', calm: 'settled', eager: 'keen' },
      },
    ]);

    expect(poolForMode('spelling').words).toEqual(['because', 'friend']);
    expect(poolForMode('word-meaning').words).toEqual(['brave', 'calm', 'eager']);
    expect(poolForMode('sight-words').words).toEqual([]);
  });

  it('pools lists that share a mode, de-duped across them', () => {
    setClassLists([
      { words: ['because', 'friend'], modes: ['spelling'], glosses: {} },
      { words: ['Because', 'through'], modes: ['spelling'], glosses: {} },
    ]);
    expect(poolForMode('spelling').words).toEqual(['because', 'friend', 'through']);
  });

  it('carries definitions along with the words that need them', () => {
    setClassLists([
      { words: ['brave'], modes: ['word-meaning'], glosses: { brave: 'not afraid' } },
    ]);
    expect(poolForMode('word-meaning').glosses.brave).toBe('not afraid');
  });

  it('still reports every class word regardless of mode', () => {
    setClassLists([
      { words: ['because'], modes: ['spelling'], glosses: {} },
      { words: ['brave'], modes: ['word-meaning'], glosses: { brave: 'not afraid' } },
    ]);
    expect(getFocusWords()).toEqual(['because', 'brave']);
  });
});

describe('the meaning question', () => {
  const list = {
    words: ['brave', 'calm', 'eager'],
    modes: ['word-meaning' as const],
    glosses: { brave: 'not afraid', calm: 'settled', eager: 'keen' },
  };

  it('asks what a word means and offers real definitions', () => {
    setClassLists([list]);
    const q = generateReadingChallenge(3, 'word-meaning');
    expect(q.prompt).toMatch(/^What does (BRAVE|CALM|EAGER) mean\?$/);
    expect(q.subtext).toBe('From your word list');
    expect(q.choices).toHaveLength(3);
    expect(q.choices).toContain(q.answer);
    // Every wrong answer is another definition off the same list, never
    // invented and never a scrambled string.
    for (const c of q.choices ?? []) {
      expect(Object.values(list.glosses)).toContain(c);
    }
    // Spoken as well as printed, so a kid who cannot decode it can still answer.
    expect(q.speak?.toLowerCase()).toBe(q.prompt.split(' ')[2].replace('?', '').toLowerCase());
  });

  it('falls back to the authored library when there are too few definitions', () => {
    setClassLists([
      { words: ['brave', 'calm'], modes: ['word-meaning'], glosses: { brave: 'not afraid' } },
    ]);
    const q = generateReadingChallenge(3, 'word-meaning');
    expect(q.subtext).not.toBe('From your word list');
  });

  it('does not intercept a mode the list was not added for', () => {
    setClassLists([list]);
    const q = generateReadingChallenge(3, 'spelling');
    expect(q.subtext).not.toBe('From your word list');
  });
});
