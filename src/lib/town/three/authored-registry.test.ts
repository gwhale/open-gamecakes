// Tests for the preload-and-clone registry, focused on the two properties the
// town depends on and that would fail silently:
//
//   1. take() is SYNCHRONOUS and returns null when unavailable, so the land
//      structure rebuild (which cannot await) always has a procedural fallback.
//   2. clones SHARE geometry/material with the cached original — which is why
//      buildLandStructure must hand back empty disposal arrays for them.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Group, Mesh, BoxGeometry, MeshStandardMaterial } from 'three';
import { AUTHORED_LAND_STRUCTURES, buildLandStructure } from './land-structure';
import { applyTints, settleRegistry, type AuthoredRegistry } from './authored-registry';
import type { ThreeNS } from './types';

/** Minimal stand-in — the real one needs a browser to fetch GLBs. */
function fakeRegistry(available: Record<string, Group>): AuthoredRegistry {
  return {
    ready: Promise.resolve(),
    has: (key) => key in available,
    take: (key) => (key in available ? available[key].clone(true) : null),
    dispose: () => {},
  };
}

function authoredModel(): Group {
  const g = new Group();
  g.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()));
  return g;
}

// The real namespace: the procedural builder reaches for cones, cylinders,
// spheres and lathes, so a hand-stubbed object silently fails the fallback path
// — which is exactly the path these tests exist to protect.
const THREE_NS = THREE as unknown as ThreeNS;

describe('buildLandStructure + authored registry', () => {
  it('falls back to the procedural builder when no registry is supplied', () => {
    const result = buildLandStructure(THREE_NS, 1);
    // The procedural builder owns real resources and must report them for
    // disposal — a non-empty array here is the signal that it ran.
    expect(result.geometries.length).toBeGreaterThan(0);
    expect(result.materials.length).toBeGreaterThan(0);
  });

  it('falls back when the registry has nothing for that level', () => {
    const result = buildLandStructure(THREE_NS, 1, fakeRegistry({}));
    expect(result.geometries.length).toBeGreaterThan(0);
  });

  it('uses the authored model when one is available', () => {
    const key = AUTHORED_LAND_STRUCTURES[1].key;
    const result = buildLandStructure(THREE_NS, 1, fakeRegistry({ [key]: authoredModel() }));
    expect(result.group.children.length).toBe(1);
  });

  it('reports NO disposables for an authored model, because they are shared', () => {
    // This is the load-bearing one. Clones share geometry/material with the
    // registry's cached original; if these arrays were populated, the caller's
    // teardown in setLandLevel would dispose resources still in use by every
    // other instance and by the cache itself.
    const key = AUTHORED_LAND_STRUCTURES[3].key;
    const result = buildLandStructure(THREE_NS, 3, fakeRegistry({ [key]: authoredModel() }));
    expect(result.geometries).toHaveLength(0);
    expect(result.materials).toHaveLength(0);
  });

  it('maps each land level to its own asset key and height', () => {
    // Heights must match the procedural silhouettes (city3d stands the
    // structure at scale 1 and positions around its known apex).
    expect(AUTHORED_LAND_STRUCTURES[1]).toEqual({ key: 'land-cottage', targetHeightU: 2.9 });
    expect(AUTHORED_LAND_STRUCTURES[2]).toEqual({ key: 'land-tower', targetHeightU: 9.3 });
    expect(AUTHORED_LAND_STRUCTURES[3]).toEqual({ key: 'land-castle', targetHeightU: 18 });
  });

  it('has no authored slot for level 0 — a Plot has no structure at all', () => {
    expect(AUTHORED_LAND_STRUCTURES[0]).toBeUndefined();
    const result = buildLandStructure(THREE_NS, 0, fakeRegistry({}));
    expect(result.group.children).toHaveLength(0);
  });
});

describe('applyTints', () => {
  function tinted(): Group {
    const g = new Group();
    const atlas = new MeshStandardMaterial({ name: 'booth-atlas' });
    const tint = new MeshStandardMaterial({ name: 'tint' });
    g.add(new Mesh(new BoxGeometry(1, 1, 1), atlas), new Mesh(new BoxGeometry(1, 1, 1), tint));
    return g;
  }
  const parts = (g: Group) => g.children.map((c) => (c as Mesh).material as MeshStandardMaterial);

  it('paints only the tint slot, leaving the shared atlas alone', () => {
    const original = tinted();
    const clone = original.clone(true);
    applyTints(clone, { tint: 0xff0000 }, new Map());
    const [atlas, body] = parts(clone);
    expect(atlas).toBe(parts(original)[0]);
    expect(body).not.toBe(parts(original)[1]);
    expect(body.color.getHex()).toBe(0xff0000);
    // The cached original stays white for the next clone.
    expect(parts(original)[1].color.getHex()).toBe(0xffffff);
  });

  it('shares one painted material per colour across clones', () => {
    const original = tinted();
    const cache = new Map();
    const a = original.clone(true);
    const b = original.clone(true);
    const c = original.clone(true);
    applyTints(a, { tint: 0x00ff00 }, cache);
    applyTints(b, { tint: 0x00ff00 }, cache);
    applyTints(c, { tint: 0x0000ff }, cache);
    expect(parts(a)[1]).toBe(parts(b)[1]);
    expect(parts(c)[1]).not.toBe(parts(a)[1]);
    expect(cache.size).toBe(2);
  });
});

describe('settleRegistry', () => {
  it('stops waiting at the cap, so a slow asset cannot hold the town', async () => {
    const never: AuthoredRegistry = { ...fakeRegistry({}), ready: new Promise(() => {}) };
    const t0 = Date.now();
    await settleRegistry(never, 30);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
});
