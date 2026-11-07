// The three hidden land chests, in the scene.
//
// lib/town/land-chests.ts says which chests exist, land-chest-spots.ts says
// where on the solved map; this draws them and opens them. The model is the
// SAME Blender chest the ocean uses (art/blender/chest.py), taken from the town
// art registry, so its clones share the registry's geometry and materials and
// are never disposed here.
//
// NO CODE FALLBACK. Everywhere else a missing GLB falls back to a code-built
// stand-in. A hidden chest that silently became a grey box would still be a
// chest, but nobody would ever have looked at it, so if the art is missing the
// chests are simply not there — not findable, not promptable — until it loads
// on a later visit.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ, PX_PER_UNIT } from './types';
import type { AuthoredRegistry } from './authored-registry';
import { AUTHORED_CHEST } from './authored-registry';
import { glowSprite } from './materials';
import { LAND_CHESTS, type LandChestSpot } from '../land-chests';
import type { Pt } from './land-chest-spots';

/** Node in chest.glb whose origin is the hinge (art/blender/chest.py). */
const LID_NODE = 'ChestLid';
/** How close the cupcake must be for the "Open" prompt, px. About two of its
 *  own widths: close enough that finding it is the achievement, not the
 *  prompt. */
export const LAND_CHEST_REACH_PX = 110;
/** Same swing as the ocean's chests. */
const LID_OPEN = 1.95;
const LID_MS = 900;
/** Lit only once opened, like the ocean's — a lit chest would not be hidden. */
const OPEN_GLOW = 0xfbbf24;
const OPEN_GLOW_U = 2.2;
const OPEN_GLOW_OPACITY = 0.6;
/** px either side for reading the ground's slope. */
const SLOPE_EPS_PX = 24;

interface Live {
  slug: string;
  px: Pt;
  lid: THREE.Object3D | null;
  glowMat: THREE.SpriteMaterial;
  /** 0 shut, 1 open. */
  t: number;
  opening: boolean;
}

export interface LandChests3D {
  group: THREE.Group;
  /** The nearest UNOPENED chest within reach of a point, or null. */
  nearest(p: Pt): string | null;
  /** Swing a chest's lid open. Idempotent. */
  open(slug: string): void;
  /** `dtMs` in milliseconds, like the rest of the engine loop. */
  update(dtMs: number): void;
  dispose(): void;
}

export function createLandChests3D(
  THREE: ThreeNS,
  opts: {
    authored: AuthoredRegistry;
    spots: Record<LandChestSpot, Pt | null>;
    opened: ReadonlySet<string>;
    /** Scene-unit ground height at a px point (the engine's terrainHeightPx). */
    groundY(px: number, py: number): number;
    /** Mainland centre, px: each chest faces it, lock outward to a kid
     *  arriving from town. */
    centre: Pt;
  },
): LandChests3D {
  const group = new THREE.Group();
  group.name = 'LandChests';
  const live: Live[] = [];
  const glowMats: THREE.SpriteMaterial[] = [];
  const glowTexs: THREE.Texture[] = [];
  const UP = new THREE.Vector3(0, 1, 0);

  const pose = (l: Live): void => {
    const e = 1 - (1 - l.t) * (1 - l.t);
    if (l.lid) l.lid.rotation.x = -LID_OPEN * e;
    l.glowMat.opacity = OPEN_GLOW_OPACITY * e;
  };

  for (const spec of LAND_CHESTS) {
    const p = opts.spots[spec.spot];
    if (!p) continue;
    const model = opts.authored.take(AUTHORED_CHEST.key);
    if (!model) continue;

    const chest = new THREE.Group();
    chest.name = `LandChest ${spec.slug}`;
    // Seated along the ground, as the ocean's chests are along the seabed: the
    // mountain one sits on a real slope, and a level box there buries a corner.
    const h = opts.groundY;
    const e = SLOPE_EPS_PX;
    const normal = new THREE.Vector3(
      h(p.x - e, p.y) - h(p.x + e, p.y),
      (2 * e) / PX_PER_UNIT,
      h(p.x, p.y - e) - h(p.x, p.y + e),
    ).normalize();
    chest.quaternion.setFromUnitVectors(UP, normal);
    // The model's front (+Z) toward the middle of town.
    chest.rotateY(Math.atan2(opts.centre.x - p.x, opts.centre.y - p.y));
    chest.position.set(pxToSceneX(p.x), h(p.x, p.y), pxToSceneZ(p.y));
    chest.add(model);

    const glow = glowSprite(THREE, OPEN_GLOW, OPEN_GLOW_U, 0);
    glow.sprite.position.set(0, AUTHORED_CHEST.targetHeightU * 0.9, 0);
    chest.add(glow.sprite);
    glowMats.push(glow.mat);
    glowTexs.push(glow.tex);

    group.add(chest);
    const l: Live = {
      slug: spec.slug,
      px: p,
      lid: model.getObjectByName(LID_NODE) ?? null,
      glowMat: glow.mat,
      t: opts.opened.has(spec.slug) ? 1 : 0,
      opening: false,
    };
    pose(l);
    live.push(l);
  }

  return {
    group,
    nearest(p: Pt): string | null {
      let best: string | null = null;
      let bestD = LAND_CHEST_REACH_PX;
      for (const l of live) {
        if (l.t > 0) continue;
        const d = Math.hypot(l.px.x - p.x, l.px.y - p.y);
        if (d < bestD) {
          bestD = d;
          best = l.slug;
        }
      }
      return best;
    },
    open(slug: string) {
      const l = live.find((x) => x.slug === slug);
      if (l && l.t === 0 && !l.opening) l.opening = true;
    },
    update(dtMs: number) {
      for (const l of live) {
        if (!l.opening) continue;
        l.t = Math.min(1, l.t + dtMs / LID_MS);
        pose(l);
        if (l.t >= 1) l.opening = false;
      }
    },
    dispose() {
      // Model clones belong to the registry; only the glows are ours.
      for (const m of glowMats) m.dispose();
      for (const t of glowTexs) t.dispose();
    },
  };
}
