// Procedural CHOCOLATE FORTRESS for Castle Crumble.
//
// A big medieval keep, not toddler cake blocks. Everything is small chocolate
// masonry: each physics block wears a fine chocolate-brick/mortar TEXTURE (so a
// single box reads as ~30 little bricks — detail without a physics explosion),
// is laid with a subtle hand-placed jitter (no machine-perfect grid), and the
// silhouette is proper medieval — four tall conical-roofed corner turrets, a
// mid-wall tower on each side, eight crenellated curtain-wall segments joining
// them, and a taller crenellated keep with a central spire, all in dark→milk
// chocolate with red witch-hat roofs and cherry finials.
//
// Seventeen logical STRUCTURES (4 corner turrets + 4 mid towers + 8 wall
// segments + keep); each is ONE CastleStructure so ammo/win scale with ~17
// pieces, not the ~650 bricks. A piece is "flattened" once its tallest
// remaining brick drops below flattenThresholdY. Every body spawns ASLEEP — the
// resting fortress is cheap; only the cluster a shot wakes has to simulate.
//
// No runtime `three`/`cannon-es` import — the loaded namespaces arrive as args.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS } from '../types';
import type { CityBlock } from '../city';

/** One toppleable piece (a corner tower, a wall run, or the keep). */
export interface CastleStructure {
  blocks: CityBlock[];
  /** Y of the top full-layer's center at spawn — the "full height" reference. */
  originalTopY: number;
  /** Flattened once the tallest remaining block falls below this Y. */
  flattenThresholdY: number;
  flattened: boolean;
  /** Shared brick geometry for the whole piece, disposed once. */
  geometry: THREE.BoxGeometry;
  /** The 2 chocolate shades this piece alternates by course. */
  materials: THREE.MeshStandardMaterial[];
  /** Cherry finial on the roof apex (towers + keep). */
  cherry?: { geo: THREE.SphereGeometry; mat: THREE.MeshStandardMaterial };
  /** Conical roof (towers + keep). */
  roof?: { geo: THREE.ConeGeometry; mat: THREE.MeshStandardMaterial };
}

export interface Castle {
  structures: CastleStructure[];
  dispose(scene: THREE.Scene, world: CANNON.World): void;
}

// Chocolate masonry palette — dark → milk → cocoa → mocha → caramel. All browns
// so the keep reads as one chocolate fortress, with subtle course-to-course
// variation for richness (no candy rainbow).
const CHOCOLATE = [
  0x3d2415, // dark chocolate
  0x4a2c18, // bittersweet
  0x5c3620, // semisweet
  0x6b4226, // milk chocolate
  0x7b4a2b, // cocoa
  0x8a5a3c, // mocha / caramel accent
];
const ROOF_RED = 0xcf3a52; // red witch-hat turret roof (strawberry-cherry)
const CHERRY_RED = 0xe11d48;

// --- Brick unit. Small + flatter than a cube so courses read as masonry. ---
// 10× scale — a giant fortress (the cannon + ball stay their normal size, so
// you're a tiny cannon bombarding a towering keep). Only the castle grows.
const BRICK = 4.4; // footprint (x/z)
const BRICK_H = 2.8; // course height

interface CreateCastleOpts {
  /** Ground-plane centre the fortress is built around. */
  center: { x: number; z: number };
  /** Extra wall length + height beyond the base, per side (grows the castle). */
  extraWallsPerSide: number;
  blockMaterial: CANNON.Material;
  rng: () => number;
}

/** A rectangular brick cluster: fx×fz bricks per course, `layers` tall, with an
 *  optional crenellated top and an optional conical roof + cherry finial. */
interface StructureSpec {
  cx: number;
  cz: number;
  fx: number;
  fz: number;
  layers: number;
  crenellate: boolean;
  roof: boolean;
}

/** Build the shared chocolate-brick texture once: a warm base with dark cocoa
 *  mortar lines in a running-bond pattern. Multiplied by each block's chocolate
 *  colour, so every box face shows fine little bricks. */
