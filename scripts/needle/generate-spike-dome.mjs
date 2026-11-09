import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter uses FileReader in browsers. Node has Blob but not FileReader.
class NodeFileReader {
  result = null;
  onloadend = null;
  onerror = null;

  readAsArrayBuffer(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        this.result = value;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }

  readAsDataURL(blob) {
    blob
      .arrayBuffer()
      .then((value) => {
        const base64 = Buffer.from(value).toString('base64');
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
        this.onloadend?.();
      })
      .catch((error) => this.onerror?.(error));
  }
}

globalThis.FileReader ??= NodeFileReader;

// Single source of truth for this dome's identity: it is written into the GLB as
// a real Needle component AND into the manifest the validator checks. Values are
// literals (never derived from time/random) so the GLB hashes reproducibly.
const DOME_IDENTITY = {
  stableId: 'dome-cookie-corner-word-memory',
  regionSlug: 'cookie-corner',
  gameSlug: 'word-memory',
};
const DOME_COMPONENT_TYPE = 'GameDome';
const DOME_NODE_NAME = `${DOME_COMPONENT_TYPE}__${DOME_IDENTITY.regionSlug}__${DOME_IDENTITY.gameSlug}`;

const scene = new THREE.Scene();
scene.name = 'GameDomeSpikeScene';

const root = new THREE.Group();
root.name = DOME_NODE_NAME;
scene.add(root);

const cakeMaterial = new THREE.MeshStandardMaterial({
  name: 'CakeBase',
  color: 0xf6c27a,
  roughness: 0.72,
  metalness: 0,
});
const frostingMaterial = new THREE.MeshStandardMaterial({
  name: 'StrawberryFrosting',
  color: 0xff7eb6,
  roughness: 0.38,
  metalness: 0,
});
const trimMaterial = new THREE.MeshStandardMaterial({
  name: 'PortalTrim',
  color: 0x7ee9ff,
  emissive: 0x1b7185,
  emissiveIntensity: 0.65,
  roughness: 0.24,
});
const doorMaterial = new THREE.MeshStandardMaterial({
  name: 'PortalDoor',
  color: 0x512f7d,
  emissive: 0x251044,
  emissiveIntensity: 0.45,
  roughness: 0.4,
});

const base = new THREE.Mesh(
  new THREE.CylinderGeometry(2.55, 2.8, 2.5, 32, 1),
  cakeMaterial,
);
base.name = 'DomeBase';
base.position.y = 1.25;
base.castShadow = true;
base.receiveShadow = true;
root.add(base);

const frosting = new THREE.Mesh(
  new THREE.SphereGeometry(2.72, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2),
  frostingMaterial,
);
frosting.name = 'UnlockedVisual';
frosting.position.y = 2.5;
frosting.scale.y = 0.78;
frosting.castShadow = true;
root.add(frosting);

const portalAnchor = new THREE.Group();
portalAnchor.name = 'PortalAnchor';
portalAnchor.position.set(0, 1.25, 2.55);
root.add(portalAnchor);

const portalDoor = new THREE.Mesh(new THREE.CircleGeometry(0.92, 32), doorMaterial);
portalDoor.name = 'PortalDoor';
portalAnchor.add(portalDoor);

const portalTrim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.14, 12, 32), trimMaterial);
portalTrim.name = 'HighlightTarget';
portalTrim.position.z = 0.03;
portalAnchor.add(portalTrim);

const badgeAnchor = new THREE.Group();
badgeAnchor.name = 'CompletionBadgeAnchor';
badgeAnchor.position.set(0, 4.5, 0);
root.add(badgeAnchor);

const rewardAnchor = new THREE.Group();
rewardAnchor.name = 'RewardAnchor';
rewardAnchor.position.set(0, 0.4, 3.2);
root.add(rewardAnchor);

const interactionAnchor = new THREE.Group();
interactionAnchor.name = 'InteractionAnchor';
interactionAnchor.position.set(0, 0, 2.9);
root.add(interactionAnchor);

scene.traverse((object) => {
  if (object !== scene) object.updateMatrix();
});

// Needle instantiates components from the NEEDLE_components glTF extension —
// NOT from userData/extras. Writing identity into extras (the previous approach)
// produced a GLB that loaded fine and silently attached nothing, which is why
// the host had to hardcode the dome and hand-roll a raycast.
//
// Schema, per node, verified against
// node_modules/@needle-tools/engine/src/engine/extensions/NEEDLE_components.ts:
//   nodes[i].extensions.NEEDLE_components.builtin_components = [{ name, guid, ...fields }]
// Fields are assigned flat onto the instance. The extension must also appear in
// extensionsUsed — the loader gates on parser.extensions[name] === true.
//
// highlightTarget is deliberately NOT serialized: GameDome falls back to
// getObjectByName('HighlightTarget'), and that node is guaranteed by the
// required-node contract the validator enforces. Avoids glTF pointer refs.
const NEEDLE_COMPONENTS_EXTENSION = 'NEEDLE_components';

const exporter = new GLTFExporter();
exporter.register((writer) => ({
  name: NEEDLE_COMPONENTS_EXTENSION,
  writeNode(object, nodeDef) {
    if (object !== root) return;
    nodeDef.extensions ??= {};
    nodeDef.extensions[NEEDLE_COMPONENTS_EXTENSION] = {
      builtin_components: [
        {
          name: DOME_COMPONENT_TYPE,
          // Stable literal guid — a generated one would break hash determinism.
          guid: `gamecakes-${DOME_IDENTITY.stableId}`,
          ...DOME_IDENTITY,
          interactionRadius: 3.25,
        },
      ],
    };
    writer.extensionsUsed[NEEDLE_COMPONENTS_EXTENSION] = true;
  },
}));

const binary = await new Promise((resolve, reject) => {
  exporter.parse(scene, resolve, reject, {
    binary: true,
    onlyVisible: true,
    trs: false,
  });
});

if (!(binary instanceof ArrayBuffer)) {
  throw new Error('Expected GLTFExporter to produce a binary GLB.');
}

const outputDir = path.resolve('public/needle/scenes');
const outputFile = path.join(outputDir, 'game-dome-spike.glb');
const manifestFile = path.join(outputDir, 'game-dome-spike.manifest.json');
const bytes = Buffer.from(binary);
const sha256 = createHash('sha256').update(bytes).digest('hex');

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, bytes);
await writeFile(
  manifestFile,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      asset: 'game-dome-spike.glb',
      sha256,
      bytes: bytes.byteLength,
      source: 'scripts/needle/generate-spike-dome.mjs',
      component: {
        type: DOME_COMPONENT_TYPE,
        ...DOME_IDENTITY,
      },
      // Asserted against the GLB's extensionsUsed by validate-assets.mjs, so a
      // regression back to extras-only export fails the build instead of
      // silently shipping a dome that attaches no component.
      requiresExtension: NEEDLE_COMPONENTS_EXTENSION,
      requiredNodes: [
        DOME_NODE_NAME,
        'DomeBase',
        'UnlockedVisual',
        'PortalAnchor',
        'HighlightTarget',
        'InteractionAnchor',
        'CompletionBadgeAnchor',
        'RewardAnchor',
      ],
      budgets: {
        maxBytes: 500000,
        maxMeshes: 4,
        maxMaterials: 4,
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${path.relative(process.cwd(), outputFile)} (${bytes.byteLength} bytes)`);
