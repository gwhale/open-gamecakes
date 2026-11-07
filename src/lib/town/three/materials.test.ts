// Regression tests for the ground-decal z-fighting fix.
//
// Symptom: the bridge and the soccer pitch flickered while riding a vehicle or
// the Sugar Express. Both lie within centimetres of a vertex-displaced ground
// plane, so wherever the terrain rises they share a depth value with it and the
// GPU alternates which surface wins.
//
// These run in vitest's node environment — constructing three materials is pure
// JS and needs no WebGL context.

import { describe, expect, it } from 'vitest';
import { MeshStandardMaterial } from 'three';
import { groundDecalDepthBias } from './materials';

describe('groundDecalDepthBias', () => {
  it('enables polygonOffset so the decal beats the terrain deterministically', () => {
    const mat = groundDecalDepthBias(new MeshStandardMaterial());
    expect(mat.polygonOffset).toBe(true);
  });

  it('biases toward the viewer — a positive offset would push it further in', () => {
    const mat = groundDecalDepthBias(new MeshStandardMaterial());
    expect(mat.polygonOffsetFactor).toBeLessThan(0);
    expect(mat.polygonOffsetUnits).toBeLessThan(0);
  });

  it('stacks layers so a decal resting on another decal still wins', () => {
    const road = groundDecalDepthBias(new MeshStandardMaterial(), 1);
    const dashes = groundDecalDepthBias(new MeshStandardMaterial(), 2);
    // More negative = closer to the viewer, so the dashes win over the road.
    expect(dashes.polygonOffsetFactor).toBeLessThan(road.polygonOffsetFactor);
  });

  it('returns the same material instance so callers can still track disposal', () => {
    const mat = new MeshStandardMaterial();
    expect(groundDecalDepthBias(mat)).toBe(mat);
  });
});
