// The Sugar Mile Bus — a candy coach that shuttles the cupcake across the road
// bridge to Race Island.
//
// THIS IS TRANSIT, NOT A VEHICLE. It is deliberately NOT a rentable ride:
//   * it has no VehicleKind and never sets the engine's `vehicleKind`
//   * there is no kid_vehicle_rentals row and nothing to own or expire
//   * the kid does not steer it — they board, it drives, they arrive
//   * it is always standing at its stop, for everyone, wallet or not
// It is the ferry's twin (see ferry.ts) with the boat swapped for a bus and the
// sea crossing swapped for a straight run down the bridge deck. The engine owns
// the gameplay: gluing the avatar while `busing`, the fare, and discovering the
// island on arrival.
//
// Like train.ts / ferry.ts: no runtime `three` import (namespace threaded in),
// gameplay math in city PIXELS, scene units only at mesh placement.

import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ } from './types';
import { CAKE, RIBBON, WOOD } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat, glowSprite } from './materials';

type ThreeGroup = import('three').Group;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;
type Texture = import('three').Texture;
type Scene = import('three').Scene;

/** Which end of the bridge a stop is. The bus only knows these ids; the engine
 *  maps 'race' → discover race-pit-row. */
export type BusStop = 'mainland' | 'race';

/** Height of the bus floor the cupcake stands on (scene units). The deck of the
 *  bridge is at y = 0, so this is purely the bus's own step-up. */
const BUS_FLOOR_Y = 0.62;
/** Absolute world-Y the cupcake rides at. The engine reads this. */
export const BUS_RIDE_Y = BUS_FLOOR_Y;

/** Road speed (px/s). Brisker than the 170px/s ferry — it's a bus on a road,
 *  not a barge on a swell — but still slower than the 340px/s jeep, so driving
 *  yourself stays the quicker option.
 *
 *  Raised 230 → 300 when Race Island moved further out to sea: the deck went
 *  from ~1,535px to ~2,061px, which at the old speed made the ride a 9-second
 *  scripted sit-through with nothing to do. ~6.9s now. Still under the jeep, so
 *  the incentive to own wheels is intact. */
const BUS_SPEED_PX = 300;

export interface BusLayout {
  /** Stop position on the mainland end of the bridge (city px). */
  mainlandStopPx: { x: number; y: number };
  /** Stop position on the island end (city px). */
  raceStopPx: { x: number; y: number };
  /** Where to set the cupcake down after arriving on the island — guaranteed
   *  dry land, well clear of the deck. */
  arrivePx: { x: number; y: number };
}

export interface TownBus {
  group: ThreeGroup;
  /** Advance the bus. dt in MILLISECONDS (matches the engine loop). */
  update(dt: number): void;
  /** Begin a run to `dest`. False if already driving or already parked there. */
  depart(dest: BusStop): boolean;
  getState(): 'parked' | 'driving';
  getParkedAt(): BusStop | null;
  getPositionPx(): { x: number; y: number };
  getHeadingPx(): { x: number; y: number };
  /** Returns the destination stop ONCE on the frame it arrives, else null. */
  consumeArrival(): BusStop | null;
  dispose(scene: Scene): void;
}

