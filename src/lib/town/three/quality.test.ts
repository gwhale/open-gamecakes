import { describe, expect, it } from 'vitest';
import { summarizeFrames } from './perf-overlay';
import { QUALITY, gfxOverride, perfRequested, pickQualityTier } from './quality';

describe('pickQualityTier', () => {
  it('gives touch-first devices the tablet tier and everything else high', () => {
    expect(pickQualityTier({ coarsePointer: true })).toBe('tablet');
    expect(pickQualityTier({ coarsePointer: false })).toBe('high');
  });

  it('lets an override win in both directions', () => {
    expect(pickQualityTier({ coarsePointer: false, override: 'tablet' })).toBe('tablet');
    expect(pickQualityTier({ coarsePointer: true, override: 'high' })).toBe('high');
  });
});

describe('query flags', () => {
  it('ignores an unknown tier instead of breaking the page', () => {
    expect(gfxOverride('?gfx=tablet')).toBe('tablet');
    expect(gfxOverride('?gfx=ultra')).toBeNull();
    expect(gfxOverride('')).toBeNull();
  });

  it('turns perf on only for perf=1', () => {
    expect(perfRequested('?perf=1')).toBe(true);
    expect(perfRequested('?perf=0')).toBe(false);
    expect(perfRequested('')).toBe(false);
  });
});

describe('summarizeFrames', () => {
  it('reports the hitch an average would hide', () => {
    const s = summarizeFrames([...Array<number>(95).fill(16), ...Array<number>(5).fill(100)]);
    expect(s.avgMs).toBeCloseTo(20.2);
    expect(s.p95Ms).toBe(100);
  });

  it('survives having no frames yet', () => {
    expect(summarizeFrames([])).toEqual({ avgMs: 0, p95Ms: 0, fps: 0 });
  });
});

describe('QUALITY', () => {
  it('never asks the tablet tier to draw more than the high tier', () => {
    expect(QUALITY.tablet.maxPixelRatio).toBeLessThanOrEqual(QUALITY.high.maxPixelRatio);
    expect(QUALITY.tablet.precipCap).toBeLessThanOrEqual(QUALITY.high.precipCap);
    expect(QUALITY.tablet.grass.count).toBeLessThanOrEqual(QUALITY.high.grass.count);
    expect(QUALITY.tablet.grass.carpetSpacingU).toBeGreaterThanOrEqual(QUALITY.high.grass.carpetSpacingU);
  });
});
