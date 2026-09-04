// A plank pier for the 3D town — a low boardwalk that runs from a shore land's
// seaward edge out OVER the sea to a deck "plot" where water-game booths sit.
//
// Built straight along +x (east) so its walkable footprint is an axis-aligned
// rect (trivial insideRect in the engine's walk clamp). The deck top sits at
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
    /** How far out over the water the boardwalk runs (px, +x/east). */
    lengthPx: number;
    /** Half the boardwalk width (px). */
    halfWidthPx: number;
    /** Water surface Y (scene units) — pilings drop below it. */
    waterY: number;
    /** How many booths sit on the far deck. */
    boothCount: number;
  },
): Pier {
  const { originPx, lengthPx, halfWidthPx, waterY, boothCount } = opts;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const push = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geometries.push(x as THREE.BufferGeometry);
    else materials.push(x as THREE.Material);
    return x;
  };

  const cy = originPx.y; // boardwalk centerline (px)
  const widthU = (halfWidthPx * 2) / PX_PER_UNIT;
  const scZ = pxToSceneZ(cy);
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
    const px = originPx.x + ((i + 0.5) / nPlanks) * lengthPx;
    const plank = new THREE.Mesh(plankGeo, i % 2 === 0 ? plankLightMat : plankMat);
    plank.position.set(pxToSceneX(px), DECK_TOP - DECK_T / 2, scZ);
    plank.receiveShadow = true;
    group.add(plank);
  }

  // ---- Pilings: posts dropping from the deck into the water on both edges ----
  const postMat = push(cakeMat(THREE, WOOD.POST));
  const pilingLen = DECK_TOP - (waterY - 0.6);
  const pilingGeo = push(new THREE.CylinderGeometry(0.12, 0.14, pilingLen, 8));
  const edgeZ = [scZ - widthU / 2 + 0.1, scZ + widthU / 2 - 0.1];
  const nPilings = Math.max(2, Math.round(lengthU / 1.6));
  for (let i = 0; i <= nPilings; i++) {
    const px = originPx.x + (i / nPilings) * lengthPx;
    for (const ez of edgeZ) {
      const pile = new THREE.Mesh(pilingGeo, postMat);
      pile.position.set(pxToSceneX(px), DECK_TOP - pilingLen / 2, ez);
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
  for (const ez of edgeZ) {
    for (let i = 0; i <= nRailPosts; i++) {
      const px = originPx.x + (i / nRailPosts) * lengthPx;
      const rp = new THREE.Mesh(railPostGeo, railPostMat);
      rp.position.set(pxToSceneX(px), DECK_TOP + 0.25, ez);
      group.add(rp);
    }
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.set(pxToSceneX(originPx.x + lengthPx / 2), DECK_TOP + 0.48, ez);
    group.add(rail);
  }

  // ---- Booth anchors on the far end of the deck ----
  const boothAnchorsPx: Array<{ x: number; y: number }> = [];
  const anchorX = originPx.x + lengthPx * 0.82;
  for (let i = 0; i < boothCount; i++) {
    const t = boothCount === 1 ? 0.5 : i / (boothCount - 1);
    boothAnchorsPx.push({ x: anchorX, y: cy - halfWidthPx * 0.5 + t * halfWidthPx });
  }

  const deckRect: RectPx = {
    x0: originPx.x - 8,
    y0: cy - halfWidthPx - 8,
    x1: originPx.x + lengthPx + 8,
    y1: cy + halfWidthPx + 8,
  };

  return { group, deckRect, boothAnchorsPx, geometries, materials };
}
