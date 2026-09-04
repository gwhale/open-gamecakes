// Cakey Stacks — the 3D Cake Pan renderer.
//
// A real pan on a bakery counter: slices fall into it, frosting caps catch the
// light, sprinkles burst when a layer comes out. The whole board is drawn with
// ~16 instanced meshes (two per flavour, one for sprinkles), so a full pan is a
// handful of draw calls and an iPad never breaks a sweat.
//
// No runtime `three` import — the namespace arrives as a factory argument, same
// bundle-hygiene rule as every other 3D game here. Picking "2D Classic" on the
// launcher means this module is never even fetched.

import type * as THREE from 'three';
import { COLS, ROWS, PIECE_TYPES, cellsOf, type Cell } from '@/lib/games/stacks/logic';
import {
  FLAVOURS,
  SPRINKLES,
  type StacksFrame,
  type StacksRenderer,
} from '@/lib/games/stacks/types';

type ThreeNS = typeof THREE;

/** Board cell → world position. x grows right, y grows DOWN on the board and
 *  UP in the world, so the flip lives here and nowhere else. */
const worldX = (x: number): number => x - (COLS - 1) / 2;
const worldY = (y: number): number => (ROWS - 1) / 2 - y;

const MAX_CELLS = COLS * ROWS + 8;
const MAX_SPRINKLES = 260;

interface Sprinkle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  rot: THREE.Euler;
  life: number;
  ttl: number;
}

