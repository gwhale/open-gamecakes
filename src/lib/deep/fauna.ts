// The animals.
//
// The first playtester's review of the ocean was, in full, "where are all the
// fish" — which was fair, since there were none. This is that.
//
// ONE INSTANCED MESH PER SPECIES, and every animal is a matrix updated on the
// frames it is close enough to matter. Nothing here does real flocking: a
// boids simulation for 500 fish would cost more than the entire rest of the
// dive and, under 90m of fog, would look identical to what this does. Each
// animal follows a cheap deterministic path and the SHOAL is created by giving
// a group of them the same centre and nearby phases.
//
// SPECIES AND DEPTHS COME FROM creatures.ts. Nothing about who lives where is
// decided in this file — that belongs somewhere a person can read it without
// scrolling past matrix maths.
//
// No runtime `three` import; caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DOMAIN_RADIUS_M } from './types';
import { oceanFloorM } from './ocean-floor';
import { seeded, DEEP_SEED, TAU } from './world-math';
import { candyMat, cakeMat } from '@/lib/town/three/materials';
import { CREATURES, type Creature } from './creatures';

/** Beyond this many metres an animal is not updated at all. Fog closes at
 *  62–170m depending on depth, so anything past this is invisible and moving
 *  it is pure cost. */
const SIM_RADIUS_M = 260;

