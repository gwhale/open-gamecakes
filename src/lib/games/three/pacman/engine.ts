// Cakey Chase 3D engine — three.js render of the candy Pac-Man maze.
//
// Kinematic grid movement (no physics): Cakey and the cake-holes step cell to
// cell on the shared MAZE grid, reusing the exact movement + AI + difficulty
// from ../../pacman-cakey/logic.ts. The engine owns the scene, the round loop,
// eating, frightened mode, lives, and the 3-minute clock; it fires callbacks to
// the React host (score/lives/pellets/time, math gates, round end).
//
// No runtime `three` import — the namespace arrives as a factory arg.

import type * as THREE from 'three';
import type { ThreeNS, PacmanSceneProps, PacmanEngine, PacmanCallbacks, ChallengeContext } from './types';
import { LIVES } from './types';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import { MAZE, MAZE_COLS, MAZE_ROWS } from '@/lib/games/pacman-cakey/maze';
import {
  type Direction,
  type GhostMode,
  difficultyFromTier,
  stepCell,
  canStep,
  pickGhostDir,
} from '@/lib/games/pacman-cakey/logic';

// Grid → scene (maze centered on the origin; 1 cell = 1 unit).
const cx = (col: number): number => col - (MAZE_COLS - 1) / 2;
const cz = (row: number): number => row - (MAZE_ROWS - 1) / 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2.4;

interface Cakey {
  col: number;
  row: number;
  dir: Direction | null;
  queued: Direction | null;
  progress: number;
  group: THREE.Group;
}
interface Ghost {
  col: number;
  row: number;
  dir: Direction | null;
  progress: number;
  mode: GhostMode;
  ai: 'chase' | 'wander';
  spawnCol: number;
  spawnRow: number;
  group: THREE.Group;
  body: THREE.Mesh;
  ring: THREE.Mesh;
}