export function createBus(THREE: ThreeNS, reduceMotion: boolean, L: BusLayout): TownBus {
  const group = new THREE.Group();
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: Texture[] = [];
  const track = <T extends BufferGeometry | Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geos.push(x as BufferGeometry);
    else mats.push(x as Material);
    return x;
  };

  // ---- Route geometry first: the shelters need the road direction ----
  const A = L.mainlandStopPx;
  const B = L.raceStopPx;
  const stopPx: Record<BusStop, { x: number; y: number }> = { mainland: A, race: B };
  const routeLen = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const restH = { hx: (B.x - A.x) / routeLen, hy: (B.y - A.y) / routeLen };
  /** Shelters stand BESIDE the road, not on it — offset along the perpendicular
   *  so the bus never appears to drive through its own bus stop. */
  const SHELTER_OFF_PX = 105;
  const beside = (p: { x: number; y: number }): { x: number; y: number } => ({
    x: p.x - restH.hy * SHELTER_OFF_PX,
    y: p.y + restH.hx * SHELTER_OFF_PX,
  });

  // ---- Bus shelters at both stops ----
  // Orientation-agnostic (a simple canopy on posts) so they sit right whatever
  // angle the bridge runs, same reasoning as the ferry's square mooring pads.
  const shelterPostMat = track(cakeMat(THREE, WOOD.POST));
  const shelterRoofMat = track(new THREE.MeshStandardMaterial({ color: RIBBON.STRAWBERRY, roughness: 0.5 }));
  const shelterPostGeo = track(new THREE.CylinderGeometry(0.07, 0.08, 1.5, 8));
  const shelterRoofGeo = track(new THREE.BoxGeometry(1.9, 0.12, 1.3));
  const signGeo = track(new THREE.BoxGeometry(0.5, 0.5, 0.04));
  const signMat = track(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.6 }));
  const buildShelter = (px: { x: number; y: number }): void => {
    const sx = pxToSceneX(px.x);
    const sz = pxToSceneZ(px.y);
    for (const ox of [-0.8, 0.8]) {
      for (const oz of [-0.55, 0.55]) {
        const post = new THREE.Mesh(shelterPostGeo, shelterPostMat);
        post.position.set(sx + ox, 0.75, sz + oz);
        post.castShadow = true;
        group.add(post);
      }
    }
    const roof = new THREE.Mesh(shelterRoofGeo, shelterRoofMat);
    roof.position.set(sx, 1.56, sz);
    roof.castShadow = true;
    group.add(roof);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(sx, 1.15, sz + 0.58);
    group.add(sign);
  };
  buildShelter(beside(L.mainlandStopPx));
  buildShelter(beside(L.raceStopPx));

  // ---- The bus: a long wafer coach, strawberry body, frosting roof ----
  const bus = new THREE.Group();
  group.add(bus);
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: CAKE.STRAWBERRY, roughness: 0.45 }));
  // Body forward is +Z (matches the ferry/vehicle orientation contract).
  const body = new THREE.Mesh(track(new THREE.BoxGeometry(1.15, 0.85, 2.7)), bodyMat);
  body.position.y = BUS_FLOOR_Y + 0.18;
  body.castShadow = true;
  bus.add(body);
  const roof = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.2, 0.14, 2.75)),
    track(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 })),
  );
  roof.position.y = BUS_FLOOR_Y + 0.67;
  bus.add(roof);
  // Windows: a band of candy-glass panes down both flanks.
  const paneGeo = track(new THREE.BoxGeometry(0.04, 0.32, 0.5));
  const paneMat = track(new THREE.MeshStandardMaterial({ color: RIBBON.BLUE, roughness: 0.25 }));
  for (const ox of [-0.59, 0.59]) {
    for (let i = 0; i < 4; i++) {
      const pane = new THREE.Mesh(paneGeo, paneMat);
      pane.position.set(ox, BUS_FLOOR_Y + 0.34, -1.0 + i * 0.62);
      bus.add(pane);
    }
  }
  // Windscreen.
  const screen = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.34, 0.04)), paneMat);
  screen.position.set(0, BUS_FLOOR_Y + 0.34, 1.36);
  bus.add(screen);
  // Liquorice wheels.
  const wheelGeo = track(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12));
  const wheelMat = track(cookieMat(THREE, CAKE.CHOCOLATE_DEEP));
  const wheels: import('three').Mesh[] = [];
  for (const ox of [-0.6, 0.6]) {
    for (const oz of [-0.9, 0.9]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(ox, 0.24, oz);
      bus.add(w);
      wheels.push(w);
    }
  }
  // Warm headlamp so it reads at dusk, same recipe as the train/ferry lamp.
  const lamp = glowSprite(THREE, 0xffdd88, 0.7, 0.8);
  texs.push(lamp.tex);
  mats.push(lamp.mat);
  lamp.sprite.position.set(0, BUS_FLOOR_Y + 0.1, 1.5);
  bus.add(lamp.sprite);

  // ---- Run state (route geometry computed above, with the shelters) ----
  type State =
    | { kind: 'parked'; at: BusStop }
    | { kind: 'driving'; from: BusStop; to: BusStop; t: number };
  let state: State = { kind: 'parked', at: 'mainland' };
  let cur = { x: A.x, y: A.y, ...restH };
  let arrivedLatch: BusStop | null = null;
  let wheelSpin = 0;

  const place = (): void => {
    bus.position.set(pxToSceneX(cur.x), 0, pxToSceneZ(cur.y));
    bus.rotation.y = Math.atan2(cur.hx, cur.hy);
    if (!reduceMotion) for (const w of wheels) w.rotation.x = wheelSpin;
  };
  place();

  return {
    group,
    update(dt: number): void {
      if (state.kind === 'driving') {
        const from = stopPx[state.from];
        const to = stopPx[state.to];
        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        state.t += (BUS_SPEED_PX * dt) / 1000 / len;
        const hx = (to.x - from.x) / len;
        const hy = (to.y - from.y) / len;
        if (!reduceMotion) wheelSpin += (BUS_SPEED_PX * dt) / 1000 / 0.24;
        if (state.t >= 1) {
          cur = { x: to.x, y: to.y, hx, hy };
          arrivedLatch = state.to;
          state = { kind: 'parked', at: state.to };
        } else {
          cur = {
            x: from.x + (to.x - from.x) * state.t,
            y: from.y + (to.y - from.y) * state.t,
            hx,
            hy,
          };
        }
      }
      place();
    },
    depart(dest: BusStop): boolean {
      if (state.kind !== 'parked' || state.at === dest) return false;
      state = { kind: 'driving', from: state.at, to: dest, t: 0 };
      return true;
    },
    getState(): 'parked' | 'driving' {
      return state.kind;
    },
    getParkedAt(): BusStop | null {
      return state.kind === 'parked' ? state.at : null;
    },
    getPositionPx(): { x: number; y: number } {
      return { x: cur.x, y: cur.y };
    },
    getHeadingPx(): { x: number; y: number } {
      return { x: cur.hx, y: cur.hy };
    },
    consumeArrival(): BusStop | null {
      const a = arrivedLatch;
      arrivedLatch = null;
      return a;
    },
    dispose(scene: Scene): void {
      scene.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
