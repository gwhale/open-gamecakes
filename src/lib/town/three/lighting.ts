// The town's renderer settings and light rig, in one place.
//
// The engine uses this, and so does scripts/assets/preview-model.mjs, which
// renders an authored GLB the way the town will show it. Blender's own preview
// (Cycles, AgX) is a geometry check; it cannot tell you what a colour looks
// like under ACES and this pastel IBL. Keeping one copy of the rig is what
// stops the look preview from drifting away from the game.
//
// Follows the town convention: no runtime `three` import, types only; the
// caller passes the namespace in.

import type * as THREE from 'three';
import type { ThreeNS } from './types';

export function configureTownRenderer(THREE: ThreeNS, renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  // Soft PCF (was hard PCFShadowMap) so shadow edges read cozy, not crisp —
  // shadow.radius below blurs them. Tablet-cheap (same single shadow pass).
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export interface TownLights {
  ambient: THREE.AmbientLight;
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** PMREM env-map target behind scene.environment. Caller disposes it. */
  envRT: THREE.WebGLRenderTarget;
}

export interface TownLightsFrame {
  /** Scene-space point the sun and its shadow frustum aim at. */
  centerX: number;
  centerZ: number;
  /** Half the extent the shadow frustum must cover, in scene units. */
  halfU: number;
}

/** Adds the ambient + hemisphere + sun rig and the pastel PMREM environment to
 *  `scene`. weather.ts later crossfades these lights' intensities. */
export function addTownLights(
  THREE: ThreeNS,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  { centerX, centerZ, halfU }: TownLightsFrame,
): TownLights {
  // Ambient trimmed (0.72 → 0.55) because the HemisphereLight below now supplies
  // the fill; together they read warmer and give shadows a cozy tint instead of
  // a flat grey. The warm sun stays the key light.
  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  // Warm sky / faint-strawberry ground fill so undersides catch a soft candy
  // bounce (edible-diorama softness, tablet-cheap — no extra shadow pass).
  const hemi = new THREE.HemisphereLight(0xfff4e0, 0xffd9e0, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.0);
  // Aim the sun (and its shadow frustum) at the spread city's center.
  sun.position.set(centerX - 8, 20, centerZ + 6);
  sun.target.position.set(centerX, 0, centerZ);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 4; // soft, cozy shadow edges (needs PCFSoftShadowMap above)
  {
    const sc = sun.shadow.camera;
    sc.near = 1;
    sc.far = 80;
    sc.left = -halfU - 3;
    sc.right = halfU + 3;
    sc.top = halfU + 3;
    sc.bottom = -halfU - 3;
  }
  scene.add(sun);

  // ---------- Soft image-based lighting (pastel env map) ----------
  // A one-time PMREM bake of a tiny pastel gradient dome → scene.environment, so
  // every MeshStandardMaterial (candy, frosting, water) picks up soft, warm IBL
  // specular instead of reading matte-flat. Runtime-free after the bake; the env
  // render target is disposed in teardown. Only affects material reflections —
  // scene.background is untouched here (the skydome is a separate change).
  const envRT = ((): THREE.WebGLRenderTarget => {
    const envScene = new THREE.Scene();
    const g = new THREE.SphereGeometry(1, 24, 16);
    const top = new THREE.Color(0xfff4e0); // cream (overhead)
    const mid = new THREE.Color(0xffd9e8); // strawberry-cream (horizon)
    const bot = new THREE.Color(0xbfe8ff); // soft sky blue (below)
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i); // −1..1 on the unit sphere
      if (y >= 0) c.copy(mid).lerp(top, y);
      else c.copy(mid).lerp(bot, -y);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    const dome = new THREE.Mesh(g, m);
    envScene.add(dome);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(envScene, 0.04);
    pmrem.dispose();
    g.dispose();
    m.dispose();
    return rt;
  })();
  scene.environment = envRT.texture;

  return { ambient, hemi, sun, envRT };
}
