// The Sugar Express — a candy train that loops the outside of the whole town.
//
// Builds the train (locomotive + ride cars) and a rail loop that rings the
// mainland coast, OUTSIDE every land. `update(dt)` drives the train forward
// around the loop — continuously, with no stops — and exposes its current
// world-pixel position + heading so the engine can detect "kid near the train"
// (board) and glue the riding cupcake to it.
//
// The ring itself is fitted in train-track.ts (zero-import leaf) and read from
// `sugarExpressRing()` below, which engine.ts shares — see that module's header
// for why the geometry cannot be derived in two places.
//
// Bundle hygiene: type-only `three` import; the live namespace is passed in.
// All gameplay math is in world/city PIXELS (same as engine.ts); scene units
// only at mesh placement via pxToScene*.

import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ } from './types';
import { cityRectPx } from './layout';
import { glowSprite } from './materials';
import { beanNd } from './bean';
import { allIslands } from '@/lib/town/islands';
import { findRegion } from '@/lib/town/regions';
import { fitTrainRing, type TrainRing } from './train-track';

type ThreeGroup = import('three').Group;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;
type Scene = import('three').Scene;

export interface TownTrain {
  group: ThreeGroup;
  /** Advance the train. dt in MILLISECONDS (matches the engine loop). */
  update(dt: number): void;
  /** Current train position in city pixels (the front coupling / where the kid rides). */
  getPositionPx(): { x: number; y: number };
  /** Unit direction of travel in px-space (for camera look-ahead + ride facing). */
  getHeadingPx(): { x: number; y: number };
  dispose(scene: Scene): void;
}

const SPEED_PX = 300; // brisk cruise — 2× the old 150 (now faster than the 220 walk speed)
const TWO_PI = Math.PI * 2;

/** Half the rail bed's width: the gauge (GAUGE_PX) plus the sleeper overhang.
 *  What the fitter keeps ashore and off the lands. */
const RAIL_HALF_PX = 24;

/** Clear space demanded between the rails and any land pad. Comfortably wider
 *  than the rail bed, so the ring reads as running *past* each land rather than
 *  scraping its edge. */
const PAD_CLEAR_PX = 60;

/** How close to the water the rails may get (1 = the shoreline itself). Under 1
 *  so the outer rail always has beach beneath it, never surf. */
const MAX_ND = 0.95;

let ringCache: TrainRing | null = null;

/** The Sugar Express ring, in city px — fitted once, shared by train.ts (rails)
 *  and engine.ts (terrain corridor, mountain/fireworks placement, decor scatter).
 *
 *  The ring used to be an ellipse inscribed in `mainlandBoundsPx` inset by 40px.
 *  An inscribed ellipse only touches the four edge-midpoints, so every land
 *  sitting out toward a corner got clipped — the train ran straight through the
 *  middle of Sprinkle Shore and Caramel Cove (11% of the lap was inside a land
 *  pad). It was also far too timid: its closest approach to the coast was
 *  nd≈0.85, leaving a wide unused margin. Fitting against the real bean and the
 *  real land rects instead pushes the loop out to the coastline where it belongs
 *  and clears every land by design. */
export function sugarExpressRing(): TrainRing {
  if (ringCache) return ringCache;
  const main = allIslands().find((i) => i.id === 'mainland');
  if (!main) throw new Error('sugarExpressRing: no mainland island');
  ringCache = fitTrainRing({
    cx: main.center.x,
    cy: main.center.y,
    halfW: main.halfW,
    halfH: main.halfH,
    nd: (px, py) =>
      beanNd(main.center.x, main.center.y, main.halfW, main.halfH, main.pad, main.stretch, px, py),
    // Every mainland land, at full size — the ring goes around the outside of
    // all of them, not through the gaps between them.
    pads: main.regions
      .map((s) => findRegion(s))
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map((r) => cityRectPx(r)),
    railHalfPx: RAIL_HALF_PX,
    maxNd: MAX_ND,
    padClearPx: PAD_CLEAR_PX,
  });
  return ringCache;
}

// The whole track + train rides on a raised bed. The region "floor" pads are
// 0.12-tall boxes (top at y≈0.12), so a ground-level track (rails at 0.04) got
// buried wherever it crossed a pad. Lifting everything above the pad tops keeps
// the rails visible — reads as a little elevated candy railway.
const TRACK_LIFT = 0.16;
/** Absolute world-Y the cupcake stands at while riding (raised platform floor
 *  top). The engine uses this so the rider sits ON the train, not through it. */
