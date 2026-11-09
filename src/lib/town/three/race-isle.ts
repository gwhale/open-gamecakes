// Race Island's speedway dressing — the circuit, the pit garages, the podium,
// the grandstand and one lapping pace car.
//
// Race Island shipped scenic: two land pads with racing decals painted on them,
// and ~77% of the island bare grass in between. This turns the island itself
// into the racetrack, so the lands read as two ENDS of a circuit rather than as
// two interchangeable cake pads with stickers.
//
// Same module conventions as pier.ts / bridge.ts: no runtime `three` import (the
// namespace is threaded in), gameplay maths in city px, the caller owns disposal
// via the returned arrays. The centre-line maths lives in race-track.ts because
// engine.ts needs it long before any of these meshes exist — see that file.
//
// PIT ROW vs VICTORY LANE. The two lands are given deliberately OPPOSITE
// silhouettes so they stop being interchangeable:
//   Pit Row      — LOW, HORIZONTAL, ROOFED. A working garage row under one long
//                  wafer roof, plus a pit lane. The mechanical end.
//   Victory Lane — TALL, VERTICAL, RADIAL. A three-tier podium cake and a layer-
//                  cake grandstand. The celebration end.
//
// EVERY racing signifier is confection: licorice tyre walls, peppermint kerbs,
// a chocolate-and-vanilla chequer (never black-and-white — that is the one thing
// that would read as off-brand here), wafer roofs, gumdrop crowds.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import type { RaceTrack } from './race-track';
import { RACER, CAKE, WORLD } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat, candyMat, frostingMat } from './materials';
import { buildJeep } from './vehicles';

export interface RaceIsle {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  instanced: THREE.InstancedMesh[];
  /** Advance the pace car. Call once per frame from the engine loop. */
  update(dtMs: number): void;
}

// ---- surface heights (scene units); offshore terrain is flat at y=0 ----
const Y_SHOULDER = 0.012;
const Y_TARMAC = 0.03;
const Y_PAINT = 0.05; // racing line + chequer, just proud of the tarmac
const Y_KERB = 0.07;

const RIBBON_SEGS = 168;
const KERB_LEN_PX = 46;
/** Below this straightness a stretch counts as a turn (kerbs + tyre wall). */
const TURN_AT = 0.62;
/** Pace car speed (city px/sec). The cupcake walks at 220; a pace car that is
 *  not clearly quicker than a child on foot is just a confusing prop. */
const PACE_SPEED_PX = 420;

