// Reef scenery — coral heads and rocks scattered across the seabed.
//
// This is not decoration. In open water with a uniform floor there is nothing
// to measure motion against, and the sub feels like it is hovering however fast
// you drive it. Props ARE the speedometer, and they are the only reason the
// canyon edge reads as an edge. That is why they exist in a branch whose whole
// point is feel.
//
// Two InstancedMeshes, both seeded off the shared field so the reef is the same
// reef on both iPads. Placement REJECTS anything on a steep slope or off the
// shelf, so props sit on the sand instead of sprouting horizontally out of a
// canyon wall.
//
// No runtime `three` import; caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DOMAIN_RADIUS_M } from './types';
import { oceanFloorM } from './ocean-floor';
import { seeded, DEEP_SEED, TAU } from './world-math';
import { cakeMat, candyMat } from '@/lib/town/three/materials';
import { SPRINKLE_COLORS } from '@/lib/games/theme/palette';

/** How many of each. Instanced, so these are cheap — but every one is also a
 *  thing the fog has to draw through, so they are not free either. */
const CORAL_COUNT = 900;
const ROCK_COUNT = 420;

/** Props stop at this depth. Below it we are past the reef, and a coral head on
 *  a canyon wall at 300m is a lie about where you are. */
const CORAL_MAX_DEPTH = 130;

export interface Scenery {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/** Local slope of the seabed, 0 = flat. Used to reject cliff faces. */
function slopeAt(x: number, z: number): number {
  const dx = oceanFloorM(x + 1.5, z) - oceanFloorM(x - 1.5, z);
  const dz = oceanFloorM(x, z + 1.5) - oceanFloorM(x, z - 1.5);
  return Math.hypot(dx, dz) / 3;
}

export function createScenery(THREE: ThreeNS): Scenery {
  const group = new THREE.Group();
  group.name = 'Reef scenery';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const rng = seeded(DEEP_SEED + 4471);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  /** Find a spot that is inside the bowl, shallow enough, and flat enough.
   *  Returns null after a bounded number of tries rather than looping forever
   *  — a seed that happens to reject a lot must not hang the dive. */
  const findSpot = (maxDepth: number): { x: number; z: number; y: number } | null => {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = rng() * TAU;
      const r = Math.sqrt(rng()) * DOMAIN_RADIUS_M; // sqrt = uniform over area
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = oceanFloorM(x, z);
      if (-y > maxDepth) continue;
      if (slopeAt(x, z) > 0.55) continue;
      return { x, z, y };
    }
    return null;
  };

  // ---- Coral: a squashed icosahedron. Flat-shaded and faceted, which suits
  //      the town's low-poly candy look and costs one geometry. ----
  const coralGeo = new THREE.IcosahedronGeometry(1, 0);
  // Per-instance colour comes from `instanceColor`, NOT from vertexColors.
  // Setting vertexColors on a geometry that carries no colour attribute made
  // the shader read an attribute that was never there, and the whole reef came
  // out grey — on Sprinkle Reef, of all places.
  const coralMat = candyMat(THREE, 0xffffff);
  const coral = new THREE.InstancedMesh(coralGeo, coralMat, CORAL_COUNT);
  coral.name = 'Coral';
  coral.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CORAL_COUNT * 3),
    3,
  );
  let placed = 0;
  for (let i = 0; i < CORAL_COUNT; i++) {
    const spot = findSpot(CORAL_MAX_DEPTH);
    if (!spot) continue;
    const scale = 0.8 + rng() ** 2 * 3.2;
    dummy.position.set(spot.x, spot.y + scale * 0.5, spot.z);
    dummy.rotation.set(rng() * 0.4, rng() * TAU, rng() * 0.4);
    dummy.scale.set(scale, scale * (0.7 + rng() * 1.1), scale);
    dummy.updateMatrix();
    coral.setMatrixAt(placed, dummy.matrix);
    // Sprinkle colours, straight off the town palette — this is Sprinkle Reef.
    color.setHex(SPRINKLE_COLORS[Math.floor(rng() * SPRINKLE_COLORS.length)]);
    coral.setColorAt(placed, color);
    placed++;
  }
  coral.count = placed;
  coral.instanceMatrix.needsUpdate = true;
  if (coral.instanceColor) coral.instanceColor.needsUpdate = true;
  group.add(coral);
  geometries.push(coralGeo);
  materials.push(coralMat);

  // ---- Rocks: bigger, duller, allowed deeper. These are what give the drop
  //      and the canyon lip something for the eye to hold on to. ----
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = cakeMat(THREE, 0x8d8578);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rocks.name = 'Rocks';
  let rocksPlaced = 0;
  for (let i = 0; i < ROCK_COUNT; i++) {
    const spot = findSpot(360);
    if (!spot) continue;
    const scale = 1.4 + rng() ** 2 * 6;
    dummy.position.set(spot.x, spot.y + scale * 0.35, spot.z);
    dummy.rotation.set(rng() * TAU, rng() * TAU, rng() * TAU);
    dummy.scale.set(scale, scale * (0.5 + rng() * 0.6), scale * (0.8 + rng() * 0.5));
    dummy.updateMatrix();
    rocks.setMatrixAt(rocksPlaced++, dummy.matrix);
  }
  rocks.count = rocksPlaced;
  rocks.instanceMatrix.needsUpdate = true;
  group.add(rocks);
  geometries.push(rockGeo);
  materials.push(rockMat);

  return { group, geometries, materials };
}