export function createPacmanEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: PacmanSceneProps,
  cb: PacmanCallbacks,
): PacmanEngine {
  const diff = difficultyFromTier(props.tier);
  // Round length = the kid's chosen 1/2/3-min pick (see session-duration).
  const roundMs = getSessionDurationMs();

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

  // ---------- Scene + camera (angled overhead, frames the whole board) ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x223055);
  scene.fog = new THREE.Fog(0x223055, 24, 48);
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(50, w0 / h0, 0.1, 120);
  let zoom = 1;
  const placeCamera = (): void => {
    camera.position.set(0, 17 * zoom, 12 * zoom);
    camera.lookAt(0, 0, 0.5);
  };
  placeCamera();

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff3da, 1.0);
  sun.position.set(-6, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  { const s = sun.shadow.camera; s.near = 1; s.far = 50; s.left = -11; s.right = 11; s.top = 13; s.bottom = -13; }
  scene.add(sun);

  // ---------- Disposables ----------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const track = <T,>(arr: T[], v: T): T => { arr.push(v); return v; };

  // ---------- Floor ----------
  const floorGeo = track(geos, new THREE.PlaneGeometry(MAZE_COLS + 2, MAZE_ROWS + 2));
  const floorMat = track(mats, new THREE.MeshStandardMaterial({ color: 0x2e3a63, roughness: 1 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- Walls (InstancedMesh) ----------
  const wallCells: Array<{ c: number; r: number }> = [];
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) {
    if (MAZE.cells[r][c].tile === '#') wallCells.push({ c, r });
  }
  const wallGeo = track(geos, new THREE.BoxGeometry(0.96, 0.9, 0.96));
  const wallMat = track(mats, new THREE.MeshStandardMaterial({ color: 0x6d6cf0, roughness: 0.6 }));
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, wallCells.length);
  walls.castShadow = true;
  walls.receiveShadow = true;
  const dummy = new THREE.Object3D();
  wallCells.forEach((w, i) => {
    dummy.position.set(cx(w.c), 0.45, cz(w.r));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    walls.setMatrixAt(i, dummy.matrix);
  });
  walls.instanceMatrix.needsUpdate = true;
  scene.add(walls);

  // ---------- Pellets (InstancedMesh) ----------
  const dotCells: Array<{ c: number; r: number }> = [];
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) {
    if (MAZE.cells[r][c].tile === '.') dotCells.push({ c, r });
  }
  const dotIndexByCell = new Map<string, number>();
  const dotGeo = track(geos, new THREE.SphereGeometry(0.12, 8, 6));
  const dotMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xffe08a, roughness: 0.5, emissive: 0x4a3a00, emissiveIntensity: 0.3 }));
  const dots = new THREE.InstancedMesh(dotGeo, dotMat, dotCells.length);
  dotCells.forEach((d, i) => {
    dotIndexByCell.set(`${d.r},${d.c}`, i);
    dummy.position.set(cx(d.c), 0.3, cz(d.r));
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    dots.setMatrixAt(i, dummy.matrix);
  });
  dots.instanceMatrix.needsUpdate = true;
  scene.add(dots);

  // ---------- Power pellets (little cupcakes) ----------
  interface Power { c: number; r: number; group: THREE.Group; eaten: boolean }
  const powers: Power[] = [];
  const powerWrapGeo = track(geos, new THREE.CylinderGeometry(0.16, 0.12, 0.2, 10));
  const powerWrapMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff3d7, roughness: 0.7 }));
  const powerTopGeo = track(geos, new THREE.SphereGeometry(0.18, 12, 8));
  const powerTopMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.5 }));
  for (let r = 0; r < MAZE_ROWS; r++) for (let c = 0; c < MAZE_COLS; c++) {
    if (MAZE.cells[r][c].tile === 'o') {
      const g = new THREE.Group();
      g.position.set(cx(c), 0.32, cz(r));
      const wrap = new THREE.Mesh(powerWrapGeo, powerWrapMat); wrap.position.y = 0.1; wrap.castShadow = true; g.add(wrap);
      const top = new THREE.Mesh(powerTopGeo, powerTopMat); top.position.y = 0.28; top.castShadow = true; g.add(top);
      scene.add(g);
      powers.push({ c, r, group: g, eaten: false });
    }
  }

  const pelletsTotal = dotCells.length + powers.length;
  let pelletsRemaining = pelletsTotal;
  let pelletsEaten = 0;

  // ---------- Cakey ----------
  const makeCupcake = (frostingColor: number, scale: number): THREE.Group => {
    const g = new THREE.Group();
    const wrap = new THREE.Mesh(
      track(geos, new THREE.CylinderGeometry(0.3, 0.22, 0.36, 14)),
      track(mats, new THREE.MeshStandardMaterial({ color: 0xfff3d7, roughness: 0.7 })),
    );
    wrap.position.y = 0.18; wrap.castShadow = true; g.add(wrap);
    const fro = new THREE.Mesh(
      track(geos, new THREE.SphereGeometry(0.32, 16, 12)),
      track(mats, new THREE.MeshStandardMaterial({ color: frostingColor, roughness: 0.45 })),
    );
    fro.position.y = 0.44; fro.scale.y = 0.8; fro.castShadow = true; g.add(fro);
    const cher = new THREE.Mesh(
      track(geos, new THREE.SphereGeometry(0.09, 10, 8)),
      track(mats, new THREE.MeshStandardMaterial({ color: 0xd9223f, roughness: 0.3 })),
    );
    cher.position.y = 0.74; g.add(cher);
    g.scale.setScalar(scale);
    return g;
  };

  const cakey: Cakey = {
    col: MAZE.cakeySpawn.col,
    row: MAZE.cakeySpawn.row,
    dir: null,
    queued: null,
    progress: 0,
    group: makeCupcake(0xf472b6, 1),
  };
  cakey.group.position.set(cx(cakey.col), 0, cz(cakey.row));
  scene.add(cakey.group);

  // ---------- Cake holes (ghosts) ----------
  const ghosts: Ghost[] = [];
  const GHOST_BASE = 0x3b2a63;
  const GHOST_RING = 0x8b5cf6;
  MAZE.ghostSpawns.forEach((sp, i) => {
    const group = new THREE.Group();
    group.position.set(cx(sp.col), 0, cz(sp.row));
    const body = new THREE.Mesh(
      track(geos, new THREE.SphereGeometry(0.34, 16, 12)),
      track(mats, new THREE.MeshStandardMaterial({ color: GHOST_BASE, roughness: 0.4, emissive: 0x1a0f33, emissiveIntensity: 0.4 })),
    );
    body.position.y = 0.36; body.scale.y = 0.7; body.castShadow = true; group.add(body);
    const ring = new THREE.Mesh(
      track(geos, new THREE.TorusGeometry(0.34, 0.07, 8, 20)),
      track(mats, new THREE.MeshStandardMaterial({ color: GHOST_RING, roughness: 0.4 })),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.14; group.add(ring);
    scene.add(group);
    ghosts.push({
      col: sp.col, row: sp.row, dir: null, progress: 0,
      mode: i < diff.chaserCount ? 'chase' : 'wander',
      ai: i < diff.chaserCount ? 'chase' : 'wander',
      spawnCol: sp.col, spawnRow: sp.row, group, body, ring,
    });
  });

  // ---------- State ----------
  let score = 0;
  let lives = LIVES;
  let ghostsEaten = 0;
  let deaths = 0;
  let wrongAnswers = 0;
  let elapsedMs = 0;
  let lastEmitSec = -1;
  let frightenedUntil = 0;
  let awaiting = false; // a math gate is open; gameplay halts
  let pendingContext: ChallengeContext | null = null;
  let ended = false;
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let ghostFreezeUntil = 0; // brief freeze after a respawn

  cb.onScore(score);
  cb.onLives(lives);
  cb.onPellets(pelletsRemaining, pelletsTotal);

  // ---------- Helpers ----------
  const renderPos = (col: number, row: number, dir: Direction | null, progress: number): { x: number; z: number } => {
    if (!dir || progress <= 0) return { x: cx(col), z: cz(row) };
    const n = stepCell(col, row, dir);
    // Tunnel wrap would streak across the board — snap at the halfway point.
    if (Math.abs(n.col - col) > 1) {
      return progress < 0.5 ? { x: cx(col), z: cz(row) } : { x: cx(n.col), z: cz(n.row) };
    }
    return { x: lerp(cx(col), cx(n.col), progress), z: lerp(cz(row), cz(n.row), progress) };
  };

  const openChallenge = (ctx: ChallengeContext): void => {
    awaiting = true;
    pendingContext = ctx;
    cb.onChallenge(ctx);
  };

  const endRound = (reason: 'win' | 'lose' | 'timeout'): void => {
    if (ended) return;
    ended = true;
    cb.onSfx?.(reason === 'win' ? 'win' : 'timeUp');
    cb.onRoundEnd(reason);
  };

  const beginFrightened = (): void => {
    frightenedUntil = performance.now() + diff.frightenedDurationMs;
    for (const g of ghosts) {
      if (g.mode !== 'eaten') { g.mode = 'frightened'; if (g.dir) g.dir = null; }
    }
  };

  const eatAt = (col: number, row: number): void => {
    const key = `${row},${col}`;
    const di = dotIndexByCell.get(key);
    if (di !== undefined) {
      dotIndexByCell.delete(key);
      dummy.position.set(0, -100, 0); dummy.scale.set(0.001, 0.001, 0.001); dummy.updateMatrix();
      dots.setMatrixAt(di, dummy.matrix); dots.instanceMatrix.needsUpdate = true;
      score += 1; pelletsEaten += 1; pelletsRemaining -= 1;
      cb.onScore(score); cb.onPellets(pelletsRemaining, pelletsTotal); cb.onSfx?.('tap');
      if (pelletsRemaining <= 0) endRound('win');
      return;
    }
    const power = powers.find((p) => !p.eaten && p.c === col && p.r === row);
    if (power) {
      power.eaten = true; power.group.visible = false;
      score += 5; pelletsEaten += 1; pelletsRemaining -= 1;
      cb.onScore(score); cb.onPellets(pelletsRemaining, pelletsTotal); cb.onSfx?.('levelUp');
      if (pelletsRemaining <= 0) { endRound('win'); return; }
      openChallenge('power-up');
    }
  };

  const resetPositions = (): void => {
    cakey.col = MAZE.cakeySpawn.col; cakey.row = MAZE.cakeySpawn.row; cakey.dir = null; cakey.queued = null; cakey.progress = 0;
    ghosts.forEach((g) => { g.col = g.spawnCol; g.row = g.spawnRow; g.dir = null; g.progress = 0; if (g.mode === 'frightened' || g.mode === 'eaten') g.mode = g.ai; });
    ghostFreezeUntil = performance.now() + 1400;
  };

  const onCaught = (): void => {
    deaths += 1; lives -= 1; cb.onLives(lives); cb.onSfx?.('wrong');
    if (lives <= 0) { endRound('lose'); return; }
    resetPositions();
    openChallenge('caught');
  };

  // ---------- Movement ----------
  const stepCakey = (dt: number): void => {
    if (!cakey.dir && cakey.queued && canStep(cakey.col, cakey.row, cakey.queued)) {
      cakey.dir = cakey.queued; cakey.progress = 0;
    }
    if (!cakey.dir) return;
    cakey.progress += dt / diff.cakeyStepMs;
    if (cakey.progress >= 1) {
      cakey.progress = 0;
      const n = stepCell(cakey.col, cakey.row, cakey.dir);
      cakey.col = n.col; cakey.row = n.row;
      eatAt(cakey.col, cakey.row);
      if (ended) return;
      // Re-evaluate the heading even when eatAt just opened a challenge
      // (power-up). Otherwise cakey.dir stays pointing the way we came in, and
      // since power-ups sit at junctions the forward cell is often a wall — on
      // resume the next step would commit a move straight INTO that wall and
      // the cupcake would vanish into the block. Nulling an invalid forward dir
      // (or adopting a valid queued turn) here keeps resume safe; movement is
      // still frozen by the `awaiting` gate in tick() until the kid answers.
      if (cakey.queued && canStep(cakey.col, cakey.row, cakey.queued)) cakey.dir = cakey.queued;
      else if (!canStep(cakey.col, cakey.row, cakey.dir)) cakey.dir = null;
    }
  };

  const stepGhost = (g: Ghost, dt: number): void => {
    if (!g.dir) {
      const d = pickGhostDir(g, cakey.col, cakey.row, Math.random);
      if (!d) return;
      g.dir = d; g.progress = 0;
    }
    const stepMs = g.mode === 'eaten' ? Math.max(80, diff.ghostStepMs - 70)
      : g.mode === 'frightened' ? diff.frightenedStepMs : diff.ghostStepMs;
    g.progress += dt / stepMs;
    if (g.progress >= 1) {
      g.progress = 0;
      const n = stepCell(g.col, g.row, g.dir);
      g.col = n.col; g.row = n.row;
      if (g.mode === 'eaten' && g.col === g.spawnCol && g.row === g.spawnRow) {
        g.mode = g.ai; g.dir = null; g.group.visible = true; return;
      }
      const d = pickGhostDir(g, cakey.col, cakey.row, Math.random);
      g.dir = d;
    }
  };

  const checkCollisions = (): void => {
    const cp = renderPos(cakey.col, cakey.row, cakey.dir, cakey.progress);
    for (const g of ghosts) {
      if (g.mode === 'eaten') continue;
      const gp = renderPos(g.col, g.row, g.dir, g.progress);
      if (Math.hypot(cp.x - gp.x, cp.z - gp.z) < 0.55) {
        if (g.mode === 'frightened') {
          g.mode = 'eaten'; g.dir = null; g.group.visible = false; ghostsEaten += 1; score += 20;
          cb.onScore(score); cb.onSfx?.('catch');
        } else {
          onCaught();
          return;
        }
      }
    }
  };

  // ---------- Input (canvas swipe + wheel zoom) ----------
  const setDir = (dir: Direction): void => { cakey.queued = dir; };
  let downX = 0, downY = 0, downAt = 0;
  const onPointerDown = (e: PointerEvent): void => { downX = e.clientX; downY = e.clientY; downAt = performance.now(); };
  const onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.hypot(dx, dy) < 20 || performance.now() - downAt > 800) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

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
    let dt = now - last; last = now;
    if (dt > 50) dt = 50;

    if (!paused && !ended && !awaiting) {
      // Frightened expiry.
      if (frightenedUntil && now > frightenedUntil) {
        for (const g of ghosts) if (g.mode === 'frightened') g.mode = g.ai;
        frightenedUntil = 0;
      }
      stepCakey(dt);
      if (!awaiting && !ended && now >= ghostFreezeUntil) for (const g of ghosts) stepGhost(g, dt);
      if (!awaiting && !ended) checkCollisions();

      elapsedMs += dt;
      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmitSec) {
        lastEmitSec = sec; cb.onTimeLeft(remaining);
        if (sec <= 30 && sec > 0) cb.onSfx?.('tick');
      }
      if (remaining <= 0) endRound('timeout');
    }

    // Render entity transforms.
    const cp = renderPos(cakey.col, cakey.row, cakey.dir, cakey.progress);
    cakey.group.position.x = cp.x; cakey.group.position.z = cp.z;
    cakey.group.position.y = Math.abs(Math.sin(now / 140)) * (cakey.dir ? 0.06 : 0); // bob while moving
    for (const p of powers) if (!p.eaten) { p.group.rotation.y += dt * 0.004; p.group.position.y = 0.32 + Math.sin(now / 300 + p.c) * 0.05; }
    for (const g of ghosts) {
      const gp = renderPos(g.col, g.row, g.dir, g.progress);
      g.group.position.x = gp.x; g.group.position.z = gp.z;
      g.group.rotation.y += dt * 0.006;
      const frightened = g.mode === 'frightened';
      (g.body.material as THREE.MeshStandardMaterial).color.setHex(frightened ? 0xfde047 : GHOST_BASE);
      (g.ring.material as THREE.MeshStandardMaterial).color.setHex(frightened ? 0xfff3a0 : GHOST_RING);
    }

    placeCamera();
    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    setDir,
    resolveChallenge(correct: boolean): void {
      if (!awaiting) return;
      const ctx = pendingContext;
      awaiting = false; pendingContext = null;
      if (ctx === 'power-up') {
        if (correct) { beginFrightened(); cb.onSfx?.('correct'); }
        else { wrongAnswers += 1; cb.onSfx?.('wrong'); }
      } else if (ctx === 'caught') {
        if (correct) { score += 5; cb.onScore(score); cb.onSfx?.('correct'); }
        else { wrongAnswers += 1; cb.onSfx?.('wrong'); }
        // Grace period starts AFTER the modal closes, so the kid isn't
        // re-chased the instant they look up from answering.
        ghostFreezeUntil = performance.now() + 1300;
      }
      last = performance.now();
    },
    setPaused(p: boolean): void { paused = p; if (!p) last = performance.now(); },
    resize(): void { onResize(); },
    zoomBy(factor: number): void { zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor)); },
    getSummaryStats() {
      return { score, pelletsEaten, pelletsTotal, ghostsEaten, deaths, wrongAnswers };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      walls.dispose();
      dots.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
