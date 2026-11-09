// Sandcastle Siege engine — three.js render + cannon-es physics.
//
// `createEngine` builds the scene and returns an imperative handle the React
// host drives (armBalloon / setPaused / resize / dispose) plus callbacks the
// engine fires back (time left, flatten count, balloon resolved, round end).
// The host owns NO physics state; the engine owns NO React state.
//
// The launch point rides a TOY TRAIN that slowly circles the cake city on a
// track; a chase camera orbits with it, so the city is always ahead and the
// drag-aim stays camera-relative. The train freezes while the math modal is up
// and while the kid is actively aiming, and rolls the rest of the time.
//
// No runtime `three`/`cannon-es` import — the loaded namespaces are passed in,
// so this module stays out of the server bundle and only loads in the browser.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS, DifficultyTuning, LandscapeTheme } from './types';
import { MIN_PULL_PX, MAX_PULL_PX, MIN_POWER, MAX_PULLBACK_UNITS } from './types';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import { createCity, type City, type Building } from './city';
import {
  createBalloon,
  launchBalloon,
  spawnSplash,
  type Balloon,
  type SplashSystem,
} from './balloon';

export interface EngineCallbacks {
  onTimeLeft(ms: number): void;
  onBuildingFlattened(total: number): void;
  /** Fired once a launched balloon has landed (after the ~2.2s watch-the-cakes-
   *  fall linger). The host poses the next math challenge so the kid keeps
   *  shooting for the whole round. */
  onBalloonResolved(): void;
  onRoundEnd(): void;
  onSfx?(name: 'bubble' | 'win'): void;
}

export interface Engine {
  armBalloon(): void;
  isArmed(): boolean;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): { flattened: number; shots: number };
  dispose(): void;
}

/** Pull-to-launch mapping — the FEEL of the slingshot. 2D drag → camera-relative
 *  3D direction + power. Drag back/down = higher, harder arc; sideways yaws. */
export function computeLaunch(
  THREE: ThreeNS,
  camera: THREE.PerspectiveCamera,
  dragStart: { x: number; y: number },
  dragCurrent: { x: number; y: number },
  tuning: DifficultyTuning,
): { dir: THREE.Vector3; power: number; pullPx: number; t: number } {
  const pullX = dragStart.x - dragCurrent.x;
  const pullY = dragCurrent.y - dragStart.y;
  const pullPx = Math.hypot(pullX, pullY);

  const clamped = Math.min(Math.max(pullPx, MIN_PULL_PX), MAX_PULL_PX);
  const t = (clamped - MIN_PULL_PX) / (MAX_PULL_PX - MIN_PULL_PX);
  const power = MIN_POWER + t * (tuning.maxPullPower - MIN_POWER);

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();

  const k = 1 / MAX_PULL_PX;
  // Pull the pouch left → fly left (and vice-versa). The earlier sign flipped
  // this, so dragging right sent the balloon left. pullX = start − current, so
  // a rightward drag is pullX<0; we want that to aim right → use pullX directly.
  const aimRight = pullX * k * 1.1;
  const aimUp = Math.min(Math.max(pullY, 0) * k, 1) * 0.95 + 0.22;

  const dir = new THREE.Vector3()
    .addScaledVector(forward, 1)
    .addScaledVector(right, aimRight)
    .addScaledVector(worldUp, aimUp)
    .normalize();

  return { dir, power, pullPx, t };
}

/** Radial blast that topples a struck cake (and rattles its neighbours). */
export function applyToppleBlast(
  CANNON: CannonNS,
  blocks: CANNON.Body[],
  center: THREE.Vector3,
  strength: number,
  radius: number,
): void {
  for (const body of blocks) {
    const dx = body.position.x - center.x;
    const dy = body.position.y - center.y;
    const dz = body.position.z - center.z;
    const dist = Math.max(Math.hypot(dx, dy, dz), 0.3);
    if (dist > radius) continue;
    body.wakeUp();
    const f = strength / dist;
    const impulse = new CANNON.Vec3(
      (dx / dist) * f,
      (dy / dist) * f + f * 0.5,
      (dz / dist) * f,
    );
    body.applyImpulse(impulse);
  }
}

