// buildCupcakeModel is pure geometry, so it runs in vitest's node environment
// against the real three namespace. three's GLTFLoader cannot run in Node, so
// these build from the code-built parts, and the Blender path is tested with a
// stand-in library plus a read of the shipped GLB through glTF Transform.

import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NodeIO, Logger, getBounds } from '@gltf-transform/core';
import { CUPCAKE_PART_NAMES, HAT_HEIGHT, buildCupcakeModel, installCupcakeArt } from './avatar';
import { PLAIN_CUPCAKE, WRAPPER_COLORS, type CupcakeConfig } from '@/lib/cupcake/config';

function meshesIn(obj: THREE.Object3D | undefined): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  obj?.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

describe('buildCupcakeModel character parts', () => {
  it('the plain cupcake has no hat, glasses or face', () => {
    const { group } = buildCupcakeModel(THREE, PLAIN_CUPCAKE);
    expect(group.getObjectByName('hat')).toBeUndefined();
    expect(group.getObjectByName('glasses')).toBeUndefined();
    expect(group.getObjectByName('face')).toBeUndefined();
  });

  for (const base of ['cupcake', 'cakepop', 'layered'] as const) {
    it(`adds hat, glasses and face meshes on a ${base}`, () => {
      const config: CupcakeConfig = { ...PLAIN_CUPCAKE, base, hat: 'tophat', glasses: 'round', face: 'grin' };
      const { group } = buildCupcakeModel(THREE, config);
      expect(meshesIn(group.getObjectByName('hat')).length).toBeGreaterThan(0);
      expect(meshesIn(group.getObjectByName('glasses')).length).toBeGreaterThan(0);
      expect(meshesIn(group.getObjectByName('face')).length).toBeGreaterThan(0);
    });
  }

  it('builds every hat, glasses and face option', () => {
    for (const hat of ['party', 'beanie', 'tophat', 'wizard', 'crown'] as const) {
      expect(meshesIn(buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, hat }).group.getObjectByName('hat')).length).toBeGreaterThan(0);
    }
    for (const glasses of ['round', 'sunnies', 'heart', 'star'] as const) {
      expect(meshesIn(buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, glasses }).group.getObjectByName('glasses')).length).toBeGreaterThan(0);
    }
    for (const face of ['smile', 'grin', 'wink', 'sleepy', 'silly'] as const) {
      expect(meshesIn(buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, face }).group.getObjectByName('face')).length).toBeGreaterThan(0);
    }
  });

  it('tints the hat with the picked colour', () => {
    const { group } = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, hat: 'party', hatColor: 'ocean' });
    const cone = meshesIn(group.getObjectByName('hat'))[0];
    expect((cone.material as THREE.MeshStandardMaterial).color.getHexString()).toBe(
      new THREE.Color('#2563eb').getHexString(),
    );
  });

  it('lifts the topping above a hat', () => {
    const toppingTop = (config: CupcakeConfig): number => {
      const box = new THREE.Box3().setFromObject(buildCupcakeModel(THREE, config).group);
      return box.max.y;
    };
    const bare = toppingTop({ ...PLAIN_CUPCAKE, topping: 'cherry' });
    const hatted = toppingTop({ ...PLAIN_CUPCAKE, topping: 'cherry', hat: 'tophat' });
    expect(hatted).toBeGreaterThan(bare + 0.25);
  });

  it('applies variety: mini is smaller, tall and fancy add parts', () => {
    const height = (c: CupcakeConfig): number =>
      new THREE.Box3().setFromObject(buildCupcakeModel(THREE, c).group).max.y;
    expect(height({ ...PLAIN_CUPCAKE, variety: 'mini' })).toBeLessThan(height(PLAIN_CUPCAKE));
    expect(height({ ...PLAIN_CUPCAKE, variety: 'tall' })).toBeGreaterThan(height(PLAIN_CUPCAKE));
    expect(buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, variety: 'fancy' }).group.getObjectByName('collar')).toBeDefined();
  });

  it('keeps the variety scale when a caller rescales the returned group', () => {
    const { group } = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, variety: 'mini' });
    group.scale.setScalar(2.4); // what city3d does for a land landmark
    expect(group.children[0].scale.x).toBeCloseTo(0.72);
  });

  it('tracks every geometry and material it creates, for disposal', () => {
    const config: CupcakeConfig = {
      ...PLAIN_CUPCAKE, hat: 'crown', glasses: 'heart', face: 'silly', topping: 'candle', variety: 'fancy',
    };
    const model = buildCupcakeModel(THREE, config);
    for (const m of meshesIn(model.group)) {
      expect(model.geometries).toContain(m.geometry);
      expect(model.materials).toContain(m.material);
    }
  });

  it('builds a legacy five-field config without the new fields', () => {
    const legacy = { base: 'cupcake', wrapper: 'mint', frosting: 'blue', topping: 'star', variety: 'classic' };
    const { group } = buildCupcakeModel(THREE, legacy as unknown as CupcakeConfig);
    expect(meshesIn(group).length).toBeGreaterThan(0);
    expect(group.getObjectByName('hat')).toBeUndefined();
  });
});

