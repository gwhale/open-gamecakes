// Marble Math — a 3D tilt-to-roll cake maze (Three.js + cannon-es).
//
// Roll a glossy cherry marble through a strawberry-cake maze by tilting the
// iPad. Each lane is joined to the next by a single gap blocked by a math
// gate; solve it and the gate drops. Dodge the dark cake-holes (each costs a
// life) and reach the mint goal pad to win.
//
// Tilt model: the board is physically FLAT — we steer world.gravity's X/Z
// from the calibrated gamma/beta so the marble rolls "downhill" toward the
// tilt. (Tilting the static walls would desync them from the collision
// bodies.) Pointer-drag is the no-sensor fallback and maps a drag offset to
// the same gravity steer.
//
// Layout is serpentine (stacked lanes, alternating-end gaps) so there's
// always exactly one solvable path and gates = lanes − 1. Difficulty scales
// by adding lanes + holes with tier.
//
// Bundle hygiene: `three` + `cannon-es` arrive as arguments (see ./types).

import { getSessionDurationMs } from '@/lib/games/session-duration';
import {
  MARBLE_MAX_LIVES,
  type ThreeNS,
  type CannonNS,
  type MarbleEngine,
  type MarbleCallbacks,
  type MarbleSceneProps,
} from './types';

// ---- Board geometry (world units) ----
const BOARD_W = 16;
const LANE_H = 3.2;
const WALL_T = 0.5;
const WALL_H = 1.4;
const GAP_W = 2.8; // gate gap width
const MARBLE_R = 0.55;
const FLOOR_TOP = 0;
const MARBLE_Y = FLOOR_TOP + MARBLE_R + 0.02;

// ---- Physics feel ----
const GRAVITY = 24;
const TILT_MAX = 0.62; // fraction of gravity steered horizontally at full tilt
const TILT_SMOOTH = 8; // gravity-steer lerp rate (1/s)
const LIN_DAMP = 0.45;
const ANG_DAMP = 0.5;

// ---- Tilt input mapping ----
const TILT_RANGE_DEG = 24; // degrees from baseline → full steer
const TILT_DEADZONE_DEG = 0.8;
const DRAG_MAX_PX = 130;

// ---- Hazards / pacing ----
const HOLE_R = 0.78;
const GOAL_R = 1.4;
const IMMUNITY_MS = 1600;
const GATE_TRIGGER_PAD = 0.9; // how close (z) to the divider triggers a gate

type ThreeMesh = import('three').Mesh;
type ThreeVec3 = import('three').Vector3;
type CannonBody = import('cannon-es').Body;

interface Gate {
  id: string;
  mesh: ThreeMesh;
  body: CannonBody;
  x: number;
  z: number;
  solved: boolean;
}

interface Hole {
  x: number;
  z: number;
}

function lanesForTier(tier: number): number {
  return Math.min(5, 3 + Math.floor(Math.max(0, tier - 1) / 3));
}
function holesForTier(tier: number, lanes: number): number {
  return Math.min(lanes - 1, Math.max(1, Math.floor((tier + 1) / 2)));
}

