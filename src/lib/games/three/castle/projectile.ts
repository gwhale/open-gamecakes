// Castle Crumble projectiles + destruction debris.
//
// A unified cannonball factory over the ammo arsenal: the gobstopper is a glossy
// grape hard-candy sphere; the cherry bomb is a heavier, big-blast candied-cherry
// sphere with a fuse + a glowing, halo'd spark. Both return the same
// { mesh, body, launchMass, dispose } shape, so the engine launches them through
// the shared launchBalloon impulse. (Neither uses Sandcastle's blue water balloon
// — Castle Crumble fires candy from a cannon, not a slingshot.)
//
// Also exports spawnDebris (flying cake-crumb chunks) and spawnDustPuff
// (powdered-sugar poof) — the crumble + muzzle-smoke juice — mirroring balloon.ts's
// SplashSystem contract so the engine reaps them like splashes.
//
// No runtime `three`/`cannon-es` import — namespaces arrive as args.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS } from '../types';
import type { Balloon, SplashSystem } from '../balloon';
import type { Weapon } from './types';

/** A launchable projectile. Same shape as Balloon so launchBalloon works on it. */
export type Projectile = Balloon;

/** Soft radial-gradient texture (bright centre → transparent edge) for additive
 *  glow halos + powdered-sugar puffs. The same cheap fake-bloom recipe the town
 *  uses (no EffectComposer). */
