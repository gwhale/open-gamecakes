// Shared "edible diorama" material + glow recipes for the Gamecakes 3D town.
//
// The town's cozy-cake look lives here so it's tunable in one place, and every
// town module (city3d, engine, train) pulls from it instead of hand-rolling
// MeshStandardMaterials. Two rules mirror the rest of the engine:
//   1. No runtime `three` import — the namespace arrives as an argument (ThreeNS),
//      so these modules never enter the server bundle.
//   2. Callers own disposal. Each factory RETURNS a fresh material/texture; the
//      caller pushes it into its own tracked geo/mat/tex sink so nothing leaks.
//
// "Magical glow" is faked with additive-blended halo sprites (glowSprite) rather
// than a post-processing bloom pass — cheap and tablet-safe (see the creative
// direction in .claude/agents/gamecakes-creative-director.md).

import type * as THREE from 'three';
import type { ThreeNS } from './types';

/** 0xRRGGBB int → '#rrggbb' string for canvas 2D fills. */
function hex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

/** Radial-gradient glow texture: bright center → transparent edge. Drawn on an
 *  additive Sprite it reads as a soft candy halo without any EffectComposer. */
function makeGlowTexture(THREE: ThreeNS, color: number): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  const c = hex(color);
  // 8-digit hex (#rrggbbaa) — supported by all canvas 2D engines we target.
  g.addColorStop(0, `${c}ff`);
  g.addColorStop(0.35, `${c}b0`);
  g.addColorStop(1, `${c}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft additive glow halo as a camera-facing sprite. Cheap fake-bloom for
 *  cloud / booth-sign / reward highlights. Caller tracks `tex` + `mat` for
 *  disposal and may mutate `mat.opacity` to pulse/dissolve the glow. */
export function glowSprite(
  THREE: ThreeNS,
  color: number,
  sizeU: number,
  opacity = 0.7,
): { sprite: THREE.Sprite; tex: THREE.CanvasTexture; mat: THREE.SpriteMaterial } {
  const tex = makeGlowTexture(THREE, color);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(sizeU, sizeU, 1);
  return { sprite, tex, mat };
}

/** Piped frosting / icing — near-matte with a faint self-tint so it stays
 *  candy-bright in shadow. Default white; pass a cream/pastel for trims. */
/** An emoji drawn onto a small canvas and mounted on a camera-facing sprite —
 *  the town's badge recipe (region landmarks, booth glyphs, the ferry pennant
 *  and dock signpost). Caller tracks `tex` + `mat` for disposal. The 128px
 *  canvas is plenty at badge size and keeps the texture cheap on a tablet. */
export function emojiSprite(
  THREE: ThreeNS,
  emoji: string,
  scaleU: number,
): { sprite: THREE.Sprite; tex: THREE.Texture; mat: THREE.SpriteMaterial } {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '102px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 69);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scaleU, scaleU, 1);
  return { sprite, tex, mat };
}

export function frostingMat(THREE: ThreeNS, color = 0xffffff): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0,
    emissive: color,
    emissiveIntensity: 0.06,
  });
}

/** Piped-cream trail surface: frosting combed lengthwise, with the odd dollop.
 *  The normal map is baked by art/blender/land-normals.py. Pair it with
 *  pathRibbonGeo so the combing keeps its proportions on any trail length. */
export function pathMat(THREE: ThreeNS, color: number): { mat: THREE.MeshStandardMaterial; tex: THREE.Texture } {
  const tex = new THREE.TextureLoader().load('/textures/town/path-normal.png');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const mat = frostingMat(THREE, color);
  mat.normalMap = tex;
  mat.normalScale.set(0.8, 0.8);
  return { mat, tex };
}

/** A trail ribbon box whose UVs repeat once per `width` along its length (U)
 *  instead of stretching one texture repeat over the whole trail. */
export function pathRibbonGeo(THREE: ThreeNS, len: number, height: number, width: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(len, height, width);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * len) / width);
  return geo;
}

/** Scene units one sponge-crumb tile covers on a cake building. */
const CAKE_RELIEF_TILE_U = 0.8;
/** Which materials carry cake relief, so a clone can get it back (three's
 *  Material.clone() does not copy onBeforeCompile). */
const cakeRelief = new WeakMap<THREE.Material, { tex: THREE.Texture; wholeSurface: boolean }>();

/**
 * Sponge-crumb relief on a cake building (art/blender/land-normals.py). Blender
 * art ships one palette-atlas material whose UVs point at flat swatches, so the
 * crumb can't use UVs: it is projected triplanar from the model's own object
 * space, which also keeps it fixed to the model as it scales or sways. Only
 * matte surfaces get it, keyed on roughness: cake walls (~0.7) are crumb, while
 * glossy frosting, cherries and windows (≤0.5) keep their smooth shine.
 * `wholeSurface` skips that test, for a material that is all cake wall (a tint
 * slot). A no-op for non-standard materials or ones that already have it.
 */
export function addCakeRelief(mat: THREE.Material, tex: THREE.Texture, wholeSurface = false): void {
  if (cakeRelief.has(mat) || !(mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) return;
  cakeRelief.set(mat, { tex, wholeSurface });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uCakeRelief = { value: tex };
    shader.uniforms.uCrumbFrom = { value: wholeSurface ? -1 : 0.55 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vReliefPos;\nvarying vec3 vReliefNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvReliefPos = position;\nvReliefNrm = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        // normalMatrix is declared for the vertex stage only; uniforms are
        // per-program, so declaring it here reads the same value.
        '#include <common>\nuniform sampler2D uCakeRelief;\nuniform float uCrumbFrom;\nuniform mat3 normalMatrix;\nvarying vec3 vReliefPos;\nvarying vec3 vReliefNrm;',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  float crumb = smoothstep( uCrumbFrom, uCrumbFrom + 0.13, roughnessFactor );
  if ( crumb > 0.0 ) {
    vec3 bw = pow( abs( normalize( vReliefNrm ) ), vec3( 4.0 ) );
    bw /= bw.x + bw.y + bw.z;
    vec3 p = vReliefPos * ${(1 / CAKE_RELIEF_TILE_U).toFixed(4)};
    vec2 nx = texture2D( uCakeRelief, p.zy ).xy * 2.0 - 1.0;
    vec2 ny = texture2D( uCakeRelief, p.xz ).xy * 2.0 - 1.0;
    vec2 nz = texture2D( uCakeRelief, p.xy ).xy * 2.0 - 1.0;
    vec3 pert = vec3( 0.0, nx.y, nx.x ) * bw.x + vec3( ny.x, 0.0, ny.y ) * bw.y + vec3( nz.x, nz.y, 0.0 ) * bw.z;
    normal = normalize( normal + normalMatrix * pert * ( crumb * 2.0 ) );
  }
}`,
      );
  };
}

