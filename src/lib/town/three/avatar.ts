// The kid's cupcake avatar for the 3D town. The parts — wrapper, frosting,
// face, glasses, hat, topping — are Blender art (art/blender/cupcake.py →
// public/models/cupcake/cupcake.glb), assembled here per kid from their
// cupcake_config. A billboard sprite of the kid's own emoji rides above as a
// name tag.
//
// No runtime `three` import — the namespace arrives as an argument.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { loadAuthoredModel } from './authored-model';
import {
  PAINT_COLORS,
  frostingColors,
  wrapperColors,
  PLAIN_CUPCAKE,
  VARIETY_TRAITS,
  coerceCupcakeConfig,
  type CupcakeConfig,
  type Hat,
} from '@/lib/cupcake/config';

export interface Avatar {
  group: THREE.Group;
  /** Per-frame visual update: walk-bob while moving + gentle turn toward the
   *  horizontal velocity direction (scene units). */
  update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void;
  dispose(): void;
}

/** The disposable resources a built cupcake model owns. Callers that already
 *  track geo/mat for disposal (the avatar, the city landmark) push these into
 *  their own sinks so nothing leaks when the scene tears down.
 *
 *  Blender parts SHARE their geometry and atlas material with the loaded
 *  library (see preloadCupcakeArt), so they are never listed here: only the
 *  per-model colour materials and any code-built fallback parts are. */
