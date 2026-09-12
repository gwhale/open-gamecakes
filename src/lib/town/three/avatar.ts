// The kid's cupcake avatar for the 3D town — built from primitives (wrapper +
// frosting dome + cherry) so it carries no asset pipeline, matching the
// cupcake mascot the 2D park map drew on a canvas. A billboard sprite of the
// kid's own emoji rides above as a name tag.
//
// No runtime `three` import — the namespace arrives as an argument.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import {
  WRAPPER_COLORS,
  FROSTING_COLORS,
  PLAIN_CUPCAKE,
  type CupcakeConfig,
} from '@/lib/cupcake/config';

export interface Avatar {
  group: THREE.Group;
  /** Per-frame visual update: walk-bob while moving + gentle turn toward the
   *  horizontal velocity direction (scene units). */
  update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void;
  dispose(): void;
}

/** The disposable resources a built cupcake model owns. Callers that already
 *  track geo/mat for disposal (the avatar, the city landmark) push these into
 *  their own sinks so nothing leaks when the scene tears down. */
export interface CupcakeModel {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Build a static cupcake mesh from a kid's `cupcake_config` — wrapper/sponge
 * color, frosting color, base silhouette (cupcake/cakepop/layered) and topping.
 * Pure geometry: no animation, no name-tag, no contact shadow. The unit cupcake
 * stands ~0.9 units tall with its base at y=0, so callers scale/position the
 * returned `group` freely.
 *
 * Single source of truth for the 3D cupcake shape — the walking town avatar
 * (below) and the per-kid land landmark (city3d.ts) both render from this, so a
 * kid's land icon always matches the treat they built in the Cakey Store.
 */
export function buildCupcakeModel(
  THREE: ThreeNS,
  config: CupcakeConfig = PLAIN_CUPCAKE,
): CupcakeModel {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Colors come from the kid's saved cupcake_config — the same palette the 2D
  // CupcakeAvatar / Cakey Store use. Wrapper = liner / cake-sponge; frosting = icing.
  const wrapCol = WRAPPER_COLORS[config.wrapper].paper;
  const froCol = FROSTING_COLORS[config.frosting].fill;

  const addPart = (
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    y: number,
    opts?: { scaleY?: number; rough?: number },
  ): void => {
    geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: opts?.rough ?? 0.6 });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    if (opts?.scaleY) mesh.scale.y = opts.scaleY;
    mesh.castShadow = true;
    group.add(mesh);
  };

  // Topping — a small 3D nod to the 2D topping choice, placed on top.
  const addTopping = (y: number): void => {
    switch (config.topping) {
      case 'none':
        return;
      case 'cherry':
        addPart(new THREE.SphereGeometry(0.1, 12, 10), 0xd9223f, y, { rough: 0.3 });
        return;
      case 'candle':
        addPart(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), 0xfef3c7, y + 0.02, { rough: 0.5 });
        addPart(new THREE.SphereGeometry(0.05, 8, 8), 0xfbbf24, y + 0.17, { rough: 0.3 });
        return;
      default:
        // star / sprinkles / rainbow — a little gold bauble so the pick reads.
        addPart(new THREE.SphereGeometry(0.08, 10, 8), 0xfbbf24, y, { rough: 0.3 });
    }
  };

  // Base body — the silhouette the kid unlocked in the Cakey Store.
  if (config.base === 'cakepop') {
    addPart(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), 0xe7cfa3, 0.3, { rough: 0.8 }); // stick
    addPart(new THREE.SphereGeometry(0.3, 18, 14), froCol, 0.66, { rough: 0.45 }); // coated ball
    addTopping(0.9);
  } else if (config.base === 'layered') {
    addPart(new THREE.CylinderGeometry(0.34, 0.36, 0.2, 20), wrapCol, 0.1, { rough: 0.7 }); // bottom tier
    addPart(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 20), froCol, 0.22, { rough: 0.45 }); // icing
    addPart(new THREE.CylinderGeometry(0.25, 0.27, 0.18, 20), wrapCol, 0.34, { rough: 0.7 }); // mid tier
    addPart(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), froCol, 0.45, { rough: 0.45 }); // icing
    addPart(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 20), wrapCol, 0.56, { rough: 0.7 }); // top tier
    addPart(new THREE.SphereGeometry(0.19, 16, 12), froCol, 0.66, { scaleY: 0.7, rough: 0.45 }); // crown
    addTopping(0.82);
  } else {
    // cupcake (the free default)
    addPart(new THREE.CylinderGeometry(0.34, 0.24, 0.42, 16), wrapCol, 0.21, { rough: 0.7 }); // wrapper
    addPart(new THREE.SphereGeometry(0.36, 18, 14), froCol, 0.5, { scaleY: 0.8, rough: 0.45 }); // frosting
    addTopping(0.82);
  }

  return { group, geometries, materials };
}

