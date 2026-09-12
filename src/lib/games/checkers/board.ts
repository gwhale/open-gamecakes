// The Cakey Checkers board — a cake on a frosted stand.
//
// Forked from the pattern in town/three/chessboard.ts rather than importing it:
// that module works in TOWN-WORLD coordinates (PX_PER_UNIT, pxToSceneX), and
// this scene has its own units. The PATTERN is what carries over, and three
// pieces of it are load-bearing:
//
//   1. ONE 1024x1024 CanvasTexture for all 64 squares, never 64 meshes.
//   2. A BOX with a per-face material array, never a Plane. Only +Y wears the
//      checker; the other five faces reuse the slab material, so the board has
//      real thickness for one extra geometry and zero extra materials.
//   3. The y-ladder in types.ts. No two faces share a height.
//
// Returns its own disposables rather than disposing them, matching every other
// sub-builder in this codebase (makeBoothSign, makePier, buildLandStructure) —
// the caller owns the sinks.
//
// No runtime `three` import: the namespace arrives as an argument.

import type * as THREE from 'three';
import { cakeMat, frostingMat } from '@/lib/town/three/materials';
import {
  BOARD_EDGE,
  BOARD_U,
  SLAB_COLOR,
  SLAB_H,
  SLAB_U,
  SPONGE_COLOR,
  SQUARE_IDLE,
  SQUARE_PLAY,
  SQUARE_U,
  STAND_COLOR,
  STAND_H,
  SURFACE_H,
  TABLE_H,
  TABLE_U,
  Y_SLAB,
  Y_STAND,
  Y_SURFACE,
  Y_TABLE,
  type ThreeNS,
} from './types';
import { squareToRC } from './rules';

export interface BuiltBoard {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** World position of a square's centre, on the playing plane.
 *
 *  file 0 is at -x, rank 0 at -z. The camera decides which end the kid sees by
 *  YAWING (see the engine); this mapping never flips, so a square index means
 *  the same place for the rules, the renderer and the announcer. */
export function squarePos(sq: number): { x: number; z: number } {
  const { file, rank } = squareToRC(sq);
  return { x: (file - 3.5) * SQUARE_U, z: (rank - 3.5) * SQUARE_U };
}

/** The checkerboard, drawn once into a canvas.
 *
 *  A baked radial vignette darkens the outer squares very slightly. It costs
 *  nothing, and it is the only way to get that falloff in this repo — there is
 *  no EffectComposer and adding one for a board game would not be worth the
 *  frame budget on a tablet. */
function boardTexture(THREE: ThreeNS): THREE.CanvasTexture {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const g = cv.getContext('2d')!;
  const cell = S / 8;

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      // Matches DARK_SQUARES in rules.ts. If that parity ever changes, the
      // pieces will stand on the wrong colour and it will be obvious instantly.
      const playable = (rank + file) % 2 === 1;
      g.fillStyle = playable ? hex(SQUARE_PLAY) : hex(SQUARE_IDLE);
      // +1 to close the seam between cells; canvas antialiasing otherwise leaves
      // a hairline grid that reads as scratches at this scale.
      g.fillRect(file * cell, rank * cell, cell + 1, cell + 1);
    }
  }

  const vign = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.72);
  vign.addColorStop(0, 'rgba(69,26,3,0)');
  vign.addColorStop(1, 'rgba(69,26,3,0.16)');
  g.fillStyle = vign;
  g.fillRect(0, 0, S, S);

  g.strokeStyle = 'rgba(69,26,3,0.85)';
  g.lineWidth = 18;
  g.strokeRect(9, 9, S - 18, S - 18);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildBoard(THREE: ThreeNS): BuiltBoard {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const track = <B, T extends B>(bin: B[], item: T): T => {
    bin.push(item);
    return item;
  };

  // --- the stand -----------------------------------------------------------
  const standMat = track(materials, frostingMat(THREE, STAND_COLOR));
  const column = new THREE.Mesh(
    track(geometries, new THREE.CylinderGeometry(TABLE_U * 0.16, TABLE_U * 0.26, STAND_H, 20)),
    standMat,
  );
  column.position.y = Y_STAND;
  column.castShadow = true;
  group.add(column);

  const table = new THREE.Mesh(
    track(geometries, new THREE.CylinderGeometry(TABLE_U / 2, TABLE_U / 2, TABLE_H, 40)),
    standMat,
  );
  table.position.y = Y_TABLE;
  table.receiveShadow = true;
  table.castShadow = true;
  group.add(table);

  // --- the cake slab -------------------------------------------------------
  // Sponge sides, chocolate top and bottom — a cake seen from the side is a
  // cake, and the exposed crumb edge is what stops the board reading as a
  // plastic tile.
  const slabTop = track(materials, cakeMat(THREE, SLAB_COLOR));
  const slabSide = track(materials, cakeMat(THREE, SPONGE_COLOR));
  const slab = new THREE.Mesh(
    track(geometries, new THREE.BoxGeometry(SLAB_U, SLAB_H, SLAB_U)),
    // [+X, -X, +Y, -Y, +Z, -Z]
    [slabSide, slabSide, slabTop, slabTop, slabSide, slabSide],
  );
  slab.position.y = Y_SLAB;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);

  // --- the playing surface -------------------------------------------------
  const tex = track(textures, boardTexture(THREE));
  const topMat = track(materials, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72 }));
  const edgeMat = track(materials, cakeMat(THREE, BOARD_EDGE));
  const surface = new THREE.Mesh(
    track(geometries, new THREE.BoxGeometry(BOARD_U, SURFACE_H, BOARD_U)),
    [edgeMat, edgeMat, topMat, edgeMat, edgeMat, edgeMat],
  );
  surface.position.y = Y_SURFACE;
  surface.receiveShadow = true;
  group.add(surface);

  return { group, geometries, materials, textures };
}

/** The two plates captured pieces land on, at either side of the board.
 *
 *  This is the material counter, and it costs no HUD at all — a kid can see who
 *  is winning by glancing at the plates. */
export function buildTrays(THREE: ThreeNS): BuiltBoard {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const mat = frostingMat(THREE, STAND_COLOR);
  materials.push(mat);
  const geo = new THREE.CylinderGeometry(1.5, 1.35, 0.08, 28);
  geometries.push(geo);
  for (const x of [-(BOARD_U / 2 + 2.0), BOARD_U / 2 + 2.0]) {
    const plate = new THREE.Mesh(geo, mat);
    plate.position.set(x, Y_SLAB - SLAB_H / 2 + 0.04, 0);
    plate.receiveShadow = true;
    group.add(plate);
  }
  return { group, geometries, materials, textures: [] };
}

/** Where the nth captured piece of a side sits on its plate. A 4x3 grid, so a
 *  full dozen fits without stacking. */
export function trayPos(side: 'light' | 'dark', index: number): { x: number; y: number; z: number } {
  const col = index % 3;
  const row = Math.floor(index / 3) % 4;
  const plateX = side === 'light' ? -(BOARD_U / 2 + 2.0) : BOARD_U / 2 + 2.0;
  return {
    x: plateX + (col - 1) * 0.78,
    y: Y_SLAB - SLAB_H / 2 + 0.08,
    z: (row - 1.5) * 0.72,
  };
}
