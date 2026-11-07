import { describe, expect, it } from 'vitest';
import { buildSessionSummary } from '@/lib/games/phaser/session';
import {
  candlesLeft,
  guess,
  isLost,
  isOver,
  isWon,
  masked,
  maxMissesForTier,
  newRound,
  revealsVowels,
  wrongLetters,
  VOWELS,
} from './state';

describe('Cakey\'s Candles state', () => {
  it('starts fully masked with every candle lit', () => {
    const s = newRound('cake', 6);
    expect(masked(s)).toEqual(['_', '_', '_', '_']);
    expect(candlesLeft(s)).toBe(6);
    expect(isOver(s)).toBe(false);
  });

  it('a right letter reveals every copy and costs nothing', () => {
    const s = guess(newRound('happy', 6), 'p');
    expect(masked(s)).toEqual(['_', '_', 'p', 'p', '_']);
    expect(s.misses).toBe(0);
    expect(candlesLeft(s)).toBe(6);
  });

  it('a wrong letter blows out one candle', () => {
    const s = guess(newRound('cake', 6), 'z');
    expect(candlesLeft(s)).toBe(5);
    expect(wrongLetters(s)).toEqual(['z']);
    expect(masked(s)).toEqual(['_', '_', '_', '_']);
  });

  it('wins when every letter is found', () => {
    let s = newRound('cat', 6);
    for (const l of 'tac') s = guess(s, l);
    expect(isWon(s)).toBe(true);
    expect(isLost(s)).toBe(false);
    expect(masked(s)).toEqual(['c', 'a', 't']);
  });

  it('loses when the last candle goes out, and the word stays masked', () => {
    let s = newRound('cat', 3);
    for (const l of 'xyz') s = guess(s, l);
    expect(isLost(s)).toBe(true);
    expect(isWon(s)).toBe(false);
    expect(candlesLeft(s)).toBe(0);
    // The component shows the word on loss; the state itself never leaks it.
    expect(masked(s)).toEqual(['_', '_', '_']);
  });

  it('a repeat letter is a no-op returning the same state', () => {
    const s1 = guess(newRound('cake', 6), 'z');
    const s2 = guess(s1, 'z');
    expect(s2).toBe(s1);
    const s3 = guess(s1, 'c');
    expect(guess(s3, 'C')).toBe(s3);
  });

  it('ignores non-letters and guesses after the round is over', () => {
    const s = newRound('cat', 1);
    expect(guess(s, '1')).toBe(s);
    expect(guess(s, ' ')).toBe(s);
    expect(guess(s, 'ab')).toBe(s);
    expect(guess(s, '')).toBe(s);
    const lost = guess(s, 'z');
    expect(isLost(lost)).toBe(true);
    expect(guess(lost, 'c')).toBe(lost);
  });

  it('is case-insensitive on input and lowercases the word', () => {
    const s = guess(newRound('CAKE', 6), 'K');
    expect(masked(s)).toEqual(['_', '_', 'k', '_']);
  });

  it('pre-reveals vowels without spending a candle, and only ones the word has', () => {
    const s = newRound('brave', 6, VOWELS);
    expect(masked(s)).toEqual(['_', '_', 'a', '_', 'e']);
    expect(s.misses).toBe(0);
    expect(candlesLeft(s)).toBe(6);
    // 'i', 'o', 'u' are not counted as tried, so they can still be guessed
    // (and will cost a candle, which is fair: the kid saw they were absent).
    expect(s.guessed.sort()).toEqual(['a', 'e']);
  });

  it('a word made only of vowels is won on reveal', () => {
    // Not a real list word, but the state must not wedge on it.
    expect(isWon(newRound('aa', 6, VOWELS))).toBe(true);
  });

  it('never has fewer than one candle', () => {
    expect(newRound('cat', 0).maxMisses).toBe(1);
  });
});

describe('tier dials', () => {
  it('candles by level: 8, then 7, then 6', () => {
    expect([1, 2, 3].map(maxMissesForTier)).toEqual([6, 6, 6]);
    expect([4, 5, 6].map(maxMissesForTier)).toEqual([5, 5, 5]);
    expect([7, 8, 9, 10].map(maxMissesForTier)).toEqual([4, 4, 4, 4]);
  });

  it('vowels are shown at levels 1–2 only', () => {
    expect(revealsVowels(1)).toBe(true);
    expect(revealsVowels(2)).toBe(true);
    expect(revealsVowels(3)).toBe(false);
  });
});

describe('round summary', () => {
  // The word is the unit of evidence: efficiency = solved / words, and a
  // wrong LETTER never counts as a wrong answer.
  it('efficiency is solved over words, and taps_total is the word count', () => {
    const s = buildSessionSummary({ score: 4, wrongAnswers: 1, sessionStart: Date.now(), optimalTaps: 5 });
    expect(s.taps_total).toBe(5);
    expect(s.efficiency).toBeCloseTo(0.8);
    expect(s.optimal_taps).toBe(5);
  });

  it('a three-word class round still logs at least three taps', () => {
    const s = buildSessionSummary({ score: 2, wrongAnswers: 1, sessionStart: Date.now(), optimalTaps: 3 });
    expect(s.taps_total).toBeGreaterThanOrEqual(3);
  });

  it('word search: score is words found, wrong is wrong selections, so taps ≥ words', () => {
    const s = buildSessionSummary({ score: 4, wrongAnswers: 3, sessionStart: Date.now(), optimalTaps: 4 });
    expect(s.taps_total).toBe(7);
    expect(s.efficiency).toBeCloseTo(4 / 7);
    expect(s.taps_total).toBeGreaterThanOrEqual(s.optimal_taps);
  });
});
