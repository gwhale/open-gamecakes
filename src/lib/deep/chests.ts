// The treasure chests on the seabed.
//
// A builder, like kelp.ts and fauna.ts: chest-catalog.ts says WHICH and WHERE,
// this says what one looks like and how it opens. No runtime `three` import —
// the namespace arrives as an argument; the caller owns disposal.
//
// A CHEST HAS TO READ AS OPENABLE FROM A DISTANCE, because sonar only gives a
// bearing and a range. So: a hard silhouette (a box with a domed lid) in a
// colour nothing else down here uses, and a band of brass across it that catches
// the headlights. The reef is full of soft round coral and soft round fish; the
// one angular thing in frame is the thing you swim to.
//
// THE LID IS THE WHOLE REWARD. It hinges at the back and stays open forever
// once a kid has it, so a chest they have already found reads differently from
// one they have not — from across the reef, without a label, without a tick, and
// without the deep growing a marker system it deliberately does not have.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { DEEP_CHESTS, type DeepChest } from './chest-catalog';
import { oceanFloorM } from './ocean-floor';
import { cakeMat, candyMat } from '@/lib/town/three/materials';

/** Metres. Big enough to find, small enough that the sub dwarfs it. */
const W = 3.2;
const H = 2.0;
const D = 2.2;

/** How far the lid swings when open (radians). Past 90 degrees so it reads as
 *  thrown open rather than ajar. */
const LID_OPEN = 1.95;

/** Seconds for the lid to swing. Slow enough to be an event. */
const LID_TIME = 0.9;

const BODY = 0x7c4b2a;
const BRASS = 0xd9a441;

/** Metres either side used to read the seabed's slope. Wide enough to ignore
 *  the height field's finest octave, narrow enough that it is still the local
 *  ground and not the regional trend. */
const SLOPE_EPS_M = 1.4;

/** Unit normal of the seabed at a point, from the SAME height field the terrain
 *  mesh is built from -- so anything seated with this agrees with the sand it
 *  is drawn on rather than with a second opinion about where the sand is. */
function surfaceNormal(three: ThreeNS, x: number, z: number): THREE.Vector3 {
  return new three.Vector3(
    oceanFloorM(x - SLOPE_EPS_M, z) - oceanFloorM(x + SLOPE_EPS_M, z),
    2 * SLOPE_EPS_M,
    oceanFloorM(x, z - SLOPE_EPS_M) - oceanFloorM(x, z + SLOPE_EPS_M),
  ).normalize();
}

export interface ChestHandle {
  slug: string;
  /** Centre of the closed chest, world metres. Sonar and reach use this. */
  position: THREE.Vector3;
  /** Swing the lid. Idempotent — calling it on an open chest does nothing. */
  open(): void;
  /** Put the lid open instantly, for a chest found on a previous dive. */
  openInstantly(): void;
}

export interface Chests {
  group: THREE.Group;
  all: ChestHandle[];
  update(dt: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

export function createChests(THREE: ThreeNS, found: ReadonlySet<string>): Chests {
  const group = new THREE.Group();
  group.name = 'Chests';
  const UP = new THREE.Vector3(0, 1, 0);

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const push = <T extends THREE.BufferGeometry | THREE.Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) {
      geometries.push(x as THREE.BufferGeometry);
    } else {
      materials.push(x as THREE.Material);
    }
    return x;
  };

  // One geometry and one material per part, shared by every chest.
  const bodyGeo = push(new THREE.BoxGeometry(W, H * 0.62, D));
  const lidGeo = push(new THREE.BoxGeometry(W, H * 0.38, D));
  const bandGeo = push(new THREE.BoxGeometry(W * 1.04, H * 0.12, D * 1.04));
  const bodyMat = push(cakeMat(THREE, BODY));
  const brassMat = push(candyMat(THREE, BRASS));

  interface Live {
    handle: ChestHandle;
    lidPivot: THREE.Object3D;
    /** 0 shut, 1 fully open. */
    t: number;
    opening: boolean;
  }
  const live: Live[] = [];
  const all: ChestHandle[] = [];

  for (const spec of DEEP_CHESTS as readonly DeepChest[]) {
    const floor = oceanFloorM(spec.x, spec.z);
    const chest = new THREE.Group();
    chest.name = `Chest ${spec.slug}`;
    // Lie ALONG the seabed, not across it.
    //
    // The sand under these ten runs from flat to about fifty degrees, and a box
    // that only ever spins about world Y drives one corner nearly two metres
    // into the slope on the steep ones while another hangs in the water. That
    // was measured on the shipped catalog, where eight of the ten were visibly
    // wrong and nothing failed -- the chest's own y was right, so every check
    // that looked at its POSITION agreed, and only its corners disagreed.
    const normal = surfaceNormal(THREE, spec.x, spec.z);
    chest.quaternion.setFromUnitVectors(UP, normal);
    // Spin about the seabed's normal rather than world Y, or the turn undoes
    // the tilt. Derived from the position, so it is stable across dives, and
    // it is what stops ten chests reading as ten copies of one object.
    chest.rotateY((spec.x * 0.37 + spec.z * 0.11) % Math.PI);
    // Half the body's height ALONG that normal: the bottom face lands on the
    // seabed's tangent plane, so all four corners meet the sand together.
    chest.position.set(spec.x, floor, spec.z).addScaledVector(normal, (H * 0.62) / 2);

    chest.add(new THREE.Mesh(bodyGeo, bodyMat));
    const band = new THREE.Mesh(bandGeo, brassMat);
    band.position.y = 0;
    chest.add(band);

    // The lid hangs off a pivot at the BACK TOP edge, so it swings on a hinge
    // instead of rotating about its own middle and sinking through the body.
    const lidPivot = new THREE.Object3D();
    lidPivot.position.set(0, (H * 0.62) / 2, -D / 2);
    const lid = new THREE.Mesh(lidGeo, bodyMat);
    lid.position.set(0, (H * 0.38) / 2, D / 2);
    lidPivot.add(lid);
    chest.add(lidPivot);

    group.add(chest);

    const handle: ChestHandle = {
      slug: spec.slug,
      position: chest.position.clone(),
      open() {
        const l = live.find((x) => x.handle === handle);
        if (l && !l.opening && l.t === 0) l.opening = true;
      },
      openInstantly() {
        const l = live.find((x) => x.handle === handle);
        if (l) {
          l.t = 1;
          l.opening = false;
          l.lidPivot.rotation.x = -LID_OPEN;
        }
      },
    };
    all.push(handle);
    live.push({ handle, lidPivot, t: 0, opening: false });

    // A chest opened on an earlier dive is already open when the kid arrives.
    // The ocean remembering what you found is the point of kid_deep_state.
    if (found.has(spec.slug)) handle.openInstantly();
  }

  return {
    group,
    all,
    geometries,
    materials,
    update(dt: number) {
      for (const l of live) {
        if (!l.opening) continue;
        l.t = Math.min(1, l.t + dt / LID_TIME);
        // Ease out, so the lid arrives rather than stopping.
        const e = 1 - (1 - l.t) * (1 - l.t);
        l.lidPivot.rotation.x = -LID_OPEN * e;
        if (l.t >= 1) l.opening = false;
      }
    },
  };
}
