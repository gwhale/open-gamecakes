// Water balloon: mesh + body, launch impulse, and splash particles.
//
// While "armed" the body is STATIC (held at the slingshot anchor so the kid
// can aim). launchBalloon flips it to DYNAMIC and applies an instantaneous
// impulse. On impact the host removes it and spawns a splash.
//
// No runtime `three`/`cannon-es` import — namespaces arrive as args.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS } from './types';

export interface Balloon {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  /** Mass used once launched (stored because the body is created STATIC). */
  launchMass: number;
  dispose(scene: THREE.Scene, world: CANNON.World): void;
}

/** A short-lived particle puff. `update` returns false once it has finished
 *  so the engine can reap it. */
export interface SplashSystem {
  update(dt: number): boolean;
  dispose(scene: THREE.Scene): void;
}

const BALLOON_MASS = 0.6;

export function createBalloon(
  THREE: ThreeNS,
  CANNON: CannonNS,
  scene: THREE.Scene,
  world: CANNON.World,
  anchor: THREE.Vector3,
  radius: number,
  material: CANNON.Material,
): Balloon {
  const geometry = new THREE.SphereGeometry(radius, 20, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x49c5ff,
    roughness: 0.25,
    metalness: 0.0,
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.copy(anchor);
  mesh.castShadow = true;
  scene.add(mesh);

  const body = new CANNON.Body({
    mass: BALLOON_MASS,
    shape: new CANNON.Sphere(radius),
    position: new CANNON.Vec3(anchor.x, anchor.y, anchor.z),
    material,
  });
  // Held in place while the kid aims; launchBalloon makes it dynamic.
  body.type = CANNON.Body.STATIC;
  body.updateMassProperties();
  world.addBody(body);

  return {
    mesh,
    body,
    launchMass: BALLOON_MASS,
    dispose(s: THREE.Scene, w: CANNON.World): void {
      s.remove(mesh);
      w.removeBody(body);
      geometry.dispose();
      mat.dispose();
    },
  };
}

/** Apply the launch. `dir` must be normalized; `power` is the impulse scale. */
export function launchBalloon(
  CANNON: CannonNS,
  balloon: Balloon,
  dir: THREE.Vector3,
  power: number,
): void {
  balloon.body.type = CANNON.Body.DYNAMIC;
  balloon.body.mass = balloon.launchMass;
  balloon.body.updateMassProperties();
  balloon.body.wakeUp();
  const impulse = new CANNON.Vec3(dir.x, dir.y, dir.z);
  impulse.scale(power * balloon.launchMass, impulse);
  balloon.body.applyImpulse(impulse);
}

/** Burst of fading droplets at the impact point. */
export function spawnSplash(
  THREE: ThreeNS,
  scene: THREE.Scene,
  at: THREE.Vector3,
): SplashSystem {
  const COUNT = 18;
  const positions = new Float32Array(COUNT * 3);
  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = at.x;
    positions[i * 3 + 1] = at.y;
    positions[i * 3 + 2] = at.z;
    velocities.push(
      new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        Math.random() * 4 + 1,
        (Math.random() - 0.5) * 4,
      ),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x9bdcff,
    size: 0.18,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  let life = 0.6; // seconds
  const GRAVITY = 9;

  return {
    update(dt: number): boolean {
      life -= dt;
      if (life <= 0) return false;
      const attr = geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < COUNT; i++) {
        const v = velocities[i];
        v.y -= GRAVITY * dt;
        attr.setXYZ(
          i,
          attr.getX(i) + v.x * dt,
          attr.getY(i) + v.y * dt,
          attr.getZ(i) + v.z * dt,
        );
      }
      attr.needsUpdate = true;
      material.opacity = Math.max(0, life / 0.6) * 0.95;
      return true;
    },
    dispose(s: THREE.Scene): void {
      s.remove(points);
      geometry.dispose();
      material.dispose();
    },
  };
}