export interface CupcakeModel {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

// ---- Blender parts library --------------------------------------------------

/** Node names in cupcake.glb. A contract with art/blender/cupcake.py: each
 *  node's origin is its attach point (a body's base centre, a face part's
 *  centre, the glasses' bridge, a hat's brim, the spot a topping rests on). */
export const CUPCAKE_PART_NAMES = [
  'cupcake_wrapper', 'cupcake_frosting', 'cupcake_frosting_tall', 'cupcake_collar',
  'cakepop_stick', 'cakepop_ball', 'layered_sponge', 'layered_icing',
  'face_eye', 'face_eye_closed', 'face_smile', 'face_grin', 'face_sleepy_mouth', 'face_tongue', 'face_cheek',
  'glasses_round', 'glasses_sunnies', 'glasses_heart', 'glasses_star',
  'hat_party', 'hat_beanie', 'hat_tophat', 'hat_wizard', 'hat_crown',
  'topping_cherry', 'topping_candle', 'topping_sprinkles', 'topping_star', 'topping_rainbow',
] as const;

export type CupcakePartName = (typeof CUPCAKE_PART_NAMES)[number];

export const CUPCAKE_ART_URL = '/models/cupcake/cupcake.glb';

/** Brim-to-top height of each hat, modelled to these in cupcake.py. A topping
 *  rides on top of the hat. */
export const HAT_HEIGHT: Record<Exclude<Hat, 'none'>, number> = {
  party: 0.38,
  beanie: 0.24,
  tophat: 0.31,
  wizard: 0.5,
  crown: 0.19,
};

/**
 * Loaded parts, shared by every cupcake on the page: the town avatar, every
 * land landmark, the Cakey Store spinners and the game riders. Module-level
 * because those callers have no common owner, and never disposed — it is one
 * small file, and clones of it are alive for as long as the page is.
 */
let library: Map<CupcakePartName, THREE.Object3D> | null = null;
let loading: Promise<void> | null = null;

/**
 * Indexes a loaded cupcake.glb scene by part name. preloadCupcakeArt calls
 * it; tests call it with a stand-in scene (GLTFLoader cannot run in Node).
 * Pass null to go back to the code-built parts.
 */
export function installCupcakeArt(root: THREE.Object3D | null): void {
  if (!root) {
    library = null;
    return;
  }
  const parts = new Map<CupcakePartName, THREE.Object3D>();
  for (const name of CUPCAKE_PART_NAMES) {
    const node = root.getObjectByName(name);
    if (!node) continue;
    node.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    parts.set(name, node);
  }
  library = parts;
}

/**
 * Starts loading the Blender cupcake once per page and waits for it, but never
 * longer than `maxWaitMs`. buildCupcakeModel is synchronous, so a caller that
 * builds before this settles (or after it failed) gets the code-built parts —
 * call this first wherever a cupcake is about to be built.
 */
export async function preloadCupcakeArt(THREE_NS: ThreeNS, maxWaitMs = 4000): Promise<void> {
  if (!loading) {
    loading = loadAuthoredModel(THREE_NS as unknown as typeof THREE, CUPCAKE_ART_URL, { groundAndCentre: false })
      .then((model) => installCupcakeArt(model.root))
      .catch(() => {
        if (process.env.NODE_ENV !== 'production') {
          console.info('[cupcake] no Blender cupcake — using the code-built parts.');
        }
      });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([loading, new Promise<void>((resolve) => (timer = setTimeout(resolve, maxWaitMs)))]);
  if (timer) clearTimeout(timer);
}

/** Colours for a part's tint slots: `tint` is its main colour, `tint2` its
 *  darker band or shade; `rough` is the finish (frosting is glossier than
 *  paper). */
interface PartTints {
  tint?: THREE.ColorRepresentation;
  tint2?: THREE.ColorRepresentation;
  rough?: number;
}

/**
 * Build a static cupcake mesh from a kid's `cupcake_config` — wrapper/sponge
 * color, frosting color, base silhouette (cupcake/cakepop/layered), variety,
 * topping, and the character parts (face, glasses, hat). No animation, no
 * name-tag, no contact shadow. The unit cupcake stands ~0.9 units tall with
 * its base at y=0 and faces +z, so callers scale/position the returned `group`
 * freely (variety scale lives on an inner group, so a caller that sets
 * `group.scale` doesn't wipe it).
 *
 * Single source of truth for the 3D cupcake shape — the walking town avatar
 * (below), the per-kid land landmark (city3d.ts) and the Cakey Store spinner
 * all render from this, so a kid's land icon always matches the treat they
 * built in the store.
 *
 * Parts come from the Blender library once preloadCupcakeArt has loaded it,
 * and from the code-built stand-ins in `codePart` until then (or if the file
 * is missing). Either way they are placed by the same anchors below.
 *
 * Character parts are added under child groups named 'face', 'glasses' and
 * 'hat' so they can be found (and tested) by name.
 */
export function buildCupcakeModel(
  THREE: ThreeNS,
  rawConfig: CupcakeConfig = PLAIN_CUPCAKE,
): CupcakeModel {
  // Coerce so a config saved before hats/glasses/faces existed (or a caller
  // that casts an unchecked row) still builds.
  const config = coerceCupcakeConfig(rawConfig);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // Colors come from the kid's saved cupcake_config — the same palette the 2D
  // CupcakeAvatar / Cakey Store use. Wrapper = liner / cake-sponge; frosting = icing.
  const wrap = wrapperColors(config);
  const fro = frostingColors(config);
  const wrapTints: PartTints = { tint: wrap.paper, tint2: wrap.band, rough: 0.7 };
  const froTints: PartTints = { tint: fro.fill, tint2: fro.shade, rough: 0.45 };
  const traits = VARIETY_TRAITS[config.variety];
  body.scale.setScalar(traits.scale);

  // One coloured copy of a tint slot per colour, owned by this model.
  const painted = new Map<string, THREE.Material>();
  const paint = (slot: THREE.Material, tints: PartTints): THREE.Material => {
    const hex = slot.name === 'tint2' ? tints.tint2 : tints.tint;
    if (hex === undefined) return slot;
    const key = `${slot.uuid}:${String(hex)}:${tints.rough ?? ''}`;
    let mat = painted.get(key);
    if (!mat) {
      const copy = slot.clone() as THREE.MeshStandardMaterial;
      copy.color.set(hex);
      if (tints.rough !== undefined) copy.roughness = tints.rough;
      materials.push(copy);
      painted.set(key, copy);
      mat = copy;
    }
    return mat;
  };

  /** A part, ready to place: a clone of the Blender node, or its code stand-in. */
  const take = (name: CupcakePartName, tints: PartTints = {}): THREE.Object3D => {
    const source = library?.get(name);
    if (!source) return codePart(THREE, name, tints, geometries, materials);
    // clone() shares geometry and the atlas material with the library.
    const part = source.clone(true);
    part.position.set(0, 0, 0);
    part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      if (mesh.material.name === 'tint' || mesh.material.name === 'tint2') {
        mesh.material = paint(mesh.material, tints);
      }
    });
    return part;
  };

