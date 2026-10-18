// Cakey Pit Stop 3D engine — the pit box on Race Island.
//
// A car rolls in with damage ON THE CAR. The kid TAPS a damaged part, answers
// one question, and then WATCHES the crew wrench it — a couple of real seconds,
// on the clock. Red parts are mandatory; amber parts are the kid's call, and a
// car sent away with amber left limps back into the queue with that work now
// mandatory. A shift is a fixed number of cars.
//
// ── THE VERB ──────────────────────────────────────────────────────────────
// v1 had none: four fixed jobs, a keypad, and a car animation that responded to
// nothing. It failed PRODUCT.md's own test — "strip the math and you'd still
// have a game". Tapping the part you choose, in the order you choose, is the
// game; the maths is the toll at the gate. Strip the maths here and you still
// have "keep the lane clear", which is that test passing.
//
// ── THE CLOCK CHARGES FOR WRENCHING, NEVER FOR THINKING ───────────────────
// The round clock freezes under a question, like every other game in the
// catalogue. What costs time is the crew doing the work you chose. That single
// rule is what makes "two jobs or three?" visible rather than arithmetic: you
// watch the seconds go while the wrench turns, and another car is arriving.
//
// No runtime `three` import — the namespace arrives as a factory arg.

import type * as THREE from 'three';
import { buildJeep } from '@/lib/town/three/vehicles';
import { buildCupcakeModel } from '@/lib/town/three/avatar';
import type { CupcakeConfig } from '@/lib/cupcake/config';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import { RACER, CAKE, WORLD, SPRINKLE_COLORS } from '@/lib/games/theme/palette';
import { cakeMat, cookieMat, candyMat, frostingMat, glowSprite } from '@/lib/town/three/materials';
import type { ThreeNS, PitStopSceneProps, PitStopEngine, PitStopCallbacks, QueueEntry } from './types';
import {
  JOB_ORDER, CAR_LIVERIES, ARRIVE_MS, EXIT_CLEAN_MS, EXIT_LIMP_MS, RETURN_HOLD_MS,
  createDamageGenerator, escalate, canLeave, countState, workMsFor, carsForRound,
  type Damage, type JobKind, type PitStopTuning, type Difficulty,
} from './damage';

const BOX_X = 0;
const IN_X = -4.6;
const OUT_X = 4.6;
const JACK_LIFT = 0.34;
/** Queue slots recede up-track, so perspective does the "further away" work. */
const QUEUE_X = [-3.0, -4.3, -5.6];

/** Halo anchors for the two BODY jobs, in the outer group's space. The jeep is
 *  turned broadside (rotation.y = π/2), so the jeep's own +Z (its nose) points
 *  along the group's +X. The tyre halos are NOT here — they are parented to the
 *  real wheel pivots, because hand-placed offsets put them in mid-air beside the
 *  car rather than on the wheel the kid is being asked to look at. */
const BODY_ANCHOR: Record<'engine' | 'syrup', [number, number, number]> = {
  engine: [0.46, 0.5, 0],   // over the nose
  syrup: [-0.2, 0.58, 0],   // over the tub
};

/** Fat enough for a five-year-old's finger on an iPad. The real meshes are far
 *  too small to hit; the halo IS the hitbox, so the affordance and the target
 *  can never disagree. */
const HALO_R = 0.34;

type Phase = 'empty' | 'arriving' | 'idle' | 'question' | 'working' | 'leaving';

interface Car {
  id: number;
  liveryIdx: number;
  damage: Damage;
  visits: number;
}

