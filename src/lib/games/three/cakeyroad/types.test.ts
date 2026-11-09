import { describe, expect, it } from 'vitest';
import { tapDir } from './types';

describe('tapDir', () => {
  it('hops left, forward or right by which third of the play area was tapped', () => {
    expect(tapDir(10, 900)).toBe('left');
    expect(tapDir(450, 900)).toBe('up');
    expect(tapDir(890, 900)).toBe('right');
  });

  it('treats the exact third lines as the middle', () => {
    expect(tapDir(300, 900)).toBe('up');
    expect(tapDir(600, 900)).toBe('up');
  });
});
