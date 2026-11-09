/**
 * Measure an authored GLB the way the town's loader will see it.
 *
 * Uses glTF Transform rather than three's GLTFLoader because GLTFLoader decodes
 * textures through DOM image APIs and throws in Node the moment a model carries
 * one — and every shipped asset now carries its palette atlas.
 *
 * Bounds are WORLD-space, after node transforms (getBounds walks the scene).
 * Reading each POSITION accessor's min/max directly is a trap: those are local
 * to their own node, so unioning them silently measures the wrong shape.
 */
import { readFile } from 'node:fs/promises';
import { NodeIO, ImageUtils, Logger, getBounds } from '@gltf-transform/core';

const TRIANGLES = 4;

export async function measureModel(file) {
  const bytes = await readFile(file);
  // An LFS pointer under public/ is the classic Vercel failure: a ~130-byte
  // text file where the model should be. Name it rather than failing to parse.
  if (bytes.subarray(0, 4).toString('latin1') !== 'glTF') {
    const head = bytes.subarray(0, 60).toString('latin1');
    throw new Error(
      head.startsWith('version https://git-lfs')
        ? 'is a Git LFS pointer, not a GLB (runtime assets must not be LFS-tracked)'
        : 'is not a binary glTF (.glb)',
    );
  }

  // Needle's vendor extensions are expected on the game dome; only errors matter.
  const io = new NodeIO().setLogger(new Logger(Logger.Verbosity.ERROR));
  const doc = await io.readBinary(new Uint8Array(bytes));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];

  let triangles = 0;
  let drawCalls = 0;
  let meshNodes = 0;
  const materials = new Set();
  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    meshNodes++;
    for (const prim of mesh.listPrimitives()) {
      // One primitive is one draw call in three (each becomes its own Mesh).
      drawCalls++;
      if (prim.getMaterial()) materials.add(prim.getMaterial());
      if (prim.getMode() !== TRIANGLES) continue;
      const indices = prim.getIndices();
      triangles += (indices ?? prim.getAttribute('POSITION')).getCount() / 3;
    }
  });

  const textures = root.listTextures().map((t) => {
    const size = ImageUtils.getSize(t.getImage(), t.getMimeType());
    return { name: t.getName(), mimeType: t.getMimeType(), size: size ?? [0, 0] };
  });

  const { min, max } = getBounds(scene);
  const size = max.map((v, i) => v - min[i]);
  const centre = max.map((v, i) => (v + min[i]) / 2);

  return {
    bytes: bytes.byteLength,
    meshNodes,
    drawCalls,
    materials: materials.size,
    // Per-instance colour slots (art/blender/gamecakes.py TINT_SLOTS): plain
    // white materials the town swaps for a coloured copy by name.
    tintSlots: [...materials].filter((mat) => /^tint2?$/.test(mat.getName())).length,
    triangles,
    textures,
    animations: root.listAnimations().length,
    skins: root.listSkins().length,
    size: { x: size[0], y: size[1], z: size[2] },
    baseY: min[1],
    centreXZ: { x: centre[0], z: centre[2] },
  };
}
