import { describe, expect, it, vi } from 'vitest';

// The guard's imports reach next/headers; only the pure helpers are tested here.
vi.mock('@/lib/auth/family', () => ({ getCurrentFamily: vi.fn() }));
vi.mock('@/lib/auth/parent-mode', () => ({ requireParentModePage: vi.fn() }));

import { adminTokenIsValid, isSuperAdmin, makeAdminToken, parseSuperAdminIds } from './super-admin';

describe('admin token', () => {
  const NOW = 1_000_000;
  const good = makeAdminToken('u1', NOW + 1000, 'secret');

  it('accepts its own user before expiry', () => {
    expect(adminTokenIsValid(good, 'u1', NOW, 'secret')).toBe(true);
  });

  it('rejects another user, an expired token and another secret', () => {
    expect(adminTokenIsValid(good, 'u2', NOW, 'secret')).toBe(false);
    expect(adminTokenIsValid(good, 'u1', NOW + 1000, 'secret')).toBe(false);
    expect(adminTokenIsValid(good, 'u1', NOW, 'other')).toBe(false);
  });

  it('rejects a stretched expiry, junk, and a missing secret', () => {
    const sig = good.slice(good.indexOf('.') + 1);
    expect(adminTokenIsValid(`${NOW + 9999}.${sig}`, 'u1', NOW, 'secret')).toBe(false);
    expect(adminTokenIsValid('nonsense', 'u1', NOW, 'secret')).toBe(false);
    expect(adminTokenIsValid(`${NOW + 1000}.short`, 'u1', NOW, 'secret')).toBe(false);
    expect(adminTokenIsValid(undefined, 'u1', NOW, 'secret')).toBe(false);
    expect(adminTokenIsValid(good, 'u1', NOW, '')).toBe(false);
  });
});

describe('parseSuperAdminIds', () => {
  it('trims entries and drops blanks', () => {
    expect([...parseSuperAdminIds(' a , ,b,')]).toEqual(['a', 'b']);
  });

  it('is empty when unset', () => {
    expect(parseSuperAdminIds(undefined).size).toBe(0);
  });
});

describe('isSuperAdmin', () => {
  it('admits only a listed id', () => {
    expect(isSuperAdmin('a', 'a,b')).toBe(true);
    expect(isSuperAdmin('c', 'a,b')).toBe(false);
  });

  it('fails closed with no list or no user', () => {
    expect(isSuperAdmin('a', undefined)).toBe(false);
    expect(isSuperAdmin('a', '')).toBe(false);
    expect(isSuperAdmin(null, 'a')).toBe(false);
    expect(isSuperAdmin('', ',')).toBe(false);
  });
});
