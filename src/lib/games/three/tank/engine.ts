// Minnow Catch — a giant 3D fishing tank (Three.js, no physics).
//
// The whole playfield is one big aquarium: a chrome-framed glass tank with a
// sandy floor, swaying seaweed, rising bubbles, and a school of bright fish
// drifting in 3D. The kid loads a BAIT (engine.setBait) and taps the water to
// drop a hook there; a fish whose color matches the bait swims up and bites
// (engine fires onFishBite). The host poses a math gate; on a correct answer
// the fish is reeled up out of the water (engine.reelInFish, +1), on a wrong
// one it steals the bait and darts to a far corner (engine.escapeFish), and if
// the kid stalls the shark snatches it clean off the hook (engine.sharkSteal).
// Clear all the fish (or run out the 3-minute clock) and the round ends.
//
// Why no cannon-es: nothing here needs a rigid-body solver — fish swim on
// simple steering toward a target (a wander point, or the baited hook), and
// the shark lunge + reel-in are scripted lerps. Skipping physics keeps the
// bundle light and the iPad framerate high.
//
// Bundle hygiene: the `three` namespace arrives as an argument (see ./types).

import { BAITS, FISH_COUNT, type BaitType, type ThreeNS, type TankEngine, type TankEngineCallbacks } from './types';
import { getSessionDurationMs } from '@/lib/games/session-duration';

// ---------------------------------------------------------------------------
// Tank geometry (world units). "Giant" = the tank fills the frame and the
// camera sits just outside the front glass looking in.
// ---------------------------------------------------------------------------
const TANK_W = 19;
const TANK_H = 11;
const TANK_D = 8;
const HALF_W = TANK_W / 2;
const HALF_H = TANK_H / 2;
const HALF_D = TANK_D / 2;
const FLOOR_Y = -HALF_H;
const SURFACE_Y = HALF_H - 0.4; // where the water line (and stowed hook) sits

// Keep fish off the glass by this margin so they never clip a wall.
const MARGIN_XZ = 1.6;
const MARGIN_TOP = 1.2;
const FISH_FLOOR = FLOOR_Y + 1.3;

// Swim feel — deliberately gentle (the old "fish too fast" kid ticket).
const WANDER_MIN = 1.0;
const WANDER_MAX = 1.9;
const SEEK_SPEED = 3.0; // a fish that likes the bait commits and swims to it
const FLEE_SPEED = 8.5;
const FLEE_MS = 1500;
const ARRIVE_DIST = 0.7;
const BITE_DIST = 1.0; // how close a seeking fish must get to the bait to bite

// Cast + reel timing.
const CAST_MS = 420;
const REEL_MS = 700;

// Shark lunge timing (reused for the "snatch off the hook" hazard).
const EAT_MS = 720;
const EAT_REMOVE_AT = 0.55; // fish vanishes partway through the lunge

// Minimal structural aliases so we don't repeat `InstanceType<...>` noise.
type ThreeGroup = import('three').Group;
type ThreeMesh = import('three').Mesh;
type ThreeVec3 = import('three').Vector3;

interface Fish {
  id: number;
  wants: BaitType;
  group: ThreeGroup;
  body: ThreeMesh;
  tail: ThreeMesh;
  target: ThreeVec3;
  speed: number;
  phase: number;
  mode: 'wander' | 'seek' | 'bite' | 'flee';
  fleeUntil: number;
  alive: boolean;
  /** True once the shark/reel animation owns this fish (frozen from steering). */
  locked: boolean;
}

interface Eater {
  shark: ThreeGroup;
  fish: Fish;
  from: ThreeVec3;
  to: ThreeVec3;
  t: number;
  removed: boolean;
}

interface Reeler {
  fish: Fish;
  from: ThreeVec3;
  to: ThreeVec3;
  t: number;
  removed: boolean;
}

interface Bubble {
  mesh: ThreeMesh;
  speed: number;
}