/** Loads the sponge-crumb texture addCakeRelief takes. Caller disposes it. */
export function cakeReliefTex(THREE: ThreeNS): THREE.Texture {
  const tex = new THREE.TextureLoader().load('/textures/town/sponge-normal.png');
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** material.clone() that keeps cake relief. */
export function cloneMaterial<T extends THREE.Material>(mat: T): T {
  const copy = mat.clone() as T;
  const relief = cakeRelief.get(mat);
  if (relief) addCakeRelief(copy, relief.tex, relief.wholeSurface);
  return copy;
}

/** Sponge / cake body — warm and matte. */
export function cakeMat(THREE: ThreeNS, color = 0xfde8bd): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
}

/** Baked cookie — golden and slightly rough. */
export function cookieMat(THREE: ThreeNS, color = 0xcf9a52): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
}

/** Boiled-sweet / gumdrop candy — glossy with a faint self-glow so saturated
 *  candy colors keep their pop in shadow. */
export function candyMat(THREE: ThreeNS, color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.24,
    metalness: 0.02,
    emissive: color,
    emissiveIntensity: 0.05,
  });
}

/** Biases a material's depth so geometry lying ON the terrain stops z-fighting.
 *
 *  The ground is a PlaneGeometry that gets vertex-displaced to the island
 *  surface, so its height varies per vertex. Anything laid on top of it — the
 *  bridge deck at y=0, the soccer pitch at y=0.02 — is only centimetres clear,
 *  and wherever terrain rises that clearance is consumed: the two surfaces land
 *  on the same depth value and the GPU alternates which one wins, which reads
 *  as flicker. It shows up worst while riding a vehicle or the Sugar Express,
 *  because depth precision falls off with distance and the computed depths
 *  shift every frame as the camera moves.
 *
 *  polygonOffset is the right tool: it biases depth at rasterisation time, so
 *  the decal wins deterministically at any distance and any camera angle.
 *  Nudging the Y offset up instead would only trade flicker for a visible
 *  floating lip at glancing angles, and would still fail far from the camera.
 *
 *  `layer` stacks decals that sit on each other (road=1, its dashes=2).
 */
export function groundDecalDepthBias<T extends THREE.Material>(mat: T, layer = 1): T {
  mat.polygonOffset = true;
  // Negative pulls the fragment toward the viewer in depth space.
  mat.polygonOffsetFactor = -layer;
  mat.polygonOffsetUnits = -layer;
  return mat;
}

/** Translucent candy-glass — a low-opacity tinted shell with a light emissive
 *  rim. Reserved for glass-dome looks; locked lands currently use cotton-candy
 *  clouds instead, but this keeps the recipe on hand. */
export function candyGlassMat(
  THREE: ThreeNS,
  color: number,
  opacity = 0.32,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity,
    emissive: color,
    emissiveIntensity: 0.2,
  });
}
