// Live grass: the blades around the player, with the path they walked pressed
// into it for half a minute.
//
// The whole island cannot carry real blades (a tablet would draw millions), so
// one InstancedMesh of Blender tufts (art/blender/grass-tuft.py) covers a
// square patch that travels with the player. Each tuft owns a fixed spot in a
// PATCH_U-sized tile; the tile repeats across the world and every tuft is drawn
// in the copy nearest the player. A tuft is re-placed only when the player
// crosses far enough that it wraps to the opposite edge, so walking re-places a
// thin strip per frame, not the patch. Tufts fade out toward the patch edge, so
// the patch reads as a soft circle of grass over the painted ground.
//
// Under the patch, a sparser CARPET of the same tufts covers the green of every
// island, so grass reads from any zoom and on whichever island the player is
// not on. It is placed once, in square chunks (one InstancedMesh each) so the
// renderer can skip the chunks that are off screen. It shares the patch's
// shader, so it sways and keeps the trail too.
//
// Everything that MOVES is in the vertex shader, so it costs nothing on the CPU:
//   * wind  — a two-wave sway, phase-shifted across the field (off under
//             reduced motion; the field then stands still);
//   * push  — blades within a step of the cupcake lean away from it;
//   * trail — blades the player walked over lie flat along the walking
//             direction, hold for TRAIL_HOLD_S, then spring back up by
//             TRAIL_LIFE_S.
//
// The trail is a world-sized RGBA8 texture: RG is the 16-bit time a cell was
// last walked over (in 1/8 s, 0 = never), BA the walking direction. Stamping
// touches a few cells and uploads only those rows (Texture.addUpdateRange), and
// a queue clears each cell after it expires, so a non-zero cell is always
// younger than TRAIL_LIFE_S. That is what makes the 16-bit clock safe to wrap.
//
// Follows the town convention: no runtime `three` import, types only.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { GRASS_PATCH_GLSL, GROUND_NOISE_TILE_U } from './ground-look';
import { cloneMaterial } from './materials';

/** Seconds a walked-over blade stays flat before it starts to recover. */
export const TRAIL_HOLD_S = 24;
/** Seconds after which it is fully upright again (the trail's lifetime). */
export const TRAIL_LIFE_S = 30;
/** Trail texture cell size, scene units. About a cupcake-foot wide. */
export const TRAIL_CELL_U = 0.3;
/** Stamp radius in cells (a ~0.9u wide path). */
const STAMP_R = 1.5;
/** Clock ticks per second in the trail texture's 16-bit stamp. */
const TICKS_PER_S = 8;
const TICK_WRAP = 65535;

/** Which copy of the tile tuft `o` (its fixed spot in the tile) is drawn in,
 *  for a player at `c`: the copy that puts it nearest the player, so it lands
 *  at `o + copy * patchU`, within half a patch of `c`. The caller skips tufts
 *  whose copy has not changed. */
export function patchCopy(o: number, c: number, patchU: number): number {
  return Math.round((c - o) / patchU);
}

/** The 16-bit stamp for time `tS`. Never 0, which means "never walked". */
export function stampCode(tS: number): number {
  return 1 + (Math.floor(tS * TICKS_PER_S) % TICK_WRAP);
}

/** Seconds since `code` was stamped, given the current code (mirrors the shader). */
export function stampAgeS(nowCode: number, code: number): number {
  return (((nowCode - code) % TICK_WRAP) + TICK_WRAP) % TICK_WRAP / TICKS_PER_S;
}

export interface GrassFieldOpts {
  scene: THREE.Scene;
  /** The tuft's geometry (standing on y = 0) and its material, from the GLB. */
  tuft: { geo: THREE.BufferGeometry; mat: THREE.Material };
  /** Height of the tallest blade, scene units — the shader's 0..1 blade height. */
  tuftHeightU: number;
  /** Number of tufts. */
  count: number;
  /** Side of the square patch around the player, scene units. */
  patchU: number;
  /** The island-wide carpet: one tuft per `spacingU` square, drawn in
   *  `chunkU`-sided chunks. */
  carpet: { spacingU: number; chunkU: number };
  /** Scene-space box the trail texture covers (the whole archipelago). */
  bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Can grass grow here? (On grass, off pads, roads and tracks.) */
  isGrass: (x: number, z: number) => boolean;
  groundY: (x: number, z: number) => number;
  reduceMotion: boolean;
  /** The terrain's ground-noise.png, so tufts match the patch they grow from. Not owned. */
  groundNoise: THREE.Texture;
}

export interface GrassPlayer {
  x: number;
  z: number;
  /** Walking direction (any length; zero when standing still). */
  dirX: number;
  dirZ: number;
  /** True when the player is on the ground and moving: leaves a trail. */
  trailing: boolean;
}

