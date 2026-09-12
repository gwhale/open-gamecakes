// Cakey's suggestion has two promises that are easy to break by accident and
// impossible to see in review: it must never point at a locked level, and it
// must never ask a kid to go backwards.

import { describe, expect, it } from 'vitest';
import { cakeyRecommends } from './recommend';

const UNLOCK_GRACE = 4;

describe('cakeyRecommends', () => {
  it('targets the grade-level standard for a kid sitting below it', () => {
    // 2nd grade -> 2.NBT.B.5, add & subtract within 100 -> tier 5.
    const pick = cakeyRecommends({ mode: 'math', grade: 2, currentTier: 3, maxReached: 3 });
    expect(pick?.level).toBe(5);
    expect(pick?.reason).toContain('2nd grade');
  });

  it('recommends times tables to a third grader', () => {
    const pick = cakeyRecommends({ mode: 'math', grade: 3, currentTier: 4, maxReached: 5 });
    expect(pick?.mathType).toBe('multiplication');
    expect(pick?.headline).toBe('Times tables');
  });

  it('never suggests a step backwards', () => {
    // Grade target is 3; the kid is already at 8.
    const pick = cakeyRecommends({ mode: 'math', grade: 1, currentTier: 8, maxReached: 8 });
    expect(pick!.level).toBeGreaterThanOrEqual(8);
    expect(pick!.reason).toContain('past');
  });

  it('never suggests a level the grid would render as locked', () => {
    for (let grade = 0; grade <= 5; grade++) {
      for (let reached = 1; reached <= 10; reached++) {
        const pick = cakeyRecommends({
          mode: 'math',
          grade,
          currentTier: reached,
          maxReached: reached,
        });
        expect(pick!.level, `grade ${grade}, reached ${reached}`).toBeLessThanOrEqual(
          reached + UNLOCK_GRACE,
        );
        expect(pick!.level).toBeLessThanOrEqual(10);
        expect(pick!.level).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('picks a word kind, not a math kind, in words mode', () => {
    const pick = cakeyRecommends({ mode: 'verbal', grade: 0, currentTier: 1, maxReached: 1 });
    expect(pick?.readingType).toBe('letter-sounds');
    expect(pick?.mathType).toBeUndefined();
  });


  describe('a grown-up override', () => {
    it('wins over the grade default, and says so', () => {
      const pick = cakeyRecommends({
        mode: 'math',
        grade: 1,
        currentTier: 2,
        maxReached: 4,
        focus: { focus_math: 'time-money', focus_math_level: 4 },
      });
      expect(pick?.mathType).toBe('time-money');
      expect(pick?.level).toBe(4);
      expect(pick?.headline).toBe('Time & money');
      expect(pick?.reason).toContain('working on right now');
    });

    // The never-go-backwards rule exists to stop a STALE grade default pulling
    // a kid down. An adult saying "we are revisiting fractions" is not that.
    it('honours a level below where the kid already is', () => {
      const pick = cakeyRecommends({
        mode: 'math',
        grade: 3,
        currentTier: 9,
        maxReached: 9,
        focus: { focus_math: 'addition', focus_math_level: 2 },
      });
      expect(pick?.level).toBe(2);
    });

    it('pins the kind without pinning the level', () => {
      const pick = cakeyRecommends({
        mode: 'math',
        grade: 2,
        currentTier: 3,
        maxReached: 3,
        focus: { focus_math: 'shapes', focus_math_level: null },
      });
      expect(pick?.mathType).toBe('shapes');
      expect(pick?.level).toBe(5); // still the grade-2 target
    });

    it('keeps math and words independent', () => {
      const focus = { focus_math: 'division', focus_reading: 'spelling' };
      expect(cakeyRecommends({ mode: 'math', grade: 2, currentTier: 3, maxReached: 3, focus })?.mathType)
        .toBe('division');
      expect(cakeyRecommends({ mode: 'verbal', grade: 2, currentTier: 3, maxReached: 3, focus })?.readingType)
        .toBe('spelling');
    });

    // A renamed domain or a hand-run UPDATE should not pose an unanswerable
    // question — it should look like nothing was set.
    it('ignores a kind it can no longer generate', () => {
      const pick = cakeyRecommends({
        mode: 'math',
        grade: 2,
        currentTier: 3,
        maxReached: 3,
        focus: { focus_math: 'long-division-but-renamed' },
      });
      expect(pick?.mathType).toBe('mixed'); // the grade-2 default
      expect(pick?.reason).toContain('2nd grade');
    });

    it('still respects the unlock ceiling', () => {
      const pick = cakeyRecommends({
        mode: 'math',
        grade: 0,
        currentTier: 1,
        maxReached: 1,
        focus: { focus_math: 'division', focus_math_level: 10 },
      });
      expect(pick!.level).toBeLessThanOrEqual(1 + 4);
    });
  });

  it('stays quiet for a kid with no grade and no history', () => {
    expect(cakeyRecommends({ mode: 'math', grade: null, currentTier: 1, maxReached: 1 })).toBeNull();
  });

  it('falls back to the kid`s own tier when the grade is unknown', () => {
    const pick = cakeyRecommends({ mode: 'math', grade: null, currentTier: 6, maxReached: 6 });
    expect(pick?.level).toBe(6);
    expect(pick?.mathType).toBe('mixed');
  });
});