export function makeRaceIsle(
  THREE: ThreeNS,
  opts: {
    track: RaceTrack;
    /** Land pad centres (city px) and their half-extents. */
    pitRowPx: { x: number; y: number };
    victoryLanePx: { x: number; y: number };
    padHalfPx: { hw: number; hh: number };
    /** Lap position of the start/finish line — aligned to the bridge arrival. */
    finishT: number;
    reduceMotion: boolean;
  },
): RaceIsle {
  const { track, pitRowPx, victoryLanePx, padHalfPx, finishT, reduceMotion } = opts;
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const instanced: THREE.InstancedMesh[] = [];

  const g = <T extends THREE.BufferGeometry>(v: T): T => { geometries.push(v); return v; };
  const m = <T extends THREE.Material>(v: T): T => { materials.push(v); return v; };
  const dummy = new THREE.Object3D();

  /** City px → scene, at a given height. */
  const scene3 = (p: { x: number; y: number }, y: number): [number, number, number] => [
    pxToSceneX(p.x), y, pxToSceneZ(p.y),
  ];
  /** Y-rotation that points a +Z-facing model along the track at `t`. */
  const headingAt = (t: number): number => {
    const tan = track.tangentAt(t);
    return Math.atan2(tan.x, tan.y);
  };

  // ---------- Ribbons: tarmac + sugar shoulder ----------
  // Hand-rolled strip, same as the racer game's road: a road is a flat ribbon,
  // and sweeping a rectangle is two triangles per segment. Vertex order and
  // winding are copied VERBATIM from the game's corrected version — get the
  // winding wrong and the road is back-face culled, i.e. invisible, while
  // everything else still renders perfectly.
  const ribbon = (halfPx: number, y: number, color: number, rough: number): THREE.Mesh => {
    const verts = new Float32Array((RIBBON_SEGS + 1) * 6);
    for (let i = 0; i <= RIBBON_SEGS; i++) {
      const t = i / RIBBON_SEGS;
      const c = track.pointAt(t);
      const s = track.sideAt(t);
      const o = i * 6;
      const lx = pxToSceneX(c.x - s.x * halfPx);
      const lz = pxToSceneZ(c.y - s.y * halfPx);
      const rx = pxToSceneX(c.x + s.x * halfPx);
      const rz = pxToSceneZ(c.y + s.y * halfPx);
      verts[o] = lx; verts[o + 1] = y; verts[o + 2] = lz;       // LEFT
      verts[o + 3] = rx; verts[o + 4] = y; verts[o + 5] = rz;   // RIGHT
    }
    const idx: number[] = [];
    for (let i = 0; i < RIBBON_SEGS; i++) {
      const a = i * 2, b = a + 1, c2 = a + 2, d = a + 3;
      idx.push(a, b, c2, b, d, c2); // CCW from above — see note above
    }
    const geo = g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m(new THREE.MeshStandardMaterial({ color, roughness: rough })));
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const halfW = track.halfWidthPx;
  ribbon(halfW + 46, Y_SHOULDER, RACER.ROUGH_SUGAR, 0.95); // crumb shoulder
  ribbon(halfW, Y_TARMAC, RACER.ASPHALT, 0.9); // the road

  /** Place `count` instances of one geometry, tracked for disposal. */
  const scatter = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    place: (i: number, d: THREE.Object3D) => void,
  ): THREE.InstancedMesh | null => {
    if (count <= 0) return null;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    for (let i = 0; i < count; i++) {
      place(i, dummy);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    instanced.push(inst);
    group.add(inst);
    return inst;
  };

  // ---------- Peppermint kerbs, on the turns only ----------
  // Alternating blocks in two instanced meshes rather than a striped texture:
  // nothing to author, and no UV seam at the start/finish.
  const kerbStations: number[] = [];
  {
    const n = Math.max(8, Math.round(track.lengthPx / KERB_LEN_PX));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      if (track.straightness(t) < TURN_AT) kerbStations.push(t);
    }
  }
  {
    const kerbGeo = g(new THREE.BoxGeometry(0.3, 0.14, (KERB_LEN_PX / PX_PER_UNIT) * 0.86));
    for (const [color, parity] of [[RACER.KERB_A, 0], [RACER.KERB_B, 1]] as const) {
      const mat = m(candyMat(THREE, color));
      const picks: Array<{ t: number; side: number }> = [];
      kerbStations.forEach((t, i) => {
        if (i % 2 === parity) picks.push({ t, side: -1 }, { t, side: 1 });
      });
      scatter(kerbGeo, mat, picks.length, (i, d) => {
        const { t, side } = picks[i];
        const p = track.offsetAt(t, side * 1.08);
        d.position.set(...scene3(p, Y_KERB));
        d.rotation.set(0, headingAt(t), 0);
        d.scale.setScalar(1);
      });
    }
  }

  // ---------- Piped-frosting racing line ----------
  {
    const n = Math.max(8, Math.round(track.lengthPx / 190));
    const dashGeo = g(new THREE.BoxGeometry(0.22, 0.02, 1.5));
    scatter(dashGeo, m(frostingMat(THREE, RACER.RACING_LINE)), n, (i, d) => {
      const t = i / n;
      d.position.set(...scene3(track.pointAt(t), Y_PAINT));
      d.rotation.set(0, headingAt(t), 0);
      d.scale.setScalar(1);
    });
  }

  // ---------- Start/finish chequer ----------
  // Chocolate + VANILLA. Never CAKE.FROSTING (#ffffff) — chocolate-and-white is
  // a monochrome racing chequer, the one motorsport cliché that would look wrong
  // in Gamecakes. The racer game uses the same two tokens.
  {
    const COLS = 10;
    const ROWS = 2;
    const cellU = (halfW * 2) / PX_PER_UNIT / COLS;
    const cellGeo = g(new THREE.BoxGeometry(cellU, 0.02, cellU));
    const dt = (cellU * PX_PER_UNIT) / track.lengthPx;
    for (const [color, parity] of [[RACER.CHECKER_A, 0], [RACER.CHECKER_B, 1]] as const) {
      const cells: Array<{ row: number; col: number }> = [];
      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) if ((row + col) % 2 === parity) cells.push({ row, col });
      }
      scatter(cellGeo, m(cakeMat(THREE, color)), cells.length, (i, d) => {
        const { row, col } = cells[i];
        const t = finishT + row * dt;
        const u = (col + 0.5) / COLS * 2 - 1;
        d.position.set(...scene3(track.offsetAt(t, u), Y_PAINT));
        d.rotation.set(0, headingAt(t), 0);
        d.scale.setScalar(1);
      });
    }
  }

  // ---------- Licorice tyre wall, outside the turns ----------
  {
    const tyreGeo = g(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10));
    const mat = m(cakeMat(THREE, RACER.TYRE_STACK));
    const picks: Array<{ t: number; side: number; tier: number }> = [];
    kerbStations.forEach((t, i) => {
      if (i % 3 !== 0) return;
      for (const side of [-1, 1]) for (let tier = 0; tier < 2; tier++) picks.push({ t, side, tier });
    });
    scatter(tyreGeo, mat, picks.length, (i, d) => {
      const { t, side, tier } = picks[i];
      const p = track.offsetAt(t, side * 1.5);
      d.position.set(pxToSceneX(p.x), 0.13 + tier * 0.26, pxToSceneZ(p.y));
      d.rotation.set(0, headingAt(t) + tier * 0.4, 0);
      d.scale.setScalar(1);
    });
  }

  // ---------- Gumdrop crowd ----------
  // IcosahedronGeometry(r, 0) = 20 triangles. A UV sphere would be 160 each,
  // and at this count that is the difference between free and not.
  {
    // detail 1 (80 tris), not 0 (20). At 20 the facets are so broad the props
    // read as cut gemstones rather than sweets — wrong confection. 80 tris × 80
    // instances is still nothing next to the town's existing scatter.
    const gumGeo = g(new THREE.IcosahedronGeometry(0.3, 1));
    RACER.GUMDROP.forEach((color, ci) => {
      const per = 16;
      scatter(gumGeo, m(candyMat(THREE, color)), per, (i, d) => {
        // Golden-angle around the lap so the crowd never clumps, alternating
        // sides, well outside the tyre wall.
        const t = ((i * RACER.GUMDROP.length + ci) * 0.6180339887) % 1;
        const side = (i + ci) % 2 === 0 ? -1 : 1;
        const out = 1.85 + ((i * 5 + ci * 3) % 7) * 0.22;
        const p = track.offsetAt(t, side * out);
        const s = 0.7 + ((i * 7 + ci) % 5) * 0.16;
        d.position.set(pxToSceneX(p.x), 0.3 * s * 0.8, pxToSceneZ(p.y));
        d.rotation.set(0, i * 1.1, 0);
        d.scale.setScalar(s);
      });
    });
  }

  /** Add a tracked box mesh. */
  const box = (
    w: number, h: number, dp: number,
    px: number, py: number, y: number,
    mat: THREE.Material, rotY = 0,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(g(new THREE.BoxGeometry(w, h, dp)), mat);
    mesh.position.set(pxToSceneX(px), y, pxToSceneZ(py));
    mesh.rotation.y = rotY;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---------- PIT ROW — low, horizontal, roofed ----------
  // North (smaller py) is toward the island's centre-line and the main straight,
  // which is also where the bridge lands, so the garages face the arrival.
  {
    const bayW = 2.1;
    const bays = 4;
    const rowY = pitRowPx.y - padHalfPx.hh * 0.55;
    const x0 = pitRowPx.x - ((bays - 1) / 2) * bayW * PX_PER_UNIT;
    // Gingerbread back walls, NOT vanilla: the pad they stand on is already a
    // pale apron, so vanilla-on-vanilla flattened the whole row into a fence.
    const wallMat = m(cookieMat(THREE, 0xc9884a));
    const bayMat = m(cakeMat(THREE, CAKE.VANILLA)); // the recessed bay interior
    const lintelMat = m(candyMat(THREE, RACER.KERB_A));
    const postMat = m(cookieMat(THREE, WORLD.WAFER));

    for (let i = 0; i < bays; i++) {
      const bx = x0 + i * bayW * PX_PER_UNIT;
      box(bayW * 0.92, 2.0, 0.5, bx, rowY - 74, 1.0, wallMat);          // back wall
      box(bayW * 0.7, 1.5, 0.16, bx, rowY - 56, 0.75, bayMat);          // recessed bay
      box(bayW * 0.96, 0.26, 0.5, bx, rowY - 74, 2.13, lintelMat);      // stripe lintel
      for (const s of [-1, 1]) {
        box(0.26, 2.0, 0.26, bx + s * bayW * 0.46 * PX_PER_UNIT, rowY - 30, 1.0, postMat);
      }
    }
    // One long wafer roof over the whole row, cantilevered forward over the bays.
    box(bays * bayW + 0.7, 0.22, 2.0, pitRowPx.x, rowY - 50, 2.11, postMat);

    // Pit lane: a cocoa apron between the garages and the main straight.
    box(bays * bayW + 1.6, 0.03, 1.1, pitRowPx.x, rowY + 34, Y_TARMAC,
      m(new THREE.MeshStandardMaterial({ color: RACER.ASPHALT_WORN, roughness: 0.92 })));

    // Syrup drums + a cone, so the apron reads as a working pit.
    const drumMat = m(candyMat(THREE, CAKE.STRAWBERRY_DEEP));
    for (let i = 0; i < 3; i++) {
      const dm = new THREE.Mesh(g(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 10)), drumMat);
      dm.position.set(pxToSceneX(pitRowPx.x + (i - 1) * 170), 0.35, pxToSceneZ(rowY + 96));
      group.add(dm);
    }
  }

  // ---------- VICTORY LANE — tall, vertical, radial ----------
  {
    const podiumY = victoryLanePx.y;
    // Three-tier podium as a stack of cake steps: 2nd, 1st, 3rd left-to-right,
    // the way a real podium reads.
    const steps: Array<{ dx: number; h: number; color: number }> = [
      { dx: -1.5, h: 0.75, color: CAKE.STRAWBERRY },
      { dx: 0, h: 1.15, color: CAKE.VANILLA },
      { dx: 1.5, h: 0.5, color: CAKE.MINT },
    ];
    for (const s of steps) {
      box(1.35, s.h, 1.35, victoryLanePx.x + s.dx * PX_PER_UNIT, podiumY, s.h / 2, m(cakeMat(THREE, s.color)));
      // Frosting cap must be NARROWER than the step. At 1.45 on a 1.35 body it
      // overhung on all four sides, so from any raised angle you saw nothing but
      // white caps and the strawberry/vanilla/mint steps read as plain blocks.
      box(1.12, 0.1, 1.12, victoryLanePx.x + s.dx * PX_PER_UNIT, podiumY, s.h + 0.05, m(frostingMat(THREE, CAKE.FROSTING)));
    }
    // A cherry on the winner's step.
    const cherry = new THREE.Mesh(g(new THREE.SphereGeometry(0.2, 10, 8)), m(candyMat(THREE, CAKE.STRAWBERRY_DEEP)));
    cherry.position.set(pxToSceneX(victoryLanePx.x), 1.15 + 0.22, pxToSceneZ(podiumY));
    group.add(cherry);

    // Layer-cake grandstand facing the main straight (north of the pad).
    const standY = victoryLanePx.y - padHalfPx.hh * 0.6;
    const spongeMat = m(cakeMat(THREE, CAKE.VANILLA_DEEP));
    const creamMat = m(frostingMat(THREE, CAKE.FROSTING));
    for (let tier = 0; tier < 4; tier++) {
      const w = 5.4 - tier * 0.35;
      box(w, 0.34, 0.85, victoryLanePx.x, standY + tier * 46, 0.17 + tier * 0.34, tier % 2 === 0 ? spongeMat : creamMat);
    }
    // Canopy roof on posts.
    box(5.6, 0.16, 3.4, victoryLanePx.x, standY + 70, 1.95, m(frostingMat(THREE, CAKE.STRAWBERRY)));
    for (const s of [-1, 1]) box(0.2, 2.0, 0.2, victoryLanePx.x + s * 2.6 * PX_PER_UNIT, standY + 138, 1.0, m(cookieMat(THREE, WORLD.WAFER)));
  }

  // ---------- The pace car ----------
  // Strawberry + frosting: TRANSIT livery, matching the bus and the Sugar
  // Express. Deliberately not RACER.PLAYER_BODY and not the kid's own frosting
  // colour — a car in the player's colours driving itself around would read as
  // "your car is racing without you".
  const pace = buildJeep(THREE, { bodyColor: CAKE.STRAWBERRY, trimColor: CAKE.FROSTING });
  geometries.push(...pace.geometries);
  materials.push(...pace.materials);
  group.add(pace.group);
  let paceT = finishT;
  const placePace = (): void => {
    const p = track.offsetAt(paceT, -0.35);
    pace.group.position.set(pxToSceneX(p.x), Y_TARMAC, pxToSceneZ(p.y));
    pace.group.rotation.y = headingAt(paceT);
  };
  placePace();

  const update = (dtMs: number): void => {
    if (reduceMotion) return; // parked on the grid
    const dt = Math.min(dtMs, 50) / 1000;
    paceT = (paceT + (PACE_SPEED_PX * dt) / track.lengthPx) % 1;
    placePace();
    const spin = pace.spinParts;
    if (spin) for (const p of spin) p.rotation[pace.spinAxis ?? 'x'] += dt * 7;
  };

  return { group, geometries, materials, instanced, update };
}
