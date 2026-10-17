// Cakey Crane engine — three.js render + cannon-es physics.
//
// The loop: a cake layer rides the crane back and forth over the tower; the kid
// taps DROP; `resolveDrop` (slab.ts, pure) decides perfect / trim / miss; the
// trimmed offcut becomes a real physics body and tumbles off the plate. Every
// `gateEvery` drops the bakery calls an order check and the engine parks itself
// until the host answers.
//
// Physics is the repo's usual cannon-es world — the same one the Castle and
// Sandcastle games run. It carries the offcuts, the whole-slab fall on a miss,
// and the plate/floor they bounce on; the tower's own layers are STATIC bodies,
// because a tower that can topple on its own would punish a kid for a good drop
// they made ten layers ago.
//
// No runtime `three`/`cannon-es` import — the namespaces arrive as arguments.

import type * as THREE_T from 'three';
import type * as CANNON_T from 'cannon-es';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import {
  axisForLayer,
  pickTin,
  resolveDrop,
  scoreForDrop,
  speedForLayer,
  sweepAt,
  TIN_SIZES,
  type Axis,
  type Slab,
  type TinSize,
} from './slab';
import {
  flavourForLayer,
  type CannonNS,
  type CraneCallbacks,
  type CraneEngine,
  type CraneSceneProps,
  type CraneStats,
  type CraneTuning,
  type ThreeNS,
} from './types';

// Local aliases: inside the factory the `THREE` / `CANNON` parameters shadow
// the type namespaces, so every type position uses these instead.
type TGroup = THREE_T.Group;
type TMesh = THREE_T.Mesh;
type TMaterial = THREE_T.Material;
type TGeometry = THREE_T.BufferGeometry;
type CBody = CANNON_T.Body;

/** Physics tick. */
const FIXED = 1 / 60;
/** How long an offcut sticks around before it is reaped. */
const OFFCUT_TTL_MS = 5000;
/** Camera keeps this much air above the top layer — enough to show the crane
 *  beam and the swinging layer, and no more. Framing the action tightly is what
 *  makes the timing readable; a wide establishing shot of an empty counter
 *  looks pretty and plays badly. */
const CAM_LIFT = 2.9;
const CAM_BACK = 9.4;
/** The camera sits on a CORNER, not square on the front.
 *
 *  This is the difference between a playable game and a guessing game. The
 *  crane alternates axes every layer, so half of all sweeps run toward and away
 *  from the camera — and from a front-on view that motion is pure depth, which
 *  a six-year-old cannot judge. From 45° both axes read as diagonal travel
 *  across the screen, at the same apparent speed. It is why every game in this
 *  genre uses this angle. */
const CAM_ANGLE = Math.PI / 4;
/** Clearance between the swinging layer and the tower top. */
const HOVER = 0.5;

interface Layer {
  slab: Slab;
  y: number;
  group: TGroup;
  body: CBody;
}

interface Offcut {
  group: TGroup;
  body: CBody;
  age: number;
}

interface Particle {
  mesh: TMesh;
  vx: number; vy: number; vz: number;
  spin: number;
  life: number;
  ttl: number;
}