const BLAST_RADIUS = 3.4;
const BLAST_STRENGTH = 6.5;
// Trajectory preview: number of sampled points along the predicted arc.
const AIM_SAMPLES = 30;
const AIM_DT = 0.045;
// After a shot, wait so the kid can watch the cakes fall before the next math.
const RESOLVE_DELAY_HIT = 2200;
const RESOLVE_DELAY_MISS = 1100;

// City + train geometry.
const CITY_CENTER = { x: 0, z: -8 };
const TRAIN_R = 18;
const CAM_BACK = 11; // further behind the train so the train + balloon sit in frame
const CAM_HEIGHT = 8.5;
const TRAIN_SPEED = (Math.PI * 2) / 55; // one gentle lap ~55s

// Ice cream blimp hazard — drifts over the city; a balloon hit knocks it down
// and it crashes onto the cakes. Capped at 2 appearances per round.
const BLIMP_MAX_PER_ROUND = 2;
const BLIMP_HEIGHT = 9;            // cruising altitude (world units)
const BLIMP_SPEED = 3.4;           // horizontal drift (units/sec)
const BLIMP_SPAN = 17;             // drifts from −SPAN..+SPAN across the city
const BLIMP_HIT_R = 2.7;           // balloon proximity that knocks it down
const BLIMP_FALL_G = 17;           // fall acceleration once hit
const BLIMP_CRASH_Y = 1.0;         // y where it slams into the cakes
const BLIMP_BLAST_RADIUS = 5.5;    // bigger than a balloon — it's a wrecking ball
const BLIMP_BLAST_STRENGTH = 11;
const BLIMP_FIRST_MS = 7000;       // first blimp ~7s into the round
const BLIMP_GAP_MS = 13000;        // gap before the 2nd appears

