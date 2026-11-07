// Castle Crumble engine — three.js render + cannon-es physics.
//
// A CANDY-CANNON demolition puzzle. It shares Sandcastle Siege's pure physics
// primitives (the launch impulse + topple blast) but plays nothing like it:
//   • A tap-timed CANNON, not a drag slingshot. Load a ball (by answering a math
//     problem), then a two-tap aim: the barrel auto-sweeps its ELEVATION (tap to
//     lock the angle), then a POWER meter oscillates (tap to fire). A live
//     trajectory arc previews the shot. No pointer-drag anywhere.
//   • An ORBIT-to-scout camera: the whole cannon rig (camera + carriage + barrel)
//     rotates around the castle so the kid can pick a face and see the back.
//     Driven by the host's ↺/↻ buttons (orbit()).
//   • An escalating arsenal (gobstopper → cherry-bomb AoE) for chain reactions —
//     each shot still earned by answering a math problem.
//   • Destruction JUICE: muzzle flash + recoil shake on fire, cake-crumb debris,
//     and a slow-mo beat on the winning crumble (all reduced-motion aware).
//   • 3-star efficiency scoring: getStats() exposes `par` (target shots).
//   • No 3-minute clock — N cannonballs (ammo). WON the instant enough of the
//     castle is crumbled; LOST once the ammo runs out with it still standing.
//
// The topple blast is a Castle-LOCAL variant (applyLocalBlast, below): scoped to
// the struck structure's neighbourhood with a bounded falloff so a hit stays
// local. The shared applyToppleBlast (../engine) is intentionally NOT reused —
// its whole-castle 1/dist kernel is what dominoed the fortress from one shot.
//
// No runtime `three`/`cannon-es` import — the loaded namespaces are passed in,
// so this module stays out of the server bundle and only loads in the browser.

import type * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import type { ThreeNS, CannonNS, LandscapeTheme } from '../types';
import { MIN_POWER } from '../types';
import { createCastle, type Castle, type CastleStructure } from './castle';
import { WIN_FLATTEN_FRACTION, WEAPONS, type CastleTuning, type Weapon, type WeaponId } from './types';
import { mountCalibrationPanel, type CalibHandle } from './calibration';
import { launchBalloon, type SplashSystem } from '../balloon';
import { createProjectile, spawnDebris, spawnDustPuff, type Projectile } from './projectile';
import { SPRINKLE_COLORS } from '@/lib/games/theme/palette';

/** Which phase of the two-tap aim the cannon is in. `idle` = not aiming. */
export type AimStage = 'power' | null;

export interface CastleEngineCallbacks {
  /** Cannonballs remaining after the latest shot (and once at round start). */
  onAmmoLeft(left: number): void;
  /** Fired whenever another structure crumbles: (flattened, total). */
  onStructureFlattened(flattened: number, total: number): void;
  /** Fired once a launched cannonball has landed (after the watch-it-fall
   *  linger). The host poses the next math challenge if ammo remains. */
  onBalloonResolved(): void;
  /** Round over. `won` = the castle was crumbled; otherwise ammo ran out. */
  onRoundEnd(won: boolean): void;
  /** Aim feedback for the HUD. `stage` changes drive the button label/hint;
   *  `powerFrac` (0..1) streams every frame during the POWER stage so the host
   *  can paint the meter (write it imperatively — don't setState per frame). */
  onAim?(stage: AimStage, powerFrac: number): void;
  onSfx?(name: 'bubble' | 'win' | 'boom' | 'crumble'): void;
}

export interface CastleEngine {
  /** Load the given ammo into the cannon (called after a correct math answer).
   *  Enters the ELEVATION aim stage. */
  armProjectile(weaponId: WeaponId): void;
  isArmed(): boolean;
  /** Advance the two-tap aim: lock the angle, then fire. Also bound to a canvas
   *  tap so the kid can fire by tapping the scene. */
  advanceAim(): void;
  /** Rotate the cannon rig around the castle to scout. dir < 0 = left, > 0 = right. */
  orbit(dir: number): void;
  /** Set the barrel aim from a thumb joystick, dx/dy in [-1,1]. dx = left/right
   *  (azimuth), dy = up/down (elevation, +1 = highest lob). Continuous. */
  setAim(dx: number, dy: number): void;
  setPaused(paused: boolean): void;
  resize(): void;
  getStats(): { flattened: number; total: number; shots: number; ammoLeft: number; won: boolean; par: number };
  dispose(): void;
}

// Trajectory preview: number of sampled points along the predicted arc.
const AIM_SAMPLES = 30;
const AIM_DT = 0.045;
// After a shot, wait so the kid can watch the cakes fall before the next math.
const RESOLVE_DELAY_HIT = 2200;
const RESOLVE_DELAY_MISS = 1100;

const CASTLE_CENTER = { x: 0, z: -6 };
// The cannon rig (carriage + barrel + camera) is described in LOCAL coordinates
// relative to CASTLE_CENTER, then rotated by camYaw around the castle so the kid
// can orbit to scout. z ≈ 10.4 puts the muzzle ~4.4 units in front of the castle.
// Cannon rig is the SAME (normal) size — just moved OUT (z 10.4 → 42) so the
// small cannon stands in front of the giant 10× fortress instead of inside it.
// A proper, chunky artillery piece (~4.5× the old rig) set well back from the
// giant keep, so you're genuinely lobbing shells across a distance.
// The cannon now rides a candy SHIP floating in a water pool, its deck raised
// above the land so you fire down-and-across at the keep. DECK_Y is that deck
// height; the cannon + ship + water are all placed relative to it.
const DECK_Y = 6;
const WATER_Y = DECK_Y - 2.4; // pool surface the hull sits in
// How far back (+z, away from the castle) the whole launcher — pool, boat and
// cannon — sits from its original spot, so you lob across a real distance. Moves
// the firing origin too (BARREL_PIVOT/CARRIAGE), so power is retuned to match.
const LAUNCH_BACK = 45.5;
const BARREL_PIVOT = { x: 0, y: DECK_Y + 5.2, z: 60 + LAUNCH_BACK }; // where the barrel hinges
const BARREL_LEN = 8.1; // muzzle sits this far along the barrel from the pivot
const CARRIAGE = { x: 0, y: DECK_Y + 1.6, z: 62 + LAUNCH_BACK }; // the wheeled base behind the barrel
// Camera sits directly BEHIND the cannon (x:0, on its aim axis) and pulled back
// + up so the kid sights straight down the barrel at the giant fortress beyond,
// with the cannon as a real foreground object. Was a high side-angle (x:127,
// y:96) that shoved the foreground cannon sideways AND so top-down it clipped
// off the bottom edge; dropping to y:52 lifts the whole cannon back into frame
// while the ~50-tall keep stays readable. The impact-zoom punches in on hits.
const CAM_BASE_OFFSET = { x: 0, y: 52, z: 178 }; // calibrated (behind-the-cannon POV)
const CAM_LOOK_Y = 18; // look at the giant keep's mid-height
const DECOR_R = 130; // candy scatter radius around the giant castle

