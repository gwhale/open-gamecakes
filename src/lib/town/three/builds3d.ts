// Town builds, drawn: the roads, fences, lamps, benches, flower beds, trees and
// houses kids place on the grid (catalog + grid rules in @/lib/town/builds).
//
// A family can hold hundreds of pieces, and an iPad cannot afford a draw call
// per fence post. So each kind is a handful of merged geometries, one per
// colour, and every placed piece is an instance of those: about two dozen
// InstancedMeshes draw the whole set, however many pieces there are.
//
// Roads have no tile set. A road square is a centre patch plus one arm toward
// each neighbouring road square (roadMask), so straights, corners, T's and
// crossings all join up from two shapes. Road squares tilt to follow the
// hill under them; everything else stands upright on a short plinth that
// reaches down into the slope.
//
// Follows the town convention: no runtime `three` import, types only.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { pxToSceneX, pxToSceneZ } from './types';
import { groundDecalDepthBias } from './materials';
import { AUTHORED_BUILDS, type AuthoredRegistry } from './authored-registry';
import { CAKE } from '@/lib/games/theme/palette';
import {
  BUILD_CATALOG,
  CELL_PX,
  cellCenterPx,
  cellKey,
  roadMask,
  type BuildKind,
  type TownBuild,
} from '@/lib/town/builds';

/** Ghost (placement preview) state, set by the engine while build mode is on. */
export interface BuildGhost {
  /** 'remove' draws only the square outline. */
  kind: BuildKind | 'remove';
  gx: number;
  gy: number;
  rot: number;
  ok: boolean;
}

export interface BuildLayer {
  group: THREE.Group;
  /** Replace the drawn set. Pieces whose id is in `pop` grow in. */
  setBuilds(list: readonly TownBuild[], pop?: ReadonlySet<string>): void;
  setGhost(g: BuildGhost | null): void;
  update(dtMs: number): void;
  dispose(): void;
}

type AuthoredKind = keyof typeof AUTHORED_BUILDS;

/** One colour of one kind: a merged geometry and its material. */
interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

const POP_MS = 420;
/** Instances reserved up front per mesh; grows (rebuilds) if exceeded. */
const START_CAP = 32;

/** Merge boxes/cylinders/etc. (each with its own placement) into one
 *  non-indexed position+normal geometry. Hand-rolled because
 *  BufferGeometryUtils would be a runtime import of three's addons. */
function merge(THREE: ThreeNS, pieces: Array<{ geo: THREE.BufferGeometry; m: THREE.Matrix4 }>): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const { geo, m } of pieces) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    pos.push(...(g.getAttribute('position').array as Float32Array));
    nor.push(...(g.getAttribute('normal').array as Float32Array));
    g.dispose();
    geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