  // Where the character parts go on each base. `faceY` is eye height,
  // `mouthY` the mouth, `radiusAt(y)` the body's front-surface radius there
  // (parts sit just proud of it), `tilt` leans flat parts to match the
  // surface slope, `top` is where a topping rests, and `seat` is where a
  // hat's brim does.
  let anchor: {
    faceY: number;
    mouthY: number;
    radiusAt: (y: number) => number;
    tilt: number;
    top: number;
    seat: number;
  };

  // Base body — the silhouette the kid unlocked in the Cakey Store.
  if (config.base === 'cakepop') {
    body.add(take('cakepop_stick'));
    body.add(take('cakepop_ball', froTints)); // candy-coated ball
    anchor = {
      faceY: 0.7,
      mouthY: 0.59,
      radiusAt: (y) => Math.sqrt(Math.max(0, 0.09 - (y - 0.66) ** 2)),
      tilt: 0,
      top: 0.92,
      seat: 0.92,
    };
  } else if (config.base === 'layered') {
    body.add(take('layered_sponge', wrapTints)); // three tiers
    body.add(take('layered_icing', froTints)); // icing between them + crown
    anchor = {
      faceY: 0.14,
      mouthY: 0.065,
      radiusAt: (y) => 0.36 - 0.1 * y,
      tilt: -0.1,
      top: 0.76,
      // The Blender crown is a dome; a hat sits a little down over it.
      seat: library?.has('layered_icing') ? 0.7 : 0.76,
    };
  } else {
    // cupcake (the free default)
    body.add(take('cupcake_wrapper', wrapTints));
    // 'tall' — a taller swirl, piped higher.
    const tall = traits.frostingStacks === 2;
    body.add(take(tall ? 'cupcake_frosting_tall' : 'cupcake_frosting', froTints));
    if (traits.collar) {
      // 'fancy' — a gold foil collar around the wrapper rim.
      const collar = take('cupcake_collar');
      collar.name = 'collar';
      body.add(collar);
    }
    // The Blender swirl narrows to a peak, so a hat sits down into it rather
    // than on its tip; the code dome was wide enough to hold one at the top.
    const swirl = library?.has('cupcake_frosting') ?? false;
    anchor = {
      faceY: 0.28,
      mouthY: 0.17,
      radiusAt: (y) => 0.24 + 0.1 * (y / 0.42),
      tilt: Math.atan2(0.1, 0.42),
      top: tall ? 0.92 : 0.76,
      seat: swirl ? (tall ? 0.8 : 0.66) : tall ? 0.92 : 0.76,
    };
  }

  /** Front-surface point for a part at (x, y), pushed out by `proud`. */
  const front = (x: number, y: number, proud = 0.008): number =>
    Math.sqrt(Math.max(0, anchor.radiusAt(y) ** 2 - x * x)) + proud;

