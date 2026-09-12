// The Sunken Batterlands engine — a second, separate 3D world.
//
// Shaped deliberately like createTownEngine(): a factory that takes the `three`
// namespace and a container, returns an interface, and talks to its host purely
// through callbacks. Same contract, own file, own render loop. The town's engine
// is already ~4,900 lines and there is no version of "add an ocean to it" that
// leaves either world easier to work on.
//
// UNITS ARE METRES here, not the town's city-pixels (see types.ts). The two
// spaces touch at exactly one point — the dock in Caramel Cove — and nothing
// crosses it but the fact that a kid went diving.
//
// No runtime `three` import; DeepHost dynamic-imports both this and three
// inside a useEffect, so no WebGL reaches the server bundle.

import type * as THREE from 'three';
import type { ThreeNS, DeepProps } from './types';
import {
  CAM_BACK_M,
  CAM_HEIGHT_M,
  CAM_LERP,
  DOMAIN_RADIUS_M,
  POSITION_POST_INTERVAL_MS,
} from './types';
import { createTerrain } from './terrain';
import { createScenery } from './scenery';
import { createKelp } from './kelp';
import { createFauna } from './fauna';
import { createSubmarine, type SubInput } from './submarine';
import { createSonar, type SonarReturn } from './sonar';
import { createWaterSurface } from './water-surface';
import { createLandmarks, type Landmark } from './landmarks';
import { waterAtDepth } from './biome';

export interface DeepCallbacks {
  /** Depth in metres (rounded) — drives the HUD's depth meter. */
  onDepth(depthM: number): void;
  /** Sonar answered. An EMPTY array means the sweep finished having found
   *  nothing, which is a real and important answer: it is how a kid learns
   *  that where they are is empty and somewhere else is not. */
  onSonar(returns: SonarReturn[]): void;
  /** Sonar became available again — host re-enables the button. */
  onSonarReady(): void;
  /** A landmark came within reach, or went back out of it. */
  onNearLandmark(landmark: { id: string; prompt: string } | null): void;
  /** The kid interacted with a landmark. */
  onInteract(id: string): void;
  /** Pressed against the hull's depth limit, or no longer. */
  onDepthLimit(atLimit: boolean): void;
  /** Which band the sub is in, for Cakey's radio. Fires only on change. */
  onBand(band: 'reef' | 'drop' | 'canyon'): void;
  /** Throttled pose save — host fire-and-forgets POST /api/deep/state. Carries
   *  the current depth so the server can raise the kid's deepest-ever. */
  onPositionUpdate(payload: {
    x: number;
    y: number;
    z: number;
    heading: number;
    depth: number;
  }): void;
  /** A new personal deepest, in metres. Fires once per new record, so the host
   *  can make something of it rather than the number just quietly ticking. */
  onNewRecord(depthM: number): void;
}

export interface DeepEngine {
  /** Feed the controls. The host owns keyboard and touch; the engine sees
   *  neither, so both paths are provably the same input. */
  setInput(input: Partial<SubInput>): void;
  /** Fire sonar. Returns false if still on cooldown. */
  pingSonar(): boolean;
  /** Act on whatever is currently in reach. No-op if nothing is. */
  interact(): void;
  /** Swing a chest's lid. The host owns this because opening is EARNED -- see
   *  the gate in components/deep/ChestGate.tsx -- and the engine has no idea
   *  whether the questions were answered. */
  openChest(slug: string): void;
  setPaused(paused: boolean): void;
  /** Current pose, for a save-before-navigate on the way out. The throttled
   *  timer alone would lose up to four seconds of driving every time a kid
   *  surfaces, which is exactly the moment the position matters most. */
  getState(): { x: number; y: number; z: number; heading: number; depth: number };
  resize(): void;
  dispose(): void;
}

