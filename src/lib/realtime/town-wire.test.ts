import { describe, expect, it } from 'vitest';
import { PLAIN_CUPCAKE } from '@/lib/cupcake/config';
import { parsePos, parsePresence } from './town-wire';

const presence = { kid_id: 'kid-1', name: 'Sam', region_slug: 'town-square', cupcake: PLAIN_CUPCAKE };
const pos = { k: 'kid-1', cx: -460.8, cy: 2572.8, vx: 10, vy: -5, r: 1.2, m: 1, t: 1234.5 };

describe('parsePresence', () => {
  it('accepts a real profile', () => {
    expect(parsePresence('kid-1', presence)).toEqual(presence);
  });

  it('rejects a kid_id that differs from the presence key', () => {
    expect(parsePresence('kid-2', presence)).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['a non-string name', { ...presence, name: 42 }],
    ['an empty name', { ...presence, name: '' }],
    ['an oversized name', { ...presence, name: 'x'.repeat(41) }],
    ['a missing region', { ...presence, region_slug: undefined }],
  ])('rejects %s', (_label, raw) => {
    expect(parsePresence('kid-1', raw)).toBeNull();
  });

  it('falls back to safe cupcake values rather than passing junk to the renderer', () => {
    const parsed = parsePresence('kid-1', { ...presence, cupcake: { base: '<script>', extra: 1 } });
    expect(parsed?.cupcake).toEqual(PLAIN_CUPCAKE);
  });

  it('drops fields outside the contract', () => {
    expect(parsePresence('kid-1', { ...presence, grade: 3 })).not.toHaveProperty('grade');
  });
});

describe('parsePos', () => {
  it('accepts a real packet', () => {
    expect(parsePos(pos)).toEqual(pos);
  });

  it.each([
    ['null', null],
    ['a missing sender', { ...pos, k: undefined }],
    ['a NaN coordinate', { ...pos, cx: NaN }],
    ['a string coordinate', { ...pos, cy: '10' }],
    ['an infinite velocity', { ...pos, vx: Infinity }],
    ['an absurd coordinate', { ...pos, cx: 1e9 }],
    ['an absurd speed', { ...pos, vy: 1e9 }],
    ['a moving flag outside 0 or 1', { ...pos, m: 2 }],
    ['a missing time', { ...pos, t: undefined }],
  ])('rejects %s', (_label, raw) => {
    expect(parsePos(raw)).toBeNull();
  });
});
