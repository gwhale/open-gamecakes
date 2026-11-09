import { describe, expect, it } from 'vitest';
import { hollowOcclusion, slopeSoil } from './ground-look';

describe('slopeSoil', () => {
  it('keeps the gentle hills grassy', () => {
    expect(slopeSoil(1)).toBe(0);
    // The steepest rolling hill is about 0.62u over 150px; its normal stays near up.
    expect(slopeSoil(0.97)).toBe(0);
  });

  it('bares the steep sides, and never leaves 0..1', () => {
    expect(slopeSoil(0.8)).toBe(1);
    expect(slopeSoil(0)).toBe(1);
  });
});

describe('hollowOcclusion', () => {
  it('leaves level ground and crests fully lit', () => {
    expect(hollowOcclusion(1, 1)).toBe(1);
    expect(hollowOcclusion(2, 1)).toBe(1);
  });

  it('darkens only a real hollow', () => {
    expect(hollowOcclusion(1, 1.25)).toBeCloseTo(0.5);
    expect(hollowOcclusion(0, 5)).toBe(0);
  });
});