export function createAvatar(
  THREE: ThreeNS,
  kidEmoji: string | undefined,
  config: CupcakeConfig = PLAIN_CUPCAKE,
): Avatar {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  // Bob applies to this inner group so heading rotation (on `group`) and the
  // vertical bounce don't fight each other.
  const body = new THREE.Group();
  group.add(body);

  // The cupcake silhouette + colors come from the shared model builder so the
  // walking avatar always matches the kid's land icon and Cakey Store treat.
  const model = buildCupcakeModel(THREE, config);
  body.add(model.group);
  geos.push(...model.geometries);
  mats.push(...model.materials);

  // Kid emoji name-tag billboard above the cupcake.
  if (kidEmoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '74px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kidEmoji, 48, 52);
    const tex = texs[texs.push(new THREE.CanvasTexture(canvas)) - 1];
    tex.colorSpace = THREE.SRGBColorSpace;
    const tagMat = mats[mats.push(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })) - 1];
    const tag = new THREE.Sprite(tagMat as THREE.SpriteMaterial);
    tag.scale.set(0.7, 0.7, 1);
    tag.position.y = 1.5;
    group.add(tag);
  }

  // Soft contact shadow disc (cheap, always present even if shadows are off).
  const discGeo = geos[geos.push(new THREE.CircleGeometry(0.36, 20)) - 1];
  const discMat = mats[mats.push(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })) - 1];
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);

  let bobPhase = 0;
  let heading = 0;

  return {
    group,
    update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void {
      // Walk-bob: bounce only while moving, settle to rest otherwise.
      if (isMoving) {
        bobPhase += dtMs / 110;
        body.position.y = Math.abs(Math.sin(bobPhase)) * 0.09;
        // Gentle turn toward the velocity heading.
        const target = Math.atan2(velX, velZ);
        let delta = target - heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        heading += delta * Math.min(1, dtMs / 120);
        group.rotation.y = heading;
      } else {
        body.position.y *= 0.85;
      }
    },
    dispose(): void {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

// ============================================================================
// LEARNING-MODE CONTRIBUTION POINT #1 — the feel of walking
// ============================================================================
//
// stepAvatarToward advances an avatar position (WORLD PIXELS) one frame toward
// a tapped target and reports arrival. This is the moment-to-moment "game feel"
// of tap-to-walk: a kid taps the ground, and how the cupcake travels there is
// decided entirely here.
//
// The default below is constant-speed with a stop-short epsilon — simple and
// predictable. But there are real, kid-facing trade-offs worth your call:
//   * Constant speed (current) reads as steady/toy-like.
//   * Ease-OUT on arrival (slow down in the last ~40px) feels more "premium"
//     and stops the jarring hard-stop, but can feel sluggish on short hops.
//   * A tiny ease-IN at the start adds weight but delays response on a kid's
//     impatient repeat-taps.
//
// George — this is a great 5-line one to own. Swap the body for whichever feel
// you want; the signature + the `arrived` contract must stay the same so the
// engine's "arrived → maybe enter game" logic keeps working.

export interface StepResult {
  x: number;
  y: number;
  /** Per-axis velocity actually applied this frame (px/sec) — the avatar uses
   *  this to pick its facing/bob. Zero when already arrived. */
  vx: number;
  vy: number;
  arrived: boolean;
}

export function stepAvatarToward(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  speedPx: number,
  dtMs: number,
  arriveEpsPx: number,
): StepResult {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= arriveEpsPx) {
    return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
  }
  const stepLen = (speedPx * dtMs) / 1000;
  if (stepLen >= dist) {
    return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
  }
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    x: pos.x + nx * stepLen,
    y: pos.y + ny * stepLen,
    vx: nx * speedPx,
    vy: ny * speedPx,
    arrived: false,
  };
}