function makeGlowTexture(THREE: ThreeNS, color: number): THREE.CanvasTexture {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, `${hex}ff`);
  g.addColorStop(0.4, `${hex}a0`);
  g.addColorStop(1, `${hex}00`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Build the armed projectile for a weapon. `radius` is resolved by the caller
 *  (the balloon uses difficulty-scaled tuning.balloonRadius; the bomb uses its
 *  own weapon.radius). Body starts STATIC (held at the anchor while aiming). */
export function createProjectile(
  THREE: ThreeNS,
  CANNON: CannonNS,
  scene: THREE.Scene,
  world: CANNON.World,
  anchor: THREE.Vector3,
  weapon: Weapon,
  radius: number,
  material: CANNON.Material,
): Projectile {
  if (weapon.id !== 'cherryBomb') {
    // Gobstopper cannonball — a glossy grape hard-candy sphere with a single
    // wet-candy highlight dab so it reads as a boiled sweet, not a water balloon.
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    const geometry = new THREE.SphereGeometry(radius, 20, 16);
    geos.push(geometry);
    const mat = new THREE.MeshStandardMaterial({ color: weapon.color, roughness: 0.18, metalness: 0.0 });
    mats.push(mat);
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.copy(anchor);
    mesh.castShadow = true;

    const dabGeo = new THREE.SphereGeometry(radius * 0.16, 8, 6);
    geos.push(dabGeo);
    const dabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.18, roughness: 0.15 });
    mats.push(dabMat);
    const dab = new THREE.Mesh(dabGeo, dabMat);
    dab.position.set(-radius * 0.36, radius * 0.42, radius * 0.42);
    mesh.add(dab);

    scene.add(mesh);

    const body = new CANNON.Body({
      mass: weapon.mass,
      shape: new CANNON.Sphere(radius),
      position: new CANNON.Vec3(anchor.x, anchor.y, anchor.z),
      material,
    });
    // Held in the muzzle while the kid aims; launchBalloon flips it dynamic.
    body.type = CANNON.Body.STATIC;
    body.updateMassProperties();
    world.addBody(body);

    return {
      mesh,
      body,
      launchMass: weapon.mass,
      dispose(s: THREE.Scene, w: CANNON.World): void {
        s.remove(mesh);
        w.removeBody(body);
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
      },
    };
  }

  // Cherry bomb — a glossy candied-cherry sphere (matches the castle's own
  // cherry toppers) with a wet-candy highlight, a chocolate-stick fuse, and a
  // glowing, halo'd spark so the lit fuse reads as sparkle, not menace.
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  const geometry = new THREE.SphereGeometry(radius, 20, 16);
  geos.push(geometry);
  const mat = new THREE.MeshStandardMaterial({ color: weapon.color, roughness: 0.24, metalness: 0 });
  mats.push(mat);
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.copy(anchor);
  mesh.castShadow = true;

  // Wet-candy frosting highlight dab (upper-front) — one dot sells "boiled sweet."
  const dabGeo = new THREE.SphereGeometry(radius * 0.14, 8, 6);
  geos.push(dabGeo);
  const dabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.2 });
  mats.push(dabMat);
  const dab = new THREE.Mesh(dabGeo, dabMat);
  dab.position.set(-radius * 0.35, radius * 0.4, radius * 0.42);
  mesh.add(dab);

  const fuseGeo = new THREE.CylinderGeometry(0.04, 0.04, radius * 0.9, 6);
  geos.push(fuseGeo);
  const fuseMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  mats.push(fuseMat);
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.position.set(0, radius * 0.95, 0);
  mesh.add(fuse);

  const sparkGeo = new THREE.SphereGeometry(radius * 0.18, 8, 6);
  geos.push(sparkGeo);
  const sparkMat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xffa500,
    emissiveIntensity: 1.5,
    roughness: 0.4,
  });
  mats.push(sparkMat);
  const spark = new THREE.Mesh(sparkGeo, sparkMat);
  spark.position.set(0, radius * 1.4, 0);
  mesh.add(spark);

  // Additive glow halo on the spark (warm) — cheap fake-bloom.
  const haloTex = makeGlowTexture(THREE, 0xffe6a8);
  texs.push(haloTex);
  const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  mats.push(haloMat);
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(radius * 1.6);
  spark.add(halo);

  scene.add(mesh);

  const body = new CANNON.Body({
    mass: weapon.mass,
    shape: new CANNON.Sphere(radius),
    position: new CANNON.Vec3(anchor.x, anchor.y, anchor.z),
    material,
  });
  body.type = CANNON.Body.STATIC;
  body.updateMassProperties();
  world.addBody(body);

  return {
    mesh,
    body,
    launchMass: weapon.mass,
    dispose(s: THREE.Scene, w: CANNON.World): void {
      s.remove(mesh);
      w.removeBody(body);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

/** A burst of tumbling cake-crumb cubes at an impact/topple point — the crumble
 *  juice. Cubes get a random size, hold full opacity through the first half of
 *  their life, then melt away (shrink + fade). `base` tints most crumbs; with
 *  probability `accentChance` a crumb instead picks a random `accents` colour
 *  (used to sprinkle-fleck a bomb blast). */
export function spawnDebris(
  THREE: ThreeNS,
  scene: THREE.Scene,
  at: THREE.Vector3,
  count: number,
  base: number,
  accents: readonly number[] = [],
  accentChance = 0,
): SplashSystem {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  const mats: THREE.MeshStandardMaterial[] = [];
  const parts: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; baseScale: number }[] = [];
  for (let i = 0; i < count; i++) {
    const color =
      accents.length > 0 && Math.random() < accentChance
        ? accents[Math.floor(Math.random() * accents.length)]
        : base;
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, transparent: true, opacity: 1 });
    mats.push(m);
    const cube = new THREE.Mesh(geo, m);
    cube.position.copy(at);
    const baseScale = 0.55 + Math.random() * 0.85; // varied crumb sizes
    cube.scale.setScalar(baseScale);
    cube.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(cube);
    parts.push({
      mesh: cube,
      v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5 + 2, (Math.random() - 0.5) * 6),
      spin: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3),
      baseScale,
    });
  }
  scene.add(group);

  const LIFE = 0.9;
  let life = LIFE;
  const GRAVITY = 12;

  return {
    update(dt: number): boolean {
      life -= dt;
      if (life <= 0) return false;
      const frac = life / LIFE; // 1 → 0
      for (const p of parts) {
        p.v.y -= GRAVITY * dt;
        p.mesh.position.addScaledVector(p.v, dt);
        if (p.mesh.position.y < 0.08) {
          p.mesh.position.y = 0.08;
          p.v.y = 0; // settle on the ground
        }
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        // Melt away over the last 30% of life instead of popping out.
        if (frac < 0.3) p.mesh.scale.setScalar(p.baseScale * (frac / 0.3));
      }
      // Hold full opacity through the first half, then fade.
      const o = frac >= 0.5 ? 1 : frac / 0.5;
      for (const m of mats) m.opacity = o;
      return true;
    },
    dispose(s: THREE.Scene): void {
      s.remove(group);
      geo.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/** A soft powdered-sugar poof at a topple point — a low-opacity cream billboard
 *  that blooms outward and fades over ~0.5s. Normal blending (a cloud of sugar,
 *  not a glow). Shares SplashSystem so the engine reaps it with the debris. */
export function spawnDustPuff(THREE: ThreeNS, scene: THREE.Scene, at: THREE.Vector3): SplashSystem {
  const tex = makeGlowTexture(THREE, 0xfff1d6);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(at);
  sprite.scale.setScalar(0.4);
  scene.add(sprite);

  const LIFE = 0.5;
  let life = LIFE;
  return {
    update(dt: number): boolean {
      life -= dt;
      if (life <= 0) return false;
      const t = 1 - life / LIFE; // 0 → 1
      sprite.scale.setScalar(0.4 + t * 1.8); // 0.4 → 2.2
      mat.opacity = 0.5 * (1 - t);
      return true;
    },
    dispose(s: THREE.Scene): void {
      s.remove(sprite);
      tex.dispose();
      mat.dispose();
    },
  };
}
