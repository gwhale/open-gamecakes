// The Kelp Kitchen — the forest on the shelf edge.
//
// This band (100–300m) has been open blue since the ocean shipped: the reef
// ends, the floor drops away, and there was nothing between there and the
// canyon but water and a depth number. It was the least interesting part of the
// dive and the longest, because it is the bit you cross every single time.
//
// Kelp fixes that for almost nothing. It is the cheapest possible content —
// one geometry, one instanced draw — and it does three jobs at once: it gives
// the drop a floor you can see falling away beside you, it gives the sub
// something to measure its speed against in open water, and it turns "the empty
// part" into somewhere with a name.
//
// ANCHORED BY DEPTH, NOT BY POSITION. Strands are planted wherever the seabed
// happens to lie between KELP_FLOOR_MIN and MAX, so the forest follows the
// shelf edge around the whole bowl instead of sitting in a hand-placed patch.
// Change the terrain and the forest moves with it.
//
// No runtime `three` import; caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DOMAIN_RADIUS_M } from './types';
import { oceanFloorM } from './ocean-floor';
import { seeded, DEEP_SEED, TAU } from './world-math';
import { cakeMat } from '@/lib/town/three/materials';

/** How many strands. Instanced, but each one is also a matrix updated every
 *  frame for the sway — this is the number to cut first if a tablet struggles. */
const KELP_COUNT = 520;

/** Kelp roots on seabed between these depths.
 *
 *  Widened after diving it. At 95–280m the forest was a narrow ring hugging the
 *  steepest part of the drop, and the honest result was that you could cross the
 *  whole band without seeing a single strand — the sub flies well above the
 *  slope on the way out, and by the time you sink to the floor you have already
 *  passed it. A forest you can miss entirely is not content.
 *
 *  Starting at 55m puts the first strands on the reef's own seaward margin,
 *  where a kid already is, so the forest ANNOUNCES the shelf edge instead of
 *  hiding below it. */
const KELP_FLOOR_MIN = 55;
const KELP_FLOOR_MAX = 300;

/** How tall a strand reaches (metres). Tall enough that the tops are above you
 *  when you are swimming at the roots — being INSIDE a forest is the point. */
const KELP_MIN_H = 14;
const KELP_MAX_H = 42;

export interface Kelp {
  group: THREE.Group;
  update(t: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

export function createKelp(THREE: ThreeNS): Kelp {
  const group = new THREE.Group();
  group.name = 'Kelp Kitchen';

  const rng = seeded(DEEP_SEED + 8821);

  // One tall tapered blade, origin at the ROOT so the instance matrix can pivot
  // it from the seabed rather than from its middle.
  // Wider than a real stipe. At 0.06/0.34 the forest read as telegraph wires
  // from any distance; kelp needs enough width to catch the light and be a
  // BLADE rather than a line.
  const geo = new THREE.CylinderGeometry(0.14, 0.55, 1, 5, 1);
  geo.translate(0, 0.5, 0);

  const mat = cakeMat(THREE, 0x4f7a4a);
  // Kelp is not a cake. Slightly translucent so the forest layers up into
  // depth rather than reading as a picket fence.
  mat.transparent = true;
  mat.opacity = 0.9;

  const mesh = new THREE.InstancedMesh(geo, mat, KELP_COUNT);
  mesh.name = 'Kelp';
  mesh.frustumCulled = false;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(KELP_COUNT * 3), 3);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  interface Strand {
    x: number;
    y: number;
    z: number;
    h: number;
    /** Radians of lean at full sway. */
    swayAmp: number;
    /** Offset so the whole forest does not lean in unison like a stadium wave. */
    phase: number;
    /** Which way this strand leans when it leans. */
    dir: number;
  }
  const strands: Strand[] = [];

  for (let i = 0; i < KELP_COUNT * 14 && strands.length < KELP_COUNT; i += 1) {
    const a = rng() * TAU;
    const r = Math.sqrt(rng()) * DOMAIN_RADIUS_M;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = oceanFloorM(x, z);
    const depth = -y;
    if (depth < KELP_FLOOR_MIN || depth > KELP_FLOOR_MAX) continue;
    strands.push({
      x,
      y,
      z,
      h: KELP_MIN_H + rng() ** 1.5 * (KELP_MAX_H - KELP_MIN_H),
      swayAmp: 0.06 + rng() * 0.1,
      phase: rng() * TAU,
      dir: rng() * TAU,
    });
  }

  // Colour varies per strand — a forest of one green is a wall.
  strands.forEach((s, i) => {
    color.setHSL(0.28 + (i % 7) * 0.006, 0.42, 0.22 + (i % 5) * 0.035);
    mesh.setColorAt(i, color);
  });
  mesh.count = strands.length;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    geometries: [geo],
    materials: [mat],
    update(t: number) {
      for (let i = 0; i < strands.length; i += 1) {
        const s = strands[i];
        // Lean from the root. Two frequencies so it breathes rather than ticks.
        const lean =
          Math.sin(t * 0.5 + s.phase) * s.swayAmp + Math.sin(t * 0.19 + s.phase * 1.7) * s.swayAmp * 0.5;
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(Math.cos(s.dir) * lean, s.dir, Math.sin(s.dir) * lean, 'YXZ');
        dummy.scale.set(1, s.h, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
