import { describe, expect, it } from 'vitest';
import { cloudCover } from './sky-sea';

describe('cloudCover', () => {
  it('brings more cloud in grey weather than on a clear day', () => {
    // A lower threshold means more of the noise field counts as cloud.
    expect(cloudCover(0)).toBeLessThan(cloudCover(1));
  });

  it('stays in range whatever the sun is doing', () => {
    expect(cloudCover(-5)).toBe(cloudCover(0));
    expect(cloudCover(5)).toBe(cloudCover(1));
  });
});