export function createDeepEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: DeepProps,
  cb: DeepCallbacks,
): DeepEngine {
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    62,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.5,
    // Far plane just past the bowl. Fog closes long before this, but a far
    // plane that clips the seabed reads as a hole in the world.
    DOMAIN_RADIUS_M * 2.6,
  );

  // Fog IS the water, and it is also the performance budget: it is why a
  // 1.2km seabed can be one draw call without the far side looking like a
  // plate. Density and colour are re-set every frame from the current depth.
  const fog = new THREE.FogExp2(0x38bdf8, 0.01);
  scene.fog = fog;
  scene.background = new THREE.Color(0x38bdf8);

  // ---------- Lights ----------
  // Sunlight from above, tinted by depth. There is no shadow map: at this fog
  // density nothing casts a shadow anyone can see, and it would cost a second
  // pass over the whole seabed for it.
  const sun = new THREE.DirectionalLight(0xdff3ff, 1.1);
  sun.position.set(60, 300, -80);
  scene.add(sun);
  const ambient = new THREE.HemisphereLight(0xbfe9ff, 0x2b3f42, 0.9);
  scene.add(ambient);

  // ---------- World ----------
  const terrain = createTerrain(THREE);
  scene.add(terrain.mesh);
  const scenery = createScenery(THREE);
  scene.add(scenery.group);
  const kelp = createKelp(THREE);
  scene.add(kelp.group);
  const fauna = createFauna(THREE);
  scene.add(fauna.group);
  // `found` was declared on DeepProps from the start and never read: with one
  // findable object there was nothing for it to change. Now it decides which
  // chests are already standing open when the kid arrives.
  const landmarks = createLandmarks(THREE, new Set(props.found ?? []));
  scene.add(landmarks.group);

  const sub = createSubmarine(THREE, props.spawn);
  scene.add(sub.group);

  const sonar = createSonar(THREE, (returns) => cb.onSonar(returns));
  scene.add(sonar.group);

  // The surface. Without a ceiling the reef reads as open sky and the kid has
  // no sense of being UNDER anything — and coming back up has to be worth
  // something too, so it is shaded on both faces. See water-surface.ts.
  const water = createWaterSurface(THREE);
  scene.add(water.mesh);

  // ---------- State ----------
  const input: SubInput = { throttle: 0, steer: 0, climb: 0, boost: false };
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let sonarWasBusy = false;
  let lastDepthReported = -1;
  let lastNearId: string | null = null;
  let lastLimit = false;
  let lastBand: 'reef' | 'drop' | 'canyon' | null = null;
  let near: Landmark | null = null;
  let sincePost = 0;
  // Seeded from the kid's saved record so surfacing and diving again does not
  // re-announce a depth they already reached weeks ago.
  //
  // ROUNDED, and that matters: the record is compared against Math.round(depth)
  // below, while the stored value is a raw float. Seeding with 109.72 and then
  // comparing 110 > 109.72 declared a NEW DEEPEST the instant a resumed dive
  // finished loading, every single time. Both sides round or neither does.
  let bestDepth = Math.round(props.bestDepthM ?? 0);

  const camTarget = new THREE.Vector3();
  const camWanted = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const fogColor = new THREE.Color();

  // Start the camera behind the sub rather than lerping in from the origin,
  // which would open the dive with an unexplained swoop across the reef.
  camWanted.set(
    sub.position.x + Math.sin(sub.heading) * CAM_BACK_M,
    sub.position.y + CAM_HEIGHT_M,
    sub.position.z + Math.cos(sub.heading) * CAM_BACK_M,
  );
  camera.position.copy(camWanted);

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused) return;
    elapsed += dt;

    sub.update(dt, input);
    sonar.update(dt);
    landmarks.update(dt, elapsed);
    kelp.update(elapsed);
    fauna.update(dt, elapsed, sub.position);

    // ---- Water look follows depth, continuously ----
    const depth = sub.depth();
    const look = waterAtDepth(depth);
    fogColor.setHex(look.water);
    fog.color.copy(fogColor);
    (scene.background as THREE.Color).copy(fogColor);
    fog.density = look.fogDensity;
    ambient.intensity = look.ambient;
    sun.intensity = look.ambient * 0.9;
    sub.setLampIntensity(look.lampIntensity);
    // The surface fades as you leave it behind, so the reef's ceiling does not
    // hang over the canyon like a lid — and comes alive as you climb back to it.
    water.update(elapsed, depth, fogColor, sub.position.x, sub.position.z);

    // ---- Chase camera ----
    // At the wall, the camera DIPS a little to look past the sub at what is
    // below it. Small on purpose: the first attempt dipped 30m and shoved the
    // submarine clean off the top of the screen, which trades one thing you
    // cannot see for another. 6m tilts the view without losing the boat.
    //
    // The dip alone was never the fix, though. What actually made the glows
    // visible was exempting them from fog (landmarks.ts) — down there the murk
    // closes at ~90m and it was swallowing the one thing the dive is for.
    const limited = sub.atLimit();
    camWanted.set(
      sub.position.x + Math.sin(sub.heading) * CAM_BACK_M,
      sub.position.y + CAM_HEIGHT_M,
      sub.position.z + Math.cos(sub.heading) * CAM_BACK_M,
    );
    // Frame-rate independent smoothing. A raw lerp(0.06) is 0.06 *per frame*,
    // so the camera would be twice as loose at 30fps as at 60 — the classic
    // bug where a vehicle feels different on a tablet than on a laptop.
    const k = 1 - Math.pow(1 - CAM_LERP, dt * 60);
    camera.position.lerp(camWanted, k);
    camTarget.copy(sub.position);
    if (limited) camTarget.y -= 6;
    lookAt.lerp(camTarget, Math.min(1, k * 2));
    camera.lookAt(lookAt);

    // ---- Report state, only on change ----
    const rounded = Math.round(depth);
    if (rounded !== lastDepthReported) {
      lastDepthReported = rounded;
      cb.onDepth(rounded);
    }

    // A new personal deepest. Compared on the ROUNDED metre, because a record
    // that fires on the 0.003m the sub drifts while sitting still is not a
    // record, it is a stutter.
    if (rounded > bestDepth) {
      bestDepth = rounded;
      cb.onNewRecord(rounded);
    }

    sincePost += dt;
    if (sincePost >= POSITION_POST_INTERVAL_MS / 1000) {
      sincePost = 0;
      cb.onPositionUpdate({
        x: sub.position.x,
        y: sub.position.y,
        z: sub.position.z,
        heading: sub.heading,
        depth,
      });
    }

    const band = depth < 100 ? 'reef' : depth < 300 ? 'drop' : 'canyon';
    if (band !== lastBand) {
      lastBand = band;
      cb.onBand(band);
    }

    if (limited !== lastLimit) {
      lastLimit = limited;
      cb.onDepthLimit(limited);
    }

    near = landmarks.nearest(sub.position);
    const nearId = near?.id ?? null;
    if (nearId !== lastNearId) {
      lastNearId = nearId;
      cb.onNearLandmark(near ? { id: near.id, prompt: near.prompt } : null);
    }

    const busy = sonar.busy();
    if (sonarWasBusy && !busy) cb.onSonarReady();
    sonarWasBusy = busy;

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return {
    setInput(next: Partial<SubInput>) {
      Object.assign(input, next);
    },

    pingSonar(): boolean {
      return sonar.fire(sub.position, sub.heading, landmarks.contacts);
    },

    interact() {
      if (!near) return;
      // The lid does NOT swing here any more. It used to, on the reasoning that
      // a kid who tapped the button had earned the animation whether or not the
      // grant landed. That was right when tapping WAS the whole interaction; now
      // three questions stand between the tap and the item, and a lid that flew
      // open before the first question would give away the ending.
      //
      // The host calls openChest() when the gate is passed.
      cb.onInteract(near.id);
    },

    openChest(slug: string) {
      landmarks.openChest(slug);
    },

    getState() {
      return {
        x: sub.position.x,
        y: sub.position.y,
        z: sub.position.z,
        heading: sub.heading,
        depth: sub.depth(),
      };
    },

    setPaused(next: boolean) {
      paused = next;
      // Reset the clock on resume, or the first frame back carries the whole
      // paused duration as one delta.
      if (!next) last = performance.now();
    },

    resize() {
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    },

    dispose() {
      cancelAnimationFrame(raf);
      for (const geo of [
        ...terrain.geometries,
        ...scenery.geometries,
        ...kelp.geometries,
        ...fauna.geometries,
        ...landmarks.geometries,
        ...sub.geometries,
        ...sonar.geometries,
        water.geometry,
      ]) {
        geo.dispose();
      }
      for (const mat of [
        ...terrain.materials,
        ...scenery.materials,
        ...kelp.materials,
        ...fauna.materials,
        ...landmarks.materials,
        ...sub.materials,
        ...sonar.materials,
        water.material,
      ]) {
        mat.dispose();
      }
      for (const tex of [...landmarks.textures, ...sub.textures]) tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
