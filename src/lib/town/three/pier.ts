// A plank pier for the 3D town — a low boardwalk that runs from a shore land's
// seaward edge out OVER the sea to a deck "plot" where water-game booths sit.
//
// Runs along +x (east) BY DEFAULT, which keeps its walkable footprint an
// axis-aligned rect. Pass `headingRad` and it lays along that city-space bearing
// instead -- Caramel Cove's jetty needs it, because that coast faces about 41
// degrees and a due-east deck there runs very nearly TANGENT to the shoreline:
// it never reaches water however long you make it.
//
// A turned deck cannot be tested with insideRect, so the pier now also returns
// containsPx() -- an ORIENTED test. Using the bounding box instead would let a
// kid walk on open water in the two corners beside a diagonal jetty, which is
// the kind of thing nothing in the build would ever complain about.
//
// The deck top sits at
// y≈0 (same as the shore ground + booth bases), with pilings dropping into the
// water below. No runtime `three` import — the namespace arrives as an argument;
// the caller owns disposal via the returned geo/mat arrays.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import type { RectPx } from './layout';
import { WOOD, RIBBON, CAKE } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat } from './materials';

export interface Pier {
  group: THREE.Group;
  /** Walkable footprint (city-px) of the whole boardwalk — the engine makes
   *  this walkable (over deep water) when its region is discovered. */
  deckRect: RectPx;
  /** Oriented walkable test (city-px). Use this, not deckRect, to decide
   *  whether a kid is standing on the deck: for a turned pier the rect is only
   *  the bounding box and includes open water. */
  containsPx: (px: number, py: number) => boolean;
  /** Where to plant booths on the far end of the deck (city-px). */
  boothAnchorsPx: Array<{ x: number; y: number }>;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

export function makePier(
  THREE: ThreeNS,
  opts: {
    /** Seaward edge midpoint of the land — the deck starts here. */
    originPx: { x: number; y: number };
    /** How far out over the water the boardwalk runs (px). */
    lengthPx: number;
    /** City-space bearing the deck runs along, radians. 0 (default) is due
     *  east, which is what every shore-land pier has always used. */
    headingRad?: number;
    /** Half the boardwalk width (px). */
    halfWidthPx: number;
    /** Water surface Y (scene units) — pilings drop below it. */
    waterY: number;
    /** How many booths sit on the far deck. */
    boothCount: number;
  },
): Pier {
  const { originPx, lengthPx, halfWidthPx, waterY, boothCount } = opts;
  const heading = opts.headingRad ?? 0;
  // Along-deck and across-deck unit vectors in city space.
  const ux = Math.cos(heading);
  const uy = Math.sin(heading);
  const vx = -Math.sin(heading);
  const vy = Math.cos(heading);
  /** City-px point `d` along the deck and `off` across it. */
  const at = (d: number, off = 0): { x: number; y: number } => ({
    x: originPx.x + ux * d + vx * off,
    y: originPx.y + uy * d + vy * off,
  });
  // Scene Y-rotation for a city-space bearing. Both pxToScene axes are
  // positive-scale linear, so this is the same convention makeBridge uses to
  // span two islands at an angle (bridge.ts: rotation.y = -atan2(dz, dx)).
  const yaw = -heading;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const push = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geometries.push(x as THREE.BufferGeometry);
    else materials.push(x as THREE.Material);
    return x;
  };

  const widthU = (halfWidthPx * 2) / PX_PER_UNIT;
  const DECK_TOP = 0.0; // deck surface sits at ground level (booth bases at y=0)
  const DECK_T = 0.14; // plank thickness

