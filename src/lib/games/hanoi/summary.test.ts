import { describe, expect, it } from 'vitest';
import { buildHanoiSummary } from './summary';
import { MIN_EVIDENCE_ANSWERS } from '@/lib/mastery/update';

const start = Date.now() - 30_000;

describe('buildHanoiSummary', () => {
  it('scores a par solve as 1.0', () => {
    const s = buildHanoiSummary({ n: 3, moves: 7, hints: 0, sessionStart: start });
    expect(s.efficiency).toBe(1);
    expect(s.optimal_taps).toBe(7);
    expect(s.taps_total).toBe(7);
    expect(s.taps_wrong).toBe(0);
    expect(s.completed).toBe(true);
    expect(s.meta_lines).toEqual(['🗼 7 moves · par 7', '✨ Perfect!']);
  });

  it('scores three moves over par on a 3-layer tower as 7/10', () => {
    const s = buildHanoiSummary({ n: 3, moves: 10, hints: 0, sessionStart: start });
    expect(s.efficiency).toBeCloseTo(0.7, 5);
    expect(s.taps_total).toBe(10);
    expect(s.taps_wrong).toBe(3);
    expect(s.meta_lines?.[1]).toBe('🧁 3 over par');
  });

  it('charges each hint like one move over par', () => {
    const noHint = buildHanoiSummary({ n: 3, moves: 7, hints: 0, sessionStart: start });
    const twoHints = buildHanoiSummary({ n: 3, moves: 7, hints: 2, sessionStart: start });
    expect(twoHints.efficiency).toBeLessThan(noHint.efficiency);
    expect(twoHints.efficiency).toBeCloseTo(7 / 9, 5);
    expect(twoHints.taps_wrong).toBe(2);
    expect(twoHints.meta_lines?.[1]).toBe('💡 2 hints');
    expect(buildHanoiSummary({ n: 3, moves: 8, hints: 1, sessionStart: start }).meta_lines?.[1]).toBe('💡 1 hint');
  });

  it('always clears the evidence floor, even on the smallest tower', () => {
    const s = buildHanoiSummary({ n: 3, moves: 7, hints: 0, sessionStart: start });
    expect(s.taps_total).toBeGreaterThanOrEqual(MIN_EVIDENCE_ANSWERS);
  });

  it('never goes below zero when the reported move count is impossible', () => {
    // A move count under par cannot happen, but a summary must not invent
    // negative wrong answers if it ever did.
    const s = buildHanoiSummary({ n: 3, moves: 5, hints: 0, sessionStart: start });
    expect(s.taps_wrong).toBe(0);
    expect(s.efficiency).toBe(1);
  });

  it('records session time', () => {
    const s = buildHanoiSummary({ n: 4, moves: 15, hints: 0, sessionStart: start });
    expect(s.session_ms).toBeGreaterThanOrEqual(30_000);
  });
});