  // ---- Face -----------------------------------------------------------------
  if (config.face !== 'none') {
    const face = new THREE.Group();
    face.name = 'face';
    body.add(face);
    const eyeX = 0.085;
    const place = (name: CupcakePartName, x: number, y: number, proud?: number): THREE.Object3D => {
      const m = take(name);
      m.position.set(x, y, front(x, y, proud));
      m.rotation.x = anchor.tilt;
      face.add(m);
      return m;
    };
    // The arcs are modelled bulging up (∩); a half turn makes a ∪.
    const arc = (name: CupcakePartName, x: number, y: number, up: boolean): void => {
      const m = place(name, x, y);
      if (!up) m.rotation.z = Math.PI;
    };

    if (config.face === 'sleepy') {
      arc('face_eye_closed', -eyeX, anchor.faceY, false);
      arc('face_eye_closed', eyeX, anchor.faceY, false);
    } else if (config.face === 'wink') {
      place('face_eye', -eyeX, anchor.faceY);
      arc('face_eye_closed', eyeX, anchor.faceY - 0.01, true);
    } else {
      place('face_eye', -eyeX, anchor.faceY);
      place('face_eye', eyeX, anchor.faceY);
    }

    if (config.face === 'grin') {
      // Open D-shaped grin, flat edge on top.
      place('face_grin', 0, anchor.mouthY + 0.03, 0.012);
    } else if (config.face === 'sleepy') {
      place('face_sleepy_mouth', 0, anchor.mouthY);
    } else {
      arc('face_smile', 0, anchor.mouthY + 0.03, false);
      if (config.face === 'silly') place('face_tongue', 0.015, anchor.mouthY - 0.025);
    }

    // Rosy cheeks on every face.
    for (const x of [-0.15, 0.15]) place('face_cheek', x, (anchor.faceY + anchor.mouthY) / 2 - 0.01);
  }

  // ---- Glasses --------------------------------------------------------------
  if (config.glasses !== 'none') {
    const glasses = new THREE.Group();
    glasses.name = 'glasses';
    body.add(glasses);
    const y = anchor.faceY;
    glasses.position.set(0, y, front(0, y, 0.035));
    glasses.rotation.x = anchor.tilt;
    glasses.add(take(`glasses_${config.glasses}`, { tint: PAINT_COLORS[config.glassesColor].hex, rough: 0.35 }));
  }

  // ---- Hat ------------------------------------------------------------------
  let toppingY = anchor.top;
  if (config.hat !== 'none') {
    const hat = new THREE.Group();
    hat.name = 'hat';
    hat.position.y = anchor.seat;
    body.add(hat);
    const color = PAINT_COLORS[config.hatColor];
    hat.add(take(`hat_${config.hat}`, { tint: color.hex, tint2: color.shade }));
    toppingY = anchor.seat + HAT_HEIGHT[config.hat];
  }

  // Topping — rides on the hat when there is one.
  if (config.topping !== 'none') {
    const topping = take(`topping_${config.topping}`);
    topping.position.y = toppingY;
    body.add(topping);
  }

  return { group, geometries, materials };
}

/**
 * The code-built stand-in for a Blender part: the primitives the cupcake was
 * made of before cupcake.glb, with the same origin as the Blender node. Used
 * until the library loads, if it fails, and in Node (tests), where three's
 * GLTFLoader cannot run.
 */
