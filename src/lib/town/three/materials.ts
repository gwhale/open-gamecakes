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
export function frostingMat(THREE: ThreeNS, color = 0xffffff): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.34,
    metalness: 0,
    emissive: color,
    emissiveIntensity: 0.06,
  });
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
