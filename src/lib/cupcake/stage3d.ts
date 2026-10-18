// One small three.js stage that draws cupcake characters into ordinary 2D
// canvases. The Cakey Store shows a big spinning preview plus a spinner on
// every shop tile; browsers cap live WebGL contexts at roughly 8–16 per page,
// so instead of a renderer per tile there is exactly ONE offscreen renderer
// here. Each draw renders a model into the bottom-left corner of that
// renderer's buffer and copies the pixels into the caller's canvas with
// drawImage, in the same task (so preserveDrawingBuffer isn't needed).
//
// Same bundle rule as src/lib/town/three/*: no runtime `three` import. The
// namespace is passed in by a client component that dynamic-imports three.

import type * as THREE from 'three';
import type { ThreeNS } from '@/lib/town/three/types';
import { buildCupcakeModel, type CupcakeModel } from '@/lib/town/three/avatar';
import type { CupcakeConfig } from '@/lib/cupcake/config';

/** Await before the first draw, so the shop shows the Blender cupcake rather
 *  than its code-built stand-in. */
export { preloadCupcakeArt } from '@/lib/town/three/avatar';

/** How a model is posed for one draw. All values are 0 at rest. */
export interface CupcakePose {
  /** Turn around the vertical axis, radians. */
  yaw: number;
  /** Vertical hop, model units. */
  hop: number;
  /** Squash-and-stretch: positive squashes (shorter + wider). */
  squash: number;
  /** Side-to-side wiggle, radians around the view axis. */
  wiggle: number;
}

export interface CupcakeStage {
  /** Draw `config` into `target` (sized in device pixels by the caller). */
  draw(target: HTMLCanvasElement, config: CupcakeConfig, pose: CupcakePose): void;
  /** Called when the GPU context is lost; the stage is unusable after. */
  onLost(cb: () => void): void;
  dispose(): void;
}

/** Biggest square a single draw can use, in device pixels. */
export const STAGE_MAX_PX = 512;

/** Models kept built at once. The shop shows one tab's options (≤ 6) plus the
 *  big preview, and rebuilds them when the worn config changes. */
const MODEL_CACHE_SIZE = 24;

interface CachedModel {
  model: CupcakeModel;
  /** Pivot the pose is applied to, sitting at the model's base. */
  pivot: THREE.Group;
  /** Height of the model's bounding box, for framing. */
  height: number;
}

export function cupcakeKey(c: CupcakeConfig): string {
  return [
    c.base, c.wrapper, c.frosting, c.topping, c.variety,
    c.hat, c.glasses, c.face, c.hatColor, c.glassesColor,
    c.frostingColor, c.wrapperColor,
  ].join('|');
}

/** Returns null when WebGL isn't available; callers keep their 2D fallback. */
export function createCupcakeStage(THREE: ThreeNS): CupcakeStage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  // The caller sizes its canvas in device pixels, so the renderer works in
  // raw pixels too.
  renderer.setPixelRatio(1);
  renderer.setSize(STAGE_MAX_PX, STAGE_MAX_PX, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff7ed, 0xc4b5fd, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.9);
  key.position.set(1.5, 2.5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xfde68a, 0.7);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);
  const cache = new Map<string, CachedModel>();
  const box = new THREE.Box3();
  const lostCbs: Array<() => void> = [];
  let lost = false;

  const onContextLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    for (const cb of lostCbs) cb();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  const freeModel = (m: CachedModel): void => {
    for (const g of m.model.geometries) g.dispose();
    for (const mat of m.model.materials) mat.dispose();
  };

  const getModel = (config: CupcakeConfig): CachedModel => {
    const k = cupcakeKey(config);
    const hit = cache.get(k);
    if (hit) {
      // Re-insert so Map order tracks recency.
      cache.delete(k);
      cache.set(k, hit);
      return hit;
    }
    const model = buildCupcakeModel(THREE, config);
    const pivot = new THREE.Group();
    pivot.add(model.group);
    box.setFromObject(model.group);
    const entry: CachedModel = { model, pivot, height: Math.max(1.05, box.max.y) };
    cache.set(k, entry);
    while (cache.size > MODEL_CACHE_SIZE) {
      const oldest = cache.keys().next().value as string;
      freeModel(cache.get(oldest)!);
      cache.delete(oldest);
    }
    return entry;
  };

  return {
    draw(target, config, pose): void {
      if (lost) return;
      const w = Math.min(target.width, STAGE_MAX_PX);
      const h = Math.min(target.height, STAGE_MAX_PX);
      if (w < 1 || h < 1) return;
      const ctx = target.getContext('2d');
      if (!ctx) return;

      const entry = getModel(config);
      const { pivot } = entry;
      pivot.rotation.set(0, pose.yaw, pose.wiggle);
      pivot.position.y = pose.hop;
      pivot.scale.set(1 + pose.squash * 0.5, 1 - pose.squash, 1 + pose.squash * 0.5);
      scene.add(pivot);

      // Frame the whole model (hats make some taller) with a little headroom
      // for the hop.
      const aspect = w / h;
      const fitH = entry.height + 0.2;
      const halfFov = THREE.MathUtils.degToRad(camera.fov / 2);
      const distForH = fitH / 2 / Math.tan(halfFov);
      const distForW = 1.0 / 2 / Math.tan(halfFov) / aspect;
      const dist = Math.max(distForH, distForW) * 1.05;
      camera.aspect = aspect;
      camera.position.set(0, fitH / 2 + dist * 0.12, dist);
      camera.lookAt(0, fitH / 2 - 0.08, 0);
      camera.updateProjectionMatrix();

      renderer.setViewport(0, 0, w, h);
      renderer.setScissor(0, 0, w, h);
      renderer.setScissorTest(true);
      renderer.clear();
      renderer.render(scene, camera);
      scene.remove(pivot);

      // WebGL's origin is bottom-left; the drawn region is the bottom w×h of
      // the buffer.
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(renderer.domElement, 0, STAGE_MAX_PX - h, w, h, 0, 0, target.width, target.height);
    },
    onLost(cb): void {
      lostCbs.push(cb);
    },
    dispose(): void {
      for (const m of cache.values()) freeModel(m);
      cache.clear();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
