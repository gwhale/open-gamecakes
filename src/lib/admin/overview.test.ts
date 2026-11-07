import { describe, expect, it } from 'vitest';
import { buildOverview, timeAgo, type OverviewInput } from './overview';

const NOW = new Date('2026-11-06T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const minsAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

function input(over: Partial<OverviewInput> = {}): OverviewInput {
  return {
    families: [
      { id: 'old', name: 'Old', owner_user_id: 'u1', created_at: daysAgo(100), tier: 'full' },
      { id: 'new', name: 'New', owner_user_id: 'u2', created_at: daysAgo(2), tier: 'restricted' },
    ],
    users: [
      { id: 'u1', login: 'old-login', last_sign_in_at: daysAgo(1) },
      { id: 'u2', login: 'new-login', last_sign_in_at: daysAgo(30) },
    ],
    kids: [{ id: 'k1', family_id: 'old', name: 'Zoomer', grade: '3' }],
    kidStats: [{ kid_id: 'k1', rounds: 40, last_round_at: daysAgo(1) }],
    recentRounds: [
      { kid_id: 'k1', game_slug: 'chess', created_at: daysAgo(1) },
      { kid_id: 'k1', game_slug: 'chess', created_at: daysAgo(20) },
      { kid_id: 'k1', game_slug: 'racer', created_at: daysAgo(3) },
    ],
    positions: [{ kid_id: 'k1', updated_at: minsAgo(5) }],
    balances: [{ kid_id: 'k1', balance: 12 }],
    tickets: [],
    now: NOW,
    ...over,
  };
}

describe('buildOverview', () => {
  it('counts families, kids and a family with no kids', () => {
    const { totals } = buildOverview(input());
    expect(totals.families).toBe(2);
    expect(totals.kids).toBe(1);
    expect(totals.familiesWithoutKids).toBe(1);
    expect(totals.newFamilies7d).toBe(1);
    expect(totals.signIns7d).toBe(1);
  });

  it('lists the newest signup first and joins the login', () => {
    const { families } = buildOverview(input());
    expect(families.map((f) => f.login)).toEqual(['new-login', 'old-login']);
  });

  it('splits recent rounds into 7 and 30 days, and ranks games', () => {
    const o = buildOverview(input());
    expect(o.totals.rounds7d).toBe(2);
    expect(o.totals.rounds30d).toBe(3);
    expect(o.topGames30d[0]).toEqual({ slug: 'chess', rounds: 2 });
  });

  it('ignores rounds from a kid outside the list, like the shared Guest', () => {
    const o = buildOverview(
      input({ recentRounds: [{ kid_id: 'guest', game_slug: 'chess', created_at: daysAgo(1) }] }),
    );
    expect(o.totals.rounds30d).toBe(0);
    expect(o.topGames30d).toEqual([]);
  });

  it('treats a position inside the window as here now, and an older one as not', () => {
    expect(buildOverview(input()).totals.seenNow).toBe(1);
    const later = buildOverview(input({ positions: [{ kid_id: 'k1', updated_at: minsAgo(11) }] }));
    expect(later.totals.seenNow).toBe(0);
  });

  it('counts only tickets that are still open, per family', () => {
    const o = buildOverview(
      input({
        tickets: [
          { family_id: 'old', status: 'new' },
          { family_id: 'old', status: 'done' },
          { family_id: 'old', status: 'wontfix' },
        ],
      }),
    );
    expect(o.totals.openTickets).toBe(1);
    expect(o.families.find((f) => f.id === 'old')?.openTickets).toBe(1);
  });

  it('flags rounds stopping while kids are still around', () => {
    const stuck = buildOverview(
      input({
        kidStats: [{ kid_id: 'k1', rounds: 40, last_round_at: daysAgo(27) }],
        recentRounds: [],
      }),
    );
    expect(stuck.roundsLooksStuck).toBe(true);
  });

  it('does not flag a quiet deployment where nobody is around', () => {
    const quiet = buildOverview(
      input({
        kidStats: [{ kid_id: 'k1', rounds: 40, last_round_at: daysAgo(27) }],
        recentRounds: [],
        positions: [{ kid_id: 'k1', updated_at: daysAgo(27) }],
      }),
    );
    expect(quiet.roundsLooksStuck).toBe(false);
  });

  it('uses the latest of sign-in, position and round as last active', () => {
    const { families } = buildOverview(input());
    expect(families.find((f) => f.id === 'old')?.lastActiveAt).toBe(minsAgo(5));
  });
});

describe('timeAgo', () => {
  it('reads as words', () => {
    expect(timeAgo(null, NOW)).toBe('never');
    expect(timeAgo(minsAgo(0), NOW)).toBe('just now');
    expect(timeAgo(minsAgo(12), NOW)).toBe('12 min ago');
    expect(timeAgo(minsAgo(180), NOW)).toBe('3 hr ago');
    expect(timeAgo(daysAgo(1), NOW)).toBe('1 day ago');
    expect(timeAgo(daysAgo(5), NOW)).toBe('5 days ago');
  });
});
