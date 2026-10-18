// The Sugar Mile — the road bridge from the mainland out to Race Island.
//
// This is a ROAD, not a boardwalk, and that distinction is the whole point: you
// cross it in a rented ride, or you pay a token to ride the bus. A cupcake on
// foot is turned back at the boom barrier. The engine owns that rule (it knows
// what the kid is riding); this module owns the visuals + the footprint math.
//
// GEOMETRY NOTE — why a capsule, not a rect:
//   pier.ts builds along +x so its footprint is an axis-aligned rect. The race
//   island is solved offshore at an arbitrary bearing (~103°), so this deck runs
//   at an angle. Rather than force the island to a cardinal direction for the
//   convenience of `insideRect`, the deck exposes its CENTRE-LINE SEGMENT and the
//   engine tests `distToSeg(...) <= halfWidthPx` — a capsule. Same cost, no
//   orientation constraint. Meshes are built in LOCAL space along +X and the
//   whole group is rotated to the bearing (same trick as the ferry trail).
//
// Like train.ts / ferry.ts: no runtime `three` import (the namespace is threaded
// in), gameplay math in city PIXELS, scene units only at mesh placement, and the
// caller owns disposal via the returned geometry/material arrays.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import { CAKE, WOOD, CAKEY_ROAD, WORLD, RACER } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat, groundDecalDepthBias } from './materials';

/** Half-width of the drivable deck (city px). The jeep is ~1.4 scene units
 *  across (~90px), so ~156px of road leaves comfortable clearance either side
 *  without the bridge reading as a runway. */
export const BRIDGE_HALF_W_PX = 78;

/** How far along the deck (as a fraction of its length) the boom barrier
 *  stands. Just past the landward bridgehead: far enough that a kid can walk up,
 *  read the sign and watch the boom, close enough that they are stopped ON LAND
 *  rather than somewhere out over open water. */
export const BRIDGE_BARRIER_T = 0.06;

export interface Bridge {
  group: THREE.Group;
  /** Ease the boom toward open/closed. dt in MILLISECONDS (engine loop). */
  update(dt: number, open: boolean): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

export function makeBridge(
  THREE: ThreeNS,
  opts: {
    /** Landward (mainland) end of the deck centre-line, city px. */
    aPx: { x: number; y: number };
    /** Seaward (island) end of the deck centre-line, city px. */
    bPx: { x: number; y: number };
    /** Water surface Y (scene units) — pilings drop below it. */
    waterY: number;
    /** Honour prefers-reduced-motion: the boom snaps instead of sweeping. */
    reduceMotion: boolean;
  },
): Bridge {
  const { aPx, bPx, waterY, reduceMotion } = opts;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const push = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geometries.push(x as THREE.BufferGeometry);
    else materials.push(x as THREE.Material);
    return x;
  };

  // ---- Local frame: origin at the deck midpoint, +X running A → B ----
  const ax = pxToSceneX(aPx.x);
  const az = pxToSceneZ(aPx.y);
  const bx = pxToSceneX(bPx.x);
  const bz = pxToSceneZ(bPx.y);
  const dx = bx - ax;
  const dz = bz - az;
  const lengthU = Math.hypot(dx, dz) || 1;
  const widthU = (BRIDGE_HALF_W_PX * 2) / PX_PER_UNIT;
  group.position.set((ax + bx) / 2, 0, (az + bz) / 2);
  group.rotation.y = -Math.atan2(dz, dx);

  const DECK_TOP = 0.0; // deck surface at ground level, like the pier
  const DECK_T = 0.18;
  const halfLen = lengthU / 2;
  // Local X of the A (landward) end. Everything below is positioned in this
  // frame, so the bearing never appears in the mesh code.
  const xAt = (t: number): number => -halfLen + t * lengthU;

  // ---- Road surface: warm milk-cocoa, the established Gamecakes road tone ----
  // The deck top sits at ground level, so where the displaced terrain rises to
  // meet the abutments it becomes coplanar with the road and z-fights.
  const roadMat = push(groundDecalDepthBias(cakeMat(THREE, CAKEY_ROAD.ROAD_COCOA)));
  const road = new THREE.Mesh(push(new THREE.BoxGeometry(lengthU, DECK_T, widthU)), roadMat);
  road.position.y = DECK_TOP - DECK_T / 2;
  road.receiveShadow = true;
  group.add(road);

  // ---- Dashed frosting centre-line ----
  // Layer 2: the dashes are only 1cm above the deck, so they need to beat it.
  const dashMat = push(
    groundDecalDepthBias(
      new THREE.MeshStandardMaterial({ color: CAKEY_ROAD.ROAD_DASH, roughness: 0.6 }),
      2,
    ),
  );
  const DASH_U = 0.9;
  const nDashes = Math.max(2, Math.floor(lengthU / (DASH_U * 2)));
  const dashGeo = push(new THREE.BoxGeometry(DASH_U, 0.02, 0.16));
  for (let i = 0; i < nDashes; i++) {
    const dash = new THREE.Mesh(dashGeo, dashMat);
    dash.position.set(xAt((i + 0.5) / nDashes), DECK_TOP + 0.01, 0);
    group.add(dash);
  }

