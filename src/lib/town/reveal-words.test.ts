import { describe, expect, it } from 'vitest';
import { wordsShown } from './reveal-words';

const base = { total: 9, revealAll: false, tracked: true, wordIndex: 0, clock: 0 };

describe('wordsShown', () => {
  it('shows the whole line on request', () => {
    expect(wordsShown({ ...base, revealAll: true })).toBe(9);
  });

  it('follows the voice while a clip plays', () => {
    expect(wordsShown({ ...base, wordIndex: 3, clock: 4 })).toBe(4);
  });

  it('shows at least one word before the first is spoken', () => {
    expect(wordsShown({ ...base, wordIndex: -1 })).toBe(1);
  });

  it('keeps going on the reading clock when a clip stalls', () => {
    expect(wordsShown({ ...base, wordIndex: 0, clock: 12 })).toBe(4);
    expect(wordsShown({ ...base, wordIndex: 0, clock: 100 })).toBe(9);
  });

  it('uses the reading clock with no clip', () => {
    expect(wordsShown({ ...base, tracked: false, clock: 2 })).toBe(3);
    expect(wordsShown({ ...base, tracked: false, clock: 100 })).toBe(9);
  });
});