// Orbit + juice tuning.
const ORBIT_STEP = Math.PI / 6; // 30° per ↺/↻ tap
const ORBIT_LERP = 7; // camYaw → targetYaw smoothing rate
const AZIM_MAX = 0.62; // ±~35° of left/right aim (joystick full deflection)
const WIN_SLOWMO_MS = 850; // savour the final collapse
const SLOWMO_SCALE = 0.4; // physics speed during the win beat
const SHAKE_DECAY = 11; // camera-shake exponential falloff (per second) — snappy, not a rumble
const SLOWMO_EASE_MS = 200; // ramp physics back to full speed over the final beat

// Impact zoom — the camera punches in on a castle hit, holds through the
// crumble, then eases back to the wide aim view. Timings mirror the slow-mo
// ease shape (deadline → 0..1 factor); all well inside RESOLVE_DELAY_HIT.
const ZOOM_IN_MS = 170; // fast punch-in
const ZOOM_HOLD_MS = 650; // hold close while bricks tumble
const ZOOM_OUT_MS = 650; // ease back out
const ZOOM_DOLLY = 0.5; // fraction of the way the camera dollies toward the impact
const ZOOM_LOOK = 0.6; // fraction the look-target swings onto the impact

// Cannon aim tuning. Elevation is set by the joystick between a low flat shot
// and a high lob; the power meter ping-pongs 0→1→0 for the fire-timing skill.
const ELEV_MIN = 0.28; // ~16° — flat, long shot (joystick down)
const ELEV_MAX = 1.02; // ~58° — high lob (joystick up)
const POWER_SWEEP = 0.9; // Hz of the power ping-pong — one full 0→1→0 ≈ 1.1s
const PREVIEW_POWER_FRAC = 0.6; // arc shown at this power while picking the angle

