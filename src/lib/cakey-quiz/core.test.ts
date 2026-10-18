import { describe, expect, it } from 'vitest';
import {
  buildQuizQuestions,
  isAdjustmentEligible,
  medianTier,
  questionTiers,
  scorePlacement,
  tierForGrade,
} from './core';

describe('Cakey lightning quiz placement', () => {
  it('builds five math and five reading questions in alternating order', () => {
    const questions = buildQuizQuestions({ math: 4, reading: 3 });
    expect(questions).toHaveLength(10);
    expect(questions.filter((question) => question.subject === 'math')).toHaveLength(5);
    expect(questions.filter((question) => question.subject === 'reading')).toHaveLength(5);
    expect(questions.map((question) => question.subject)).toEqual([
      'math', 'reading', 'math', 'reading', 'math',
      'reading', 'math', 'reading', 'math', 'reading',
    ]);
  });

  it('probes around the current tier and clamps the edges', () => {
    expect(questionTiers(5)).toEqual([4, 5, 5, 6, 6]);
    expect(questionTiers(1)).toEqual([1, 1, 1, 2, 2]);
    expect(questionTiers(10)).toEqual([9, 10, 10, 10, 10]);
  });

  it('moves at most one tier using the agreed score thresholds', () => {
    expect(scorePlacement(5, 5)).toBe(6);
    expect(scorePlacement(5, 4)).toBe(6);
    expect(scorePlacement(5, 3)).toBe(5);
    expect(scorePlacement(5, 2)).toBe(5);
    expect(scorePlacement(5, 1)).toBe(4);
    expect(scorePlacement(5, 0)).toBe(4);
    expect(scorePlacement(10, 5)).toBe(10);
    expect(scorePlacement(1, 0)).toBe(1);
  });

  it('uses a conservative lower median and grade fallback', () => {
    expect(medianTier([2, 9, 4, 6])).toBe(4);
    expect(medianTier([])).toBeNull();
    expect(tierForGrade(0)).toBe(2);
    expect(tierForGrade(2)).toBe(4);
    expect(tierForGrade(null)).toBe(1);
  });

  it('allows a placement adjustment only after seven days', () => {
    const now = new Date('2026-07-29T12:00:00.000Z');
    expect(isAdjustmentEligible(null, now)).toBe(true);
    expect(isAdjustmentEligible('2026-07-22T11:59:59.000Z', now)).toBe(true);
    expect(isAdjustmentEligible('2026-07-22T12:00:01.000Z', now)).toBe(false);
  });
});
