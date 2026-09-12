/**
 * Inspect an authored GLB the way the town's loader will actually see it —
 * world-space bounds after node transforms, not mesh-local accessor min/max.
 *
 * Reading accessor bounds directly is a trap: each POSITION accessor is local to
 * its own node, so unioning them without applying the node hierarchy just
 * measures whichever part happens to be biggest, and silently "confirms" the
 * wrong orientation.
 *
 *   node scripts/assets/inspect-model.mjs public/models/town/land-cottage.glb
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/assets/inspect-model.mjs <file.glb>');
  process.exit(1);
}

const bytes = await readFile(path.resolve(target));
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});

const root = gltf.scene;
const box = new THREE.Box3().setFromObject(root);
const size = new THREE.Vector3();
const centre = new THREE.Vector3();
box.getSize(size);
box.getCenter(centre);

let triangles = 0;
let meshes = 0;
const materials = new Set();
root.traverse((object) => {
  if (!object.isMesh) return;
  meshes++;
  const index = object.geometry.getIndex();
  const position = object.geometry.getAttribute('position');
  triangles += index ? index.count / 3 : position.count / 3;
  for (const m of Array.isArray(object.material) ? object.material : [object.material]) {
    materials.add(m.name || m.uuid);
  }
});

const f = (n) => Number(n.toFixed(3));
const grounded = Math.abs(box.min.y) < 0.01;
const centred = Math.abs(centre.x) < 0.01 && Math.abs(centre.z) < 0.01;

console.log(`file        ${path.relative(process.cwd(), target)}`);
console.log(`bytes       ${bytes.byteLength.toLocaleString()}`);
console.log(`meshes      ${meshes}   materials ${materials.size}   triangles ${triangles}`);
console.log(`size XYZ    ${f(size.x)} x ${f(size.y)} x ${f(size.z)}`);
console.log(`height Y    ${f(size.y)}   (this is what targetHeightU normalises)`);
console.log(`base Y      ${f(box.min.y)}   ${grounded ? 'OK — sits on the ground' : 'off the ground'}`);
console.log(`centre XZ   ${f(centre.x)}, ${f(centre.z)}   ${centred ? 'OK' : 'off-centre'}`);
console.log('');
// Orientation is judged by which axis the model is TALL in, not by comparing
// axes — a cottage is legitimately wider than it is tall, so "Y is the largest
// axis" is not the test. Blender is Z-up and glTF is Y-up; if the exporter's
// conversion were skipped, height would land in Z and base Y would be nonsense.
console.log(`up axis     ${grounded ? 'Y (correct — Blender Z-up was converted)' : 'SUSPECT: base is not at Y=0'}`);
// three's Box3.setFromObject transforms each child's local AABB corners, so a
// child rotated 45 degrees about the up axis inflates the reported XZ footprint
// by ~1.41x. Harmless here (height and symmetry are unaffected) but do not read
// the XZ numbers as a true footprint.
console.log('note        XZ is a conservative AABB; rotated children inflate it (~1.41x at 45°)');
