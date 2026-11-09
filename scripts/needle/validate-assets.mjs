import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('public/needle/scenes');
const manifestPath = path.join(root, 'game-dome-spike.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const assetPath = path.join(root, manifest.asset);
const bytes = await readFile(assetPath);
const assetStat = await stat(assetPath);
const errors = [];
const jsonChunkLength = bytes.readUInt32LE(12);
const jsonChunkType = bytes.subarray(16, 20).toString('utf8');
const gltf =
  jsonChunkType === 'JSON'
    ? JSON.parse(bytes.subarray(20, 20 + jsonChunkLength).toString('utf8').trim())
    : null;

if (manifest.schemaVersion !== 1) errors.push('Unsupported manifest schema.');
if (assetStat.size !== manifest.bytes) errors.push('Manifest byte count is stale.');
if (assetStat.size > manifest.budgets.maxBytes) errors.push('Asset exceeds its byte budget.');
if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) {
  errors.push('Asset SHA-256 does not match its manifest.');
}
if (bytes.subarray(0, 4).toString('utf8') !== 'glTF') errors.push('Asset is not a GLB.');
if (!gltf) errors.push('GLB has no JSON scene chunk.');
if (!Array.isArray(manifest.requiredNodes) || manifest.requiredNodes.length === 0) {
  errors.push('Manifest has no required node contract.');
}
if (!manifest.component?.stableId || !manifest.component?.regionSlug || !manifest.component?.gameSlug) {
  errors.push('GameDome identity is incomplete.');
}
if (gltf) {
  const nodeNames = new Set((gltf.nodes ?? []).map((node) => node.name));
  for (const name of manifest.requiredNodes) {
    if (!nodeNames.has(name)) errors.push(`Required node is missing: ${name}`);
  }

  // The component contract is the whole point of the spike: a GLB that loads but
  // attaches no Needle component is a silent failure that only shows up as a
  // console warning at runtime. Assert it structurally instead.
  const extension = manifest.requiresExtension;
  if (extension) {
    if (!(gltf.extensionsUsed ?? []).includes(extension)) {
      errors.push(`GLB does not declare ${extension} in extensionsUsed.`);
    }
    const componentNodes = (gltf.nodes ?? []).filter(
      (node) => node.extensions?.[extension]?.builtin_components?.length,
    );
    if (componentNodes.length === 0) {
      errors.push(`No node carries ${extension}.builtin_components.`);
    }
    const declared = componentNodes
      .flatMap((node) => node.extensions[extension].builtin_components)
      .find((component) => component?.name === manifest.component.type);
    if (!declared) {
      errors.push(`No ${manifest.component.type} component is attached in the GLB.`);
    } else {
      for (const field of ['stableId', 'regionSlug', 'gameSlug']) {
        if (declared[field] !== manifest.component[field]) {
          errors.push(
            `Component ${field} drifted: GLB has ${declared[field]}, manifest has ${manifest.component[field]}.`,
          );
        }
      }
    }
  }
  if ((gltf.meshes?.length ?? 0) > manifest.budgets.maxMeshes) {
    errors.push('Asset exceeds its mesh budget.');
  }
  if ((gltf.materials?.length ?? 0) > manifest.budgets.maxMaterials) {
    errors.push('Asset exceeds its material budget.');
  }
}

if (errors.length) {
  for (const error of errors) console.error(`Needle asset error: ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Needle assets valid: ${manifest.asset}, ${assetStat.size} bytes, ${manifest.requiredNodes.length} required nodes.`,
  );
}
