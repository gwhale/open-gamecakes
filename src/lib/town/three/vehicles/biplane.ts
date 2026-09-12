// ✈️ Biplane — the whimsical two-wing cake flyer.
//
// A vanilla-sponge fuselage with a strawberry-frosting upper and lower wing,
// a candy nose spinner, a spinnable propeller, an open cockpit ring the cupcake
// pokes out of, and two little gumdrop landing wheels. Storybook barnstormer,
// all cake — no rivets.
//
// Faces +Z (nose + prop lead). Base (wheel contact) at y = 0.
// Open cockpit opening ≈ y 0.6.
//   → Engine should lift the rider by +0.6 so it sits in the cockpit.
//
// ~288 triangles.
//
// Animated parts: the propeller pivot (spinParts, spinAxis 'z'). The pivot sits
// at the nose with its local Z pointing forward, so `pivot.rotation.z += v`
// spins the blades in the plane facing travel. (Landing wheels are static —
// the plane flies, so only the prop needs to move.)

import type * as THREE from 'three';
import type { ThreeNS } from '../types';
import type { VehicleModel } from './index';
import { cakeMat, frostingMat, candyMat } from '../materials';
import { CAKE } from '@/lib/games/theme/palette';

export function buildBiplane(
  THREE: ThreeNS,
  opts: { bodyColor?: number; wingColor?: number } = {},
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

  const bodyColor = opts.bodyColor ?? CAKE.VANILLA_DEEP; // vanilla sponge
  const wingColor = opts.wingColor ?? CAKE.STRAWBERRY;

  const bodyMat = mat(cakeMat(THREE, bodyColor));
  const wingMat = mat(frostingMat(THREE, wingColor));
  const trimMat = mat(candyMat(THREE, CAKE.STRAWBERRY_DEEP));

  // ---- Fuselage (cylinder laid along Z; fat nose, tapered tail) ----
  const fuse = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.1, 1.1, 8)), bodyMat);
  fuse.rotation.x = Math.PI / 2; // Y axis → Z: round faces become nose/tail
  fuse.position.set(0, 0.55, 0);
  fuse.castShadow = true;
  group.add(fuse);

  // ---- Nose cone ----
  const nose = new THREE.Mesh(geo(new THREE.ConeGeometry(0.16, 0.22, 8)), trimMat);
  nose.rotation.x = Math.PI / 2; // point +Z
  nose.position.set(0, 0.55, 0.6);
  nose.castShadow = true;
  group.add(nose);

  // ---- Wings (upper + lower) ----
  box(1.5, 0.05, 0.34, 0, 0.9, 0.05, wingMat); // top wing
  box(1.4, 0.05, 0.32, 0, 0.4, 0.05, wingMat); // bottom wing

  // ---- Wing struts (candy pillars linking the two wings) ----
  box(0.04, 0.5, 0.04, -0.5, 0.65, 0.05, trimMat);
  box(0.04, 0.5, 0.04, 0.5, 0.65, 0.05, trimMat);

  // ---- Tail: vertical fin + horizontal stabilizer ----
  box(0.05, 0.28, 0.28, 0, 0.66, -0.5, wingMat); // fin
  box(0.5, 0.04, 0.24, 0, 0.56, -0.5, wingMat); // stabilizer

  // ---- Open cockpit ring (a rim the cupcake sits inside) ----
  const rim = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10, 1, true)),
    trimMat,
  );
  rim.position.set(0, 0.72, -0.06);
  group.add(rim);

  // ---- Landing gear: two gumdrop wheels + candy struts (static) ----
  const R = 0.1;
  const wheelMat = mat(candyMat(THREE, CAKE.CHOCOLATE_DEEP));
  const wheelGeo = geo(new THREE.CylinderGeometry(R, R, 0.07, 8));
  for (const wx of [-0.28, 0.28]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, R, 0.15);
    wheel.castShadow = true;
    group.add(wheel);
    box(0.04, 0.3, 0.04, wx, 0.26, 0.12, trimMat); // strut up to bottom wing
  }
  box(0.05, 0.12, 0.16, 0, 0.06, -0.5, trimMat); // tail skid

  // ---- Propeller (spinnable) — hub + two blades on a nose pivot ----
  const propPivot = new THREE.Group();
  propPivot.position.set(0, 0.55, 0.71);
  propPivot.name = 'prop';
  const hub = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6)), trimMat);
  hub.rotation.x = Math.PI / 2;
  propPivot.add(hub);
  const bladeMatRef = wingMat; // reuse the frosting wing material
  const bladeV = new THREE.Mesh(geo(new THREE.BoxGeometry(0.05, 0.5, 0.02)), bladeMatRef);
  propPivot.add(bladeV);
  const bladeGeoH = geo(new THREE.BoxGeometry(0.5, 0.05, 0.02));
  const bladeH = new THREE.Mesh(bladeGeoH, bladeMatRef);
  propPivot.add(bladeH);
  group.add(propPivot);

  return { group, geometries, materials, spinParts: [propPivot], spinAxis: 'z' };
}