export interface Fauna {
  group: THREE.Group;
  update(dt: number, t: number, camera: { x: number; y: number; z: number }): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

interface Animal {
  /** Home point it wanders around. */
  hx: number;
  hy: number;
  hz: number;
  /** Current position, written each frame. */
  x: number;
  y: number;
  z: number;
  phase: number;
  speed: number;
  radius: number;
  scale: number;
  /** Heading, so the model points where it is going. */
  yaw: number;
}

/** Build the body for one species. Deliberately crude shapes: at fog distance
 *  a fish is a silhouette and a moving one is a suggestion, so detail here is
 *  spent where it cannot be seen. */
function bodyFor(THREE: ThreeNS, c: Creature): THREE.BufferGeometry {
  switch (c.behaviour) {
    case 'glide': {
      // Rays and eels: long and flat.
      const g = new THREE.BoxGeometry(1, 0.16, 0.5);
      g.scale(c.sizeM, c.sizeM, c.sizeM);
      return g;
    }
    case 'drift': {
      // Jellies: a bell.
      const g = new THREE.SphereGeometry(0.5, 8, 6, 0, TAU, 0, Math.PI * 0.62);
      g.scale(c.sizeM, c.sizeM * 0.9, c.sizeM);
      return g;
    }
    case 'lurk': {
      const g = new THREE.DodecahedronGeometry(0.5, 0);
      g.scale(c.sizeM, c.sizeM * 0.55, c.sizeM);
      return g;
    }
    case 'school':
    default: {
      // A fish: a squashed diamond, longest along its own forward axis.
      const g = new THREE.OctahedronGeometry(0.5, 0);
      g.scale(c.sizeM * 1.6, c.sizeM * 0.7, c.sizeM * 0.6);
      return g;
    }
  }
}

export function createFauna(THREE: ThreeNS): Fauna {
  const group = new THREE.Group();
  group.name = 'Ocean life';
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const dummy = new THREE.Object3D();

  const species: Array<{
    creature: Creature;
    mesh: THREE.InstancedMesh;
    animals: Animal[];
  }> = [];

  for (const c of CREATURES) {
    const rng = seeded(DEEP_SEED + c.slug.length * 7919 + c.count);
    const geo = bodyFor(THREE, c);
    // Glowing animals get an emissive candy material; the rest are matte, so
    // the ones that light up in the dark actually read as unusual.
    const mat = c.glows ? candyMat(THREE, c.color) : cakeMat(THREE, c.color);
    if (c.glows) {
      mat.emissive.setHex(c.color);
      mat.emissiveIntensity = 0.55;
    }
    geometries.push(geo);
    materials.push(mat);

    const mesh = new THREE.InstancedMesh(geo, mat, c.count);
    mesh.name = c.name;
    mesh.frustumCulled = false;
    group.add(mesh);

    const animals: Animal[] = [];
    // Schools share a centre; everything else is scattered.
    // Smaller shoals, more of them — a shoal you never meet is worth nothing,
    // and more centres scattered through the bowl beats a few big crowds.
    const perShoal = c.behaviour === 'school' ? 18 : 1;
    let shoalX = 0;
    let shoalZ = 0;
    let shoalY = 0;

    for (let i = 0; i < c.count; i += 1) {
      if (i % perShoal === 0) {
        // Find a home at a depth this species actually lives at. Bounded tries,
        // then give up — a species whose band the terrain does not provide
        // simply gets fewer animals rather than hanging the dive.
        let placed = false;
        for (let tries = 0; tries < 24 && !placed; tries += 1) {
          const a = rng() * TAU;
          const r = Math.sqrt(rng()) * DOMAIN_RADIUS_M;
          const x = Math.cos(a) * r;
          const z = Math.sin(a) * r;
          const floor = -oceanFloorM(x, z);
          // Live between the species' band and the seabed under this spot.
          const lo = c.depth.from;
          const hi = Math.min(c.depth.to, floor - 2);
          if (hi <= lo) continue;
          shoalX = x;
          shoalZ = z;
          shoalY = -(lo + rng() * (hi - lo));
          // Bottom-dwellers hug the floor instead of hovering in the band.
          if (c.behaviour === 'lurk') shoalY = -floor + 1 + rng() * 1.5;
          placed = true;
        }
        if (!placed) continue;
      }

      // Tighter shoal: a loose scatter of 18 reads as litter, a tight ball
      // reads as one animal made of many, which is the thing worth seeing.
      const spread = c.behaviour === 'school' ? 6 : 0;
      animals.push({
        hx: shoalX + (rng() - 0.5) * spread,
        hy: shoalY + (rng() - 0.5) * (spread * 0.4),
        hz: shoalZ + (rng() - 0.5) * spread,
        x: shoalX,
        y: shoalY,
        z: shoalZ,
        phase: rng() * TAU,
        speed: (c.behaviour === 'drift' ? 0.12 : c.behaviour === 'lurk' ? 0.2 : 0.45) * (0.7 + rng() * 0.6),
        radius: c.behaviour === 'lurk' ? 2.5 : c.behaviour === 'glide' ? 26 : 11,
        scale: 0.8 + rng() * 0.5,
        yaw: rng() * TAU,
      });
    }
    mesh.count = animals.length;
    species.push({ creature: c, mesh, animals });
  }

  return {
    group,
    geometries,
    materials,

    update(dt: number, t: number, camera) {
      for (const s of species) {
        let drawn = 0;
        for (const a of s.animals) {
          // Cull by distance from home — cheap, and an animal 200m away in this
          // fog cannot be seen whether it moved or not.
          const dxh = a.hx - camera.x;
          const dzh = a.hz - camera.z;
          if (dxh * dxh + dzh * dzh > SIM_RADIUS_M * SIM_RADIUS_M) continue;

          const ang = t * a.speed + a.phase;
          const nx = a.hx + Math.cos(ang) * a.radius;
          const nz = a.hz + Math.sin(ang) * a.radius;
          const ny =
            s.creature.behaviour === 'drift'
              ? a.hy + Math.sin(t * 0.35 + a.phase) * 3.5
              : a.hy + Math.sin(ang * 0.7) * (s.creature.behaviour === 'lurk' ? 0.3 : 2.2);

          // Face the way it is travelling. Doing this from the ACTUAL delta
          // means the model always points along its path, including when the
          // path is a circle.
          a.yaw = Math.atan2(nx - a.x, nz - a.z);
          a.x = nx;
          a.y = ny;
          a.z = nz;

          dummy.position.set(a.x, a.y, a.z);
          dummy.rotation.set(0, a.yaw, 0, 'YXZ');
          dummy.scale.setScalar(a.scale);
          dummy.updateMatrix();
          s.mesh.setMatrixAt(drawn, dummy.matrix);
          drawn += 1;
        }
        s.mesh.count = drawn;
        s.mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
