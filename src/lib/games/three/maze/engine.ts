// Crayon Maze 3D engine — walk the fox through a candy maze; gates are
// glowing doors that open when you solve their math problem.
//
// Kinematic discrete grid movement (no physics). Reuses the pure maze-gates
// config + helpers (isPassable / gateAt / cellAt). The host generates the
// tier-scaled config and passes it in; the engine renders it, moves the fox,
// fires onGateOpen when the fox hits a locked gate, and onWin at the end.
//
// No runtime `three` import — the namespace arrives as a factory arg.

import type * as THREE from 'three';
import type { ThreeNS, MazeCallbacks, MazeEngine } from './types';
import {
  type MazeGatesConfig,
  cellAt,
  gateAt,
  isPassable,
} from '@/lib/games/maze-gates';

type Direction = 'up' | 'down' | 'left' | 'right';
const DV: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};
const MOVE_MS = 170;
const ZOOM_MIN = 0.7;
const ZOOM_MAX = 2.2;

interface GateNode { id: string; r: number; c: number; door: THREE.Mesh; reveal: number }

export function createMazeEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  config: MazeGatesConfig,
  cb: MazeCallbacks,
): MazeEngine {
  const ROWS = config.grid.rows;
  const COLS = config.grid.cols;
  const sx = (col: number): number => col - (COLS - 1) / 2;
  const sz = (row: number): number => row - (ROWS - 1) / 2;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

  // ---------- Scene + camera (fixed-yaw follow) ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfdeccb);
  scene.fog = new THREE.Fog(0xfdeccb, 14, 34);
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(52, w0 / h0, 0.1, 80);
  let zoom = 1;
  const camPos = new THREE.Vector3();
  let camInit = false;

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff2da, 1.0);
  sun.position.set(-5, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  { const s = sun.shadow.camera; s.near = 1; s.far = 45; s.left = -10; s.right = 10; s.top = 12; s.bottom = -12; }
  scene.add(sun);

  // ---------- Disposables ----------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const track = <T,>(arr: T[], v: T): T => { arr.push(v); return v; };

  // ---------- Floor ----------
  const floorGeo = track(geos, new THREE.PlaneGeometry(COLS + 1, ROWS + 1));
  const floorMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfbe7bf, roughness: 1 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.02; floor.receiveShadow = true;
  scene.add(floor);

  // ---------- Walls (InstancedMesh) ----------
  const wallCells: Array<{ r: number; c: number }> = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (config.grid.cells[r][c] === 'wall') wallCells.push({ r, c });
  const wallGeo = track(geos, new THREE.BoxGeometry(0.96, 1.0, 0.96));
  const wallMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xe8744b, roughness: 0.75 }));
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, wallCells.length));
  walls.castShadow = true; walls.receiveShadow = true;
  const dummy = new THREE.Object3D();
  wallCells.forEach((w, i) => { dummy.position.set(sx(w.c), 0.5, sz(w.r)); dummy.updateMatrix(); walls.setMatrixAt(i, dummy.matrix); });
  walls.instanceMatrix.needsUpdate = true;
  scene.add(walls);

  // ---------- Text-sprite helper (gate problem signs) ----------
  const makeSign = (text: string) => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 128);
    ctx.fillStyle = 'rgba(255,250,240,0.95)';
    ctx.fillRect(8, 24, 240, 80);
    ctx.fillStyle = '#7a2f12'; ctx.font = '800 56px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 66);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat); sprite.scale.set(1.6, 0.8, 1);
    return { sprite, tex, mat };
  };

  // ---------- Gates ----------
  const gateNodes = new Map<string, GateNode>();
  const doorGeo = track(geos, new THREE.BoxGeometry(0.9, 1.1, 0.3));
  for (const g of config.gates) {
    const door = new THREE.Mesh(doorGeo, track(mats, new THREE.MeshStandardMaterial({
      color: 0xef8b5e, emissive: 0xe8744b, emissiveIntensity: 0.5, roughness: 0.5, transparent: true, opacity: 0.92,
    })));
    door.position.set(sx(g.position.col), 0.55, sz(g.position.row));
    door.castShadow = true;
    scene.add(door);
    // problem sign floating above
    const prompt = g.challenge.type === 'numeric' ? g.challenge.prompt : `${g.challenge.a} + ${g.challenge.b}`;
    const sign = makeSign(prompt);
    track(texs, sign.tex); track(mats, sign.mat);
    sign.sprite.position.set(sx(g.position.col), 1.7, sz(g.position.row));
    scene.add(sign.sprite);
    gateNodes.set(g.id, { id: g.id, r: g.position.row, c: g.position.col, door, reveal: -1 });
  }

  // ---------- Start / end markers ----------
  const endGeo = track(geos, new THREE.ConeGeometry(0.4, 0.9, 5));
  const endMat = track(mats, new THREE.MeshStandardMaterial({ color: 0x4caf50, emissive: 0x166534, emissiveIntensity: 0.5, roughness: 0.4 }));
  const endMarker = new THREE.Mesh(endGeo, endMat);
  endMarker.position.set(sx(config.end.col), 0.5, sz(config.end.row));
  endMarker.castShadow = true;
  scene.add(endMarker);

  // ---------- Fox ----------
  const fox = new THREE.Group();
  const foxBodyGeo = track(geos, new THREE.SphereGeometry(0.3, 16, 12));
  const foxBodyMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xf08a3c, roughness: 0.5 }));
  const foxBody = new THREE.Mesh(foxBodyGeo, foxBodyMat); foxBody.position.y = 0.32; foxBody.scale.y = 0.85; foxBody.castShadow = true; fox.add(foxBody);
  // 🦊 face sprite
  {
    const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 96;
    const ctx = canvas.getContext('2d')!; ctx.font = '78px "Segoe UI Emoji","Apple Color Emoji",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('🦊', 48, 52);
    const tex = track(texs, new THREE.CanvasTexture(canvas)); tex.colorSpace = THREE.SRGBColorSpace;
    const faceMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    mats.push(faceMat);
    const face = new THREE.Sprite(faceMat); face.scale.set(0.7, 0.7, 1); face.position.y = 0.62; fox.add(face);
  }
  scene.add(fox);

  // ---------- State ----------
  const solved = new Set<string>();
  let wrongAnswers = 0;
  let pendingGateId: string | null = null;
  let ended = false;
  let raf = 0;
  let lastTime = performance.now();
  // movement
  const foxPos = { row: config.start.row, col: config.start.col };
  let moving = false;
  let moveT = 0;
  let fromX = sx(foxPos.col), fromZ = sz(foxPos.row);
  let toX = fromX, toZ = fromZ;
  fox.position.set(fromX, 0, fromZ);

  cb.onGatesProgress(0, config.gates.length);

  // ---------- Input / movement ----------
  const tryMove = (dir: Direction): void => {
    if (moving || pendingGateId || ended) return;
    const v = DV[dir];
    const target = { row: foxPos.row + v.dr, col: foxPos.col + v.dc };
    const cell = cellAt(config, target);
    if (cell === undefined || cell === 'wall') return;
    if (cell === 'gate' && !isPassable(config, target, solved)) {
      const gate = gateAt(config, target);
      if (gate) { pendingGateId = gate.id; cb.onGateOpen(gate.id); }
      return;
    }
    // passable — begin a tween into the target cell.
    foxPos.row = target.row; foxPos.col = target.col;
    fromX = fox.position.x; fromZ = fox.position.z;
    toX = sx(target.col); toZ = sz(target.row);
    moveT = 0; moving = true;
    cb.onSfx?.('hop');
  };

  const setDir = (dir: Direction): void => tryMove(dir);

  // canvas swipe + wheel zoom
  let downX = 0, downY = 0;
  const onPointerDown = (e: PointerEvent): void => { downX = e.clientX; downY = e.clientY; };
  const onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - downX, dy = e.clientY - downY;
    if (Math.hypot(dx, dy) < 22) return;
    if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 'right' : 'left');
    else setDir(dy > 0 ? 'down' : 'up');
  };
  const onWheel = (e: WheelEvent): void => { e.preventDefault(); zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY > 0 ? 1.1 : 0.9))); };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  const onResize = (): void => {
    const { w, h } = sizeOf(); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  // ---------- Loop ----------
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = now - lastTime; lastTime = now; if (dt > 50) dt = 50;

    if (moving) {
      moveT += dt / MOVE_MS;
      if (moveT >= 1) {
        moveT = 1; moving = false;
        fox.position.set(toX, 0, toZ);
        if (config.grid.cells[foxPos.row]?.[foxPos.col] === 'end' && !ended) {
          ended = true; cb.onSfx?.('win'); cb.onWin();
        }
      } else {
        fox.position.x = lerp(fromX, toX, moveT);
        fox.position.z = lerp(fromZ, toZ, moveT);
      }
    }
    fox.position.y = moving ? Math.abs(Math.sin(now / 90)) * 0.12 : 0;

    // Gate door reveal animation.
    for (const node of gateNodes.values()) {
      if (node.reveal >= 0 && node.reveal < 1) {
        node.reveal = Math.min(1, node.reveal + dt / 350);
        node.door.scale.y = 1 - node.reveal;
        node.door.position.y = 0.55 * (1 - node.reveal);
        if (node.reveal >= 1) node.door.visible = false;
      }
    }
    endMarker.rotation.y += dt * 0.003;
    endMarker.position.y = 0.5 + Math.sin(now / 300) * 0.08;

    // Camera follow (fixed yaw, above + behind).
    const desired = camPos.set(fox.position.x, 9 * zoom, fox.position.z + 7 * zoom);
    if (!camInit) { camInit = true; } else { desired.lerp(new THREE.Vector3(fox.position.x, 9 * zoom, fox.position.z + 7 * zoom), 1); }
    camera.position.lerp(desired, camInit ? 0.12 : 1);
    camera.lookAt(fox.position.x, 0.4, fox.position.z);

    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    setDir,
    resolveGate(correct: boolean): void {
      if (!pendingGateId) return;
      const id = pendingGateId; pendingGateId = null;
      if (correct) {
        solved.add(id);
        const node = gateNodes.get(id);
        if (node) {
          node.reveal = 0; // start door-open animation
          // walk the fox into the now-open gate cell
          foxPos.row = node.r; foxPos.col = node.c;
          fromX = fox.position.x; fromZ = fox.position.z;
          toX = sx(node.c); toZ = sz(node.r);
          moveT = 0; moving = true;
        }
        cb.onSfx?.('catch');
        cb.onGatesProgress(solved.size, config.gates.length);
      } else {
        wrongAnswers += 1;
        cb.onSfx?.('escape');
      }
    },
    resize(): void { onResize(); },
    zoomBy(factor: number): void { zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor)); },
    getStats() { return { gatesTotal: config.gates.length, gatesSolved: solved.size, wrongAnswers }; },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      walls.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
