// Sonar — the exploration mechanic, and the reason the ocean stays interesting.
//
// The whole design rests on one rule from the PRD: NO MAP, NO ICONS. A pulse
// tells you a bearing and a range, the mark fades after a few seconds, and then
// you are on your own again. The moment a contact gets a permanent marker the
// ocean becomes a checklist and stops being a place — so `SONAR_MARK_S`
// expiring is a feature, not a convenience, and nothing here is allowed to
// remember a contact between pulses.
//
// Written for this repo. ABYSSAL has no sonar; its observation system
// (WildlifeWatch) is a documentary camera, which is the opposite of this.
//
// No runtime `three` import; caller owns disposal.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { SONAR_RANGE_M, SONAR_SWEEP_S, SONAR_COOLDOWN_S, SONAR_MARK_S } from './types';

/** Anything sonar can find. The engine supplies these; sonar never owns them. */
export interface SonarContact {
  id: string;
  /** What the return calls it. Vague on purpose — 'unknown object' is more
   *  interesting than 'Sunken Whisk', and the kid has to go and look. */
  echo: string;
  position: THREE.Vector3;
  /** Called when a pulse reaches this contact — the prop lights itself up. */
  onPing?(): void;
}

/** One line of sonar return, handed to the host to render. */
export interface SonarReturn {
  id: string;
  echo: string;
  /** Metres, rounded — a kid navigates on "74m", not 74.318. */
  range: number;
  /** Where to steer, relative to the sub's nose: 'straight ahead',
   *  'ahead, a bit to your left', 'right behind you'. */
  bearing: string;
}

export interface Sonar {
  group: THREE.Group;
  /** True while the pulse is out or the cooldown is running. */
  busy(): boolean;
  /** Fire. Returns false if still on cooldown (host can buzz the button). */
  fire(origin: THREE.Vector3, heading: number, contacts: readonly SonarContact[]): boolean;
  update(dt: number): void;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Which way to steer to reach a contact, RELATIVE TO WHERE THE SUB IS POINTING.
 *
 * This used to return compass words — "163m southeast". A six-year-old dived it
 * and filed a ticket saying "I don't quite understand like Northwest southeast
 * at all", which is the correct review: the game shows no compass, a six-year-old
 * has no reason to hold one in their head, and an instruction you cannot act on
 * is worse than no instruction because it looks like help.
 *
 * "Ahead and to your left" needs nothing held in the head at all. Turn left.
 *
 * The maths: forward is (-sin h, -cos h), matching the submarine's own motion
 * integration, and right is forward x up = (-fz, fx). The signed angle between
 * forward and the target gives both how far round it is and which way to turn.
 */
export function bearingPhrase(
  from: { x: number; z: number },
  to: { x: number; z: number },
  heading: number,
): string {
  const tx = to.x - from.x;
  const tz = to.z - from.z;
  const len = Math.hypot(tx, tz);
  if (len < 1e-6) return 'right here';

  const fx = -Math.sin(heading);
  const fz = -Math.cos(heading);
  const ahead = (tx * fx + tz * fz) / len;
  // Right-hand component: positive means the contact is off the starboard side.
  const right = (tx * -fz + tz * fx) / len;

  const deg = (Math.atan2(right, ahead) * 180) / Math.PI;
  const side = deg >= 0 ? 'right' : 'left';
  const a = Math.abs(deg);

  if (a < 25) return 'straight ahead';
  if (a < 70) return `ahead, a bit to your ${side}`;
  if (a < 115) return `to your ${side}`;
  if (a < 155) return `behind you, to your ${side}`;
  return 'right behind you';
}

export function createSonar(
  THREE: ThreeNS,
  onReturns: (returns: SonarReturn[]) => void,
): Sonar {
  const group = new THREE.Group();
  group.name = 'Sonar';

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // The visible pulse: a flat ring that grows outward. Drawn double-sided with
  // depth-write off so it washes over terrain instead of clipping into it —
  // it is a signal, not an object, and should read as passing THROUGH the world.
  const ringGeo = new THREE.RingGeometry(0.94, 1, 96);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x86efac,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.frustumCulled = false;
  ring.visible = false;
  group.add(ring);
  geometries.push(ringGeo);
  materials.push(ringMat);

  /** Seconds since the pulse was fired; null when idle. */
  let sweep: number | null = null;
  let cooldown = 0;
  /** Contacts this pulse has not yet reached, with their ranges precomputed. */
  let pending: Array<{ contact: SonarContact; range: number }> = [];
  /** Returns accumulated this pulse, flushed to the host as the ring passes. */
  let found: SonarReturn[] = [];
  let origin = new THREE.Vector3();
  /** Heading at the moment the pulse went out. The phrases are relative to the
   *  nose, and they must stay relative to where it pointed WHEN YOU PINGED —
   *  recomputing as the kid turns would make the answer slide around while
   *  they are trying to follow it. */
  let firedHeading = 0;

  return {
    group,
    geometries,
    materials,

    busy: () => sweep !== null || cooldown > 0,

    fire(from: THREE.Vector3, heading: number, contacts: readonly SonarContact[]): boolean {
      if (sweep !== null || cooldown > 0) return false;
      origin = from.clone();
      firedHeading = heading;
      sweep = 0;
      found = [];
      pending = contacts
        .map((contact) => ({ contact, range: contact.position.distanceTo(origin) }))
        .filter((c) => c.range <= SONAR_RANGE_M)
        .sort((a, b) => a.range - b.range);

      ring.position.copy(origin);
      ring.visible = true;
      return true;
    },

    update(dt: number) {
      if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
      if (sweep === null) return;

      sweep += dt;
      const t = Math.min(1, sweep / SONAR_SWEEP_S);
      const radius = t * SONAR_RANGE_M;

      ring.scale.setScalar(Math.max(0.001, radius));
      // Fade as it goes: brightest at the sub, gone at maximum range. The ring
      // is also how a kid learns how far sonar reaches, without being told.
      ringMat.opacity = 0.55 * (1 - t) ** 0.6;

      // Anything the expanding front has now passed becomes a return.
      while (pending.length > 0 && pending[0].range <= radius) {
        const { contact, range } = pending.shift()!;
        contact.onPing?.();
        found.push({
          id: contact.id,
          echo: contact.echo,
          range: Math.round(range),
          bearing: bearingPhrase(origin, contact.position, firedHeading),
        });
        // Report as the front reaches each one, so a close contact answers
        // immediately and a distant one arrives late — the delay is the range,
        // felt rather than read.
        onReturns([...found]);
      }

      if (t >= 1) {
        sweep = null;
        ring.visible = false;
        ringMat.opacity = 0;
        cooldown = SONAR_COOLDOWN_S;
        if (found.length === 0) onReturns([]);
      }
    },
  };
}

/** How long a pinged prop stays lit. Re-exported so landmarks.ts and the host
 *  cannot disagree about it. */
export const MARK_SECONDS = SONAR_MARK_S;
