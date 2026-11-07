// Cakey's Frosting Fighter — a Star Fox-inspired 3D rail shooter over a candy city.
//
// You fly a cupcake-rocket above a candy city. The world rushes toward you:
// frosting-tower buildings scroll past and you must bank around or climb over
// them (a crash is a bonk), while gummy-bear fighters fly in. Hold the blaster
// (FIRE button / Space) to shoot forward bolts down your lane — line enemies up
// with the D-pad, don't tap them. When the clip empties, a math gate poses a
// reload problem. Score-attack: most gummies blasted before the 3-minute clock.
//
// Why no cannon-es: motion is scripted and collisions are box/lane tests — no
// rigid-body solver needed. Keeps the bundle light and the iPad framerate high.
//
// Bundle hygiene: the `three` namespace arrives as an argument (see ./types).

import { getSessionDurationMs } from '@/lib/games/session-duration';
import {
  AMMO_CLIP,
  BLASTER_LEVELS,
  BLASTER_MAX_LEVEL,
  RELOAD_PARTIAL,
  resolveTuning,
  type Difficulty,
  type FlightEngine,
  type FlightEngineCallbacks,
  type PowerupKind,
  type ThreeNS,
} from './types';
import {
  buildBuilding,
  buildGround,
  buildGummy,
  buildLaserBolt,
  buildPowerup,
  buildReticle,
  buildShip,
  BUILDING_PALETTES,
  GUMMY_COLORS,
} from './entities';

type ThreeMesh = import('three').Mesh;
type ThreeGroup = import('three').Group;
type ThreeVec3 = import('three').Vector3;
type Material = import('three').Material;

// ---- Flight-space geometry (world units) ----
const GROUND_Y = -6; // the candy ground plane
const SHIP_Z = 6; // ship rides near the camera; the world scrolls toward it
const SHIP_MIN_X = -9;
const SHIP_MAX_X = 9;
const SHIP_MIN_Y = GROUND_Y + 1.6; // can't fly into the ground
const SHIP_MAX_Y = 7;
const SHIP_SPEED = 13; // steer speed (units/sec) at full deflection
const SPAWN_Z = -80; // buildings + enemies appear here…
const PASS_Z = 13; // …and recycle once past the ship
const BUILD_MIN_H = 3;
const BUILD_MAX_H = 11; // top at GROUND_Y+11 = 5 ≤ SHIP_MAX_Y → always climbable
const FIRE_COOLDOWN_MS = 300; // blaster cadence while held
const BOLT_SPEED = 95; // forward laser travel (units/sec)
const BONK_INVULN = 0.6; // seconds of grace after a building bonk
const POWERUP_EVERY_MS = 9000; // a power-up drifts in this often
const POWERUP_COLLECT_R = 1.4; // fly within this (x/y) to grab it
const SPEED_BOOST_MS = 4500; // how long a speed-dash power-up lasts
const SPEED_MULT = 1.7; // world-scroll multiplier while dashing
const BOMB_CLEAR_Z = -48; // a frosting bomb wipes towers + gummies from here toward the ship
const CHASER_AFTER_FRAC = 0.4; // "chaser" enemies only start after 40% of the round
const CHASER_SPEED_MULT = 1.35; // chasers close in faster than drifters
const CANYON_AFTER_MS = 60000; // after a minute the canyon closes in — fly low!
const CANYON_CEIL_Y = 2.2; // ceiling the ship is clamped under once the canyon is fully in
const CANYON_TALL_H = 7; // canyon towers spawn at least this tall (can't be climbed over)

interface Gummy {
  id: number;
  mesh: ThreeMesh;
  baseX: number;
  baseY: number;
  phase: number;
  alive: boolean;
  dying: boolean;
  dieT: number;
  /** Chasers home in on the ship and bonk it if they arrive un-shot. */
  chaser: boolean;
}

interface Building {
  group: ThreeGroup;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
}

interface Bolt {
  mesh: ThreeMesh;
  targetId: number | null; // hitscan target chosen at fire time (null = a miss)
}

interface Powerup {
  group: ThreeGroup;
  kind: PowerupKind;
}

interface Puff {
  mesh: ThreeMesh;
  vel: ThreeVec3;
  life: number;
}

