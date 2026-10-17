// The kid's cupcake avatar for the 3D town — built from primitives (wrapper +
// frosting dome + topping, plus face / glasses / hat) so it carries no asset pipeline, matching the
// cupcake mascot the 2D park map drew on a canvas. A billboard sprite of the
// kid's own emoji rides above as a name tag.
//
// No runtime `three` import — the namespace arrives as an argument.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import {
  PAINT_COLORS,
  frostingColors,
  wrapperColors,
  PLAIN_CUPCAKE,
  VARIETY_TRAITS,
  coerceCupcakeConfig,
  type CupcakeConfig,
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
 *  their own sinks so nothing leaks when the scene tears down. */
export interface CupcakeModel {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

/**
 * Build a static cupcake mesh from a kid's `cupcake_config` — wrapper/sponge
 * color, frosting color, base silhouette (cupcake/cakepop/layered), variety,
 * topping, and the character parts (face, glasses, hat). Pure geometry: no
 * animation, no name-tag, no contact shadow. The unit cupcake stands ~0.9
 * units tall with its base at y=0 and faces +z, so callers scale/position the
 * returned `group` freely (variety scale lives on an inner group, so a caller
 * that sets `group.scale` doesn't wipe it).
 *
 * Single source of truth for the 3D cupcake shape — the walking town avatar
 * (below), the per-kid land landmark (city3d.ts) and the Cakey Store spinner
 * all render from this, so a kid's land icon always matches the treat they
 * built in the store.
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
  const wrapCol = wrapperColors(config).paper;
  const froCol = frostingColors(config).fill;
  const traits = VARIETY_TRAITS[config.variety];
  body.scale.setScalar(traits.scale);

  const addMesh = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
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
    parent.add(mesh);
    return mesh;
  };

  const addPart = (
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    y: number,
    opts?: { scaleY?: number; rough?: number },
  ): void => {
    const mesh = addMesh(body, geo, color, opts);
    mesh.position.y = y;
    if (opts?.scaleY) mesh.scale.y = opts.scaleY;
  };

  // Topping — a small 3D nod to the 2D topping choice, placed on top.
  const addTopping = (y: number): void => {
    switch (config.topping) {
      case 'none':
        return;
      case 'cherry':
        addPart(new THREE.SphereGeometry(0.1, 12, 10), 0xd9223f, y, { rough: 0.3 });
        return;
      case 'candle':
        addPart(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), 0xfef3c7, y + 0.02, { rough: 0.5 });
        addPart(new THREE.SphereGeometry(0.05, 8, 8), 0xfbbf24, y + 0.17, { rough: 0.3 });
        return;
      default:
        // star / sprinkles / rainbow — a little gold bauble so the pick reads.
        addPart(new THREE.SphereGeometry(0.08, 10, 8), 0xfbbf24, y, { rough: 0.3 });
    }
  };

  // Where the character parts go on each base. `faceY` is eye height,
  // `mouthY` the mouth, `radiusAt(y)` the body's front-surface radius there
  // (parts sit just proud of it), `tilt` leans flat parts to match the
  // surface slope, and `top` is where a hat's brim rests.
  let anchor: {
    faceY: number;
    mouthY: number;
    radiusAt: (y: number) => number;
    tilt: number;
    top: number;
  };

  // Base body — the silhouette the kid unlocked in the Cakey Store.
  if (config.base === 'cakepop') {
    addPart(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), 0xe7cfa3, 0.3, { rough: 0.8 }); // stick
    addPart(new THREE.SphereGeometry(0.3, 18, 14), froCol, 0.66, { rough: 0.45 }); // coated ball
    anchor = {
      faceY: 0.7,
      mouthY: 0.59,
      radiusAt: (y) => Math.sqrt(Math.max(0, 0.09 - (y - 0.66) ** 2)),
      tilt: 0,
      top: 0.92,
    };
  } else if (config.base === 'layered') {
    addPart(new THREE.CylinderGeometry(0.34, 0.36, 0.2, 20), wrapCol, 0.1, { rough: 0.7 }); // bottom tier
    addPart(new THREE.CylinderGeometry(0.37, 0.37, 0.05, 20), froCol, 0.22, { rough: 0.45 }); // icing
    addPart(new THREE.CylinderGeometry(0.25, 0.27, 0.18, 20), wrapCol, 0.34, { rough: 0.7 }); // mid tier
    addPart(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 20), froCol, 0.45, { rough: 0.45 }); // icing
    addPart(new THREE.CylinderGeometry(0.17, 0.19, 0.16, 20), wrapCol, 0.56, { rough: 0.7 }); // top tier
    addPart(new THREE.SphereGeometry(0.19, 16, 12), froCol, 0.66, { scaleY: 0.7, rough: 0.45 }); // crown
    anchor = {
      faceY: 0.14,
      mouthY: 0.065,
      radiusAt: (y) => 0.36 - 0.1 * y,
      tilt: -0.1,
      top: 0.76,
    };
  } else {
    // cupcake (the free default)
    addPart(new THREE.CylinderGeometry(0.34, 0.24, 0.42, 16), wrapCol, 0.21, { rough: 0.7 }); // wrapper
    addPart(new THREE.SphereGeometry(0.36, 18, 14), froCol, 0.5, { scaleY: 0.8, rough: 0.45 }); // frosting
    let top = 0.76;
    if (traits.frostingStacks === 2) {
      // 'tall' — a second, smaller swirl stacked on the first.
      addPart(new THREE.SphereGeometry(0.25, 16, 12), froCol, 0.76, { scaleY: 0.8, rough: 0.45 });
      top = 0.92;
    }
    if (traits.collar) {
      // 'fancy' — a gold foil collar around the wrapper rim.
      const collar = addMesh(body, new THREE.TorusGeometry(0.35, 0.03, 8, 28), 0xfcd34d, { rough: 0.3, metal: 0.6 });
      collar.name = 'collar';
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.41;
    }
    anchor = {
      faceY: 0.28,
      mouthY: 0.17,
      radiusAt: (y) => 0.24 + 0.1 * (y / 0.42),
      tilt: Math.atan2(0.1, 0.42),
      top,
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
    const ink = 0x1f2937;
    const eyeX = 0.085;
    const place = (m: THREE.Object3D, x: number, y: number, proud?: number): void => {
      m.position.set(x, y, front(x, y, proud));
      m.rotation.x = anchor.tilt;
    };
    const dotEye = (x: number): void => {
      const eye = addMesh(face, new THREE.SphereGeometry(0.032, 10, 8), ink, { rough: 0.3 });
      eye.scale.set(1, 1.3, 0.6);
      place(eye, x, anchor.faceY);
    };
    // A half ring. `up` = the arc bulges upward (∩); otherwise it's a ∪.
    const arc = (x: number, y: number, r: number, up: boolean, color = ink): void => {
      const m = addMesh(face, new THREE.TorusGeometry(r, 0.011, 6, 14, Math.PI), color, { rough: 0.4 });
      place(m, x, y);
      if (!up) m.rotation.z = Math.PI;
    };

    if (config.face === 'sleepy') {
      arc(-eyeX, anchor.faceY, 0.03, false);
      arc(eyeX, anchor.faceY, 0.03, false);
    } else if (config.face === 'wink') {
      dotEye(-eyeX);
      arc(eyeX, anchor.faceY - 0.01, 0.03, true);
    } else {
      dotEye(-eyeX);
      dotEye(eyeX);
    }

    if (config.face === 'grin') {
      // Open D-shaped grin: a filled lower half-disc.
      const mouth = addMesh(face, new THREE.CircleGeometry(0.065, 16, Math.PI, Math.PI), 0x7f1d1d, { rough: 0.5 });
      place(mouth, 0, anchor.mouthY + 0.03, 0.012);
    } else if (config.face === 'sleepy') {
      const mouth = addMesh(face, new THREE.TorusGeometry(0.022, 0.01, 6, 12), ink, { rough: 0.4 });
      place(mouth, 0, anchor.mouthY);
    } else {
      arc(0, anchor.mouthY + 0.03, 0.05, false);
      if (config.face === 'silly') {
        const tongue = addMesh(face, new THREE.SphereGeometry(0.03, 10, 8), 0xf472b6, { rough: 0.5 });
        tongue.scale.set(1, 1.2, 0.5);
        place(tongue, 0.015, anchor.mouthY - 0.025);
      }
    }

    // Rosy cheeks on every face.
    for (const x of [-0.15, 0.15]) {
      const cheek = addMesh(face, new THREE.SphereGeometry(0.03, 10, 8), 0xfb7185, { rough: 0.8 });
      cheek.scale.set(1.3, 0.8, 0.3);
      place(cheek, x, (anchor.faceY + anchor.mouthY) / 2 - 0.01);
    }
  }

  // ---- Glasses --------------------------------------------------------------
  if (config.glasses !== 'none') {
    const glasses = new THREE.Group();
    glasses.name = 'glasses';
    body.add(glasses);
    const frame = PAINT_COLORS[config.glassesColor].hex;
    const y = anchor.faceY;
    const lensX = 0.085;
    const z = front(0, y, 0.035);
    glasses.position.set(0, y, z);
    glasses.rotation.x = anchor.tilt;

    if (config.glasses === 'heart' || config.glasses === 'star') {
      const shape = config.glasses === 'heart' ? heartShape(THREE, 0.07) : starShape(THREE, 0.075, 0.034);
      for (const x of [-lensX, lensX]) {
        const lens = addMesh(
          glasses,
          new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false }),
          frame,
          { rough: 0.35 },
        );
        lens.position.set(x, 0, 0);
      }
    } else {
      for (const x of [-lensX, lensX]) {
        const ring = addMesh(glasses, new THREE.TorusGeometry(0.055, 0.012, 8, 20), frame, { rough: 0.35 });
        ring.position.set(x, 0, 0);
        if (config.glasses === 'sunnies') {
          const lens = addMesh(glasses, new THREE.CircleGeometry(0.052, 18), 0x111827, { rough: 0.15 });
          lens.position.set(x, 0, 0.002);
        }
      }
    }
    // Bridge between the lenses.
    const bridge = addMesh(glasses, new THREE.CylinderGeometry(0.009, 0.009, 0.06, 6), frame, { rough: 0.35 });
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.01, 0);
  }

  // ---- Hat ------------------------------------------------------------------
  let toppingY = anchor.top + 0.06;
  if (config.hat !== 'none') {
    const hat = new THREE.Group();
    hat.name = 'hat';
    hat.position.y = anchor.top;
    body.add(hat);
    const paint = PAINT_COLORS[config.hatColor];
    const add = (geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, y: number, rough = 0.6): THREE.Mesh => {
      const m = addMesh(hat, geo, color, { rough });
      m.position.y = y;
      return m;
    };
    let height = 0;
    switch (config.hat) {
      case 'party': {
        add(new THREE.ConeGeometry(0.15, 0.34, 18), paint.hex, 0.17);
        add(new THREE.SphereGeometry(0.05, 10, 8), 0xffffff, 0.35, 0.9); // pom-pom
        height = 0.38;
        break;
      }
      case 'beanie': {
        const dome = add(new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint.hex, -0.03, 0.9);
        dome.scale.y = 0.85;
        const cuff = add(new THREE.TorusGeometry(0.21, 0.035, 8, 24), paint.shade, -0.02, 0.9);
        cuff.rotation.x = Math.PI / 2;
        add(new THREE.SphereGeometry(0.06, 10, 8), 0xffffff, 0.19, 0.95);
        height = 0.24;
        break;
      }
      case 'tophat': {
        add(new THREE.CylinderGeometry(0.26, 0.26, 0.025, 24), paint.hex, 0.0125, 0.5); // brim
        add(new THREE.CylinderGeometry(0.16, 0.17, 0.28, 22), paint.hex, 0.165, 0.5); // crown
        add(new THREE.CylinderGeometry(0.172, 0.172, 0.05, 22), paint.shade, 0.06, 0.4); // band
        height = 0.31;
        break;
      }
      case 'wizard': {
        add(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 24), paint.hex, 0.01, 0.7); // brim
        const cone = add(new THREE.ConeGeometry(0.19, 0.48, 20), paint.hex, 0.25, 0.7);
        cone.rotation.z = 0.12; // a slight lean reads as floppy
        add(new THREE.CylinderGeometry(0.192, 0.192, 0.04, 20), 0xfcd34d, 0.04, 0.3); // gold band
        height = 0.5;
        break;
      }
      case 'crown': {
        const gold = 0xfbbf24;
        const ring = add(new THREE.CylinderGeometry(0.17, 0.16, 0.11, 20, 1, true), gold, 0.055, 0.25);
        (ring.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        (ring.material as THREE.MeshStandardMaterial).metalness = 0.5;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const point = add(new THREE.ConeGeometry(0.035, 0.08, 8), gold, 0.15, 0.25);
          point.position.x = Math.sin(a) * 0.165;
          point.position.z = Math.cos(a) * 0.165;
          // A jewel in the kid's colour under each point.
          const jewel = add(new THREE.SphereGeometry(0.025, 8, 6), paint.hex, 0.055, 0.2);
          jewel.position.x = Math.sin(a) * 0.172;
          jewel.position.z = Math.cos(a) * 0.172;
        }
        height = 0.19;
        break;
      }
    }
    toppingY = anchor.top + height + 0.06;
  }

  addTopping(config.base === 'cakepop' && config.hat === 'none' ? 0.9 : toppingY);

  return { group, geometries, materials };
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