export function createBuildLayer(
  THREE: ThreeNS,
  /** Ground height (scene units) at a city-px point. */
  heightAt: (px: number, py: number) => number,
  reduceMotion: boolean,
  /** Loaded Blender art for the AUTHORED_BUILDS kinds; null draws the plain tree. */
  art: AuthoredRegistry | null = null,
): BuildLayer {
  const group = new THREE.Group();
  group.name = 'town-builds';
  const mats: THREE.Material[] = [];

  const at = (x: number, y: number, z: number, rotY = 0, rotX = 0, rotZ = 0): THREE.Matrix4 => {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rotX, rotY, rotZ));
    m.setPosition(x, y, z);
    return m;
  };
  const mat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...opts });
    mats.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d);
  const cyl = (rt: number, rb: number, h: number, seg = 10): THREE.BufferGeometry =>
    new THREE.CylinderGeometry(rt, rb, h, seg);
  const ball = (r: number): THREE.BufferGeometry => new THREE.SphereGeometry(r, 12, 9);

  // ---- Shared materials ----
  const chocolate = mat(CAKE.CHOCOLATE, { roughness: 0.7 });
  const vanilla = mat(CAKE.VANILLA, { roughness: 0.8 });
  const strawberry = mat(CAKE.STRAWBERRY, { roughness: 0.4 });
  const mint = mat(CAKE.MINT_DEEP, { roughness: 0.5 });
  const white = mat(CAKE.FROSTING, { roughness: 0.4 });
  const cookie = mat(0xcf9a52, { roughness: 0.62 });
  const bulb = mat(0xfff4c2, { emissive: 0xffd76a, emissiveIntensity: 0.9 });
  const sky = mat(0x93c5fd, { roughness: 0.2 });
  const road = groundDecalDepthBias(mat(0xe3b46c, { roughness: 0.85 }), 1);
  const petals = [mat(0xf472b6), mat(CAKE.AMBER), mat(0xc084fc)];

  // ---- Shapes, per kind, one merged geometry per material ----
  // Built in cell-local scene units: the square spans -0.5..0.5 on x and z,
  // y = 0 is the ground, the piece's front faces +z (south) at rot 0.
  const PLINTH = 0.3; // how far upright pieces reach below their base
  const codeShapes: Record<Exclude<BuildKind, 'road' | AuthoredKind>, Part[]> = {
    fence: [
      {
        mat: white,
        geo: merge(THREE, [-0.42, 0, 0.42].map((x) => ({ geo: box(0.09, 0.55 + PLINTH, 0.09), m: at(x, (0.55 - PLINTH) / 2, 0) }))),
      },
      {
        mat: strawberry,
        geo: merge(THREE, [0.2, 0.4].map((y) => ({ geo: box(0.98, 0.06, 0.05), m: at(0, y, 0) }))),
      },
    ],
    lamp: [
      { mat: chocolate, geo: merge(THREE, [
        { geo: cyl(0.15, 0.17, 0.1 + PLINTH), m: at(0, (0.1 - PLINTH) / 2, 0) },
        { geo: cyl(0.045, 0.055, 1.15), m: at(0, 0.62, 0) },
        { geo: cyl(0.16, 0.05, 0.08), m: at(0, 1.38, 0) },
      ]) },
      { mat: bulb, geo: merge(THREE, [{ geo: ball(0.14), m: at(0, 1.26, 0) }]) },
    ],
    bench: [
      { mat: cookie, geo: merge(THREE, [
        { geo: box(0.78, 0.07, 0.28), m: at(0, 0.32, 0.02) },
        { geo: box(0.78, 0.22, 0.05), m: at(0, 0.5, -0.12, 0, -0.12) },
      ]) },
      { mat: chocolate, geo: merge(THREE, [-0.32, 0.32].flatMap((x) => [
        { geo: box(0.06, 0.3 + PLINTH, 0.06), m: at(x, (0.3 - PLINTH) / 2, 0.1) },
        { geo: box(0.06, 0.3 + PLINTH, 0.06), m: at(x, (0.3 - PLINTH) / 2, -0.08) },
      ])) },
    ],
    flowers: [
      { mat: chocolate, geo: merge(THREE, [{ geo: box(0.74, 0.14 + PLINTH, 0.74), m: at(0, (0.14 - PLINTH) / 2, 0) }]) },
      { mat: mint, geo: merge(THREE, [[-0.2, -0.2], [0.2, 0.18], [0.02, 0.02], [-0.18, 0.2], [0.21, -0.19]].map(([x, z]) => ({ geo: cyl(0.02, 0.03, 0.22, 5), m: at(x, 0.24, z) }))) },
      ...petals.map((m, i) => ({
        mat: m,
        geo: merge(THREE, [[-0.2, -0.2], [0.2, 0.18], [0.02, 0.02], [-0.18, 0.2], [0.21, -0.19]]
          .filter((_, j) => j % 3 === i)
          .map(([x, z]) => ({ geo: ball(0.1), m: at(x, 0.38, z) }))),
      })),
    ],
    tree: [
      { mat: chocolate, geo: merge(THREE, [{ geo: cyl(0.08, 0.12, 0.8 + PLINTH, 8), m: at(0, (0.8 - PLINTH) / 2, 0) }]) },
      { mat: mint, geo: merge(THREE, [
        { geo: ball(0.42), m: at(0, 1.05, 0) },
        { geo: ball(0.3), m: at(0.22, 1.3, 0.08) },
        { geo: ball(0.28), m: at(-0.2, 1.28, -0.1) },
      ]) },
      { mat: strawberry, geo: merge(THREE, [[0.3, 1.0, 0.28], [-0.32, 1.12, 0.12], [0.05, 1.45, 0.3]].map(([x, y, z]) => ({ geo: ball(0.06), m: at(x, y, z) }))) },
    ],
    house: [
      { mat: vanilla, geo: merge(THREE, [{ geo: box(0.82, 0.6 + PLINTH, 0.76), m: at(0, (0.6 - PLINTH) / 2, 0) }]) },
      { mat: strawberry, geo: merge(THREE, [
        { geo: new THREE.ConeGeometry(0.66, 0.46, 4), m: at(0, 0.83, 0, Math.PI / 4) },
        { geo: box(0.12, 0.26, 0.12), m: at(0.2, 0.9, -0.12) },
      ]) },
      { mat: chocolate, geo: merge(THREE, [{ geo: box(0.2, 0.32, 0.03), m: at(0, 0.16, 0.38) }]) },
      { mat: sky, geo: merge(THREE, [
        { geo: box(0.17, 0.15, 0.03), m: at(-0.24, 0.38, 0.38) },
        { geo: box(0.17, 0.15, 0.03), m: at(0.24, 0.38, 0.38) },
      ]) },
      { mat: white, geo: merge(THREE, [{ geo: box(0.86, 0.06, 0.8), m: at(0, 0.62, 0) }]) },
    ],
  };
  // Blender trees: each mesh of the GLB, baked into cell-local space, is one
  // Part. A palette-atlas GLB is a single mesh, so a tree stays one instanced
  // draw however many are placed. The materials stay the registry's.
  const authoredParts = (kind: AuthoredKind): Part[] => {
    const root = art?.take(AUTHORED_BUILDS[kind].key);
    if (!root) return codeShapes.tree;
    root.updateMatrixWorld(true);
    const parts: Part[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      parts.push({ geo: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld), mat: mesh.material });
    });
    return parts.length > 0 ? parts : codeShapes.tree;
  };
  const shapes: Record<Exclude<BuildKind, 'road'>, Part[]> = {
    ...codeShapes,
    'cotton-tree': authoredParts('cotton-tree'),
    'gumdrop-pine': authoredParts('gumdrop-pine'),
    'cane-palm': authoredParts('cane-palm'),
  };

  // Road: a centre patch and an arm (pointing north at rot 0). Half sunk so a
  // slight mismatch with the hill reads as the road pressing into the grass.
  const roadCentre: Part = { mat: road, geo: merge(THREE, [{ geo: box(0.66, 0.08, 0.66), m: at(0, 0, 0) }]) };
  const roadArm: Part = { mat: road, geo: merge(THREE, [{ geo: box(0.66, 0.08, 0.2), m: at(0, 0, -0.42) }]) };

  // ---- Instanced meshes ----
  interface Slot {
    part: Part;
    mesh: THREE.InstancedMesh;
    cap: number;
  }
  const slots = new Map<Part, Slot>();
  const slotFor = (part: Part, need: number): Slot => {
    let s = slots.get(part);
    if (!s || s.cap < need) {
      if (s) {
        group.remove(s.mesh);
        s.mesh.dispose();
      }
      let cap = s?.cap ?? START_CAP;
      while (cap < need) cap *= 2;
      const mesh = new THREE.InstancedMesh(part.geo, part.mat, cap);
      mesh.castShadow = part.mat !== road;
      mesh.receiveShadow = true;
      // Instances span the town; per-instance culling would need a bounds pass.
      mesh.frustumCulled = false;
      group.add(mesh);
      s = { part, mesh, cap };
      slots.set(part, s);
    }
    return s;
  };

  /** Where each placed piece's instances live, for the grow-in animation. */
  interface Placed {
    base: THREE.Matrix4;
    refs: Array<{ slot: Slot; index: number; local: THREE.Matrix4 | null }>;
    popT: number;
  }
  let placed: Placed[] = [];

  const tmp = new THREE.Matrix4();
  const scaleM = new THREE.Matrix4();

  /** Upright piece: stand on the LOWEST of five ground samples, so the plinth
   *  reaches into the slope instead of floating over its downhill side. */
  const uprightBase = (gx: number, gy: number, rot: number): THREE.Matrix4 => {
    const c = cellCenterPx(gx, gy);
    const h = CELL_PX * 0.4;
    const y = Math.min(
      heightAt(c.x, c.y),
      heightAt(c.x - h, c.y),
      heightAt(c.x + h, c.y),
      heightAt(c.x, c.y - h),
      heightAt(c.x, c.y + h),
    );
    return at(pxToSceneX(c.x), y, pxToSceneZ(c.y), -rot * (Math.PI / 2));
  };

  /** Road square: tilted to the hill's slope across the square. */
  const roadBase = (gx: number, gy: number): THREE.Matrix4 => {
    const c = cellCenterPx(gx, gy);
    const h = CELL_PX / 2;
    const hx = heightAt(c.x + h, c.y) - heightAt(c.x - h, c.y); // rise per scene unit
    const hz = heightAt(c.x, c.y + h) - heightAt(c.x, c.y - h);
    const n = new THREE.Vector3(-hx, 1, -hz).normalize();
    const tx = new THREE.Vector3(1, hx, 0).normalize();
    const tz = new THREE.Vector3().crossVectors(tx, n).normalize();
    tx.crossVectors(n, tz).normalize();
    const m = new THREE.Matrix4().makeBasis(tx, n, tz);
    m.setPosition(pxToSceneX(c.x), heightAt(c.x, c.y) + 0.01, pxToSceneZ(c.y));
    return m;
  };

  const ARM_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // N, E, S, W

  const writeInstance = (p: Placed): void => {
    const t = p.popT;
    // easeOutBack, from flat to a little past full height and back.
    const k = t >= 1 ? 1 : 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
    scaleM.makeScale(1, Math.max(0.02, k), 1);
    for (const r of p.refs) {
      tmp.copy(p.base).multiply(scaleM);
      if (r.local) tmp.multiply(r.local);
      r.slot.mesh.setMatrixAt(r.index, tmp);
    }
  };

  /** Road squares currently placed, so the ghost road can join up too. */
  let roads = new Set<string>();
  const hasRoad = (gx: number, gy: number): boolean => roads.has(cellKey(gx, gy));

  const setBuilds = (list: readonly TownBuild[], pop?: ReadonlySet<string>): void => {
    roads = new Set(list.filter((b) => b.kind === 'road').map((b) => cellKey(b.gx, b.gy)));
    ghostKey = ''; // a new neighbour can change how the ghost road joins

    // Count instances per part first, so each mesh is sized once.
    const need = new Map<Part, number>();
    const bump = (p: Part, n = 1): void => {
      need.set(p, (need.get(p) ?? 0) + n);
    };
    for (const b of list) {
      if (b.kind === 'road') {
        bump(roadCentre);
        const mask = roadMask(b.gx, b.gy, hasRoad);
        for (let i = 0; i < 4; i++) if (mask & (1 << i)) bump(roadArm);
      } else {
        for (const p of shapes[b.kind]) bump(p);
      }
    }
    const used = new Map<Part, number>();
    const take = (p: Part): { slot: Slot; index: number } => {
      const slot = slotFor(p, need.get(p) ?? 1);
      const index = used.get(p) ?? 0;
      used.set(p, index + 1);
      return { slot, index };
    };

    placed = list.map((b) => {
      const popT = pop?.has(b.id) && !reduceMotion ? 0 : 1;
      if (b.kind === 'road') {
        const base = roadBase(b.gx, b.gy);
        const refs: Placed['refs'] = [{ ...take(roadCentre), local: null }];
        const mask = roadMask(b.gx, b.gy, hasRoad);
        for (let i = 0; i < 4; i++) {
          if (mask & (1 << i)) refs.push({ ...take(roadArm), local: new THREE.Matrix4().makeRotationY(ARM_ROT[i]) });
        }
        return { base, refs, popT };
      }
      const base = uprightBase(b.gx, b.gy, b.rot);
      return { base, refs: shapes[b.kind].map((p) => ({ ...take(p), local: null })), popT };
    });

    for (const p of placed) writeInstance(p);
    for (const [part, slot] of slots) {
      slot.mesh.count = used.get(part) ?? 0;
      slot.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  // ---- Ghost ----
  const ghost = new THREE.Group();
  ghost.visible = false;
  group.add(ghost);
  // Strong, glowing colours: a pale see-through green vanishes against the grass.
  const ghostMatOk = new THREE.MeshStandardMaterial({ color: 0x22c55e, transparent: true, opacity: 0.8, depthWrite: false, emissive: 0x22c55e, emissiveIntensity: 0.6, fog: false });
  const ghostMatBad = new THREE.MeshStandardMaterial({ color: 0xef4444, transparent: true, opacity: 0.8, depthWrite: false, emissive: 0xef4444, emissiveIntensity: 0.6, fog: false });
  mats.push(ghostMatOk, ghostMatBad);
  const squareGeo = new THREE.RingGeometry(0.62, 0.7, 4, 1, Math.PI / 4);
  squareGeo.rotateX(-Math.PI / 2);
  const square = new THREE.Mesh(squareGeo, ghostMatOk);
  square.scale.setScalar(Math.SQRT2 * 0.7);
  let ghostKey = '';

  const setGhost = (g: BuildGhost | null): void => {
    if (!g) {
      ghost.visible = false;
      ghostKey = '';
      return;
    }
    const m = g.ok ? ghostMatOk : ghostMatBad;
    const key = `${g.kind}|${g.gx}|${g.gy}|${g.rot}|${g.ok}`;
    if (key === ghostKey) return;
    ghostKey = key;
    ghost.clear();
    ghost.visible = true;
    const c = cellCenterPx(g.gx, g.gy);
    const base = g.kind === 'road' ? roadBase(g.gx, g.gy) : uprightBase(g.gx, g.gy, g.rot);
    const parts: Array<{ part: Part; local: THREE.Matrix4 | null }> =
      g.kind === 'remove'
        ? []
        : g.kind === 'road'
          ? [
              { part: roadCentre, local: null },
              ...ARM_ROT.filter((_, i) => roadMask(g.gx, g.gy, hasRoad) & (1 << i)).map((r) => ({
                part: roadArm,
                local: new THREE.Matrix4().makeRotationY(r),
              })),
            ]
          : shapes[g.kind].map((part) => ({ part, local: null }));
    for (const { part, local } of parts) {
      const mesh = new THREE.Mesh(part.geo, m);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(base);
      if (local) mesh.matrix.multiply(local);
      // Lift the preview a hair so it never z-fights the real piece below it.
      mesh.matrix.elements[13] += 0.02;
      ghost.add(mesh);
    }
    square.material = m;
    square.position.set(pxToSceneX(c.x), heightAt(c.x, c.y) + 0.05, pxToSceneZ(c.y));
    ghost.add(square);
  };

  let ghostPulse = 0;
  const update = (dtMs: number): void => {
    let dirty = false;
    for (const p of placed) {
      if (p.popT >= 1) continue;
      p.popT = Math.min(1, p.popT + dtMs / POP_MS);
      writeInstance(p);
      dirty = true;
    }
    if (dirty) for (const s of slots.values()) s.mesh.instanceMatrix.needsUpdate = true;
    if (ghost.visible && !reduceMotion) {
      ghostPulse += dtMs / 1000;
      const o = 0.72 + 0.15 * Math.sin(ghostPulse * 5);
      ghostMatOk.opacity = o;
      ghostMatBad.opacity = o;
    }
  };

  const dispose = (): void => {
    for (const s of slots.values()) s.mesh.dispose();
    slots.clear();
    const geos = new Set<THREE.BufferGeometry>([roadCentre.geo, roadArm.geo, squareGeo]);
    for (const parts of Object.values(shapes)) for (const p of parts) geos.add(p.geo);
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    group.clear();
  };

  // Every kind in the catalog must have a shape; fail loudly in dev if one is
  // added to the catalog without one.
  for (const b of BUILD_CATALOG) {
    if (b.kind !== 'road' && !shapes[b.kind]) throw new Error(`builds3d: no shape for ${b.kind}`);
  }

  return { group, setBuilds, setGhost, update, dispose };
}
