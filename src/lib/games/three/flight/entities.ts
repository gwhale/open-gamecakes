// Mesh factories for Cakey's Frosting Fighter.
//
// Each builder takes the live `three` namespace + the engine's `track` helper
// (so every geometry/material is registered for exhaustive dispose()) and
// returns a ready-to-add object. Keeping these out of engine.ts keeps the
// engine focused on the loop/input/state machine. Bundle hygiene: type-only
// `three` import, fully erased (see ./types).

import type { ThreeNS, PowerupKind } from './types';

type ThreeGroup = import('three').Group;
type ThreeMesh = import('three').Mesh;
type BufferGeometry = import('three').BufferGeometry;
type Material = import('three').Material;

/** Registers a geometry/material with the engine so dispose() is exhaustive. */
export type Track = <T extends BufferGeometry | Material>(x: T) => T;

// Candy palette (layers on top of the cake brand — strawberry/vanilla read
// through so the city still looks like Gamecakes).
const STRAWBERRY = 0xfb7185;
const CHERRY = 0xe11d48;
const VANILLA = 0xfff1d6;
const MINT = 0x6ee7b7;
const FROSTING = 0xffc2e8;

/** Bright gummy tints, cycled per fighter so a swarm reads as varied. */
export const GUMMY_COLORS = [0xfb7185, 0xfbbf24, 0x60a5fa, 0xa855f7, 0x34d399, 0xf472b6];

/** Cake-tower body + frosting-roof palettes, picked per building. */
export const BUILDING_PALETTES: ReadonlyArray<{ body: number; roof: number }> = [
  { body: 0xf9a8c4, roof: 0xfff1f6 }, // strawberry tower, white frosting
  { body: 0xfde68a, roof: 0xfff7d6 }, // vanilla tower
  { body: 0x9be7c4, roof: 0xe7fff4 }, // mint tower
  { body: 0xc4a484, roof: 0xf3e2c7 }, // chocolate tower
  { body: 0xc9b3f0, roof: 0xf0e6ff }, // lilac tower
];

/**
 * The hero: a cupcake-rocket Cakey pilots. Built facing −Z (into the screen),
 * so the cherry nose leads and the engine glow trails at +Z.
 */
export function buildShip(THREE: ThreeNS, track: Track): ThreeGroup {
  const ship = new THREE.Group();

  // --- the little airplane the cupcake rides (small + sleek) ---
  const fuseGeo = track(new THREE.CapsuleGeometry(0.22, 0.9, 6, 12));
  const fuseMat = track(new THREE.MeshStandardMaterial({ color: VANILLA, roughness: 0.6 }));
  const fuse = new THREE.Mesh(fuseGeo, fuseMat);
  fuse.rotation.x = Math.PI / 2; // lay the capsule along Z (nose −Z)
  ship.add(fuse);

  // Wings (strawberry) + mint tips.
  const wingGeo = track(new THREE.BoxGeometry(1.3, 0.07, 0.4));
  const wingMat = track(new THREE.MeshStandardMaterial({ color: STRAWBERRY, roughness: 0.5 }));
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.position.set(0, -0.04, 0.05);
  ship.add(wings);
  const tipGeo = track(new THREE.BoxGeometry(0.16, 0.08, 0.34));
  const tipMat = track(new THREE.MeshStandardMaterial({ color: MINT, roughness: 0.5 }));
  for (const sx of [-0.66, 0.66]) {
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.set(sx, -0.02, 0.05);
    ship.add(tip);
  }

  // Tail — vertical fin + horizontal stabilizer at the back (+Z).
  const finGeo = track(new THREE.BoxGeometry(0.06, 0.3, 0.26));
  ship.add(positioned(new THREE.Mesh(finGeo, wingMat), 0, 0.18, 0.5));
  const stabGeo = track(new THREE.BoxGeometry(0.5, 0.06, 0.2));
  ship.add(positioned(new THREE.Mesh(stabGeo, wingMat), 0, 0.02, 0.52));

  // Spinning propeller at the nose (−Z). Grouped + named so the engine spins it.
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(0, 0.02, -0.66);
  const hubGeo = track(new THREE.SphereGeometry(0.08, 8, 6));
  const hubMat = track(new THREE.MeshStandardMaterial({ color: CHERRY, roughness: 0.4 }));
  prop.add(new THREE.Mesh(hubGeo, hubMat));
  const bladeGeo = track(new THREE.BoxGeometry(0.06, 0.62, 0.02));
  const bladeMat = track(new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.6 }));
  prop.add(new THREE.Mesh(bladeGeo, bladeMat));
  const bladeB = new THREE.Mesh(bladeGeo, bladeMat);
  bladeB.rotation.z = Math.PI / 2;
  prop.add(bladeB);
  ship.add(prop);

  // --- the cupcake cockpit on top ---
  const linerGeo = track(new THREE.CylinderGeometry(0.24, 0.16, 0.3, 14));
  const linerMat = track(new THREE.MeshStandardMaterial({ color: VANILLA, roughness: 0.7 }));
  ship.add(positioned(new THREE.Mesh(linerGeo, linerMat), 0, 0.3, 0.02));
  const frostGeo = track(new THREE.ConeGeometry(0.26, 0.36, 14));
  const frostMat = track(new THREE.MeshStandardMaterial({ color: FROSTING, roughness: 0.5 }));
  ship.add(positioned(new THREE.Mesh(frostGeo, frostMat), 0, 0.62, 0.02));
  const cherryGeo = track(new THREE.SphereGeometry(0.08, 10, 8));
  const cherryMat = track(new THREE.MeshStandardMaterial({ color: CHERRY, roughness: 0.4 }));
  ship.add(positioned(new THREE.Mesh(cherryGeo, cherryMat), 0, 0.84, 0.02));

  // Engine glow at the tail (+Z), named so the engine flickers it.
  const glowGeo = track(new THREE.SphereGeometry(0.18, 10, 8));
  const glowMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb020, emissiveIntensity: 1.4, roughness: 0.4 }),
  );
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.set(0, 0, 0.66);
  glow.scale.set(0.8, 0.8, 1.2);
  glow.name = 'thrust';
  ship.add(glow);

  return ship;
}