  // ---- Planks: alternating boardwalk boards running across the walkway ----
  const plankLightMat = push(cookieMat(THREE, WOOD.PLANK_LIGHT));
  const plankMat = push(cakeMat(THREE, WOOD.PLANK));
  const PLANK_W_U = 0.5;
  const plankGeo = push(new THREE.BoxGeometry(PLANK_W_U * 0.92, DECK_T, widthU));
  const lengthU = lengthPx / PX_PER_UNIT;
  const nPlanks = Math.max(1, Math.round(lengthU / PLANK_W_U));
  for (let i = 0; i < nPlanks; i++) {
    const c = at(((i + 0.5) / nPlanks) * lengthPx);
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankLightMat : plankMat);
    plank.position.set(pxToSceneX(c.x), DECK_TOP - DECK_T / 2, pxToSceneZ(c.y));
    plank.rotation.y = yaw;
    plank.receiveShadow = true;
    group.add(plank);
  }

  // ---- Pilings: posts dropping from the deck into the water on both edges ----
  const postMat = push(cakeMat(THREE, WOOD.POST));
  const pilingLen = DECK_TOP - (waterY - 0.6);
  const pilingGeo = push(new THREE.CylinderGeometry(0.12, 0.14, pilingLen, 8));
  // Across-deck offsets of the two edges, in CITY px (they used to be scene
  // Z values, which only worked while the deck was axis-aligned).
  const edgeInsetPx = 0.1 * PX_PER_UNIT;
  const edgeOff = [-halfWidthPx + edgeInsetPx, halfWidthPx - edgeInsetPx];
  const nPilings = Math.max(2, Math.round(lengthU / 1.6));
  for (let i = 0; i <= nPilings; i++) {
    const d = (i / nPilings) * lengthPx;
    for (const off of edgeOff) {
      const c = at(d, off);
      const pile = new THREE.Mesh(pilingGeo, postMat);
      pile.position.set(pxToSceneX(c.x), DECK_TOP - pilingLen / 2, pxToSceneZ(c.y));
      pile.castShadow = true;
      group.add(pile);
    }
  }

  // ---- Railings: short blue posts + a white top rail on both long edges ----
  const railPostMat = push(new THREE.MeshStandardMaterial({ color: RIBBON.BLUE, roughness: 0.5 }));
  const railMat = push(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 }));
  const railPostGeo = push(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6));
  const railGeo = push(new THREE.BoxGeometry(lengthU, 0.06, 0.06));
  const nRailPosts = Math.max(2, Math.round(lengthU / 1.1));
  for (const off of edgeOff) {
    for (let i = 0; i <= nRailPosts; i++) {
      const c = at((i / nRailPosts) * lengthPx, off);
      const rp = new THREE.Mesh(railPostGeo, railPostMat);
      rp.position.set(pxToSceneX(c.x), DECK_TOP + 0.25, pxToSceneZ(c.y));
      group.add(rp);
    }
    const mid = at(lengthPx / 2, off);
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(pxToSceneX(mid.x), DECK_TOP + 0.48, pxToSceneZ(mid.y));
    rail.rotation.y = yaw;
    group.add(rail);
  }

  // ---- Booth anchors on the far end of the deck ----
  const boothAnchorsPx: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < boothCount; i++) {
    const t = boothCount === 1 ? 0.5 : i / (boothCount - 1);
    boothAnchorsPx.push(at(lengthPx * 0.82, -halfWidthPx * 0.5 + t * halfWidthPx));
  }

  // The walkable deck, with the same 8px forgiveness the axis-aligned version
  // always had, expressed in deck-local coordinates so it turns with the pier.
  const PAD = 8;
  const containsPx = (px: number, py: number): boolean => {
    const rx = px - originPx.x;
    const ry = py - originPx.y;
    const along = rx * ux + ry * uy;
    const across = rx * vx + ry * vy;
    return (
      along >= -PAD &&
      along <= lengthPx + PAD &&
      Math.abs(across) <= halfWidthPx + PAD
    );
  };

  // Bounding box of the four deck corners. For heading 0 this is exactly the
  // rect this function has always returned; for a turned deck it is only a
  // bound, which is why containsPx exists.
  const corners = [
    at(-PAD, -halfWidthPx - PAD),
    at(-PAD, halfWidthPx + PAD),
    at(lengthPx + PAD, -halfWidthPx - PAD),
    at(lengthPx + PAD, halfWidthPx + PAD),
  ];
  const deckRect: RectPx = {
    x0: Math.min(...corners.map((c) => c.x)),
    y0: Math.min(...corners.map((c) => c.y)),
    x1: Math.max(...corners.map((c) => c.x)),
    y1: Math.max(...corners.map((c) => c.y)),
  };

  return { group, deckRect, containsPx, boothAnchorsPx, geometries, materials };
}
