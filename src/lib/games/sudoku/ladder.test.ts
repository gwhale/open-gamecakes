// Ladder tests for Waffle Sudoku.
//
// The dials in ladder.ts are unplaytested guesses; what CAN be pinned is their
// shape. Difficulty must never go down as the score goes up, a launcher level
// must land in its own band, and a run of clean solves must actually reach
// the top — otherwise "gets trickier as you solve" is a lie on the launcher.

import { describe, expect, it } from 'vitest';
import {
  CLEAN_STEP,
  LADDER,
  MISS_STEP,
  SCORE_MAX,
  SCORE_MIN,
  bandForScore,
  bandForTier,
  clampScore,
  difficultyRank,
  specForScore,
  startScoreForTier,
  stepScore,
} from './ladder';
import { TECHNIQUE_RANK } from './types';

describe('LADDER', () => {
  it('has exactly 10 bands, tiers 1..10 in order', () => {
    expect(LADDER.length).toBe(10);
    LADDER.forEach((b, i) => expect(b.tier).toBe(i + 1));
  });

  it('sizes never shrink and techniques never regress', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i].size).toBeGreaterThanOrEqual(LADDER[i - 1].size);
      if (LADDER[i].size === LADDER[i - 1].size) {
        expect(TECHNIQUE_RANK[LADDER[i].maxTechnique]).toBeGreaterThanOrEqual(
          TECHNIQUE_RANK[LADDER[i - 1].maxTechnique],
        );
      }
    }
  });

  it('every band has a sane givens range and a blurb', () => {
    for (const b of LADDER) {
      expect(b.givens.min).toBeLessThanOrEqual(b.givens.max);
      expect(b.givens.min).toBeGreaterThan(0);
      expect(b.givens.max).toBeLessThan(b.size * b.size);
      expect(b.blurb.length).toBeGreaterThan(0);
    }
  });
});

describe('score axis', () => {
  it('CLEAN_STEP > MISS_STEP > 0', () => {
    expect(CLEAN_STEP).toBeGreaterThan(MISS_STEP);
    expect(MISS_STEP).toBeGreaterThan(0);
  });

  it('clamps', () => {
    expect(clampScore(-5)).toBe(SCORE_MIN);
    expect(clampScore(500)).toBe(SCORE_MAX);
    expect(stepScore(SCORE_MAX, true)).toBe(SCORE_MAX);
    expect(stepScore(SCORE_MIN, false)).toBe(SCORE_MIN);
    expect(bandForTier(0).tier).toBe(1);
    expect(bandForTier(99).tier).toBe(10);
  });

  it('a launcher level starts in its own band', () => {
    for (let t = 1; t <= 10; t++) {
      expect(bandForScore(startScoreForTier(t)).tier).toBe(t);
      expect(specForScore(startScoreForTier(t)).tier).toBe(t);
    }
  });

  it('40 clean steps from tier 1 reach tier 10', () => {
    let s = startScoreForTier(1);
    for (let i = 0; i < 40; i++) s = stepScore(s, true);
    expect(bandForScore(s).tier).toBe(10);
  });

  it('stepScore moves by the named steps', () => {
    expect(stepScore(50, true)).toBe(50 + CLEAN_STEP);
    expect(stepScore(50, false)).toBe(50 - MISS_STEP);
  });
});

describe('specForScore', () => {
  it('difficultyRank is non-decreasing over score 0..100', () => {
    let prev = -1;
    for (let s = 0; s <= 100; s++) {
      const rank = difficultyRank(specForScore(s));
      expect(rank, `score ${s}`).toBeGreaterThanOrEqual(prev);
      prev = rank;
    }
  });

  it('givens.target decreases within a band, from max at the floor to min at the ceiling', () => {
    for (const band of LADDER) {
      const floor = (band.tier - 1) * 10;
      const ceiling = floor + 9;
      expect(specForScore(floor).givens.target).toBe(band.givens.max);
      expect(specForScore(ceiling).givens.target).toBe(band.givens.min);
      let prev = Infinity;
      for (let s = floor; s <= ceiling; s++) {
        const t = specForScore(s).givens.target;
        expect(t).toBeLessThanOrEqual(prev);
        expect(t).toBeGreaterThanOrEqual(band.givens.min);
        expect(t).toBeLessThanOrEqual(band.givens.max);
        prev = t;
      }
    }
  });

  it('carries the band through', () => {
    const s = specForScore(startScoreForTier(5));
    const b = bandForTier(5);
    expect(s.size).toBe(b.size);
    expect(s.maxTechnique).toBe(b.maxTechnique);
    expect(s.symmetric).toBe(b.symmetric);
    expect(s.givens.min).toBe(b.givens.min);
    expect(s.givens.max).toBe(b.givens.max);
  });

  it('score 100 is the top of tier 10', () => {
    const s = specForScore(100);
    expect(s.tier).toBe(10);
    expect(s.givens.target).toBe(LADDER[9].givens.min);
  });
});