function makeBrickTexture(THREE: ThreeNS): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#caa982'; // warm light base (multiplies into a lit brick face)
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(58,36,22,0.9)'; // dark cocoa mortar
  const courseH = 16;
  const brickW = 32;
  const mortar = 3;
  let row = 0;
  for (let y = 0; y <= 128; y += courseH) {
    g.fillRect(0, y, 128, mortar); // horizontal joint
    const off = (row % 2) * (brickW / 2); // running-bond half-brick offset
    for (let x = off; x <= 128; x += brickW) {
      g.fillRect(x - mortar / 2, y, mortar, courseH); // vertical joints
    }
    row++;
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createCastle(
  THREE: ThreeNS,
  CANNON: CannonNS,
  scene: THREE.Scene,
  world: CANNON.World,
  opts: CreateCastleOpts,
): Castle {
  const { center, extraWallsPerSide, blockMaterial, rng } = opts;

  const brickTex = makeBrickTexture(THREE);

  // A big medieval siege castle: 4 tall corner turrets, a mid-wall tower on each
  // side, 8 crenellated curtain-wall segments joining them, and a tall central
  // keep with a spire. ~650 small bricks / 17 pieces at base tier.
  const segLen = 4 + extraWallsPerSide; // wall-segment length in bricks (4..6)
  const cornerLayers = 14 + extraWallsPerSide; // tallest turrets
  const midLayers = 10 + extraWallsPerSide; // mid-wall towers
  const wallH = 4; // curtain-wall height in courses
  const keepLayers = 13 + extraWallsPerSide; // central keep

  // Towers are 2×2 bricks. A corner turret and the adjacent mid tower are
  // cornerOff apart on an axis; a segLen-brick wall fills the gap between their
  // edges, so cornerOff = segLen + one full tower (half-span each side).
  const cornerOff = segLen * BRICK + 2 * BRICK;
  const midOff = cornerOff / 2; // curtain segments sit halfway out along a side

  const specs: StructureSpec[] = [];

  // Four conical-roofed corner turrets — the tallest, most dramatic pieces.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      specs.push({ cx: center.x + sx * cornerOff, cz: center.z + sz * cornerOff, fx: 2, fz: 2, layers: cornerLayers, crenellate: false, roof: true });
    }
  }

  // Four mid-wall towers — one at the midpoint of each side (also roofed).
  specs.push({ cx: center.x, cz: center.z - cornerOff, fx: 2, fz: 2, layers: midLayers, crenellate: false, roof: true });
  specs.push({ cx: center.x, cz: center.z + cornerOff, fx: 2, fz: 2, layers: midLayers, crenellate: false, roof: true });
  specs.push({ cx: center.x - cornerOff, cz: center.z, fx: 2, fz: 2, layers: midLayers, crenellate: false, roof: true });
  specs.push({ cx: center.x + cornerOff, cz: center.z, fx: 2, fz: 2, layers: midLayers, crenellate: false, roof: true });

  // Eight crenellated curtain-wall segments — two per side, each joining a
  // corner turret to the mid tower (sitting at ±midOff along the side).
  for (const sz of [-1, 1] as const) {
    for (const sx of [-1, 1] as const) {
      // North/south runs (along X), at z = ±cornerOff.
      specs.push({ cx: center.x + sx * midOff, cz: center.z + sz * cornerOff, fx: segLen, fz: 1, layers: wallH, crenellate: true, roof: false });
      // East/west runs (along Z), at x = ±cornerOff.
      specs.push({ cx: center.x + sz * cornerOff, cz: center.z + sx * midOff, fx: 1, fz: segLen, layers: wallH, crenellate: true, roof: false });
    }
  }

  // Central keep — tallest + widest, crenellated with a central spire.
  specs.push({ cx: center.x, cz: center.z, fx: 3, fz: 3, layers: keepLayers, crenellate: true, roof: true });

  const structures = specs.map((spec) => buildStructure(THREE, CANNON, scene, world, spec, blockMaterial, brickTex, rng));

  return {
    structures,
    dispose(s: THREE.Scene, w: CANNON.World): void {
      for (const st of structures) {
        for (const blk of st.blocks) {
          s.remove(blk.mesh);
          w.removeBody(blk.body);
        }
        st.geometry.dispose();
        for (const m of st.materials) m.dispose();
        if (st.cherry) {
          st.cherry.geo.dispose();
          st.cherry.mat.dispose();
        }
        if (st.roof) {
          st.roof.geo.dispose();
          st.roof.mat.dispose();
        }
      }
      brickTex.dispose();
      structures.length = 0;
    },
  };
}