export const TRAIN_RIDE_Y = TRACK_LIFT + 0.44;

export function createTrain(THREE: ThreeNS): TownTrain {
  // The ring: a smooth oval hugging the mainland coast, fitted to run outside
  // every land. Shared with engine.ts via sugarExpressRing() — derived once.
  const { cx, cy, rx, ry } = sugarExpressRing();

  // Point + unit heading at track angle θ.
  const pathAt = (theta: number): { x: number; y: number; hx: number; hy: number } => {
    const x = cx + rx * Math.cos(theta);
    const y = cy + ry * Math.sin(theta);
    const hx = -rx * Math.sin(theta);
    const hy = ry * Math.cos(theta);
    const L = Math.hypot(hx, hy) || 1;
    return { x, y, hx: hx / L, hy: hy / L };
  };
  // Scene-space point on the ellipse at angle θ, offset by `offPx` in radius —
  // used to lay the two parallel rails just inside/outside the centerline.
  const railPt = (theta: number, offPx: number): { sx: number; sz: number } => ({
    sx: pxToSceneX(cx + (rx + offPx) * Math.cos(theta)),
    sz: pxToSceneZ(cy + (ry + offPx) * Math.sin(theta)),
  });

  const group = new THREE.Group();
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: import('three').Texture[] = [];
  const track = <T extends BufferGeometry | Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geos.push(x as BufferGeometry);
    else mats.push(x as Material);
    return x;
  };

  // ---- Rails: two chocolate loops following the ellipse, plus sleepers ----
  // ONE closed TubeGeometry per rail (2 draw calls total) instead of the old
  // 120 box segments per rail — the track was ~285 draw calls of background
  // decoration on the exact device class the town protects. Visually the same
  // chocolate strips, now with smooth (round) rail profiles.
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.8 }));
  const railY = TRACK_LIFT + 0.04; // rails sit on the raised bed, above the pad tops
  const GAUGE_PX = 16; // half the rail separation (≈0.5u gauge)
  const buildRail = (offPx: number): void => {
    const pts: import('three').Vector3[] = [];
    const SEG = 140;
    for (let i = 0; i < SEG; i++) {
      const p = railPt((i / SEG) * TWO_PI, offPx);
      pts.push(new THREE.Vector3(p.sx, 0, p.sz));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const geo = track(new THREE.TubeGeometry(curve, 180, 0.045, 6, true));
    const m = new THREE.Mesh(geo, railMat);
    m.position.y = railY;
    m.receiveShadow = true;
    group.add(m);
  };
  buildRail(-GAUGE_PX);
  buildRail(GAUGE_PX);
  // Sleepers laid across the track — one InstancedMesh (44 instances, 1 draw).
  const tieMat = track(new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.85 }));
  const tieGeo = track(new THREE.BoxGeometry(0.62, 0.05, 0.14));
  const TIES = 44;
  const ties = new THREE.InstancedMesh(tieGeo, tieMat, TIES);
  {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < TIES; i++) {
      const t = (i / TIES) * TWO_PI;
      const c = railPt(t, 0);
      const n = railPt(t + 0.01, 0); // a hair further along → local tangent
      dummy.position.set(c.sx, railY - 0.01, c.sz);
      dummy.rotation.set(0, -Math.atan2(n.sz - c.sz, n.sx - c.sx) + Math.PI / 2, 0);
      dummy.updateMatrix();
      ties.setMatrixAt(i, dummy.matrix);
    }
    ties.instanceMatrix.needsUpdate = true;
  }
  ties.receiveShadow = true;
  group.add(ties);

  // No station platforms: the Sugar Express runs a continuous loop, so there is
  // nowhere to "wait at". Boarding is proximity-based anywhere on the ring (see
  // BOARD_R_PX in engine.ts), which is why the stops could go without stranding
  // anyone — a kid stands by the rails and hops on as it comes past.

  // ---- The train: locomotive (front, +Z) + 2 frosting cars behind ----
  const train = new THREE.Group();
  group.add(train);
  const wheelMat = track(new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.6 }));
  const wheelGeo = track(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12));
  const addWheels = (parent: ThreeGroup, lenZ: number): void => {
    for (const sz of [lenZ / 2 - 0.2, -lenZ / 2 + 0.2]) {
      for (const sx of [-0.42, 0.42]) {
        const w = new THREE.Mesh(wheelGeo, wheelMat);
        w.rotation.z = Math.PI / 2;
        w.position.set(sx, 0.16, sz);
        parent.add(w);
      }
    }
  };

  // Locomotive
  const loco = new THREE.Group();
  loco.position.z = 1.5;
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.5 }));
  const body = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.55, 1.7)), bodyMat);
  body.position.y = 0.45;
  body.castShadow = true;
  loco.add(body);
  const cabMat = track(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 }));
  const cab = new THREE.Mesh(track(new THREE.BoxGeometry(0.8, 0.5, 0.7)), cabMat);
  cab.position.set(0, 0.78, -0.55);
  cab.castShadow = true;
  loco.add(cab);
  // Candy-cane smokestack at the front.
  const stack = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.13, 0.15, 0.5, 10)),
    track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })),
  );
  stack.position.set(0, 0.95, 0.55);
  loco.add(stack);
  // Cherry headlight.
  const light = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.12, 10, 8)),
    track(new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc24a, emissiveIntensity: 1.1, roughness: 0.4 })),
  );
  light.position.set(0, 0.4, 0.9);
  loco.add(light);
  // Soft additive glow so the headlamp reads as a warm candy lantern.
  const lampGlow = glowSprite(THREE, 0xffdd88, 0.85, 0.8);
  texs.push(lampGlow.tex);
  mats.push(lampGlow.mat);
  lampGlow.sprite.position.set(0, 0.4, 1.02);
  loco.add(lampGlow.sprite);
  addWheels(loco, 1.7);
  train.add(loco);

  // Ride platforms — flat open cars the cupcake rides on. The FIRST platform
  // sits at the train origin (local z 0), which is exactly where the engine
  // glues the rider, so the cupcake stands ON a real floor (not floating in the
  // old gap between loco and car). The rest trail behind as more ride cars.
  const PLATFORM_Z = [0, -1.9, -3.8, -5.7];
  const platformColors = [0x6ee7b7, 0xfde68a, 0xfb7185, 0x93c5fd];
  const railWhite = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  PLATFORM_Z.forEach((cz, i) => {
    const car = new THREE.Group();
    car.position.z = cz;
    const floor = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.95, 0.18, 1.55)),
      track(new THREE.MeshStandardMaterial({ color: platformColors[i % platformColors.length], roughness: 0.5 })),
    );
    floor.position.y = 0.35; // top face at 0.44 — the rider stands here
    floor.castShadow = true;
    floor.receiveShadow = true;
    car.add(floor);
    // Side rails so it reads as an open passenger platform.
    for (const sx of [-0.45, 0.45]) {
      const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.22, 1.55)), railWhite);
      rail.position.set(sx, 0.55, 0);
      car.add(rail);
    }
    // Low front/back end bars.
    for (const sz of [-0.74, 0.74]) {
      const bar = new THREE.Mesh(track(new THREE.BoxGeometry(0.92, 0.18, 0.06)), railWhite);
      bar.position.set(0, 0.5, sz);
      car.add(bar);
    }
    addWheels(car, 1.55);
    train.add(car);
  });

  // ---- State ----
  let theta = 0;
  let cur = pathAt(0);

  const place = (): void => {
    cur = pathAt(theta);
    train.position.set(pxToSceneX(cur.x), TRACK_LIFT, pxToSceneZ(cur.y));
    // Forward of the train group is +Z; rotate so it points along heading.
    train.rotation.y = Math.atan2(cur.hx, cur.hy);
  };
  place();

  return {
    group,
    update(dt: number): void {
      // Advance at ~constant linear speed: dθ = distance / |dP/dθ|. No stops —
      // the train just keeps going round.
      const localSpeed = Math.hypot(rx * Math.sin(theta), ry * Math.cos(theta)) || 1;
      theta += (SPEED_PX * dt) / 1000 / localSpeed;
      if (theta >= TWO_PI) theta -= TWO_PI;
      place();
    },
    getPositionPx(): { x: number; y: number } {
      return { x: cur.x, y: cur.y };
    },
    getHeadingPx(): { x: number; y: number } {
      return { x: cur.hx, y: cur.hy };
    },
    dispose(scene: Scene): void {
      scene.remove(group);
      ties.dispose(); // frees the per-instance matrix buffer
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
