// Rentable, rideable cake-themed vehicles for the Gamecakes 3D town.
//
// Four hand-built low-poly meshes a kid can rent and ride around /town:
//   🛹 skateboard · 🚙 jeep · ✈️ biplane · 🎈 hot-air balloon
//
// Every builder follows the same contract as `buildCupcakeModel` in
// avatar.ts — it returns a { group, geometries, materials } bundle so the
// engine's dispose sink can free every GPU resource, and it NEVER imports
// `three` at runtime (the namespace is threaded in as a ThreeNS argument, same
// bundle-hygiene rule as the rest of src/lib/town/three/*).
//
// ORIENTATION CONTRACT (matches the cupcake avatar):
//   * base of the vehicle sits at y = 0
//   * the vehicle faces +Z (the engine rotates group.rotation.y toward velocity)
//   * a ~0.9-unit cupcake rides on top; each builder documents the Y-offset the
//     engine should lift the rider so it "sits/stands on" the vehicle.
//
// ANIMATED PARTS CONVENTION:
//   A builder that has spinning sub-parts (wheels, propeller) returns them via
//   `spinParts` (an array of pivot Object3Ds) + `spinAxis` (the LOCAL axis to
//   rotate about each frame). The engine drives them with, e.g.:
//     for (const p of v.spinParts) p.rotation[v.spinAxis] += speed * dt;
//   The base { group, geometries, materials } fields are ALWAYS present; the
//   spin fields are optional (the balloon has none).

import type * as THREE from 'three';

/** The disposable bundle every vehicle builder returns. Callers push
 *  `geometries` + `materials` into their tracked dispose sinks. `spinParts` /
 *  `spinAxis` are present only for vehicles with animated sub-parts. */
export interface VehicleModel {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  /** Pivot nodes the engine rotates every frame (wheels, propeller). Each
   *  pivot's local `spinAxis` is aligned so a positive rotation rolls/spins it
   *  correctly. Omitted when the vehicle has no moving parts (balloon). */
  spinParts?: THREE.Object3D[];
  /** The LOCAL axis to advance on each `spinParts` node per frame. */
  spinAxis?: 'x' | 'y' | 'z';
}

export { buildSkateboard } from './skateboard';
export { buildJeep } from './jeep';
export { buildBiplane } from './biplane';
export { buildBalloon } from './balloon';
