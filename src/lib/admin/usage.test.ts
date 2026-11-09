import { describe, expect, it } from 'vitest';
import { ANSWER_TIME_CAP_MS, USAGE_DAYS, buildUsage } from './usage';

// Noon in New York, so "today" and "yesterday" are unambiguous.
const now = new Date('2026-11-07T17:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

const families = [
  { id: 'f1', name: 'Family One' },
  { id: 'f2', name: 'Family Two' },
];
const kids = [
  { id: 'k1', family_id: 'f1' },
  { id: 'k2', family_id: 'f1' },
  { id: 'k3', family_id: 'f2' },
];

describe('buildUsage', () => {
  it('has one bar per day, oldest first, ending today', () => {
    const u = buildUsage({ answers: [], kids, families, now });
    expect(u.days).toHaveLength(USAGE_DAYS);
    expect(u.days.at(-1)!.date).toBe('2026-11-07');
    expect(u.days[0].date < u.days[1].date).toBe(true);
  });

  it('counts answers and distinct kids per day in New York time', () => {
    const u = buildUsage({
      answers: [
        { kid_id: 'k1', created_at: hoursAgo(1), correct: true },
        { kid_id: 'k1', created_at: hoursAgo(2), correct: false },
        { kid_id: 'k3', created_at: hoursAgo(3), correct: true },
        // 02:00 UTC on the 7th is still the evening of the 6th in New York.
        { kid_id: 'k2', created_at: '2026-11-07T02:00:00Z', correct: true },
      ],
      kids,
      families,
      now,
    });
    expect(u.days.at(-1)).toMatchObject({ date: '2026-11-07', answers: 3, kids: 2 });
    expect(u.days.at(-2)).toMatchObject({ date: '2026-11-06', answers: 1, kids: 1 });
    expect(u.totals).toMatchObject({ answers30d: 4, activeKids30d: 3, activeFamilies30d: 2 });
    expect(u.totals.accuracy30d).toBeCloseTo(0.75);
  });

  it('caps one answer at two minutes toward time played', () => {
    const u = buildUsage({
      answers: [
        { kid_id: 'k1', created_at: hoursAgo(1), response_time_ms: 60 * 60_000 },
        { kid_id: 'k1', created_at: hoursAgo(1), response_time_ms: 60_000 },
      ],
      kids,
      families,
      now,
    });
    expect(u.totals.minutes30d).toBe(Math.round((ANSWER_TIME_CAP_MS + 60_000) / 60_000));
  });

  it('ignores answers older than the window and keeps 7-day totals separate', () => {
    const u = buildUsage({
      answers: [
        { kid_id: 'k1', created_at: hoursAgo(24 * 10) },
        { kid_id: 'k1', created_at: hoursAgo(24 * 40) },
      ],
      kids,
      families,
      now,
    });
    expect(u.totals).toMatchObject({ answers7d: 0, answers30d: 1, activeKids7d: 0 });
  });

  it('lists every family, busiest first, with zeros for the quiet ones', () => {
    const u = buildUsage({
      answers: [{ kid_id: 'k3', created_at: hoursAgo(1), correct: true }],
      kids,
      families,
      now,
    });
    expect(u.families.map((f) => f.id)).toEqual(['f2', 'f1']);
    expect(u.families[1]).toMatchObject({ answers: 0, activeDays: 0, accuracy: null, minutes: 0 });
  });
});
