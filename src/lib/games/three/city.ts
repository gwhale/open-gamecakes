// Procedural cake city for Sandcastle Siege.
//
// A "building" is a vertical stack of box meshes (a layer cake), each backed by
// a cannon-es box body, topped with a cherry. Bodies start ASLEEP so the whole
// city is physically inert (no spawn jitter, no idle CPU) until a balloon wakes
// a stack on impact.
//
// On-brand: blocks are coloured from the Gamecakes frosting palette and a
// building alternates two of them so each tower reads as a stacked layer cake.
//
// No runtime `three`/`cannon-es` import — the loaded namespaces arrive as args
// (see types.ts for why).

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS } from './types';

export interface CityBlock {
  mesh: THREE.Mesh;
  body: CANNON.Body;
}

export interface Building {
  blocks: CityBlock[];
  /** Y of the top block's center at spawn — the "full height" reference. */
  originalTopY: number;
  /** Flattened once the tallest remaining block falls below this Y. */
  flattenThresholdY: number;
  flattened: boolean;
  /** Per-building shared geometry, disposed once. */
  geometry: THREE.BoxGeometry;
  /** Per-block materials (2 frosting colours alternating), disposed in dispose. */
  materials: THREE.MeshStandardMaterial[];
  /** Cherry topper, riding on the top block's mesh. */
  cherryGeo: THREE.SphereGeometry;
  cherryMat: THREE.MeshStandardMaterial;
}

export interface City {
  buildings: Building[];
  dispose(scene: THREE.Scene, world: CANNON.World): void;
}

/** Gamecakes frosting palette — strawberry, mint, vanilla, chocolate,
 *  blueberry, cream. Each tower picks two and alternates them by layer. */
const FROSTING = [
  0xfb7185, // strawberry
  0x6ee7b7, // mint
  0xfde68a, // vanilla
  0xb5764a, // chocolate
  0x93b4f0, // blueberry
  0xfff1d6, // cream
];
const CHERRY_RED = 0xe11d48;

interface CreateCityOpts {
  count: number;
  blockMaterial: CANNON.Material;
  rng: () => number;
  zone: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function createCity(
  THREE: ThreeNS,
  CANNON: CannonNS,
  scene: THREE.Scene,
  world: CANNON.World,
  opts: CreateCityOpts,
): City {
  const { count, blockMaterial, rng, zone } = opts;

  // --- Grid-jitter placement: no overlap, but organic ---
  const maxFootprint = 1.7;
  const gap = 1.1;
  const cell = maxFootprint + gap;
  const cols = Math.max(1, Math.floor((zone.maxX - zone.minX) / cell));
  const rows = Math.max(1, Math.floor((zone.maxZ - zone.minZ) / cell));

  const cells: { cx: number; cz: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        cx: zone.minX + (c + 0.5) * cell,
        cz: zone.minZ + (r + 0.5) * cell,
      });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const buildings: Building[] = [];
  const wanted = Math.min(count, cells.length);

  for (let i = 0; i < wanted; i++) {
    const { cx, cz } = cells[i];
    const jx = cx + (rng() - 0.5) * gap;
    const jz = cz + (rng() - 0.5) * gap;

    const footprint = 1.0 + rng() * 0.7;
    const blockH = 0.5 + rng() * 0.25;
    // ~30% of cakes are tall layer-cake towers (6–9 tiers); the rest 3–6.
    // Taller towers make the skyline varied and give the blimp something
    // dramatic to flatten.
    const isTower = rng() < 0.3;
    const n = isTower ? 6 + Math.floor(rng() * 4) : 3 + Math.floor(rng() * 4);
    const hx = footprint / 2;
    const hy = blockH / 2;

    // Two distinct frosting colours per cake, alternated by layer.
    const ca = Math.floor(rng() * FROSTING.length);
    let cb = Math.floor(rng() * FROSTING.length);
    if (cb === ca) cb = (cb + 1) % FROSTING.length;
    const layerColors = [FROSTING[ca], FROSTING[cb]];

    const geometry = new THREE.BoxGeometry(footprint, blockH, footprint);
    const materials: THREE.MeshStandardMaterial[] = [];

    const blocks: CityBlock[] = [];
    for (let k = 0; k < n; k++) {
      const y = blockH * (k + 0.5);
      const material = new THREE.MeshStandardMaterial({
        color: layerColors[k % 2],
        roughness: 0.78,
        metalness: 0.0,
      });
      materials.push(material);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(jx, y, jz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hx)),
        position: new CANNON.Vec3(jx, y, jz),
        material: blockMaterial,
        allowSleep: true,
        sleepSpeedLimit: 0.15,
        sleepTimeLimit: 0.4,
      });
      body.sleep();
      world.addBody(body);

      blocks.push({ mesh, body });
    }

    // Cherry on top — parented to the top block's mesh so it rides along when
    // the cake topples. Position is local to that block (just above its top).
    const cherryGeo = new THREE.SphereGeometry(Math.min(0.18, footprint * 0.22), 12, 10);
    const cherryMat = new THREE.MeshStandardMaterial({
      color: CHERRY_RED,
      roughness: 0.3,
      metalness: 0.0,
    });
    const cherry = new THREE.Mesh(cherryGeo, cherryMat);
    cherry.castShadow = true;
    cherry.position.set(0, blockH / 2 + cherryGeo.parameters.radius * 0.8, 0);
    blocks[blocks.length - 1].mesh.add(cherry);

    const originalTopY = blockH * (n - 0.5);
    buildings.push({
      blocks,
      originalTopY,
      // Counts as flattened once the tallest remaining block drops below half
      // its original height — forgiving enough that a solid hit that topples a
      // (now possibly tall) tower reliably registers, even mid-collapse.
      flattenThresholdY: originalTopY * 0.5,
      flattened: false,
      geometry,
      materials,
      cherryGeo,
      cherryMat,
    });
  }

  return {
    buildings,
    dispose(s: THREE.Scene, w: CANNON.World): void {
      for (const b of buildings) {
        for (const blk of b.blocks) {
          s.remove(blk.mesh);
          w.removeBody(blk.body);
        }
        b.geometry.dispose();
        for (const m of b.materials) m.dispose();
        b.cherryGeo.dispose();
        b.cherryMat.dispose();
      }
      buildings.length = 0;
    },
  };
}
