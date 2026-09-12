// 🚙 Jeep — the chunky cookie 4x4.
//
// A stout gingerbread-cookie body with an open cockpit tub, a frosting roll-bar
// windshield, amber gumdrop headlights, and four fat licorice tires. The cupcake
// sits down inside the cockpit and pokes up over the windshield. Built to read
// as "adventure buggy made of cookie" — boxy and friendly, never militaristic.
//
// Faces +Z (headlights + hood lead). Base (tire contact) at y = 0.
// Cockpit seat surface ≈ y 0.5.
//   → Engine should lift the rider by +0.5 so it sits in the cockpit.
//
// ~336 triangles. One tire geometry is shared across all four wheels.
//
// Animated parts: the four wheel pivots (spinParts, spinAxis 'x').

import type * as THREE from 'three';
import type { ThreeNS } from '../types';
import type { VehicleModel } from './index';
import { cookieMat, frostingMat, candyMat, cakeMat } from '../materials';
import { CAKE, WORLD } from '@/lib/games/theme/palette';

export function buildJeep(
  THREE: ThreeNS,
  opts: { bodyColor?: number; trimColor?: number } = {},
): VehicleModel {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const geo = <T extends THREE.BufferGeometry>(g: T): T => {
    geometries.push(g);
    return g;
  };
  const mat = <T extends THREE.Material>(m: T): T => {
    materials.push(m);
    return m;
  };
  /** Convenience: track a box + material and drop it in the group. */
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material,
  ): THREE.Mesh => {
    const m = new THREE.Mesh(geo(new THREE.BoxGeometry(w, h, d)), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  const bodyColor = opts.bodyColor ?? 0xcf9a52; // golden cookie
  const trimColor = opts.trimColor ?? CAKE.FROSTING;

  const bodyMat = mat(cookieMat(THREE, bodyColor));
  const trimMat = mat(frostingMat(THREE, trimColor));
  const cushionMat = mat(cakeMat(THREE, CAKE.STRAWBERRY)); // strawberry seat

  // ---- Chassis + hood ----
  box(0.7, 0.12, 1.15, 0, 0.28, 0, bodyMat); // floor slab
  box(0.7, 0.22, 0.42, 0, 0.42, 0.42, bodyMat); // hood (front, +Z)

  // ---- Open cockpit tub: two side walls + a rear wall ----
  box(0.06, 0.28, 0.72, -0.32, 0.5, -0.06, bodyMat);
  box(0.06, 0.28, 0.72, 0.32, 0.5, -0.06, bodyMat);
  box(0.7, 0.28, 0.06, 0, 0.5, -0.42, bodyMat);

  // ---- Seat (cushion + back) ----
  box(0.52, 0.08, 0.3, 0, 0.44, -0.14, cushionMat); // cushion → sit at ≈0.5
  box(0.5, 0.24, 0.06, 0, 0.54, -0.32, cushionMat); // seat back

  // ---- Frosting roll-bar / windshield frame ----
  box(0.6, 0.05, 0.05, 0, 0.68, 0.22, trimMat); // top bar
  box(0.05, 0.3, 0.05, -0.28, 0.53, 0.22, trimMat); // left post
  box(0.05, 0.3, 0.05, 0.28, 0.53, 0.22, trimMat); // right post

  // ---- Bumpers (frosting trim) ----
  box(0.74, 0.08, 0.06, 0, 0.3, 0.63, trimMat); // front
  box(0.74, 0.08, 0.06, 0, 0.3, -0.63, trimMat); // rear

  // ---- Amber gumdrop headlights ----
  const lampMat = mat(candyMat(THREE, WORLD.GLOW_WARM));
  const lampGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8));
  for (const lx of [-0.22, 0.22]) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.rotation.x = Math.PI / 2; // face forward (+Z)
    lamp.position.set(lx, 0.4, 0.64);
    group.add(lamp);
  }

  // ---- Four fat licorice tires (shared geometry) ----
  const R = 0.17;
  const tireMat = mat(candyMat(THREE, CAKE.CHOCOLATE_DEEP));
  const tireGeo = geo(new THREE.CylinderGeometry(R, R, 0.13, 8));
  const spinParts: THREE.Object3D[] = [];
  for (const wx of [-0.4, 0.4]) {
    for (const wz of [0.4, -0.4]) {
      const pivot = new THREE.Group();
      pivot.position.set(wx, R, wz);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2; // axle along X
      tire.castShadow = true;
      pivot.add(tire);
      group.add(pivot);
      spinParts.push(pivot);
    }
  }

  return { group, geometries, materials, spinParts, spinAxis: 'x' };
}
