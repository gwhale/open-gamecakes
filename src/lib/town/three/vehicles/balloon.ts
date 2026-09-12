// 🎈 Hot-Air Balloon — the dreamy top-tier ride.
//
// A big striped-frosting envelope (alternating strawberry + cream gores) floating
// over a woven-cookie basket, slung on four licorice ropes, with a glowing amber
// burner at the mouth. The cupcake STANDS in the basket and pokes over the rim.
// The showpiece ride — slow, sweet, and celebratory.
//
// Faces +Z (basket rim + burner are radially symmetric, so heading is cosmetic).
// Base (basket bottom) at y = 0. Basket standing floor ≈ y 0.4.
//   → Engine should lift the rider by +0.4 so it stands in the basket.
//
// ~296 triangles. The envelope is 8 clones of ONE gore geometry (tracked once),
// alternating two frosting materials for the stripe.
//
// Animated parts: NONE (spinParts/spinAxis omitted). The balloon's only life is
// the engine's idle bob/sway; the `balloon` and `basket` child groups are named
// so the engine can add a gentle sway to the envelope if it wants.

import type * as THREE from 'three';
import type { ThreeNS } from '../types';
import type { VehicleModel } from './index';
import { cookieMat, frostingMat, candyMat } from '../materials';
import { CAKE, WORLD } from '@/lib/games/theme/palette';

export function buildBalloon(
  THREE: ThreeNS,
  opts: { stripeColor?: number; creamColor?: number } = {},
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

  const stripeColor = opts.stripeColor ?? CAKE.STRAWBERRY;
  const creamColor = opts.creamColor ?? CAKE.FROSTING;

  // ---- Basket: open woven-cookie tub with a false floor near the rim ----
  const basket = new THREE.Group();
  basket.name = 'basket';
  group.add(basket);
  const basketMat = mat(cookieMat(THREE, 0xb07b3f)); // woven biscuit
  // Walls: an open-ended cone (slightly tapered) so it reads as a basket.
  const walls = new THREE.Mesh(
    geo(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 8, 1, true)),
    basketMat,
  );
  walls.position.y = 0.25;
  walls.castShadow = true;
  basket.add(walls);
  // Standing floor (top ≈ 0.4 → rider offset +0.4).
  const floor = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.22, 0.22, 0.04, 8)), basketMat);
  floor.position.y = 0.38;
  basket.add(floor);
  // Rim lip.
  const rimMat = mat(frostingMat(THREE, creamColor));
  const rim = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.25, 0.25, 0.04, 8)), rimMat);
  rim.position.y = 0.5;
  basket.add(rim);

  // ---- Burner: a small glowing amber ring under the envelope mouth ----
  const burnerMat = mat(candyMat(THREE, WORLD.GLOW_WARM));
  const burner = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 6)), burnerMat);
  burner.position.y = 0.58;
  basket.add(burner);

  // ---- Ropes: four licorice strands from rim up to the envelope mouth ----
  const ropeMat = mat(candyMat(THREE, CAKE.CHOCOLATE_DEEP));
  const ropeGeo = geo(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 4, 1, true));
  const ropeR = 0.22;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.set(Math.cos(a) * ropeR, 0.68, Math.sin(a) * ropeR);
    rope.rotation.z = -Math.cos(a) * 0.32; // lean inward toward the mouth
    rope.rotation.x = Math.sin(a) * 0.32;
    basket.add(rope);
  }

  // ---- Envelope: 8 gores of ONE geometry, alternating stripe/cream ----
  const balloon = new THREE.Group();
  balloon.name = 'balloon';
  balloon.position.y = 1.2;
  balloon.scale.y = 1.15; // gentle teardrop
  group.add(balloon);

  const GORES = 8;
  const R = 0.6;
  const goreGeo = geo(new THREE.SphereGeometry(R, 2, 6, 0, (Math.PI * 2) / GORES));
  const stripeMat = mat(frostingMat(THREE, stripeColor));
  const creamMat = mat(frostingMat(THREE, creamColor));
  for (let i = 0; i < GORES; i++) {
    const gore = new THREE.Mesh(goreGeo, i % 2 === 0 ? stripeMat : creamMat);
    gore.rotation.y = (i / GORES) * Math.PI * 2;
    gore.castShadow = true;
    balloon.add(gore);
  }
  // Mouth cap (small cream disc closing the bottom opening of the gores).
  const mouth = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.1, 0.08, 8)), creamMat);
  mouth.position.y = -R * 1.15 + 0.02;
  balloon.add(mouth);

  return { group, geometries, materials };
}