interface Stripe {
  mesh: ThreeMesh;
  z: number;
}

export function createFlightEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: { tier: number; difficulty?: Difficulty },
  cb: FlightEngineCallbacks,
): FlightEngine {
  const tuning = resolveTuning(props.difficulty ?? 'medium', props.tier);
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
  scene.background = new THREE.Color(0xffd0e6); // candy dusk sky
  scene.fog = new THREE.Fog(0xffd0e6, 34, 80); // city fades in from pink haze

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(58, w0 / h0, 0.1, 220);
  camera.position.set(0, 1.6, SHIP_Z + 8.5);
  const camLook = new THREE.Vector3(0, 1, -22);
  camera.lookAt(camLook);

  // ---------- Lights ----------
  const ambient = new THREE.AmbientLight(0xfff0f6, 0.95);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.05);
  sun.position.set(-6, 14, 6);
  scene.add(sun);
  const engineLight = new THREE.PointLight(0xffb020, 0.6, 20);
  scene.add(engineLight);

  // Track every geometry/material so dispose() is exhaustive.
  const geos: import('three').BufferGeometry[] = [];
  const mats: import('three').Material[] = [];
  const track = <T extends import('three').BufferGeometry | import('three').Material>(x: T): T => {
    if ((x as { isBufferGeometry?: boolean }).isBufferGeometry) geos.push(x as import('three').BufferGeometry);
    else mats.push(x as import('three').Material);
    return x;
  };

  // Free a recycled entity's GPU resources immediately (the city spawns
  // continuously for 3 minutes, so we can't wait for dispose() at round end).
  // Geometries/materials are per-entity here (not shared), so this is safe;
  // the final dispose() loop re-disposing is a harmless no-op.
  const disposeObject = (obj: import('three').Object3D): void => {
    obj.traverse((o) => {
      const m = o as ThreeMesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  };

  // ---------- Ground + scrolling lane stripes (sell forward speed) ----------
  const ground = buildGround(THREE, track, { w: 80, d: 200 });
  ground.position.set(0, GROUND_Y, -40);
  scene.add(ground);

  const STRIPE_COUNT = 14;
  const STRIPE_GAP = (PASS_Z - SPAWN_Z) / STRIPE_COUNT;
  const stripeGeo = track(new THREE.BoxGeometry(60, 0.08, 0.7));
  const stripeMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.5 }));
  const stripes: Stripe[] = [];
  for (let i = 0; i < STRIPE_COUNT; i++) {
    const m = new THREE.Mesh(stripeGeo, stripeMat);
    const z = SPAWN_Z + i * STRIPE_GAP;
    m.position.set(0, GROUND_Y + 0.05, z);
    scene.add(m);
    stripes.push({ mesh: m, z });
  }

  // ---------- Canyon walls + ceiling (hidden until the 1-minute mark) ----------
  // A candy-rock corridor: two tall side walls + a frosting ceiling that lowers
  // in to force the ship down low. Built once, revealed + animated in canyon mode.
  const canyonGroup = new THREE.Group();
  canyonGroup.visible = false;
  const wallGeo = track(new THREE.BoxGeometry(1.6, 28, 170));
  const wallMat = track(new THREE.MeshStandardMaterial({ color: 0xb9789a, roughness: 0.92 }));
  const wallL = new THREE.Mesh(wallGeo, wallMat);
  wallL.position.set(-(SHIP_MAX_X + 2.2), GROUND_Y + 9, -30);
  const wallR = new THREE.Mesh(wallGeo, wallMat);
  wallR.position.set(SHIP_MAX_X + 2.2, GROUND_Y + 9, -30);
  canyonGroup.add(wallL, wallR);
  const ceilGeo = track(new THREE.BoxGeometry((SHIP_MAX_X + 3) * 2, 1.3, 170));
  const ceilMat = track(new THREE.MeshStandardMaterial({ color: 0xffc2e8, roughness: 0.5 }));
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.position.set(0, 13, -30); // starts high; lowers with canyonT
  canyonGroup.add(ceiling);
  // Hanging frosting drips so the low ceiling reads at a glance.
  const dripGeo = track(new THREE.ConeGeometry(0.42, 1.5, 8));
  for (let i = 0; i < 11; i++) {
    const drip = new THREE.Mesh(dripGeo, ceilMat);
    drip.rotation.x = Math.PI; // point down
    drip.position.set(-9 + Math.random() * 18, -1.1, -85 + i * 16);
    ceiling.add(drip);
  }
  scene.add(canyonGroup);

  // ---------- Ship + aim reticle ----------
  const ship = buildShip(THREE, track);
  ship.position.set(0, 1, SHIP_Z);
  scene.add(ship);
  const thrust = ship.getObjectByName('thrust') as ThreeMesh | undefined;
  const prop = ship.getObjectByName('prop'); // propeller — spun each frame

  const reticle = buildReticle(THREE, track);
  scene.add(reticle);

  // ---------- Pools ----------
  const gummies: Gummy[] = [];
  const buildings: Building[] = [];
  const bolts: Bolt[] = [];
  const powerups: Powerup[] = [];
  const puffs: Puff[] = [];
  let nextGummyId = 1;

  const puffGeo = track(new THREE.SphereGeometry(0.12, 6, 5));
  const puffMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, roughness: 0.2 }));
  const SPRINKLE = [0xfb7185, 0xfbbf24, 0x60a5fa, 0xa855f7, 0x34d399];
  const spawnBoom = (at: ThreeVec3, tint: number): void => {
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(puffGeo, puffMat.clone());
      (m.material as import('three').MeshStandardMaterial).color.setHex(i % 3 === 0 ? tint : SPRINKLE[i % SPRINKLE.length]);
      m.position.copy(at);
      m.scale.setScalar(0.6 + Math.random());
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const b = Math.random() * Math.PI - Math.PI / 2;
      const sp = 3 + Math.random() * 4;
      puffs.push({
        mesh: m,
        vel: new THREE.Vector3(Math.cos(a) * Math.cos(b) * sp, Math.sin(b) * sp, Math.sin(a) * Math.cos(b) * sp),
        life: 1,
      });
    }
  };

  const spawnGummy = (): void => {
    // Later in the round, a growing share of spawns are aggressive "chasers"
    // that home in on the ship — a real threat you must shoot before it lands.
    const late = elapsedMs > roundMs * CHASER_AFTER_FRAC;
    const chaserChance = late ? Math.min(0.55, 0.12 + props.tier * 0.035) : 0;
    const chaser = Math.random() < chaserChance;
    const id = nextGummyId++;
    const mesh = buildGummy(THREE, track, chaser ? 0xb91c1c : GUMMY_COLORS[id % GUMMY_COLORS.length]);
    if (chaser) mesh.scale.setScalar(1.18);
    const x = SHIP_MIN_X + 1 + Math.random() * (SHIP_MAX_X - SHIP_MIN_X - 2);
    // Spawn within the current flyable band so canyon targets stay reachable.
    const y = SHIP_MIN_Y + 1 + Math.random() * Math.max(1, curMaxY - SHIP_MIN_Y - 2);
    mesh.position.set(x, y, SPAWN_Z + Math.random() * 10);
    scene.add(mesh);
    gummies.push({ id, mesh, baseX: x, baseY: y, phase: Math.random() * Math.PI * 2, alive: true, dying: false, dieT: 0, chaser });
  };

  const spawnBuilding = (): void => {
    const w = 2.6 + Math.random() * 2.2;
    const d = 2.6 + Math.random() * 1.8;
    // In the canyon, towers spawn tall (can't be climbed over) so you must weave.
    const h = canyon
      ? CANYON_TALL_H + Math.random() * (BUILD_MAX_H - CANYON_TALL_H)
      : BUILD_MIN_H + Math.random() * (BUILD_MAX_H - BUILD_MIN_H);
    const pal = BUILDING_PALETTES[Math.floor(Math.random() * BUILDING_PALETTES.length)];
    const group = buildBuilding(THREE, track, { w, d, h, body: pal.body, roof: pal.roof });
    const x = SHIP_MIN_X + Math.random() * (SHIP_MAX_X - SHIP_MIN_X);
    group.position.set(x, GROUND_Y, SPAWN_Z);
    scene.add(group);
    buildings.push({ group, x, z: SPAWN_Z, w, d, h });
  };

  const spawnPowerup = (kind: PowerupKind): void => {
    const group = buildPowerup(THREE, track, kind);
    const x = SHIP_MIN_X + 1.5 + Math.random() * (SHIP_MAX_X - SHIP_MIN_X - 3);
    const y = SHIP_MIN_Y + 1.5 + Math.random() * Math.max(1, curMaxY - SHIP_MIN_Y - 3);
    group.position.set(x, y, SPAWN_Z);
    scene.add(group);
    powerups.push({ group, kind });
  };

  // Weighted pick: keep blaster upgrades flowing until maxed, then it's all
  // speed dashes + frosting bombs.
  const pickPowerupKind = (): PowerupKind => {
    if (blasterLevel < BLASTER_MAX_LEVEL && Math.random() < 0.4) return 'blaster';
    return Math.random() < 0.5 ? 'speed' : 'bomb';
  };

  // Frosting bomb: wipe the near-field towers + every live gummy ahead in one
  // sugary blast. Destroyed gummies count toward the score.
  const detonateBomb = (): void => {
    cb.onSfx?.('boom');
    shakeT = Math.max(shakeT, 0.45);
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.z < BOMB_CLEAR_Z) continue;
      spawnBoom(new THREE.Vector3(b.x, GROUND_Y + Math.min(b.h, 6), b.z), 0xfb7185);
      scene.remove(b.group);
      disposeObject(b.group);
      buildings.splice(i, 1);
    }
    for (const g of gummies) {
      if (!g.alive || g.dying) continue;
      if (g.mesh.position.z < BOMB_CLEAR_Z) continue;
      g.dying = true;
      g.dieT = 0;
      blasted += 1;
      spawnBoom(g.mesh.position.clone(), 0xffe08a);
    }
    cb.onScore(blasted);
  };

  // ---------- Blaster ----------
  const muzzle = new THREE.Vector3();
  const fire = (): void => {
    if (ammo <= 0) {
      cb.onSfx?.('empty');
      return;
    }
    ammo -= 1;
    cb.onAmmo(ammo);
    cb.onSfx?.('laser');

    // Hitscan: pick the nearest live gummy ahead of the ship within the lane.
    // A bigger blaster (BLASTER_LEVELS) widens the lane and grows the bolt.
    const lvl = BLASTER_LEVELS[blasterLevel];
    let targetId: number | null = null;
    let bestZ = -Infinity;
    for (const g of gummies) {
      if (!g.alive || g.dying) continue;
      if (g.mesh.position.z >= ship.position.z) continue; // must be ahead
      if (Math.abs(g.mesh.position.x - ship.position.x) > lvl.lane) continue;
      if (Math.abs(g.mesh.position.y - ship.position.y) > lvl.lane) continue;
      if (g.mesh.position.z > bestZ) {
        bestZ = g.mesh.position.z;
        targetId = g.id;
      }
    }

    muzzle.copy(ship.position).add(new THREE.Vector3(0, 0.05, -1));
    const bolt = buildLaserBolt(THREE, track);
    const bm = bolt.material as import('three').MeshStandardMaterial;
    bm.color.setHex(lvl.color);
    bm.emissive.setHex(lvl.emissive);
    bolt.scale.setScalar(lvl.scale);
    bolt.position.copy(muzzle);
    bolt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1));
    scene.add(bolt);
    bolts.push({ mesh: bolt, targetId });

    // Out of ammo after 5 shots → math gate to reload.
    if (ammo <= 0 && !reloadPending) {
      reloadPending = true;
      cb.onNeedReload();
    }
  };

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
  let lastEmit = -1;
  let gummyAccum = 0;
  let buildAccum = 0;
  let powerAccum = 0;
  let ammo = AMMO_CLIP;
  let blasted = 0;
  let blasterLevel = 0; // bumped by power-ups; bigger/colored bolt + wider lane
  let reloads = 0;
  let reloadPending = false; // a math gate is open/queued — don't re-trigger it
  let firing = false;
  let lastFireAt = -1e9;
  let shakeT = 0;
  let invulnT = 0;
  let speedBoostT = 0; // seconds of speed-dash remaining (from a speed power-up)
  let canyon = false; // true once the canyon zone has opened (~1 min in)
  let canyonT = 0; // 0→1 as the ceiling closes in
  let curMaxY = SHIP_MAX_Y; // ship's current ceiling — lowers to CANYON_CEIL_Y in the canyon
  let moveX = 0;
  let moveY = 0;
  let lastTime = performance.now();
  let nowMs = lastTime;
  let raf = 0;

  cb.onAmmo(ammo);
  cb.onBlaster(blasterLevel);

  // ---------- Main loop ----------
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    nowMs = now;
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    const boosting = speedBoostT > 0;
    const world = tuning.worldSpeed * (boosting ? SPEED_MULT : 1);
    if (thrust) thrust.scale.z = (boosting ? 1.9 : 1.1) + Math.sin(now / 60) * 0.35;
    if (prop) prop.rotation.z += dt * 22; // propeller spin

    // Ground stripes scroll toward the camera even while paused (slower), so
    // the city never looks frozen.
    const sDt = dt * (paused ? 0.3 : 1);
    for (const s of stripes) {
      s.z += world * sDt;
      if (s.z > PASS_Z) s.z -= STRIPE_COUNT * STRIPE_GAP;
      s.mesh.position.z = s.z;
    }

    if (!paused && !ended) {
      // Canyon zone: after a minute the ceiling closes in and the ship is
      // clamped low, so you can't climb over the towers — you must weave.
      if (elapsedMs > CANYON_AFTER_MS) {
        if (!canyon) {
          canyon = true;
          canyonGroup.visible = true;
          cb.onCanyon?.();
        }
        canyonT = Math.min(1, canyonT + dt / 1.6);
      }
      curMaxY = SHIP_MAX_Y - canyonT * (SHIP_MAX_Y - CANYON_CEIL_Y);
      ceiling.position.y = 13 - canyonT * (13 - (CANYON_CEIL_Y + 1.2));

      // Ship steering (Y clamped under the current ceiling).
      ship.position.x = Math.max(SHIP_MIN_X, Math.min(SHIP_MAX_X, ship.position.x + moveX * SHIP_SPEED * dt));
      ship.position.y = Math.max(SHIP_MIN_Y, Math.min(curMaxY, ship.position.y + moveY * SHIP_SPEED * dt));
      ship.rotation.z += (-moveX * 0.5 - ship.rotation.z) * Math.min(1, dt * 8);
      ship.rotation.x += (moveY * 0.25 - ship.rotation.x) * Math.min(1, dt * 8);
      engineLight.position.set(ship.position.x, ship.position.y, ship.position.z + 2);
      reticle.position.set(ship.position.x, ship.position.y, ship.position.z - 16);

      // Blaster cadence while held.
      if (firing && ammo > 0 && now - lastFireAt >= FIRE_COOLDOWN_MS) {
        lastFireAt = now;
        fire();
      }

      // Spawns.
      gummyAccum += dt * 1000;
      while (gummyAccum >= tuning.spawnEveryMs) {
        gummyAccum -= tuning.spawnEveryMs;
        spawnGummy();
      }
      buildAccum += dt * 1000;
      while (buildAccum >= tuning.buildingEveryMs) {
        buildAccum -= tuning.buildingEveryMs;
        spawnBuilding();
      }
      powerAccum += dt * 1000;
      while (powerAccum >= POWERUP_EVERY_MS) {
        powerAccum -= POWERUP_EVERY_MS;
        spawnPowerup(pickPowerupKind());
      }

      // Timer.
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
      if (invulnT > 0) invulnT = Math.max(0, invulnT - dt);
      // Speed dash: while it lasts, the world rushes faster and you can't crash
      // (a fun power-through, not a hazard).
      if (speedBoostT > 0) {
        speedBoostT = Math.max(0, speedBoostT - dt);
        invulnT = Math.max(invulnT, 0.12);
      }
    }

    // Buildings scroll toward the ship + collision (run only while playing).
    if (!paused && !ended) {
      for (let i = buildings.length - 1; i >= 0; i--) {
        const b = buildings[i];
        b.z += world * dt;
        b.group.position.z = b.z;

        // Bonk: ship overlaps the tower box and is below its roof.
        if (
          invulnT <= 0 &&
          Math.abs(b.z - ship.position.z) < b.d / 2 + 0.8 &&
          Math.abs(b.x - ship.position.x) < b.w / 2 + 0.7 &&
          ship.position.y < GROUND_Y + b.h + 0.4
        ) {
          shakeT = 0.34;
          invulnT = BONK_INVULN;
          cb.onSfx?.('hit');
          spawnBoom(ship.position.clone(), 0xfb7185);
          // Pop up over the roof so we don't grind through the wall (but never
          // above the canyon ceiling).
          ship.position.y = Math.min(curMaxY, GROUND_Y + b.h + 1.1);
          // Crashing a building also poses a math gate (the recovery cost).
          if (!reloadPending) {
            reloadPending = true;
            cb.onNeedReload();
          }
        }

        if (b.z > PASS_Z + 4) {
          scene.remove(b.group);
          disposeObject(b.group);
          buildings.splice(i, 1);
        }
      }

      // Gummies fly toward the ship. Drifters weave along a fixed lane; chasers
      // home in on the ship and, if they arrive un-shot, bonk you (reload gate).
      for (let i = gummies.length - 1; i >= 0; i--) {
        const g = gummies[i];
        if (g.dying) continue;
        g.phase += dt * 2.5;
        if (g.chaser) {
          g.mesh.position.z += world * CHASER_SPEED_MULT * dt;
          g.baseX += (ship.position.x - g.baseX) * Math.min(1, dt * 1.6);
          g.baseY += (ship.position.y - g.baseY) * Math.min(1, dt * 1.6);
          g.mesh.position.x = g.baseX + Math.sin(g.phase) * 0.4;
          g.mesh.position.y = g.baseY + Math.cos(g.phase) * 0.3;
          g.mesh.rotation.y += dt * 4;
        } else {
          g.mesh.position.z += world * dt;
          g.mesh.position.x = g.baseX + Math.sin(g.phase) * 1.1;
          g.mesh.position.y = g.baseY + Math.cos(g.phase * 0.8) * 0.5;
          g.mesh.rotation.y += dt * 2;
        }
        if (g.mesh.position.z > PASS_Z) {
          if (g.chaser && invulnT <= 0) {
            // A chaser caught the ship → bonk + reload gate (the cost of not
            // shooting it in time).
            shakeT = 0.34;
            invulnT = BONK_INVULN;
            cb.onSfx?.('hit');
            spawnBoom(ship.position.clone(), 0xb91c1c);
            if (!reloadPending) {
              reloadPending = true;
              cb.onNeedReload();
            }
          } else {
            cb.onSfx?.('swoop');
          }
          scene.remove(g.mesh);
          disposeObject(g.mesh);
          g.alive = false;
          gummies.splice(i, 1);
        }
      }

      // Power-ups drift in; fly through one to trigger its effect.
      for (let i = powerups.length - 1; i >= 0; i--) {
        const p = powerups[i];
        const pos = p.group.position;
        pos.z += world * dt;
        p.group.rotation.y += dt * 2;
        p.group.children[0].rotation.x += dt * 3; // core tumble
        const grabbed =
          Math.abs(pos.z - ship.position.z) < 1.6 &&
          Math.hypot(pos.x - ship.position.x, pos.y - ship.position.y) < POWERUP_COLLECT_R;
        if (grabbed) {
          cb.onPickup?.(p.kind);
          if (p.kind === 'blaster') {
            if (blasterLevel < BLASTER_MAX_LEVEL) {
              blasterLevel += 1;
              cb.onBlaster(blasterLevel);
            }
            cb.onSfx?.('power');
            spawnBoom(pos.clone(), 0xffe08a);
          } else if (p.kind === 'speed') {
            speedBoostT = SPEED_BOOST_MS / 1000;
            cb.onSfx?.('power');
            spawnBoom(pos.clone(), 0x22d3ee);
          } else {
            detonateBomb(); // plays its own boom + shake
          }
          scene.remove(p.group);
          disposeObject(p.group);
          powerups.splice(i, 1);
          continue;
        }
        if (pos.z > PASS_Z) {
          scene.remove(p.group);
          disposeObject(p.group);
          powerups.splice(i, 1);
        }
      }
    }

    // Bolts streak forward; kill their hitscan target on arrival.
    for (let i = bolts.length - 1; i >= 0; i--) {
      const bolt = bolts[i];
      bolt.mesh.position.z -= BOLT_SPEED * dt;
      const target = bolt.targetId !== null ? gummies.find((g) => g.id === bolt.targetId) : undefined;
      const reached = target && bolt.mesh.position.z <= target.mesh.position.z;
      if (target && reached && target.alive && !target.dying) {
        target.dying = true;
        target.dieT = 0;
        blasted += 1;
        cb.onScore(blasted);
        cb.onSfx?.('boom');
        spawnBoom(target.mesh.position.clone(), 0xfb7185);
      }
      if ((reached && target) || bolt.mesh.position.z < SPAWN_Z - 6) {
        scene.remove(bolt.mesh);
        disposeObject(bolt.mesh);
        bolts.splice(i, 1);
      }
    }

    // Dying gummies pop then vanish.
    for (let i = gummies.length - 1; i >= 0; i--) {
      const g = gummies[i];
      if (!g.dying) continue;
      g.dieT += dt / 0.22;
      const t = Math.min(1, g.dieT);
      g.mesh.scale.setScalar(Math.max(0.001, 1 - t));
      g.mesh.rotation.z += dt * 12;
      if (t >= 1) {
        scene.remove(g.mesh);
        disposeObject(g.mesh);
        g.alive = false;
        gummies.splice(i, 1);
      }
    }

    // Boom sparkles.
    for (let i = puffs.length - 1; i >= 0; i--) {
      const pf = puffs[i];
      pf.life -= dt * 1.8;
      pf.mesh.position.addScaledVector(pf.vel, dt);
      pf.vel.multiplyScalar(0.94);
      const sm = pf.mesh.material as import('three').MeshStandardMaterial;
      sm.opacity = Math.max(0, pf.life);
      if (pf.life <= 0) {
        scene.remove(pf.mesh);
        sm.dispose();
        puffs.splice(i, 1);
      }
    }

    // Camera follows the ship a touch, plus shake after a bonk.
    let sx = 0;
    let sy = 0;
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      const k = shakeT * 1.4;
      sx = (Math.random() * 2 - 1) * k;
      sy = (Math.random() * 2 - 1) * k;
    }
    camera.position.set(ship.position.x * 0.35 + sx, 1.6 + ship.position.y * 0.3 + sy, SHIP_Z + 8.5);
    camLook.set(ship.position.x * 0.5, Math.max(GROUND_Y + 1, 0.6 + ship.position.y * 0.45), -22);
    camera.lookAt(camLook);

    renderer.render(scene, camera);
  };
  raf = window.requestAnimationFrame(tick);

  return {
    setPaused(p: boolean): void {
      paused = p;
      if (p) firing = false;
      if (!p) lastTime = performance.now();
    },
    setMove(dir: { x: number; y: number } | null): void {
      moveX = dir ? Math.max(-1, Math.min(1, dir.x)) : 0;
      moveY = dir ? Math.max(-1, Math.min(1, dir.y)) : 0;
    },
    setFiring(on: boolean): void {
      firing = on;
      // Fire the first shot immediately on press for a responsive trigger.
      if (on && !paused && !ended && ammo > 0 && nowMs - lastFireAt >= FIRE_COOLDOWN_MS) {
        lastFireAt = nowMs;
        fire();
      }
    },
    reload(full: boolean): void {
      ammo = full ? AMMO_CLIP : RELOAD_PARTIAL;
      reloadPending = false;
      reloads += 1;
      cb.onAmmo(ammo);
    },
    resize(): void {
      onResize();
    },
    getStats(): { blasted: number; reloads: number } {
      return { blasted, reloads };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      for (const g of gummies) scene.remove(g.mesh);
      for (const b of buildings) scene.remove(b.group);
      for (const bolt of bolts) scene.remove(bolt.mesh);
      for (const p of powerups) scene.remove(p.group);
      for (const pf of puffs) scene.remove(pf.mesh);
      for (const s of stripes) scene.remove(s.mesh);
      scene.remove(canyonGroup, ground, ship, reticle, ambient, sun, engineLight);
      for (const geo of geos) geo.dispose();
      for (const m of mats) m.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
