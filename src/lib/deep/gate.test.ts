// The gate is the one part of the chest that two machines have to agree about,
// so these tests are mostly about agreement and about the rule George set:
// a wrong answer costs time and nothing else.

import { describe, expect, it } from 'vitest';
import {
  NEEDED_CORRECT,
  challengeAt,
  gateProgress,
  gateSpec,
  isAnswerCorrect,
  markRun,
  questionSeed,
  type GateSpec,
} from './gate';
import type { Challenge } from '@/lib/games/shared/challenge';

const SPEC: GateSpec = gateSpec({
  subject: 'math',
  op: 'addition',
  tier: 3,
  skillId: 'skill-1',
  skillSlug: 'add-within-20',
  displayName: 'Adding to 20',
  reason: 'due for practice',
});

const KID = '11111111-2222-3333-4444-555555555555';
const CHEST = 'reef-crate';

/** Answer a challenge correctly, whatever kind it is. */
const rightAnswer = (i: number): string => {
  const c = challengeAt(SPEC, KID, CHEST, i);
  return c.kind === 'numeric' ? String(c.answer) : String((c as { answer: string }).answer);
};

describe('gateProgress — there is no failure state', () => {
  it('opens on three correct', () => {
    expect(gateProgress([true, true, true]).open).toBe(true);
    expect(gateProgress([true, true]).open).toBe(false);
  });

  it('a wrong answer does not reset the count', () => {
    // THE RULE. A kid who gets one right, then two wrong, then two right has
    // three right answers and an open chest. If this ever becomes a streak,
    // the feature has been changed into a test.
    const run = [true, false, false, true, true];
    expect(gateProgress(run).correct).toBe(3);
    expect(gateProgress(run).open).toBe(true);
  });

  it('a wrong answer costs nothing but a question', () => {
    const before = gateProgress([true]);
    const after = gateProgress([true, false]);
    expect(after.correct).toBe(before.correct);
    expect(after.asked).toBe(before.asked + 1);
  });

  it('never lets a run of wrong answers open anything', () => {
    expect(gateProgress(Array(40).fill(false)).open).toBe(false);
    expect(gateProgress(Array(40).fill(false)).correct).toBe(0);
  });

  it('caps the reported count at what is needed', () => {
    expect(gateProgress([true, true, true, true, true]).correct).toBe(NEEDED_CORRECT);
  });
});

describe('challengeAt — the client and the server must agree', () => {
  it('gives the same question for the same kid, chest and index', () => {
    // If this is ever false the gate is either unfair or forgeable, depending
    // on which side ends up holding the question the other did not ask.
    for (let i = 0; i < 6; i++) {
      expect(challengeAt(SPEC, KID, CHEST, i)).toEqual(challengeAt(SPEC, KID, CHEST, i));
    }
  });

  it('does not leak the global Math.random it borrows', () => {
    const before = Math.random;
    challengeAt(SPEC, KID, CHEST, 0);
    expect(Math.random).toBe(before);
  });

  it('restores Math.random even if generation throws', () => {
    const before = Math.random;
    // A tier of NaN is the kind of thing a bad recommendation could produce.
    try {
      challengeAt({ ...SPEC, tier: Number.NaN }, KID, CHEST, 0);
    } catch {
      /* the point is the finally block, not the outcome */
    }
    expect(Math.random).toBe(before);
  });

  it('asks different kids different questions at the same chest', () => {
    const other = challengeAt(SPEC, '99999999-8888-7777-6666-555555555555', CHEST, 0);
    expect(other).not.toEqual(challengeAt(SPEC, KID, CHEST, 0));
  });

  it('asks different questions as the run goes on', () => {
    const prompts = new Set(
      Array.from({ length: 8 }, (_, i) => challengeAt(SPEC, KID, CHEST, i).prompt),
    );
    expect(prompts.size).toBeGreaterThan(1);
  });

  it('never poses a multi-part question', () => {
    // The gate re-marks ONE typed answer. A question whose correctness depends
    // on three intermediate values cannot be checked from that.
    for (const op of ['addition', 'mixed', 'place-value', 'rounding', 'fractions', 'area']) {
      const spec = gateSpec({
        subject: 'math', op, tier: 6,
        skillId: 's', skillSlug: 'x', displayName: 'x', reason: 'x',
      });
      for (let i = 0; i < 12; i++) {
        expect(challengeAt(spec, KID, CHEST, i).kind, `${op} #${i}`).not.toBe('steps');
      }
    }
  });

  it('works for reading skills too', () => {
    const spec = gateSpec({
      subject: 'reading', op: 'synonyms', tier: 4,
      skillId: 's', skillSlug: 'synonyms', displayName: 'Synonyms', reason: 'x',
    });
    const c = challengeAt(spec, KID, CHEST, 0);
    expect(c.kind).toBe('choice');
  });
});