export interface GrassField {
  update(dtMs: number, player: GrassPlayer): void;
  dispose(): void;
}

export function createGrassField(THREE: ThreeNS, opts: GrassFieldOpts): GrassField {
  const { count, patchU, bounds } = opts;

  // ---- Fixed spots in the tile: jittered grid, seeded so it never shuffles ----
  let seed = 20261101 | 0;
  const rng = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const side = Math.ceil(Math.sqrt(count));
  const cell = patchU / side;
  const ox = new Float32Array(count);
  const oz = new Float32Array(count);
  const yaw = new Float32Array(count);
  const scale = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    ox[i] = ((i % side) + rng()) * cell;
    oz[i] = (Math.floor(i / side) + rng()) * cell;
    yaw[i] = rng() * Math.PI * 2;
    scale[i] = 0.75 + rng() * 0.55;
  }
  // The tile copy each tuft was last placed in (NaN = never placed).
  const copyX = new Float64Array(count).fill(NaN);
  const copyZ = new Float64Array(count).fill(NaN);

  // ---- Trail texture ----
  const spanX = bounds.x1 - bounds.x0;
  const spanZ = bounds.z1 - bounds.z0;
  const texW = Math.min(1024, Math.ceil(spanX / TRAIL_CELL_U));
  const texH = Math.min(1024, Math.ceil(spanZ / TRAIL_CELL_U));
  const trailData = new Uint8Array(texW * texH * 4);
  const trailTex = new THREE.DataTexture(trailData, texW, texH, THREE.RGBAFormat, THREE.UnsignedByteType);
  // Nearest: the stamp is an encoded number, so blending two cells is garbage.
  trailTex.magFilter = THREE.NearestFilter;
  trailTex.minFilter = THREE.NearestFilter;
  trailTex.generateMipmaps = false;
  trailTex.needsUpdate = true;
  // Stamped cells, oldest first, so they can be cleared when they expire.
  const expiry: Array<{ idx: number; code: number; at: number }> = [];
  let expiryHead = 0;

  // ---- Material: the GLB's, plus the motion and the colour ramp ----
  const uniforms = {
    uTime: { value: 0 },
    uNowCode: { value: 1 },
    uPlayer: { value: new THREE.Vector2() },
    uTrail: { value: trailTex },
    uTrailMin: { value: new THREE.Vector2(bounds.x0, bounds.z0) },
    uTrailSize: { value: new THREE.Vector2(texW * TRAIL_CELL_U, texH * TRAIL_CELL_U) },
    uTuftH: { value: opts.tuftHeightU },
    uWindAmp: { value: opts.reduceMotion ? 0 : 0.16 },
    uGroundNoise: { value: opts.groundNoise },
  };
  /** One material per layer: the same shader and shared uniforms, with its own
   *  fade-out distance from the player (`fade.x` to `fade.y`). */
  const grassMaterial = (fade: THREE.Vector2): THREE.MeshStandardMaterial => {
    const mat = cloneMaterial(opts.tuft.mat) as THREE.MeshStandardMaterial;
    mat.side = THREE.DoubleSide;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms, { uFade: { value: fade } });
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
  uniform float uTime;
  uniform float uNowCode;
  uniform vec2 uPlayer;
  uniform sampler2D uTrail;
  uniform vec2 uTrailMin;
  uniform vec2 uTrailSize;
  uniform float uTuftH;
  uniform float uWindAmp;
  uniform vec2 uFade;
  uniform sampler2D uGroundNoise;
  varying float vGrassH;
  varying float vGrassPress;
  varying float vGrassPatch;`,
        )
        // Light every blade as if it faced the sky, like the ground under it:
        // a one-face strip lit by its own normal flickers dark as it sways.
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
  vec3 gRoot = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
  float gH = clamp( position.y / uTuftH, 0.0, 1.0 );
  float gBend = gH * gH;

  vec4 gTr = texture2D( uTrail, ( gRoot.xz - uTrailMin ) / uTrailSize );
  float gCode = floor( gTr.r * 255.0 + 0.5 ) + floor( gTr.g * 255.0 + 0.5 ) * 256.0;
  float gAge = mod( uNowCode - gCode + ${TICK_WRAP}.0, ${TICK_WRAP}.0 ) / ${TICKS_PER_S}.0;
  float gPress = gCode > 0.5
    ? smoothstep( 0.0, 0.2, gAge ) * ( 1.0 - smoothstep( ${TRAIL_HOLD_S}.0, ${TRAIL_LIFE_S}.0, gAge ) )
    : 0.0;
  vec2 gDir = gTr.ba * ( 255.0 / 127.5 ) - 1.0;

  vec2 gAway = gRoot.xz - uPlayer;
  float gDist = length( gAway );
  float gPush = 1.0 - smoothstep( 0.25, 0.95, gDist );
  gAway = gDist > 0.001 ? gAway / gDist : vec2( 0.0 );

  float gWave = sin( uTime * 1.7 + gRoot.x * 0.43 + gRoot.z * 0.29 ) * 0.6
    + sin( uTime * 2.9 + gRoot.x * 1.1 - gRoot.z * 0.8 ) * 0.25 + 0.3;
  vec2 gOff = ( vec2( 0.8, 0.6 ) * gWave * uWindAmp + gAway * gPush * 0.32 ) * ( 1.0 - gPress ) * gBend * uTuftH
    + gDir * gPress * gH * uTuftH * 0.85;

  float gFade = 1.0 - smoothstep( uFade.x, uFade.y, gDist );
  // Offsets are world-space; the instance matrix is a yaw times a uniform scale,
  // so its inverse is the transpose over the squared scale.
  mat3 gIm = mat3( instanceMatrix );
  vec3 gLocal = transpose( gIm ) * vec3( gOff.x, 0.0, gOff.y ) / dot( gIm[ 0 ], gIm[ 0 ] );
  transformed.y *= mix( 1.0, 0.12, gPress );
  transformed = ( transformed + gLocal ) * gFade;
  vGrassH = gH;
  vGrassPress = gPress;
  vGrassPatch = texture2D( uGroundNoise, gRoot.xz / ${GROUND_NOISE_TILE_U.toFixed(1)} ).r;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
  varying float vGrassH;
  varying float vGrassPress;
  varying float vGrassPatch;
  ${GRASS_PATCH_GLSL}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
  diffuseColor.rgb *= mix( 0.62, 1.16, vGrassH ) * ( 1.0 - 0.4 * vGrassPress ) * grassPatchTint( vGrassPatch );`,
        )
        // DoubleSide flips the normal on a strip's back face; keep it facing up.
        .replace(
          '#include <normal_fragment_begin>',
          `#include <normal_fragment_begin>
  #ifdef DOUBLE_SIDED
  normal *= faceDirection;
  #endif`,
        );
    };
    mat.customProgramCacheKey = () => 'grass-field-v2';
    return mat;
  };

  /** Column-major yaw (about +Y) times a uniform scale, then the translation. */
  const writeMatrix = (a: Float32Array, o: number, x: number, z: number, yawR: number, s: number): void => {
    const c = Math.cos(yawR) * s;
    const n = Math.sin(yawR) * s;
    a[o] = c; a[o + 1] = 0; a[o + 2] = -n; a[o + 3] = 0;
    a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
    a[o + 8] = n; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0;
    a[o + 12] = x; a[o + 13] = opts.groundY(x, z); a[o + 14] = z; a[o + 15] = 1;
  };

  // ---- The carpet: every island's green, placed once, chunked for culling ----
  const carpetMat = grassMaterial(new THREE.Vector2(1e6, 2e6)); // never fades
  const carpetMeshes: THREE.InstancedMesh[] = [];
  {
    const { spacingU, chunkU } = opts.carpet;
    const chunks = new Map<string, number[]>();
    for (let z = bounds.z0; z < bounds.z1; z += spacingU) {
      for (let x = bounds.x0; x < bounds.x1; x += spacingU) {
        // Draw every random number whether or not the spot is grass, so the
        // carpet never reshuffles when a pad or road moves.
        const px = x + rng() * spacingU;
        const pz = z + rng() * spacingU;
        const yawR = rng() * Math.PI * 2;
        const s = 0.75 + rng() * 0.55;
        if (!opts.isGrass(px, pz)) continue;
        const key = `${Math.floor((px - bounds.x0) / chunkU)},${Math.floor((pz - bounds.z0) / chunkU)}`;
        let list = chunks.get(key);
        if (!list) chunks.set(key, (list = []));
        list.push(px, pz, yawR, s);
      }
    }
    for (const list of chunks.values()) {
      const n = list.length / 4;
      const chunk = new THREE.InstancedMesh(opts.tuft.geo, carpetMat, n);
      const a = chunk.instanceMatrix.array as Float32Array;
      for (let i = 0; i < n; i += 1) writeMatrix(a, i * 16, list[i * 4], list[i * 4 + 1], list[i * 4 + 2], list[i * 4 + 3]);
      chunk.instanceMatrix.needsUpdate = true;
      chunk.computeBoundingSphere(); // the chunk's own bounds, so off-screen chunks are culled
      chunk.receiveShadow = true;
      opts.scene.add(chunk);
      carpetMeshes.push(chunk);
    }
  }

  // ---- The patch round the player ----
  const mat = grassMaterial(new THREE.Vector2(patchU * 0.3, patchU * 0.48));
  const mesh = new THREE.InstancedMesh(opts.tuft.geo, mat, count);
  mesh.frustumCulled = false; // the patch moves; its bounds would go stale
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  const m = mesh.instanceMatrix.array as Float32Array;
  m.fill(0); // nothing drawn until the first update places the tufts
  opts.scene.add(mesh);

  const place = (i: number, cx: number, cz: number): void => {
    const kx = patchCopy(ox[i], cx, patchU);
    const kz = patchCopy(oz[i], cz, patchU);
    if (kx === copyX[i] && kz === copyZ[i]) return;
    copyX[i] = kx;
    copyZ[i] = kz;
    const x = ox[i] + kx * patchU;
    const z = oz[i] + kz * patchU;
    const o = i * 16;
    if (!opts.isGrass(x, z)) {
      for (let k = 0; k < 16; k += 1) m[o + k] = 0;
    } else {
      writeMatrix(m, o, x, z, yaw[i], scale[i]);
    }
    mesh.instanceMatrix.addUpdateRange(o, 16);
    mesh.instanceMatrix.needsUpdate = true;
  };

  const touchRow = (row: number, c0: number, c1: number): void => {
    trailTex.addUpdateRange((row * texW + c0) * 4, (c1 - c0 + 1) * 4);
    trailTex.needsUpdate = true;
  };

  const stamp = (p: GrassPlayer, code: number, tS: number): void => {
    const len = Math.hypot(p.dirX, p.dirZ) || 1;
    const bx = Math.round(((p.dirX / len) * 0.5 + 0.5) * 255);
    const bz = Math.round(((p.dirZ / len) * 0.5 + 0.5) * 255);
    const fx = (p.x - bounds.x0) / TRAIL_CELL_U;
    const fz = (p.z - bounds.z0) / TRAIL_CELL_U;
    const r0 = Math.max(0, Math.floor(fz - STAMP_R));
    const r1 = Math.min(texH - 1, Math.ceil(fz + STAMP_R));
    const c0 = Math.max(0, Math.floor(fx - STAMP_R));
    const c1 = Math.min(texW - 1, Math.ceil(fx + STAMP_R));
    if (r0 > r1 || c0 > c1) return;
    for (let row = r0; row <= r1; row += 1) {
      for (let col = c0; col <= c1; col += 1) {
        if (Math.hypot(col + 0.5 - fx, row + 0.5 - fz) > STAMP_R) continue;
        const idx = (row * texW + col) * 4;
        trailData[idx] = code & 0xff;
        trailData[idx + 1] = code >> 8;
        trailData[idx + 2] = bx;
        trailData[idx + 3] = bz;
        expiry.push({ idx, code, at: tS });
      }
      touchRow(row, c0, c1);
    }
  };

  let clockS = 0;
  let lastStampS = -1;

  return {
    update(dtMs, player) {
      clockS += dtMs / 1000;
      const nowCode = stampCode(clockS);
      uniforms.uTime.value = clockS;
      uniforms.uNowCode.value = nowCode;
      uniforms.uPlayer.value.set(player.x, player.z);

      for (let i = 0; i < count; i += 1) place(i, player.x, player.z);

      // 20 stamps a second is a continuous path at any walking speed.
      if (player.trailing && clockS - lastStampS >= 0.05) {
        lastStampS = clockS;
        stamp(player, nowCode, clockS);
      }

      // Clear expired cells, unless they were walked over again since.
      while (expiryHead < expiry.length && clockS - expiry[expiryHead].at > TRAIL_LIFE_S + 0.5) {
        const e = expiry[expiryHead];
        expiryHead += 1;
        const code = trailData[e.idx] | (trailData[e.idx + 1] << 8);
        if (code !== e.code) continue;
        trailData[e.idx] = 0;
        trailData[e.idx + 1] = 0;
        const px = e.idx / 4;
        touchRow(Math.floor(px / texW), px % texW, px % texW);
      }
      if (expiryHead > 4096 && expiryHead * 2 > expiry.length) {
        expiry.splice(0, expiryHead);
        expiryHead = 0;
      }
    },
    dispose() {
      opts.scene.remove(mesh);
      mesh.dispose();
      mat.dispose();
      for (const chunk of carpetMeshes) {
        opts.scene.remove(chunk);
        chunk.dispose();
      }
      carpetMat.dispose();
      trailTex.dispose();
    },
  };
}
