// buildCupcakeModel is pure geometry, so it runs in vitest's node environment
// against the real three namespace.

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCupcakeModel } from './avatar';
import { PLAIN_CUPCAKE, type CupcakeConfig } from '@/lib/cupcake/config';

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