describe('questionSeed', () => {
  it('separates kid, chest and index', () => {
    const a = questionSeed(KID, 'reef-crate', 0);
    expect(a).not.toBe(questionSeed(KID, 'reef-crate', 1));
    expect(a).not.toBe(questionSeed(KID, 'kelp-sack', 0));
    expect(a).toBe(questionSeed(KID, 'reef-crate', 0));
  });
});

describe('isAnswerCorrect — the browser does not get a vote', () => {
  it('marks a numeric answer from the raw text', () => {
    const c: Challenge = { kind: 'numeric', prompt: '2 + 2 = ?', answer: 4 };
    expect(isAnswerCorrect(c, '4')).toBe(true);
    expect(isAnswerCorrect(c, ' 4 ')).toBe(true);
    expect(isAnswerCorrect(c, '5')).toBe(false);
    expect(isAnswerCorrect(c, '')).toBe(false);
    expect(isAnswerCorrect(c, 'true')).toBe(false);
  });

  it('marks a choice answer by exact value', () => {
    const c: Challenge = { kind: 'choice', prompt: 'p', choices: ['a', 'b'], answer: 'b' };
    expect(isAnswerCorrect(c, 'b')).toBe(true);
    expect(isAnswerCorrect(c, 'a')).toBe(false);
    expect(isAnswerCorrect(c, 'B')).toBe(false);
  });

  it('refuses anything that is not a string', () => {
    const c: Challenge = { kind: 'numeric', prompt: 'p', answer: 4 };
    for (const junk of [null, undefined, 4, true, {}, []]) {
      expect(isAnswerCorrect(c, junk as unknown as string)).toBe(false);
    }
  });
});

describe('markRun — re-marking a whole run from the answers alone', () => {
  it('opens the chest for three genuinely correct answers', () => {
    const answers = [rightAnswer(0), rightAnswer(1), rightAnswer(2)];
    expect(markRun(SPEC, KID, CHEST, answers).progress.open).toBe(true);
  });

  it('does not open it for three wrong ones', () => {
    const { progress } = markRun(SPEC, KID, CHEST, ['nonsense', 'nonsense', 'nonsense']);
    expect(progress.open).toBe(false);
    expect(progress.correct).toBe(0);
  });

  it('lets a kid get there the long way round', () => {
    const answers = ['x', rightAnswer(1), 'x', rightAnswer(3), 'x', rightAnswer(5)];
    expect(markRun(SPEC, KID, CHEST, answers).progress.open).toBe(true);
  });

  it('stops marking once the chest is open', () => {
    // Junk appended after a finished run must not extend it.
    const answers = [rightAnswer(0), rightAnswer(1), rightAnswer(2), 'x', 'x', 'x'];
    const { results } = markRun(SPEC, KID, CHEST, answers);
    expect(results).toHaveLength(3);
  });

  it('cannot be opened by an answer to a different question', () => {
    // Send question 0's answer three times: it is only right once.
    const a0 = rightAnswer(0);
    const { progress } = markRun(SPEC, KID, CHEST, [a0, a0, a0]);
    expect(progress.open).toBe(false);
  });
});

describe('gateSpec', () => {
  it('clamps the tier into the range the generators accept', () => {
    const lo = gateSpec({ subject: 'math', op: 'addition', tier: -4, skillId: 's', skillSlug: 'x', displayName: 'x', reason: 'x' });
    const hi = gateSpec({ subject: 'math', op: 'addition', tier: 99, skillId: 's', skillSlug: 'x', displayName: 'x', reason: 'x' });
    expect(lo.tier).toBe(1);
    expect(hi.tier).toBe(10);
  });

  it('falls back to a usable question when a skill has no mapping', () => {
    const m = gateSpec({ subject: 'math', op: null, tier: 3, skillId: 's', skillSlug: 'x', displayName: 'x', reason: 'x' });
    expect(m.mode).toBe('math');
    expect(m.mathType).toBe('mixed');
    const r = gateSpec({ subject: 'reading', op: null, tier: 3, skillId: 's', skillSlug: 'x', displayName: 'x', reason: 'x' });
    expect(r.mode).toBe('mixed');
  });
});
