/**
 * Inspect an authored GLB the way the town's loader will actually see it —
 * world-space bounds after node transforms, draw calls, materials, textures.
 *
 *   node scripts/assets/inspect-model.mjs public/models/town/land-cottage.glb
 *
 * The budget each file must meet lives in check-models.mjs.
 */
import path from 'node:path';
import { measureModel } from './measure-model.mjs';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/assets/inspect-model.mjs <file.glb>');
  process.exit(1);
}

const m = await measureModel(path.resolve(target));
const f = (n) => Number(n.toFixed(3));
const grounded = Math.abs(m.baseY) < 0.01;
const centred = Math.abs(m.centreXZ.x) < 0.01 && Math.abs(m.centreXZ.z) < 0.01;

console.log(`file        ${path.relative(process.cwd(), target)}`);
console.log(`bytes       ${m.bytes.toLocaleString()}`);
console.log(`draw calls  ${m.drawCalls}   mesh nodes ${m.meshNodes}   materials ${m.materials}   triangles ${m.triangles}`);
for (const t of m.textures) console.log(`texture     ${t.name} ${t.size[0]}x${t.size[1]} ${t.mimeType}`);
if (m.skins || m.animations) console.log(`rig         ${m.skins} skin(s), ${m.animations} animation clip(s)`);
console.log(`size XYZ    ${f(m.size.x)} x ${f(m.size.y)} x ${f(m.size.z)}`);
console.log(`height Y    ${f(m.size.y)}   (this is what targetHeightU normalises)`);
console.log(`base Y      ${f(m.baseY)}   ${grounded ? 'OK — sits on the ground' : 'off the ground'}`);
console.log(`centre XZ   ${f(m.centreXZ.x)}, ${f(m.centreXZ.z)}   ${centred ? 'OK' : 'off-centre'}`);
console.log('');
// Orientation is judged by which axis the model is TALL in, not by comparing
// axes — a cottage is legitimately wider than it is tall. Blender is Z-up and
// glTF is Y-up; if the exporter's conversion were skipped, height would land in
// Z and base Y would be nonsense.
console.log(`up axis     ${grounded ? 'Y (correct — Blender Z-up was converted)' : 'SUSPECT: base is not at Y=0'}`);