export function createMarbleEngine(
  THREE: ThreeNS,
  CANNON: CannonNS,
  container: HTMLElement,
  props: MarbleSceneProps,
  cb: MarbleCallbacks,
): MarbleEngine {
  const lanes = lanesForTier(props.tier);
  // Round length = the kid's chosen 1/2/3-min pick (see session-duration).
  const roundMs = getSessionDurationMs();
  const BOARD_D = lanes * LANE_H;
  const HALF_W = BOARD_W / 2;
  const HALF_D = BOARD_D / 2;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
  }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  // ---------- Scene + camera (angled top-down so the whole board reads) ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffe4ef);
  scene.fog = new THREE.Fog(0xffd6e6, 28, 60);
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(50, w0 / h0, 0.1, 120);
  // Pull back further for taller boards so all lanes stay in frame.
  const camDist = Math.max(15, HALF_D + 8);
  camera.position.set(0, camDist * 1.25, camDist * 0.95);
  camera.lookAt(0, 0, 0);

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff4f8, 1.1);
  sun.position.set(-8, 20, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 60;
  sc.left = -HALF_W - 4;
  sc.right = HALF_W + 4;
  sc.top = HALF_D + 4;
  sc.bottom = -HALF_D - 4;
  scene.add(sun);

  // ---------- Disposal bookkeeping ----------
  const geos: import('three').BufferGeometry[] = [];
  const mats: import('three').Material[] = [];
  const G = <T extends import('three').BufferGeometry>(g: T): T => (geos.push(g), g);
  const M = <T extends import('three').Material>(m: T): T => (mats.push(m), m);

  // ---------- Physics world ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  world.allowSleep = false;
  const marbleMat = new CANNON.Material('marble');
  const floorMat = new CANNON.Material('floor');
  const wallMat = new CANNON.Material('wall');
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, floorMat, { friction: 0.35, restitution: 0.12 }));
  world.addContactMaterial(new CANNON.ContactMaterial(marbleMat, wallMat, { friction: 0.05, restitution: 0.32 }));

  const board = new THREE.Group();
  scene.add(board);

  // ---------- Floor (cake layers) ----------
  const floorGeo = G(new THREE.BoxGeometry(BOARD_W + WALL_T, 0.8, BOARD_D + WALL_T));
  const floorMatMesh = M(new THREE.MeshStandardMaterial({ color: 0xfbbdd2, roughness: 0.95 }));
  const floor = new THREE.Mesh(floorGeo, floorMatMesh);
  floor.position.set(0, FLOOR_TOP - 0.4, 0);
  floor.receiveShadow = true;
  board.add(floor);
  const floorBody = new CANNON.Body({ mass: 0, material: floorMat });
  floorBody.addShape(new CANNON.Box(new CANNON.Vec3((BOARD_W + WALL_T) / 2, 0.4, (BOARD_D + WALL_T) / 2)));
  floorBody.position.set(0, FLOOR_TOP - 0.4, 0);
  world.addBody(floorBody);

  // Shared wall material/geometry.
  const wallMeshMat = M(new THREE.MeshStandardMaterial({ color: 0xd86f97, roughness: 0.7 }));
  const unitBox = G(new THREE.BoxGeometry(1, 1, 1));
  const wallBodies: CannonBody[] = [];
  const addWall = (cx: number, cz: number, lenX: number, lenZ: number): void => {
    const mesh = new THREE.Mesh(unitBox, wallMeshMat);
    mesh.scale.set(lenX, WALL_H, lenZ);
    mesh.position.set(cx, FLOOR_TOP + WALL_H / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    board.add(mesh);
    const body = new CANNON.Body({ mass: 0, material: wallMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(lenX / 2, WALL_H / 2, lenZ / 2)));
    body.position.set(cx, FLOOR_TOP + WALL_H / 2, cz);
    world.addBody(body);
    wallBodies.push(body);
  };

  // Perimeter.
  addWall(0, HALF_D, BOARD_W + WALL_T, WALL_T);
  addWall(0, -HALF_D, BOARD_W + WALL_T, WALL_T);
  addWall(-HALF_W, 0, WALL_T, BOARD_D);
  addWall(HALF_W, 0, WALL_T, BOARD_D);

  // Lane centers: lane 0 at the top (+z), increasing index → −z.
  const laneZ = (i: number): number => HALF_D - LANE_H * (i + 0.5);
  // Gap end per divider: even → right (+x), odd → left (−x). Serpentine.
  // `mazeIndex` flips the parity every other maze so consecutive mazes zig-zag
  // the OPPOSITE way — cheap variety without resizing the board or camera.
  const gapAtRight = (dividerIdx: number, mazeIndex: number): boolean =>
    (dividerIdx + mazeIndex) % 2 === 0;

  // ---------- Shared interior materials + geometries (built once, reused per
  // maze so we never leak GPU resources when the interior is rebuilt) ----------
  const gateMat = M(new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4, emissive: 0x3b0a73, emissiveIntensity: 0.35 }));
  const holeMat = M(new THREE.MeshStandardMaterial({ color: 0x3a1d2a, roughness: 1 }));
  const holeRim = M(new THREE.MeshStandardMaterial({ color: 0x9c5b76, roughness: 0.9 }));
  const holeGeo = G(new THREE.CircleGeometry(HOLE_R, 20));
  const rimGeo = G(new THREE.RingGeometry(HOLE_R, HOLE_R + 0.18, 20));
  const goalGeo = G(new THREE.CylinderGeometry(GOAL_R, GOAL_R, 0.12, 24));
  const goalMatMesh = M(new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x0f7a55, emissiveIntensity: 0.4, roughness: 0.5 }));
  const flagPoleGeo = G(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6));
  const flagPoleMat = M(new THREE.MeshStandardMaterial({ color: 0xffffff }));
  const flagGeo = G(new THREE.PlaneGeometry(0.7, 0.45));
  const flagMat = M(new THREE.MeshStandardMaterial({ color: 0xf43f5e, side: THREE.DoubleSide }));

  // ---------- Mutable interior state (rebuilt each maze) ----------
  // The perimeter walls + floor above are permanent. Everything a single maze
  // owns — dividers, gates, holes, goal, flag — lives in these arrays so the
  // next maze can tear it all down and rebuild in place.
  let gates: Gate[] = [];
  let holes: Hole[] = [];
  const interiorMeshes: ThreeMesh[] = [];
  const interiorBodies: CannonBody[] = [];
  let startX = -HALF_W + 1.3;
  let startZ = laneZ(0);
  let goalX = HALF_W - 1.5;
  let goalZ = laneZ(lanes - 1);

  // Interior wall = a divider that gets torn down between mazes (unlike the
  // permanent perimeter walls added via addWall above).
  const addInteriorWall = (cx: number, cz: number, lenX: number, lenZ: number): void => {
    const mesh = new THREE.Mesh(unitBox, wallMeshMat);
    mesh.scale.set(lenX, WALL_H, lenZ);
    mesh.position.set(cx, FLOOR_TOP + WALL_H / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    board.add(mesh);
    interiorMeshes.push(mesh);
    const body = new CANNON.Body({ mass: 0, material: wallMat });
    body.addShape(new CANNON.Box(new CANNON.Vec3(lenX / 2, WALL_H / 2, lenZ / 2)));
    body.position.set(cx, FLOOR_TOP + WALL_H / 2, cz);
    world.addBody(body);
    interiorBodies.push(body);
  };

  // Cumulative math-gate + maze counters (span the whole round, not one maze).
  let solvedTotal = 0;
  let facedTotal = 0;
  let mazesCleared = 0;
  let mazeIndex = 0;

  // Build (or rebuild) the maze interior for the given index. Difficulty ramps
  // as the round goes: after clearing a couple mazes we start adding an extra
  // hole so it stays interesting even if the tier is low.
  const buildInterior = (idx: number): void => {
    // Tear down the previous maze's meshes + bodies (shared geo/mats survive).
    for (const m of interiorMeshes) board.remove(m);
    for (const b of interiorBodies) world.removeBody(b);
    interiorMeshes.length = 0;
    interiorBodies.length = 0;
    gates = [];
    holes = [];

    // Gates + lane dividers.
    for (let d = 0; d < lanes - 1; d++) {
      const z = HALF_D - LANE_H * (d + 1);
      const right = gapAtRight(d, idx);
      const wallLen = BOARD_W - GAP_W;
      const wallCx = right ? -GAP_W / 2 : GAP_W / 2;
      addInteriorWall(wallCx, z, wallLen, WALL_T);
      const gateX = right ? HALF_W - GAP_W / 2 : -HALF_W + GAP_W / 2;
      const gw = GAP_W - 0.15;
      const mesh = new THREE.Mesh(unitBox, gateMat);
      mesh.scale.set(gw, WALL_H + 0.2, WALL_T + 0.1);
      mesh.position.set(gateX, FLOOR_TOP + (WALL_H + 0.2) / 2, z);
      mesh.castShadow = true;
      board.add(mesh);
      interiorMeshes.push(mesh);
      const body = new CANNON.Body({ mass: 0, material: wallMat });
      body.addShape(new CANNON.Box(new CANNON.Vec3(gw / 2, (WALL_H + 0.2) / 2, (WALL_T + 0.1) / 2)));
      body.position.set(gateX, FLOOR_TOP + (WALL_H + 0.2) / 2, z);
      world.addBody(body);
      interiorBodies.push(body);
      gates.push({ id: `m${idx}-gate-${d}`, mesh, body, x: gateX, z, solved: false });
    }

    // Holes — spread across interior lanes, nudged toward an edge so each is
    // dodgeable. Position drifts with the maze index so it doesn't feel canned.
    const holeCount = Math.min(lanes - 1, holesForTier(props.tier, lanes) + Math.floor(idx / 2));
    let placed = 0;
    for (let i = 1; i < lanes - 1 && placed < holeCount; i++) {
      const hx = -HALF_W + 3 + (((i + idx) * 4.7) % (BOARD_W - 6));
      const hz = laneZ(i) + ((i + idx) % 2 === 0 ? 1 : -1) * (LANE_H * 0.28);
      holes.push({ x: hx, z: hz });
      const disk = new THREE.Mesh(holeGeo, holeMat);
      disk.rotation.x = -Math.PI / 2;
      disk.position.set(hx, FLOOR_TOP + 0.02, hz);
      board.add(disk);
      interiorMeshes.push(disk);
      const rim = new THREE.Mesh(rimGeo, holeRim);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(hx, FLOOR_TOP + 0.03, hz);
      board.add(rim);
      interiorMeshes.push(rim);
      placed++;
    }

    // Start: lane 0 exits at whichever end divider 0's gap is NOT, so start on
    // the opposite side. Goal: far end of the last lane, opposite its entry gap.
    const firstRight = gapAtRight(0, idx);
    startX = firstRight ? -HALF_W + 1.3 : HALF_W - 1.3;
    startZ = laneZ(0);
    const goalRight = !gapAtRight(lanes - 2, idx);
    goalX = goalRight ? HALF_W - 1.5 : -HALF_W + 1.5;
    goalZ = laneZ(lanes - 1);
    const goalPad = new THREE.Mesh(goalGeo, goalMatMesh);
    goalPad.position.set(goalX, FLOOR_TOP + 0.06, goalZ);
    goalPad.receiveShadow = true;
    board.add(goalPad);
    interiorMeshes.push(goalPad);
    const flagPole = new THREE.Mesh(flagPoleGeo, flagPoleMat);
    flagPole.position.set(goalX, FLOOR_TOP + 0.8, goalZ);
    board.add(flagPole);
    interiorMeshes.push(flagPole);
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.position.set(goalX + 0.35, FLOOR_TOP + 1.35, goalZ);
    board.add(flag);
    interiorMeshes.push(flag);

    facedTotal += gates.length;
    cb.onGatesProgress(0, gates.length);
  };

  // Build the first maze so startX/startZ (and the interior) are in place
  // before the marble spawns.
  buildInterior(0);

  // ---------- Marble ----------
  const marbleGeo = G(new THREE.SphereGeometry(MARBLE_R, 24, 18));
  const marbleMatMesh = M(new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.12, metalness: 0.35 }));
  const marble = new THREE.Mesh(marbleGeo, marbleMatMesh);
  marble.castShadow = true;
  board.add(marble);
  // A tiny white highlight band sells the glassy marble look.
  const marbleBody = new CANNON.Body({
    mass: 1,
    material: marbleMat,
    shape: new CANNON.Sphere(MARBLE_R),
    position: new CANNON.Vec3(startX, MARBLE_Y, startZ),
  });
  marbleBody.linearDamping = LIN_DAMP;
  marbleBody.angularDamping = ANG_DAMP;
  world.addBody(marbleBody);

  // ---------- Sparkle puffs (gate open / goal) ----------
  const puffGeo = G(new THREE.SphereGeometry(0.12, 6, 5));
  const puffTemplate = M(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }));
  interface Puff { mesh: ThreeMesh; vel: ThreeVec3; life: number }
  const puffs: Puff[] = [];
  const burst = (x: number, y: number, z: number, color: number): void => {
    for (let i = 0; i < 12; i++) {
      const mat = puffTemplate.clone();
      mat.color = new THREE.Color(color);
      const m = new THREE.Mesh(puffGeo, mat);
      m.position.set(x, y, z);
      m.scale.setScalar(0.6 + Math.random());
      board.add(m);
      const a = Math.random() * Math.PI * 2;
      const up = 2 + Math.random() * 3;
      puffs.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 3, up, Math.sin(a) * 3), life: 1 });
    }
  };

  // ---------- Tilt / drag input → gravity steer ----------
  let tiltX = 0;
  let tiltZ = 0;
  const clampUnit = (v: number): number => Math.max(-1, Math.min(1, v));
  const withDeadzone = (deg: number): number => {
    if (Math.abs(deg) < TILT_DEADZONE_DEG) return 0;
    return clampUnit((deg - Math.sign(deg) * TILT_DEADZONE_DEG) / TILT_RANGE_DEG);
  };

  const onOrient = (e: DeviceOrientationEvent): void => {
    if (e.gamma === null || e.beta === null) return;
    const baseG = props.tiltBaselineGamma ?? 0;
    const baseB = props.tiltBaselineBeta ?? 0;
    // Landscape: gamma → left/right (world x), beta → toward/away (world z).
    tiltX = withDeadzone(e.gamma - baseG);
    tiltZ = withDeadzone(e.beta - baseB);
  };

  let dragging = false;
  const dragOrigin = { x: 0, y: 0 };
  const onPointerDown = (e: PointerEvent): void => {
    if (props.tiltEnabled) return; // tilt wins when available
    dragging = true;
    dragOrigin.x = e.clientX;
    dragOrigin.y = e.clientY;
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic/again — fine */
    }
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    tiltX = clampUnit((e.clientX - dragOrigin.x) / DRAG_MAX_PX);
    tiltZ = clampUnit((e.clientY - dragOrigin.y) / DRAG_MAX_PX);
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    tiltX = 0;
    tiltZ = 0;
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* fine */
    }
  };
  if (props.tiltEnabled) {
    window.addEventListener('deviceorientation', onOrient);
  } else {
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointercancel', onPointerUp);
  }

  // ---------- Resize ----------
  const onResize = (): void => {
    const { w, h } = sizeOf();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  // ---------- State ----------
  let paused = false;
  let ended = false;
  let atGate: Gate | null = null; // gate currently blocking (challenge up)
  let wrongAnswers = 0;
  let lives = MARBLE_MAX_LIVES;
  let immuneUntil = 0;
  let elapsedMs = 0;
  let lastEmit = -1;
  let lastTime = performance.now();
  let curGravX = 0;
  let curGravZ = 0;
  let raf = 0;

  const resetMarble = (): void => {
    marbleBody.position.set(startX, MARBLE_Y, startZ);
    marbleBody.velocity.setZero();
    marbleBody.angularVelocity.setZero();
  };

  const FIXED = 1 / 60;
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    if (!paused && !ended) {
      // Smoothly steer gravity toward the current tilt.
      const targetX = tiltX * GRAVITY * TILT_MAX;
      const targetZ = tiltZ * GRAVITY * TILT_MAX;
      const k = Math.min(1, TILT_SMOOTH * dt);
      curGravX += (targetX - curGravX) * k;
      curGravZ += (targetZ - curGravZ) * k;
      world.gravity.set(curGravX, -GRAVITY, curGravZ);

      world.step(FIXED, dt, 3);

      marble.position.set(marbleBody.position.x, marbleBody.position.y, marbleBody.position.z);
      marble.quaternion.set(
        marbleBody.quaternion.x,
        marbleBody.quaternion.y,
        marbleBody.quaternion.z,
        marbleBody.quaternion.w,
      );

      const mx = marbleBody.position.x;
      const mz = marbleBody.position.z;

      // Gate trigger — rolled up to a still-locked gate's gap.
      if (!atGate) {
        for (const g of gates) {
          if (g.solved) continue;
          if (Math.abs(mz - g.z) < GATE_TRIGGER_PAD + MARBLE_R && Math.abs(mx - g.x) < GAP_W / 2 + 0.4) {
            atGate = g;
            paused = true;
            cb.onSfx?.('gate');
            cb.onGateReached(g.id);
            break;
          }
        }
      }

      // Hole check (unless freshly respawned).
      if (now > immuneUntil) {
        for (const h of holes) {
          if (Math.hypot(mx - h.x, mz - h.z) < HOLE_R) {
            lives -= 1;
            cb.onSfx?.('fall');
            burst(h.x, FLOOR_TOP + 0.2, h.z, 0x6b2f45);
            if (lives <= 0) {
              ended = true;
              cb.onLifeLost(0);
            } else {
              resetMarble();
              immuneUntil = now + IMMUNITY_MS;
              cb.onLifeLost(lives);
            }
            break;
          }
        }
      }

      // Goal check — reaching the goal clears the maze and immediately builds
      // a fresh one in its place. The round keeps going until the clock or
      // lives run out, so one round now contains as many mazes as the kid can
      // solve in the time.
      if (!ended && Math.hypot(mx - goalX, mz - goalZ) < GOAL_R) {
        mazesCleared += 1;
        burst(goalX, FLOOR_TOP + 0.5, goalZ, 0x34d399);
        cb.onSfx?.('win');
        cb.onMazeCleared(mazesCleared);
        mazeIndex += 1;
        buildInterior(mazeIndex);
        resetMarble();
        // Brief immunity so the marble doesn't clip a freshly-placed hole on
        // the respawn frame.
        immuneUntil = now + 600;
      }

      // Timer.
      elapsedMs += dt * 1000;
      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmit) {
        lastEmit = sec;
        cb.onTimeLeft(remaining);
      }
      if (remaining <= 0 && !ended) {
        ended = true;
        cb.onTimeUp();
      }
    }

    // Sparkle puffs animate regardless of pause.
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.life -= dt * 1.5;
      pf.mesh.position.addScaledVector(pf.vel, dt);
      pf.vel.y -= dt * 6;
      const sm = pf.mesh.material as import('three').MeshStandardMaterial;
      sm.opacity = Math.max(0, pf.life);
      if (pf.life <= 0) {
        board.remove(pf.mesh);
        sm.dispose();
        puffs.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    setPaused(p: boolean): void {
      paused = p;
      if (!p) lastTime = performance.now();
    },
    resolveGate(correct: boolean): void {
      const g = atGate;
      atGate = null;
      paused = false;
      lastTime = performance.now();
      if (!g) return;
      if (correct) {
        g.solved = true;
        solvedTotal += 1;
        world.removeBody(g.body);
        board.remove(g.mesh);
        burst(g.x, FLOOR_TOP + 0.7, g.z, 0xa78bfa);
        cb.onSfx?.('correct');
        cb.onGatesProgress(gates.filter((x) => x.solved).length, gates.length);
      } else {
        wrongAnswers += 1;
        cb.onSfx?.('wrong');
        // Nudge the marble back into its lane so it doesn't instantly
        // re-trigger the still-locked gate.
        const backZ = g.z + (g.z < marbleBody.position.z ? 1 : -1) * (LANE_H * 0.5);
        marbleBody.position.z = backZ;
        marbleBody.velocity.setZero();
        marbleBody.angularVelocity.setZero();
      }
    },
    resize(): void {
      onResize();
    },
    getStats(): { gatesTotal: number; gatesSolved: number; wrongAnswers: number; lives: number; mazesCleared: number } {
      return { gatesTotal: facedTotal, gatesSolved: solvedTotal, wrongAnswers, lives, mazesCleared };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('deviceorientation', onOrient);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('resize', onResize);
      for (const pf of puffs) {
        board.remove(pf.mesh);
        (pf.mesh.material as import('three').Material).dispose();
      }
      scene.remove(board, ambient, sun);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
