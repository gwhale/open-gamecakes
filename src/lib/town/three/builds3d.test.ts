// The build layer draws every placed piece as instances of a few shared
// meshes, and a road square as a centre patch plus one arm per road neighbour.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBuildLayer } from './builds3d';
import type { TownBuild } from '@/lib/town/builds';

const piece = (id: string, kind: TownBuild['kind'], gx: number, gy: number): TownBuild => ({
  id,
  kid_id: 'k',
  kind,
  gx,
  gy,
  rot: 0,
  created_at: new Date(0).toISOString(),
});

function instanced(layer: ReturnType<typeof createBuildLayer>): THREE.InstancedMesh[] {
  return layer.group.children.filter((c): c is THREE.InstancedMesh => (c as THREE.InstancedMesh).isInstancedMesh);
}
const total = (layer: ReturnType<typeof createBuildLayer>): number =>
  instanced(layer).reduce((n, m) => n + m.count, 0);

describe('createBuildLayer', () => {
  it('draws a straight run of three road squares as 3 patches + 4 arms', () => {
    const layer = createBuildLayer(THREE, () => 0, true);
    layer.setBuilds([piece('a', 'road', 0, 0), piece('b', 'road', 1, 0), piece('c', 'road', 2, 0)]);
    // Ends have one arm each, the middle two: 1 + 2 + 1.
    expect(total(layer)).toBe(3 + 4);
    layer.dispose();
  });

  it('uses the same meshes however many pieces there are', () => {
    const layer = createBuildLayer(THREE, () => 0, true);
    layer.setBuilds([piece('h1', 'house', 0, 0)]);
    const meshes = instanced(layer).length;
    const many = Array.from({ length: 50 }, (_, i) => piece(`h${i}`, 'house', i, 3));
    layer.setBuilds(many);
    expect(instanced(layer).length).toBe(meshes);
    expect(Math.max(...instanced(layer).map((m) => m.count))).toBe(50);
    layer.dispose();
  });

  it('removes pieces that leave the list', () => {
    const layer = createBuildLayer(THREE, () => 0, true);
    layer.setBuilds([piece('t', 'tree', 0, 0), piece('l', 'lamp', 2, 0)]);
    const both = total(layer);
    layer.setBuilds([piece('t', 'tree', 0, 0)]);
    expect(total(layer)).toBeLessThan(both);
    layer.setBuilds([]);
    expect(total(layer)).toBe(0);
    layer.dispose();
  });

  it('shows the ghost only while one is set', () => {
    const layer = createBuildLayer(THREE, () => 0, true);
    const ghost = layer.group.children.find((c) => c.type === 'Group')!;
    layer.setGhost({ kind: 'bench', gx: 1, gy: 1, rot: 1, ok: true });
    expect(ghost.visible).toBe(true);
    expect(ghost.children.length).toBeGreaterThan(1);
    layer.setGhost({ kind: 'remove', gx: 1, gy: 1, rot: 0, ok: false });
    expect(ghost.children.length).toBe(1); // just the square
    layer.setGhost(null);
    expect(ghost.visible).toBe(false);
    layer.dispose();
  });

  it("draws a loaded GLB's meshes, and lights the lamp's tint slot as its bulb", () => {
    // A stand-in for the lamp GLB: the atlas mesh plus the `tint` bulb mesh.
    const atlas = new THREE.MeshStandardMaterial({ name: 'build-lamp-atlas' });
    const tint = new THREE.MeshStandardMaterial({ name: 'tint' });
    const lamp = new THREE.Group();
    lamp.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.1), atlas));
    lamp.add(new THREE.Mesh(new THREE.SphereGeometry(0.13), tint));
    const art = {
      ready: Promise.resolve(),
      has: (key: string) => key === 'build-lamp',
      take: (key: string) => (key === 'build-lamp' ? lamp.clone(true) : null),
      dispose: () => {},
    };
    const layer = createBuildLayer(THREE, () => 0, true, art);
    layer.setBuilds([piece('l', 'lamp', 0, 0)]);
    const used = instanced(layer).filter((m) => m.count > 0);
    expect(used).toHaveLength(2);
    expect(used.some((m) => m.material === atlas)).toBe(true);
    const bulb = used.find((m) => m.material !== atlas)!.material as THREE.MeshStandardMaterial;
    expect(bulb).not.toBe(tint);
    expect(bulb.emissiveIntensity).toBeGreaterThan(0);
    layer.dispose();
  });
});