export function createTankEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  opts: { fishCount?: number },
  cb: TankEngineCallbacks,
): TankEngine {
  const fishCount = opts.fishCount ?? FISH_COUNT;
  // Round length = the kid's chosen 1/2/3-min pick (see session-duration).
  const roundMs = getSessionDurationMs();

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
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

  // ---------- Scene + camera ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfeef6);
  // Teal depth fog reads as "looking through water" without a transparent
  // front pane (which would fight depth-sorting against the fish).
  scene.fog = new THREE.Fog(0x2f9fc4, 16, 40);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(50, w0 / h0, 0.1, 200);
  camera.position.set(0, 1.4, 18.5);
  camera.lookAt(0, -0.3, 0);

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xddf4ff, 0.85);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.0);
  sun.position.set(-6, 16, 10);
  scene.add(sun);
  // A cool fill from below = soft caustic bounce off the sand.
  const fill = new THREE.PointLight(0x5fd4ef, 0.5, 60);
  fill.position.set(0, FLOOR_Y + 1, 6);
  scene.add(fill);

  // Track every geometry/material so dispose() is exhaustive.
  const geos: import('three').BufferGeometry[] = [];
  const mats: import('three').Material[] = [];
  const track = <T extends import('three').BufferGeometry | import('three').Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geos.push(x as import('three').BufferGeometry);
    else mats.push(x as import('three').Material);
    return x;
  };

  // ---------- Tank shell (sand floor, glass panes, chrome frame) ----------
  const tank = new THREE.Group();
  scene.add(tank);

  // Sandy floor.
  const floorGeo = track(new THREE.BoxGeometry(TANK_W - 0.4, 0.7, TANK_D - 0.4));
  const floorMat = track(new THREE.MeshStandardMaterial({ color: 0xf2e0b0, roughness: 1 }));
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, FLOOR_Y + 0.35, 0);
  tank.add(floor);

  // Faint glass panes — back + two sides (front + top are open to the camera).
  const paneMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcdeef7,
      transparent: true,
      opacity: 0.13,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  const backGeo = track(new THREE.PlaneGeometry(TANK_W, TANK_H));
  const back = new THREE.Mesh(backGeo, paneMat);
  back.position.set(0, 0, -HALF_D);
  tank.add(back);
  const sideGeo = track(new THREE.PlaneGeometry(TANK_D, TANK_H));
  for (const sx of [-HALF_W, HALF_W]) {
    const side = new THREE.Mesh(sideGeo, paneMat);
    side.position.set(sx, 0, 0);
    side.rotation.y = Math.PI / 2;
    tank.add(side);
  }

  // Chrome frame — beams along the 12 box edges. Shared cube geo, scaled.
  const beamGeo = track(new THREE.BoxGeometry(1, 1, 1));
  const beamMat = track(new THREE.MeshStandardMaterial({ color: 0xdfeef5, roughness: 0.25, metalness: 0.85 }));
  const T = 0.28; // beam thickness
  const beam = (x: number, y: number, z: number, sx: number, sy: number, sz: number): void => {
    const m = new THREE.Mesh(beamGeo, beamMat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    tank.add(m);
  };
  for (const y of [-HALF_H, HALF_H]) {
    beam(0, y, -HALF_D, TANK_W, T, T);
    beam(0, y, HALF_D, TANK_W, T, T);
    beam(-HALF_W, y, 0, T, T, TANK_D);
    beam(HALF_W, y, 0, T, T, TANK_D);
  }
  for (const x of [-HALF_W, HALF_W]) {
    for (const z of [-HALF_D, HALF_D]) {
      beam(x, 0, z, T, TANK_H, T);
    }
  }

  // ---------- Seaweed (swaying) ----------
  const weedGeo = track(new THREE.CylinderGeometry(0.12, 0.22, 4.2, 7));
  const weedMat = track(new THREE.MeshStandardMaterial({ color: 0x2fae6a, roughness: 0.8 }));
  const weeds: { mesh: ThreeMesh; phase: number; baseX: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(weedGeo, weedMat);
    const x = -HALF_W + 2 + Math.random() * (TANK_W - 4);
    const z = -HALF_D + 1 + Math.random() * (TANK_D - 2);
    m.position.set(x, FLOOR_Y + 2.1, z);
    m.scale.setY(0.7 + Math.random() * 0.7);
    tank.add(m);
    weeds.push({ mesh: m, phase: Math.random() * Math.PI * 2, baseX: x });
  }

  // ---------- Pebbles ----------
  const pebbleGeo = track(new THREE.SphereGeometry(0.5, 8, 6));
  const pebbleMat = track(new THREE.MeshStandardMaterial({ color: 0xb9a98a, roughness: 1 }));
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(pebbleGeo, pebbleMat);
    m.position.set(
      -HALF_W + 1.5 + Math.random() * (TANK_W - 3),
      FLOOR_Y + 0.6,
      -HALF_D + 1 + Math.random() * (TANK_D - 2),
    );
    m.scale.set(0.5 + Math.random() * 0.9, 0.35 + Math.random() * 0.4, 0.5 + Math.random() * 0.9);
    tank.add(m);
  }

  // ---------- Bubbles (rising) ----------
  const bubbleGeo = track(new THREE.SphereGeometry(0.12, 8, 6));
  const bubbleMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, roughness: 0.1 }),
  );
  const bubbles: Bubble[] = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(bubbleGeo, bubbleMat);
    m.position.set(
      -HALF_W + 1 + Math.random() * (TANK_W - 2),
      FLOOR_Y + Math.random() * TANK_H,
      -HALF_D + 1 + Math.random() * (TANK_D - 2),
    );
    const s = 0.5 + Math.random() * 1.3;
    m.scale.setScalar(s);
    tank.add(m);
    bubbles.push({ mesh: m, speed: 0.6 + Math.random() * 1.2 });
  }

  // ---------- Fish (shared geometry, per-fish material tinted by bait) ----------
  const fishBodyGeo = track(new THREE.SphereGeometry(0.7, 16, 12));
  const fishTailGeo = track(new THREE.ConeGeometry(0.55, 0.95, 12));
  const finGeo = track(new THREE.ConeGeometry(0.32, 0.7, 8));
  const eyeGeo = track(new THREE.SphereGeometry(0.13, 8, 6));
  const eyeMat = track(new THREE.MeshStandardMaterial({ color: 0x10243a, roughness: 0.3 }));
  const eyeWhiteGeo = track(new THREE.SphereGeometry(0.22, 8, 6));
  const eyeWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));

  const randTarget = (): ThreeVec3 =>
    new THREE.Vector3(
      -HALF_W + MARGIN_XZ + Math.random() * (TANK_W - 2 * MARGIN_XZ),
      FISH_FLOOR + Math.random() * (TANK_H - MARGIN_TOP - 1.3),
      -HALF_D + MARGIN_XZ + Math.random() * (TANK_D - 2 * MARGIN_XZ),
    );

  const fishes: Fish[] = [];
  for (let i = 0; i < fishCount; i++) {
    // Cycle through the bait types so every bait always has fish to catch
    // (8 fish over 3 baits → 3 worm, 3 shrimp, 2 lure). Body color = bait color
    // so the kid matches by sight.
    const baitInfo = BAITS[i % BAITS.length];
    const color = baitInfo.color;
    const group = new THREE.Group();
    const bodyMat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 }));
    const body = new THREE.Mesh(fishBodyGeo, bodyMat);
    body.scale.set(1.5, 0.95, 0.62);
    body.userData.fishId = i;
    group.add(body);

    const tailMat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
    const tail = new THREE.Mesh(fishTailGeo, tailMat);
    tail.position.set(-1.15, 0, 0);
    tail.rotation.z = -Math.PI / 2; // flare opens toward the back (−X)
    group.add(tail);

    const dorsal = new THREE.Mesh(finGeo, tailMat);
    dorsal.position.set(-0.1, 0.6, 0);
    group.add(dorsal);

    // Eyes near the front (+X), one each side.
    for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(eyeWhiteGeo, eyeWhiteMat);
      w.position.set(0.72, 0.2, 0.3 * sz);
      group.add(w);
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(0.82, 0.2, 0.34 * sz);
      group.add(e);
    }

    group.scale.setScalar(0.8 + Math.random() * 0.4);
    const start = randTarget();
    group.position.copy(start);
    tank.add(group);

    fishes.push({
      id: i,
      wants: baitInfo.type,
      group,
      body,
      tail,
      target: randTarget(),
      speed: WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN),
      phase: Math.random() * Math.PI * 2,
      mode: 'wander',
      fleeUntil: 0,
      alive: true,
      locked: false,
    });
  }

  // ---------- Hook + line + bait (built once, re-cast each round) ----------
  const hook = new THREE.Group();
  // Fishing line: a thin vertical cylinder we scale/position to span from the
  // water surface down to the bait each frame.
  const lineGeo = track(new THREE.CylinderGeometry(0.03, 0.03, 1, 6));
  const lineMat = track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, transparent: true, opacity: 0.7 }));
  const line = new THREE.Mesh(lineGeo, lineMat);
  hook.add(line);
  // The metal hook itself — a small dark ring at the bait.
  const hookRingGeo = track(new THREE.TorusGeometry(0.12, 0.035, 6, 12));
  const hookRingMat = track(new THREE.MeshStandardMaterial({ color: 0x9aa7b4, roughness: 0.3, metalness: 0.9 }));
  const hookRing = new THREE.Mesh(hookRingGeo, hookRingMat);
  hookRing.rotation.x = Math.PI / 2;
  hook.add(hookRing);
  // The bait blob — a small sphere tinted to the loaded bait's color.
  const baitGeo = track(new THREE.SphereGeometry(0.22, 10, 8));
  const baitMat = track(new THREE.MeshStandardMaterial({ color: BAITS[0].color, roughness: 0.4, emissive: 0x000000 }));
  const baitBlob = new THREE.Mesh(baitGeo, baitMat);
  hook.add(baitBlob);
  hook.visible = false;
  tank.add(hook);

  // Hook state machine.
  type HookState = 'stowed' | 'casting' | 'cast' | 'biting';
  let hookState: HookState = 'stowed';
  const hookPos = new THREE.Vector3(0, SURFACE_Y - 3, 0); // where the bait sits
  const castFrom = new THREE.Vector3();
  const castTo = new THREE.Vector3();
  let castT = 0;
  let currentBait: BaitType = BAITS[0].type;
  let biter: Fish | null = null;

  const positionHook = (): void => {
    // Bait sits at hookPos; the line runs straight up from it to the surface.
    baitBlob.position.copy(hookPos);
    hookRing.position.set(hookPos.x, hookPos.y + 0.18, hookPos.z);
    const top = SURFACE_Y;
    const len = Math.max(0.1, top - hookPos.y);
    line.scale.set(1, len, 1);
    line.position.set(hookPos.x, hookPos.y + len / 2, hookPos.z);
  };

  const applyBaitColor = (): void => {
    const info = BAITS.find((b) => b.type === currentBait) ?? BAITS[0];
    baitMat.color.setHex(info.color);
  };
  applyBaitColor();

  // Send every currently-seeking fish back to wandering (used when the hook is
  // stowed or the bait changes so fish don't chase a dead hook).
  const releaseSeekers = (): void => {
    for (const f of fishes) {
      if (f.locked) continue;
      if (f.mode === 'seek') {
        f.mode = 'wander';
        f.target = randTarget();
        f.speed = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
      }
    }
  };

  const stowHook = (): void => {
    hookState = 'stowed';
    hook.visible = false;
    biter = null;
    releaseSeekers();
  };

  const castHook = (point: ThreeVec3): void => {
    // Re-cast is allowed any time a fish isn't actively biting.
    if (hookState === 'biting') return;
    castFrom.set(point.x, SURFACE_Y - 0.3, point.z);
    castTo.copy(point);
    hookPos.copy(castFrom);
    castT = 0;
    hookState = 'casting';
    hook.visible = true;
    applyBaitColor();
    positionHook();
    releaseSeekers(); // any fish chasing the old spot re-evaluates next frame
    cb.onSfx?.('cast');
    spawnSplash(new THREE.Vector3(point.x, SURFACE_Y, point.z));
  };

  // ---------- Shark (built lazily per snatch, reused geometry) ----------
  const sharkBodyGeo = track(new THREE.SphereGeometry(1, 16, 12));
  const sharkFinGeo = track(new THREE.ConeGeometry(0.7, 1.4, 4));
  const sharkTailGeo = track(new THREE.ConeGeometry(0.8, 1.6, 4));
  const sharkBodyMat = track(new THREE.MeshStandardMaterial({ color: 0x6b7c8c, roughness: 0.6 }));
  const sharkBellyMat = track(new THREE.MeshStandardMaterial({ color: 0xdfe7ec, roughness: 0.7 }));
  const makeShark = (): ThreeGroup => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(sharkBodyGeo, sharkBodyMat);
    b.scale.set(2.4, 1.1, 1.0);
    g.add(b);
    const belly = new THREE.Mesh(sharkBodyGeo, sharkBellyMat);
    belly.scale.set(2.0, 0.5, 0.9);
    belly.position.y = -0.5;
    g.add(belly);
    const dorsal = new THREE.Mesh(sharkFinGeo, sharkBodyMat);
    dorsal.position.set(-0.2, 1.0, 0);
    g.add(dorsal);
    const tail = new THREE.Mesh(sharkTailGeo, sharkBodyMat);
    tail.position.set(-2.4, 0, 0);
    tail.rotation.z = Math.PI / 2;
    g.add(tail);
    // Mouth — a flat dark wedge near the front.
    const mouth = new THREE.Mesh(sharkFinGeo, eyeMat);
    mouth.scale.set(0.8, 0.5, 1.2);
    mouth.position.set(2.0, -0.35, 0);
    mouth.rotation.z = -Math.PI / 2;
    g.add(mouth);
    return g;
  };
  const eaters: Eater[] = [];
  const reelers: Reeler[] = [];

  // ---------- Splash sparkle (cast, catch) ----------
  const splashGeo = track(new THREE.SphereGeometry(0.1, 6, 5));
  const splashMat = track(
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, roughness: 0.1 }),
  );
  interface Puff { mesh: ThreeMesh; vel: ThreeVec3; life: number }
  const puffs: Puff[] = [];
  function spawnSplash(at: ThreeVec3): void {
    for (let i = 0; i < 10; i++) {
      // Per-puff material clone so overlapping splashes fade independently
      // (the shared splashMat is just the template). Cloned mats are disposed
      // when the puff dies.
      const m = new THREE.Mesh(splashGeo, splashMat.clone());
      m.position.copy(at);
      const s = 0.6 + Math.random();
      m.scale.setScalar(s);
      tank.add(m);
      const a = Math.random() * Math.PI * 2;
      const up = 1 + Math.random() * 2;
      puffs.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(a) * 2.5, up, Math.sin(a) * 2.5),
        life: 1,
      });
    }
  }

  // ---------- Steering helpers ----------
  const faceDir = (group: ThreeGroup, dx: number, dz: number): void => {
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    group.rotation.y = Math.atan2(-dz, dx); // body's +X axis points along motion
  };

  // ---------- Cast raycasting (tap the water) ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // The kid's tap maps to a point on the vertical plane through the middle of
  // the tank (z = 0), clamped inside the glass — "drop the hook here".
  const castPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const castHit = new THREE.Vector3();
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const pointerToWater = (clientX: number, clientY: number): ThreeVec3 | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.ray.intersectPlane(castPlane, castHit);
    if (!hit) return null;
    return new THREE.Vector3(
      clamp(hit.x, -HALF_W + MARGIN_XZ, HALF_W - MARGIN_XZ),
      clamp(hit.y, FISH_FLOOR, SURFACE_Y - 1.2),
      0,
    );
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (paused || ended) return;
    const point = pointerToWater(e.clientX, e.clientY);
    if (point) castHook(point);
    else cb.onSfx?.('bubble');
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);

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
  let paused = true;
  let ended = false;
  let elapsedMs = 0;
  let caught = 0;
  let lastEmit = -1;
  let lastTime = performance.now();
  let raf = 0;

  // ---------- Main loop ----------
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    // Bubbles + weeds animate even while paused, so the tank never looks frozen.
    for (const b of bubbles) {
      b.mesh.position.y += b.speed * dt * (paused ? 0.4 : 1);
      if (b.mesh.position.y > HALF_H) b.mesh.position.y = FLOOR_Y + 0.5;
    }
    const sway = now / 1000;
    for (const w of weeds) {
      w.mesh.rotation.z = Math.sin(sway * 1.3 + w.phase) * 0.18;
    }

    // Hook cast animation runs regardless of pause so the drop feels crisp.
    if (hookState === 'casting') {
      castT += dt / (CAST_MS / 1000);
      const t = Math.min(1, castT);
      // Ease-out drop.
      const e = 1 - (1 - t) * (1 - t);
      hookPos.lerpVectors(castFrom, castTo, e);
      positionHook();
      if (t >= 1) hookState = 'cast';
    } else if (hookState === 'cast' || hookState === 'biting') {
      positionHook();
      // Gentle bait bob to keep it lively.
      baitBlob.position.y = hookPos.y + Math.sin(sway * 3) * 0.05;
    }

    if (!paused && !ended) {
      // A baited, settled hook with no biter lures matching fish in.
      const luring = hookState === 'cast' && !biter;

      for (const f of fishes) {
        if (!f.alive || f.locked || f.mode === 'bite') continue;
        f.phase += dt * 6;

        // Decide steering intent for this fish.
        if (luring && f.mode !== 'flee' && f.wants === currentBait) {
          f.mode = 'seek';
          f.target = hookPos;
          f.speed = SEEK_SPEED;
        } else if (f.mode === 'seek' && (!luring || f.wants !== currentBait)) {
          // Bait changed or hook gone — give up the chase.
          f.mode = 'wander';
          f.target = randTarget();
          f.speed = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
        }

        const p = f.group.position;
        const dx = f.target.x - p.x;
        const dy = f.target.y - p.y;
        const dz = f.target.z - p.z;
        const dist = Math.hypot(dx, dy, dz);

        // A seeking fish that reaches the bait bites → hand off to the host.
        if (f.mode === 'seek' && luring && dist < BITE_DIST) {
          f.mode = 'bite';
          f.target = hookPos.clone();
          biter = f;
          hookState = 'biting';
          // Any other chasers back off — only one fish on the hook.
          for (const other of fishes) {
            if (other !== f && other.mode === 'seek') {
              other.mode = 'wander';
              other.target = randTarget();
              other.speed = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
            }
          }
          faceDir(f.group, hookPos.x - p.x, hookPos.z - p.z);
          cb.onSfx?.('bite');
          cb.onFishBite(f.id);
          continue;
        }

        if (dist < ARRIVE_DIST) {
          if (f.mode === 'flee' && now > f.fleeUntil) {
            f.mode = 'wander';
            f.speed = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
          }
          if (f.mode !== 'seek') f.target = randTarget();
        } else {
          const step = (f.speed * dt) / dist;
          p.x += dx * step;
          p.y += dy * step;
          p.z += dz * step;
          faceDir(f.group, dx, dz);
        }
        // Gentle vertical bob + tail wiggle.
        f.group.position.y += Math.sin(f.phase) * 0.004;
        f.tail.rotation.y = Math.sin(f.phase * 1.6) * 0.5;
      }

      elapsedMs += dt * 1000;
      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmit) {
        lastEmit = sec;
        cb.onTimeLeft(remaining);
      }
      if (remaining <= 0) {
        ended = true;
        cb.onRoundEnd();
      }
    } else if (biter && (hookState === 'biting')) {
      // While the challenge modal is up (paused), keep the hooked fish
      // wiggling on the line at the bait so it reads as "on the hook".
      biter.phase += dt * 10;
      biter.group.position.copy(hookPos);
      biter.group.position.y = hookPos.y + Math.sin(biter.phase) * 0.08;
      biter.tail.rotation.y = Math.sin(biter.phase * 2) * 0.7;
    }

    // Reel-in animation (correct answer) — the fish rides the line up and out.
    for (let i = reelers.length - 1; i >= 0; i--) {
      const rl = reelers[i];
      rl.t += dt / (REEL_MS / 1000);
      const t = Math.min(1, rl.t);
      const pos = rl.fish.group.position;
      pos.lerpVectors(rl.from, rl.to, t);
      rl.fish.group.rotation.z = Math.sin(t * Math.PI * 4) * 0.3; // flip-flop
      if (!rl.removed && t >= 0.9) {
        rl.removed = true;
        rl.fish.alive = false;
        rl.fish.group.visible = false;
        spawnSplash(new THREE.Vector3(rl.to.x, SURFACE_Y, rl.to.z));
      }
      if (t >= 1) reelers.splice(i, 1);
    }

    // Shark snatches run regardless of pause (they resolve the stalled bite).
    for (let i = eaters.length - 1; i >= 0; i--) {
      const eat = eaters[i];
      eat.t += dt / (EAT_MS / 1000);
      const t = Math.min(1, eat.t);
      const pos = eat.shark.position;
      pos.lerpVectors(eat.from, eat.to, t);
      // Slight rise then dive through the fish.
      pos.y += Math.sin(t * Math.PI) * 1.2;
      const dirX = eat.to.x - eat.from.x;
      const dirZ = eat.to.z - eat.from.z;
      faceDir(eat.shark, dirX, dirZ);
      if (!eat.removed && t >= EAT_REMOVE_AT) {
        eat.removed = true;
        eat.fish.alive = false;
        eat.fish.group.visible = false;
        spawnSplash(eat.fish.group.position);
        cb.onSfx?.('shark');
      }
      if (t >= 1) {
        tank.remove(eat.shark);
        eaters.splice(i, 1);
      }
    }

    // Splash puffs.
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.life -= dt * 1.6;
      pf.mesh.position.addScaledVector(pf.vel, dt);
      pf.vel.y -= dt * 4;
      const sm = pf.mesh.material as import('three').MeshStandardMaterial;
      sm.opacity = Math.max(0, pf.life) * 0.9;
      if (pf.life <= 0) {
        tank.remove(pf.mesh);
        sm.dispose(); // per-puff cloned material
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
    resize(): void {
      onResize();
    },
    setBait(bait: BaitType): void {
      currentBait = bait;
      applyBaitColor();
      // Re-evaluate chasers next frame: fish that no longer match give up,
      // fish that now match will start seeking (handled in the loop).
      releaseSeekers();
    },
    reelInFish(id: number): void {
      const fish = fishes.find((f) => f.id === id);
      if (!fish || !fish.alive || fish.locked) return;
      fish.locked = true;
      caught += 1;
      const from = fish.group.position.clone();
      const to = new THREE.Vector3(from.x, SURFACE_Y + 2.5, from.z);
      reelers.push({ fish, from, to, t: 0, removed: false });
      cb.onSfx?.('reel');
      stowHook();
    },
    escapeFish(id: number): void {
      const fish = fishes.find((f) => f.id === id);
      if (!fish || !fish.alive || fish.locked) return;
      fish.mode = 'flee';
      fish.speed = FLEE_SPEED;
      fish.fleeUntil = performance.now() + FLEE_MS;
      // Target the far corner from the fish, so the dart reads as "getting away".
      fish.target = new THREE.Vector3(
        fish.group.position.x >= 0 ? -HALF_W + MARGIN_XZ : HALF_W - MARGIN_XZ,
        FISH_FLOOR + Math.random() * (TANK_H - MARGIN_TOP - 1.3),
        fish.group.position.z >= 0 ? -HALF_D + MARGIN_XZ : HALF_D - MARGIN_XZ,
      );
      cb.onSfx?.('escape');
      stowHook();
    },
    sharkSteal(id: number): void {
      const fish = fishes.find((f) => f.id === id);
      if (!fish || !fish.alive || fish.locked) return;
      fish.locked = true;
      // The lunge line passes exactly THROUGH the fish: from a point well off
      // one side/back to a point well off the other side/front.
      const target = fish.group.position.clone();
      const side = target.x >= 0 ? 1 : -1;
      const dir = new THREE.Vector3(-side, -0.15, 0.45).normalize();
      const L = 17;
      const from = target.clone().addScaledVector(dir, -L);
      const to = target.clone().addScaledVector(dir, L);
      const shark = makeShark();
      shark.position.copy(from);
      tank.add(shark);
      eaters.push({ shark, fish, from, to, t: 0, removed: false });
      stowHook();
    },
    getStats(): { caught: number; remaining: number } {
      return { caught, remaining: fishes.filter((f) => f.alive).length };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
      for (const e of eaters) tank.remove(e.shark);
      for (const p of puffs) tank.remove(p.mesh);
      scene.remove(tank, ambient, sun, fill);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
