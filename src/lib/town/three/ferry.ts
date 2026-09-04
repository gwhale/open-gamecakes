// The Cakey Ferry — a candy barge that carries the cupcake across the wide sea
// channel to Chess Island (which "sailed off to its own island"; see the engine's
// islandNd channel + regions.ts chess-club).
//
// Unlike the Sugar Express train (an endless perimeter loop), the ferry is
// POINT-TO-POINT with a set destination: it sits docked, you `depart(dest)`, it
// sails a fixed curve A→B across the channel, and latches "arrived" for one frame.
// A 2-state machine — docked(at) | sailing(from→to,t) — a return trip is just
// depart() the other way, so it's symmetric with no extra code.
//
// This module owns ALL the ferry-related VISUALS (the boat + two shore piers)
// and the transport math. The engine owns the gameplay: gluing the avatar while
// `ferrying`, the 1-token fare, and discovering Chess on arrival. The barrier is
// the REAL sea (the wide islandNd channel) — no invisible walls. Like train.ts:
// no runtime `three` import (namespace passed in), gameplay math in city PIXELS,
// scene units only at mesh placement.

import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ } from './types';
import { RIBBON, CAKE, WOOD } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat, glowSprite } from './materials';

type ThreeGroup = import('three').Group;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;
type Texture = import('three').Texture;
type Scene = import('three').Scene;

/** Which dock a stop is. The ferry only knows these ids; the engine maps 'chess'
 *  → discover chess-club. Designed to generalize to more island stops later. */
export type FerryStop = 'mainland' | 'chess';

/** The boat floats on the REAL sea now (Chess is carved into a true island by a
 *  water channel in the engine), so the hull sits at the sea surface. Matches the
 *  engine's WATER_Y. */
const FERRY_FLOAT_Y = -0.3;
/** Boat-local height of the deck the cupcake stands on (above the hull). */
const DECK_Y = 0.5;
/** Absolute world-Y the cupcake stands at while aboard = waterline + deck. The
 *  engine reads this to place the rider on the boat. */
export const FERRY_RIDE_Y = FERRY_FLOAT_Y + DECK_Y;

/** Sail speed (px/s) — gentler than the 300 train; a ferry is a calm crossing. */
const FERRY_SPEED_PX = 170;

/** Ferry dock/board/arrive points, computed by the ENGINE from the two islands'
 *  real shorelines (it has the per-island land field) and passed into createFerry.
 *  All city-px. The docks sit in the open water off each island's shore facing
 *  the other; the board point is on solid mainland shore; arrival is Chess's dry
 *  center. Works at any island placement — no baked-in orientation. */
export interface FerryLayout {
  mainlandDockPx: { x: number; y: number };
  chessDockPx: { x: number; y: number };
  mainlandBoardPx: { x: number; y: number };
  arrivePx: { x: number; y: number };
}

export interface TownFerry {
  group: ThreeGroup;
  /** Advance the ferry. dt in MILLISECONDS (matches the engine loop). */
  update(dt: number): void;
  /** Begin a directed sail to `dest`. Returns false if already sailing or
   *  already docked there. */
  depart(dest: FerryStop): boolean;
  /** 'docked' | 'sailing'. */
  getState(): 'docked' | 'sailing';
  /** Which dock the boat is tied up at, or null while sailing. */
  getDockedAt(): FerryStop | null;
  /** Current boat position in city pixels (where the rider is glued). */
  getPositionPx(): { x: number; y: number };
  /** Unit heading in px-space (camera look-ahead + rider facing). */
  getHeadingPx(): { x: number; y: number };
  /** Returns the destination stop ONCE on the frame it arrives, else null. */
  consumeArrival(): FerryStop | null;
  dispose(scene: Scene): void;
}

