import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  family: null as { id: string } | null,
  kids: [] as { id: string; family_id: string }[],
  dbError: null as { message: string } | null,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
  }),
}));

vi.mock('@/lib/auth/family', () => ({
  getCurrentFamily: async () => state.family,
}));

vi.mock('@/lib/supabase/server', () => ({
  supabaseServer: () => {
    const filters: Record<string, string> = {};
    const query = {
      select: () => query,
      eq: (column: string, value: string) => {
        filters[column] = value;
        return query;
      },
      maybeSingle: async () => ({
        error: state.dbError,
        data: state.dbError
          ? null
          : state.kids.find((k) => k.id === filters.id && k.family_id === filters.family_id) ?? null,
      }),
    };
    return { from: () => query };
  },
}));

import { getActiveKid, readActiveKidCookie } from './active-kid';

describe('getActiveKid', () => {
  beforeEach(() => {
    state.cookie = 'kid-1';
    state.family = { id: 'family-1' };
    state.kids = [
      { id: 'kid-1', family_id: 'family-1' },
      { id: 'kid-2', family_id: 'family-2' },
    ];
    state.dbError = null;
  });

  it('returns a kid the signed-in family owns', async () => {
    expect(await getActiveKid()).toBe('kid-1');
  });

  it('returns null with no cookie', async () => {
    state.cookie = undefined;
    expect(await getActiveKid()).toBeNull();
  });

  it('returns null with no session, even for a real kid', async () => {
    state.family = null;
    expect(await getActiveKid()).toBeNull();
  });

  it("returns null for another family's kid", async () => {
    state.cookie = 'kid-2';
    expect(await getActiveKid()).toBeNull();
  });

  it('returns null for an id that matches no kid', async () => {
    state.cookie = 'not-a-kid';
    expect(await getActiveKid()).toBeNull();
  });

  it('fails closed on a database error', async () => {
    state.dbError = { message: 'down' };
    expect(await getActiveKid()).toBeNull();
  });

  it('leaves the raw read unverified, for clearing stale cookies', async () => {
    state.cookie = 'kid-2';
    expect(await readActiveKidCookie()).toBe('kid-2');
  });
});
