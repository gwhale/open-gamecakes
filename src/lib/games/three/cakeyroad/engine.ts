// Cakey Road 3D engine — a Crossy-Road-style hopper rendered in three.js.
//
// The player is the kid's own Cakey Store cupcake (buildCupcakeModel). It hops
// cell-to-cell up an endless procession of lanes (grass / road / river / rail /
// gate). Roads and rails carry striped candy hazards; rivers carry drifting
// wafer rafts you must ride; gate rows pose a math problem. The engine owns the
// scene, the round loop, lanes, hazards, lives, coins, and the clock; it fires
// callbacks to the React host (distance/coins/lives/time, math gates, round end).
//
// No runtime `three` import — the namespace arrives as a factory arg (bundle
// hygiene, same as Cakey Chase / Castle / the town).

import type * as THREE from 'three';
import {
  coerceCupcakeConfig,
  FROSTING_COLORS,
  WRAPPER_COLORS,
  type CupcakeConfig,
} from '@/lib/cupcake/config';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import { CAKEY_ROAD } from '@/lib/games/theme/palette';
import type {
  ThreeNS,
  CakeyRoadSceneProps,
  CakeyRoadEngine,
  CakeyRoadCallbacks,
  CakeyRoadTuning,
  HopDir,
} from './types';
import { LIVES } from './types';
import {
  createLaneGenerator,
  COLS,
  CENTER_COL,
  type LaneSpec,
} from './lanes';

// ---- world constants ----
const CELL = 1;                     // one grid cell = one world unit
const BED_W = COLS + 4;             // lane bed width (with off-screen margins)
const WRAP_W = COLS + 4;            // hazard/raft wrap width in cells
const EDGE = (COLS - 1) / 2 + 0.5;  // |cellX| beyond this = off the play strip
const HOP_H = 0.55;                 // hop arc height
const AHEAD = 16;                   // rows generated ahead of the player
const BEHIND = 5;                   // rows kept behind before reaping
const CAM_H = 8.4;                  // low isometric toy-table camera
const CAM_BACK = 7.2;
                                    // enough foreground that the D-pad never
                                    // sits on top of the hopper
const RESPAWN_GRACE_MS = 800;

// row → world z. Forward (higher row) is away from the camera (more negative z).
const rz = (row: number): number => -row * CELL;
// column → world x (centered).
const rx = (col: number): number => (col - CENTER_COL) * CELL;
// wrap a moving cell-x into [-WRAP_W/2, WRAP_W/2)
const wrapX = (v: number): number => ((v % WRAP_W) + WRAP_W) % WRAP_W - WRAP_W / 2;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

type RailMode = 'idle' | 'warn' | 'run';

interface Lane {
  spec: LaneSpec;
  group: THREE.Group;
  scroll: number;               // accumulated drift (cells) for road/river
  hazards: THREE.Object3D[];    // road hazards / river rafts (index = k)
  coin: THREE.Object3D | null;
  coinTaken: boolean;
  gateCleared: boolean;
  // rail state machine
  railMode: RailMode;
  railTimer: number;            // ms remaining in the current rail phase
  train: THREE.Object3D | null;
  trainX: number;               // cell-x of the train while running
  signal: THREE.Mesh | null;
}

