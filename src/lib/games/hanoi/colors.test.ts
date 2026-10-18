import { describe, expect, it } from 'vitest';
import { tierColorsFor } from './colors';
import { CAKE, WORLD } from '@/lib/games/theme/palette';
import { MAX_LAYERS, MIN_LAYERS } from './state';

describe('tierColorsFor', () => {
  it('gives three layers the brand cake: cream, gold, strawberry', () => {
    expect(tierColorsFor(3)).toEqual([CAKE.VANILLA, CAKE.VANILLA_DEEP, CAKE.STRAWBERRY]);
  });

  it('returns one colour per layer, from the shared ladder, in ladder order', () => {
    const ladder: number[] = [...WORLD.CAKE_TIERS];
    for (let n = MIN_LAYERS; n <= MAX_LAYERS; n += 1) {
      const c = tierColorsFor(n);
      expect(c).toHaveLength(n);
      const idx = c.map((hex) => ladder.indexOf(hex));
      for (const i of idx) expect(i).toBeGreaterThanOrEqual(0);
      for (let k = 1; k < idx.length; k += 1) expect(idx[k]).toBeGreaterThan(idx[k - 1]);
      expect(new Set(c).size).toBe(n);
    }
  });

  it('keeps cream on top at every height and chocolate at the base from four up', () => {
    for (let n = MIN_LAYERS; n <= MAX_LAYERS; n += 1) {
      expect(tierColorsFor(n)[0]).toBe(CAKE.VANILLA);
      if (n >= 4) expect(tierColorsFor(n)[n - 1]).toBe(CAKE.CHOCOLATE);
    }
  });

  it('uses the whole ladder at eight', () => {
    expect(tierColorsFor(8)).toEqual([...WORLD.CAKE_TIERS]);
  });

  it('clamps out-of-range counts', () => {
    expect(tierColorsFor(1)).toEqual(tierColorsFor(MIN_LAYERS));
    expect(tierColorsFor(20)).toEqual(tierColorsFor(MAX_LAYERS));
  });
});
