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
import { WORLD } from '@/lib/games/theme/palette';

export function configureTownRenderer(THREE: ThreeNS, renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
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

export interface LightRig {
  ambient: number;
  hemi: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  sunColor: number;
  /** scene.environmentIntensity, the weight of the baked environment. */
  env: number;
  envTop: number;
  envHorizon: number;
  envBelow: number;
  shadowRadius: number;
}

/** Unit vector from the ground toward the sun. Low enough that shadows have
 *  length, and behind the default camera's shoulder so forms are lit from the side. */
export const SUN_DIR = (() => {
  const x = -0.5, y = 0.72, z = 0.48;
  const len = Math.hypot(x, y, z);
  return { x: x / len, y: y / len, z: z / len };
})();

/**
 * The town's light. The balance is what matters. Three's lights are physical, so
 * a sun of 1 adds about 0.32 x albedo while an environment at weight 1 adds about
 * 0.9 x albedo everywhere, including inside every shadow. The environment has to
 * come down for shadows and form to show at all.
 */
export const TOWN_RIG: LightRig = {
  ambient: 0.15,
  hemi: 0.8,
  hemiSky: WORLD.SKY_MID,
  hemiGround: WORLD.LIGHT_BOUNCE,
  sun: 3,
  sunColor: WORLD.SUN,
  env: 0.4,
  envTop: WORLD.SKY_ZENITH,
  envHorizon: WORLD.SKY_HORIZON,
  envBelow: WORLD.LIGHT_BOUNCE,
  shadowRadius: 2.5,
};

/** The older pastel balance, for scenes that are not the town (Musical Planets). */
export const SOFT_RIG: LightRig = {
  ambient: 0.55,
  hemi: 0.5,
  hemiSky: 0xfff4e0,
  hemiGround: 0xffd9e0,
  sun: 1,
  sunColor: 0xfff4e0,
  env: 1,
  envTop: 0xfff4e0,
  envHorizon: 0xffd9e8,
  envBelow: 0xbfe8ff,
  shadowRadius: 4,
};

/**
 * The nearest point to (x, z) that lies on the shadow map's texel grid. A moving
 * shadow camera otherwise resamples every edge at a new sub-texel offset, which
 * reads as shimmering. The grid lies in the light's own plane, so the point is
 * snapped along the light's axes and not along world X and Z.
 */
export function snapToShadowTexel(
  x: number,
  z: number,
  dir: { x: number; y: number; z: number },
  texelU: number,
): { x: number; y: number; z: number } {
  const rLen = Math.hypot(dir.z, dir.x);
  const r = { x: dir.z / rLen, y: 0, z: -dir.x / rLen }; // world up x dir
  const u = {
    x: dir.y * r.z - dir.z * r.y,
    y: dir.z * r.x - dir.x * r.z,
    z: dir.x * r.y - dir.y * r.x,
  }; // dir x r
  const along = x * dir.x + z * dir.z;
  const a = Math.round((x * r.x + z * r.z) / texelU) * texelU;
  const b = Math.round((x * u.x + z * u.z) / texelU) * texelU;
  return {
    x: r.x * a + u.x * b + dir.x * along,
    y: r.y * a + u.y * b + dir.y * along,
    z: r.z * a + u.z * b + dir.z * along,
  };
}

/** Half-width of the shadow frustum for a camera `distU` from what it looks at.
 *  Stepped, because changing the width moves every texel. */
export function shadowHalfForDistance(distU: number, baseHalfU: number): number {
  const need = distU * 1.15;
  for (const step of [1, 1.5, 2.25, 3.4]) {
    if (baseHalfU * step >= need) return baseHalfU * step;
  }
  return baseHalfU * 3.4;
}

/** Adds the ambient + hemisphere + sun rig and the PMREM environment to `scene`.
 *  weather.ts later crossfades these intensities. */
export function addTownLights(
  THREE: ThreeNS,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  { centerX, centerZ, halfU }: TownLightsFrame,
  rig: LightRig = TOWN_RIG,
): TownLights {
  const ambient = new THREE.AmbientLight(0xffffff, rig.ambient);
  scene.add(ambient);
  // Sky and bounced-ground fill, so undersides catch soft colour (no extra shadow pass).
  const hemi = new THREE.HemisphereLight(rig.hemiSky, rig.hemiGround, rig.hemi);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(rig.sunColor, rig.sun);
  // Aim the sun (and its shadow frustum) at the frame's centre. The town then
  // moves both with the view; see the engine's followSun.
  sun.position.set(centerX + SUN_DIR.x * 28, SUN_DIR.y * 28, centerZ + SUN_DIR.z * 28);
  sun.target.position.set(centerX, 0, centerZ);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = rig.shadowRadius; // needs PCFSoftShadowMap above
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
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

  // ---------- Image-based lighting ----------
  // A one-time PMREM bake of a tiny gradient dome → scene.environment, so every
  // MeshStandardMaterial (candy, frosting, water) reflects a sky instead of
  // reading matte-flat. Runtime-free after the bake; the env render target is
  // disposed in teardown. scene.background is untouched here.
  const envRT = ((): THREE.WebGLRenderTarget => {
    const envScene = new THREE.Scene();
    const g = new THREE.SphereGeometry(1, 24, 16);
    const top = new THREE.Color(rig.envTop);
    const mid = new THREE.Color(rig.envHorizon);
    const bot = new THREE.Color(rig.envBelow);
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
  scene.environmentIntensity = rig.env;

  return { ambient, hemi, sun, envRT };
}
