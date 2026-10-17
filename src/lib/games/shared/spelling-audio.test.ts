// Spelling is a listening task or it is nothing.
//
// "Which spelling is correct? cat / kat / catt" can be answered by picking the
// most familiar-looking shape, without ever knowing the word. The fix is that
// the word is spoken and NOT printed — so the thing to guard is precisely that
// it stays unprinted.

import { describe, expect, it } from 'vitest';
import {
  generateReadingChallenge,
  spellingSpokenWords,
} from './generate-reading-challenge';

const DRAWS = 300;
const TIERS = [1, 2, 3, 4, 5];

function draw(tier: number) {
  return Array.from({ length: DRAWS }, () => generateReadingChallenge(tier, 'spelling'));
}

describe('spelling challenges', () => {
  it('always has a word to say', () => {
    for (const tier of TIERS) {
      for (const c of draw(tier)) {
        expect(c.speak, c.prompt).toBe(c.answer);
      }
    }
  });

  // The whole point. If the answer appears in the prompt the kid can match
  // letters instead of hearing the word.
  it('never prints the answer in the prompt', () => {
    for (const tier of TIERS) {
      for (const c of draw(tier)) {
        expect(
          c.prompt.toLowerCase().includes(c.answer.toLowerCase()),
          `answer "${c.answer}" leaked into prompt "${c.prompt}"`,
        ).toBe(false);
      }
    }
  });

  it('replaces the generic prompt but keeps rule-based ones', () => {
    const prompts = new Set(TIERS.flatMap((t) => draw(t).map((c) => c.prompt)));
    expect([...prompts].some((p) => p === 'Which one spells the word you heard?')).toBe(true);
    expect([...prompts].some((p) => /^(Add|What is the plural)/.test(p))).toBe(true);
    // The old prompt is gone entirely.
    expect([...prompts].some((p) => /which spelling is correct/i.test(p))).toBe(false);
  });

  it('leaves every other reading type silent', () => {
    for (const type of ['synonyms', 'rhyming', 'sight-words'] as const) {
      const c = generateReadingChallenge(3, type);
      expect(c.speak).toBeUndefined();
    }
  });

  // The renderer reads this list. If it drifts from the content library, words
  // silently fall through to the browser voice and nobody finds out.
  it('exports every spelling answer for the voice renderer', () => {
    const words = new Set(spellingSpokenWords());
    expect(words.size).toBeGreaterThan(20);
    for (const tier of TIERS) {
      for (const c of draw(tier)) {
        expect(words.has(c.answer), `${c.answer} has no clip queued`).toBe(true);
      }
    }
  });
});