export function createPitStopEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: PitStopSceneProps,
  tuning: PitStopTuning,
  difficulty: Difficulty,
  cb: PitStopCallbacks,
): PitStopEngine {
  const roundMs = getSessionDurationMs();
  const budget = carsForRound(tuning, roundMs);
  const reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const gen = createDamageGenerator(difficulty, tuning);

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfff4e2);
  scene.fog = new THREE.Fog(0xfff4e2, 16, 40);
  const { w: w0, h: h0 } = sizeOf();
  // Pulled back and left of the box so the queue is genuinely in shot. The car
  // being worked stays right-of-centre and large; waiting cars recede.
  const camera = new THREE.PerspectiveCamera(46, w0 / h0, 0.1, 80);
  camera.position.set(-2.4, 3.1, 6.4);
  camera.lookAt(-1.4, 0.45, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const sun = new THREE.DirectionalLight(0xfff3da, 1.0);
  sun.position.set(-4, 7, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  { const c = sun.shadow.camera; c.left = -8; c.right = 8; c.top = 6; c.bottom = -4; c.near = 0.5; c.far = 24; }
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xfff3da, 0x9fe8b5, 0.45));

  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const g = <T extends THREE.BufferGeometry>(v: T): T => { geos.push(v); return v; };
  const m = <T extends THREE.Material>(v: T): T => { mats.push(v); return v; };
  const box = (
    w: number, h: number, d: number, x: number, y: number, z: number,
    mat: THREE.Material, opts: { shadow?: boolean; receive?: boolean } = {},
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(g(new THREE.BoxGeometry(w, h, d)), mat);
    mesh.position.set(x, y, z);
    if (opts.shadow !== false) mesh.castShadow = true;
    if (opts.receive) mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // ---------- Ground + lane ----------
  box(60, 0.1, 30, 0, -0.06, 0, m(cakeMat(THREE, WORLD.TERRAIN_GRASS)), { shadow: false });
  box(30, 0.06, 7.4, -2, 0, 0, m(new THREE.MeshStandardMaterial({ color: RACER.ASPHALT_WORN, roughness: 0.92 })), { shadow: false, receive: true });
  for (let i = -8; i < 6; i++) {
    box(1, 0.12, 0.42, i + 0.5, 0.06, 3.9, m(candyMat(THREE, i % 2 === 0 ? RACER.KERB_A : RACER.KERB_B)));
  }
  {
    const markMat = m(frostingMat(THREE, RACER.RACING_LINE));
    box(2.5, 0.02, 0.08, 0, 0.04, -0.92, markMat, { shadow: false });
    box(0.08, 0.02, 1.85, -1.15, 0.04, 0, markMat, { shadow: false });
    box(0.08, 0.02, 1.85, 1.15, 0.04, 0, markMat, { shadow: false });
    box(2.3, 0.02, 1.8, 0, 0.03, 0, m(new THREE.MeshStandardMaterial({ color: RACER.ASPHALT, roughness: 0.95 })), { shadow: false, receive: true });
  }

  // ---------- Garage + pit wall ----------
  // The pit wall is score, finish line and progress bar in one object: a kid can
  // answer "how am I doing" and "how much is left" by looking at it.
  const plaques: THREE.Mesh[] = [];
  {
    const BAY_W = 2.1;
    const wallMat = m(cookieMat(THREE, 0xc9884a));
    const bayMat = m(cakeMat(THREE, CAKE.VANILLA));
    const roofMat = m(cookieMat(THREE, WORLD.WAFER));
    const lintelMat = m(candyMat(THREE, RACER.KERB_A));
    const WALL_Z = -3.5;
    for (let i = -1; i <= 1; i++) {
      const bx = i * BAY_W;
      box(BAY_W * 0.96, 2.0, 0.5, bx, 1.0, WALL_Z, wallMat, { receive: true });
      box(BAY_W * 0.7, 1.5, 0.16, bx, 0.75, WALL_Z + 0.22, bayMat);
      box(BAY_W * 0.96, 0.26, 0.5, bx, 2.13, WALL_Z, lintelMat);
      for (const s of [-1, 1]) box(0.26, 2.0, 0.26, bx + s * BAY_W * 0.5, 1.0, WALL_Z + 1.1, roofMat);
    }
    box(BAY_W * 3 + 0.7, 0.22, 2.0, 0, 2.11, WALL_Z + 0.6, roofMat);

    const plaqueGeo = g(new THREE.BoxGeometry(0.3, 0.3, 0.08));
    const dimMat = m(cakeMat(THREE, 0x9c8b74));
    const wonMat = m(candyMat(THREE, CAKE.AMBER));
    const perRow = Math.min(budget, 8);
    for (let i = 0; i < budget; i++) {
      const row = Math.floor(i / perRow);
      const col = i % perRow;
      const p = new THREE.Mesh(plaqueGeo, dimMat);
      p.position.set(-2.6 + col * 0.4, 2.52 - row * 0.4, WALL_Z + 0.32);
      p.userData.wonMat = wonMat;
      scene.add(p);
      plaques.push(p);
    }
  }

  // ---------- Dressing ----------
  {
    const tyreMat = m(candyMat(THREE, RACER.TYRE_STACK));
    const hubMat = m(frostingMat(THREE, CAKE.VANILLA));
    const tyreGeo = g(new THREE.CylinderGeometry(0.19, 0.19, 0.13, 12));
    const hubGeo = g(new THREE.CylinderGeometry(0.085, 0.085, 0.14, 10));
    for (const [tx, tz] of [[2.15, -1.5], [2.6, 1.1]] as const) {
      for (let k = 0; k < 4; k++) {
        const t = new THREE.Mesh(tyreGeo, tyreMat);
        t.position.set(tx, 0.07 + k * 0.135, tz);
        t.rotation.y = k * 0.5;
        t.castShadow = true;
        scene.add(t);
        const hub = new THREE.Mesh(hubGeo, hubMat);
        hub.position.copy(t.position);
        scene.add(hub);
      }
    }
    const cone = new THREE.Mesh(g(new THREE.ConeGeometry(0.13, 0.34, 10)), m(candyMat(THREE, RACER.CONE)));
    cone.position.set(1.75, 0.17, 1.35);
    cone.castShadow = true;
    scene.add(cone);
    const band = new THREE.Mesh(g(new THREE.CylinderGeometry(0.093, 0.104, 0.06, 10)), m(candyMat(THREE, RACER.CONE_STRIPE)));
    band.position.set(1.75, 0.19, 1.35);
    scene.add(band);
  }

  // ---------- Crew chief ----------
  const crew = buildCupcakeModel(THREE, props.cupcakeConfig as CupcakeConfig | undefined);
  geos.push(...crew.geometries);
  mats.push(...crew.materials);
  crew.group.position.set(1.28, 0, 0.75);
  crew.group.scale.setScalar(0.8);
  crew.group.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
  scene.add(crew.group);
  let crewHop = 0;

  // ---------- Sparkle ----------
  const glow = glowSprite(THREE, WORLD.GLOW_WARM, 1.1, 0);
  texs.push(glow.tex); mats.push(glow.mat);
  glow.sprite.visible = false;
  scene.add(glow.sprite);
  const fleckGeo = g(new THREE.SphereGeometry(0.03, 6, 4));
  const flecks = SPRINKLE_COLORS.map((c, i) => {
    const mesh = new THREE.Mesh(fleckGeo, m(candyMat(THREE, c)));
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, vx: 0, vy: 0, vz: 0, life: 0, idx: i };
  });

  // ---------- Car pool ----------
  // Pooled, not built-per-car. With a queue this is ~4x v1's churn, and
  // rebuilding a jeep's geometry every few seconds is a GC hitch on an iPad.
  interface Rig {
    group: THREE.Group;
    wheels: THREE.Object3D[];
    bodyMat: THREE.MeshStandardMaterial | null;
    trimMat: THREE.MeshStandardMaterial | null;
    halos: Record<JobKind, THREE.Mesh>;
    inUse: boolean;
  }
  const haloGeo = g(new THREE.SphereGeometry(HALO_R, 12, 10));
  const rigs: Rig[] = [];
  for (let i = 0; i < 5; i++) {
    const liv = CAR_LIVERIES[i];
    const v = buildJeep(THREE, { bodyColor: liv.body, trimColor: liv.trim });
    geos.push(...v.geometries);
    mats.push(...v.materials);
    const group = new THREE.Group();
    v.group.rotation.y = Math.PI / 2;
    group.add(v.group);
    group.visible = false;
    group.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    scene.add(group);
    const bodyMat = (v.materials.find((mm) => (mm as THREE.MeshStandardMaterial).color?.getHex?.() === liv.body) as THREE.MeshStandardMaterial) ?? null;
    const trimMat = (v.materials.find((mm) => (mm as THREE.MeshStandardMaterial).color?.getHex?.() === liv.trim) as THREE.MeshStandardMaterial) ?? null;
    // Wheels sorted by the jeep's own +Z, i.e. nose first, so [0..1] are the
    // front pair and [2..3] the rear.
    const wheels = [...(v.spinParts ?? [])].sort((a, b) => b.position.z - a.position.z);
    const halos = {} as Record<JobKind, THREE.Mesh>;
    for (const k of JOB_ORDER) {
      const h = new THREE.Mesh(haloGeo, m(new THREE.MeshBasicMaterial({
        color: 0xff5566, transparent: true, opacity: 0, depthWrite: false,
      })));
      h.userData.job = k;
      h.visible = false;
      if (k === 'tyre-front' || k === 'tyre-rear') {
        // Parent to the wheel itself. A sphere is rotation-invariant, so riding
        // a spinning pivot costs nothing and guarantees the halo is exactly on
        // the part being asked about.
        const w = k === 'tyre-front' ? wheels[0] : wheels[wheels.length - 1];
        if (w) w.add(h); else group.add(h);
      } else {
        h.position.set(...BODY_ANCHOR[k]);
        group.add(h);
      }
      halos[k] = h;
    }
    rigs.push({ group, wheels, bodyMat, trimMat, halos, inUse: false });
  }
  const takeRig = (liveryIdx: number): Rig | null => {
    const rig = rigs.find((r) => !r.inUse);
    if (!rig) return null;
    rig.inUse = true;
    rig.group.visible = true;
    const liv = CAR_LIVERIES[liveryIdx % CAR_LIVERIES.length];
    rig.bodyMat?.color.setHex(liv.body);
    rig.trimMat?.color.setHex(liv.trim);
    return rig;
  };
  const freeRig = (rig: Rig): void => {
    rig.inUse = false;
    rig.group.visible = false;
    for (const k of JOB_ORDER) rig.halos[k].visible = false;
  };

  // ---------- State ----------
  let phase: Phase = 'empty';
  let phaseT = 0;
  let nextCarId = 1;
  let liveryCursor = 0;
  let spawnedCount = 0;
  let banked = 0;
  let carsReturned = 0;
  let jobsFixed = 0;
  let correctAnswers = 0;
  let wrongAnswers = 0;

  let boxCar: Car | null = null;
  let boxRig: Rig | null = null;
  let boxX = IN_X;
  let jackT = 0;
  let jackTarget = 0;
  let activeJob: JobKind | null = null;
  let workMs = 0;
  let workT = 0;
  let questionId = 0;
  let awaiting = false;

  const queue: Array<{ car: Car; rig: Rig }> = [];
  const returning: Array<{ car: Car; rig: Rig; t: number }> = [];
  let arrivalT = 0;

  let elapsedMs = 0;
  let lastEmitSec = -1;
  let paused = false;
  let ended = false;
  let raf = 0;
  let last = performance.now();

  /** Never reuse a colour already in the lane — livery is how a kid recognises
   *  a car that has come BACK, so a duplicate would break the whole lesson. */
  const liveryFor = (): number => {
    const inLane = new Set<number>();
    if (boxCar) inLane.add(boxCar.liveryIdx % CAR_LIVERIES.length);
    for (const q of queue) inLane.add(q.car.liveryIdx % CAR_LIVERIES.length);
    for (const r of returning) inLane.add(r.car.liveryIdx % CAR_LIVERIES.length);
    for (let i = 0; i < CAR_LIVERIES.length; i++) {
      const idx = (liveryCursor + i) % CAR_LIVERIES.length;
      if (!inLane.has(idx)) { liveryCursor = idx + 1; return idx; }
    }
    return liveryCursor++ % CAR_LIVERIES.length;
  };

  const emitQueue = (): void => {
    cb.onQueue(queue.map((q): QueueEntry => ({
      id: q.car.id,
      body: CAR_LIVERIES[q.car.liveryIdx % CAR_LIVERIES.length].body,
      returning: q.car.visits > 1,
    })));
  };

  const spawnCar = (): void => {
    // One slot is permanently reserved for a returning car, so a return can
    // never arrive into a full queue — an unrepresentable state removed by
    // construction rather than handled.
    if (queue.length >= tuning.queueCap - 1) return;
    if (spawnedCount >= budget) return;
    const liveryIdx = liveryFor();
    const rig = takeRig(liveryIdx);
    if (!rig) return;
    queue.push({
      car: { id: nextCarId++, liveryIdx, damage: gen.roll(spawnedCount), visits: 1 },
      rig,
    });
    spawnedCount += 1;
    emitQueue();
  };

  const applyHalos = (): void => {
    if (!boxRig || !boxCar) return;
    for (const k of JOB_ORDER) {
      const st = boxCar.damage[k];
      const h = boxRig.halos[k];
      h.visible = st !== 'ok';
      // Red = must. Amber = your call. Two colours, no words.
      (h.material as THREE.MeshBasicMaterial).color.setHex(st === 'broken' ? 0xff5566 : 0xffb020);
    }
  };

  const celebrate = (kind: JobKind): void => {
    if (!boxRig) return;
    // Fire from wherever the halo actually IS — the halos are parented to real
    // wheels now, so asking the object beats recomputing an offset that could
    // drift out of step with it.
    const p = new THREE.Vector3();
    boxRig.halos[kind].getWorldPosition(p);
    glow.sprite.position.copy(p);
    glow.sprite.visible = true;
    glow.mat.opacity = reduceMotion ? 0.5 : 0.9;
    if (reduceMotion) return;
    for (const f of flecks) {
      f.mesh.position.copy(p);
      f.mesh.visible = true;
      const ang = (f.idx / flecks.length) * Math.PI * 2;
      f.vx = Math.cos(ang) * 0.9;
      f.vz = Math.sin(ang) * 0.9;
      f.vy = 1.6 + (f.idx % 3) * 0.25;
      f.life = 1;
    }
    crewHop = 1;
  };

  const finishJob = (kind: JobKind): void => {
    if (!boxCar) return;
    boxCar.damage = { ...boxCar.damage, [kind]: 'ok' };
    jobsFixed += 1;
    applyHalos();
    cb.onDamage(boxCar.damage);
    cb.onWorkDone(kind);
    cb.onSfx?.('fixed');
    celebrate(kind);
    activeJob = null;
    jackTarget = 0;
    phase = 'idle';
  };

  const departCar = (bankNow: boolean): void => {
    if (!boxCar) return;
    cb.onCarOut(boxCar.id, bankNow);
    if (bankNow) {
      banked += 1;
      const p = plaques[banked - 1];
      if (p) p.material = p.userData.wonMat as THREE.Material;
      cb.onBudget(banked, budget);
      cb.onSfx?.('bank');
    } else {
      cb.onSfx?.('limp');
    }
    phase = 'leaving';
    phaseT = 0;
  };

  spawnCar();
  cb.onBudget(0, budget);

  const onResize = (): void => {
    const { w, h } = sizeOf();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  function requestJob(kind: JobKind): void {
    if (!boxCar || ended || phase !== 'idle') return;
    if (boxCar.damage[kind] === 'ok') return;
    activeJob = kind;
    questionId += 1;
    awaiting = true;
    phase = 'question';
    cb.onJob(kind, questionId);
  }

  // ---------- Tap a part ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const onPointerDown = (e: PointerEvent): void => {
    if (!boxRig || !boxCar || phase !== 'idle' || ended || paused) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const targets = JOB_ORDER.map((k) => boxRig!.halos[k]).filter((h) => h.visible);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (hit) requestJob(hit.object.userData.job as JobKind);
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const easeOut = (t: number): number => 1 - (1 - t) ** 3;
  const easeIn = (t: number): number => t * t * t;

  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dtMs = now - last; last = now;
    if (dtMs > 50) dtMs = 50;
    const dt = dtMs / 1000;

    // THE CLOCK: frozen while a question is up. Solving maths never eats the
    // timer — the same rule every other game in the catalogue follows.
    const clockRuns = !paused && !ended && phase !== 'question';

    if (clockRuns) {
      elapsedMs += dtMs;
      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmitSec) {
        lastEmitSec = sec;
        cb.onTimeLeft(remaining);
        if (sec <= 15 && sec > 0) cb.onSfx?.('tick');
      }
      if (remaining <= 0) {
        ended = true;
        cb.onSfx?.('timeUp');
        cb.onRoundEnd('timeout');
      }
    }

    if (clockRuns && !ended) {
      // Arrivals run on their own timer, concurrently with the box.
      arrivalT += dtMs;
      if (arrivalT >= tuning.arrivalMs) { arrivalT = 0; spawnCar(); }

      // Cars limping back. Under reduced motion this is a HOLD, not a dash:
      // the return is the game's central lesson and compressing it would
      // destroy the teaching for exactly the kids who least afford it.
      for (let i = returning.length - 1; i >= 0; i--) {
        const r = returning[i];
        r.t += dtMs;
        const dur = reduceMotion ? RETURN_HOLD_MS : 1500;
        const k = Math.min(1, r.t / dur);
        if (!reduceMotion) {
          // Across the FRONT of frame — the most legible motion the camera can
          // make, so the return cannot be missed.
          const slot = QUEUE_X[Math.min(queue.length, QUEUE_X.length - 1)];
          r.rig.group.position.set(lerp(OUT_X, slot, k), 0, lerp(2.6, 0, k));
        }
        if (k >= 1) {
          returning.splice(i, 1);
          queue.push({ car: r.car, rig: r.rig });
          emitQueue();
        }
      }

      phaseT += dtMs;
      if (phase === 'empty') {
        if (queue.length > 0) {
          const next = queue.shift()!;
          boxCar = next.car;
          boxRig = next.rig;
          boxX = IN_X;
          jackT = 0; jackTarget = 0;
          phase = 'arriving';
          phaseT = 0;
          emitQueue();
          cb.onSfx?.('arrive');
        } else if (spawnedCount >= budget && returning.length === 0) {
          ended = true;
          cb.onSfx?.('win');
          cb.onRoundEnd('shift-complete');
        }
      } else if (phase === 'arriving') {
        const k = Math.min(1, phaseT / (reduceMotion ? 120 : ARRIVE_MS));
        boxX = lerp(IN_X, BOX_X, easeOut(k));
        if (k >= 1 && boxCar) {
          phase = 'idle';
          applyHalos();
          cb.onCarIn(boxCar.id, CAR_LIVERIES[boxCar.liveryIdx % CAR_LIVERIES.length].body, boxCar.damage, boxCar.visits);
          cb.onDamage(boxCar.damage);
        }
      } else if (phase === 'working') {
        workT += dtMs;
        jackTarget = activeJob === 'tyre-front' || activeJob === 'tyre-rear' ? 1 : 0;
        if (workT >= workMs && activeJob) finishJob(activeJob);
      } else if (phase === 'leaving') {
        const limping = !!boxCar && countState(boxCar.damage, 'worn') > 0;
        const dur = reduceMotion ? 120 : (limping ? EXIT_LIMP_MS : EXIT_CLEAN_MS);
        const k = Math.min(1, phaseT / dur);
        boxX = lerp(BOX_X, OUT_X, easeIn(k));
        if (k >= 1 && boxCar && boxRig) {
          // Only the car IN THE BOX ever wears halos. A punted car kept its
          // amber halo lit all the way round the return lane and while sitting
          // in the queue, which made waiting cars look tappable when they are
          // not — and put two "damaged" cars on screen at once.
          for (const kk of JOB_ORDER) boxRig.halos[kk].visible = false;
          if (limping && tuning.returns) {
            boxCar.damage = escalate(boxCar.damage);
            boxCar.visits += 1;
            carsReturned += 1;
            returning.push({ car: boxCar, rig: boxRig, t: 0 });
            cb.onCarReturned(boxCar.id, CAR_LIVERIES[boxCar.liveryIdx % CAR_LIVERIES.length].body);
          } else {
            freeRig(boxRig);
          }
          boxCar = null;
          boxRig = null;
          phase = 'empty';
          phaseT = 0;
        }
      }
    }

    // ---- visuals (run even under a question, so the world stays alive) ----
    const k = reduceMotion ? 1 : Math.min(1, dt * 8);
    jackT = lerp(jackT, jackTarget, k);
    if (boxRig) {
      boxRig.group.position.set(boxX, JACK_LIFT * jackT, 0);
      if (!reduceMotion && (phase === 'arriving' || phase === 'leaving')) {
        for (const w of boxRig.wheels) w.rotation.x += dt * 9;
      }
      // Damaged parts breathe, so they read as "needs you" without words.
      const pulse = reduceMotion ? 0.62 : 0.6 + Math.sin(now / 220) * 0.22;
      for (const kk of JOB_ORDER) {
        const h = boxRig.halos[kk];
        if (h.visible) (h.material as THREE.MeshBasicMaterial).opacity = pulse;
      }
    }
    for (let i = 0; i < queue.length; i++) {
      queue[i].rig.group.position.set(QUEUE_X[Math.min(i, QUEUE_X.length - 1)], 0, 0);
    }
    if (crewHop > 0) {
      crewHop = Math.max(0, crewHop - dt * 5);
      const p = 1 - crewHop;
      crew.group.position.y = Math.sin(p * Math.PI) * 0.16;
      crew.group.scale.y = 0.8 * (1 + Math.sin(p * Math.PI) * 0.3);
    } else {
      crew.group.position.y = 0;
      crew.group.scale.y = 0.8;
    }
    if (glow.sprite.visible) {
      glow.mat.opacity = Math.max(0, glow.mat.opacity - dt * 2.2);
      if (glow.mat.opacity <= 0.01) glow.sprite.visible = false;
    }
    for (const f of flecks) {
      if (f.life <= 0) continue;
      f.life = Math.max(0, f.life - dt * 1.6);
      f.vy -= dt * 5;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      if (f.life <= 0) f.mesh.visible = false;
    }

    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    requestJob,
    sendCar(): void {
      if (!boxCar || ended || phase !== 'idle') return;
      if (!canLeave(boxCar.damage)) return; // red still on the car
      departCar(countState(boxCar.damage, 'worn') === 0);
    },
    resolveChallenge(correct: boolean, forQuestionId: number): void {
      if (ended || !awaiting) return;
      // The answer must be FOR the question on screen. A boolean gate cannot
      // tell a stale answer from a fresh one when finishing one question can
      // immediately open another.
      if (forQuestionId !== questionId) return;
      awaiting = false;
      if (correct) { correctAnswers += 1; cb.onSfx?.('correct'); }
      else { wrongAnswers += 1; cb.onSfx?.('wrong'); }
      if (!activeJob) { phase = 'idle'; return; }
      // Either way the work happens — a wrong answer costs TIME (a fumbled
      // wrench), never progress, so a question a kid cannot do never strands
      // them. This rule is the best thing v1 had and it survives unchanged.
      workMs = workMsFor(activeJob, tuning, correct ? 0 : 1);
      workT = 0;
      phase = 'working';
      cb.onWork(activeJob, workMs);
      cb.onSfx?.('wrench');
    },
    setPaused(p: boolean): void { paused = p; if (!p) last = performance.now(); },
    resize(): void { onResize(); },
    getSummaryStats() {
      return { carsBanked: banked, carBudget: budget, carsReturned, jobsFixed, correctAnswers, wrongAnswers };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      for (const t of texs) t.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
