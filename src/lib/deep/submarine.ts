// Sub-Cake One — the exploration submarine.
//
// Written for this repo, not ported: nothing in ABYSSAL is driven by a player.
// Built in the town's edible-diorama idiom out of the SAME material recipes the
// island uses (materials.ts / palette.ts), so the sub reads as belonging to
// Gamecakes rather than as realistic hardware that wandered in from a different
// game. A vanilla sponge hull, a boiled-sweet canopy, a piped frosting stripe,
// and a cherry on top.
//
// MOVEMENT IS DELIBERATELY NOT A SIMULATOR. Every constant lives in SUB
// (types.ts) and every one of them was chosen for "a kid understands this in
// sixty seconds", which is this branch's actual success metric. Thrust eases
// toward the commanded value (floaty), turning is rate-based and instant
// (predictable), and the nose pitches for LOOKS only — the sub always travels
// along the heading the kid is steering, never where its nose happens to point.
// Coupling those two is what makes a vehicle feel like something you fight.
//
// No runtime `three` import; the caller owns disposal of the returned arrays.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { SUB, DEPTH_LIMIT_M, REEF_SPAWN, type DeepSpawn } from './types';
import { clamp } from './world-math';
import { constrainToOcean } from './ocean-floor';
import {
  cakeMat,
  frostingMat,
  candyMat,
  candyGlassMat,
  glowSprite,
} from '@/lib/town/three/materials';
import { CAKE, RIBBON } from '@/lib/games/theme/palette';

/** What the host's controls produce. All normalised, so the keyboard and the
 *  thumb pad are genuinely the same input — the engine never sees either. */
export interface SubInput {
  /** -1 (reverse) .. 1 (full ahead). */
  throttle: number;
  /** -1 (left) .. 1 (right). */
  steer: number;
  /** -1 (dive) .. 1 (rise). */
  climb: number;
  boost: boolean;
}

export interface Submarine {
  group: THREE.Group;
  /** Live world position (metres). Read by the camera, sonar and HUD. */
  position: THREE.Vector3;
  /** Yaw in radians. */
  heading: number;
  /** Signed speed along the heading (m/s). */
  speed: number;
  /** Depth in metres, positive — the number the HUD and biome both want. */
  depth(): number;
  /** True while the hull is pressed against its depth limit. The host renders
   *  DEPTH LIMIT REACHED off this. */
  atLimit(): boolean;
  update(dt: number, input: SubInput): void;
  /** Dim or raise the headlights as the water darkens (see biome.ts). */
  setLampIntensity(v: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
}

export function createSubmarine(THREE: ThreeNS, spawn: DeepSpawn = REEF_SPAWN): Submarine {
  const group = new THREE.Group();
  group.name = 'Sub-Cake One';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  /** Track everything we make so the engine disposes it in one pass. */
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh => {
    geometries.push(geo);
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    return mesh;
  };

  // ---- Hull: a sponge lozenge, nose along -z (the direction of travel). ----
  const hullGeo = new THREE.CapsuleGeometry(1.5, 3.4, 6, 16);
  hullGeo.rotateX(Math.PI / 2); // capsules are Y-long by default; lay it down
  const hull = add(hullGeo, cakeMat(THREE, CAKE.VANILLA_DEEP));
  hull.name = 'Hull';

  // ---- Piped frosting stripe around the waist. Purely to read as cake. ----
  // NO rotation: a torus already rings the Z axis, and the hull is Z-long. It
  // was rotated into the XZ plane at first, which sliced it lengthwise through
  // the hull where nothing could see it.
  const stripe = add(
    new THREE.TorusGeometry(1.56, 0.17, 8, 24),
    frostingMat(THREE, CAKE.FROSTING),
  );
  stripe.name = 'Frosting stripe';

  // ---- Canopy: a boiled-sweet bubble the kid is notionally sitting in. ----
  const canopy = add(
    new THREE.SphereGeometry(1.05, 16, 12),
    candyGlassMat(THREE, 0x7dd3fc, 0.42),
  );
  canopy.position.set(0, 0.92, -1.85);
  canopy.name = 'Canopy';

  // ---- Conning tower + a cherry, because it is a Gamecakes vehicle. ----
  const tower = add(
    new THREE.CylinderGeometry(0.42, 0.55, 0.9, 12),
    cakeMat(THREE, CAKE.STRAWBERRY),
  );
  tower.position.set(0, 1.62, 0.5);
  tower.name = 'Conning tower';

  const cherry = add(
    new THREE.SphereGeometry(0.34, 12, 10),
    candyMat(THREE, CAKE.STRAWBERRY_DEEP),
  );
  cherry.position.set(0, 2.28, 0.5);
  cherry.name = 'Cherry';

  // ---- Tail fins + propeller. ----
  // These MUST clear the hull. A CapsuleGeometry(1.5, 3.4) laid along Z spans
  // z = -3.2 .. +3.2, so the first pass (fins at 2.3, prop at 2.85) buried them
  // both inside the sponge and the sub rendered as a featureless egg. Nothing
  // errored and nothing could have: it looked exactly like working code.
  const TAIL_Z = 3.25;
  for (let i = 0; i < 3; i++) {
    const fin = add(new THREE.BoxGeometry(0.16, 1.5, 1.1), candyMat(THREE, RIBBON.MINT));
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.sin(a) * 0.8, Math.cos(a) * 0.8, TAIL_Z);
    fin.rotation.z = -a;
    fin.name = 'Fin ' + i;
  }

