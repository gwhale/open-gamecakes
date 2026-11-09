// Cake Shift engine — Tower of Hanoi on three cake stands, raw three.js.
//
// The fiction: the party cake is on the wrong stand. Move it, layer by layer,
// to the last stand, and never put a big layer on a little one — it would
// squash it flat. There are no pegs and no holes through the layers; the rule
// is taught by the BUMP (an illegal layer flies most of the way, hits nothing
// visible, wobbles and comes home), not by a spindle and not by a paragraph.
//
// What lives here: the scene, the three stands, the layers, one InstancedMesh
// of sprinkles, the tap/drag input and every animation. What does not: text.
// The HUD (moves, par meter, hint budget, Cakey's lines) is DOM in the host,
// and the rules are the pure model in src/lib/games/hanoi/state.ts, which the
// tests cover; this file only ever asks it "may I?" and "what next?".
//
// Modelled on the crane's engine (src/lib/games/three/crane/engine.ts) for the
// renderer set-up, the disposal bookkeeping and the callback contract — not
// its mechanics. No physics: nothing here falls, and a puzzle whose pieces
// could topple would punish a kid for a good move made ten moves ago.
//
// No runtime `three` import — the namespace arrives as an argument.

import type * as THREE_T from 'three';
import { CAKE, SKY, SPRINKLE_COLORS, WORLD } from '@/lib/games/theme/palette';
import { frostingMat, glowSprite } from '@/lib/town/three/materials';
import { tierColorsFor } from '@/lib/games/hanoi/colors';
import {
  canMove,
  isSolved,
  move,
  newGame,
  nextOptimalMove,
  topOf,
  TARGET_STAND,
  type HanoiState,
  type Stand,
} from '@/lib/games/hanoi/state';
import type { HanoiCallbacks, HanoiEngine, HanoiSceneProps, HanoiSfx, ThreeNS } from './types';

type TGroup = THREE_T.Group;
type TMesh = THREE_T.Mesh;
type TMaterial = THREE_T.Material;
type TGeometry = THREE_T.BufferGeometry;
type TStdMat = THREE_T.MeshStandardMaterial;
type TVec3 = THREE_T.Vector3;

// ---------- layout ----------
/** Stand centres. 3.6 apart leaves a 0.4u gap between the 3.2u hit proxies. */
const STAND_X: readonly number[] = [-3.6, 0, 3.6];
/** Top face of every plate. Layers stack up from here. */
const PLATE_TOP = 0.82;
/** Sponge height. */
const LAYER_H = 0.34;
/** Frosting cap on top of the sponge. */
const CAP_H = 0.06;
/** Stacking pitch — sponge plus cap, so the cap never pierces the layer above. */
const PITCH = LAYER_H + CAP_H;
/** Air between the tallest possible stack under a held layer and the layer
 *  itself. The hover line is derived per tower (see liftY in the factory) so
 *  a three-layer cake does not float its layer up where an eight-layer one
 *  would need it. */
const LIFT_CLEARANCE = 1.1;
/** Arc apex above the hover line. */
const ARC_APEX = 0.6;
/** Sprinkles per layer. */
const SPRINKLES_PER = 10;
const PARTICLE_POOL = 60;

/** Radius by size, 1 (top) → 8 (base): 0.42 … 1.33, all under the 1.55 plate.
 *  The step is what makes "which is bigger" readable from across a room. */
const radiusOf = (size: number): number => 0.42 + (size - 1) * 0.13;

// ---------- easing ----------
const easeOutCubic = (k: number): number => 1 - (1 - k) ** 3;
const easeInQuad = (k: number): number => k * k;
const easeOutQuad = (k: number): number => 1 - (1 - k) * (1 - k);
const easeInOutSine = (k: number): number => -(Math.cos(Math.PI * k) - 1) / 2;
const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOutBack = (k: number): number => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

