// One small three.js stage that draws town models — build pieces, land
// buildings, rentable rides — into ordinary 2D canvases, for the turntable
// previews in the build tray, the Cakey Garage and the land panel.
//
// Same trick as the Cakey Store's cupcake stage (src/lib/cupcake/stage3d.ts):
// exactly ONE offscreen WebGL renderer however many previews are on screen.
// Each draw renders into the bottom-left corner of that renderer's buffer and
// copies the pixels into the caller's canvas with drawImage in the same task,
// so a grid of previews never costs a WebGL context per tile.
//
// Models come from the same places the town gets them, so a preview is the
// exact model a kid will see placed or ride. A subject is a short string, so
// the UI can name one without importing any of this:
//   * `build:<kind>`  — the build piece's GLB (AUTHORED_BUILDS);
//   * `land:<level>`  — the land building's GLB (AUTHORED_LAND_STRUCTURES);
//   * `vehicle:<kind>` — the ride, built with VEHICLE_BUILDERS.
// GLBs load through the town's authored registry (createAuthoredRegistry),
// one per key on first use, so a page only fetches what it previews. Lights
// and tone mapping are the town's own rig (lighting.ts).
//
// Same bundle rule as the rest of src/lib/town/three/*: no runtime `three`
// import. The namespace is passed in by a client component that dynamic-imports
// three.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import {
  AUTHORED_BUILDS,
  createAuthoredRegistry,
  type AuthoredRegistry,
  type Tints,
} from './authored-registry';
import { AUTHORED_LAND_STRUCTURES } from './land-structure';
import { addTownLights, configureTownRenderer } from './lighting';
import { VEHICLE_BUILDERS, type CodeBuiltVehicleKind, type VehicleModel } from './vehicles';

/** Biggest square a single draw can use, in device pixels. */
export const TURNTABLE_MAX_PX = 512;

/** Tint slots shown in a preview, by GLB key. The town paints these at
 *  runtime; white would read as unfinished. The lamp's bulb glows in town
 *  (builds3d.ts); here it is the same warm cream without the glow. */
const PREVIEW_TINTS: Record<string, Tints> = {
  [AUTHORED_BUILDS.lamp.key]: { tint: 0xfff4c2 },
};

type Source = { glb: string } | { vehicle: CodeBuiltVehicleKind };

/** What a subject string names, or null when nothing models it (the road, a
 *  bare plot, a typo). */
export function resolveSubject(subject: string): Source | null {
  const [kind, id] = subject.split(':');
  if (kind === 'build') {
    const spec = (AUTHORED_BUILDS as Record<string, { key: string } | undefined>)[id];
    return spec ? { glb: spec.key } : null;
  }
  if (kind === 'land') {
    const spec = AUTHORED_LAND_STRUCTURES[Number(id)];
    return spec ? { glb: spec.key } : null;
  }
  if (kind === 'vehicle') return id in VEHICLE_BUILDERS ? { vehicle: id as CodeBuiltVehicleKind } : null;
  return null;
}

export interface TurntableStage {
  /** Starts loading `subject` if needed. Resolves false when there is no model
   *  for it (missing file, failed load); the caller keeps its fallback. */
  load(subject: string): Promise<boolean>;
  /** Draws `subject` turned `yaw` radians into `target` (sized in device
   *  pixels by the caller). A no-op until load() has resolved true. */
  draw(target: HTMLCanvasElement, subject: string, yaw: number): void;
  /** Called when the GPU context is lost; the stage is unusable after. */
  onLost(cb: () => void): void;
  dispose(): void;
}

interface Subject {
  /** Turned by the yaw; the model inside is centred on its axis. */
  pivot: THREE.Group;
  /** Model height and its widest reach from the turning axis, for framing. */
  height: number;
  reach: number;
  /** A built ride owns its resources; GLB clones belong to their registry. */
  vehicle: VehicleModel | null;
}

/** Camera tilt above the horizon: high enough to see the top of a bench seat
 *  or a flower bed, low enough that a lamp still reads as tall. */
const ELEVATION = 0.38;
const FOV = 30;