export function createCakeyRoadEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: CakeyRoadSceneProps,
  tuning: CakeyRoadTuning,
  cb: CakeyRoadCallbacks,
): CakeyRoadEngine {
  const roundMs = getSessionDurationMs();
  const gen = createLaneGenerator(tuning);

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  // ---------- Scene + warm sky ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdff4ff);
  scene.fog = new THREE.Fog(0xdff4ff, 20, 38);
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(44, w0 / h0, 0.1, 120);
  let camZ = CAM_BACK;
  const placeCamera = (): void => {
    camera.position.set(0, CAM_H, camZ);
    camera.lookAt(0, 0.15, camZ - 8.7);
  };

  // ---------- Lights (warm, high-key, no dynamic shadows in v1) ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.82));
  const sun = new THREE.DirectionalLight(0xffffff, 1.45);
  sun.position.set(-7, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -12;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x74a94d, 0.55));

  // ---------- Shared geometry + material library ----------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const g = <T extends THREE.BufferGeometry>(v: T): T => { geos.push(v); return v; };
  const m = <T extends THREE.Material>(v: T): T => { mats.push(v); return v; };
  const std = (color: number, rough = 0.58): THREE.MeshStandardMaterial =>
    m(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.02 }));
  const shadows = <T extends THREE.Object3D>(object: T): T => {
    object.traverse((child) => {
      if ('isMesh' in child && child.isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return object;
  };

  const geoBed = g(new THREE.BoxGeometry(BED_W, 0.22, 0.98));
  const geoStud = g(new THREE.CylinderGeometry(0.12, 0.12, 0.075, 12));
  const matBed: Record<string, THREE.MeshStandardMaterial> = {
    grassLit: std(CAKEY_ROAD.GRASS_LIT, 0.95),
    grassMid: std(CAKEY_ROAD.GRASS_MID, 0.95),
    road: std(CAKEY_ROAD.ROAD_COCOA, 0.9),
    river: std(CAKEY_ROAD.RIVER_SYRUP, 0.18),          // glossy = wet
    rail: std(CAKEY_ROAD.RAIL_GRAVEL, 0.95),
    gate: std(CAKEY_ROAD.GRASS_LIT, 0.95),
  };
  const geoDash = g(new THREE.BoxGeometry(0.5, 0.02, 0.12));
  const matDash = std(CAKEY_ROAD.ROAD_DASH, 0.6);
  const geoRail = g(new THREE.BoxGeometry(BED_W, 0.06, 0.09));
  const matRailTie = std(CAKEY_ROAD.RAIL_TIE, 0.6);

  const geoHazard = g(new THREE.BoxGeometry(1.3, 0.5, 0.72));
  const geoStripe = g(new THREE.BoxGeometry(0.22, 0.52, 0.74));
  const matHaz: Record<string, THREE.MeshStandardMaterial> = {
    peppermint: std(CAKEY_ROAD.HAZARD_PEPPERMINT, 0.5),
    licorice: std(CAKEY_ROAD.HAZARD_LICORICE, 0.4),
    trolley: std(CAKEY_ROAD.HAZARD_TROLLEY, 0.7),
  };
  const matStripe = std(CAKEY_ROAD.HAZARD_PEPPERMINT_STRIPE, 0.5);

  const geoRaft = g(new THREE.BoxGeometry(tuning.raftLen * 0.92, 0.14, 0.8));
  const matRaft = std(CAKEY_ROAD.RAFT_WAFER, 0.85);

  const geoCoin = g(new THREE.CylinderGeometry(0.26, 0.26, 0.08, 18));
  const matCoin = std(CAKEY_ROAD.COOKIE_COIN, 0.5);
  const geoChip = g(new THREE.SphereGeometry(0.04, 6, 5));
  const matChip = std(CAKEY_ROAD.COOKIE_CHIP, 0.5);

  const geoTrunk = g(new THREE.BoxGeometry(0.32, 0.65, 0.32));
  const matTrunk = std(CAKEY_ROAD.TREE_TRUNK, 0.85);
  const geoCanopy = g(new THREE.BoxGeometry(0.82, 0.68, 0.82));
  const matCanopy = std(CAKEY_ROAD.TREE_CANOPY, 0.7);

  const geoPost = g(new THREE.BoxGeometry(0.22, 1.5, 0.22));
  const geoArchTop = g(new THREE.BoxGeometry(BED_W * 0.5, 0.3, 0.3));
  const matArch = std(CAKEY_ROAD.GATE_ARCH, 0.5);
  const geoSignal = g(new THREE.BoxGeometry(0.18, 0.18, 0.18));
  const matSignalStop = m(new THREE.MeshStandardMaterial({ color: CAKEY_ROAD.SIGNAL_STOP, roughness: 0.4, emissive: CAKEY_ROAD.SIGNAL_STOP, emissiveIntensity: 0.0 }));

  const geoTrainCar = g(new THREE.BoxGeometry(2.4, 0.8, 0.8));
  const matTrainBody = std(CAKEY_ROAD.TRAIN_BODY, 0.5);
  const matTrainTrim = std(CAKEY_ROAD.TRAIN_TRIM, 0.6);
  const matLamp = m(new THREE.MeshStandardMaterial({ color: CAKEY_ROAD.TRAIN_LAMP, roughness: 0.3, emissive: CAKEY_ROAD.TRAIN_LAMP, emissiveIntensity: 0.6 }));

  // Soft radial glow sprite (for gate halos) — a tiny canvas texture.
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d')!;
    const grd = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,230,168,0.9)');
    grd.addColorStop(1, 'rgba(255,230,168,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; texs.push(t); return t;
  })();

  // ---------- Player: a buildable LEGO Cakey ----------
  const player = new THREE.Group();
  const cakey = coerceCupcakeConfig(props.cupcakeConfig as CupcakeConfig | undefined);
  const wrapperColor = Number.parseInt(WRAPPER_COLORS[cakey.wrapper].paper.slice(1), 16);
  const frostingColor = Number.parseInt(FROSTING_COLORS[cakey.frosting].fill.slice(1), 16);
  const wrapperMat = std(wrapperColor, 0.42);
  const frostingMat = std(frostingColor, 0.38);
  const faceMat = std(0x2b1b16, 0.5);
  const cherryMat = std(0xe11d48, 0.38);
  const model = { group: new THREE.Group() };
  const addBrick = (sx: number, sy: number, sz: number, x: number, y: number, z: number, material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(g(new THREE.BoxGeometry(sx, sy, sz)), material);
    mesh.position.set(x, y, z); model.group.add(mesh); return mesh;
  };
  addBrick(0.72, 0.46, 0.62, 0, 0.29, 0, wrapperMat);
  addBrick(0.88, 0.28, 0.72, 0, 0.64, 0, frostingMat);
  addBrick(0.58, 0.23, 0.52, 0, 0.88, 0, frostingMat);
  for (const x of [-0.23, 0.23]) {
    const stud = new THREE.Mesh(geoStud, frostingMat); stud.position.set(x, 1.04, 0); model.group.add(stud);
  }
  addBrick(0.09, 0.1, 0.04, -0.16, 0.68, 0.37, faceMat);
  addBrick(0.09, 0.1, 0.04, 0.16, 0.68, 0.37, faceMat);
  addBrick(0.2, 0.05, 0.04, 0, 0.53, 0.37, faceMat);
  const topping = cakey.topping !== 'none'
    ? addBrick(0.22, 0.22, 0.22, 0, 1.18, 0, cherryMat)
    : null;
  shadows(model.group);
  model.group.scale.setScalar(1.02);
  player.add(model.group);
  const toppingBaseY = topping ? topping.position.y : 0;
  // mandatory finder-ring — a cool additive disc so a light cupcake never
  // disappears on a warm/cream lane.
  const ring = new THREE.Mesh(
    g(new THREE.RingGeometry(0.34, 0.5, 24)),
    m(new THREE.MeshBasicMaterial({ color: CAKEY_ROAD.PLAYER_RING, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; player.add(ring);
  const disc = new THREE.Mesh(
    g(new THREE.CircleGeometry(0.34, 20)),
    m(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16, depthWrite: false })),
  );
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.11; player.add(disc);
  scene.add(player);

  // ---------- Lane management ----------
  const lanes = new Map<number, Lane>();
  let minRow = 0;
  let maxRow = -1;

  const buildLane = (spec: LaneSpec): Lane => {
    const group = new THREE.Group();
    group.position.z = rz(spec.row);
    const bedMat =
      spec.type === 'road' ? matBed.road
      : spec.type === 'river' ? matBed.river
      : spec.type === 'rail' ? matBed.rail
      : spec.type === 'gate' ? matBed.gate
      : spec.band === 'lit' ? matBed.grassLit : matBed.grassMid;
    const bed = new THREE.Mesh(geoBed, bedMat);
    bed.position.y = -0.1;
    bed.receiveShadow = true;
    group.add(bed);

    // Every safe row is a real toy baseplate: a disciplined stud grid is the
    // visual contract, not surface noise painted onto a flat plane.
    if (spec.type === 'grass' || spec.type === 'gate') {
      const studs = new THREE.InstancedMesh(geoStud, bedMat, COLS + 2);
      const matrix = new THREE.Matrix4();
      for (let col = -1; col <= COLS; col++) {
        matrix.makeTranslation(rx(col), 0.045, 0);
        studs.setMatrixAt(col + 1, matrix);
      }
      studs.receiveShadow = true;
      group.add(studs);
    }

    const lane: Lane = {
      spec, group, scroll: spec.phase * WRAP_W, hazards: [], coin: null, coinTaken: false,
      gateCleared: false, railMode: 'idle', railTimer: 900 + Math.random() * 2600,
      train: null, trainX: 0, signal: null,
    };

    if (spec.type === 'road') {
      for (const x of dashXs()) { const d = new THREE.Mesh(geoDash, matDash); d.position.set(x, 0.01, 0); group.add(d); }
      const n = Math.ceil(WRAP_W / spec.gap);
      for (let k = 0; k < n; k++) {
        const car = new THREE.Group();
        const body = new THREE.Mesh(geoHazard, matHaz[spec.hazardKind]); body.position.y = 0.25; car.add(body);
        if (spec.hazardKind === 'peppermint') { const s = new THREE.Mesh(geoStripe, matStripe); s.position.y = 0.25; car.add(s); }
        for (const sx of [-0.38, 0.38]) {
          const stud = new THREE.Mesh(geoStud, matHaz[spec.hazardKind]); stud.position.set(sx, 0.54, 0); car.add(stud);
        }
        shadows(car);
        car.position.y = 0; group.add(car); lane.hazards.push(car);
      }
    } else if (spec.type === 'river') {
      const n = Math.ceil(WRAP_W / (spec.gap + spec.raftLen));
      for (let k = 0; k < n; k++) {
        const raft = new THREE.Mesh(geoRaft, matRaft); raft.position.y = -0.02; raft.castShadow = true; raft.receiveShadow = true; group.add(raft); lane.hazards.push(raft);
      }
    } else if (spec.type === 'rail') {
      for (const dzoff of [-0.18, 0.18]) { const r = new THREE.Mesh(geoRail, matRailTie); r.position.set(0, 0.02, dzoff); group.add(r); }
      const sig = new THREE.Mesh(geoSignal, matSignalStop.clone()); mats.push(sig.material as THREE.Material);
      sig.position.set(EDGE + 0.4, 0.4, 0); group.add(sig); lane.signal = sig;
    } else if (spec.type === 'gate') {
      const postL = new THREE.Mesh(geoPost, matArch); postL.position.set(-BED_W * 0.22, 0.75, 0); group.add(postL);
      const postR = new THREE.Mesh(geoPost, matArch); postR.position.set(BED_W * 0.22, 0.75, 0); group.add(postR);
      const top = new THREE.Mesh(geoArchTop, matArch); top.position.set(0, 1.5, 0); group.add(top);
      const halo = new THREE.Sprite(m(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false })) as THREE.SpriteMaterial);
      halo.scale.set(3, 3, 1); halo.position.set(0, 1.4, 0.1); group.add(halo);
    } else {
      // grass — cosmetic edge trees (never block the play strip)
      const nTrees = Math.random() < 0.6 ? (Math.random() < 0.5 ? 1 : 2) : 0;
      for (let i = 0; i < nTrees; i++) {
        const side = i === 0 ? -1 : 1;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(geoTrunk, matTrunk); trunk.position.y = 0.25; tree.add(trunk);
        const canopy = new THREE.Mesh(geoCanopy, matCanopy); canopy.position.y = 0.72; tree.add(canopy);
        const crown = new THREE.Mesh(geoCanopy, matCanopy); crown.scale.set(0.72, 0.7, 0.72); crown.position.y = 1.16; tree.add(crown);
        tree.position.set(side * (EDGE + 0.6 + Math.random() * 0.8), 0, 0);
        group.add(shadows(tree));
      }
    }

    if (spec.hasCoin) {
      const coin = new THREE.Group();
      const disc2 = new THREE.Mesh(geoCoin, matCoin); disc2.rotation.x = Math.PI / 2; coin.add(disc2);
      const chip = new THREE.Mesh(geoChip, matChip); chip.position.set(0.08, 0, 0.09); coin.add(chip);
      coin.position.set(rx(spec.coinCol), 0.4, 0); group.add(coin); lane.coin = coin;
    }

    scene.add(group);
    return lane;
  };

  const dashXs = (): number[] => {
    const out: number[] = [];
    for (let x = -BED_W / 2 + 0.5; x <= BED_W / 2; x += 1.4) out.push(x);
    return out;
  };

  const ensureLanes = (): void => {
    const need = Math.max(maxRow, pRow + AHEAD);
    for (let r = maxRow + 1; r <= need; r++) { lanes.set(r, buildLane(gen.next(r))); maxRow = r; }
    // reap behind
    const floor = Math.max(0, pRow - BEHIND);
    for (let r = minRow; r < floor; r++) {
      const ln = lanes.get(r);
      if (ln) { scene.remove(ln.group); lanes.delete(r); }
    }
    minRow = floor;
  };

  const laneAt = (row: number): Lane | undefined => lanes.get(row);

  // ---------- Player state ----------
  let pCol = CENTER_COL;
  let pRow = 0;
  let furthest = 0;
  let hopping = false;
  let hopT = 0;
  let hopFromX = 0, hopFromZ = 0, hopToX = 0, hopToZ = 0, hopDir: HopDir = 'up';
  let queued: HopDir | null = null;
  let onRaft = false;
  let riverDrift = 0;      // cell-x carried by the current raft
  let lastSafeRow = 0;
  let wobble = 0;         // landing squash-wobble amount, decays
  let graceUntil = 0;

  // ---------- Round state ----------
  let coins = 0;
  let lives = LIVES;
  let deaths = 0;
  let gatesCleared = 0;
  let wrongAnswers = 0;
  let elapsedMs = 0;
  let lastEmitSec = -1;
  let awaiting = false;
  let ended = false;
  let paused = false;
  let raf = 0;
  let last = performance.now();

  ensureLanes();
  player.position.set(rx(pCol), 0, rz(pRow));
  camZ = rz(pRow) + CAM_BACK; placeCamera();
  cb.onLives(lives); cb.onCoins(coins); cb.onDistance(furthest);

  // ---------- Hop ----------
  const startHop = (dir: HopDir): void => {
    if (hopping || awaiting || ended) return;
    let nc = pCol, nr = pRow;
    if (dir === 'up') nr = pRow + 1;
    else if (dir === 'down') nr = Math.max(0, pRow - 1);
    else if (dir === 'left') nc = clamp(pCol - 1, 0, COLS - 1);
    else nc = clamp(pCol + 1, 0, COLS - 1);
    if (nc === pCol && nr === pRow) return; // blocked at an edge
    hopDir = dir;
    hopFromX = player.position.x; hopFromZ = player.position.z;
    hopToX = rx(nc); hopToZ = rz(nr);
    hopT = 0; hopping = true; onRaft = false; riverDrift = 0;
    pCol = nc; pRow = nr;
    cb.onSfx?.('hop');
  };

  const openChallenge = (): void => { awaiting = true; cb.onChallenge('gate'); };

  const endRound = (reason: 'lose' | 'timeout'): void => {
    if (ended) return;
    ended = true;
    cb.onSfx?.(reason === 'timeout' ? 'timeUp' : 'thud');
    cb.onRoundEnd(reason);
  };

  const loseLife = (reason: 'splash' | 'thud'): void => {
    if (performance.now() < graceUntil) return;
    deaths += 1; lives -= 1; cb.onLives(lives); cb.onSfx?.(reason);
    if (lives <= 0) { endRound('lose'); return; }
    // respawn on the last safe row
    pRow = lastSafeRow; pCol = clamp(pCol, 0, COLS - 1);
    onRaft = false; riverDrift = 0; hopping = false;
    player.position.set(rx(pCol), 0, rz(pRow));
    graceUntil = performance.now() + RESPAWN_GRACE_MS;
  };

  const collectCoinIfAny = (): void => {
    const ln = laneAt(pRow);
    if (ln?.coin && !ln.coinTaken && ln.spec.coinCol === pCol) {
      ln.coinTaken = true; ln.coin.visible = false;
      coins += 1; cb.onCoins(coins); cb.onSfx?.('coin');
    }
  };

  const onLanded = (): void => {
    furthest = Math.max(furthest, pRow); cb.onDistance(furthest);
    ensureLanes();
    collectCoinIfAny();
    const ln = laneAt(pRow);
    if (!ln) return;
    if (ln.spec.type === 'gate' && !ln.gateCleared) { openChallenge(); return; }
    if (ln.spec.type === 'grass' || ln.spec.type === 'gate') lastSafeRow = pRow;
  };

  // ---------- Hazard positions ----------
  const hazardCellX = (lane: Lane, k: number): number =>
    wrapX(lane.spec.dir * lane.scroll + k * (lane.spec.gap + (lane.spec.type === 'river' ? lane.spec.raftLen : 0)));

  // ---------- Per-frame simulation ----------
  const stepPlayer = (dt: number): void => {
    // start a queued hop
    if (!hopping && !awaiting && queued) { const q = queued; queued = null; startHop(q); }

    if (hopping) {
      hopT += (dt * 1000) / tuning.hopMs;
      if (hopT >= 1) {
        hopT = 1; hopping = false; wobble = 0.35;
        player.position.set(hopToX, 0, hopToZ);
        onLanded();
      } else {
        player.position.x = hopFromX + (hopToX - hopFromX) * hopT;
        player.position.z = hopFromZ + (hopToZ - hopFromZ) * hopT;
      }
    }

    // grounded interactions (skip while hopping / gate open / in grace handled per-hazard)
    if (!hopping && !awaiting && !ended) {
      const ln = laneAt(pRow);
      if (ln) {
        if (ln.spec.type === 'river') {
          // must be on a raft, else drown; ride carries the player in x
          if (!onRaft) {
            const pcx = pCol - CENTER_COL;
            let covered = -1;
            for (let k = 0; k < ln.hazards.length; k++) {
              if (Math.abs(pcx - hazardCellX(ln, k)) <= ln.spec.raftLen / 2) { covered = k; break; }
            }
            if (covered >= 0) { onRaft = true; riverDrift = 0; }
            else { loseLife('splash'); }
          }
          if (onRaft) {
            riverDrift += ln.spec.dir * ln.spec.speed * dt;
            while (Math.abs(riverDrift) >= 1) { const s = Math.sign(riverDrift); pCol += s; riverDrift -= s; }
            const cellX = (pCol - CENTER_COL) + riverDrift;
            if (Math.abs(cellX) > EDGE) { loseLife('splash'); }
            else { player.position.x = rx(pCol) + riverDrift * CELL; }
          }
        } else if (ln.spec.type === 'road') {
          const pcx = pCol - CENTER_COL;
          for (let k = 0; k < ln.hazards.length; k++) {
            if (Math.abs(pcx - hazardCellX(ln, k)) < 0.78) { loseLife('thud'); break; }
          }
        } else if (ln.spec.type === 'rail' && ln.railMode === 'run') {
          if (Math.abs((pCol - CENTER_COL) - ln.trainX) < 1.4) loseLife('thud');
        }
      }
    }

    // ---- player visual (jelly-hop) ----
    const yArc = hopping ? Math.sin(Math.PI * hopT) * HOP_H : 0;
    model.group.position.y = yArc;
    const stretch = hopping ? 0.3 * Math.sin(Math.PI * hopT) : 0;
    const wob = wobble > 0 ? Math.sin(wobble * 22) * wobble * 0.4 : 0;
    const sy = 1 + stretch - wob;
    const sxz = 1 / Math.sqrt(Math.max(0.3, sy));
    model.group.scale.set(1.02 * sxz, 1.02 * sy, 1.02 * sxz);
    // tip toward travel
    const lean = hopping ? 0.28 * Math.sin(Math.PI * hopT) : 0;
    model.group.rotation.set(0, 0, 0);
    if (hopDir === 'up') model.group.rotation.x = -lean;
    else if (hopDir === 'down') model.group.rotation.x = lean;
    else if (hopDir === 'left') model.group.rotation.z = lean;
    else model.group.rotation.z = -lean;
    // topping lag (secondary motion)
    if (topping) topping.position.y = toppingBaseY + yArc * 0.12 + wob * 0.5;
    if (wobble > 0) wobble = Math.max(0, wobble - dt * 2.2);
  };

  const stepLanes = (dt: number, now: number): void => {
    for (const ln of lanes.values()) {
      const s = ln.spec;
      if (s.type === 'road' || s.type === 'river') {
        ln.scroll += s.speed * dt;
        for (let k = 0; k < ln.hazards.length; k++) ln.hazards[k].position.x = hazardCellX(ln, k) * CELL;
      } else if (s.type === 'rail') {
        stepRail(ln, dt);
      }
      if (ln.coin && !ln.coinTaken) { ln.coin.rotation.z += dt * 3; ln.coin.position.y = 0.4 + Math.sin(now / 300 + s.row) * 0.05; }
    }
  };

  const stepRail = (ln: Lane, dt: number): void => {
    ln.railTimer -= dt * 1000;
    if (ln.railMode === 'idle') {
      if (ln.signal) (ln.signal.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      if (ln.railTimer <= 0) { ln.railMode = 'warn'; ln.railTimer = ln.spec.trainWarnMs; cb.onSfx?.('swoop'); }
    } else if (ln.railMode === 'warn') {
      if (ln.signal) (ln.signal.material as THREE.MeshStandardMaterial).emissiveIntensity = (Math.floor(performance.now() / 180) % 2) ? 0.9 : 0.1;
      if (ln.railTimer <= 0) {
        ln.railMode = 'run';
        ln.trainX = ln.spec.dir > 0 ? -EDGE - 3 : EDGE + 3;
        if (!ln.train) {
          const t = new THREE.Group();
          for (let i = 0; i < 3; i++) { const car = new THREE.Mesh(geoTrainCar, i === 0 ? matTrainBody : matTrainTrim); car.position.set(i * -2.5 * ln.spec.dir, 0.5, 0); t.add(car); }
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), matLamp); geos.push(lamp.geometry); lamp.position.set(1.3 * ln.spec.dir, 0.5, 0); t.add(lamp);
          ln.group.add(t); ln.train = t;
        }
        ln.train.visible = true;
      }
    } else {
      ln.trainX += ln.spec.dir * ln.spec.speed * dt;
      if (ln.train) ln.train.position.x = ln.trainX * CELL;
      if (Math.abs(ln.trainX) > EDGE + 5) { ln.railMode = 'idle'; ln.railTimer = 2500 + Math.random() * 3500; if (ln.train) ln.train.visible = false; }
    }
  };

  // ---------- Input ----------
  const setDir = (dir: HopDir): void => { queued = dir; };
  let downX = 0, downY = 0, downAt = 0;
  const onPointerDown = (e: PointerEvent): void => { downX = e.clientX; downY = e.clientY; downAt = performance.now(); };
  const onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.hypot(dx, dy) < 20) { setDir('up'); return; } // a tap = hop forward
    if (performance.now() - downAt > 800) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);

  const onResize = (): void => {
    const { w, h } = sizeOf();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  // ---------- Loop ----------
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dtMs = now - last; last = now;
    if (dtMs > 50) dtMs = 50;
    const dt = dtMs / 1000;

    if (!paused && !ended) {
      if (!awaiting) {
        stepLanes(dt, now);
        stepPlayer(dt);
        elapsedMs += dtMs;
        const remaining = Math.max(0, roundMs - elapsedMs);
        const sec = Math.ceil(remaining / 1000);
        if (sec !== lastEmitSec) { lastEmitSec = sec; cb.onTimeLeft(remaining); if (sec <= 30 && sec > 0) cb.onSfx?.('tick'); }
        if (remaining <= 0) endRound('timeout');
      } else {
        // gate open: keep the world still but keep the player visual alive
        stepPlayer(0);
      }
    }

    // camera trails the player forward
    const targetZ = rz(pRow) + CAM_BACK;
    camZ += (targetZ - camZ) * Math.min(1, dt * 6);
    placeCamera();
    // finder-ring pulse
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + Math.sin(now / 320) * 0.12;
    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    setDir,
    resolveChallenge(correct: boolean): void {
      if (!awaiting) return;
      awaiting = false;
      const ln = laneAt(pRow);
      if (correct) {
        if (ln) { ln.gateCleared = true; lastSafeRow = pRow; }
        gatesCleared += 1; cb.onSfx?.('correct');
      } else {
        wrongAnswers += 1; cb.onSfx?.('wrong');
        // bounce back one row
        pRow = Math.max(0, pRow - 1); player.position.set(rx(pCol), 0, rz(pRow));
      }
      last = performance.now();
    },
    setPaused(p: boolean): void { paused = p; if (!p) last = performance.now(); },
    resize(): void { onResize(); },
    getSummaryStats() { return { furthestRow: furthest, coins, deaths, gatesCleared, wrongAnswers }; },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
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
