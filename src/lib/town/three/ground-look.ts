// What the town's ground looks like, shared by the terrain and the grass on it so
// a tuft matches the patch it grows from.
//
// ground-noise.png (art/blender/land-normals.py) holds R broad patches, G mid-size
// mottling and B crumbs. It tiles every GROUND_NOISE_TILE_U scene units, long enough
// that the repeat never shows from the chase camera.
//
// No runtime `three` import, as elsewhere in the town.

import type * as THREE from 'three';
import type { ThreeNS } from './types';

export const GROUND_NOISE_TILE_U = 46;
/** Second, finer read of the same texture on the high tier. Not a multiple of the
 *  tile above, so the two never line up. */
export const GROUND_DETAIL_TILE_U = 9.7;

export function loadGroundNoise(THREE: ThreeNS, renderer: THREE.WebGLRenderer): THREE.Texture {
  const tex = new THREE.TextureLoader().load('/textures/town/ground-noise.png');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/** GLSL: colour multiplier for grass, from the noise's R channel. Darker, lusher
 *  hollows through to dry, yellower patches. */
export const GRASS_PATCH_GLSL = `
vec3 grassPatchTint( float n ) {
  vec3 lush = mix( vec3( 0.8, 0.9, 0.74 ), vec3( 1.0 ), smoothstep( 0.22, 0.46, n ) );
  return lush * mix( vec3( 1.0 ), vec3( 1.24, 1.08, 0.68 ), smoothstep( 0.44, 0.7, n ) * 0.8 );
}`;

/** How much of the terrain's bare ground shows on a slope (0 gentle, 1 steep), from
 *  the up component of its normal. Hills stay grassy; the mountain's sides don't. */
export function slopeSoil(normalUp: number): number {
  const t = (1 - normalUp - 0.04) / 0.14;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Soft occlusion for a terrain point from how far it sits below its neighbours'
 *  average height, in scene units. 1 is open, and a deep hollow bottoms out at 0. */
export function hollowOcclusion(heightU: number, neighbourAvgU: number): number {
  const below = neighbourAvgU - heightU;
  const t = 1 - below / 0.5;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
