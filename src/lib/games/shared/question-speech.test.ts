import { describe, expect, it } from 'vitest';
import { spokenQuestion, toSpeakable } from './question-speech';
import { generateReadingChallenge } from './generate-reading-challenge';

describe('spokenQuestion', () => {
  it('reads a sum as a question, not just the numbers', () => {
    expect(spokenQuestion({ kind: 'numeric', prompt: '7 × 4', answer: 28 })).toEqual([
      'What is 7 times 4?',
    ]);
    expect(spokenQuestion({ kind: 'numeric', prompt: '12 − 5', answer: 7 })).toEqual([
      'What is 12 minus 5?',
    ]);
  });

  it('reads a fill-in-the-blank equation as written', () => {
    expect(
      spokenQuestion({ kind: 'numeric', prompt: '7 + ❓ = 10', answer: 3, verbatim: true }),
    ).toEqual(['7 plus what equals 10?']);
  });

  it('reads the prompt and the sentence under it, but not the choices', () => {
    const lines = spokenQuestion({
      kind: 'choice',
      prompt: 'Which word fits?',
      subtext: 'Where is my shoe ___',
      answer: '?',
      choices: ['?', '.', '!'],
    });
    expect(lines).toEqual(['Which word fits?', 'Where is my shoe blank']);
  });

  it('skips the word-list label, which is not part of the question', () => {
    const lines = spokenQuestion({
      kind: 'choice',
      prompt: 'Tap: SAID',
      subtext: 'From your word list',
      answer: 'said',
      choices: ['said', 'sad'],
    });
    expect(lines).toEqual(['Tap: said']);
  });

  it('keeps the spelling word as its own line, last, so its clip still matches', () => {
    for (let i = 0; i < 50; i += 1) {
      const c = generateReadingChallenge(2, 'spelling');
      const lines = spokenQuestion(c);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines[lines.length - 1]).toBe(c.speak);
      expect(lines[0]).toBe(toSpeakable(c.prompt));
    }
  });

  it('reads a multi-part scenario and then its first part', () => {
    const lines = spokenQuestion({
      kind: 'steps',
      prompt: 'A baker has 20 cupcakes.',
      steps: [
        { kind: 'numeric', prompt: '20 ÷ 4', answer: 5 },
        { kind: 'choice', prompt: 'Why?', answer: 'a', choices: ['a', 'b'] },
      ],
    });
    expect(lines).toEqual(['A baker has 20 cupcakes.', 'What is 20 divided by 4?']);
  });
});

describe('toSpeakable', () => {
  it('leaves a suffix alone', () => {
    expect(toSpeakable('Add -ing to RUN')).toBe('Add -ing to run');
  });
});
