// Tests for the authored-art loader's pure parts. Loading an actual GLB needs a
// browser (fetch + GLTFLoader), but the two things that would silently corrupt
// the town — bad scale normalisation and leaked GPU resources — are testable
// here in vitest's node environment.

import { describe, expect, it, vi } from 'vitest';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from 'three';
import { disposeAuthoredTree, uniformScaleForHeight } from './authored-model';

describe('uniformScaleForHeight', () => {
  it('scales an asset to the requested height', () => {
    expect(uniformScaleForHeight(4, 2)).toBe(0.5);
    expect(uniformScaleForHeight(1, 3)).toBe(3);
  });

  it('never collapses or explodes the scene on degenerate input', () => {
    // A flat asset, an empty group, or a bad target must fall back to 1:1
    // rather than producing 0, Infinity or NaN and taking the town with it.
    expect(uniformScaleForHeight(0, 2)).toBe(1);
    expect(uniformScaleForHeight(-3, 2)).toBe(1);
    expect(uniformScaleForHeight(Number.NaN, 2)).toBe(1);
    expect(uniformScaleForHeight(Number.POSITIVE_INFINITY, 2)).toBe(1);
    expect(uniformScaleForHeight(4, 0)).toBe(1);
    expect(uniformScaleForHeight(4, Number.NaN)).toBe(1);
  });
});

describe('disposeAuthoredTree', () => {
  it('disposes geometry, material and the material’s textures', () => {
    const geometry = new BoxGeometry(1, 1, 1);
    const texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    const root = new Group();
    root.add(new Mesh(geometry, material));

    const geo = vi.spyOn(geometry, 'dispose');
    const mat = vi.spyOn(material, 'dispose');
    const tex = vi.spyOn(texture, 'dispose');

    disposeAuthoredTree(root);

    expect(geo).toHaveBeenCalled();
    expect(mat).toHaveBeenCalled();
    expect(tex).toHaveBeenCalled();
  });

  it('handles multi-material meshes', () => {
    const a = new MeshStandardMaterial();
    const b = new MeshStandardMaterial();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(1, 1, 1), [a, b]));

    const sa = vi.spyOn(a, 'dispose');
    const sb = vi.spyOn(b, 'dispose');

    disposeAuthoredTree(root);

    expect(sa).toHaveBeenCalled();
    expect(sb).toHaveBeenCalled();
  });

  it('walks nested children, not just the top level', () => {
    const deepGeo = new BoxGeometry(1, 1, 1);
    const inner = new Group();
    inner.add(new Mesh(deepGeo, new MeshStandardMaterial()));
    const root = new Group();
    root.add(inner);

    const spy = vi.spyOn(deepGeo, 'dispose');
    disposeAuthoredTree(root);
    expect(spy).toHaveBeenCalled();
  });

  it('does not throw on an empty tree', () => {
    expect(() => disposeAuthoredTree(new Group())).not.toThrow();
  });
});
