// See-through for whatever stands between the camera and the cupcake.
//
// The default chase camera sits low behind the avatar (over its shoulder), so
// a booth, a land's gate arch or its landmark regularly ends up in front of
// the kid. Each frame this casts one ray from the camera to the avatar and
// fades the whole object it hits; the object fades back once the line is
// clear. The closer the object is to the camera, the further it fades: one
// right against the lens fills the screen, so even a faint copy of it tints
// the whole view.
//
// Follows the town convention: no runtime `three` import, types only; the
// caller passes the namespace in.

import type * as THREE from 'three';
import { cloneMaterial } from './materials';

type ThreeNS = typeof THREE;

/** How see-through a blocking object gets (1 = solid). */
export const OCCLUDER_ALPHA = 0.28;
/** A blocker whose nearest hit is this close to the camera (scene units)
 *  disappears completely... */
export const NEAR_HIDE_U = 2;
/** ...and from this far out it holds at OCCLUDER_ALPHA, with a straight ramp
 *  in between. */
export const NEAR_FULL_U = 5;
/** Seconds to fade out / back in. */
const FADE_S = 0.12;
/** Faded objects draw last, over everything opaque and see-through behind them,
 *  which is also why the cupcake still shows through their depth mask. */
const DEPTH_PASS_ORDER = 10;
const FADED_ORDER = 11;

interface BaseLook {
  opacity: number;
  transparent: boolean;
  depthWrite: boolean;
}

interface Faded {
  alpha: number;
  /** The faded object's OWN copies of its materials, with their look when the
   *  fade began. Copies, because materials are shared: every Blender-authored
   *  booth, arch and castle is a clone of one cached model, so fading the
   *  shared material would fade every one of them across the town. */
  mats: Map<THREE.Material, BaseLook>;
  /** Invisible copies of each solid mesh that lay down its depth first, so only
   *  its front surface gets blended. Without them a see-through object shows its
   *  own insides and back parts, in whatever order its triangles happen to draw. */
  depthPasses: THREE.Mesh[];
  /** Puts the original materials back, once the object is solid again. */
  restore: () => void;
}

export interface OccluderFader {
  /** Fade anything in `roots` that the camera→target line passes through.
   *  Call after the camera has been placed for this frame. */
  update(camera: THREE.Camera, target: THREE.Vector3, dtMs: number): void;
  /** Objects currently faded below solid (for tests). */
  fadedRoots(): THREE.Object3D[];
}

/** How see-through a blocker gets, given its distance from the camera. */
export function occluderAlpha(distU: number): number {
  const t = Math.min(1, Math.max(0, (distU - NEAR_HIDE_U) / (NEAR_FULL_U - NEAR_HIDE_U)));
  return OCCLUDER_ALPHA * t;
}

export function createOccluderFader(THREE: ThreeNS, roots: THREE.Object3D[]): OccluderFader {
  const rootSet = new Set(roots);
  const ray = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  const faded = new Map<THREE.Object3D, Faded>();

  /** Swaps every material under `root` for a private copy, for the length of
   *  one fade. The city animates some originals (a booth's glow brightens as
   *  the kid walks up); that pauses while the object is faded, which is fine
   *  because the object is see-through for exactly that long. */
  const beginFade = (root: THREE.Object3D): Faded => {
    const mats = new Map<THREE.Material, BaseLook>();
    const swapped: { o: THREE.Mesh; original: THREE.Material | THREE.Material[]; renderOrder: number }[] = [];
    const own = (mat: THREE.Material): THREE.Material => {
      const copy = cloneMaterial(mat);
      mats.set(copy, { opacity: copy.opacity, transparent: copy.transparent, depthWrite: copy.depthWrite });
      return copy;
    };
    root.traverse((o) => {
      const holder = o as THREE.Mesh;
      const m = holder.material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      swapped.push({ o: holder, original: m, renderOrder: holder.renderOrder });
      holder.material = Array.isArray(m) ? m.map(own) : own(m);
    });
    // Added after the walk, so it doesn't visit its own depth passes.
    const depthPasses: THREE.Mesh[] = [];
    // Marked transparent so it draws after the sea and other see-through things
    // behind it; in the opaque queue its depth would cut holes in them.
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
    for (const { o } of swapped) {
      const isPlainMesh = o.isMesh && !(o as THREE.SkinnedMesh).isSkinnedMesh && !(o as THREE.InstancedMesh).isInstancedMesh;
      // Only solid surfaces get a mask; sprites and glows just get fainter.
      const blended = (Array.isArray(o.material) ? o.material : [o.material]).some((m) => mats.get(m)?.transparent);
      if (!isPlainMesh || blended) continue;
      const pass = new THREE.Mesh(o.geometry, depthOnly);
      pass.raycast = () => {};
      pass.renderOrder = DEPTH_PASS_ORDER;
      pass.visible = false;
      o.add(pass);
      o.renderOrder = FADED_ORDER;
      depthPasses.push(pass);
    }
    return {
      alpha: 1,
      mats,
      depthPasses,
      restore() {
        for (const pass of depthPasses) pass.removeFromParent();
        depthOnly.dispose();
        for (const { o, original, renderOrder } of swapped) {
          o.material = original;
          o.renderOrder = renderOrder;
        }
        for (const copy of mats.keys()) copy.dispose();
      },
    };
  };

  const apply = (f: Faded): void => {
    const solid = f.alpha >= 0.999;
    for (const [mat, b] of f.mats) {
      const transparent = solid ? b.transparent : true;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      mat.opacity = b.opacity * f.alpha;
    }
    // Fully hidden objects draw nothing, so they should mask nothing either.
    for (const pass of f.depthPasses) pass.visible = !solid && f.alpha > 0.01;
  };

  const rootOf = (o: THREE.Object3D | null): THREE.Object3D | null => {
    for (let n = o; n; n = n.parent) if (rootSet.has(n)) return n;
    return null;
  };

  return {
    update(camera, target, dtMs) {
      // Each blocking object, with its nearest hit's distance from the camera.
      const blocking = new Map<THREE.Object3D, number>();
      dir.subVectors(target, camera.position);
      const dist = dir.length();
      if (dist > 1e-3) {
        dir.multiplyScalar(1 / dist);
        ray.set(camera.position, dir);
        // Sprites (the booth glyphs, the gate marquees) need the camera to raycast.
        ray.camera = camera;
        ray.far = Math.max(0, dist - 0.6);
        for (const hit of ray.intersectObjects(roots, true)) {
          const r = rootOf(hit.object);
          // Hits come nearest first, so the first per object is its nearest.
          if (r && r.visible && !blocking.has(r)) blocking.set(r, hit.distance);
        }
      }
      for (const r of blocking.keys()) {
        if (!faded.has(r)) faded.set(r, beginFade(r));
      }
      const k = 1 - Math.exp(-(dtMs / 1000) / FADE_S);
      for (const [r, f] of faded) {
        const near = blocking.get(r);
        const goal = near === undefined ? 1 : occluderAlpha(near);
        f.alpha += (goal - f.alpha) * k;
        if (Math.abs(goal - f.alpha) < 0.01) f.alpha = goal;
        apply(f);
        if (f.alpha === 1) {
          f.restore();
          faded.delete(r);
        }
      }
    },
    fadedRoots() {
      return [...faded].filter(([, f]) => f.alpha < 1).map(([r]) => r);
    },
  };
}