  // ---- Pilings: posts dropping from both deck edges into the sea ----
  const postMat = push(cakeMat(THREE, WOOD.POST));
  const pilingLen = DECK_TOP - (waterY - 0.8);
  const pilingGeo = push(new THREE.CylinderGeometry(0.14, 0.17, pilingLen, 8));
  const edgeZ = [-widthU / 2 + 0.12, widthU / 2 - 0.12];
  const nPilings = Math.max(2, Math.round(lengthU / 2.2));
  for (let i = 0; i <= nPilings; i++) {
    for (const ez of edgeZ) {
      const pile = new THREE.Mesh(pilingGeo, postMat);
      pile.position.set(xAt(i / nPilings), DECK_TOP - pilingLen / 2, ez);
      pile.castShadow = true;
      group.add(pile);
    }
  }

  // ---- Guardrails: candy-cane striping along both edges ----
  const railWhiteMat = push(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 }));
  const railRedMat = push(new THREE.MeshStandardMaterial({ color: CAKE.STRAWBERRY, roughness: 0.5 }));
  const SEG_U = 0.8;
  const nSegs = Math.max(2, Math.round(lengthU / SEG_U));
  const railSegGeo = push(new THREE.BoxGeometry(lengthU / nSegs, 0.1, 0.12));
  const railPostGeo = push(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6));
  for (const ez of edgeZ) {
    for (let i = 0; i < nSegs; i++) {
      const seg = new THREE.Mesh(railSegGeo, i % 2 === 0 ? railWhiteMat : railRedMat);
      seg.position.set(xAt((i + 0.5) / nSegs), DECK_TOP + 0.5, ez);
      group.add(seg);
    }
    const nRailPosts = Math.max(2, Math.round(lengthU / 1.8));
    for (let i = 0; i <= nRailPosts; i++) {
      const rp = new THREE.Mesh(railPostGeo, railWhiteMat);
      rp.position.set(xAt(i / nRailPosts), DECK_TOP + 0.27, ez);
      group.add(rp);
    }
  }

  // ---- The boom barrier — the rule, made visible ----
  // A kid on foot is stopped here. The arm SWEEPS UP when they arrive with
  // wheels (or aboard the bus), which turns "you may not pass" into a small
  // reward rather than an invisible wall. Pivot sits at one deck edge; the arm
  // reaches across the road and lifts by rotating about local X.
  const boomPivot = new THREE.Group();
  boomPivot.position.set(xAt(BRIDGE_BARRIER_T), DECK_TOP + 0.55, edgeZ[0]);
  group.add(boomPivot);
  const boomMat = push(new THREE.MeshStandardMaterial({ color: CAKE.STRAWBERRY_DEEP, roughness: 0.5 }));
  const boomStripeMat = push(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 }));
  const armLen = widthU;
  const BOOM_SEGS = 6;
  const boomSegGeo = push(new THREE.BoxGeometry(0.11, 0.11, armLen / BOOM_SEGS));
  for (let i = 0; i < BOOM_SEGS; i++) {
    const seg = new THREE.Mesh(boomSegGeo, i % 2 === 0 ? boomMat : boomStripeMat);
    seg.position.set(0, 0, (i + 0.5) * (armLen / BOOM_SEGS));
    boomPivot.add(seg);
  }
  // Housing the boom hinges on.
  const housing = new THREE.Mesh(push(new THREE.BoxGeometry(0.3, 0.7, 0.3)), push(cookieMat(THREE, WOOD.PLANK)));
  housing.position.set(xAt(BRIDGE_BARRIER_T), DECK_TOP + 0.35, edgeZ[0]);
  housing.castShadow = true;
  group.add(housing);

  // ---- Start/finish gantry at the island end: you have arrived at a racetrack ----
  const gantry = new THREE.Group();
  gantry.position.set(xAt(0.97), 0, 0);
  group.add(gantry);
  const gantryPostGeo = push(new THREE.CylinderGeometry(0.12, 0.14, 2.6, 8));
  const gantryPostMat = push(new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 }));
  for (const ez of edgeZ) {
    const p = new THREE.Mesh(gantryPostGeo, gantryPostMat);
    p.position.set(0, 1.3, ez);
    p.castShadow = true;
    gantry.add(p);
  }
  const beam = new THREE.Mesh(
    push(new THREE.BoxGeometry(0.22, 0.42, widthU)),
    push(new THREE.MeshStandardMaterial({ color: WORLD.FROSTING_PATH, roughness: 0.6 })),
  );
  beam.position.set(0, 2.6, 0);
  gantry.add(beam);
  // Checkerboard along the beam face — the universal "race" signal.
  const CHK = 10;
  const chkGeo = push(new THREE.BoxGeometry(0.03, 0.19, widthU / CHK));
  const chkDarkMat = push(new THREE.MeshStandardMaterial({ color: CAKE.CHOCOLATE_DEEP, roughness: 0.6 }));
  for (let i = 0; i < CHK; i++) {
    for (let row = 0; row < 2; row++) {
      if ((i + row) % 2 !== 0) continue;
      const sq = new THREE.Mesh(chkGeo, chkDarkMat);
      sq.position.set(-0.12, 2.6 + (row === 0 ? 0.1 : -0.1), -widthU / 2 + (i + 0.5) * (widthU / CHK));
      gantry.add(sq);
    }
  }

  // ---- Chequer band painted across the DECK, just before the gantry ----
  // You drive OVER the start/finish line to arrive. Chocolate + vanilla, the
  // same two tokens as the circuit and the racer game — never black-and-white.
  {
    const COLS = 12;
    const cell = widthU / COLS;
    const bandGeo = push(new THREE.BoxGeometry(cell, 0.02, cell));
    for (const [color, parity] of [[RACER.CHECKER_A, 0], [RACER.CHECKER_B, 1]] as const) {
      const mat = push(new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < COLS; i++) {
          if ((i + row) % 2 !== parity) continue;
          const sq = new THREE.Mesh(bandGeo, mat);
          sq.position.set(xAt(0.94) + row * cell, DECK_TOP + 0.01, -widthU / 2 + (i + 0.5) * cell);
          group.add(sq);
        }
      }
    }
  }

  // ---- Start lights on the gantry beam ----
  // Five lamps that fill red then flash green, on a loop. The loudest "this is a
  // racetrack" signal in the whole build for ~400 triangles, and the animation
  // is five emissive writes a frame.
  const lightMats: THREE.MeshStandardMaterial[] = [];
  {
    const lampGeo = push(new THREE.SphereGeometry(0.11, 10, 8));
    for (let i = 0; i < 5; i++) {
      const mat = push(new THREE.MeshStandardMaterial({
        color: CAKE.STRAWBERRY_DEEP,
        roughness: 0.3,
        emissive: CAKE.STRAWBERRY_DEEP,
        emissiveIntensity: 0,
      }));
      lightMats.push(mat);
      const lamp = new THREE.Mesh(lampGeo, mat);
      lamp.position.set(-0.16, 2.6, -widthU / 2 + ((i + 0.5) / 5) * widthU);
      gantry.add(lamp);
    }
  }
  let lightsT = 0;
  const applyLights = (): void => {
    if (reduceMotion) {
      // Hold green — a static red light reads as "stop", which is the wrong
      // instruction on the one route onto the island.
      for (const mat of lightMats) {
        mat.color.setHex(CAKE.MINT_DEEP);
        mat.emissive.setHex(CAKE.MINT_DEEP);
        mat.emissiveIntensity = 0.8;
      }
      return;
    }
    // 5s loop: lamps fill red one per 0.6s, all out, then a green flash.
    const cycle = lightsT % 5000;
    const green = cycle > 3600;
    for (let i = 0; i < lightMats.length; i++) {
      const mat = lightMats[i];
      if (green) {
        mat.color.setHex(CAKE.MINT_DEEP);
        mat.emissive.setHex(CAKE.MINT_DEEP);
        mat.emissiveIntensity = 0.9;
      } else {
        mat.color.setHex(CAKE.STRAWBERRY_DEEP);
        mat.emissive.setHex(CAKE.STRAWBERRY_DEEP);
        mat.emissiveIntensity = cycle > (i + 1) * 600 ? 0.9 : 0.05;
      }
    }
  };
  applyLights();

  // ---- Boom animation state ----
  // 0 = down (barred), 1 = fully raised.
  let boomT = 0;
  const applyBoom = (): void => {
    boomPivot.rotation.x = -boomT * (Math.PI / 2);
  };
  applyBoom();

  return {
    group,
    update(dt: number, open: boolean): void {
      if (!reduceMotion) {
        lightsT += dt;
        applyLights();
      }
      const target = open ? 1 : 0;
      if (reduceMotion) {
        boomT = target;
      } else if (boomT !== target) {
        // ~0.45s full sweep, frame-rate independent.
        const step = (dt / 1000) / 0.45;
        boomT = target > boomT ? Math.min(target, boomT + step) : Math.max(target, boomT - step);
      }
      applyBoom();
    },
    geometries,
    materials,
  };
}