export function createEngine(
  THREE: ThreeNS,
  CANNON: CannonNS,
  container: HTMLElement,
  tuning: DifficultyTuning,
  theme: LandscapeTheme,
  cb: EngineCallbacks,
): Engine {
  // Round length = the kid's chosen 1/2/3-min pick (see session-duration).
  const roundMs = getSessionDurationMs();
  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = tuning.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({
    w: container.clientWidth || 1,
    h: container.clientHeight || 1,
  });
  {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
  }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  // ---------- Scene + camera (themed) ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 55, 140);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(50, w0 / h0, 0.1, 240);

  // ---------- Lights (themed tint) ----------
  const ambient = new THREE.AmbientLight(theme.ambient, 0.66);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(theme.sun, 1.05);
  sun.position.set(-9, 18, 10);
  sun.castShadow = tuning.shadows;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 70;
  sc.left = -20;
  sc.right = 20;
  sc.top = 20;
  sc.bottom = -20;
  scene.add(sun);

  // ---------- Physics world ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -tuning.gravity, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 10;

  const sandMat = new CANNON.Material('sand');
  const blockMat = new CANNON.Material('block');
  const balloonMat = new CANNON.Material('balloon');
  world.addContactMaterial(new CANNON.ContactMaterial(sandMat, blockMat, { friction: 0.6, restitution: 0.05 }));
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, blockMat, { friction: 0.5, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(balloonMat, sandMat, { friction: 0.4, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(balloonMat, blockMat, { friction: 0.3, restitution: 0.1 }));

  // ---------- Ground (themed) ----------
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.ground, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundBody = new CANNON.Body({ mass: 0, material: sandMat });
  groundBody.addShape(new CANNON.Plane());
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  // ---------- Candy decor (themed, non-physics) ----------
  const decorGroup = new THREE.Group();
  const decorGeos: THREE.BufferGeometry[] = [];
  const decorMats: THREE.Material[] = [];
  {
    const gumGeo = new THREE.SphereGeometry(0.55, 12, 10);
    const popHeadGeo = new THREE.SphereGeometry(0.4, 12, 10);
    const stickGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6);
    decorGeos.push(gumGeo, popHeadGeo, stickGeo);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    decorMats.push(stickMat);
    const candyMats = theme.candy.map((c) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
      decorMats.push(m);
      return m;
    });
    // Deterministic-ish scatter ring beyond the track.
    const N = 16;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (i % 2) * 0.31;
      const rad = TRAIN_R + 5 + (i % 3) * 3.5;
      const x = CITY_CENTER.x + Math.sin(ang) * rad;
      const z = CITY_CENTER.z + Math.cos(ang) * rad;
      const mat = candyMats[i % candyMats.length];
      if (i % 2 === 0) {
        const gum = new THREE.Mesh(gumGeo, mat);
        gum.position.set(x, 0.45, z);
        gum.scale.y = 0.8;
        gum.castShadow = true;
        decorGroup.add(gum);
      } else {
        const stick = new THREE.Mesh(stickGeo, stickMat);
        stick.position.set(x, 0.6, z);
        decorGroup.add(stick);
        const head = new THREE.Mesh(popHeadGeo, mat);
        head.position.set(x, 1.3, z);
        head.castShadow = true;
        decorGroup.add(head);
      }
    }
  }
  scene.add(decorGroup);

  // ---------- Train track ----------
  const trackGeo = new THREE.TorusGeometry(TRAIN_R, 0.14, 8, 72);
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.9 });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.rotation.x = -Math.PI / 2;
  track.position.set(CITY_CENTER.x, 0.05, CITY_CENTER.z);
  track.receiveShadow = true;
  scene.add(track);

  // ---------- Toy train + slingshot (a Group we move along the track) ----------
  const slingGroup = new THREE.Group();
  scene.add(slingGroup);
  const trainGeos: THREE.BufferGeometry[] = [];
  const trainMats: THREE.Material[] = [];
  {
    const carGeo = new THREE.BoxGeometry(2.0, 0.7, 1.4);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.55 });
    const car = new THREE.Mesh(carGeo, carMat);
    car.position.set(0, 0.55, 0);
    car.castShadow = true;
    slingGroup.add(car);

    const cabGeo = new THREE.BoxGeometry(0.9, 0.7, 1.2);
    const cabMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 });
    const cab = new THREE.Mesh(cabGeo, cabMat);
    cab.position.set(-0.5, 1.1, 0);
    cab.castShadow = true;
    slingGroup.add(cab);

    const chimGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8);
    const chimMat = new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.6 });
    const chim = new THREE.Mesh(chimGeo, chimMat);
    chim.position.set(0.6, 1.05, 0);
    chim.castShadow = true;
    slingGroup.add(chim);

    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3f2a1a, roughness: 0.7 });
    for (const [wx, wz] of [[-0.7, 0.62], [0.7, 0.62], [-0.7, -0.62], [0.7, -0.62]] as const) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      slingGroup.add(wheel);
    }

    const postGeo = new THREE.CylinderGeometry(0.09, 0.12, 1.5, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
    const postL = new THREE.Mesh(postGeo, postMat);
    postL.position.set(-0.42, 1.55, 0);
    postL.castShadow = true;
    slingGroup.add(postL);
    const postR = new THREE.Mesh(postGeo, postMat);
    postR.position.set(0.42, 1.55, 0);
    postR.castShadow = true;
    slingGroup.add(postR);

    // Trailing toy-train cars (cosmetic). Local +X is the travel/tangent
    // direction (see updateTrain), so cars trail behind at local −X. At
    // R=18 the rigid tangent offset deviates from the circular track by a
    // negligible amount, so they read as coupled cars riding the loop.
    const trailGeo = new THREE.BoxGeometry(1.3, 0.6, 1.2);
    const couplerGeo = new THREE.BoxGeometry(0.55, 0.1, 0.12);
    trainGeos.push(trailGeo, couplerGeo);
    const trailColors = [0x6ee7b7, 0x93b4f0]; // mint, blueberry
    trailColors.forEach((c, i) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
      trainMats.push(m);
      const cxq = -2.3 - i * 1.8;
      const body = new THREE.Mesh(trailGeo, m);
      body.position.set(cxq, 0.5, 0);
      body.castShadow = true;
      slingGroup.add(body);
      for (const [wx, wz] of [[cxq - 0.42, 0.55], [cxq + 0.42, 0.55], [cxq - 0.42, -0.55], [cxq + 0.42, -0.55]] as const) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.3, wz);
        slingGroup.add(wheel);
      }
      const coupler = new THREE.Mesh(couplerGeo, postMat);
      coupler.position.set(cxq + 0.92, 0.45, 0);
      slingGroup.add(coupler);
    });

    trainGeos.push(carGeo, cabGeo, chimGeo, wheelGeo, postGeo);
    trainMats.push(carMat, cabMat, chimMat, wheelMat, postMat);
  }
  // Local mount points within the train.
  const FORK_LOCAL = new THREE.Vector3(0, 2.05, 0);
  const POSTL_LOCAL = new THREE.Vector3(-0.42, 2.3, 0);
  const POSTR_LOCAL = new THREE.Vector3(0.42, 2.3, 0);
  // World-space cache (updated each train step).
  const anchor = new THREE.Vector3();
  const postTopL = new THREE.Vector3();
  const postTopR = new THREE.Vector3();

  // Stretchy band + aim hint.
  const bandMat = new THREE.LineBasicMaterial({ color: 0xfb7185, transparent: true, opacity: 0.9 });
  const bandGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]);
  const band = new THREE.Line(bandGeo, bandMat);
  band.visible = false;
  scene.add(band);
  const aimMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  const aimGeo = new THREE.BufferGeometry();
  aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_SAMPLES * 3), 3));
  const aimLine = new THREE.Line(aimGeo, aimMat);
  aimLine.visible = false;
  scene.add(aimLine);

  // ---------- City ----------
  const city: City = createCity(THREE, CANNON, scene, world, {
    count: tuning.buildings,
    blockMaterial: blockMat,
    rng: Math.random,
    zone: { minX: -8, maxX: 8, minZ: -14, maxZ: -2 },
  });
  const bodyToBuilding = new Map<CANNON.Body, Building>();
  for (const b of city.buildings) for (const blk of b.blocks) bodyToBuilding.set(blk.body, b);
  const allBlockBodies: CANNON.Body[] = city.buildings.flatMap((b) => b.blocks.map((blk) => blk.body));

  // ---------- Mutable state ----------
  let balloon: Balloon | null = null;
  let armed = false;
  let inFlight = false;
  let hasHit = false;
  let pendingRemoveBalloon = false;
  let shots = 0;
  let flattened = 0;

  const splashes: SplashSystem[] = [];
  let dragging = false;
  const dragStart = { x: 0, y: 0 };
  const dragCurrent = { x: 0, y: 0 };

  let trainAngle = 0;
  let paused = false;
  let ended = false;
  let elapsedMs = 0;
  let lastEmit = -1;
  let lastTime = performance.now();
  let raf = 0;
  let watchdog: number | null = null;
  let resolveTimer: number | null = null;

  // Blimp hazard state.
  let blimp: {
    group: THREE.Group;
    geos: THREE.BufferGeometry[];
    mats: THREE.Material[];
    dir: number;
    falling: boolean;
    vy: number;
  } | null = null;
  let blimpsSpawned = 0;
  let nextBlimpAt = BLIMP_FIRST_MS;

  // ---------- Helpers ----------
  const localPoint = (e: PointerEvent): { x: number; y: number } => {
    const r = renderer.domElement.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const syncMesh = (mesh: THREE.Mesh, body: CANNON.Body): void => {
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  };
  const setBalloonAt = (p: THREE.Vector3): void => {
    if (!balloon) return;
    balloon.mesh.position.copy(p);
    balloon.body.position.set(p.x, p.y, p.z);
  };

  // Move the train + chase camera + slingshot mounts to the current angle.
  const updateTrain = (): void => {
    const sx = Math.sin(trainAngle);
    const cz = Math.cos(trainAngle);
    slingGroup.position.set(CITY_CENTER.x + TRAIN_R * sx, 0, CITY_CENTER.z + TRAIN_R * cz);
    slingGroup.rotation.set(0, trainAngle, 0); // local -Z faces the city centre
    slingGroup.updateMatrixWorld();
    anchor.copy(FORK_LOCAL).applyMatrix4(slingGroup.matrixWorld);
    postTopL.copy(POSTL_LOCAL).applyMatrix4(slingGroup.matrixWorld);
    postTopR.copy(POSTR_LOCAL).applyMatrix4(slingGroup.matrixWorld);

    camera.position.set(
      CITY_CENTER.x + (TRAIN_R + CAM_BACK) * sx,
      CAM_HEIGHT,
      CITY_CENTER.z + (TRAIN_R + CAM_BACK) * cz,
    );
    // Aim at a point partway out toward the train so the train + balloon sit in
    // the lower foreground while the city fills the upper-middle of the frame.
    const lookR = TRAIN_R * 0.42;
    camera.lookAt(CITY_CENTER.x + lookR * sx, 1.1, CITY_CENTER.z + lookR * cz);

    if (balloon && armed && !dragging) setBalloonAt(anchor);
  };

  const removeBalloon = (): void => {
    if (balloon) {
      balloon.body.removeEventListener('collide', onHit);
      balloon.dispose(scene, world);
      balloon = null;
    }
    aimLine.visible = false;
    band.visible = false;
  };

  // Continuous flatten evaluation — run every frame (cheap: ~buildings×layers).
  // A building counts the instant its tallest remaining block drops below its
  // threshold, so late/slow tower collapses and chain reactions are caught
  // (the old fixed 350/1300ms sampling missed tall towers still mid-fall).
  const evaluateFlatten = (): void => {
    for (const b of city.buildings) {
      if (b.flattened) continue;
      let maxY = -Infinity;
      for (const blk of b.blocks) maxY = Math.max(maxY, blk.body.position.y);
      if (maxY < b.flattenThresholdY) {
        b.flattened = true;
        flattened += 1;
        cb.onBuildingFlattened(flattened);
      }
    }
    // Whole city leveled → instant win; end the round early (don't wait out the
    // clock). Guarded by `ended` so it fires exactly once.
    if (!ended && city.buildings.length > 0 && flattened >= city.buildings.length) {
      ended = true;
      cb.onSfx?.('win');
      cb.onRoundEnd();
    }
  };

  const resolveBalloon = (): void => {
    if (!inFlight) return;
    inFlight = false;
    // Enter the "watch the cakes fall" state. The round does NOT end here —
    // it runs the full clock; the next balloon is granted on a minute timer.
    cb.onBalloonResolved();
  };

  // ---------- Cotton candy blimp ----------
  const spawnBlimp = (): void => {
    const group = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    // Cotton candy — a fluffy cluster of pastel puffs (pink + blue), all
    // sharing one sphere geo at different scales/positions for the billowy look.
    const puffGeo = new THREE.SphereGeometry(0.95, 14, 12);
    geos.push(puffGeo);
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xffb6e6, roughness: 0.95 });
    const blueMat = new THREE.MeshStandardMaterial({ color: 0xaed3ff, roughness: 0.95 });
    mats.push(pinkMat, blueMat);
    const puffs: Array<[number, number, number, number, THREE.Material]> = [
      [0, 0.2, 0, 1.3, pinkMat],
      [-1.1, 0.0, 0.1, 0.95, blueMat],
      [1.1, 0.05, -0.1, 0.95, blueMat],
      [-0.5, 0.7, 0.2, 0.85, pinkMat],
      [0.55, 0.65, -0.15, 0.85, pinkMat],
      [0, -0.05, 0.6, 0.8, blueMat],
      [0, 0.0, -0.6, 0.8, pinkMat],
    ];
    for (const [px, py, pz, s, m] of puffs) {
      const puff = new THREE.Mesh(puffGeo, m);
      puff.position.set(px, py, pz);
      puff.scale.setScalar(s);
      puff.castShadow = true;
      group.add(puff);
    }

    // Paper cone holding it up (points down).
    const coneGeo = new THREE.ConeGeometry(0.32, 1.2, 12);
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xf5e6c8, roughness: 0.85 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(0, -1.0, 0);
    cone.rotation.x = Math.PI; // point down
    cone.castShadow = true;
    group.add(cone);
    geos.push(coneGeo);
    mats.push(coneMat);

    const dir = blimpsSpawned % 2 === 0 ? 1 : -1; // alternate entry side
    group.position.set(CITY_CENTER.x - dir * BLIMP_SPAN, BLIMP_HEIGHT, CITY_CENTER.z);
    scene.add(group);
    blimp = { group, geos, mats, dir, falling: false, vy: 0 };
    blimpsSpawned += 1;
  };

  const removeBlimp = (): void => {
    if (!blimp) return;
    scene.remove(blimp.group);
    for (const g of blimp.geos) g.dispose();
    for (const m of blimp.mats) m.dispose();
    blimp = null;
    nextBlimpAt = elapsedMs + BLIMP_GAP_MS;
  };

  const crashBlimp = (): void => {
    if (!blimp) return;
    const p = blimp.group.position;
    const center = new THREE.Vector3(p.x, BLIMP_CRASH_Y, p.z);
    cb.onSfx?.('bubble');
    splashes.push(spawnSplash(THREE, scene, center));
    applyToppleBlast(CANNON, allBlockBodies, center, BLIMP_BLAST_STRENGTH, BLIMP_BLAST_RADIUS);
    removeBlimp();
  };

  const updateBlimp = (dt: number): void => {
    if (!blimp) {
      if (blimpsSpawned < BLIMP_MAX_PER_ROUND && elapsedMs >= nextBlimpAt) spawnBlimp();
      return;
    }
    if (blimp.falling) {
      blimp.vy += BLIMP_FALL_G * dt;
      blimp.group.position.y -= blimp.vy * dt;
      blimp.group.rotation.z += dt * 3.5;
      if (blimp.group.position.y <= BLIMP_CRASH_Y) crashBlimp();
      return;
    }
    // Drift across with a gentle bob.
    blimp.group.position.x += blimp.dir * BLIMP_SPEED * dt;
    blimp.group.position.y = BLIMP_HEIGHT + Math.sin(elapsedMs / 600) * 0.3;
    if (Math.abs(blimp.group.position.x - CITY_CENTER.x) > BLIMP_SPAN) {
      removeBlimp(); // drifted off un-hit — still counts toward the 2/round cap
      return;
    }
    // A balloon in flight that gets close knocks it down.
    if (balloon && inFlight) {
      const bp = balloon.body.position;
      const gp = blimp.group.position;
      if (Math.hypot(bp.x - gp.x, bp.y - gp.y, bp.z - gp.z) <= BLIMP_HIT_R) {
        blimp.falling = true;
        blimp.vy = 1;
        cb.onSfx?.('bubble');
      }
    }
  };

  // Collision: never mutate the world here (runs mid-step). Read + impulse +
  // render-only splash, and flag removal for the next tick.
  const onHit = (event: { body: CANNON.Body; contact: CANNON.ContactEquation }): void => {
    if (!balloon || !inFlight || hasHit) return;
    hasHit = true;
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
    const center = new THREE.Vector3(balloon.body.position.x, balloon.body.position.y, balloon.body.position.z);
    cb.onSfx?.('bubble');
    splashes.push(spawnSplash(THREE, scene, center));

    const hitBuilding = bodyToBuilding.has(event.body);
    if (hitBuilding) {
      applyToppleBlast(CANNON, allBlockBodies, center, BLAST_STRENGTH, BLAST_RADIUS);
    }
    pendingRemoveBalloon = true;
    // Linger so the kid can watch the cakes topple before the next question.
    resolveTimer = window.setTimeout(resolveBalloon, hitBuilding ? RESOLVE_DELAY_HIT : RESOLVE_DELAY_MISS);
  };

  // ---------- Pointer (slingshot) ----------
  const onPointerDown = (e: PointerEvent): void => {
    if (paused || !armed || inFlight || !balloon) return;
    dragging = true; // freezes the train while aiming
    const p = localPoint(e);
    dragStart.x = p.x;
    dragStart.y = p.y;
    dragCurrent.x = p.x;
    dragCurrent.y = p.y;
    band.visible = true;
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // synthetic / already-released pointer — capture is best-effort.
    }
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging || !balloon) return;
    const p = localPoint(e);
    dragCurrent.x = p.x;
    dragCurrent.y = p.y;
    const { dir, power, pullPx, t } = computeLaunch(THREE, camera, dragStart, dragCurrent, tuning);
    if (pullPx >= MIN_PULL_PX) {
      const pulled = anchor.clone().addScaledVector(dir, -t * MAX_PULLBACK_UNITS);
      setBalloonAt(pulled);
      const bp = band.geometry.getAttribute('position') as THREE.BufferAttribute;
      bp.setXYZ(0, postTopL.x, postTopL.y, postTopL.z);
      bp.setXYZ(1, pulled.x, pulled.y, pulled.z);
      bp.setXYZ(2, postTopR.x, postTopR.y, postTopR.z);
      bp.needsUpdate = true;
      band.visible = true;
      // Arced trajectory preview: simulate the ballistic path the balloon will
      // take. It launches from the ANCHOR (the balloon snaps back to the fork on
      // release) with velocity = dir * power, falling under the world's gravity.
      // Freeze the line at the ground so it ends where the balloon will land.
      const ap = aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      const v0x = dir.x * power;
      const v0y = dir.y * power;
      const v0z = dir.z * power;
      const groundY = tuning.balloonRadius;
      let landed = false;
      let lx = anchor.x;
      let ly = anchor.y;
      let lz = anchor.z;
      for (let i = 0; i < AIM_SAMPLES; i++) {
        if (!landed) {
          const tt = i * AIM_DT;
          const x = anchor.x + v0x * tt;
          const y = anchor.y + v0y * tt - 0.5 * tuning.gravity * tt * tt;
          const z = anchor.z + v0z * tt;
          if (y <= groundY && i > 0) {
            landed = true;
            lx = x;
            ly = groundY;
            lz = z;
          } else {
            lx = x;
            ly = y;
            lz = z;
          }
        }
        ap.setXYZ(i, lx, ly, lz);
      }
      ap.needsUpdate = true;
      aimLine.visible = true;
    } else {
      setBalloonAt(anchor);
      aimLine.visible = false;
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging || !balloon) return;
    dragging = false;
    aimLine.visible = false;
    band.visible = false;
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // harmless.
    }
    const { dir, power, pullPx } = computeLaunch(THREE, camera, dragStart, dragCurrent, tuning);
    setBalloonAt(anchor);
    if (pullPx < MIN_PULL_PX) return; // a tap, not a shot

    armed = false;
    inFlight = true;
    hasHit = false;
    shots += 1;
    balloon.body.addEventListener('collide', onHit);
    launchBalloon(CANNON, balloon, dir, power);
    watchdog = window.setTimeout(() => {
      pendingRemoveBalloon = true;
      resolveBalloon();
    }, 5500);
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  // ---------- Resize ----------
  const onResize = (): void => {
    const { w, h } = sizeOf();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  // ---------- Main loop ----------
  const FIXED = 1 / 60;
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (!paused && !ended) {
      if (pendingRemoveBalloon) {
        pendingRemoveBalloon = false;
        removeBalloon();
      }

      // Train rolls except while the kid is actively aiming.
      if (!dragging) trainAngle += TRAIN_SPEED * dt;
      updateTrain();

      world.step(FIXED, dt, 3);

      for (const b of city.buildings) for (const blk of b.blocks) syncMesh(blk.mesh, blk.body);
      if (balloon && inFlight) syncMesh(balloon.mesh, balloon.body);
      evaluateFlatten();

      for (let i = splashes.length - 1; i >= 0; i--) {
        if (!splashes[i].update(dt)) {
          splashes[i].dispose(scene);
          splashes.splice(i, 1);
        }
      }

      elapsedMs += dt * 1000;
      updateBlimp(dt);

      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmit) {
        lastEmit = sec;
        cb.onTimeLeft(remaining);
      }
      if (remaining <= 0) {
        ended = true;
        cb.onSfx?.('win');
        cb.onRoundEnd();
      }
    }

    renderer.render(scene, camera);
  };
  updateTrain(); // place train + camera before the first paint
  raf = window.requestAnimationFrame(tick);

  return {
    armBalloon(): void {
      if (balloon || ended) return;
      balloon = createBalloon(THREE, CANNON, scene, world, anchor, tuning.balloonRadius, balloonMat);
      armed = true;
      inFlight = false;
      hasHit = false;
    },
    isArmed(): boolean {
      return armed;
    },
    setPaused(p: boolean): void {
      paused = p;
      if (!p) lastTime = performance.now();
    },
    resize(): void {
      onResize();
    },
    getStats(): { flattened: number; shots: number } {
      return { flattened, shots };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      if (watchdog !== null) window.clearTimeout(watchdog);
      if (resolveTimer !== null) window.clearTimeout(resolveTimer);

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);

      for (const s of splashes) s.dispose(scene);
      splashes.length = 0;
      removeBalloon();
      removeBlimp();
      city.dispose(scene, world);

      scene.remove(ground, track, decorGroup, slingGroup, band, aimLine, ambient, sun);
      world.removeBody(groundBody);
      groundGeo.dispose();
      groundMat.dispose();
      trackGeo.dispose();
      trackMat.dispose();
      for (const g of decorGeos) g.dispose();
      for (const m of decorMats) m.dispose();
      for (const g of trainGeos) g.dispose();
      for (const m of trainMats) m.dispose();
      bandGeo.dispose();
      bandMat.dispose();
      aimGeo.dispose();
      aimMat.dispose();

      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