export function createFerry(THREE: ThreeNS, reduceMotion: boolean, L: FerryLayout): TownFerry {
  const group = new THREE.Group();
  const geos: BufferGeometry[] = [];
  const mats: Material[] = [];
  const texs: Texture[] = [];
  const track = <T extends BufferGeometry | Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geos.push(x as BufferGeometry);
    else mats.push(x as Material);
    return x;
  };

  // (No cosmetic water plane any more — Chess is carved into a real island by the
  // engine's water channel, so the actual sea renders the crossing.)

  // ---- Two mooring pads — small candy jetties where the boat ties up in the
  // water off each island's shore. Pure decor (the kid boards from land + arrives
  // on land), and orientation-AGNOSTIC (a square pad) so they sit right whatever
  // angle the sea crossing runs. Deck at shore level, pilings into the real sea. ----
  const DOCK_DECK_Y = 0.0;
  const padPlankMat = track(cookieMat(THREE, WOOD.PLANK_LIGHT));
  const padStripeMat = track(cakeMat(THREE, WOOD.PLANK));
  const padPostMat = track(cakeMat(THREE, WOOD.POST));
  const padGeo = track(new THREE.BoxGeometry(1.5, 0.14, 1.5));
  const padStripeGeo = track(new THREE.BoxGeometry(0.4, 0.15, 1.5));
  const padPostLen = DOCK_DECK_Y - (FERRY_FLOAT_Y - 0.6);
  const padPostGeo = track(new THREE.CylinderGeometry(0.1, 0.12, padPostLen, 8));
  const buildDockPad = (px: { x: number; y: number }): void => {
    const sx = pxToSceneX(px.x);
    const sz = pxToSceneZ(px.y);
    const pad = new THREE.Mesh(padGeo, padPlankMat);
    pad.position.set(sx, DOCK_DECK_Y, sz);
    pad.receiveShadow = true;
    group.add(pad);
    const stripe = new THREE.Mesh(padStripeGeo, padStripeMat);
    stripe.position.set(sx, DOCK_DECK_Y + 0.002, sz);
    group.add(stripe);
    for (const ox of [-0.6, 0.6]) {
      for (const oz of [-0.6, 0.6]) {
        const post = new THREE.Mesh(padPostGeo, padPostMat);
        post.position.set(sx + ox, DOCK_DECK_Y - padPostLen / 2, sz + oz);
        group.add(post);
      }
    }
  };
  buildDockPad(L.mainlandDockPx);
  buildDockPad(L.chessDockPx);

  // ---- The boat: a wafer barge with a frosting deck, purple ribbon sail ----
  const boat = new THREE.Group();
  group.add(boat);
  // Hull (biscuit) — a shallow box with an angled bow wedge at the front (+z).
  const hullMat = track(cookieMat(THREE, WOOD.PLANK));
  const hull = new THREE.Mesh(track(new THREE.BoxGeometry(1.25, 0.34, 1.9)), hullMat);
  hull.position.y = 0.17;
  hull.castShadow = true;
  boat.add(hull);
  const bow = new THREE.Mesh(track(new THREE.BoxGeometry(1.25, 0.34, 0.5)), hullMat);
  bow.position.set(0, 0.17, 1.1);
  bow.scale.x = 0.55; // taper the prow
  boat.add(bow);
  // Frosting deck the cupcake stands on — top at DECK_Y (boat-local).
  const deck = new THREE.Mesh(
    track(new THREE.BoxGeometry(1.1, 0.12, 1.7)),
    track(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 })),
  );
  deck.position.y = DECK_Y - 0.06;
  deck.receiveShadow = true;
  boat.add(deck);
  // Side rails so it reads as a boat you stand IN, not on.
  const railMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  for (const ox of [-0.56, 0.56]) {
    const rail = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.2, 1.7)), railMat);
    rail.position.set(ox, DECK_Y + 0.06, 0);
    boat.add(rail);
  }
  // Gumdrop bumpers along the gunwale.
  const gumGeo = track(new THREE.SphereGeometry(0.12, 10, 8));
  const gumColors = [0xff6b9d, 0xffd166, 0x8ad6ff, 0xb388ff];
  gumColors.forEach((c, i) => {
    const gum = new THREE.Mesh(gumGeo, track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })));
    const side = i % 2 === 0 ? -0.6 : 0.6;
    gum.position.set(side, 0.32, -0.6 + (i % 2 === 0 ? 0 : 0) + (i < 2 ? 0.5 : -0.5));
    boat.add(gum);
  });
  // Candy-cane mast + a Chess-PURPLE ribbon sail (color-codes the destination).
  const mast = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8)),
    track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })),
  );
  mast.position.set(0, DECK_Y + 0.6, -0.2);
  boat.add(mast);
  const sailMat = track(
    new THREE.MeshStandardMaterial({ color: RIBBON.PURPLE, roughness: 0.6, side: THREE.DoubleSide }),
  );
  const sail = new THREE.Mesh(track(new THREE.PlaneGeometry(0.9, 0.9)), sailMat);
  sail.position.set(0.28, DECK_Y + 0.7, -0.2);
  sail.rotation.y = Math.PI / 2;
  boat.add(sail);
  // Warm bow lantern (reuse the train headlamp glow sprite).
  const lamp = glowSprite(THREE, 0xffdd88, 0.7, 0.75);
  texs.push(lamp.tex);
  mats.push(lamp.mat);
  lamp.sprite.position.set(0, 0.5, 1.2);
  boat.add(lamp.sprite);

  // ---- Path: a quadratic bezier between the two docks, bowed east so the
  // crossing curves gently rather than a dead-straight slide. ----
  const A = L.mainlandDockPx;
  const B = L.chessDockPx;
  const ctrl = { x: (A.x + B.x) / 2 + 90, y: (A.y + B.y) / 2 };
  const bezier = (from: { x: number; y: number }, to: { x: number; y: number }, t: number) => {
    const u = 1 - t;
    const x = u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x;
    const y = u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y;
    // derivative for heading
    const dx = 2 * u * (ctrl.x - from.x) + 2 * t * (to.x - ctrl.x);
    const dy = 2 * u * (ctrl.y - from.y) + 2 * t * (to.y - ctrl.y);
    const len = Math.hypot(dx, dy) || 1;
    return { x, y, hx: dx / len, hy: dy / len };
  };
  const arcLen = (from: { x: number; y: number }, to: { x: number; y: number }): number => {
    let last = bezier(from, to, 0);
    let sum = 0;
    for (let i = 1; i <= 16; i++) {
      const p = bezier(from, to, i / 16);
      sum += Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
    }
    return sum;
  };

  // ---- State ----
  type State =
    | { kind: 'docked'; at: FerryStop }
    | { kind: 'sailing'; from: FerryStop; to: FerryStop; t: number; lenPx: number };
  const dockPx: Record<FerryStop, { x: number; y: number }> = { mainland: A, chess: B };
  // Resting heading: face along the crossing toward Chess.
  const restLen = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const restH = { hx: (B.x - A.x) / restLen, hy: (B.y - A.y) / restLen };
  let state: State = { kind: 'docked', at: 'mainland' };
  let cur = { x: A.x, y: A.y, ...restH };
  let arrivedLatch: FerryStop | null = null;
  let bob = 0;

  const place = (): void => {
    boat.position.set(pxToSceneX(cur.x), FERRY_FLOAT_Y + (reduceMotion ? 0 : Math.sin(bob) * 0.02), pxToSceneZ(cur.y));
    // Boat forward is +Z; point it along the heading (or resting orientation).
    boat.rotation.y = Math.atan2(cur.hx, cur.hy);
    if (!reduceMotion) boat.rotation.z = Math.sin(bob * 0.7) * 0.03; // gentle roll
  };
  // Initial resting pose at the mainland dock, facing Chess.
  cur = { x: A.x, y: A.y, ...restH };
  place();

  return {
    group,
    update(dt: number): void {
      if (!reduceMotion) bob += dt * 0.003;
      if (state.kind === 'sailing') {
        const from = dockPx[state.from];
        const to = dockPx[state.to];
        state.t += (FERRY_SPEED_PX * dt) / 1000 / (state.lenPx || 1);
        if (state.t >= 1) {
          cur = { ...bezier(from, to, 1), };
          arrivedLatch = state.to;
          state = { kind: 'docked', at: state.to };
        } else {
          cur = bezier(from, to, state.t);
        }
      }
      place();
    },
    depart(dest: FerryStop): boolean {
      if (state.kind !== 'docked' || state.at === dest) return false;
      const from = state.at;
      state = { kind: 'sailing', from, to: dest, t: 0, lenPx: arcLen(dockPx[from], dockPx[dest]) };
      return true;
    },
    getState(): 'docked' | 'sailing' {
      return state.kind;
    },
    getDockedAt(): FerryStop | null {
      return state.kind === 'docked' ? state.at : null;
    },
    getPositionPx(): { x: number; y: number } {
      return { x: cur.x, y: cur.y };
    },
    getHeadingPx(): { x: number; y: number } {
      return { x: cur.hx, y: cur.hy };
    },
    consumeArrival(): FerryStop | null {
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