export function createCakeyCraneEngine(
  THREE: ThreeNS,
  CANNON: CannonNS,
  container: HTMLElement,
  props: CraneSceneProps,
  tuning: CraneTuning,
  cb: CraneCallbacks,
): CraneEngine {
  const reduced = props.reducedMotion === true;

  // ---------- renderer ----------
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
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe9f1);      // warm bakery pink, not sky blue
  scene.fog = new THREE.Fog(0xffe9f1, 26, 70);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(42, w0 / h0, 0.1, 140);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf5d8c0, 0.6));
  const sun = new THREE.DirectionalLight(0xfff6e8, 1.35);
  sun.position.set(-7, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 14; sun.shadow.camera.bottom = -6;
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

  // ---------- physics ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -tuning.gravity, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON_T.GSSolver).iterations = 10;
  const groundMat = new CANNON.Material('ground');
  const cakeMat = new CANNON.Material('cake');
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, cakeMat, { friction: 0.6, restitution: 0.12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(cakeMat, cakeMat, { friction: 0.7, restitution: 0.05 }));

  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // ---------- the counter + plate ----------
  const boxGeo = g(new THREE.BoxGeometry(1, 1, 1));
  const counterMat = m(new THREE.MeshStandardMaterial({ color: 0xf6e3cf, roughness: 0.95 }));
  const counter = new THREE.Mesh(g(new THREE.CircleGeometry(11, 40)), counterMat);
  counter.rotation.x = -Math.PI / 2;
  counter.receiveShadow = true;
  scene.add(counter);
  // Marble rim, so the counter has an edge instead of fading into the fog.
  const rimMat = m(new THREE.MeshStandardMaterial({ color: 0xe6cdb2, roughness: 0.7 }));
  const counterRim = new THREE.Mesh(g(new THREE.TorusGeometry(11, 0.22, 8, 48)), rimMat);
  counterRim.rotation.x = -Math.PI / 2;
  counterRim.position.y = 0.02;
  scene.add(counterRim);

  // Cake stand — lifts the first layer off the counter so the tower reads as a
  // display cake rather than a pile on a table.
  const standMat = m(new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.45 }));
  const standStem = new THREE.Mesh(g(new THREE.CylinderGeometry(0.42, 0.7, 0.7, 20)), standMat);
  standStem.position.y = 0.35;
  standStem.castShadow = true; standStem.receiveShadow = true;
  scene.add(standStem);

  // Paper doily under the plate: a disc plus scalloped beads round the rim.
  const doilyMat = m(new THREE.MeshStandardMaterial({ color: 0xfffdf8, roughness: 0.9 }));
  const doilyR = tuning.slabSize * 0.86;
  const doily = new THREE.Mesh(g(new THREE.CylinderGeometry(doilyR, doilyR, 0.05, 40)), doilyMat);
  doily.position.y = 0.72;
  doily.receiveShadow = true;
  scene.add(doily);
  const scallopGeo = g(new THREE.SphereGeometry(0.13, 8, 6));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const bead = new THREE.Mesh(scallopGeo, doilyMat);
    bead.position.set(Math.cos(a) * doilyR, 0.72, Math.sin(a) * doilyR);
    bead.scale.y = 0.4;
    scene.add(bead);
  }

  const plateMat = m(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.05 }));
  // Sized to the cake rather than to the pan: at 0.95× the full tin the stand
  // dwarfed a petit-four opening layer and the shot read as a plate with a
  // crumb on it.
  const plate = new THREE.Mesh(g(new THREE.CylinderGeometry(tuning.slabSize * 0.7, tuning.slabSize * 0.76, 0.3, 36)), plateMat);
  plate.position.y = 0.85;
  plate.castShadow = true; plate.receiveShadow = true;
  scene.add(plate);
  const plateBody = new CANNON.Body({ mass: 0, material: groundMat });
  plateBody.addShape(new CANNON.Cylinder(tuning.slabSize * 0.7, tuning.slabSize * 0.76, 0.3, 14));
  plateBody.position.set(0, 0.85, 0);
  world.addBody(plateBody);

  // ---------- bakery dressing ----------
  // A polka-dot wall behind the counter plus a couple of oversized props. They
  // only read for the first few layers before the camera climbs past them, but
  // those first few seconds are where a kid decides what this place IS.
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g2 = c.getContext('2d');
    if (g2) {
      g2.fillStyle = '#ffdce8'; g2.fillRect(0, 0, 128, 128);
      g2.fillStyle = '#f7b6cd';
      for (const [dx, dy] of [[32, 32], [96, 96], [96, 32], [32, 96]] as const) {
        g2.beginPath(); g2.arc(dx, dy, 9, 0, Math.PI * 2); g2.fill();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(14, 22);
    texs.push(t);
    return t;
  })();
  const wallMat = m(new THREE.MeshStandardMaterial({ map: dotTex, roughness: 1 }));
  const wall = new THREE.Mesh(g(new THREE.PlaneGeometry(56, 90)), wallMat);
  wall.position.set(0, 30, -17);
  scene.add(wall);

  const macaronMats = [0xf9a8d4, 0xa7f3d0, 0xfde68a].map((c) =>
    m(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  );
  const macaronGeo = g(new THREE.CylinderGeometry(0.9, 0.9, 0.34, 20));
  const creamGeo = g(new THREE.CylinderGeometry(0.82, 0.82, 0.18, 20));
  const creamMat = m(new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 }));
  for (let i = 0; i < 3; i++) {
    const stack = new THREE.Group();
    for (let j = 0; j < 2; j++) {
      const shell = new THREE.Mesh(macaronGeo, macaronMats[(i + j) % 3]);
      shell.position.y = 0.17 + j * 0.52;
      shell.castShadow = true; shell.receiveShadow = true;
      stack.add(shell);
    }
    const cream = new THREE.Mesh(creamGeo, creamMat);
    cream.position.y = 0.43;
    stack.add(cream);
    // Flanking the stand rather than lined up behind it, so they read as a
    // bakery counter instead of a queue hiding behind the cake.
    stack.position.set(i === 0 ? -7.6 : 6.4 + (i - 1) * 2, 0, i === 0 ? -5.4 : -6.2);
    scene.add(stack);
  }

  // Sprinkle jar — a glass cylinder with a lid and coloured grains inside.
  const jarMat = m(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.42,
  }));
  const jar = new THREE.Mesh(g(new THREE.CylinderGeometry(0.8, 0.8, 1.9, 22)), jarMat);
  jar.position.set(-7.4, 0.95, -1.6);
  scene.add(jar);
  const lidMat = m(new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.4 }));
  const lid = new THREE.Mesh(g(new THREE.CylinderGeometry(0.88, 0.88, 0.26, 22)), lidMat);
  lid.position.set(-7.4, 2.02, -1.6);
  lid.castShadow = true;
  scene.add(lid);

  // ---------- the crane ----------
  const craneGroup = new THREE.Group();
  scene.add(craneGroup);
  // The beam is a CANDY CANE — alternating red and cream segments — rather than
  // a plain girder. It is the biggest object on screen after the cake, so it is
  // the piece of set dressing that decides whether this reads as a bakery or as
  // a construction site.
  const beamRedMat = m(new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.4 }));
  // Butterscotch, not white: the first pass used a cream so close to the
  // backdrop that the stripes disappeared and the beam read as a row of
  // floating red blocks.
  const beamCreamMat = m(new THREE.MeshStandardMaterial({ color: 0xffd9a0, roughness: 0.4 }));
  const beamLen = tuning.sweep * 2 + 2.4;
  const beam = new THREE.Group();
  const SEGMENTS = 11;
  for (let i = 0; i < SEGMENTS; i++) {
    const seg = new THREE.Mesh(boxGeo, i % 2 === 0 ? beamRedMat : beamCreamMat);
    seg.scale.set(beamLen / SEGMENTS, 0.26, 0.34);
    seg.position.x = -beamLen / 2 + (i + 0.5) * (beamLen / SEGMENTS);
    seg.castShadow = true;
    beam.add(seg);
  }
  const capGeo = g(new THREE.SphereGeometry(0.2, 10, 8));
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(capGeo, beamRedMat);
    cap.position.x = side * (beamLen / 2);
    cap.castShadow = true;
    beam.add(cap);
  }
  craneGroup.add(beam);

  const cableMat = m(new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.8 }));
  const cable = new THREE.Mesh(boxGeo, cableMat);
  cable.scale.set(0.07, 1, 0.07);
  craneGroup.add(cable);

  // The hook is a piping bag: a cream cone with a gold nozzle, holding the tin.
  const hook = new THREE.Group();
  const bagMat = m(new THREE.MeshStandardMaterial({ color: 0xf9a8d4, roughness: 0.55 }));
  const bag = new THREE.Mesh(g(new THREE.ConeGeometry(0.34, 0.62, 14)), bagMat);
  bag.rotation.x = Math.PI;              // point the nozzle down at the tin
  bag.position.y = 0.34;
  bag.castShadow = true;
  hook.add(bag);
  const nozzleMat = m(new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3, metalness: 0.25 }));
  const nozzle = new THREE.Mesh(g(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 12)), nozzleMat);
  nozzle.position.y = 0.03;
  nozzle.castShadow = true;
  hook.add(nozzle);
  craneGroup.add(hook);

  // ---------- decoration assets ----------
  const sprinkleGeo = g(new THREE.BoxGeometry(0.16, 0.07, 0.07));
  const sprinkleMats = [0xfb7185, 0x6ee7b7, 0xfde68a, 0x93c5fd, 0xffffff].map((c) =>
    m(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 })),
  );
  const pillarGeo = g(new THREE.CylinderGeometry(0.07, 0.07, tuning.layerH, 8));
  /** Unit height of the drip capsule; drips scale off this. */
  const DRIP_UNIT = 0.4;
  const dripGeo = g(new THREE.CapsuleGeometry(0.085, DRIP_UNIT, 4, 8));
  const pillarMat = m(new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: 0.45 }));

  // ---------- layer construction ----------
  const flavourMats = new Map<number, { body: TMaterial; frosting: TMaterial }>();
  function matsFor(layer: number) {
    const idx = layer % 7;
    let entry = flavourMats.get(idx);
    if (!entry) {
      const f = flavourForLayer(idx);
      entry = {
        body: m(new THREE.MeshStandardMaterial({ color: f.body, roughness: 0.5 })),
        frosting: m(new THREE.MeshStandardMaterial({ color: f.frosting, roughness: 0.35 })),
      };
      flavourMats.set(idx, entry);
    }
    return entry;
  }

  /** Deterministic 0..1 noise. Layers are rebuilt whenever the crane re-arms,
   *  so the decoration has to land in the same place every time or the cake
   *  shimmers. Seeded off (layer, index) instead of Math.random. */
  function wobble(seed: number): number {
    const v = Math.sin(seed * 127.1) * 43758.5453;
    return v - Math.floor(v);
  }

  /** A cake layer: sponge, a frosting slab inset on top, frosting drips over
   *  the two camera-facing edges, and a few sprinkles. The drips are what make
   *  it read as CAKE at a glance rather than as a coloured box with a lid —
   *  they are the silhouette cue, so they hang over the corners where the
   *  outline is actually visible. */
  function buildLayerMesh(slab: Slab, layer: number): TGroup {
    const { body, frosting } = matsFor(layer);
    const group = new THREE.Group();

    const sponge = new THREE.Mesh(boxGeo, body);
    sponge.scale.set(slab.w, tuning.layerH, slab.d);
    sponge.castShadow = true; sponge.receiveShadow = true;
    group.add(sponge);

    // INSET, not proud: from the 45° camera you mostly see each layer's TOP
    // face, so a frosting slab that covered it edge-to-edge hid the flavour
    // colour and the whole cake read as a stack of white boxes.
    const ice = new THREE.Mesh(boxGeo, frosting);
    ice.scale.set(slab.w * 0.84, tuning.layerH * 0.22, slab.d * 0.84);
    ice.position.y = tuning.layerH * 0.48;
    ice.castShadow = true;
    group.add(ice);

    // Frosting rim around the top edge — the lip the drips run off. Thin enough
    // that it never covers the flavour on the top face.
    const rim = new THREE.Mesh(boxGeo, frosting);
    rim.scale.set(slab.w * 1.05, tuning.layerH * 0.16, slab.d * 1.05);
    rim.position.y = tuning.layerH * 0.4;
    group.add(rim);

    // Drips down the +x and +z faces (the two the camera sees), as ROUNDED
    // capsules hanging off the rim. The first pass drew them as flat boxes on
    // the face and the cake read as a bus with windows — a drip is only a drip
    // if it has a round bottom and hangs past the edge.
    for (let i = 0; i < 2; i++) {
      const t = (i + 0.5) / 2;
      const long = tuning.layerH * (0.3 + wobble(layer * 9 + i) * 0.3);
      const topY = tuning.layerH * 0.4;

      const dx = new THREE.Mesh(dripGeo, frosting);
      dx.scale.set(1, long / DRIP_UNIT, 1);
      dx.position.set(slab.w / 2 + 0.01, topY - long / 2, (t - 0.5) * slab.d * 0.7);
      group.add(dx);

      const dz = new THREE.Mesh(dripGeo, frosting);
      dz.scale.set(1, long / DRIP_UNIT, 1);
      dz.position.set((t - 0.5) * slab.w * 0.7, topY - long / 2, slab.d / 2 + 0.01);
      group.add(dz);
    }

    // Sprinkles on the frosting. Tiny, unlit by shadows — decoration must never
    // cost a shadow-map pass on a tablet.
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(sprinkleGeo, sprinkleMats[(layer + i) % sprinkleMats.length]);
      s.position.set(
        (wobble(layer * 31 + i) - 0.5) * slab.w * 0.6,
        tuning.layerH * 0.56,
        (wobble(layer * 57 + i * 3) - 0.5) * slab.d * 0.6,
      );
      s.rotation.y = wobble(layer * 13 + i) * Math.PI;
      s.scale.setScalar(0.8);
      group.add(s);
    }

    return group;
  }

  /** Candy-stick dowels under a layer that overhangs the one below it. Real
   *  tiered cakes are held up this way, and without them a wide layer landing
   *  on a petit four reads as floating. */
  function buildPillars(landed: Slab, prev: Slab): TMesh[] {
    const out: TMesh[] = [];
    const dx = Math.max(0, (landed.w - prev.w) / 2);
    const dz = Math.max(0, (landed.d - prev.d) / 2);
    if (dx < 0.08 && dz < 0.08) return out;
    const px = landed.w / 2 - 0.16;
    const pz = landed.d / 2 - 0.16;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const stick = new THREE.Mesh(pillarGeo, pillarMat);
        stick.position.set(sx * px, -tuning.layerH, sz * pz);
        stick.castShadow = true;
        out.push(stick);
      }
    }
    return out;
  }

  function layerBody(slab: Slab, y: number, mass: number): CBody {
    const b = new CANNON.Body({
      mass,
      material: cakeMat,
      shape: new CANNON.Box(new CANNON.Vec3(slab.w / 2, tuning.layerH / 2, slab.d / 2)),
    });
    b.position.set(slab.x, y, slab.z);
    return b;
  }

  // ---------- state ----------
  const PLATE_TOP = 1.0;   // stand (0.7) + plate slab (0.3)
  const layers: Layer[] = [];
  const offcuts: Offcut[] = [];
  const particles: Particle[] = [];

  let dropIndex = 0;                 // how many layers are ON the tower
  let dropsMade = 0;                 // how many drops the kid has taken
  let score = 0;
  let combo = 0;
  let bestCombo = 0;
  let perfects = 0;
  let lives = tuning.lives;
  let over = false;
  let paused = true;                 // the host un-pauses once mounted
  let gateOpen = false;
  let timeLeftMs = getSessionDurationMs();
  let timeReportAcc = 0;
  let lastSecond = Math.ceil(timeLeftMs / 1000);

  /** What the next tin lands ON. Tracked separately from the drawn layers
   *  because a small tin that lands inside the cake leaves the rim below
   *  exposed — the cake keeps its width even though the new layer is narrow.
   *  See the footprint rule in slab.ts. */
  let footprint: Slab = { x: 0, z: 0, w: tuning.slabSize, d: tuning.slabSize };
  /** The tin the crane is carrying right now — one of the four sizes. */
  let tin: TinSize = TIN_SIZES[0];
  /** The slab that tin describes, in world units, ready to drop. */
  let carriedSlab: Slab = { x: 0, z: 0, w: tuning.slabSize, d: tuning.slabSize };
  let cleanDrops = 0;
  let sweepT = 0;
  let axis: Axis = 'x';
  let camY = CAM_LIFT;

  const sfx = (n: Parameters<NonNullable<CraneCallbacks['onSfx']>>[0]): void => cb.onSfx?.(n);

  const topLayer = (): Layer | null => (layers.length > 0 ? layers[layers.length - 1] : null);
  const towerTopY = (): number => PLATE_TOP + layers.length * tuning.layerH;
  /** The slab the next drop lands on. */
  const landingSlab = (): Slab => footprint;

  /** Size the carried slab from the tin.
   *
   *  The MOVING axis gets the tin's own size — that is the whole point of the
   *  four tins. The other axis is clamped to the cake, so a layer can only ever
   *  overhang along the axis the kid is actually aiming; overhang on the axis
   *  they have no control over would be a coin flip. */
  function fitTinToAxis(size: number): Slab {
    return axis === 'x'
      ? { x: footprint.x, z: footprint.z, w: size, d: Math.min(size, footprint.d) }
      : { x: footprint.x, z: footprint.z, w: Math.min(size, footprint.w), d: size };
  }

  // The moving layer, built fresh each time so it always matches the tin.
  let carried = buildLayerMesh(carriedSlab, 0);
  scene.add(carried);

  /** Pull the next tin off the rack and hang it on the crane. */
  function loadTin(): void {
    const along = axis === 'x' ? footprint.w : footprint.d;
    tin = pickTin(Math.random, along, tuning.maxSize);
    carriedSlab = fitTinToAxis(Math.min(tuning.maxSize, tuning.maxSize * tin.factor));
    scene.remove(carried);
    carried = buildLayerMesh(carriedSlab, dropIndex);
    scene.add(carried);
    cb.onTin(tin);
  }

  function craneSpeed(): number {
    return speedForLayer(dropIndex, tuning.speedBase, tuning.speedGrowth, tuning.speedMax);
  }

  // ---------- effects ----------

  function burst(x: number, y: number, z: number, count: number): void {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(sprinkleGeo, sprinkleMats[i % sprinkleMats.length]);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      scene.add(mesh);
      const ang = Math.random() * Math.PI * 2;
      particles.push({
        mesh,
        vx: Math.cos(ang) * (1.4 + Math.random() * 2.2),
        vy: 3.4 + Math.random() * 3,
        vz: Math.sin(ang) * (1.4 + Math.random() * 2.2),
        spin: (Math.random() - 0.5) * 9,
        life: 0,
        ttl: 900 + Math.random() * 500,
      });
    }
    if (particles.length > 160) {
      const extra = particles.splice(0, particles.length - 160);
      for (const p of extra) scene.remove(p.mesh);
    }
  }

  function stepParticles(dtMs: number): void {
    const s = dtMs / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dtMs;
      if (p.life >= p.ttl) { scene.remove(p.mesh); particles.splice(i, 1); continue; }
      p.vy -= 14 * s;
      p.mesh.position.x += p.vx * s;
      p.mesh.position.y += p.vy * s;
      p.mesh.position.z += p.vz * s;
      p.mesh.rotation.z += p.spin * s;
      p.mesh.rotation.x += p.spin * s * 0.6;
      const fade = 1 - p.life / p.ttl;
      p.mesh.scale.setScalar(0.6 + fade * 0.6);
    }
  }

  // ---------- dropping ----------
  function spawnOffcut(slab: Slab, y: number, awayFrom: number): void {
    const group = buildLayerMesh(slab, dropIndex);
    group.position.set(slab.x, y, slab.z);
    scene.add(group);
    const body = layerBody(slab, y, Math.max(0.4, slab.w * slab.d));
    // Nudge it off the tower so it clearly falls AWAY rather than through.
    const push = Math.sign(awayFrom) || 1;
    if (axis === 'x') body.velocity.set(push * 1.9, 0.4, 0);
    else body.velocity.set(0, 0.4, push * 1.9);
    body.angularVelocity.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4);
    world.addBody(body);
    offcuts.push({ group, body, age: 0 });
  }

  function openGate(): void {
    gateOpen = true;
    paused = true;
    sfx('gate');
    cb.onGate(dropsMade);
  }

  function endRound(reason: 'timeup' | 'lose'): void {
    if (over) return;
    over = true;
    paused = true;
    gateOpen = false;
    scene.remove(carried);
    craneGroup.visible = false;
    // Cherry on top — the run's trophy, and the reason the last layer is worth
    // looking at on the end card.
    const top = topLayer();
    if (top) {
      const cherry = new THREE.Mesh(
        g(new THREE.SphereGeometry(0.24, 16, 12)),
        m(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.25 })),
      );
      cherry.position.set(top.slab.x, top.y + tuning.layerH * 0.7, top.slab.z);
      cherry.castShadow = true;
      scene.add(cherry);
      const stem = new THREE.Mesh(boxGeo, m(new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.7 })));
      stem.scale.set(0.05, 0.3, 0.05);
      stem.position.set(top.slab.x, top.y + tuning.layerH * 0.7 + 0.24, top.slab.z);
      scene.add(stem);
      burst(top.slab.x, top.y + 0.6, top.slab.z, 16);
    }
    sfx(reason === 'lose' ? 'lose' : 'win');
    cb.onRoundEnd(reason);
  }

  function drop(): void {
    if (paused || over || gateOpen) return;

    const below = landingSlab();
    const moving: Slab = axis === 'x'
      ? { ...carriedSlab, x: carried.position.x, z: below.z }
      : { ...carriedSlab, x: below.x, z: carried.position.z };
    const y = towerTopY() + tuning.layerH / 2;

    const result = resolveDrop(below, moving, axis, tuning);
    dropsMade += 1;
    sfx('drop');

    if (result.outcome === 'miss') {
      // The whole layer misses the tower and falls. It costs a life — and the
      // baker PATCHES the next layer a little wider.
      //
      // That patch is the difference between a game and a trap. Trimming is
      // one-way, so a single wild drop leaves a sliver that cannot realistically
      // be landed on, and the run is already over three lives before the HUD
      // says so. A headless playtest of random taps died exactly that way every
      // time. Losing a life is the price of a miss; being handed unplayable
      // material is not.
      spawnOffcut(moving, y, result.offset);
      footprint = {
        ...footprint,
        w: Math.min(tuning.maxSize, footprint.w + tuning.gateReward),
        d: Math.min(tuning.maxSize, footprint.d + tuning.gateReward),
      };
      combo = 0;
      cb.onCombo(0);
      lives -= 1;
      cb.onLives(lives);
      sfx('miss');
      if (lives <= 0) { endRound('lose'); return; }
      afterDrop();
      return;
    }

    const landed = result.landed!;
    const prev = topLayer();
    const group = buildLayerMesh(landed, dropIndex);
    group.position.set(landed.x, y, landed.z);
    scene.add(group);
    // A layer wider than the one under it is resting on the exposed rim below —
    // exactly what a real tiered cake uses dowels for. Candy sticks make that
    // support visible instead of leaving the layer looking like it floats.
    if (prev && (landed.w > prev.slab.w + 0.05 || landed.d > prev.slab.d + 0.05)) {
      group.add(...buildPillars(landed, prev.slab));
    }
    const body = layerBody(landed, y, 0);          // static: the tower never topples
    world.addBody(body);
    layers.push({ slab: landed, y, group, body });

    if (result.outcome === 'perfect') {
      perfects += 1;
      cleanDrops += 1;
      combo += 1;
      bestCombo = Math.max(bestCombo, combo);
      cb.onCombo(combo);
      sfx(combo >= 2 ? 'combo' : 'perfect');
      burst(landed.x, y + 0.4, landed.z, combo >= 3 ? 18 : 10);
    } else if (result.outcome === 'fit') {
      // Landed wholly on the cake: no damage, no streak. Worth the tin's
      // multiplier, so a small tin placed carefully still pays.
      cleanDrops += 1;
      combo = 0;
      cb.onCombo(0);
      sfx('fit');
      burst(landed.x, y + 0.35, landed.z, 5);
    } else {
      combo = 0;
      cb.onCombo(0);
      sfx('trim');
      for (const cut of result.offcuts) {
        spawnOffcut(cut, y, (axis === 'x' ? cut.x - landed.x : cut.z - landed.z));
      }
    }

    score += scoreForDrop(result.outcome, combo, layers.length, tin.scoreMult);
    cb.onScore(score);
    dropIndex += 1;
    footprint = result.footprint ?? { ...landed };
    cb.onHeight(layers.length);
    afterDrop();
  }

  /** Re-arm the crane for the next layer, and call the order check when due. */
  function afterDrop(): void {
    axis = axisForLayer(dropIndex);
    loadTin();
    sweepT = 0;
    if (tuning.gateEvery > 0 && dropsMade > 0 && dropsMade % tuning.gateEvery === 0) openGate();
  }

  function resolveGate(correct: boolean): void {
    if (!gateOpen) return;
    gateOpen = false;
    if (correct) {
      // A right answer patches the working layer wider — the single most
      // valuable thing in the game, which is what makes the questions worth
      // wanting rather than worth enduring.
      footprint = {
        ...footprint,
        w: Math.min(tuning.maxSize, footprint.w + tuning.gateReward),
        d: Math.min(tuning.maxSize, footprint.d + tuning.gateReward),
      };
      score += 40;
      cb.onScore(score);
      loadTin();
      const top = topLayer();
      burst(top?.slab.x ?? 0, towerTopY() + 0.5, top?.slab.z ?? 0, 12);
    }
    paused = false;
  }

  // ---------- input ----------
  const onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    drop();
  };
  container.addEventListener('pointerdown', onPointerDown);

  // ---------- camera ----------
  function placeCamera(dt: number): void {
    const top = topLayer();
    const targetY = towerTopY() + CAM_LIFT;
    camY += (targetY - camY) * Math.min(1, dt / 220);
    const drift = reduced ? 0 : Math.sin(sweepT * 0.22) * 0.06;
    const a = CAM_ANGLE + drift;
    camera.position.set(Math.sin(a) * CAM_BACK, camY, Math.cos(a) * CAM_BACK);
    // Aim just under the top layer: the swinging slab and the layer it has to
    // land on are the only two things that matter, so they own the frame.
    camera.lookAt(top ? top.slab.x * 0.3 : 0, camY - CAM_LIFT * 0.95, top ? top.slab.z * 0.3 : 0);
    // Keep the key light travelling with the tower, or the shadows fall off the
    // bottom of the shadow camera once the cake is a few layers tall.
    sun.position.set(-6, camY + 9, 7);
    sun.target.position.set(0, camY - CAM_LIFT, 0);
    sun.target.updateMatrixWorld();
  }

  function resize(): void {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones/tablets see a narrower slice of the world; widen the
    // pull-back so the whole sweep stays on screen.
    camera.fov = w / h < 1 ? 54 : 42;
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

    if (!paused && !over) {
      timeLeftMs = Math.max(0, timeLeftMs - dtMs);
      timeReportAcc += dtMs;
      if (timeReportAcc >= 100) { timeReportAcc = 0; cb.onTimeLeft(timeLeftMs); }
      const second = Math.ceil(timeLeftMs / 1000);
      if (second !== lastSecond) {
        lastSecond = second;
        if (second <= 5 && second > 0) sfx('tick');
      }
      if (timeLeftMs <= 0) { cb.onTimeLeft(0); endRound('timeup'); }
    }

    // Crane sweep — centred on the layer it has to land on, so a tower that has
    // drifted sideways is still fair to aim at.
    if (!paused && !over) {
      sweepT += dtMs / 1000;
      const below = landingSlab();
      const centre = axis === 'x' ? below.x : below.z;
      const offset = sweepAt(sweepT, tuning.sweep, craneSpeed());
      // Hover the carried layer clear of the tower: at its exact landing height
      // it merges with the layer below from this angle, and the kid cannot see
      // which of the two slabs is the one they are aiming.
      const y = towerTopY() + tuning.layerH / 2 + HOVER;
      if (axis === 'x') carried.position.set(centre + offset, y, below.z);
      else carried.position.set(below.x, y, centre + offset);

      const beamY = y + 1.9;
      craneGroup.position.set(0, 0, 0);
      // -90° (not +90°): a +90° turn maps the beam's local +x onto world −z,
      // which would send the hook the opposite way from the layer it carries.
      craneGroup.rotation.y = axis === 'x' ? 0 : -Math.PI / 2;
      const along = axis === 'x' ? carried.position.x : carried.position.z;
      beam.position.set(0, beamY, 0);
      cable.position.set(along, y + 1.05 + tuning.layerH / 2, 0);
      cable.scale.set(0.07, Math.max(0.2, beamY - y - tuning.layerH / 2), 0.07);
      hook.position.set(along, y + tuning.layerH * 0.6, 0);
    }

    // Physics: only the offcuts and the counter they land on.
    world.step(FIXED, dtMs / 1000, 3);
    for (let i = offcuts.length - 1; i >= 0; i--) {
      const o = offcuts[i];
      o.age += dtMs;
      o.group.position.set(o.body.position.x, o.body.position.y, o.body.position.z);
      o.group.quaternion.set(o.body.quaternion.x, o.body.quaternion.y, o.body.quaternion.z, o.body.quaternion.w);
      if (o.age > OFFCUT_TTL_MS || o.body.position.y < -8) {
        scene.remove(o.group);
        world.removeBody(o.body);
        offcuts.splice(i, 1);
      }
    }

    stepParticles(dtMs);
    placeCamera(dtMs);
    renderer.render(scene, camera);
  }

  cb.onTimeLeft(timeLeftMs);
  cb.onLives(lives);
  cb.onHeight(0);
  loadTin();
  raf = requestAnimationFrame(tick);

  return {
    drop,
    resolveGate,
    setPaused(next: boolean) {
      // A gate or a finished round outranks the host.
      if (!next && (gateOpen || over)) return;
      paused = next;
    },
    resize,
    getStats(): CraneStats {
      return { height: layers.length, score, perfects, cleanDrops, bestCombo, drops: dropsMade, livesLeft: lives };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPointerDown);
      for (const o of offcuts) { scene.remove(o.group); world.removeBody(o.body); }
      for (const l of layers) { scene.remove(l.group); world.removeBody(l.body); }
      for (const p of particles) scene.remove(p.mesh);
      world.removeBody(groundBody);
      world.removeBody(plateBody);
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (const tex of texs) tex.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