describe('buildCupcakeModel from the Blender parts', () => {
  afterEach(() => installCupcakeArt(null));

  /** A stand-in cupcake.glb: one node per part, a white `tint` slot on the
   *  wrapper and a shared atlas material elsewhere, each node away from the
   *  origin the way the sheet lays them out. */
  function standIn(): { root: THREE.Group; atlas: THREE.Material; wrapperGeo: THREE.BufferGeometry } {
    const root = new THREE.Group();
    const atlas = new THREE.MeshStandardMaterial();
    atlas.name = 'cupcake-atlas';
    const tint = new THREE.MeshStandardMaterial({ color: 0xffffff });
    tint.name = 'tint';
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    let wrapperGeo = geo;
    for (const [i, name] of CUPCAKE_PART_NAMES.entries()) {
      const g = name === 'cupcake_wrapper' ? (wrapperGeo = new THREE.BoxGeometry(0.5, 0.42, 0.5)) : geo;
      const mesh = new THREE.Mesh(g, name === 'cupcake_wrapper' || name.startsWith('hat_') ? tint : atlas);
      mesh.name = name;
      mesh.position.set(i, 0, -2);
      root.add(mesh);
    }
    return { root, atlas, wrapperGeo };
  }

  it('clones the library parts and leaves their shared geometry out of the disposal list', () => {
    const { root, atlas, wrapperGeo } = standIn();
    installCupcakeArt(root);
    const model = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, face: 'smile', hat: 'party' });
    const meshes = meshesIn(model.group);
    expect(meshes.some((m) => m.geometry === wrapperGeo)).toBe(true);
    expect(model.geometries).toEqual([]);
    expect(model.materials).not.toContain(atlas);
    // The clone sits at its attach point, not where the sheet left it.
    const wrapper = meshes.find((m) => m.geometry === wrapperGeo)!;
    expect(wrapper.position.toArray()).toEqual([0, 0, 0]);
  });

  it('paints a private copy of each tint slot, so two kids never share a colour', () => {
    installCupcakeArt(standIn().root);
    const a = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, wrapper: 'mint' });
    const b = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, wrapper: 'lemon' });
    const wrapperMat = (m: THREE.Object3D): THREE.MeshStandardMaterial =>
      meshesIn(m).find((x) => (x.material as THREE.Material).name === 'tint')!.material as THREE.MeshStandardMaterial;
    expect(wrapperMat(a.group).color.getHexString()).toBe(new THREE.Color(WRAPPER_COLORS.mint.paper).getHexString());
    expect(wrapperMat(b.group).color.getHexString()).toBe(new THREE.Color(WRAPPER_COLORS.lemon.paper).getHexString());
    expect(a.materials).toContain(wrapperMat(a.group));
    expect(wrapperMat(a.group)).not.toBe(wrapperMat(b.group));
  });

  it('falls back to the code part for a node the library lacks', () => {
    const { root } = standIn();
    root.remove(root.getObjectByName('hat_crown')!);
    installCupcakeArt(root);
    const model = buildCupcakeModel(THREE, { ...PLAIN_CUPCAKE, hat: 'crown' });
    expect(meshesIn(model.group.getObjectByName('hat')).length).toBeGreaterThan(5);
    expect(model.geometries.length).toBeGreaterThan(0);
  });
});

describe('the shipped cupcake.glb', () => {
  const load = async () => {
    const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR));
    return io.readBinary(new Uint8Array(await readFile('public/models/cupcake/cupcake.glb')));
  };

  it('has a node for every part the builder asks for', async () => {
    const names = (await load()).getRoot().listNodes().map((n) => n.getName());
    expect(names.sort()).toEqual([...CUPCAKE_PART_NAMES].sort());
  });

  it('models each hat to the height a topping is lifted by', async () => {
    const doc = await load();
    for (const [hat, height] of Object.entries(HAT_HEIGHT)) {
      const node = doc.getRoot().listNodes().find((n) => n.getName() === `hat_${hat}`)!;
      const top = getBounds(node).max[1] - node.getTranslation()[1];
      expect(top, hat).toBeGreaterThan(height - 0.03);
      expect(top, hat).toBeLessThan(height + 0.03);
    }
  });

  it('stands every body on its origin, so a cupcake sits on the ground', async () => {
    const doc = await load();
    for (const n of doc.getRoot().listNodes()) {
      if (!/^(cupcake|cakepop|layered)_/.test(n.getName())) continue;
      expect(getBounds(n).min[1] - n.getTranslation()[1], n.getName()).toBeGreaterThan(-0.005);
    }
  });
});