/** Tiny helper: set a mesh's position inline and return it (keeps buildShip terse). */
function positioned(m: ThreeMesh, x: number, y: number, z: number): ThreeMesh {
  m.position.set(x, y, z);
  return m;
}

/** A gummy-bear fighter. Returns the body Mesh; ears + face ride as children. */
export function buildGummy(THREE: ThreeNS, track: Track, color: number): ThreeMesh {
  const bodyGeo = track(new THREE.SphereGeometry(0.55, 14, 12));
  const bodyMat = track(
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, transparent: true, opacity: 0.92 }),
  );
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.9, 1.1, 0.85);

  const earGeo = track(new THREE.SphereGeometry(0.2, 10, 8));
  for (const sx of [-0.32, 0.32]) {
    const ear = new THREE.Mesh(earGeo, bodyMat);
    ear.position.set(sx, 0.5, -0.05);
    body.add(ear);
  }
  const snoutGeo = track(new THREE.SphereGeometry(0.22, 10, 8));
  const snout = new THREE.Mesh(snoutGeo, bodyMat);
  snout.position.set(0, -0.08, -0.42);
  snout.scale.set(1, 0.8, 1);
  body.add(snout);

  const eyeGeo = track(new THREE.SphereGeometry(0.07, 8, 6));
  const eyeMat = track(new THREE.MeshStandardMaterial({ color: 0x2a1626, roughness: 0.4 }));
  for (const sx of [-0.18, 0.18]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx, 0.12, -0.46);
    body.add(eye);
  }

  return body;
}

/** A glowing laser bolt — a thin emissive cylinder oriented along its travel. */
export function buildLaserBolt(THREE: ThreeNS, track: Track): ThreeMesh {
  const geo = track(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 8));
  const mat = track(
    new THREE.MeshStandardMaterial({ color: 0xfff0a0, emissive: 0xffd23f, emissiveIntensity: 1.8, roughness: 0.3 }),
  );
  return new THREE.Mesh(geo, mat);
}

/**
 * A frosting-tower building. Built with its base at the group origin (y=0) so
 * the engine just sets group.position = (x, GROUND_Y, z); the top is at
 * GROUND_Y + h. Returns the Group; collision is pure math in the engine.
 */