function codePart(
  THREE: ThreeNS,
  name: CupcakePartName,
  tints: PartTints,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
): THREE.Object3D {
  const part = new THREE.Group();
  const add = (
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    y = 0,
    opts?: { rough?: number; metal?: number },
  ): THREE.Mesh => {
    geometries.push(geo);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts?.rough ?? 0.6,
      metalness: opts?.metal ?? 0,
    });
    materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.y = y;
    part.add(mesh);
    return mesh;
  };
  const main = tints.tint ?? 0xffffff;
  const shade = tints.tint2 ?? main;
  const ink = 0x1f2937;
  const gold = 0xfbbf24;
  // The code toppings sat 0.06 above the rest point the Blender ones use.
  const lift = 0.06;

  switch (name) {
    case 'cupcake_wrapper':
      add(new THREE.CylinderGeometry(0.34, 0.24, 0.42, 16), main, 0.21, { rough: 0.7 });
      break;
    case 'cupcake_frosting':
      add(new THREE.SphereGeometry(0.36, 18, 14), main, 0.5, { rough: 0.45 }).scale.y = 0.8;
      break;
    case 'cupcake_frosting_tall':
      add(new THREE.SphereGeometry(0.36, 18, 14), main, 0.5, { rough: 0.45 }).scale.y = 0.8;
      add(new THREE.SphereGeometry(0.25, 16, 12), main, 0.76, { rough: 0.45 }).scale.y = 0.8;
      break;
    case 'cupcake_collar': {
      const collar = add(new THREE.TorusGeometry(0.35, 0.03, 8, 28), 0xfcd34d, 0.41, { rough: 0.3, metal: 0.6 });
      collar.rotation.x = Math.PI / 2;
      break;
    }
    case 'cakepop_stick':
      add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), 0xe7cfa3, 0.3, { rough: 0.8 });
      break;
    case 'cakepop_ball':
      add(new THREE.SphereGeometry(0.3, 18, 14), main, 0.66, { rough: 0.45 });
      break;
    case 'layered_sponge':
      add(new THREE.CylinderGeometry(0.34, 0.36, 0.2, 20), main, 0.1, { rough: 0.7 });
      add(new THREE.CylinderGeometry(0.25, 0.27, 0.18, 20), main, 0.34, { rough: 0.7 });
      add(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 20), main, 0.56, { rough: 0.7 });
      break;
    case 'layered_icing':
      add(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 20), main, 0.22, { rough: 0.45 });
      add(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), main, 0.45, { rough: 0.45 });
      add(new THREE.SphereGeometry(0.19, 16, 12), main, 0.66, { rough: 0.45 }).scale.y = 0.7;
      break;
    case 'face_eye':
      add(new THREE.SphereGeometry(0.032, 10, 8), ink, 0, { rough: 0.3 }).scale.set(1, 1.3, 0.6);
      break;
    case 'face_eye_closed':
      add(new THREE.TorusGeometry(0.03, 0.011, 6, 14, Math.PI), ink, 0, { rough: 0.4 });
      break;
    case 'face_smile':
      add(new THREE.TorusGeometry(0.05, 0.011, 6, 14, Math.PI), ink, 0, { rough: 0.4 });
      break;
    case 'face_grin':
      add(new THREE.CircleGeometry(0.065, 16, Math.PI, Math.PI), 0x7f1d1d, 0, { rough: 0.5 });
      break;
    case 'face_sleepy_mouth':
      add(new THREE.TorusGeometry(0.022, 0.01, 6, 12), ink, 0, { rough: 0.4 });
      break;
    case 'face_tongue':
      add(new THREE.SphereGeometry(0.03, 10, 8), 0xf472b6, 0, { rough: 0.5 }).scale.set(1, 1.2, 0.5);
      break;
    case 'face_cheek':
      add(new THREE.SphereGeometry(0.03, 10, 8), 0xfb7185, 0, { rough: 0.8 }).scale.set(1.3, 0.8, 0.3);
      break;
    case 'glasses_round':
    case 'glasses_sunnies':
    case 'glasses_heart':
    case 'glasses_star': {
      const lensX = 0.085;
      if (name === 'glasses_heart' || name === 'glasses_star') {
        const shape = name === 'glasses_heart' ? heartShape(THREE, 0.07) : starShape(THREE, 0.075, 0.034);
        for (const x of [-lensX, lensX]) {
          add(new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false }), main, 0, { rough: 0.35 })
            .position.x = x;
        }
      } else {
        for (const x of [-lensX, lensX]) {
          add(new THREE.TorusGeometry(0.055, 0.012, 8, 20), main, 0, { rough: 0.35 }).position.x = x;
          if (name === 'glasses_sunnies') {
            add(new THREE.CircleGeometry(0.052, 18), 0x111827, 0, { rough: 0.15 }).position.set(x, 0, 0.002);
          }
        }
      }
      // Bridge between the lenses.
      const bridge = add(new THREE.CylinderGeometry(0.009, 0.009, 0.06, 6), main, 0.01, { rough: 0.35 });
      bridge.rotation.z = Math.PI / 2;
      break;
    }
    case 'hat_party':
      add(new THREE.ConeGeometry(0.15, 0.34, 18), main, 0.17);
      add(new THREE.SphereGeometry(0.05, 10, 8), 0xffffff, 0.35, { rough: 0.9 }); // pom-pom
      break;
    case 'hat_beanie': {
      add(new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), main, -0.03, { rough: 0.9 })
        .scale.y = 0.85;
      add(new THREE.TorusGeometry(0.21, 0.035, 8, 24), shade, -0.02, { rough: 0.9 }).rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(0.06, 10, 8), 0xffffff, 0.19, { rough: 0.95 });
      break;
    }
    case 'hat_tophat':
      add(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 24), main, 0.0125, { rough: 0.5 }); // brim
      add(new THREE.CylinderGeometry(0.16, 0.17, 0.28, 22), main, 0.165, { rough: 0.5 }); // crown
      add(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 22), shade, 0.06, { rough: 0.4 }); // band
      break;
    case 'hat_wizard':
      add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), main, 0.01, { rough: 0.7 }); // brim
      // A slight lean reads as floppy.
      add(new THREE.ConeGeometry(0.19, 0.48, 20), main, 0.25, { rough: 0.7 }).rotation.z = 0.12;
      add(new THREE.CylinderGeometry(0.192, 0.192, 0.04, 20), 0xfcd34d, 0.04, { rough: 0.3 }); // gold band
      break;
    case 'hat_crown': {
      const ring = add(new THREE.CylinderGeometry(0.17, 0.16, 0.11, 20, 1, true), gold, 0.055, { rough: 0.25, metal: 0.5 });
      (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const point = add(new THREE.ConeGeometry(0.035, 0.08, 8), gold, 0.15, { rough: 0.25 });
        point.position.x = Math.sin(a) * 0.165;
        point.position.z = Math.cos(a) * 0.165;
        // A jewel in the kid's colour under each point.
        const jewel = add(new THREE.SphereGeometry(0.025, 8, 6), main, 0.055, { rough: 0.2 });
        jewel.position.x = Math.sin(a) * 0.172;
        jewel.position.z = Math.cos(a) * 0.172;
      }
      break;
    }
    case 'topping_cherry':
      add(new THREE.SphereGeometry(0.1, 12, 10), 0xd9223f, lift, { rough: 0.3 });
      break;
    case 'topping_candle':
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), 0xfef3c7, lift + 0.02, { rough: 0.5 });
      add(new THREE.SphereGeometry(0.05, 8, 8), gold, lift + 0.17, { rough: 0.3 });
      break;
    default:
      // star / sprinkles / rainbow — a little gold bauble so the pick reads.
      add(new THREE.SphereGeometry(0.08, 10, 8), gold, lift, { rough: 0.3 });
  }
  return part;
}

