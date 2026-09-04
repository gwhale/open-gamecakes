// Cakey Tower — 3D candy-tower demolition engine (three.js + cannon-es).
//
// A wobbly wedding-cake column of loose candies on a cake stand. Solve a problem
// to earn a BITE, then TAP a candy to remove it; the tower shifts and settles.
// Four roles the kid reads at a glance (art per gamecakes-creative-director):
//   • GOOD  — mint cherry-top petit four (no face): tap to EAT (+score). Clear
//             them all to WIN.
//   • BAD   — strawberry gummy CREATURE (candy eyes): must NOT tumble off the
//             plate and splat — each splat costs a life.
//   • HARD  — matte chocolate-brittle: immovable, structural, can't be tapped.
//   • MYSTERY — purple gobstopper: tapping flips it to good or bad.
//
// Bundle hygiene: NO runtime three/cannon-es import — namespaces arrive as args
// so this module stays out of the server bundle (loads only in the browser).

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS, LandscapeTheme } from '../types';
import type { SplashSystem } from '../balloon';
import { spawnDebris, spawnDustPuff } from '../castle/projectile';
import type { TowerTuning, BlockRole } from './types';

// ---------------------------------------------------------------------------
// Tunable constants
// ---------------------------------------------------------------------------
const S = 1.2;                 // candy block edge (mesh = collider 1:1)
const HX = S / 2;
const TOWER_W = 3;             // blocks across (X)
const TOWER_D = 2;             // blocks deep (Z) — 2 for physical stability
const PLATE_Y = 3.0;           // cake-stand plate top (tower base sits here)
const PLATE_R = 3.0;           // plate radius — its rim is the win/lose boundary
const DANGER_Y = PLATE_Y - 0.4; // a BAD block whose centre drops below this fell off → splat
const JITTER_XZ = 0.06;        // hand-laid stack jitter
const JITTER_YAW = 0.05;
const ORBIT_STEP = Math.PI / 9; // 20° per ↺/↻ tap
const ORBIT_LERP = 7;
const CAM_RADIUS = 22;
const CAM_HEIGHT = 12;
const SHAKE_DECAY = 11;
const RESOLVE_DELAY = 1100;    // linger after a removal so the kid watches it settle

export interface CakeyTowerCallbacks {
  onBitesLeft(n: number): void;
  onLivesLeft(n: number): void;
  onCandiesLeft(good: number, total: number): void;
  /** Fired once a removal has settled (bites spent) — host poses the next problem. */
  onBiteResolved(): void;
  /** Round over. `won` = every good candy eaten; else lives ran out. */
  onRoundEnd(won: boolean): void;
  onSfx?(name: 'eat' | 'splat' | 'nope' | 'win' | 'lose'): void;
}

export interface CakeyTowerEngine {
  /** Grant one bite (called after a correct answer) — enables tapping. */
  armBite(): void;
  orbit(dir: number): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): { goodLeft: number; goodTotal: number; lives: number; startLives: number; won: boolean };
  dispose(): void;
}

interface Block {
  group: THREE.Group;
  body: CANNON.Body;
  role: BlockRole;
  removed: boolean;
  splatted: boolean;
}

