// 🛹 Skateboard — the cheap, humble starter ride.
//
// A stubby cookie deck with a piped-frosting top and a scatter of sprinkles,
// rolling on four glossy gumdrop wheels. No cockpit: the cupcake just stands on
// the deck and cruises. This is the first thing a kid can afford, so it reads
// as a treat, not a machine — all cake, no chrome.
//
// Faces +Z. Base (wheel contact) at y = 0. Deck top surface ≈ y 0.15.
//   → Engine should lift the rider by +0.15 so it stands on the deck.
//
// ~212 triangles. One wheel geometry is shared across all four wheels.
//
// Animated parts: the four wheel pivots (spinParts, spinAxis 'x'). Each pivot's
// local X is the axle, so `pivot.rotation.x += v` rolls the board forward.

import type * as THREE from 'three';
import type { ThreeNS } from '../types';
import type { VehicleModel } from './index';
import { cookieMat, frostingMat, candyMat } from '../materials';
import { WOOD, CAKE, SPRINKLE_COLORS } from '@/lib/games/theme/palette';

export function buildSkateboard(
  THREE: ThreeNS,
  opts: { deckColor?: number; frostingColor?: number } = {},
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

  const deckColor = opts.deckColor ?? WOOD.PLANK_LIGHT; // warm biscuit deck
  const frostingColor = opts.frostingColor ?? CAKE.FROSTING;

  // ---- Deck: cookie plank + a piped-frosting top layer ----
  const deckMat = mat(cookieMat(THREE, deckColor));
  const deck = new THREE.Mesh(geo(new THREE.BoxGeometry(0.42, 0.05, 1.15)), deckMat);
  deck.position.y = 0.13;
  deck.castShadow = true;
  group.add(deck);

  const icingMat = mat(frostingMat(THREE, frostingColor));
  const icing = new THREE.Mesh(geo(new THREE.BoxGeometry(0.44, 0.03, 1.12)), icingMat);
  icing.position.y = 0.16;
  icing.castShadow = true;
  group.add(icing);

  // ---- Sprinkles: three tiny candy nubs on the icing for flair ----
  const sprinkleGeo = geo(new THREE.BoxGeometry(0.03, 0.015, 0.09));
  const sprinkleSpots: Array<[number, number, number]> = [
    [-0.1, 0.18, 0.25],
    [0.12, 0.18, -0.1],
    [-0.05, 0.18, -0.4],
  ];
  sprinkleSpots.forEach(([sx, sy, sz], i) => {
    const sMat = mat(candyMat(THREE, SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]));
    const s = new THREE.Mesh(sprinkleGeo, sMat);
    s.position.set(sx, sy, sz);
    s.rotation.y = i * 0.7;
    group.add(s);
  });

  // ---- Trucks: two candy axle bars slung under the deck ----
  const truckMat = mat(candyMat(THREE, CAKE.STRAWBERRY_DEEP));
  const truckGeo = geo(new THREE.BoxGeometry(0.34, 0.04, 0.06));
  for (const tz of [0.38, -0.38]) {
    const truck = new THREE.Mesh(truckGeo, truckMat);
    truck.position.set(0, 0.095, tz);
    group.add(truck);
  }

  // ---- Wheels: four glossy gumdrop rollers (shared geometry) ----
  const R = 0.075;
  const wheelMat = mat(candyMat(THREE, SPRINKLE_COLORS[1])); // mint gumdrops
  const wheelGeo = geo(new THREE.CylinderGeometry(R, R, 0.06, 8));
  const spinParts: THREE.Object3D[] = [];
  for (const wx of [-0.19, 0.19]) {
    for (const wz of [0.38, -0.38]) {
      // A pivot at the wheel center whose local X is the axle; the wheel mesh
      // is turned so its round faces point ±X. Engine spins the pivot on X.
      const pivot = new THREE.Group();
      pivot.position.set(wx, R, wz);
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      group.add(pivot);
      spinParts.push(pivot);
    }
  }

  return { group, geometries, materials, spinParts, spinAxis: 'x' };
}