function heartShape(THREE: ThreeNS, s: number): THREE.Shape {
  // Centered heart, point down, roughly s wide.
  const h = new THREE.Shape();
  h.moveTo(0, -s * 0.55);
  h.bezierCurveTo(-s * 0.9, -s * 0.05, -s * 0.55, s * 0.6, 0, s * 0.25);
  h.bezierCurveTo(s * 0.55, s * 0.6, s * 0.9, -s * 0.05, 0, -s * 0.55);
  return h;
}

function starShape(THREE: ThreeNS, outer: number, inner: number): THREE.Shape {
  const st = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / 10) * Math.PI * 2;
    const x = Math.sin(a) * r;
    const y = Math.cos(a) * r;
    if (i === 0) st.moveTo(x, y);
    else st.lineTo(x, y);
  }
  st.closePath();
  return st;
}

export function createAvatar(
  THREE: ThreeNS,
  kidEmoji: string | undefined,
  config: CupcakeConfig = PLAIN_CUPCAKE,
): Avatar {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  // Bob applies to this inner group so heading rotation (on `group`) and the
  // vertical bounce don't fight each other.
  const body = new THREE.Group();
  group.add(body);

  // The cupcake silhouette + colors come from the shared model builder so the
  // walking avatar always matches the kid's land icon and Cakey Store treat.
  const model = buildCupcakeModel(THREE, config);
  body.add(model.group);
  geos.push(...model.geometries);
  mats.push(...model.materials);

  // Kid emoji name-tag billboard above the cupcake.
  if (kidEmoji) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '74px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kidEmoji, 48, 52);
    const tex = texs[texs.push(new THREE.CanvasTexture(canvas)) - 1];
    tex.colorSpace = THREE.SRGBColorSpace;
    const tagMat = mats[mats.push(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })) - 1];
    const tag = new THREE.Sprite(tagMat as THREE.SpriteMaterial);
    tag.scale.set(0.7, 0.7, 1);
    tag.position.y = 1.5;
    group.add(tag);
  }

  // Soft contact shadow disc (cheap, always present even if shadows are off).
  const discGeo = geos[geos.push(new THREE.CircleGeometry(0.36, 20)) - 1];
  const discMat = mats[mats.push(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 })) - 1];
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.02;
  group.add(disc);

  let bobPhase = 0;
  let heading = 0;

  return {
    group,
    update(dtMs: number, isMoving: boolean, velX: number, velZ: number): void {
      // Walk-bob: bounce only while moving, settle to rest otherwise.
      if (isMoving) {
        bobPhase += dtMs / 110;
        body.position.y = Math.abs(Math.sin(bobPhase)) * 0.09;
        // Gentle turn toward the velocity heading.
        const target = Math.atan2(velX, velZ);
        let delta = target - heading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        heading += delta * Math.min(1, dtMs / 120);
        group.rotation.y = heading;
      } else {
        body.position.y *= 0.85;
      }
    },
    dispose(): void {
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}

// ============================================================================
// LEARNING-MODE CONTRIBUTION POINT #1 — the feel of walking
// ============================================================================
//
// stepAvatarToward advances an avatar position (WORLD PIXELS) one frame toward
// a tapped target and reports arrival. This is the moment-to-moment "game feel"
// of tap-to-walk: a kid taps the ground, and how the cupcake travels there is
// decided entirely here.
//
// The default below is constant-speed with a stop-short epsilon — simple and
// predictable. But there are real, kid-facing trade-offs worth your call:
//   * Constant speed (current) reads as steady/toy-like.
//   * Ease-OUT on arrival (slow down in the last ~40px) feels more "premium"
//     and stops the jarring hard-stop, but can feel sluggish on short hops.
//   * A tiny ease-IN at the start adds weight but delays response on a kid's
//     impatient repeat-taps.
//
// George — this is a great 5-line one to own. Swap the body for whichever feel
// you want; the signature + the `arrived` contract must stay the same so the
// engine's "arrived → maybe enter game" logic keeps working.

export interface StepResult {
  x: number;
  y: number;
  /** Per-axis velocity actually applied this frame (px/sec) — the avatar uses
   *  this to pick its facing/bob. Zero when already arrived. */
  vx: number;
  vy: number;
  arrived: boolean;
}

export function stepAvatarToward(
  pos: { x: number; y: number },
  target: { x: number; y: number },
  speedPx: number,
  dtMs: number,
  arriveEpsPx: number,
): StepResult {
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= arriveEpsPx) {
    return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
  }
  const stepLen = (speedPx * dtMs) / 1000;
  if (stepLen >= dist) {
    return { x: target.x, y: target.y, vx: 0, vy: 0, arrived: true };
  }
  const nx = dx / dist;
  const ny = dy / dist;
  return {
    x: pos.x + nx * stepLen,
    y: pos.y + ny * stepLen,
    vx: nx * speedPx,
    vy: ny * speedPx,
    arrived: false,
  };
}
