import { describe, expect, it } from 'vitest';
import { layersForTier, minMoves, nextLayers } from './ladder';
import { MAX_LAYERS, MIN_LAYERS } from './state';

describe('minMoves', () => {
  it('is 2^n − 1', () => {
    expect(minMoves(3)).toBe(7);
    expect(minMoves(4)).toBe(15);
    expect(minMoves(8)).toBe(255);
    expect(minMoves(0)).toBe(0);
  });
});

describe('layersForTier', () => {
  it('starts at the three-layer brand cake and tops out at eight', () => {
    expect(layersForTier(1)).toBe(3);
    expect(layersForTier(10)).toBe(8);
  });

  it('never goes down as the tier goes up, and stays in the shipped range', () => {
    let prev = layersForTier(1);
    for (let t = 2; t <= 10; t += 1) {
      const n = layersForTier(t);
      expect(n).toBeGreaterThanOrEqual(prev);
      expect(n).toBeGreaterThanOrEqual(MIN_LAYERS);
      expect(n).toBeLessThanOrEqual(MAX_LAYERS);
      prev = n;
    }
  });

  it('clamps out-of-range tiers instead of extrapolating', () => {
    expect(layersForTier(0)).toBe(layersForTier(1));
    expect(layersForTier(-3)).toBe(layersForTier(1));
    expect(layersForTier(99)).toBe(layersForTier(10));
  });
});

describe('nextLayers', () => {
  it('climbs one after a par solve', () => {
    expect(nextLayers(3, 7, 7)).toBe(4);
    expect(nextLayers(5, 31, 31)).toBe(6);
  });

  it('holds after a solve within 1.5× par', () => {
    expect(nextLayers(3, 8, 7)).toBe(3);
    expect(nextLayers(3, 10, 7)).toBe(3); // 10/7 ≈ 1.43
  });

  it('drops one after a slog', () => {
    expect(nextLayers(4, 30, 15)).toBe(3); // 2× par
    expect(nextLayers(4, 23, 15)).toBe(3); // 1.53× par
  });

  it('caps at the max and floors at the min', () => {
    expect(nextLayers(MAX_LAYERS, 255, 255)).toBe(MAX_LAYERS);
    expect(nextLayers(MIN_LAYERS, 70, 7)).toBe(MIN_LAYERS);
  });

  it('tolerates a nonsense par without throwing', () => {
    expect(nextLayers(4, 5, 0)).toBe(4);
  });
});