/** Soft radial glow texture (local copy of the castle recipe — not exported there). */
function makeGlow(THREE: ThreeNS, color: number): THREE.CanvasTexture {
  const SZ = 64;
  const canvas = document.createElement('canvas');
  canvas.width = SZ; canvas.height = SZ;
  const ctx = canvas.getContext('2d')!;
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  const g = ctx.createRadialGradient(SZ / 2, SZ / 2, 0, SZ / 2, SZ / 2, SZ / 2);
  g.addColorStop(0, `${hex}ff`); g.addColorStop(0.4, `${hex}a0`); g.addColorStop(1, `${hex}00`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, SZ, SZ);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCakeyTowerEngine(
  THREE: ThreeNS,
  CANNON: CannonNS,
  container: HTMLElement,
  tuning: TowerTuning,
  theme: LandscapeTheme,
  cb: CakeyTowerCallbacks,
): CakeyTowerEngine {
  const reduceMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = tuning.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  // ---------- Scene + camera ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 40, 120);

  const towerCenter = new THREE.Vector3(0, 0, 0);
  let camYaw = 0, targetYaw = 0;
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(46, w0 / h0, 0.1, 400);
  let lookY = PLATE_Y + tuning.courses * S * 0.5; // mid-tower; eased down as it shrinks

  const placeCamera = (): void => {
    camera.position.set(Math.sin(camYaw) * CAM_RADIUS, CAM_HEIGHT, Math.cos(camYaw) * CAM_RADIUS);
    camera.lookAt(towerCenter.x, lookY, towerCenter.z);
  };
  placeCamera();

  // ---------- Lights (cozy diorama — ambient + warm sun + hemisphere fill) ----------
  const ambient = new THREE.AmbientLight(theme.ambient, 0.66);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xfff3e6, 0xfb7185, 0.3);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(theme.sun, 1.05);
  sun.position.set(-9, 18, 10);
  sun.castShadow = tuning.shadows;
  sun.shadow.mapSize.set(1024, 1024);
  { const sc = sun.shadow.camera; sc.near = 1; sc.far = 60; sc.left = -14; sc.right = 14; sc.top = 22; sc.bottom = -6; }
  scene.add(sun);

  // ---------- Physics world ----------
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -tuning.gravity, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 12;
  const groundMat = new CANNON.Material('ground');
  const blockMat = new CANNON.Material('block');
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, blockMat, { friction: 0.7, restitution: 0.0 }));
  world.addContactMaterial(new CANNON.ContactMaterial(blockMat, blockMat, { friction: 0.75, restitution: 0.0 }));

  const disposeGeos: THREE.BufferGeometry[] = [];
  const disposeMats: THREE.Material[] = [];
  const disposeTexs: THREE.Texture[] = [];
  const track = <T,>(arr: T[], v: T): T => { arr.push(v); return v; };

  // ---------- Tabletop ground + cake stand ----------
  const groundGeo = track(disposeGeos, new THREE.PlaneGeometry(400, 400));
  const groundMatMesh = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xfff3e6, roughness: 1 }));
  const ground = new THREE.Mesh(groundGeo, groundMatMesh);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat });
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  const stand = new THREE.Group();
  {
    // Waisted vanilla pedestal.
    const pedGeo = track(disposeGeos, new THREE.CylinderGeometry(1.1, 1.7, PLATE_Y - 0.4, 20));
    const pedMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.5 }));
    const ped = new THREE.Mesh(pedGeo, pedMat);
    ped.position.set(0, (PLATE_Y - 0.4) / 2, 0);
    ped.castShadow = true; ped.receiveShadow = true;
    stand.add(ped);
    // White frosting plate.
    const plateGeo = track(disposeGeos, new THREE.CylinderGeometry(PLATE_R, PLATE_R * 0.94, 0.4, 32));
    const plateMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, PLATE_Y - 0.2, 0);
    plate.castShadow = true; plate.receiveShadow = true;
    stand.add(plate);
    // Scalloped strawberry rim beads (shared geo/mat) — the visual win/lose boundary.
    const beadGeo = track(disposeGeos, new THREE.SphereGeometry(0.22, 10, 8));
    const beadMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.4 }));
    const beads = 26;
    for (let i = 0; i < beads; i++) {
      const a = (i / beads) * Math.PI * 2;
      const b = new THREE.Mesh(beadGeo, beadMat);
      b.position.set(Math.sin(a) * PLATE_R, PLATE_Y, Math.cos(a) * PLATE_R);
      b.castShadow = true;
      stand.add(b);
    }
  }
  scene.add(stand);
  // Static plate collider (a cylinder the tower rests on).
  const plateBody = new CANNON.Body({ mass: 0, material: blockMat });
  plateBody.addShape(new CANNON.Cylinder(PLATE_R, PLATE_R * 0.94, 0.4, 16));
  plateBody.position.set(0, PLATE_Y - 0.2, 0);
  world.addBody(plateBody);

  // ---------- Shared block materials + toppers (one set per role) ----------
  const coreGeo = track(disposeGeos, new THREE.BoxGeometry(S, S, S));
  // GOOD — mint body + frosting cap + cherry on a stem.
  const goodMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.42, emissive: 0x86efac, emissiveIntensity: 0.06 }));
  const capGeo = track(disposeGeos, new THREE.SphereGeometry(S * 0.5, 14, 10));
  const capMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }));
  const cherryGeo = track(disposeGeos, new THREE.SphereGeometry(S * 0.18, 12, 10));
  const cherryMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.22 }));
  const stemGeo = track(disposeGeos, new THREE.CylinderGeometry(0.03, 0.03, S * 0.25, 6));
  const stemMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.6 }));
  // BAD — strawberry body + candy eyes (billboarded).
  const badMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.15 }));
  const eyeWhiteGeo = track(disposeGeos, new THREE.SphereGeometry(S * 0.14, 10, 8));
  const eyeWhiteMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
  const pupilGeo = track(disposeGeos, new THREE.SphereGeometry(S * 0.07, 8, 6));
  const pupilMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.3 }));
  // HARD — matte chocolate + amber peanut bumps.
  const hardMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 }));
  const bumpGeo = track(disposeGeos, new THREE.SphereGeometry(S * 0.13, 8, 6));
  const bumpMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6 }));
  // MYSTERY — purple gobstopper + glow halo.
  const mysteryMat = track(disposeMats, new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.25, emissive: 0xa855f7, emissiveIntensity: 0.12 }));
  const glowTex = track(disposeTexs, makeGlow(THREE, 0xffb3dd));
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  disposeMats.push(glowMat);

  const eyeGroups: THREE.Object3D[] = []; // billboarded toward camera each frame
  const mysteryGlows: THREE.Sprite[] = [];

  const buildBlockMesh = (role: BlockRole): THREE.Group => {
    const g = new THREE.Group();
    if (role === 'good') {
      const core = new THREE.Mesh(coreGeo, goodMat); core.castShadow = true; core.receiveShadow = true; g.add(core);
      const cap = new THREE.Mesh(capGeo, capMat); cap.scale.y = 0.4; cap.position.y = HX; cap.castShadow = true; g.add(cap);
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = HX + S * 0.28; g.add(stem);
      const cherry = new THREE.Mesh(cherryGeo, cherryMat); cherry.position.y = HX + S * 0.42; cherry.castShadow = true; g.add(cherry);
    } else if (role === 'bad') {
      const core = new THREE.Mesh(coreGeo, badMat); core.castShadow = true; core.receiveShadow = true; g.add(core);
      const eyes = new THREE.Group();
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat); w.position.set(sx * S * 0.22, S * 0.1, 0);
        const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(sx * S * 0.22, S * 0.1, S * 0.1);
        eyes.add(w); eyes.add(p);
      }
      eyes.position.z = HX; // sit on a face; billboarded toward camera below
      g.add(eyes);
      eyeGroups.push(eyes);
    } else if (role === 'hard') {
      const core = new THREE.Mesh(coreGeo, hardMat); core.castShadow = true; core.receiveShadow = true; g.add(core);
      for (let i = 0; i < 3; i++) {
        const b = new THREE.Mesh(bumpGeo, bumpMat);
        b.position.set((Math.random() - 0.5) * S * 0.7, (Math.random() - 0.5) * S * 0.7, HX * 0.95);
        g.add(b);
      }
    } else {
      const core = new THREE.Mesh(coreGeo, mysteryMat); core.castShadow = true; core.receiveShadow = true; g.add(core);
      const glow = new THREE.Sprite(glowMat); glow.scale.setScalar(S * 1.7); g.add(glow);
      mysteryGlows.push(glow);
    }
    return g;
  };

  // ---------- Build the tower ----------
  const blocks: Block[] = [];
  const bodyToBlock = new Map<CANNON.Body, Block>();
  let goodTotal = 0;

  const rollRole = (course: number): BlockRole => {
    const r = Math.random();
    if (r < tuning.mysteryChance) return 'mystery';
    // Hard blocks bias to the lower structural courses.
    const hardBias = course < 2 ? tuning.hardFraction * 2 : tuning.hardFraction * 0.6;
    if (r < tuning.mysteryChance + hardBias) return 'hard';
    if (r < tuning.mysteryChance + hardBias + tuning.badFraction) return 'bad';
    return 'good';
  };

  {
    const x0 = -((TOWER_W - 1) / 2) * S;
    const z0 = -((TOWER_D - 1) / 2) * S;
    for (let c = 0; c < tuning.courses; c++) {
      const courseOff = (Math.random() - 0.5) * 0.24; // hand-stacked lean per course
      for (let ix = 0; ix < TOWER_W; ix++) {
        for (let iz = 0; iz < TOWER_D; iz++) {
          const role = rollRole(c);
          if (role === 'good') goodTotal++;
          const jx = (Math.random() - 0.5) * JITTER_XZ;
          const jz = (Math.random() - 0.5) * JITTER_XZ;
          const yaw = (Math.random() - 0.5) * JITTER_YAW;
          const px = x0 + ix * S + courseOff + jx;
          const py = PLATE_Y + HX + c * S;
          const pz = z0 + iz * S + jz;
          const g = buildBlockMesh(role);
          g.position.set(px, py, pz);
          g.rotation.y = yaw;
          scene.add(g);
          const body = new CANNON.Body({
            mass: role === 'hard' ? 0 : 1,           // hard = immovable spine
            shape: new CANNON.Box(new CANNON.Vec3(HX, HX, HX)),
            position: new CANNON.Vec3(px, py, pz),
            material: blockMat,
            allowSleep: true, sleepSpeedLimit: 0.15, sleepTimeLimit: 0.4,
            linearDamping: 0.2, angularDamping: 0.5,
          });
          body.quaternion.setFromEuler(0, yaw, 0);
          if (role !== 'hard') body.sleep();
          world.addBody(body);
          const blk: Block = { group: g, body, role, removed: false, splatted: false };
          blocks.push(blk);
          bodyToBlock.set(body, blk);
        }
      }
    }
  }

  // ---------- Mutable round state ----------
  let bites = 0;
  let lives = tuning.lives;
  let goodLeft = goodTotal;
  const startLives = tuning.lives;
  let ended = false;
  let won = false;
  let paused = false;
  let resolveTimer: number | null = null;
  let shakeMag = 0;
  const debris: SplashSystem[] = [];

  cb.onBitesLeft(bites);
  cb.onLivesLeft(lives);
  cb.onCandiesLeft(goodLeft, goodTotal);

  // ---------- Helpers ----------
  const removeBlock = (blk: Block): void => {
    if (blk.removed) return;
    blk.removed = true;
    scene.remove(blk.group);
    world.removeBody(blk.body);
    bodyToBlock.delete(blk.body);
  };

  const eatBlock = (blk: Block, at: THREE.Vector3): void => {
    cb.onSfx?.('eat');
    debris.push(spawnDebris(THREE, scene, at, 8, 0x86efac, [0xfb7185, 0xffffff, 0xfde68a], 0.7));
    debris.push(spawnDustPuff(THREE, scene, at));
    removeBlock(blk);
    goodLeft--;
    cb.onCandiesLeft(goodLeft, goodTotal);
    if (goodLeft <= 0) endRound(true);
  };

  const splatBlock = (blk: Block): void => {
    if (blk.splatted) return;
    blk.splatted = true;
    const at = new THREE.Vector3(blk.body.position.x, blk.body.position.y, blk.body.position.z);
    cb.onSfx?.('splat');
    debris.push(spawnDebris(THREE, scene, at, 14, 0xe11d48, [0xfb7185, 0xffffff], 0.5));
    if (!reduceMotion) shakeMag = 0.14;
    removeBlock(blk);
    lives = Math.max(0, lives - 1);
    cb.onLivesLeft(lives);
    if (lives <= 0) endRound(false);
  };

  function endRound(w: boolean): void {
    if (ended) return;
    ended = true;
    won = w;
    cb.onSfx?.(w ? 'win' : 'lose');
    window.setTimeout(() => cb.onRoundEnd(w), w ? 500 : 250);
  }

  // ---------- Tap-to-eat (raycast) ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const blockFromObject = (o: THREE.Object3D | null): Block | undefined => {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      const b = blocks.find((bl) => bl.group === cur);
      if (b) return b;
      cur = cur.parent;
    }
    return undefined;
  };
  const onPointerDown = (e: PointerEvent): void => {
    if (ended || paused || bites <= 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const meshes = blocks.filter((b) => !b.removed).map((b) => b.group);
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return;
    const blk = blockFromObject(hits[0].object);
    if (!blk || blk.removed) return;
    const at = new THREE.Vector3(blk.body.position.x, blk.body.position.y, blk.body.position.z);
    if (blk.role === 'good') {
      bites--;
      cb.onBitesLeft(bites);
      eatBlock(blk, at);
      if (!ended) scheduleResolve();
    } else if (blk.role === 'mystery') {
      // Gamble: flip to good or bad. Consumes the bite.
      bites--;
      cb.onBitesLeft(bites);
      flipMystery(blk);
      if (!ended) scheduleResolve();
    } else {
      // bad or hard — protected / immovable. No bite spent; gentle "nope".
      cb.onSfx?.('nope');
    }
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

  const flipMystery = (blk: Block): void => {
    const becomesGood = Math.random() < 0.5;
    // Swap the mesh contents in place for the new role.
    const idxGlow = mysteryGlows.findIndex((s) => s.parent === blk.group);
    if (idxGlow >= 0) { blk.group.remove(mysteryGlows[idxGlow]); mysteryGlows.splice(idxGlow, 1); }
    while (blk.group.children.length) blk.group.remove(blk.group.children[0]);
    if (becomesGood) {
      blk.role = 'good';
      goodTotal++; goodLeft++;
      const core = new THREE.Mesh(coreGeo, goodMat); core.castShadow = true; blk.group.add(core);
      const cap = new THREE.Mesh(capGeo, capMat); cap.scale.y = 0.4; cap.position.y = HX; blk.group.add(cap);
      const stem = new THREE.Mesh(stemGeo, stemMat); stem.position.y = HX + S * 0.28; blk.group.add(stem);
      const cherry = new THREE.Mesh(cherryGeo, cherryMat); cherry.position.y = HX + S * 0.42; blk.group.add(cherry);
      cb.onCandiesLeft(goodLeft, goodTotal);
    } else {
      blk.role = 'bad';
      const core = new THREE.Mesh(coreGeo, badMat); core.castShadow = true; blk.group.add(core);
      const eyes = new THREE.Group();
      for (const sx of [-1, 1]) {
        const w = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat); w.position.set(sx * S * 0.22, S * 0.1, 0);
        const p = new THREE.Mesh(pupilGeo, pupilMat); p.position.set(sx * S * 0.22, S * 0.1, S * 0.1);
        eyes.add(w); eyes.add(p);
      }
      eyes.position.z = HX; blk.group.add(eyes); eyeGroups.push(eyes);
    }
    blk.body.wakeUp();
  };

  const scheduleResolve = (): void => {
    if (resolveTimer !== null) window.clearTimeout(resolveTimer);
    resolveTimer = window.setTimeout(() => {
      resolveTimer = null;
      if (!ended) cb.onBiteResolved();
    }, RESOLVE_DELAY);
  };

  // ---------- Render / physics loop ----------
  const FIXED = 1 / 60;
  const tmp = new THREE.Vector3();
  let raf = 0;
  let lastTime = performance.now();

  const syncMesh = (blk: Block): void => {
    blk.group.position.set(blk.body.position.x, blk.body.position.y, blk.body.position.z);
    blk.group.quaternion.set(blk.body.quaternion.x, blk.body.quaternion.y, blk.body.quaternion.z, blk.body.quaternion.w);
  };

  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // Camera orbit smoothing + shake.
    camYaw += (targetYaw - camYaw) * Math.min(1, ORBIT_LERP * dt);
    // Ease look-at toward the current tower top as it shrinks.
    let topY = PLATE_Y;
    for (const b of blocks) if (!b.removed && b.body.position.y > topY) topY = b.body.position.y;
    const goalLook = PLATE_Y + Math.max(1, (topY - PLATE_Y)) * 0.5;
    lookY += (goalLook - lookY) * Math.min(1, 3 * dt);
    placeCamera();
    if (shakeMag > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shakeMag;
      camera.position.y += (Math.random() - 0.5) * shakeMag;
      shakeMag *= Math.max(0, 1 - SHAKE_DECAY * dt);
    }

    if (!paused && !ended) {
      world.step(FIXED, dt, 3);
      for (const blk of blocks) {
        if (blk.removed) continue;
        if (blk.role !== 'hard') syncMesh(blk);
        // Splat: a BAD block that fell off the plate onto the tabletop.
        if (blk.role === 'bad' && !blk.splatted && blk.body.position.y < DANGER_Y) splatBlock(blk);
      }
    }

    // Billboard bad-block eyes toward the camera; pulse mystery glow.
    for (const eyes of eyeGroups) { if (eyes.parent) eyes.parent.getWorldPosition(tmp); eyes.lookAt(camera.position); }
    if (!reduceMotion) {
      const pulse = 0.2 + Math.sin(now * 0.004) * 0.1;
      for (const s of mysteryGlows) s.scale.setScalar(S * 1.5 + pulse);
    }

    // Reap debris.
    for (let i = debris.length - 1; i >= 0; i--) {
      if (!debris[i].update(dt)) { debris[i].dispose(scene); debris.splice(i, 1); }
    }

    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  // ---------- Resize ----------
  const onResize = (): void => {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return {
    armBite(): void {
      if (ended) return;
      bites += 1;
      cb.onBitesLeft(bites);
    },
    orbit(dir: number): void {
      if (ended) return;
      targetYaw += (dir < 0 ? -1 : 1) * ORBIT_STEP;
    },
    setPaused(p: boolean): void {
      paused = p;
      if (!p) lastTime = performance.now();
    },
    resize(): void { onResize(); },
    getStats() { return { goodLeft, goodTotal, lives, startLives, won }; },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      if (resolveTimer !== null) window.clearTimeout(resolveTimer);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      for (const d of debris) d.dispose(scene);
      debris.length = 0;
      for (const blk of blocks) if (!blk.removed) { scene.remove(blk.group); world.removeBody(blk.body); }
      scene.remove(ground, stand, ambient, hemi, sun);
      world.removeBody(groundBody);
      world.removeBody(plateBody);
      for (const g of disposeGeos) g.dispose();
      for (const m of disposeMats) m.dispose();
      for (const t of disposeTexs) t.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    },
  };
}