export function buildBuilding(
  THREE: ThreeNS,
  track: Track,
  opts: { w: number; d: number; h: number; body: number; roof: number },
): ThreeGroup {
  const g = new THREE.Group();

  const bodyGeo = track(new THREE.BoxGeometry(opts.w, opts.h, opts.d));
  const bodyMat = track(new THREE.MeshStandardMaterial({ color: opts.body, roughness: 0.85 }));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = opts.h / 2;
  g.add(body);

  // Frosting roof — a slightly wider, glossier slab dripping over the edge.
  const roofGeo = track(new THREE.BoxGeometry(opts.w * 1.1, 0.5, opts.d * 1.1));
  const roofMat = track(new THREE.MeshStandardMaterial({ color: opts.roof, roughness: 0.45 }));
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = opts.h + 0.18;
  g.add(roof);

  // A few lit windows on the camera-facing (+Z) wall so the city glows.
  const winGeo = track(new THREE.PlaneGeometry(0.34, 0.46));
  const winMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfff3b0, emissive: 0xffd24a, emissiveIntensity: 0.7 }),
  );
  const rows = Math.min(3, Math.max(1, Math.floor(opts.h / 2.2)));
  const cols = Math.min(2, Math.max(1, Math.floor(opts.w / 1.4)));
  const zFace = opts.d / 2 + 0.01;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const win = new THREE.Mesh(winGeo, winMat);
      const wx = (c - (cols - 1) / 2) * (opts.w / (cols + 1));
      const wy = 0.9 + r * (opts.h - 1.2) / Math.max(1, rows);
      win.position.set(wx, wy, zFace);
      g.add(win);
    }
  }

  return g;
}

/** A faint aim reticle that hovers ahead of the ship so kids see the shot lane. */
export function buildReticle(THREE: ThreeNS, track: Track): ThreeMesh {
  const geo = track(new THREE.TorusGeometry(0.5, 0.06, 8, 22));
  const mat = track(new THREE.MeshBasicMaterial({ color: 0xff5d8f, transparent: true, opacity: 0.65 }));
  return new THREE.Mesh(geo, mat);
}

/**
 * A power-up drop inside a halo ring. Fly through it to trigger its effect.
 * children[0] is the tumbling core (the engine spins it), so every kind keeps
 * that contract. Color-coded so kids learn the drops at a glance:
 *   blaster → gold gem / pink ring   (upgrade the bolt)
 *   speed   → cyan gem / cyan ring    (power-dash)
 *   bomb    → strawberry bomb / red ring (clear the near city)
 */
export function buildPowerup(THREE: ThreeNS, track: Track, kind: PowerupKind = 'blaster'): ThreeGroup {
  const g = new THREE.Group();
  let ringColor: number;

  if (kind === 'bomb') {
    // A frosting bomb: a strawberry sphere with a piped-frosting cap.
    const bombGeo = track(new THREE.SphereGeometry(0.44, 14, 12));
    const bombMat = track(
      new THREE.MeshStandardMaterial({ color: 0xe11d48, emissive: 0x7f1d1d, emissiveIntensity: 0.55, roughness: 0.4 }),
    );
    g.add(new THREE.Mesh(bombGeo, bombMat)); // children[0] — the core
    const capGeo = track(new THREE.ConeGeometry(0.3, 0.32, 12));
    const capMat = track(new THREE.MeshStandardMaterial({ color: FROSTING, roughness: 0.45 }));
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 0.42;
    g.add(cap);
    ringColor = 0xfb7185;
  } else {
    // A glowing candy gem — gold for blaster, cyan for speed.
    const emissive = kind === 'speed' ? 0x22d3ee : 0xffe08a;
    const gemGeo = track(new THREE.OctahedronGeometry(0.42, 0));
    const gemMat = track(
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive, emissiveIntensity: 1.3, roughness: 0.2, metalness: 0.3 }),
    );
    g.add(new THREE.Mesh(gemGeo, gemMat)); // children[0] — the gem
    ringColor = kind === 'speed' ? 0x22d3ee : 0xff5db0;
  }

  const ringGeo = track(new THREE.TorusGeometry(0.62, 0.06, 8, 22));
  const ringMat = track(
    new THREE.MeshStandardMaterial({ color: ringColor, emissive: ringColor, emissiveIntensity: 0.9, roughness: 0.3 }),
  );
  g.add(new THREE.Mesh(ringGeo, ringMat));
  return g;
}

/** The candy ground plane the city sits on. Laid flat at the caller's GROUND_Y. */
export function buildGround(THREE: ThreeNS, track: Track, size: { w: number; d: number }): ThreeMesh {
  const geo = track(new THREE.PlaneGeometry(size.w, size.d));
  const mat = track(new THREE.MeshStandardMaterial({ color: 0xd7f0d8, roughness: 1 }));
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}