/** Build one brick cluster (turret / wall / keep) as a single CastleStructure. */
function buildStructure(
  THREE: ThreeNS,
  CANNON: CannonNS,
  scene: THREE.Scene,
  world: CANNON.World,
  spec: StructureSpec,
  blockMaterial: CANNON.Material,
  brickTex: THREE.CanvasTexture,
  rng: () => number,
): CastleStructure {
  const { cx, cz, fx, fz, layers, crenellate, roof } = spec;

  // Two chocolate shades alternated by course, shared across every brick (2
  // materials, not one-per-brick), each wearing the shared brick texture.
  const ca = Math.floor(rng() * CHOCOLATE.length);
  let cb = Math.floor(rng() * CHOCOLATE.length);
  if (cb === ca) cb = (cb + 1) % CHOCOLATE.length;
  const mk = (color: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, map: brickTex, roughness: 0.85, metalness: 0.0 });
  const materials = [mk(CHOCOLATE[ca]), mk(CHOCOLATE[cb])];

  const geometry = new THREE.BoxGeometry(BRICK, BRICK_H, BRICK);
  const hx = BRICK / 2;
  const hy = BRICK_H / 2;
  const blocks: CityBlock[] = [];

  const addBrick = (x: number, y: number, z: number, mat: THREE.MeshStandardMaterial): CityBlock => {
    // Subtle hand-laid jitter so the masonry never reads as a perfect toy grid.
    const yaw = (rng() - 0.5) * 0.05;
    const jx = (rng() - 0.5) * 0.2; // hand-laid jitter, scaled with the 10× bricks
    const jz = (rng() - 0.5) * 0.2;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x + jx, y, z + jz);
    mesh.rotation.y = yaw;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hx)),
      position: new CANNON.Vec3(x + jx, y, z + jz),
      material: blockMaterial,
      allowSleep: true,
      sleepSpeedLimit: 0.15,
      sleepTimeLimit: 0.4,
      // Damping bleeds energy out of a knocked brick so it settles quickly
      // instead of tumbling on and toppling half the castle (chain reactions).
      // Raised (0.1→0.25, 0.35→0.6) so a struck tower slumps into a local
      // rubble pile rather than a rigid column that keeps rolling into — and
      // topples — its neighbours across the whole ring.
      linearDamping: 0.25,
      angularDamping: 0.65,
    });
    body.quaternion.setFromEuler(0, yaw, 0);
    body.sleep();
    world.addBody(body);
    const blk = { mesh, body };
    blocks.push(blk);
    return blk;
  };

  const bx = (ix: number): number => cx + (ix - (fx - 1) / 2) * BRICK;
  const bz = (iz: number): number => cz + (iz - (fz - 1) / 2) * BRICK;

  // Full courses.
  for (let k = 0; k < layers; k++) {
    const y = BRICK_H * (k + 0.5);
    const mat = materials[k % 2];
    for (let ix = 0; ix < fx; ix++) {
      for (let iz = 0; iz < fz; iz++) {
        addBrick(bx(ix), y, bz(iz), mat);
      }
    }
  }

  // Crenellated battlement course: alternating merlons (castle teeth).
  if (crenellate) {
    const y = BRICK_H * (layers + 0.5);
    const mat = materials[layers % 2];
    for (let ix = 0; ix < fx; ix++) {
      for (let iz = 0; iz < fz; iz++) {
        const isWall = fx === 1 || fz === 1;
        const perimeter = ix === 0 || ix === fx - 1 || iz === 0 || iz === fz - 1;
        const merlon = isWall ? (ix + iz) % 2 === 0 : perimeter && (ix + iz) % 2 === 0;
        if (merlon) addBrick(bx(ix), y, bz(iz), mat);
      }
    }
  }

  // Conical roof + cherry finial, riding the highest brick so they topple with
  // the turret. Offset onto the cluster centre (the host brick is a corner one).
  let roofHandle: CastleStructure['roof'];
  let cherryHandle: CastleStructure['cherry'];
  if (roof && blocks.length > 0) {
    const host = blocks.reduce((best, b) => (b.mesh.position.y > best.mesh.position.y ? b : best), blocks[0]);
    const footW = Math.max(fx, fz) * BRICK;
    const rRad = footW * 0.62;
    const rH = footW * 0.95;
    const geo = new THREE.ConeGeometry(rRad, rH, 14);
    const mat = new THREE.MeshStandardMaterial({ color: ROOF_RED, roughness: 0.45, metalness: 0.0 });
    const cone = new THREE.Mesh(geo, mat);
    cone.castShadow = true;
    const offX = cx - host.mesh.position.x;
    const offZ = cz - host.mesh.position.z;
    cone.position.set(offX, BRICK_H / 2 + rH / 2, offZ);
    host.mesh.add(cone);
    roofHandle = { geo, mat };

    const fgeo = new THREE.SphereGeometry(rRad * 0.28, 12, 10);
    const fmat = new THREE.MeshStandardMaterial({ color: CHERRY_RED, roughness: 0.3, metalness: 0.0 });
    const finial = new THREE.Mesh(fgeo, fmat);
    finial.castShadow = true;
    finial.position.set(offX, BRICK_H / 2 + rH + fgeo.parameters.radius * 0.6, offZ);
    host.mesh.add(finial);
    cherryHandle = { geo: fgeo, mat: fmat };
  }

  const originalTopY = BRICK_H * (layers - 0.5);
  return {
    blocks,
    originalTopY,
    // Flattened once the tallest remaining brick drops below HALF full height —
    // the tall turrets/keep must really come down to count (a shot that clips
    // the top doesn't cheaply "flatten" a piece).
    flattenThresholdY: originalTopY * 0.5,
    flattened: false,
    geometry,
    materials,
    cherry: cherryHandle,
    roof: roofHandle,
  };
}
