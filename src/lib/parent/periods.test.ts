import { describe, it, expect } from 'vitest';
import {
  parsePeriod,
  periodToParam,
  periodRange,
  monthsBetween,
  stepMonth,
  isFullyTracked,
  isEntirelyUntracked,
  TRACKING_START,
  type Period,
} from './periods';
import { activityByMonth } from './subjects';

const NOW = new Date(2026, 7, 1); // 1 Aug 2026
const month = (year: number, m: number): Period => ({ kind: 'month', year, month: m });

describe('parsePeriod', () => {
  it('reads a YYYY-MM param', () => {
    expect(parsePeriod('2026-07', NOW)).toEqual(month(2026, 6));
  });
  it('reads all', () => {
    expect(parsePeriod('all', NOW)).toEqual({ kind: 'all' });
  });
  it('falls back to the current month for junk, rather than throwing', () => {
    for (const junk of [undefined, '', 'nope', '2026-13', '2026-00', '99-1', '2026-7']) {
      expect(parsePeriod(junk, NOW)).toEqual(month(2026, 7));
    }
  });
  it('round-trips through the URL form', () => {
    for (const p of [month(2026, 0), month(2026, 11), { kind: 'all' } as Period]) {
      expect(parsePeriod(periodToParam(p), NOW)).toEqual(p);
    }
  });
});

describe('periodRange', () => {
  it('is inclusive-start, exclusive-end, so months cannot double-count a row', () => {
    const { from, to } = periodRange(month(2026, 6));
    expect(from).toEqual(new Date(2026, 6, 1));
    expect(to).toEqual(new Date(2026, 7, 1));
    // The next month's start is exactly this month's end.
    expect(periodRange(month(2026, 7)).from).toEqual(to);
  });
  it('is unbounded for all-time', () => {
    expect(periodRange({ kind: 'all' })).toEqual({ from: null, to: null });
  });
  it('handles a December→January rollover', () => {
    expect(periodRange(month(2026, 11)).to).toEqual(new Date(2027, 0, 1));
  });
});

describe('monthsBetween', () => {
  it('lists newest first, inclusive of both ends', () => {
    const ms = monthsBetween(new Date(2026, 4, 20), NOW);
    expect(ms).toEqual([
      { year: 2026, month: 7 },
      { year: 2026, month: 6 },
      { year: 2026, month: 5 },
      { year: 2026, month: 4 },
    ]);
  });
  it('crosses a year boundary', () => {
    const ms = monthsBetween(new Date(2025, 10, 3), new Date(2026, 0, 15));
    expect(ms.map((m) => `${m.year}-${m.month}`)).toEqual(['2026-0', '2025-11', '2025-10']);
  });
  it('yields just the current month when there is no data at all', () => {
    expect(monthsBetween(null, NOW)).toEqual([{ year: 2026, month: 7 }]);
  });
  it('does not run away when earliest is in the future (clock skew)', () => {
    const ms = monthsBetween(new Date(2030, 0, 1), NOW);
    expect(ms.length).toBeLessThan(5);
  });
});

describe('stepMonth', () => {
  const months = monthsBetween(new Date(2026, 4, 1), NOW); // May..Aug, newest first

  it('steps BACK in time with delta -1', () => {
    expect(stepMonth(month(2026, 7), -1, months)).toEqual(month(2026, 6));
  });
  it('steps FORWARD in time with delta +1', () => {
    expect(stepMonth(month(2026, 6), 1, months)).toEqual(month(2026, 7));
  });
  it('returns null past the newest month, so the arrow can be disabled', () => {
    expect(stepMonth(month(2026, 7), 1, months)).toBeNull();
  });
  it('returns null before the oldest month with data', () => {
    expect(stepMonth(month(2026, 4), -1, months)).toBeNull();
  });
  it('returns null for a month outside the list entirely', () => {
    expect(stepMonth(month(2020, 1), -1, months)).toBeNull();
  });
  it('returns null for the all-time period', () => {
    expect(stepMonth({ kind: 'all' }, -1, months)).toBeNull();
  });
});

describe('tracking boundary', () => {
  it('treats the boundary month itself as NOT fully tracked', () => {
    // July 2026 contains rows from before the 26th with no game_slug.
    expect(isFullyTracked(month(2026, 6))).toBe(false);
    expect(isEntirelyUntracked(month(2026, 6))).toBe(false);
  });
  it('treats months after the boundary as fully tracked', () => {
    expect(isFullyTracked(month(2026, 7))).toBe(true);
  });
  it('treats months entirely before the boundary as entirely untracked', () => {
    expect(isEntirelyUntracked(month(2026, 5))).toBe(true);
    expect(isFullyTracked(month(2026, 5))).toBe(false);
  });
  it('never claims all-time is fully tracked', () => {
    expect(isFullyTracked({ kind: 'all' })).toBe(false);
    expect(isEntirelyUntracked({ kind: 'all' })).toBe(false);
  });
  it('pins the boundary to the migration date', () => {
    expect(TRACKING_START.getFullYear()).toBe(2026);
    expect(TRACKING_START.getMonth()).toBe(6);
    expect(TRACKING_START.getDate()).toBe(26);
  });
});

describe('activityByMonth', () => {
  const rows = [
    { created_at: new Date(2026, 4, 3, 12).toISOString() },
    { created_at: new Date(2026, 4, 9, 12).toISOString() },
    { created_at: new Date(2026, 7, 1, 12).toISOString() },
  ];

  it('emits every month in range oldest-first, including empty ones', () => {
    const out = activityByMonth(rows, new Date(2026, 4, 1), NOW);
    expect(out.map((m) => m.rounds)).toEqual([2, 0, 0, 1]);
    expect(out[0]).toMatchObject({ year: 2026, month: 4 });
    expect(out[3]).toMatchObject({ year: 2026, month: 7 });
  });

  it('keeps gaps visible rather than closing them up', () => {
    // A silent gap would make a two-month break look like continuous play.
    const out = activityByMonth(rows, new Date(2026, 4, 1), NOW);
    expect(out).toHaveLength(4);
    expect(out.filter((m) => m.rounds === 0)).toHaveLength(2);
  });

  it('counts untracked rows too — activity is activity', () => {
    const out = activityByMonth([{ created_at: new Date(2026, 5, 2).toISOString() }], new Date(2026, 5, 1), new Date(2026, 5, 20));
    expect(out[0].rounds).toBe(1);
  });
});