export function createCastleEngine(
  THREE: ThreeNS,
  CANNON: CannonNS,
  container: HTMLElement,
  tuning: CastleTuning,
  theme: LandscapeTheme,
  cb: CastleEngineCallbacks,
): CastleEngine {
  // Purely-idle juice (camera shake, slow-mo) is nausea-risky, so honor
  // reduced-motion. Physics, debris, and muzzle smoke still play.
  const reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // ---- Live calibration (dev only; opt in with ?calibrate=1) ----
  // A mutable mirror of the tunable consts, seeded from their defaults. The live
  // code paths below read `cal.*` so the calibration panel can retune the running
  // game; with the flag off, cal simply holds the defaults and nothing changes.
  const CALIBRATE =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('calibrate') === '1';
  const cal = {
    // physics + blast
    gravity: tuning.gravity,
    blockFriction: 1.0,
    brickLinDamp: 0.25,
    brickAngDamp: 0.65,
    cannonballStrength: WEAPONS.cannonball.blastStrength,
    cannonballRadius: WEAPONS.cannonball.blastRadius,
    cherryStrength: WEAPONS.cherryBomb.blastStrength,
    cherryRadius: WEAPONS.cherryBomb.blastRadius,
    blastLoft: 0.2,
    neighbourRadius: 30,
    // Fraction of the blast a NEIGHBOUR structure feels (the struck one gets the
    // full 1.0). Keeps a hit punchy on the tower you aimed at while only nudging
    // its neighbours, so a big radius still can't launch the whole ring.
    neighbourFalloff: 0.3,
    // aim + power
    azimMax: AZIM_MAX,
    elevMin: ELEV_MIN,
    elevMax: ELEV_MAX,
    powerSweep: POWER_SWEEP,
    // Raised power FLOOR (2× the shared min) so a mistimed, low-meter shot still
    // carries across the long LAUNCH_BACK gap to the castle instead of dropping
    // short in the field — the whole power range now lands on the fortress.
    minPower: MIN_POWER * 2,
    maxPullPower: tuning.maxPullPower,
    powerMult: 1.85, // matched to the gap so a full-power shot lands mid/back without sailing over
    // camera
    camX: CAM_BASE_OFFSET.x,
    camY: CAM_BASE_OFFSET.y,
    camZ: CAM_BASE_OFFSET.z,
    camLookY: CAM_LOOK_Y,
  };
  let calibHandle: CalibHandle | null = null;

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

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.fog = new THREE.Fog(theme.fog, 180, 900); // pushed back for the 10× scene

  // ---------- Orbit rig math ----------
  const UP = new THREE.Vector3(0, 1, 0);
  const castleCenterV = new THREE.Vector3(CASTLE_CENTER.x, 0, CASTLE_CENTER.z);
  let camYaw = 0;
  let targetYaw = 0;
  /** Rotate a LOCAL rig point by the current yaw around the castle centre. */
  const worldFromLocal = (local: { x: number; y: number; z: number }, out: THREE.Vector3): THREE.Vector3 =>
    out.set(local.x, local.y, local.z).applyAxisAngle(UP, camYaw).add(castleCenterV);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(50, w0 / h0, 0.1, 1600);
  worldFromLocal({ x: cal.camX, y: cal.camY, z: cal.camZ }, camera.position);
  camera.lookAt(castleCenterV.x, cal.camLookY, castleCenterV.z);

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
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -cal.gravity, 0) });
  world.allowSleep = true;
  world.broadphase = new CANNON.SAPBroadphase(world);
  (world.solver as CANNON.GSSolver).iterations = 10;

  const sandMat = new CANNON.Material('sand');
  const blockMat = new CANNON.Material('block');
  const ballMat = new CANNON.Material('ball');
  world.addContactMaterial(new CANNON.ContactMaterial(sandMat, blockMat, { friction: 0.6, restitution: 0.05 }));
  // Grippier, deader block-on-block contact so a toppling tower WEDGES against
  // its neighbours instead of dominoing the whole castle. (Was 0.42/0.03, tuned
  // for chain reactions; per feedback a single hit shouldn't level everything.)
  const blockBlockContact = new CANNON.ContactMaterial(blockMat, blockMat, { friction: cal.blockFriction, restitution: 0.0 });
  world.addContactMaterial(blockBlockContact);
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, sandMat, { friction: 0.4, restitution: 0.1 }));
  world.addContactMaterial(new CANNON.ContactMaterial(ballMat, blockMat, { friction: 0.3, restitution: 0.1 }));

  // ---------- Ground (themed) ----------
  // A tiled "piped-frosting" swirl so the battlefield reads as an iced cake
  // surface, not a flat disc. White base (multiplies cleanly under theme.ground)
  // + a quilted grid of soft rosette rims and highlight arcs. Kept low-contrast
  // so it never competes with the castle/gameplay.
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = 256;
  groundCanvas.height = 256;
  {
    const gc = groundCanvas.getContext('2d')!;
    gc.fillStyle = '#ffffff';
    gc.fillRect(0, 0, 256, 256);
    const cells = 4;
    const step = 256 / cells;
    const r = step * 0.5;
    for (let gx = 0; gx <= cells; gx++) {
      for (let gy = 0; gy <= cells; gy++) {
        const cx = gx * step;
        const cy = gy * step + (gx % 2) * step * 0.5; // offset rows = quilted piping
        const grad = gc.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(0.72, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(120,90,110,0.10)'); // soft swirl shadow rim
        gc.fillStyle = grad;
        gc.beginPath();
        gc.arc(cx, cy, r, 0, Math.PI * 2);
        gc.fill();
        gc.strokeStyle = 'rgba(255,255,255,0.5)'; // piped highlight curl
        gc.lineWidth = 2;
        gc.beginPath();
        gc.arc(cx, cy, r * 0.55, 0.4, 2.6);
        gc.stroke();
      }
    }
  }
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.wrapS = THREE.RepeatWrapping;
  groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(60, 60); // more tiles so the swirl stays fine on the giant ground
  const groundGeo = new THREE.PlaneGeometry(2400, 2400);
  const groundMat = new THREE.MeshStandardMaterial({ color: theme.ground, map: groundTex, roughness: 1 });
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
    const gumGeo = new THREE.SphereGeometry(5.5, 12, 10);
    const popHeadGeo = new THREE.SphereGeometry(4, 12, 10);
    const stickGeo = new THREE.CylinderGeometry(0.6, 0.6, 12, 6);
    decorGeos.push(gumGeo, popHeadGeo, stickGeo);
    const stickMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    decorMats.push(stickMat);
    const candyMats = theme.candy.map((c) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
      decorMats.push(m);
      return m;
    });
    const N = 16;
    for (let i = 0; i < N; i++) {
      const ang = (i / N) * Math.PI * 2 + (i % 2) * 0.31;
      const rad = DECOR_R + (i % 3) * 30;
      const x = CASTLE_CENTER.x + Math.sin(ang) * rad;
      const z = CASTLE_CENTER.z + Math.cos(ang) * rad;
      const mat = candyMats[i % candyMats.length];
      if (i % 2 === 0) {
        const gum = new THREE.Mesh(gumGeo, mat);
        gum.position.set(x, 4.5, z);
        gum.scale.y = 0.8;
        gum.castShadow = true;
        decorGroup.add(gum);
      } else {
        const stick = new THREE.Mesh(stickGeo, stickMat);
        stick.position.set(x, 6, z);
        decorGroup.add(stick);
        const head = new THREE.Mesh(popHeadGeo, mat);
        head.position.set(x, 13, z);
        head.castShadow = true;
        decorGroup.add(head);
      }
    }
  }
  scene.add(decorGroup);

  // ---------- Cannon (rides the orbit rig) ----------
  // The rig is parented at the castle centre and yawed by camYaw, so the whole
  // cannon orbits with the camera and the kid always fires from the angle they
  // scouted. The BARREL is a child group that pivots on X to set elevation.
  const rig = new THREE.Group();
  rig.position.copy(castleCenterV);
  scene.add(rig);
  const cannonGeos: THREE.BufferGeometry[] = [];
  const cannonMats: THREE.Material[] = [];
  // Scene objects the calibration panel can nudge live (?calibrate=1). Filled as
  // the ship/water/cannon parts are built; only read when CALIBRATE is on.
  const calibObjects: Record<string, THREE.Object3D> = {};

  // ---------- Candy ship + water pool the cannon rides ----------
  // Child of the rig, so it orbits the castle with the cannon. The deck sits
  // above the land (DECK_Y) so you fire down-and-across at the keep.
  {
    const shipZ = 65; // ship centre (rig-local); prow points -Z at the castle

    // ---------- Water: blue-raspberry syrup bowl (vertex-coloured, no texture) ----------
    // Same read as the town's candy-sea: bright centre → blue-raspberry mid →
    // white frosting foam ring → deep edge, painted per-vertex so the flat ring
    // reads as syrup, not a sheet. Vertex colours (not a CanvasTexture) keep it
    // leak-safe under the geo/mat-only teardown — Material.dispose() would not
    // free a texture's .map.
    const POOL_R = 40;
    const poolGeo = new THREE.RingGeometry(2, POOL_R, 56, 6);
    {
      const p = poolGeo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(p.count * 3);
      const cHi = new THREE.Color(0xbfefff); // sunlit centre highlight
      const cMid = new THREE.Color(0x5ec6ff); // brand blue-raspberry
      const cDeep = new THREE.Color(0x2f83c9); // deep syrup at the rim
      const cFoam = new THREE.Color(0xffffff); // frosting foam ring
      const tmp = new THREE.Color();
      const inner = 2;
      for (let i = 0; i < p.count; i++) {
        const r = Math.hypot(p.getX(i), p.getY(i));
        const t = Math.min(1, Math.max(0, (r - inner) / (POOL_R - inner)));
        if (t < 0.6) tmp.copy(cHi).lerp(cMid, t / 0.6);
        else tmp.copy(cMid).lerp(cDeep, (t - 0.6) / 0.4);
        const foam = Math.max(0, 1 - Math.abs(t - 0.8) / 0.08); // thin foam band
        if (foam > 0) tmp.lerp(cFoam, foam * 0.7);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      poolGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }
    poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.MeshStandardMaterial({
      vertexColors: true, color: 0xffffff,
      transparent: true, opacity: 0.9, roughness: 0.15, metalness: 0.12,
    });
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(0, WATER_Y, shipZ + LAUNCH_BACK);
    pool.receiveShadow = true;
    rig.add(pool);

    // Flared basin wall so the pool reads as a bowl with depth (seen side-on as it orbits).
    const basinGeo = new THREE.CylinderGeometry(POOL_R + 1, POOL_R + 2, 5, 48, 1, true);
    const basinMat = new THREE.MeshStandardMaterial({ color: 0x2b6fb0, roughness: 0.3, side: THREE.DoubleSide });
    const basin = new THREE.Mesh(basinGeo, basinMat);
    basin.position.set(-0.5, WATER_Y - 2.4, shipZ + LAUNCH_BACK);
    rig.add(basin);

    // Fat cream-frosting rim around the bowl lip.
    const rimGeo = new THREE.TorusGeometry(POOL_R + 0.5, 2.4, 8, 44);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xfff0d6, roughness: 0.35, metalness: 0.04 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0.5, WATER_Y + 0.15, shipZ + LAUNCH_BACK);
    rim.receiveShadow = true;
    rig.add(rim);

    // ---------- The candy ship (bobs as one group) ----------
    const shipGroup = new THREE.Group();
    shipGroup.position.set(8.5, 0, LAUNCH_BACK); // calibrated placement (see ?calibrate=1)
    shipGroup.rotation.set(-0.04, -0.16, 0.04);
    rig.add(shipGroup);
    rig.userData.ship = shipGroup; // exposed for the idle bob in tick()

    // Hull silhouette: pointed prow (+v → world -Z, toward the castle), wide
    // amidships, rounded raised stern. Beveled extrude → glossy candy gunwale.
    const B = 9.5, Lf = 18, Lb = 15; // half-beam, bow reach, stern reach
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, Lf);
    hullShape.quadraticCurveTo(B, Lf * 0.45, B, 1);
    hullShape.quadraticCurveTo(B, -Lb * 0.55, B * 0.7, -Lb);
    hullShape.quadraticCurveTo(0, -Lb * 1.12, -B * 0.7, -Lb);
    hullShape.quadraticCurveTo(-B, -Lb * 0.55, -B, 1);
    hullShape.quadraticCurveTo(-B, Lf * 0.45, 0, Lf);
    const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
      depth: 5.2, bevelEnabled: true, bevelThickness: 0.9, bevelSize: 0.9,
      bevelSegments: 2, steps: 1, curveSegments: 10,
    });
    hullGeo.rotateX(-Math.PI / 2); // thickness → +Y, length(v) → -Z (prow to castle)
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.55 }); // chocolate
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.set(0, 0.6, shipZ); // rim top ~6.7, bottom dips well below WATER_Y
    hull.castShadow = true; hull.receiveShadow = true;
    shipGroup.add(hull);

    // Inset cream wafer deck; the chocolate hull rim shows around it as a bulwark.
    const deckGeo = new THREE.ShapeGeometry(hullShape, 10);
    deckGeo.rotateX(-Math.PI / 2);
    deckGeo.scale(0.84, 1, 0.84);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xe7c48a, roughness: 0.75 }); // wafer
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(1, DECK_Y, shipZ);
    deck.receiveShadow = true;
    shipGroup.add(deck);

    // Raised stern cabin (aftcastle) — faces the kid, well astern of the firing lane.
    const aftBodyGeo = new THREE.BoxGeometry(14, 3.6, 6);
    const aftBodyMat = new THREE.MeshStandardMaterial({ color: 0xfff3e6, roughness: 0.6 }); // cream
    const aftBody = new THREE.Mesh(aftBodyGeo, aftBodyMat);
    aftBody.position.set(0, DECK_Y + 1.8, 76);
    aftBody.castShadow = true; aftBody.receiveShadow = true;
    shipGroup.add(aftBody);

    const aftRoofGeo = new THREE.SphereGeometry(7, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    const aftRoofMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.45 }); // strawberry
    const aftRoof = new THREE.Mesh(aftRoofGeo, aftRoofMat);
    aftRoof.scale.set(1, 0.5, 0.62);
    aftRoof.position.set(0, DECK_Y + 3.6, 76);
    aftRoof.castShadow = true;
    shipGroup.add(aftRoof);

    // Mint gumdrop rivets along the gunwales (shared geo/mat).
    const gumGeo = new THREE.SphereGeometry(0.7, 10, 8);
    const gumMat = new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.35 }); // mint
    for (const sx of [-1, 1] as const) {
      for (const gz of [56, 62, 68]) {
        const gum = new THREE.Mesh(gumGeo, gumMat);
        gum.scale.y = 0.85;
        gum.position.set(sx * 8, DECK_Y + 0.55, gz);
        gum.castShadow = true;
        shipGroup.add(gum);
      }
    }

    // Candy-cane mast + strawberry sail — |x|>=5 AND astern (z>=75), clear of the shot.
    const mastGeo = new THREE.CylinderGeometry(0.55, 0.7, 16, 10);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(6, DECK_Y + 8, 75);
    mast.castShadow = true;
    shipGroup.add(mast);

    const ringGeo = new THREE.TorusGeometry(0.72, 0.2, 6, 10); // candy-cane stripes (shared)
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.4 }); // strawberry
    for (const ry of [9, 13, 17, 21]) {
      const r = new THREE.Mesh(ringGeo, ringMat);
      r.rotation.x = Math.PI / 2;
      r.position.set(6, ry, 75);
      shipGroup.add(r);
    }

    const sailGeo = new THREE.PlaneGeometry(9, 11);
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.6, side: THREE.DoubleSide });
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.position.set(5.5, 16, 75.8);
    sail.castShadow = true;
    shipGroup.add(sail);

    cannonGeos.push(poolGeo, basinGeo, rimGeo, hullGeo, deckGeo, aftBodyGeo, aftRoofGeo, gumGeo, mastGeo, ringGeo, sailGeo);
    cannonMats.push(poolMat, basinMat, rimMat, hullMat, deckMat, aftBodyMat, aftRoofMat, gumMat, mastMat, ringMat, sailMat);

    Object.assign(calibObjects, {
      shipGroup, pool, basin, rim, hull, deck, aftBody, aftRoof, mast, sail,
    });
  }

  const barrelGroup = new THREE.Group();
  barrelGroup.rotation.order = 'YXZ'; // yaw (azimuth) then pitch (elevation)
  {
    // Licorice-black wheeled carriage behind the barrel (~4.5× the old rig).
    const carriageGeo = new THREE.BoxGeometry(6.75, 3.15, 6.75);
    const carriageMat = new THREE.MeshStandardMaterial({ color: 0x3a2a4a, roughness: 0.6 });
    const carriage = new THREE.Mesh(carriageGeo, carriageMat);
    carriage.position.set(-0.5, 9.5, CARRIAGE.z);
    carriage.castShadow = true;
    rig.add(carriage);
    calibObjects.carriage = carriage;
    calibObjects.barrel = barrelGroup;

    const wheelGeo = new THREE.CylinderGeometry(1.9, 1.9, 1.0, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0xfb7185, roughness: 0.5 }); // strawberry wheels
    cannonGeos.push(wheelGeo);
    cannonMats.push(wheelMat);
    for (const sx of [-1, 1] as const) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2; // lie flat on its side, axle across X
      wheel.position.set(CARRIAGE.x + sx * 3.5, DECK_Y + 1.9, CARRIAGE.z);
      wheel.castShadow = true;
      rig.add(wheel);
    }

    // The barrel group hinges at BARREL_PIVOT; its rotation.x = elevation.
    barrelGroup.position.set(BARREL_PIVOT.x, BARREL_PIVOT.y, BARREL_PIVOT.z);
    rig.add(barrelGroup);

    // A cylinder modelled along -Z (toward the castle) so a positive elevation
    // tips the muzzle up. Default cylinder axis is +Y; rotate -90° about X to lay
    // it along -Z, and slide it so it spans pivot → muzzle.
    const barrelGeo = new THREE.CylinderGeometry(1.26, 1.53, BARREL_LEN, 18);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2b2333, roughness: 0.35, metalness: 0.15 });
    const barrel = new THREE.Mesh(barrelGeo, barrelMat);
    barrel.rotation.x = -Math.PI / 2;
    barrel.position.set(0, 0, -BARREL_LEN / 2);
    barrel.castShadow = true;
    barrelGroup.add(barrel);

    // A candy muzzle ring so the business end reads clearly.
    const ringGeo = new THREE.TorusGeometry(1.35, 0.32, 10, 20);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.4 }); // vanilla trim
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 0, -BARREL_LEN);
    barrelGroup.add(ring);

    cannonGeos.push(carriageGeo, barrelGeo, ringGeo);
    cannonMats.push(carriageMat, barrelMat, ringMat);
  }

  // Aim-arc preview (a dotted line from the muzzle to the predicted landing).
  const aimMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
  const aimGeo = new THREE.BufferGeometry();
  aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(AIM_SAMPLES * 3), 3));
  const aimLine = new THREE.Line(aimGeo, aimMat);
  aimLine.visible = false;
  // Never frustum-cull the arc. three computes a geometry's bounding sphere
  // exactly ONCE (Frustum.intersectsObject only calls computeBoundingSphere
  // when boundingSphere === null, then caches it forever), and this geometry is
  // born zero-filled and rewritten every frame by updateArcPreview. Setting
  // `needsUpdate` re-uploads the vertices but does NOT invalidate that cached
  // sphere, so swinging the joystick far enough moved the real arc out from
  // under a stale sphere and the whole guide line vanished mid-aim — kids
  // reported it as "sometimes the guide line disappears". One line segment is
  // not worth culling anyway.
  aimLine.frustumCulled = false;
  scene.add(aimLine);

  // ---------- Castle ----------
  const castle: Castle = createCastle(THREE, CANNON, scene, world, {
    center: CASTLE_CENTER,
    extraWallsPerSide: tuning.extraWallsPerSide,
    blockMaterial: blockMat,
    rng: Math.random,
  });
  const total = castle.structures.length;
  const winTarget = Math.max(1, Math.ceil(total * WIN_FLATTEN_FRACTION));
  // Star par: an efficient run crumbles the castle in noticeably fewer shots
  // than winTarget (leaning on chain reactions). 3★ ≤ par, 2★ ≤ par+2, else 1★.
  const par = Math.max(3, Math.ceil(winTarget * 0.7));
  const bodyToStructure = new Map<CANNON.Body, CastleStructure>();
  for (const st of castle.structures) for (const blk of st.blocks) bodyToStructure.set(blk.body, st);
  const allBlockBodies: CANNON.Body[] = castle.structures.flatMap((st) => st.blocks.map((blk) => blk.body));

  // Per-structure ground-plane centroid + "blast neighbourhood" (itself + the
  // structures directly touching it), precomputed once from the resting layout.
  // A hit only impulses bricks inside the struck piece's neighbourhood, so the
  // blast blows a LOCAL crater instead of waking and flinging all ~650 bricks
  // across every structure. Towers sit ~26u apart, so a ~30u radius catches the
  // pieces a shot actually touches without reaching the far side of the keep.
  const centroidXZ = new Map<CastleStructure, { x: number; z: number }>();
  for (const st of castle.structures) {
    let sx = 0, sz = 0;
    for (const blk of st.blocks) { sx += blk.body.position.x; sz += blk.body.position.z; }
    const n = Math.max(1, st.blocks.length);
    centroidXZ.set(st, { x: sx / n, z: sz / n });
  }
  const structNeighbourhood = new Map<CastleStructure, Set<CastleStructure>>();
  // (Re)build each structure's blast neighbourhood for the current radius. Called
  // once at setup, and again by the calibration panel when the radius is retuned.
  const recomputeNeighbourhood = (): void => {
    structNeighbourhood.clear();
    for (const a of castle.structures) {
      const set = new Set<CastleStructure>([a]);
      const ca = centroidXZ.get(a)!;
      for (const b of castle.structures) {
        if (b === a) continue;
        const cb = centroidXZ.get(b)!;
        if (Math.hypot(ca.x - cb.x, ca.z - cb.z) <= cal.neighbourRadius) set.add(b);
      }
      structNeighbourhood.set(a, set);
    }
  };
  recomputeNeighbourhood();

  // Castle-local blast. Like the shared applyToppleBlast, but (1) restricted to
  // the struck structure + its immediate neighbours so a hit stays local, and
  // (2) a bounded LINEAR falloff (full punch at the impact point, nothing at the
  // rim) with only a hint of loft — so the struck piece crumbles into its own
  // footprint instead of a rigid column that lofts under the low gravity and
  // sails onto the next tower. The shared applyToppleBlast is left untouched
  // because Sandcastle Siege still depends on its original 1/dist kernel.
  const applyLocalBlast = (
    struck: CastleStructure,
    center: { x: number; y: number; z: number },
    strength: number,
    radius: number,
  ): void => {
    const hood = structNeighbourhood.get(struck);
    for (const body of allBlockBodies) {
      const st = bodyToStructure.get(body);
      if (hood && st && !hood.has(st)) continue; // far structures: not even woken
      const dx = body.position.x - center.x;
      const dy = body.position.y - center.y;
      const dz = body.position.z - center.z;
      const dist = Math.max(Math.hypot(dx, dy, dz), 0.3);
      if (dist > radius) continue;
      body.wakeUp();
      // Struck structure takes the full punch; its neighbours only a fraction, so
      // even a wide radius craters the aimed-at tower without launching the ring.
      const scale = st === struck ? 1 : cal.neighbourFalloff;
      const f = strength * (1 - dist / radius) * scale;
      body.applyImpulse(new CANNON.Vec3((dx / dist) * f, (dy / dist) * f + f * cal.blastLoft, (dz / dist) * f));
    }
  };

  // ---------- Mutable state ----------
  let projectile: Projectile | null = null;
  let currentWeapon: Weapon = WEAPONS.cannonball;
  let projRadius = currentWeapon.radius;
  let armed = false;
  let inFlight = false;
  let hasHit = false;
  let pendingRemoveBalloon = false;
  let shots = 0;
  let flattened = 0;
  // Ammo scales with the castle's actual structure count (min 4 balls so a tiny
  // fort is still a real puzzle). See CastleTuning.ammoFactor.
  // Cap ammo so the huge (~17-piece) castle doesn't demand ~17 math problems a
  // round — you knock it down with chain-reaction collapses, not one-per-piece.
  let ammoLeft = Math.min(9, Math.max(4, Math.ceil(total * tuning.ammoFactor)));
  let won = false;

  // ---- Cannon aim state ----
  let aimStage: AimStage = null;
  let aimClock = 0; // seconds accumulated in the current aim stage (drives sweeps)
  let azimuth = 0; // left/right barrel aim (radians), set by the joystick
  let elevation = (cal.elevMin + cal.elevMax) / 2; // up/down barrel aim, set by the joystick
  let powerFrac = 0; // live power meter (0..1) while picking the power

  // Reused scratch vectors for the aim math (no per-frame allocation).
  const aimDirLocal = new THREE.Vector3();
  const aimDirWorld = new THREE.Vector3();
  const muzzleLocal = new THREE.Vector3();
  const muzzleWorld = new THREE.Vector3();

  // Juice state.
  const debris: SplashSystem[] = [];
  let shakeMag = 0;
  let slowUntil = 0;
  // Impact-zoom state (render-only): deadline anchor + the world point to punch in on.
  let zoomStart = 0;
  const zoomImpact = new THREE.Vector3();
  let winning = false; // win detected; savouring the crumble before endRound
  let winTimer: number | null = null;

  let paused = false;
  let ended = false;
  let lastTime = performance.now();
  let raf = 0;
  let watchdog: number | null = null;
  let resolveTimer: number | null = null;

  // ---------- Helpers ----------
  const syncMesh = (mesh: THREE.Mesh, body: CANNON.Body): void => {
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  };
  const setProjectileAt = (p: THREE.Vector3): void => {
    if (!projectile) return;
    projectile.mesh.position.copy(p);
    projectile.body.position.set(p.x, p.y, p.z);
  };

  // Compute the world-space aim direction (unit) + muzzle position for a given
  // barrel elevation, honoring the current orbit yaw. Writes the scratch vectors.
  const computeAim = (elev: number): void => {
    // Local aim points toward the castle (-Z), tilted up by `elev` and swung
    // left/right by `azimuth` (yaw-then-pitch, matching the barrel's YXZ Euler).
    const ce = Math.cos(elev);
    aimDirLocal.set(-Math.sin(azimuth) * ce, Math.sin(elev), -Math.cos(azimuth) * ce);
    aimDirWorld.copy(aimDirLocal).applyAxisAngle(UP, camYaw); // rotation preserves unit length
    muzzleLocal.set(
      BARREL_PIVOT.x + aimDirLocal.x * BARREL_LEN,
      BARREL_PIVOT.y + aimDirLocal.y * BARREL_LEN,
      BARREL_PIVOT.z + aimDirLocal.z * BARREL_LEN,
    );
    worldFromLocal(muzzleLocal, muzzleWorld);
  };

  // Redraw the trajectory arc from the muzzle for a launch dir + power.
  const updateArcPreview = (origin: THREE.Vector3, dir: THREE.Vector3, power: number): void => {
    const ap = aimGeo.getAttribute('position') as THREE.BufferAttribute;
    const v0x = dir.x * power;
    const v0y = dir.y * power;
    const v0z = dir.z * power;
    const groundY = projRadius;
    let landed = false;
    let lx = origin.x;
    let ly = origin.y;
    let lz = origin.z;
    for (let i = 0; i < AIM_SAMPLES; i++) {
      if (!landed) {
        const tt = i * AIM_DT;
        const x = origin.x + v0x * tt;
        const y = origin.y + v0y * tt - 0.5 * cal.gravity * tt * tt;
        const z = origin.z + v0z * tt;
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
  };

  // ×1.4 launch power — matched to the bigger firing gap so a good shot carries
  // to the distant keep without wildly overshooting (arc-preview scales too).
  const powerFromFrac = (frac: number): number =>
    (cal.minPower + frac * (cal.maxPullPower - cal.minPower)) * cal.powerMult;

  // Position the camera + barrel for the current yaw/elevation (+ any shake).
  // Runs every frame (even while paused) so the view stays live and smooth.
  const updateRig = (): void => {
    rig.rotation.y = camYaw;
    barrelGroup.rotation.y = azimuth; // left/right aim (joystick)
    barrelGroup.rotation.x = elevation; // up/down aim (joystick)
    // Keep an armed-but-not-yet-fired ball sitting in the muzzle as it aims.
    if (projectile && armed) {
      computeAim(elevation);
      setProjectileAt(muzzleWorld);
    }
    worldFromLocal({ x: cal.camX, y: cal.camY, z: cal.camZ }, camera.position);
    // Impact zoom: dolly the camera toward the hit point and swing the look
    // target onto it, then ease back. Factor f follows the in→hold→out timeline.
    let lookX = castleCenterV.x;
    let lookY = cal.camLookY;
    let lookZ = castleCenterV.z;
    if (zoomStart > 0) {
      const el = performance.now() - zoomStart;
      let f: number;
      if (el < ZOOM_IN_MS) f = el / ZOOM_IN_MS;
      else if (el < ZOOM_IN_MS + ZOOM_HOLD_MS) f = 1;
      else if (el < ZOOM_IN_MS + ZOOM_HOLD_MS + ZOOM_OUT_MS) f = 1 - (el - ZOOM_IN_MS - ZOOM_HOLD_MS) / ZOOM_OUT_MS;
      else {
        f = 0;
        zoomStart = 0;
      }
      if (f > 0) {
        camera.position.lerp(zoomImpact, f * ZOOM_DOLLY);
        lookX += (zoomImpact.x - lookX) * f * ZOOM_LOOK;
        lookY += (zoomImpact.y - lookY) * f * ZOOM_LOOK;
        lookZ += (zoomImpact.z - lookZ) * f * ZOOM_LOOK;
      }
    }
    if (shakeMag > 0.0005) {
      camera.position.x += (Math.random() - 0.5) * shakeMag;
      camera.position.y += (Math.random() - 0.5) * shakeMag;
      camera.position.z += (Math.random() - 0.5) * shakeMag;
    }
    camera.lookAt(lookX, lookY, lookZ);
  };

  const removeProjectile = (): void => {
    if (projectile) {
      projectile.body.removeEventListener('collide', onHit);
      projectile.dispose(scene, world);
      projectile = null;
    }
    aimLine.visible = false;
  };

  const endRound = (didWin: boolean): void => {
    if (ended) return;
    ended = true;
    won = didWin;
    // Cancel any in-flight resolve/watchdog/win timers so a late callback can't
    // reopen the round after game-over. The host owns the end-of-round sound.
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
    if (resolveTimer !== null) {
      window.clearTimeout(resolveTimer);
      resolveTimer = null;
    }
    if (winTimer !== null) {
      window.clearTimeout(winTimer);
      winTimer = null;
    }
    cb.onRoundEnd(didWin);
  };

  // Enough of the castle is rubble → savour a brief slow-mo crumble, THEN end.
  // Keeps physics stepping during the beat so the final collapse plays out.
  const startWin = (): void => {
    if (winning || ended) return;
    winning = true;
    won = true;
    cb.onSfx?.('crumble');
    if (!reduceMotion) slowUntil = performance.now() + WIN_SLOWMO_MS;
    winTimer = window.setTimeout(() => endRound(true), reduceMotion ? 250 : WIN_SLOWMO_MS);
  };

  // Continuous flatten evaluation — run every frame (cheap: ~structures×layers).
  // A structure counts the instant its tallest remaining block drops below its
  // threshold, so slow tower collapses and chain reactions are all caught, and
  // each topple kicks up a little burst of cake-crumb debris.
  const evaluateFlatten = (): void => {
    for (const st of castle.structures) {
      if (st.flattened) continue;
      let maxY = -Infinity;
      for (const blk of st.blocks) maxY = Math.max(maxY, blk.body.position.y);
      if (maxY < st.flattenThresholdY) {
        st.flattened = true;
        flattened += 1;
        cb.onStructureFlattened(flattened, total);
        const b0 = st.blocks[0].body.position;
        debris.push(spawnDebris(THREE, scene, new THREE.Vector3(b0.x, 0.5, b0.z), 8, st.materials[0].color.getHex()));
        // Powdered-sugar poof at the base so a cascade reads as a rolling wave
        // of sugar, not just tumbling cubes.
        debris.push(spawnDustPuff(THREE, scene, new THREE.Vector3(b0.x, 0.3, b0.z)));
      }
    }
    if (!ended && !winning && flattened >= winTarget) startWin();
  };

  const resolveProjectile = (): void => {
    // A win is being savoured (or already ended) → don't bounce the host back to
    // 'ready'; endRound will fire after the crumble beat.
    if (ended || winning || !inFlight) return;
    inFlight = false;
    cb.onBalloonResolved();
    if (!ended && ammoLeft <= 0) endRound(false);
  };

  // Collision: never mutate the world here (runs mid-step). Read + impulse +
  // render-only debris/shake, and flag removal for the next tick.
  const onHit = (event: { body: CANNON.Body; contact: CANNON.ContactEquation }): void => {
    if (!projectile || !inFlight || hasHit) return;
    hasHit = true;
    if (watchdog !== null) {
      window.clearTimeout(watchdog);
      watchdog = null;
    }
    const center = new THREE.Vector3(projectile.body.position.x, projectile.body.position.y, projectile.body.position.z);
    const w = currentWeapon;
    cb.onSfx?.(w.id === 'cherryBomb' ? 'boom' : 'bubble');
    // Sugar burst at the point of impact (cream flecked with sprinkle colours)
    // — a candy hit, not a water splash.
    debris.push(spawnDebris(THREE, scene, center, 6, 0xfff1d6, SPRINKLE_COLORS, 0.5));

    const struck = bodyToStructure.get(event.body);
    const hitCastle = struck !== undefined;
    if (hitCastle) {
      // Blast strength/radius are read from `cal` so the calibration panel can
      // retune them live; they default to the weapon's own values.
      const isCherry = w.id === 'cherryBomb';
      const blastStrength = isCherry ? cal.cherryStrength : cal.cannonballStrength;
      const blastRadius = isCherry ? cal.cherryRadius : cal.cannonballRadius;
      applyLocalBlast(struck, center, blastStrength, blastRadius);
      if (w.debris > 0) debris.push(spawnDebris(THREE, scene, center, w.debris, 0xfff1d6, SPRINKLE_COLORS, 0.34));
      // Kick off the impact zoom on the exact hit point (render-only — safe to
      // set mid-step, like shakeMag below). Skipped under reduced-motion.
      if (!reduceMotion) {
        zoomImpact.copy(center);
        zoomStart = performance.now();
      }
    }
    if (!reduceMotion && w.shake > 0) shakeMag = w.shake;
    pendingRemoveBalloon = true;
    // Linger so the kid can watch the cakes topple before the next question.
    resolveTimer = window.setTimeout(resolveProjectile, hitCastle ? RESOLVE_DELAY_HIT : RESOLVE_DELAY_MISS);
  };

  // ---------- Fire the cannon ----------
  const fire = (): void => {
    if (!projectile || !armed || inFlight) return;
    computeAim(elevation);
    setProjectileAt(muzzleWorld);
    armed = false;
    inFlight = true;
    hasHit = false;
    shots += 1;
    ammoLeft = Math.max(0, ammoLeft - 1);
    cb.onAmmoLeft(ammoLeft);

    aimStage = null;
    cb.onAim?.(null, 0);
    aimLine.visible = false;

    // Muzzle flash + recoil: a puff of powdered sugar at the muzzle and a kick.
    debris.push(spawnDustPuff(THREE, scene, muzzleWorld.clone()));
    if (!reduceMotion) shakeMag = Math.max(shakeMag, 0.16);
    cb.onSfx?.('boom');

    projectile.body.addEventListener('collide', onHit);
    launchBalloon(CANNON, projectile, aimDirWorld, powerFromFrac(powerFrac));
    watchdog = window.setTimeout(() => {
      pendingRemoveBalloon = true;
      resolveProjectile();
    }, 5500);
  };

  // Advance the two-tap aim (also bound to a canvas tap). First tap locks the
  // angle; second tap fires.
  const advanceAim = (): void => {
    if (ended || winning || !armed) return;
    // Joystick sets the aim continuously; a tap / FIRE just shoots at the
    // current power. (The old first-tap elevation lock is gone.)
    if (aimStage === 'power') {
      fire();
    }
  };

  // ---------- Pointer (tap to advance aim) ----------
  const onPointerDown = (): void => {
    if (paused || ended) return;
    if (aimStage !== null) advanceAim();
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

  // ---------- Main loop ----------
  const FIXED = 1 / 60;
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.05) dt = 0.05;

    // Orbit lerp + shake decay + camera placement — always, even while paused,
    // so scouting and the view stay smooth.
    camYaw += (targetYaw - camYaw) * Math.min(1, dt * ORBIT_LERP);
    shakeMag = shakeMag > 0.0005 ? shakeMag * Math.exp(-SHAKE_DECAY * dt) : 0;

    // Cannon aim animation — runs whenever a ball is loaded (even though the sim
    // is otherwise idle), so the barrel sweep + power meter stay smooth.
    if (aimStage !== null && !ended) {
      aimClock += dt;
      // Elevation + azimuth come from the joystick (setAim); only the power
      // meter sweeps as a triangle wave 0→1→0 for the fire-timing skill.
      const phase = aimClock * cal.powerSweep;
      const f = phase - Math.floor(phase);
      powerFrac = f < 0.5 ? f * 2 : 2 - f * 2;
      cb.onAim?.('power', powerFrac); // stream the meter (host paints imperatively)
    }

    updateRig();

    // Gentle idle bob on the candy ship (the ship group only — the cannon
    // carriage rides the rig directly, so aiming stays rock-steady). Water,
    // basin and rim stay put. Skipped under reduced-motion.
    const ship = rig.userData.ship as THREE.Group | undefined;
    if (ship && !reduceMotion && !CALIBRATE) {
      const bt = now * 0.001;
      ship.position.y = Math.sin(bt * 0.9) * 0.16;      // gentle heave
      ship.rotation.z = Math.sin(bt * 0.7 + 1) * 0.012; // slow candy roll
    }

    // Live arc preview while aiming: the sampled trajectory for the current
    // joystick angle + the current power.
    if (aimStage !== null && !ended && projectile) {
      computeAim(elevation);
      updateArcPreview(muzzleWorld, aimDirWorld, powerFromFrac(powerFrac));
    }

    if (!paused && !ended) {
      if (pendingRemoveBalloon) {
        pendingRemoveBalloon = false;
        removeProjectile();
      }

      // Slow-mo during the win beat, easing back to full speed over the final
      // SLOWMO_EASE_MS so time doesn't hard-snap.
      const remain = slowUntil - now;
      const timeScale =
        remain <= 0
          ? 1
          : remain < SLOWMO_EASE_MS
            ? SLOWMO_SCALE + (1 - SLOWMO_SCALE) * (1 - remain / SLOWMO_EASE_MS)
            : SLOWMO_SCALE;
      world.step(FIXED, dt * timeScale, 3);

      for (const st of castle.structures) for (const blk of st.blocks) syncMesh(blk.mesh, blk.body);
      if (projectile && inFlight) syncMesh(projectile.mesh, projectile.body);
      evaluateFlatten();

      for (let i = debris.length - 1; i >= 0; i--) {
        if (!debris[i].update(dt)) {
          debris[i].dispose(scene);
          debris.splice(i, 1);
        }
      }
    }

    renderer.render(scene, camera);
  };
  updateRig();
  raf = window.requestAnimationFrame(tick);
  // Announce the starting ammo so the HUD paints before the first shot.
  cb.onAmmoLeft(ammoLeft);

  // ---- Live calibration panel (dev only, ?calibrate=1) ----
  if (CALIBRATE) {
    // scalar bound to cal[key], with an optional live-apply side effect.
    const S = (
      label: string,
      code: string,
      key: keyof typeof cal,
      min: number,
      max: number,
      step: number,
      apply?: (v: number) => void,
    ) => ({ label, code, min, max, step, get: () => cal[key], set: (v: number) => { cal[key] = v; apply?.(v); } });
    // transform bound to a registered scene object.
    const T = (label: string, opts: { rot?: boolean; scale?: boolean } = {}) => ({ label, target: calibObjects[label], ...opts });

    calibHandle = mountCalibrationPanel({
      sections: [
        { title: 'Boat & Water', transforms: [
          T('shipGroup', { rot: true }), T('pool'), T('basin'), T('rim'),
          T('hull', { rot: true, scale: true }), T('deck'), T('aftBody'),
          T('aftRoof', { scale: true }), T('mast'), T('sail', { rot: true }),
        ] },
        { title: 'Cannon', transforms: [T('carriage'), T('barrel')] },
        { title: 'Aim & Power', scalars: [
          S('azim max', 'AZIM_MAX', 'azimMax', 0, 1.5, 0.01),
          S('elev min', 'ELEV_MIN', 'elevMin', 0, 1.5, 0.01),
          S('elev max', 'ELEV_MAX', 'elevMax', 0, 1.5, 0.01),
          S('power sweep', 'POWER_SWEEP', 'powerSweep', 0.2, 2, 0.05),
          S('min power', 'MIN_POWER', 'minPower', 0, 80, 1),
          S('max pull', 'maxPullPower', 'maxPullPower', 10, 220, 1),
          S('power ×', 'powerMult', 'powerMult', 0.5, 3, 0.05),
        ] },
        { title: 'Blast & Physics', scalars: [
          S('gravity', 'gravity', 'gravity', 2, 60, 0.5, (v) => world.gravity.set(0, -v, 0)),
          S('brick friction', 'blockFriction', 'blockFriction', 0, 1.5, 0.05, (v) => { blockBlockContact.friction = v; }),
          S('lin damp', 'linearDamping', 'brickLinDamp', 0, 1, 0.02, (v) => { for (const b of allBlockBodies) b.linearDamping = v; }),
          S('ang damp', 'angularDamping', 'brickAngDamp', 0, 1, 0.02, (v) => { for (const b of allBlockBodies) b.angularDamping = v; }),
          S('gob strength', 'WEAPONS.cannonball.blastStrength', 'cannonballStrength', 0, 80, 1),
          S('gob radius', 'WEAPONS.cannonball.blastRadius', 'cannonballRadius', 1, 40, 0.5),
          S('cherry strength', 'WEAPONS.cherryBomb.blastStrength', 'cherryStrength', 0, 120, 1),
          S('cherry radius', 'WEAPONS.cherryBomb.blastRadius', 'cherryRadius', 1, 50, 0.5),
          S('blast loft', 'blastLoft', 'blastLoft', 0, 1.5, 0.05),
          S('neighbour hit', 'neighbourFalloff', 'neighbourFalloff', 0, 1, 0.05),
          S('hood radius', 'NEIGHBOUR_RADIUS', 'neighbourRadius', 5, 120, 1, () => recomputeNeighbourhood()),
        ] },
        { title: 'Camera', scalars: [
          S('cam x', 'CAM_BASE_OFFSET.x', 'camX', -200, 200, 1),
          S('cam y', 'CAM_BASE_OFFSET.y', 'camY', 0, 300, 1),
          S('cam z', 'CAM_BASE_OFFSET.z', 'camZ', 20, 400, 1),
          S('look y', 'CAM_LOOK_Y', 'camLookY', -20, 80, 1),
        ] },
      ],
    });
  }

  return {
    armProjectile(weaponId: WeaponId): void {
      if (projectile || ended || winning || ammoLeft <= 0) return;
      currentWeapon = WEAPONS[weaponId] ?? WEAPONS.cannonball;
      projRadius = currentWeapon.radius;
      // Reset the aim to the mid angle and load the ball into the muzzle.
      // Azimuth persists (kid keeps their left/right aim); elevation resets.
      elevation = (cal.elevMin + cal.elevMax) / 2;
      computeAim(elevation);
      projectile = createProjectile(THREE, CANNON, scene, world, muzzleWorld, currentWeapon, projRadius, ballMat);
      armed = true;
      inFlight = false;
      hasHit = false;
      aimStage = 'power'; // joystick aims; the power meter sweeps immediately
      aimClock = 0;
      powerFrac = PREVIEW_POWER_FRAC;
      cb.onAim?.('power', 0);
    },
    isArmed(): boolean {
      return armed;
    },
    advanceAim(): void {
      advanceAim();
    },
    orbit(dir: number): void {
      if (ended) return;
      targetYaw += (dir < 0 ? -1 : 1) * ORBIT_STEP;
    },
    setAim(dx: number, dy: number): void {
      if (ended) return;
      // Joystick → aim. dx = left/right (azimuth), dy = up/down (elevation).
      const cx = Math.max(-1, Math.min(1, dx));
      const cy = Math.max(-1, Math.min(1, dy));
      azimuth = cx * cal.azimMax;
      elevation = cal.elevMin + ((cy + 1) / 2) * (cal.elevMax - cal.elevMin);
    },
    setPaused(p: boolean): void {
      paused = p;
      if (!p) lastTime = performance.now();
    },
    resize(): void {
      onResize();
    },
    getStats(): { flattened: number; total: number; shots: number; ammoLeft: number; won: boolean; par: number } {
      return { flattened, total, shots, ammoLeft, won, par };
    },
    dispose(): void {
      ended = true;
      calibHandle?.dispose();
      window.cancelAnimationFrame(raf);
      if (watchdog !== null) window.clearTimeout(watchdog);
      if (resolveTimer !== null) window.clearTimeout(resolveTimer);
      if (winTimer !== null) window.clearTimeout(winTimer);

      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);

      for (const d of debris) d.dispose(scene);
      debris.length = 0;
      removeProjectile();
      castle.dispose(scene, world);

      scene.remove(ground, decorGroup, rig, aimLine, ambient, sun);
      world.removeBody(groundBody);
      groundGeo.dispose();
      groundMat.dispose();
      groundTex.dispose();
      for (const g of decorGeos) g.dispose();
      for (const m of decorMats) m.dispose();
      for (const g of cannonGeos) g.dispose();
      for (const m of cannonMats) m.dispose();
      aimGeo.dispose();
      aimMat.dispose();

      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