/** Returns null when WebGL isn't available; callers keep their 2D fallback. */
export function createTurntableStage(THREE: ThreeNS): TurntableStage | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  // The caller sizes its canvas in device pixels, so the renderer works in
  // raw pixels too.
  renderer.setPixelRatio(1);
  renderer.setSize(TURNTABLE_MAX_PX, TURNTABLE_MAX_PX, false);
  renderer.setClearColor(0x000000, 0);
  configureTownRenderer(THREE, renderer);
  // No ground to land on, so no shadow pass.
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const lights = addTownLights(THREE, scene, renderer, { centerX: 0, centerZ: 0, halfU: 2 });
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 200);

  const registries = new Map<string, AuthoredRegistry>();
  const subjects = new Map<string, Subject>();
  const pending = new Map<string, Promise<boolean>>();
  const lostCbs: Array<() => void> = [];
  let lost = false;
  let disposed = false;

  const onContextLost = (e: Event): void => {
    e.preventDefault();
    lost = true;
    for (const cb of lostCbs) cb();
  };
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  /** Wraps a model in a pivot, centred on the turning axis, and measures it. */
  const stand = (model: THREE.Object3D, vehicle: VehicleModel | null): Subject => {
    const pivot = new THREE.Group();
    pivot.add(model);
    const box = new THREE.Box3().setFromObject(model);
    const centre = box.getCenter(new THREE.Vector3());
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    model.position.y -= box.min.y;
    const size = box.getSize(new THREE.Vector3());
    return { pivot, height: size.y, reach: Math.hypot(size.x, size.z) / 2, vehicle };
  };

  const loadSubject = async (subject: string): Promise<boolean> => {
    const source = resolveSubject(subject);
    if (!source) return false;
    if ('vehicle' in source) {
      const model = VEHICLE_BUILDERS[source.vehicle](THREE);
      subjects.set(subject, stand(model.group, model));
      return true;
    }
    // The town's own loader: one registry per key, so a page only fetches the
    // models it actually previews.
    const key = source.glb;
    const registry = createAuthoredRegistry(THREE, [{ key, url: `/models/town/${key}.glb` }]);
    registries.set(key, registry);
    await registry.ready;
    if (disposed) return false;
    const model = registry.take(key, PREVIEW_TINTS[key]);
    if (!model) return false;
    subjects.set(subject, stand(model, null));
    return true;
  };

  return {
    load(subject): Promise<boolean> {
      if (subjects.has(subject)) return Promise.resolve(true);
      let p = pending.get(subject);
      if (!p) {
        p = loadSubject(subject).catch(() => false);
        pending.set(subject, p);
      }
      return p;
    },
    draw(target, subject, yaw): void {
      if (lost || disposed) return;
      const entry = subjects.get(subject);
      if (!entry) return;
      const w = Math.min(target.width, TURNTABLE_MAX_PX);
      const h = Math.min(target.height, TURNTABLE_MAX_PX);
      if (w < 1 || h < 1) return;
      const ctx = target.getContext('2d');
      if (!ctx) return;

      const { pivot, height, reach } = entry;
      pivot.rotation.set(0, yaw, 0);
      scene.add(pivot);

      // Frame the model at any yaw: its full height, and its widest reach
      // from the axis, so nothing clips as it turns.
      const aspect = w / h;
      const halfV = THREE.MathUtils.degToRad(FOV / 2);
      const halfH = Math.atan(Math.tan(halfV) * aspect);
      const tall = (height * Math.cos(ELEVATION) + reach * 2 * Math.sin(ELEVATION)) / 2;
      // The near side of the model sits up to `reach` closer than the axis and
      // looks bigger, hence the extra pull-back.
      const dist = Math.max(tall / Math.tan(halfV), reach / Math.tan(halfH)) * 1.04 + reach * 0.6;
      const aimY = height * 0.46;
      camera.aspect = aspect;
      camera.position.set(0, aimY + Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
      camera.lookAt(0, aimY, 0);
      camera.near = Math.max(0.01, dist - reach * 3);
      camera.far = dist + reach * 3 + height;
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
      ctx.drawImage(renderer.domElement, 0, TURNTABLE_MAX_PX - h, w, h, 0, 0, target.width, target.height);
    },
    onLost(cb): void {
      lostCbs.push(cb);
    },
    dispose(): void {
      disposed = true;
      for (const s of subjects.values()) {
        if (!s.vehicle) continue;
        for (const g of s.vehicle.geometries) g.dispose();
        for (const m of s.vehicle.materials) m.dispose();
      }
      subjects.clear();
      // The registries own every GLB clone's geometry and materials.
      for (const r of registries.values()) r.dispose();
      registries.clear();
      lights.envRT.dispose();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
