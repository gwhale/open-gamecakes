// The two bits of grass-field.ts arithmetic the shader trusts without checking:
// which copy of the tile a tuft is drawn in, and the wrapping 16-bit trail clock.

import { describe, expect, it } from 'vitest';
import { TRAIL_LIFE_S, patchCopy, stampAgeS, stampCode } from './grass-field';

describe('patchCopy', () => {
  it('draws every tuft within half a patch of the player, wherever they stand', () => {
    const patch = 36;
    for (const c of [0, 17.9, -250.4, 1234.5]) {
      for (const o of [0, 0.3, 18, 35.9]) {
        const x = o + patchCopy(o, c, patch) * patch;
        expect(Math.abs(x - c)).toBeLessThanOrEqual(patch / 2);
      }
    }
  });
});

describe('trail clock', () => {
  it('never stamps 0, which means "never walked over"', () => {
    for (let t = 0; t < 20_000; t += 0.125) expect(stampCode(t)).not.toBe(0);
  });

  it('measures a stamp as fresh across the 16-bit wrap', () => {
    // 65535 ticks of 1/8 s: the code wraps after ~8192 s of play.
    const wrapS = 65535 / 8;
    const stampedAt = wrapS - 5;
    const age = stampAgeS(stampCode(stampedAt + 10), stampCode(stampedAt));
    expect(age).toBeCloseTo(10, 0);
    expect(age).toBeLessThan(TRAIL_LIFE_S);
  });
});
