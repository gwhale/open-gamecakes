import { describe, expect, it } from 'vitest';
import { adminRecipients, dailySummary, newFamilyNote } from './notify';
import { buildOverview, type OverviewInput } from './overview';

const NOW = new Date('2026-11-06T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function overview(over: Partial<OverviewInput> = {}) {
  return buildOverview({
    families: [{ id: 'f1', name: 'The Rivers', owner_user_id: 'u1', created_at: hoursAgo(500), tier: 'restricted' }],
    users: [{ id: 'u1', login: 'rivers', last_sign_in_at: hoursAgo(400) }],
    kids: [{ id: 'k1', family_id: 'f1', name: 'Zoomer', grade: '3' }],
    kidStats: [],
    recentRounds: [],
    positions: [],
    balances: [],
    tickets: [],
    now: NOW,
    ...over,
  });
}

describe('adminRecipients', () => {
  it('reads a comma list and sends to nobody when unset', () => {
    expect(adminRecipients(' a@x.org, b@x.org ')).toEqual(['a@x.org', 'b@x.org']);
    expect(adminRecipients(undefined)).toEqual([]);
    expect(adminRecipients('')).toEqual([]);
  });
});

describe('dailySummary', () => {
  it('sends nothing on a quiet day', () => {
    expect(dailySummary(overview(), NOW)).toBeNull();
  });

  it('reports a new family', () => {
    const summary = dailySummary(
      overview({
        families: [{ id: 'f1', name: 'The Rivers', owner_user_id: 'u1', created_at: hoursAgo(2), tier: 'restricted' }],
      }),
      NOW,
    );
    expect(summary?.subject).toContain('1 new');
    expect(summary?.text).toContain('The Rivers');
  });

  it('counts rounds and never names a kid', () => {
    const summary = dailySummary(
      overview({ recentRounds: [{ kid_id: 'k1', game_slug: 'chess', created_at: hoursAgo(1) }] }),
      NOW,
    );
    expect(summary?.text).toContain('Rounds played: 1');
    expect(summary?.text).not.toContain('Zoomer');
  });
});

describe('newFamilyNote', () => {
  it('carries what the operator needs to help them', () => {
    const { subject, text } = newFamilyNote({
      name: 'The Rivers',
      login: 'rivers',
      contactEmail: 'sam@example.com',
      tier: 'restricted',
    });
    expect(subject).toContain('The Rivers');
    expect(text).toContain('rivers');
    expect(text).toContain('sam@example.com');
  });
});