  // ---- Propeller. IT MUST HAVE BLADES. ----
  // This was a bare TorusGeometry spun about Z — which is the torus's own axis
  // of symmetry, so the shape is identical at every angle and the rotation was
  // mathematically real and visually nonexistent. A play-tester filed a ticket
  // asking for the propeller to spin "when I'm going"; it always had been,
  // invisibly.
  //
  // A ring plus three blades. The blades are what carry the motion; the ring is
  // just the shroud that made it read as a propeller in the first place.
  const prop = new THREE.Group();
  prop.name = 'Propeller';
  prop.position.set(0, 0, TAIL_Z + 0.85);
  group.add(prop);

  const shroudGeo = new THREE.TorusGeometry(0.62, 0.1, 6, 16);
  const propMat = candyMat(THREE, CAKE.AMBER);
  geometries.push(shroudGeo);
  materials.push(propMat);
  prop.add(new THREE.Mesh(shroudGeo, propMat));

  const hubGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 8);
  hubGeo.rotateX(Math.PI / 2);
  geometries.push(hubGeo);
  prop.add(new THREE.Mesh(hubGeo, propMat));

  const bladeGeo = new THREE.BoxGeometry(0.46, 0.1, 0.16);
  const bladeMat = frostingMat(THREE, CAKE.VANILLA);
  geometries.push(bladeGeo);
  materials.push(bladeMat);
  for (let i = 0; i < 3; i += 1) {
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    const a = (i / 3) * Math.PI * 2;
    blade.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0);
    // Rotate into place, then pitch the blade so it catches the light
    // differently as it comes round — that shimmer IS the sense of spinning.
    blade.rotation.set(0, 0, a);
    blade.rotateX(0.5);
    prop.add(blade);
  }

  // ---- Headlights. Two spots, plus halo sprites so the lamps read as LIT even
  //      when the beam has nothing in front of it to land on — the cheap-bloom
  //      trick the town uses instead of a post-processing chain. ----
  const lamps: THREE.SpotLight[] = [];
  for (const side of [-1, 1]) {
    const lamp = new THREE.SpotLight(0xfff3d0, 0, 150, Math.PI / 6, 0.45, 1.1);
    lamp.position.set(side * 0.78, 0.05, -3.05);
    // A spotlight aims at its target's WORLD position, so the target has to be
    // in the graph and out ahead, or the beam points back at the origin.
    lamp.target.position.set(side * 0.7, -0.4, -40);
    group.add(lamp);
    group.add(lamp.target);
    lamps.push(lamp);

    const halo = glowSprite(THREE, 0xfff3d0, 1.6, 0.55);
    halo.sprite.position.set(side * 0.78, 0.05, -3.15);
    group.add(halo.sprite);
    textures.push(halo.tex);
    materials.push(halo.mat);
  }

  // ---- State ----
  // The pose comes from the host: either REEF_SPAWN, or where this kid left
  // off if they were here in the last half hour (see RESUME_WINDOW_MS).
  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  let heading = spawn.heading;
  let speed = 0;
  let pitch = 0;
  let roll = 0;
  let limited = false;

  const submarine: Submarine = {
    group,
    position,
    get heading() {
      return heading;
    },
    set heading(v: number) {
      heading = v;
    },
    get speed() {
      return speed;
    },
    set speed(v: number) {
      speed = v;
    },
    depth: () => -position.y,
    atLimit: () => limited,
    geometries,
    materials,
    textures,

    setLampIntensity(v: number) {
      for (const lamp of lamps) lamp.intensity = v * 220;
    },

    update(dt: number, input: SubInput) {
      // Clamp dt: a backgrounded tab resumes with a huge delta, and without
      // this the sub teleports through the seabed on the first frame back.
      const d = Math.min(dt, 0.05);

      // Steering is rate-based and immediate. No steering inertia — a kid who
      // presses left and does not immediately go left concludes it is broken.
      heading -= input.steer * SUB.TURN_RATE * d;

      // Thrust eases toward the commanded speed. This is the floatiness, and
      // it is the ONLY place inertia is allowed to exist.
      const wanted = input.throttle * SUB.CRUISE_MS * (input.boost ? SUB.BOOST : 1);
      speed += (wanted - speed) * Math.min(1, SUB.ACCEL_LERP * d);
      if (Math.abs(input.throttle) < 0.01) speed -= speed * Math.min(1, SUB.DRAG * d);

      position.x -= Math.sin(heading) * speed * d;
      position.z -= Math.cos(heading) * speed * d;
      position.y += input.climb * SUB.CLIMB_MS * d;

      // The hull's depth limit. Enforced HERE, not in constrainToOcean, because
      // it is a property of this submarine and not of the ocean — the canyon
      // floor is 110m below it, and the PRD's upgrade list already imagines a
      // sub that may go further. The world stays the same; the boat improves.
      //
      // `limited` is sticky within a metre of the wall so the message does not
      // strobe while a kid holds dive against it.
      if (position.y < -DEPTH_LIMIT_M) position.y = -DEPTH_LIMIT_M;
      limited = -position.y >= DEPTH_LIMIT_M - 1;

      constrainToOcean(position, 3);

      // Cosmetic attitude. The nose dips when diving and the hull banks into a
      // turn; neither affects where the sub actually goes.
      const wantPitch = clamp(-input.climb * SUB.MAX_PITCH, -SUB.MAX_PITCH, SUB.MAX_PITCH);
      const wantRoll = clamp(input.steer * 0.42, -0.42, 0.42);
      pitch += (wantPitch - pitch) * Math.min(1, 4 * d);
      roll += (wantRoll - roll) * Math.min(1, 4 * d);

      group.position.copy(position);
      group.rotation.set(pitch, heading, roll, 'YXZ');
      // Tied to SPEED, with only a slow idle turn. The ticket asked for it to
      // spin "when I'm going", and a propeller that windmills at the same rate
      // while parked tells the kid nothing about whether they are moving.
      prop.rotation.z += (Math.abs(speed) * 1.6 + 0.35) * d * Math.PI;
    },
  };

  submarine.update(0, { throttle: 0, steer: 0, climb: 0, boost: false });
  return submarine;
}