/** Deterministic 0..1 noise, so sprinkles land in the same place every build. */
function hash(seed: number): number {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

interface Anim {
  t: number;
  dur: number;
  update: (k: number) => void;
  done?: () => void;
}

interface Layer {
  size: number;
  r: number;
  group: TGroup;
  bodyMat: TStdMat;
  capMat: TStdMat;
  /** 1 = solid. Drops during the reduced-motion crossfade; also scales the
   *  layer's sprinkles so they vanish with it. */
  alpha: number;
}

interface Particle {
  mesh: TMesh;
  vx: number; vy: number; vz: number;
  spin: number;
  life: number;
  ttl: number;
  /** Held particles (the reduced-motion win ring) never age. */
  frozen: boolean;
}

export function createCakeShiftEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: HanoiSceneProps,
  cb: HanoiCallbacks,
): HanoiEngine {
  const reduced = props.reducedMotion === true;
  const n = newGame(props.layers).n;
  /** Where a picked-up layer hovers: clear of the tallest stack it can ever
   *  have to cross (n − 1 layers), plus LIFT_CLEARANCE. 2.7u at three
   *  layers, 4.7u at eight. */
  const LIFT_Y = PLATE_TOP + (n - 1) * PITCH + LIFT_CLEARANCE;
  const tierColors = tierColorsFor(n);

  // ---------- renderer (crane's proven set-up) ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  // ---------- scene ----------
  // A bakery window on the blue island, not the crane's pink bakery: the
  // island is sky-on-water and this is the island's game. Strawberry stays
  // present through the layer ladder and the cherries.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.LOW);
  scene.fog = new THREE.Fog(SKY.LOW, 22, 60);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(40, w0 / h0, 0.1, 120);
  // Fixed 3/4 view, dollied back by layer count. No orbit: the three stands
  // are a diagram the kid has to read, and a moving camera makes "which stand
  // is that?" harder every frame. The pull-back is itself the difficulty cue.
  camera.position.set(0, 5.4 + n * 0.22, 9.5 + n * 0.45);
  const LOOK_AT = new THREE.Vector3(0, 2.2, 0);
  camera.lookAt(LOOK_AT);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf5d8c0, 0.6));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.3);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.0012;
  scene.add(sun);
  scene.add(sun.target);

  // ---------- disposal bookkeeping ----------
  const geos: TGeometry[] = [];
  const mats: TMaterial[] = [];
  const texs: THREE_T.Texture[] = [];
  const g = <T extends TGeometry>(v: T): T => { geos.push(v); return v; };
  const m = <T extends TMaterial>(v: T): T => { mats.push(v); return v; };

  // ---------- the counter (crane's grammar — one kitchen) ----------
  const counterMat = m(new THREE.MeshStandardMaterial({ color: 0xf6e3cf, roughness: 0.95 }));
  const counter = new THREE.Mesh(g(new THREE.CircleGeometry(9, 40)), counterMat);
  counter.rotation.x = -Math.PI / 2;
  counter.receiveShadow = true;
  scene.add(counter);
  const rimMat = m(new THREE.MeshStandardMaterial({ color: 0xe6cdb2, roughness: 0.7 }));
  const counterRim = new THREE.Mesh(g(new THREE.TorusGeometry(9, 0.2, 8, 48)), rimMat);
  counterRim.rotation.x = -Math.PI / 2;
  counterRim.position.y = 0.02;
  scene.add(counterRim);

  // Set dressing, far enough back that the fog softens it: two macaron stacks
  // so the counter reads as a bakery and not a void with three plates in it.
  const macaronMats = [0xf9a8d4, 0xa7f3d0, 0xfde68a].map((c) =>
    m(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  );
  const macaronGeo = g(new THREE.CylinderGeometry(0.9, 0.9, 0.34, 20));
  const creamGeo = g(new THREE.CylinderGeometry(0.82, 0.82, 0.18, 20));
  const creamMat = m(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 }));
  for (let i = 0; i < 2; i++) {
    const stack = new THREE.Group();
    for (let j = 0; j < 2; j++) {
      const shell = new THREE.Mesh(macaronGeo, macaronMats[(i + j) % 3]);
      shell.position.y = 0.17 + j * 0.52;
      shell.castShadow = true;
      stack.add(shell);
    }
    const cream = new THREE.Mesh(creamGeo, creamMat);
    cream.position.y = 0.43;
    stack.add(cream);
    stack.position.set(i === 0 ? -7.0 : 7.2, 0, i === 0 ? -5.6 : -6.2);
    scene.add(stack);
  }

  // ---------- shared stand assets ----------
  const doilyMat = m(new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.9 }));
  const doilyGeo = g(new THREE.CylinderGeometry(1.95, 1.95, 0.05, 40));
  const beadGeo = g(new THREE.SphereGeometry(0.13, 8, 6));
  const footGeo = g(new THREE.CylinderGeometry(0.62, 0.75, 0.14, 24));
  const stemGeo = g(new THREE.CylinderGeometry(0.26, 0.5, 0.55, 20));
  const plateGeo = g(new THREE.CylinderGeometry(1.55, 1.55, 0.12, 36));
  const rimRingGeo = g(new THREE.TorusGeometry(1.5, 0.045, 8, 48));
  const cherryGeo = g(new THREE.SphereGeometry(0.1, 12, 10));
  const stalkGeo = g(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 6));
  const candleGeo = g(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10));
  const flameGeo = g(new THREE.ConeGeometry(0.07, 0.16, 8));
  const hitGeo = g(new THREE.BoxGeometry(1, 1, 1));

  const standMat = m(new THREE.MeshStandardMaterial({ color: CAKE.VANILLA_DEEP, roughness: 0.45 }));
  const cherryMat = m(new THREE.MeshStandardMaterial({ color: CAKE.STRAWBERRY_DEEP, roughness: 0.25 }));
  const stalkMat = m(new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 }));
  const candleMat = m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  // Same proxy recipe as the town's booths: invisible to the renderer, still
  // raycastable, and sized to swallow the whole stand plus any stack on it.
  const hitMat = m(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));

  interface StandRig {
    plateMat: TStdMat;
    plate: TMesh;
    rimRing: TMesh;
    rimMat: THREE_T.MeshBasicMaterial;
    flame: TMesh;
    flameMat: TStdMat;
    haloMat: THREE_T.SpriteMaterial;
    hit: TMesh;
    /** 0 = unlit, 1 = a legal target for the held layer. Eased each frame. */
    lit: number;
    litTarget: number;
    /** Reduced-motion illegal feedback: rose rim, decays over 200ms. */
    flash: number;
    /** Plate dip on an empty tap — the one press that has nothing else to do. */
    dip: number;
  }
  const stands: StandRig[] = [];

  for (let i = 0; i < 3; i++) {
    const x = STAND_X[i];

    // Doily on the counter, scalloped like the crane's.
    const doily = new THREE.Mesh(doilyGeo, doilyMat);
    doily.position.set(x, 0.025, 0);
    doily.receiveShadow = true;
    scene.add(doily);
    for (let b = 0; b < 14; b++) {
      const a = (b / 14) * Math.PI * 2;
      const bead = new THREE.Mesh(beadGeo, doilyMat);
      bead.position.set(x + Math.cos(a) * 1.95, 0.03, Math.sin(a) * 1.95);
      bead.scale.y = 0.4;
      scene.add(bead);
    }

    const foot = new THREE.Mesh(footGeo, standMat);
    foot.position.set(x, 0.07, 0);
    foot.castShadow = true; foot.receiveShadow = true;
    scene.add(foot);
    const stem = new THREE.Mesh(stemGeo, standMat);
    stem.position.set(x, 0.415, 0);
    stem.castShadow = true;
    scene.add(stem);

    const plateMat = m(new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.3, metalness: 0.05, emissive: 0xffffff, emissiveIntensity: 0,
    }));
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(x, PLATE_TOP - 0.06, 0);
    plate.castShadow = true; plate.receiveShadow = true;
    scene.add(plate);

    // Rim ring: warm when the stand is a legal target, rose for the
    // reduced-motion "no", invisible otherwise.
    const rimMat = m(new THREE.MeshBasicMaterial({ color: WORLD.GLOW_WARM, transparent: true, opacity: 0, depthWrite: false }));
    const rimRing = new THREE.Mesh(rimRingGeo, rimMat);
    rimRing.rotation.x = -Math.PI / 2;
    rimRing.position.set(x, PLATE_TOP + 0.01, 0);
    scene.add(rimRing);

    // Cherry finial on the plate rim — the signature the chess king and the
    // victory cup wear. Front-left, away from the candle.
    const cherry = new THREE.Mesh(cherryGeo, cherryMat);
    cherry.position.set(x - 1.05, PLATE_TOP + 0.1, 1.0);
    cherry.castShadow = true;
    scene.add(cherry);
    const stalk = new THREE.Mesh(stalkGeo, stalkMat);
    stalk.position.set(x - 1.03, PLATE_TOP + 0.24, 1.0);
    stalk.rotation.z = -0.3;
    scene.add(stalk);

    // Candle: unlit at rest, lit only when this stand will take the held
    // layer. Back-RIGHT of the plate rather than dead behind it: a sight-line
    // check from the fixed camera shows the two widest layers (which only
    // ever sit at the bottom) are the only ones whose projection crosses
    // this spot, and they are far below the flame — so the candle stays
    // visible behind an eight-layer stack, where a candle straight behind
    // would be hidden at five.
    const cx = x + 1.15;
    const cz = -0.9;
    const candle = new THREE.Mesh(candleGeo, candleMat);
    candle.position.set(cx, PLATE_TOP + 0.45, cz);
    candle.castShadow = true;
    scene.add(candle);
    const flameMat = m(new THREE.MeshStandardMaterial({
      color: CAKE.AMBER, roughness: 0.4, emissive: CAKE.AMBER, emissiveIntensity: 0,
    }));
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.set(cx, PLATE_TOP + 0.98, cz);
    flame.scale.setScalar(0.001);
    scene.add(flame);
    const halo = glowSprite(THREE, WORLD.GLOW_WARM, 0.9, 0);
    texs.push(halo.tex); mats.push(halo.mat);
    halo.sprite.position.set(cx, PLATE_TOP + 1.02, cz);
    scene.add(halo.sprite);

    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.scale.set(3.2, 5.2, 3.2);
    hit.position.set(x, 2.4, 0);
    hit.userData.stand = i;
    scene.add(hit);

    stands.push({
      plateMat, plate, rimRing, rimMat, flame, flameMat, haloMat: halo.mat, hit,
      lit: 0, litTarget: 0, flash: 0, dip: 0,
    });
  }

  // ---------- the layers ----------
  const capMatTemplate = frostingMat(THREE);
  mats.push(capMatTemplate);
  const layers: Layer[] = [];
  const bodyGeos: TGeometry[] = [];
  const capGeos: TGeometry[] = [];
  const dripGeos: TGeometry[] = [];
  for (let size = 1; size <= n; size++) {
    const r = radiusOf(size);
    // The slight taper is what makes a layer read baked rather than machined.
    const bodyGeo = g(new THREE.CylinderGeometry(r * 0.97, r, LAYER_H, 40));
    const capGeo = g(new THREE.CylinderGeometry(r * 0.99, r * 0.99, CAP_H, 40));
    // The drip torus at the cap's rim is the single detail that turns a
    // cylinder into a cake.
    const dripGeo = g(new THREE.TorusGeometry(r * 0.99, 0.055, 8, 36));
    bodyGeos.push(bodyGeo); capGeos.push(capGeo); dripGeos.push(dripGeo);

    // Matte, not candyMat: cake should not be boiled-sweet glossy. The
    // frosting carries the sheen.
    const bodyMat = m(new THREE.MeshStandardMaterial({ color: tierColors[size - 1], roughness: 0.5 }));
    const capMat = capMatTemplate.clone();
    mats.push(capMat);

    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true; body.receiveShadow = true;
    group.add(body);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = LAYER_H / 2 + CAP_H / 2;
    cap.castShadow = true;
    group.add(cap);
    const drip = new THREE.Mesh(dripGeo, capMat);
    drip.rotation.x = Math.PI / 2;
    drip.position.y = LAYER_H / 2 + CAP_H / 2;
    group.add(drip);
    scene.add(group);
    layers.push({ size, r, group, bodyMat, capMat, alpha: 1 });
  }
  const layerOf = (size: number): Layer => layers[size - 1];

  // Sprinkles: ONE InstancedMesh for every layer's sprinkles, matrices baked
  // relative to their layer and rewritten whenever a layer moves. Eighty
  // matrix writes on a move is free; eighty meshes is not, on a tablet.
  const sprinkleGeo = g(new THREE.BoxGeometry(0.03, 0.09, 0.03));
  const sprinkleMat = m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  const sprinkles = new THREE.InstancedMesh(sprinkleGeo, sprinkleMat, n * SPRINKLES_PER);
  sprinkles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const sprinkleLocal: THREE_T.Matrix4[] = [];
  {
    const tmpColor = new THREE.Color();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const eul = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    for (let li = 0; li < n; li++) {
      const L = layers[li];
      for (let s = 0; s < SPRINKLES_PER; s++) {
        const idx = li * SPRINKLES_PER + s;
        const seed = L.size * 97 + s * 13;
        const a = hash(seed) * Math.PI * 2;
        const rad = L.r * 0.92 * (0.2 + 0.72 * hash(seed + 1));
        pos.set(Math.cos(a) * rad, LAYER_H / 2 + CAP_H + 0.012, Math.sin(a) * rad);
        // Lying flat on the frosting, pointing any which way.
        eul.set(Math.PI / 2, hash(seed + 2) * Math.PI, 0);
        quat.setFromEuler(eul);
        const local = new THREE.Matrix4().compose(pos, quat, one);
        sprinkleLocal.push(local);
        tmpColor.setHex(SPRINKLE_COLORS[(L.size + s) % SPRINKLE_COLORS.length]);
        sprinkles.setColorAt(idx, tmpColor);
      }
    }
    if (sprinkles.instanceColor) sprinkles.instanceColor.needsUpdate = true;
  }
  scene.add(sprinkles);
  let sprinklesDirty = true;
  const tmpM = new THREE.Matrix4();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  function writeSprinkles(): void {
    for (let li = 0; li < n; li++) {
      const L = layers[li];
      L.group.updateMatrixWorld(true);
      for (let s = 0; s < SPRINKLES_PER; s++) {
        const idx = li * SPRINKLES_PER + s;
        tmpM.multiplyMatrices(L.group.matrixWorld, sprinkleLocal[idx]);
        if (L.alpha < 1) {
          // Shrink with the layer during a crossfade — instances cannot fade.
          tmpM.decompose(tmpPos, tmpQuat, tmpScale);
          tmpScale.multiplyScalar(Math.max(0.001, L.alpha));
          tmpM.compose(tmpPos, tmpQuat, tmpScale);
        }
        sprinkles.setMatrixAt(idx, tmpM);
      }
    }
    sprinkles.instanceMatrix.needsUpdate = true;
    sprinklesDirty = false;
  }

  // Hover glow under a held layer.
  const heldGlow = glowSprite(THREE, WORLD.GLOW_WARM, 1.6, 0);
  texs.push(heldGlow.tex); mats.push(heldGlow.mat);
  scene.add(heldGlow.sprite);

  // Landing blink for reduced motion — the squash's non-motion stand-in.
  const landGlow = glowSprite(THREE, WORLD.GLOW_WARM, 2.2, 0);
  texs.push(landGlow.tex); mats.push(landGlow.mat);
  scene.add(landGlow.sprite);

  // Hint ghost: one body + cap whose geometry is swapped per hint.
  const ghostBodyMat = m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, transparent: true, opacity: 0, depthWrite: false }));
  const ghostCapMat = m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34, transparent: true, opacity: 0, depthWrite: false }));
  const ghost = new THREE.Group();
  const ghostBody = new THREE.Mesh(bodyGeos[0], ghostBodyMat);
  const ghostCap = new THREE.Mesh(capGeos[0], ghostCapMat);
  ghostCap.position.y = LAYER_H / 2 + CAP_H / 2;
  ghost.add(ghostBody); ghost.add(ghostCap);
  ghost.visible = false;
  scene.add(ghost);

  // Win candle on top of the finished cake. Built now, shown on the win.
  const topCandle = new THREE.Group();
  {
    const c = new THREE.Mesh(candleGeo, candleMat);
    c.scale.set(1.4, 0.7, 1.4);
    c.position.y = 0.315;
    c.castShadow = true;
    topCandle.add(c);
  }
  const topFlameMat = m(new THREE.MeshStandardMaterial({ color: CAKE.AMBER, roughness: 0.4, emissive: CAKE.AMBER, emissiveIntensity: 0.9 }));
  const topFlame = new THREE.Mesh(flameGeo, topFlameMat);
  topFlame.scale.setScalar(1.4);
  topFlame.position.y = 0.76;
  topCandle.add(topFlame);
  const topHalo = glowSprite(THREE, WORLD.GLOW_WARM, 1.2, 0.45);
  texs.push(topHalo.tex); mats.push(topHalo.mat);
  topHalo.sprite.position.y = 0.82;
  topCandle.add(topHalo.sprite);
  topCandle.visible = false;
  scene.add(topCandle);

  // Particle pool for landing puffs and the win fountains.
  const particleGeo = g(new THREE.BoxGeometry(0.16, 0.07, 0.07));
  const particleMats = [0xfb7185, 0x6ee7b7, 0xfde68a, 0x93c5fd, 0xffffff].map((c) =>
    m(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  );
  const pool: TMesh[] = [];
  for (let i = 0; i < PARTICLE_POOL; i++) {
    const p = new THREE.Mesh(particleGeo, particleMats[i % particleMats.length]);
    p.visible = false;
    scene.add(p);
    pool.push(p);
  }
  const particles: Particle[] = [];
  function spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, ttl: number, frozen = false): void {
    const mesh = pool.find((p) => !p.visible);
    if (!mesh) return;
    mesh.visible = true;
    mesh.position.set(x, y, z);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    mesh.scale.setScalar(1);
    particles.push({ mesh, vx, vy, vz, spin: (Math.random() - 0.5) * 9, life: 0, ttl, frozen });
  }
  /** Sprinkles puff outward from a contact ring. */
  function puff(x: number, y: number, z: number, r: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      spawn(x + Math.cos(a) * r, y, z + Math.sin(a) * r, Math.cos(a) * 1.6, 1.4 + Math.random(), Math.sin(a) * 1.6, 600 + Math.random() * 250);
    }
  }
  /** A fountain straight up from a point. */
  function fountain(x: number, y: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.6 + Math.random() * 1.2;
      spawn(x, y, z, Math.cos(a) * s, 4.2 + Math.random() * 2.4, Math.sin(a) * s, 900 + Math.random() * 500);
    }
  }
  function stepParticles(dtMs: number): void {
    const s = dtMs / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      if (p.frozen) continue;
      p.life += dtMs;
      if (p.life >= p.ttl) { p.mesh.visible = false; particles.splice(i, 1); continue; }
      p.vy -= 14 * s;
      p.mesh.position.x += p.vx * s;
      p.mesh.position.y += p.vy * s;
      p.mesh.position.z += p.vz * s;
      p.mesh.rotation.z += p.spin * s;
      p.mesh.rotation.x += p.spin * s * 0.6;
      p.mesh.scale.setScalar(0.5 + (1 - p.life / p.ttl) * 0.7);
    }
  }

  // ---------- state ----------
  let state: HanoiState = newGame(n);
  let held: { stand: Stand; size: number } | null = null;
  /** True while a move, bump, settle or the win owns the held layer. Taps
   *  during that are dropped rather than queued — a queue of stale taps is
   *  how a kid ends up with a move they did not mean. */
  let busy = false;
  let over = false;
  let halfwayFired = false;
  const anims: Anim[] = [];
  let bobT = 0;
  /** Where the held layer wants to hover in x: its own stand, or under the
   *  finger during a drag. Eased toward each frame. */
  let hoverX = 0;
  let dragging = false;
  let dragMoved = false;
  let downStand: Stand | null = null;
  let downX = 0;
  let downY = 0;

  const sfx = (name: HanoiSfx): void => cb.onSfx?.(name);

  const restY = (index: number): number => PLATE_TOP + index * PITCH + LAYER_H / 2;
  const restPos = (stand: Stand, index: number): TVec3 => new THREE.Vector3(STAND_X[stand], restY(index), 0);

  function placeAllAtRest(): void {
    for (let s = 0; s < 3; s++) {
      state.stacks[s].forEach((size, index) => {
        const L = layerOf(size);
        L.group.position.set(STAND_X[s], restY(index), 0);
        L.group.rotation.set(0, 0, 0);
        L.group.scale.set(1, 1, 1);
        setAlpha(L, 1);
      });
    }
    sprinklesDirty = true;
  }

  function setAlpha(L: Layer, a: number): void {
    L.alpha = a;
    const solid = a >= 1;
    for (const mat of [L.bodyMat, L.capMat]) {
      mat.transparent = !solid;
      mat.opacity = solid ? 1 : a;
      mat.depthWrite = solid;
    }
  }

  function push(dur: number, update: (k: number) => void, done?: () => void): void {
    anims.push({ t: 0, dur, update, done });
  }

  function lightTargets(from: Stand | null): void {
    for (let s = 0; s < 3; s++) {
      stands[s].litTarget = from !== null && s !== from && canMove(state, from, s as Stand) ? 1 : 0;
    }
  }

  const bezier = (p0: TVec3, p1: TVec3, p2: TVec3, k: number, out: TVec3): TVec3 => {
    const u = 1 - k;
    out.set(
      u * u * p0.x + 2 * u * k * p1.x + k * k * p2.x,
      u * u * p0.y + 2 * u * k * p1.y + k * k * p2.y,
      u * u * p0.z + 2 * u * k * p1.z + k * k * p2.z,
    );
    return out;
  };

  // ---------- beats ----------
  function lift(stand: Stand): void {
    const size = topOf(state, stand);
    if (size === null) {
      // Nothing to pick up. Still a press, so still a response: the plate dips.
      stands[stand].dip = 1;
      sfx('settle');
      return;
    }
    const L = layerOf(size);
    held = { stand, size };
    hoverX = STAND_X[stand];
    lightTargets(stand);
    cb.onHeld(stand);
    sfx('lift');
    const y0 = L.group.position.y;
    if (reduced) {
      L.group.position.y = LIFT_Y;
      heldGlow.mat.opacity = 0.35;
      return;
    }
    push(180, (k) => {
      const e = easeOutCubic(k);
      L.group.position.y = y0 + (LIFT_Y - y0) * e;
      L.group.rotation.z = 0.05 * e;
      heldGlow.mat.opacity = 0.35 * e;
    });
  }

  function settle(then?: () => void): void {
    if (!held) { then?.(); return; }
    const { stand, size } = held;
    const L = layerOf(size);
    const target = restPos(stand, state.stacks[stand].length - 1);
    busy = true;
    lightTargets(null);
    const finish = (): void => {
      L.group.position.copy(target);
      L.group.rotation.z = 0;
      heldGlow.mat.opacity = 0;
      held = null;
      busy = false;
      sprinklesDirty = true;
      cb.onHeld(null);
      sfx('settle');
      then?.();
    };
    if (reduced) { finish(); return; }
    const p0 = L.group.position.clone();
    const r0 = L.group.rotation.z;
    push(160, (k) => {
      const e = easeInQuad(k);
      L.group.position.lerpVectors(p0, target, e);
      L.group.rotation.z = r0 * (1 - e);
      heldGlow.mat.opacity = 0.35 * (1 - e);
    }, finish);
  }

  function commitMove(to: Stand): void {
    if (!held) return;
    const from = held.stand;
    const size = held.size;
    const next = move(state, from, to);
    if (!next) return;
    const L = layerOf(size);
    state = next;
    held = null;
    busy = true;
    lightTargets(null);
    cb.onHeld(null);
    cb.onMove(state);
    const target = restPos(to, state.stacks[to].length - 1);

    const landed = (): void => {
      L.group.position.copy(target);
      L.group.rotation.z = 0;
      L.group.scale.set(1, 1, 1);
      setAlpha(L, 1);
      sprinklesDirty = true;
      if (size === n && to === TARGET_STAND && !halfwayFired) {
        halfwayFired = true;
        cb.onHalfway();
      }
      if (isSolved(state)) { win(); return; }
      busy = false;
    };

    if (reduced) {
      // Position is the information; the travel is decoration. Crossfade:
      // gone from the source, present at the target, and a glow blink to
      // mark the landing instead of the squash.
      heldGlow.mat.opacity = 0;
      push(120, (k) => { setAlpha(L, 1 - k); sprinklesDirty = true; }, () => {
        L.group.position.copy(target);
        L.group.rotation.z = 0;
        landGlow.sprite.position.set(target.x, target.y - LAYER_H / 2 + 0.05, 0);
        sfx('land');
        push(120, (k) => { setAlpha(L, k); sprinklesDirty = true; });
        push(200, (k) => { landGlow.mat.opacity = 0.5 * Math.sin(Math.PI * k); }, () => { landGlow.mat.opacity = 0; });
        push(120, () => undefined, landed);
      });
      return;
    }

    const p0 = L.group.position.clone();
    const p1 = new THREE.Vector3((p0.x + target.x) / 2, LIFT_Y + ARC_APEX, 0);
    const r0 = L.group.rotation.z;
    push(260, (k) => {
      const e = easeInOutSine(k);
      bezier(p0, p1, target, e, L.group.position);
      L.group.rotation.z = r0 * (1 - e);
      heldGlow.mat.opacity = 0.35 * (1 - e);
    }, () => {
      L.group.position.copy(target);
      sfx('land');
      puff(target.x, target.y - LAYER_H / 2, 0, L.r, 6);
      // Squash-and-settle: y 1 → 0.78 → 1.06 → 1, x/z the inverse, 180ms.
      push(180, (k) => {
        let sy: number;
        if (k < 0.4) sy = 1 - 0.22 * (k / 0.4);
        else if (k < 0.75) sy = 0.78 + 0.28 * ((k - 0.4) / 0.35);
        else sy = 1.06 - 0.06 * ((k - 0.75) / 0.25);
        const sxz = 1 + (1 - sy) * 0.55;
        L.group.scale.set(sxz, sy, sxz);
        // Keep the base on the plate while the height changes.
        L.group.position.y = target.y - (LAYER_H / 2) * (1 - sy);
      }, landed);
    });
  }

  function bump(to: Stand): void {
    if (!held) return;
    const from = held.stand;
    const L = layerOf(held.size);
    const underSize = topOf(state, to);
    cb.onIllegal();
    if (reduced) {
      // No wobble. The target rim flashes rose once and Cakey speaks — the
      // feedback must never be motion-only.
      stands[to].flash = 1;
      sfx('wrong');
      return;
    }
    busy = true;
    const p0 = L.group.position.clone();
    const target = restPos(to, state.stacks[to].length);
    const p1 = new THREE.Vector3((p0.x + target.x) / 2, LIFT_Y + ARC_APEX, 0);
    const bumpAt = new THREE.Vector3();
    push(160, (k) => {
      bezier(p0, p1, target, 0.6 * easeOutQuad(k), L.group.position);
    }, () => {
      bumpAt.copy(L.group.position);
      sfx('wrong');
      // The layer it would have crushed flinches.
      if (underSize !== null) {
        const U = layerOf(underSize);
        const uy = U.group.position.y;
        push(200, (k) => {
          const s = k < 0.35 ? 1 - 0.08 * (k / 0.35) : 0.92 + 0.08 * ((k - 0.35) / 0.65);
          U.group.scale.set(1 + (1 - s) * 0.5, s, 1 + (1 - s) * 0.5);
          U.group.position.y = uy - (LAYER_H / 2) * (1 - s);
        }, () => { U.group.scale.set(1, 1, 1); U.group.position.y = uy; sprinklesDirty = true; });
      }
      // Wobble home: three decaying oscillations over 320ms.
      const home = new THREE.Vector3(STAND_X[from], LIFT_Y, 0);
      push(320, (k) => {
        const e = easeInOutSine(k);
        L.group.position.lerpVectors(bumpAt, home, e);
        L.group.rotation.z = 0.12 * Math.sin(k * Math.PI * 6) * (1 - k) + 0.05 * k;
      }, () => {
        L.group.position.copy(home);
        L.group.rotation.z = 0.05;
        hoverX = home.x;
        busy = false;
      });
    });
  }

  function win(): void {
    over = true;
    busy = true;
    lightTargets(null);
    const top = state.stacks[TARGET_STAND].length;
    topCandle.position.set(STAND_X[TARGET_STAND], PLATE_TOP + top * PITCH, 0);
    topCandle.visible = true;
    cb.onWin(state.moves);
    sfx('win');
    const rimY = PLATE_TOP + 0.08;
    if (reduced) {
      // Static end-state: candle lit, halo up, one sprinkle ring held.
      topCandle.scale.set(1, 1, 1);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        spawn(STAND_X[TARGET_STAND] + Math.cos(a) * 1.7, rimY, Math.sin(a) * 1.7, 0, 0, 0, 1, true);
      }
      return;
    }
    topCandle.scale.setScalar(0.001);
    push(300, (k) => { topCandle.scale.setScalar(Math.max(0.001, easeOutBack(k))); });
    const spun = state.stacks[TARGET_STAND].map((size) => layerOf(size));
    let fired = 0;
    push(1200, (k) => {
      const a = Math.PI * 2 * easeInOutCubic(k);
      for (const L of spun) L.group.rotation.y = a;
      topCandle.rotation.y = a;
      sprinklesDirty = true;
      const due = k < 0.3 ? 1 : k < 0.6 ? 2 : 3;
      while (fired < due) {
        const ang = (fired / 3) * Math.PI * 2 + 0.5;
        fountain(STAND_X[TARGET_STAND] + Math.cos(ang) * 1.5, rimY, Math.sin(ang) * 1.5, 12);
        fired += 1;
      }
    }, () => {
      for (const L of spun) L.group.rotation.y = 0;
      topCandle.rotation.y = 0;
      sprinklesDirty = true;
    });
  }

  function showHint(): boolean {
    const nm = nextOptimalMove(state);
    if (!nm) return false;
    const size = topOf(state, nm.from);
    if (size === null) return false;
    const L = layerOf(size);
    ghostBody.geometry = bodyGeos[size - 1];
    ghostCap.geometry = capGeos[size - 1];
    ghostBodyMat.color.copy(L.bodyMat.color);
    const p0 = restPos(nm.from, state.stacks[nm.from].length - 1);
    const p2 = restPos(nm.to, state.stacks[nm.to].length);
    const p1 = new THREE.Vector3((p0.x + p2.x) / 2, LIFT_Y + ARC_APEX, 0);
    ghost.position.copy(p0);
    ghost.visible = true;
    sfx('hint');
    // Ghost lifts, arcs, lands, fades — 900ms, so it reads as a demonstration
    // rather than a flicker. In reduced motion it just appears at the target
    // and fades out there: the destination is the information.
    push(reduced ? 700 : 900, (k) => {
      const fade = k < 0.15 ? k / 0.15 : k > 0.7 ? (1 - k) / 0.3 : 1;
      ghostBodyMat.opacity = 0.35 * fade;
      ghostCapMat.opacity = 0.35 * fade;
      if (reduced) {
        ghost.position.copy(p2);
      } else if (k < 0.2) {
        ghost.position.set(p0.x, p0.y + (LIFT_Y - p0.y) * easeOutCubic(k / 0.2), 0);
      } else {
        const t = Math.min(1, (k - 0.2) / 0.7);
        bezier(new THREE.Vector3(p0.x, LIFT_Y, 0), p1, p2, easeInOutSine(t), ghost.position);
      }
    }, () => { ghost.visible = false; ghostBodyMat.opacity = 0; ghostCapMat.opacity = 0; });
    return true;
  }

  // ---------- input ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = stands.map((s) => s.hit);

  function standAt(clientX: number, clientY: number): Stand | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(hits, false)[0];
    if (hit) return hit.object.userData.stand as Stand;
    // Near miss: a tap on the counter beside a plate still means that plate.
    // Project onto the plate plane and take the nearest stand within reach.
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (PLATE_TOP - o.y) / d.y;
    if (t < 0) return null;
    const x = o.x + d.x * t;
    let best: Stand | null = null;
    let bestD = 2.3;
    for (let s = 0; s < 3; s++) {
      const dx = Math.abs(x - STAND_X[s]);
      if (dx < bestD) { bestD = dx; best = s as Stand; }
    }
    return best;
  }

  /** World x under the pointer at hover height, for the drag path. */
  function hoverXAt(clientX: number, clientY: number): number | null {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (LIFT_Y - o.y) / d.y;
    if (t < 0) return null;
    return Math.max(-4.8, Math.min(4.8, o.x + d.x * t));
  }

  function tapStand(stand: Stand): void {
    if (over || busy) return;
    if (!held) { lift(stand); return; }
    if (held.stand === stand) { settle(); return; }
    if (canMove(state, held.stand, stand)) commitMove(stand);
    else bump(stand);
  }

  const onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (over) return;
    const stand = standAt(e.clientX, e.clientY);
    dragging = true;
    dragMoved = false;
    downStand = stand;
    downX = e.clientX;
    downY = e.clientY;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* not all pointers capture */ }
    if (stand !== null) tapStand(stand);
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging || !held || busy) return;
    if (!dragMoved && Math.hypot(e.clientX - downX, e.clientY - downY) < 12) return;
    dragMoved = true;
    const x = hoverXAt(e.clientX, e.clientY);
    if (x !== null) hoverX = x;
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const stand = standAt(e.clientX, e.clientY);
    if (held) hoverX = STAND_X[held.stand];
    // Tap-tap: the down already lifted (or landed). Drag: released over a
    // different stand than it started on → that is the second tap.
    if (stand !== null && stand !== downStand && held) tapStand(stand);
    downStand = null;
  };
  const onPointerCancel = (): void => {
    dragging = false;
    downStand = null;
    if (held) hoverX = STAND_X[held.stand];
  };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerCancel);

  // ---------- camera ----------
  function resize(): void {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // Whatever the aspect, the three stands (plates out to ±5.15, candles to
    // ±4.75) must fit: widen the vertical FOV until 5.9u of half-width is
    // visible at the look-at distance. Portrait tablets get the pull-back
    // they need; landscape stays at the designed 40°.
    const dist = camera.position.distanceTo(LOOK_AT);
    const needed = (2 * Math.atan(Math.tan(Math.atan(5.9 / dist)) / aspect) * 180) / Math.PI;
    camera.fov = Math.max(40, needed);
    camera.updateProjectionMatrix();
  }
  resize();

  // ---------- frame loop ----------
  let raf = 0;
  let last = performance.now();
  let disposed = false;

  function tick(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dtMs = Math.min(64, now - last);
    last = now;

    // Tweens.
    if (anims.length > 0) {
      for (let i = anims.length - 1; i >= 0; i--) {
        const a = anims[i];
        a.t += dtMs;
        const k = Math.min(1, a.t / a.dur);
        a.update(k);
        if (k >= 1) { anims.splice(i, 1); a.done?.(); }
      }
      sprinklesDirty = true;
    }

    // Held layer: bob, follow the drag, keep the glow underneath.
    if (held && !busy) {
      const L = layerOf(held.size);
      if (anims.length === 0) {
        if (!reduced) {
          bobT += dtMs / 1000;
          L.group.position.y = LIFT_Y + Math.sin(bobT * 4) * 0.07;
        }
        const dx = hoverX - L.group.position.x;
        if (Math.abs(dx) > 0.001) {
          L.group.position.x += dx * Math.min(1, dtMs / 90);
          sprinklesDirty = true;
        }
        if (!reduced) sprinklesDirty = true;
      }
      heldGlow.sprite.position.set(L.group.position.x, L.group.position.y - 0.4, L.group.position.z);
    }

    // Stand affordances: candle + rim ease toward lit/unlit; rose flash and
    // the empty-tap dip decay.
    for (let s = 0; s < 3; s++) {
      const S = stands[s];
      const step = Math.min(1, dtMs / 160);
      S.lit += (S.litTarget - S.lit) * step;
      if (Math.abs(S.litTarget - S.lit) < 0.01) S.lit = S.litTarget;
      const lit = S.lit;
      S.flame.scale.setScalar(Math.max(0.001, lit));
      S.flameMat.emissiveIntensity = 0.8 * lit;
      S.haloMat.opacity = 0.45 * lit;
      S.plateMat.emissiveIntensity = 0.18 * lit;
      if (S.flash > 0) {
        S.flash = Math.max(0, S.flash - dtMs / 200);
        S.rimMat.color.setHex(CAKE.STRAWBERRY_DEEP);
        S.rimMat.opacity = S.flash;
      } else {
        S.rimMat.color.setHex(WORLD.GLOW_WARM);
        S.rimMat.opacity = 0.9 * lit;
      }
      if (S.dip > 0) {
        S.dip = Math.max(0, S.dip - dtMs / 140);
        const d = reduced ? 0 : Math.sin(S.dip * Math.PI) * 0.05;
        S.plate.scale.set(1 - d, 1, 1 - d);
      }
    }

    stepParticles(dtMs);
    if (sprinklesDirty) writeSprinkles();
    renderer.render(scene, camera);
  }

  placeAllAtRest();
  raf = requestAnimationFrame(tick);

  return {
    tapStand,
    hint(): boolean {
      if (over || busy) return false;
      if (held) {
        // Put the held layer down first (free), then show.
        settle(() => { showHint(); });
        return true;
      }
      return showHint();
    },
    reset(): void {
      anims.length = 0;
      for (const p of particles) p.mesh.visible = false;
      particles.length = 0;
      state = newGame(n);
      held = null;
      busy = false;
      over = false;
      halfwayFired = false;
      topCandle.visible = false;
      ghost.visible = false;
      heldGlow.mat.opacity = 0;
      landGlow.mat.opacity = 0;
      lightTargets(null);
      for (const S of stands) { S.flash = 0; S.dip = 0; S.plate.scale.set(1, 1, 1); }
      placeAllAtRest();
      cb.onHeld(null);
      cb.onMove(state);
    },
    resize,
    getState: () => state,
    dispose(): void {
      disposed = true;
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      sprinkles.dispose();
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (const tex of texs) tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
