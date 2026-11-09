// Browser half of preview-model.mjs: renders one GLB as a strip of tiles, lit
// by the town's own rig (src/lib/town/three/lighting.ts) — same tone mapping,
// same lights, same pastel IBL. Four turntable angles at rest, then one tile
// per animation clip, posed mid-clip from a front three-quarter view.
//
// The ground and sky colours are stand-ins; the lighting and tone mapping are
// the real ones, and those are what decide how a colour reads in the town.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addTownLights, configureTownRenderer } from '../../../src/lib/town/three/lighting';
import { applyTints } from '../../../src/lib/town/three/authored-registry';

const TILE = 320;
const GRASS = 0x9bd37a;
/** Stand-in colours for tint slots, which ship white: a strawberry land. */
const SAMPLE_TINTS = { tint: 0xf9a8d4, tint2: 0xdb2777 };
const SKY = 0xbfe8ff;

declare global {
  interface Window {
    __look?: { done: boolean; error?: string; tiles?: number; info?: string };
  }
}

async function main(): Promise<void> {
  const url = new URLSearchParams(location.search).get('glb');
  if (!url) throw new Error('missing ?glb=');
  const gltf = await new GLTFLoader().loadAsync(url);
  const clips = gltf.animations;
  const tiles = 4 + clips.length;

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(TILE * tiles, TILE);
  renderer.setScissorTest(true);
  configureTownRenderer(THREE, renderer);
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  const root = gltf.scene;
  applyTints(root, SAMPLE_TINTS, new Map());
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
    }
  });
  scene.add(root);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62;
  addTownLights(THREE, scene, renderer, { centerX: centre.x, centerZ: centre.z, halfU: radius * 2 });

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 6, 48),
    new THREE.MeshStandardMaterial({ color: GRASS, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(32, 1, radius * 0.05, radius * 40);
  const aim = new THREE.Vector3(centre.x, box.min.y + size.y * 0.45, centre.z);
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(16)) * 1.05;
  // `pullback` > 1 frames a clip tile wider: a pose (a hop, raised arms) can
  // leave the rest-pose bounds the framing is computed from.
  const shoot = (tile: number, azimuthDeg: number, pullback = 1): void => {
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    const d = dist * pullback;
    camera.position.set(aim.x + Math.sin(a) * d, aim.y + d * 0.35, aim.z + Math.cos(a) * d);
    camera.lookAt(aim);
    renderer.setViewport(tile * TILE, 0, TILE, TILE);
    renderer.setScissor(tile * TILE, 0, TILE, TILE);
    renderer.render(scene, camera);
  };

  // Front is +Z in three (Blender -Y): 30° is a front three-quarter view.
  [30, 120, 210, 300].forEach((az, i) => shoot(i, az));

  if (clips.length) {
    const mixer = new THREE.AnimationMixer(root);
    clips.forEach((clip, i) => {
      mixer.stopAllAction();
      mixer.clipAction(clip).play();
      mixer.setTime(clip.duration * 0.5);
      shoot(4 + i, 30, 1.3);
    });
  }

  window.__look = {
    done: true,
    tiles,
    info: ['rest 30°', 'rest 120°', 'rest 210°', 'rest 300°', ...clips.map((c) => c.name)].join(' | '),
  };
}

main().catch((e: unknown) => {
  window.__look = { done: true, error: e instanceof Error ? e.message : String(e) };
});