export function createStacks3DRenderer(
  THREE: ThreeNS,
  container: HTMLElement,
  opts: { reducedMotion?: boolean } = {},
): StacksRenderer {
  const reduced = opts.reducedMotion === true;

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const sizeOf = (): { w: number; h: number } => ({
    w: container.clientWidth || 1,
    h: container.clientHeight || 1,
  });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  // ---------- scene ----------
  const scene = new THREE.Scene();
  const SKY_CALM = new THREE.Color(0x2b1c3a);
  const SKY_DANGER = new THREE.Color(0x4a2030);
  scene.background = SKY_CALM.clone();
  scene.fog = new THREE.Fog(SKY_CALM.getHex(), 26, 64);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(38, w0 / h0, 0.1, 160);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  scene.add(new THREE.HemisphereLight(0xffe9f4, 0x2a1830, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.25);
  key.position.set(4, 15, 16);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -8; key.shadow.camera.right = 8;
  key.shadow.camera.top = 12; key.shadow.camera.bottom = -12;
  key.shadow.camera.near = 1; key.shadow.camera.far = 44;
  key.shadow.bias = -0.0012;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9ec4, 0.5);
  rim.position.set(-9, 4, -6);
  scene.add(rim);
  // Frontal fill — without it the pan walls throw a hard diagonal band across
  // the stack and the lower rows go muddy.
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3, 2, 14);
  scene.add(fill);

  // ---------- disposable bookkeeping ----------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(v: T): T => { geos.push(v); return v; };
  const m = <T extends THREE.Material>(v: T): T => { mats.push(v); return v; };

  // ---------- the pan ----------
  const panGroup = new THREE.Group();
  scene.add(panGroup);

  const PAN_W = COLS + 0.9;
  const PAN_H = ROWS + 0.7;
  const WALL = 0.42;

  const panMat = m(new THREE.MeshStandardMaterial({ color: 0xe8d5c4, roughness: 0.55, metalness: 0.18 }));
  const panRimMat = m(new THREE.MeshStandardMaterial({
    color: 0xfb7185, roughness: 0.4, metalness: 0.1, emissive: 0x2a0a12, emissiveIntensity: 0.4,
  }));
  const floorMat = m(new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.9 }));

  const wallGeoV = g(new THREE.BoxGeometry(WALL, PAN_H, 1.5));
  const left = new THREE.Mesh(wallGeoV, panMat);
  left.position.set(-(COLS / 2) - WALL / 2, 0, 0);
  const right = new THREE.Mesh(wallGeoV, panMat);
  right.position.set((COLS / 2) + WALL / 2, 0, 0);
  const baseGeo = g(new THREE.BoxGeometry(PAN_W, WALL, 1.5));
  const base = new THREE.Mesh(baseGeo, panMat);
  base.position.set(0, -(ROWS / 2) - WALL / 2, 0);
  const backGeo = g(new THREE.PlaneGeometry(COLS, ROWS));
  const back = new THREE.Mesh(backGeo, floorMat);
  back.position.set(0, 0, -0.62);
  back.receiveShadow = true;
  for (const mesh of [left, right, base]) { mesh.castShadow = true; mesh.receiveShadow = true; }
  panGroup.add(left, right, base, back);

  // Rim strips along the top of each wall — this is what turns red when the
  // stack gets near the top, so the danger reads without counting rows.
  const rimGeo = g(new THREE.BoxGeometry(PAN_W, 0.24, 1.7));
  const rimTop = new THREE.Mesh(rimGeo, panRimMat);
  rimTop.position.set(0, ROWS / 2 + 0.14, 0);
  panGroup.add(rimTop);

  // Counter behind the pan, for depth.
  const counterGeo = g(new THREE.PlaneGeometry(80, 50));
  const counterMat = m(new THREE.MeshStandardMaterial({ color: 0x1d1430, roughness: 1 }));
  const counter = new THREE.Mesh(counterGeo, counterMat);
  counter.position.set(0, 0, -6);
  scene.add(counter);

  // ---------- block instancing ----------
  const bodyGeo = g(new THREE.BoxGeometry(0.92, 0.92, 0.92));
  // The frosting cap is DEEPER than the slice it sits on (1.02 vs 0.92) so it
  // proud-edges past the front face. From the player's near-head-on camera the
  // top face is barely in view, and without that overhang every slice read as a
  // plain coloured cube instead of cake.
  const capGeo = g(new THREE.BoxGeometry(0.84, 0.26, 1.02));

  interface FlavourMeshes { body: THREE.InstancedMesh; cap: THREE.InstancedMesh; n: number }
  const flavourMeshes: FlavourMeshes[] = PIECE_TYPES.map((type) => {
    const f = FLAVOURS[type];
    const bodyMat = m(new THREE.MeshStandardMaterial({ color: f.body, roughness: 0.44, metalness: 0.03 }));
    const capMat = m(new THREE.MeshStandardMaterial({ color: f.cap, roughness: 0.32, metalness: 0.02 }));
    const body = new THREE.InstancedMesh(bodyGeo, bodyMat, MAX_CELLS);
    const cap = new THREE.InstancedMesh(capGeo, capMat, MAX_CELLS);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    cap.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.castShadow = true; body.receiveShadow = true;
    cap.castShadow = false; cap.receiveShadow = false;
    body.frustumCulled = false; cap.frustumCulled = false;
    body.count = 0; cap.count = 0;
    scene.add(body, cap);
    return { body, cap, n: 0 };
  });

  // Ghost — four translucent outlines showing where the slice will land.
  const ghostMat = m(new THREE.MeshStandardMaterial({
    color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.6, depthWrite: false,
  }));
  const ghostMesh = new THREE.InstancedMesh(bodyGeo, ghostMat, 8);
  ghostMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  ghostMesh.frustumCulled = false;
  ghostMesh.count = 0;
  scene.add(ghostMesh);

  // ---------- sprinkles ----------
  const sprinkleGeo = g(new THREE.BoxGeometry(0.22, 0.09, 0.09));
  const sprinkleMat = m(new THREE.MeshStandardMaterial({ roughness: 0.5, vertexColors: false }));
  const sprinkleMesh = new THREE.InstancedMesh(sprinkleGeo, sprinkleMat, MAX_SPRINKLES);
  sprinkleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sprinkleMesh.frustumCulled = false;
  sprinkleMesh.count = 0;
  const sprinkleColors = new Float32Array(MAX_SPRINKLES * 3);
  sprinkleMesh.instanceColor = new THREE.InstancedBufferAttribute(sprinkleColors, 3);
  scene.add(sprinkleMesh);
  const sprinkles: Sprinkle[] = [];
  const tmpColor = new THREE.Color();

  // ---------- camera fit ----------
  const dummy = new THREE.Object3D();
  let camDist = 30;
  let pxPerCell = 24;

  function fitCamera(): void {
    const { w, h } = sizeOf();
    camera.aspect = w / h;
    const vFov = (camera.fov * Math.PI) / 180;
    const need = PAN_H + 1.6;                       // vertical span to cover
    const distV = need / 2 / Math.tan(vFov / 2);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const distH = (PAN_W + 1.6) / 2 / Math.tan(hFov / 2);
    camDist = Math.max(distV, distH) * 1.04;
    camera.position.set(0, 2.6, camDist);
    camera.lookAt(0, -0.4, 0);
    camera.updateProjectionMatrix();
    // Screen pixels per board cell — the drag-to-column gesture's scale. Taken
    // by projecting two points a cell apart at the board plane.
    const a = new THREE.Vector3(0, 0, 0).project(camera);
    const b = new THREE.Vector3(1, 0, 0).project(camera);
    pxPerCell = Math.max(10, (Math.abs(b.x - a.x) * w) / 2);
  }

  function resize(): void {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    fitCamera();
  }
  fitCamera();

  // ---------- effects ----------
  let punchT = 0;
  let punchAmt = 0;
  let idle = 0;

  function pushSprinkle(x: number, y: number, spread: number): void {
    if (sprinkles.length >= MAX_SPRINKLES) sprinkles.shift();
    const ang = Math.random() * Math.PI * 2;
    const speed = 2.2 + Math.random() * 3.4;
    sprinkles.push({
      pos: new THREE.Vector3(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread, 0.2 + Math.random() * 0.5),
      vel: new THREE.Vector3(Math.cos(ang) * speed * 0.5, 2.4 + Math.random() * 3.2, Math.sin(ang) * speed * 0.25),
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9),
      rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      life: 0,
      ttl: 900 + Math.random() * 500,
    });
  }

  function stepSprinkles(dt: number): void {
    const s = dt / 1000;
    for (let i = sprinkles.length - 1; i >= 0; i--) {
      const p = sprinkles[i];
      p.life += dt;
      if (p.life >= p.ttl) { sprinkles.splice(i, 1); continue; }
      p.vel.y -= 16 * s;
      p.pos.addScaledVector(p.vel, s);
      p.rot.x += p.spin.x * s; p.rot.y += p.spin.y * s; p.rot.z += p.spin.z * s;
    }
    let n = 0;
    for (const p of sprinkles) {
      const fade = 1 - p.life / p.ttl;
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(0.6 + fade * 0.6);
      dummy.updateMatrix();
      sprinkleMesh.setMatrixAt(n, dummy.matrix);
      n++;
    }
    sprinkleMesh.count = n;
    sprinkleMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- draw ----------
  function placeCell(fm: FlavourMeshes, x: number, y: number, scale: number, yOffset = 0): void {
    if (fm.n >= MAX_CELLS) return;
    dummy.position.set(worldX(x), worldY(y) - yOffset, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    fm.body.setMatrixAt(fm.n, dummy.matrix);
    dummy.position.y += 0.4 * scale;
    dummy.updateMatrix();
    fm.cap.setMatrixAt(fm.n, dummy.matrix);
    fm.n++;
  }

  return {
    draw(frame: StacksFrame, dtMs: number) {
      for (const fm of flavourMeshes) fm.n = 0;

      const clearingRows = new Set(frame.clearing?.rows ?? []);
      const t = frame.clearing?.t ?? 0;

      for (let y = 0; y < ROWS; y++) {
        const popping = clearingRows.has(y);
        for (let x = 0; x < COLS; x++) {
          const v = frame.board[y * COLS + x];
          if (!v) continue;
          placeCell(flavourMeshes[v - 1], x, y, popping ? Math.max(0.02, 1 - t) : 1);
        }
      }

      if (frame.active) {
        const fm = flavourMeshes[PIECE_TYPES.indexOf(frame.active.type)];
        const slide = reduced ? 0 : frame.stepT;
        for (const c of cellsOf(frame.active)) placeCell(fm, c.x, c.y, 1, slide);
      }

      for (const fm of flavourMeshes) {
        fm.body.count = fm.n;
        fm.cap.count = fm.n;
        fm.body.instanceMatrix.needsUpdate = true;
        fm.cap.instanceMatrix.needsUpdate = true;
      }

      // Ghost
      let gn = 0;
      if (frame.ghost) {
        for (const c of cellsOf(frame.ghost)) {
          if (c.y < 0 || gn >= 8) continue;
          dummy.position.set(worldX(c.x), worldY(c.y), 0);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(0.98);
          dummy.updateMatrix();
          ghostMesh.setMatrixAt(gn++, dummy.matrix);
        }
      }
      ghostMesh.count = gn;
      ghostMesh.instanceMatrix.needsUpdate = true;

      // Danger tint — pan rim + sky warm up as the stack reaches the top.
      const target = frame.danger ? SKY_DANGER : SKY_CALM;
      (scene.background as THREE.Color).lerp(target, Math.min(1, dtMs / 260));
      panRimMat.emissiveIntensity = frame.danger ? 0.5 + Math.sin(idle * 6) * 0.35 : 0.4;
      panRimMat.color.setHex(frame.danger ? 0xf43f5e : 0xfb7185);

      // Camera: a gentle bakery-counter drift, plus the line-clear punch.
      idle += dtMs / 1000;
      const driftX = reduced ? 0 : Math.sin(idle * 0.35) * 0.22;
      const driftY = reduced ? 0 : Math.cos(idle * 0.27) * 0.16;
      let shakeX = 0, shakeY = 0;
      if (punchT > 0 && !reduced) {
        punchT = Math.max(0, punchT - dtMs / 300);
        const k = punchT * punchT * punchAmt * 0.5;
        shakeX = (Math.random() - 0.5) * k;
        shakeY = (Math.random() - 0.5) * k;
      }
      camera.position.set(driftX + shakeX, 2.6 + driftY + shakeY, camDist);
      camera.lookAt(0, -0.4, 0);

      stepSprinkles(dtMs);
      renderer.render(scene, camera);
    },

    pxPerCell: () => pxPerCell,

    boardOrigin() {
      const { w, h } = sizeOf();
      const topLeft = new THREE.Vector3(worldX(0) - 0.5, worldY(0) + 0.5, 0).project(camera);
      return { x: ((topLeft.x + 1) / 2) * w, y: ((1 - topLeft.y) / 2) * h };
    },

    burst(cells: Cell[], kind) {
      if (reduced || kind === 'lock') return;
      const per = kind === 'bomb' ? 2 : 3;
      let n = 0;
      for (const c of cells) {
        for (let i = 0; i < per && n < 90; i++, n++) pushSprinkle(worldX(c.x), worldY(c.y), 0.8);
      }
      // Recolour the whole live pool — cheap (≤260 writes) and keeps the
      // confetti reading as mixed sprinkles rather than one flat colour.
      for (let i = 0; i < sprinkles.length; i++) {
        tmpColor.setHex(SPRINKLES[(Math.random() * SPRINKLES.length) | 0]);
        sprinkleColors[i * 3] = tmpColor.r;
        sprinkleColors[i * 3 + 1] = tmpColor.g;
        sprinkleColors[i * 3 + 2] = tmpColor.b;
      }
      if (sprinkleMesh.instanceColor) sprinkleMesh.instanceColor.needsUpdate = true;
    },

    punch(strength: number) {
      if (reduced) return;
      punchAmt = Math.max(punchAmt * 0.5, Math.min(1, strength));
      punchT = 1;
    },

    resize,

    dispose() {
      sprinkles.length = 0;
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
