// Does a chest actually SIT on the sand?
//
// The catalog tests already check where a chest is — depth, band, spacing. All
// of those look at one point, the chest's own x/z, and every one of them passed
// while eight of the ten chests had a corner buried up to 2.27m in a slope or
// hanging the same distance out of it. A box's position can be perfectly right
// and the box still be wrong, because what a kid sees is its CORNERS meeting
// the ground, and nothing was looking at those.
//
// So this measures the shape rather than the edit: put the four bottom corners
// in world space and ask the same height field the terrain mesh uses how far
// each one is from the sand underneath it.
//
// Runs in vitest's node environment — building geometry is pure JS and needs no
// WebGL context, the same reason town/three/materials.test.ts can.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createChests } from './chests';
import { DEEP_CHESTS } from './chest-catalog';
import { oceanFloorM } from './ocean-floor';

/** World-space y of each bottom corner of a chest's body, and the seabed
 *  directly beneath that corner. */
function cornerGaps(chest: THREE.Object3D): number[] {
  const body = chest.children.find(
    (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh === true,
  )!;
  const { width, height, depth } = (body.geometry as THREE.BoxGeometry).parameters;
  chest.updateMatrixWorld(true);

  const gaps: number[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.Vector3((sx * width) / 2, -height / 2, (sz * depth) / 2);
      chest.localToWorld(p);
      // Positive: the corner floats above the sand. Negative: it is buried.
      gaps.push(p.y - oceanFloorM(p.x, p.z));
    }
  }
  return gaps;
}

describe('chests on the seabed', () => {
  const chests = createChests(THREE, new Set<string>());
  const groups = new Map(chests.group.children.map((c) => [c.name, c]));

  it('builds one group per catalogued chest', () => {
    expect(chests.all).toHaveLength(DEEP_CHESTS.length);
  });

  it('rests every corner on the sand, on slopes as well as flats', () => {
    // Half a metre on a body 1.24m tall is about the most that still reads as
    // "settled into the sand" rather than "wrong". Before the chests were
    // tilted to the seabed normal, the worst corner here was off by 2.27m.
    for (const spec of DEEP_CHESTS) {
      const gaps = cornerGaps(groups.get(`Chest ${spec.slug}`)!);
      const worst = gaps.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
      expect(
        Math.abs(worst),
        `${spec.slug}: worst corner is ${worst.toFixed(2)}m ${worst > 0 ? 'above' : 'below'} the sand`,
      ).toBeLessThan(0.5);
    }
  });

  it('never leaves a chest hanging clear of the seabed', () => {
    // A chest every corner of which floats is a chest in mid-water, which the
    // corner test alone would allow if the whole thing rose together.
    for (const spec of DEEP_CHESTS) {
      const gaps = cornerGaps(groups.get(`Chest ${spec.slug}`)!);
      expect(Math.min(...gaps), `${spec.slug} hovers`).toBeLessThan(0.3);
    }
  });

  it('keeps the lid shut until it is opened, and opens it past upright', () => {
    // LID_OPEN is deliberately past 90 degrees so an open chest reads as thrown
    // open rather than ajar. The pivot is what carries that.
    const chest = groups.get('Chest reef-crate')!;
    const pivot = chest.children.find((c) => !(c as THREE.Mesh).isMesh)!;
    expect(pivot.rotation.x).toBe(0);

    const handle = chests.all.find((h) => h.slug === 'reef-crate')!;
    handle.openInstantly();
    expect(Math.abs(pivot.rotation.x)).toBeGreaterThan(Math.PI / 2);
  });

  it('arrives already open for a chest found on an earlier dive', () => {
    // The ocean remembering what you found is the whole point of the row.
    const reopened = createChests(THREE, new Set(['kelp-sack']));
    const g = reopened.group.children.find((c) => c.name === 'Chest kelp-sack')!;
    const pivot = g.children.find((c) => !(c as THREE.Mesh).isMesh)!;
    expect(Math.abs(pivot.rotation.x)).toBeGreaterThan(Math.PI / 2);

    const shut = reopened.group.children.find((c) => c.name === 'Chest reef-crate')!;
    const shutPivot = shut.children.find((c) => !(c as THREE.Mesh).isMesh)!;
    expect(shutPivot.rotation.x).toBe(0);
  });
});
