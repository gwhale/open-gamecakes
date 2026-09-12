// Cakey Racer 3D engine — a lap racer around the Victory Lane circuit.
//
// The kid drives a cookie jeep (the town's buildJeep, painted in their own
// frosting colour, with their Cakey Store cupcake sat in the cockpit) around a
// closed candy circuit against three candy rivals. The car accelerates itself;
// the kid only steers ACROSS the road. Twice a lap an amber ribbon arch poses a
// maths problem — get it right and the Sugar Boost fires. Four laps or the
// clock, whichever comes first.
//
// ON RAILS, ON PURPOSE. Position is (s, u): distance along an arc-length
// parameterised Catmull-Rom spline, and a lateral offset across the road. There
// is no rigid body, no wall geometry, and no collision mesh — the track cannot
// be left, only driven wide onto the slow sugar rough. That is one steering
// axis for a five-year-old with an iPad, and it removes the entire class of
// "stuck in the scenery" bug the town engine has to work to avoid.
//
// The engine owns the scene, the race loop, rivals, laps, boost and the clock;
// it fires callbacks to the React host (lap/place/speed/time, maths gates,
// round end). The host owns NO scene state; the engine owns NO React state.
//
// No runtime `three` import — the namespace arrives as a factory arg (bundle
// hygiene, same as Cakey Road / Castle / the town).

import type * as THREE from 'three';
import { buildJeep } from '@/lib/town/three/vehicles';
import { buildCupcakeModel } from '@/lib/town/three/avatar';
import { FROSTING_COLORS, type CupcakeConfig } from '@/lib/cupcake/config';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import { RACER } from '@/lib/games/theme/palette';
import type {
  ThreeNS,
  CakeyRacerSceneProps,
  CakeyRacerEngine,
  CakeyRacerCallbacks,
  CakeyRacerTuning,
  Steer,
} from './types';
import {
  TRACK_POINTS, TRACK_SCALE, TRACK_HALF_W, MAX_U,
  LAPS, GATES_AT, TOP_SPEED, ACCEL, STEER_RATE,
  BOOST_MS, BUMP_MUL, CONES, RIVALS, PLAYER_START_U, CAR_LEN_S, CAR_HALF_U,
  lapOf, lapFrac, placeOf, isOnTrack, speedCapAt, rivalSpeed, rivalOffset, overlaps,
} from './track';

// ---- camera ----
const CAM_BACK = 9.5;   // how far behind the car (in track distance) the eye sits
const CAM_H = 4.2;
/** How far up the track the camera aims. 12 read as a rally "look into the
 *  corner", but on this circuit's tighter turns it swung the view so far that
 *  the player's own car sat at ~80% of frame width, near the edge. 6 keeps the
 *  car centred while still showing what's coming. */
const CAM_LOOK_AHEAD = 6;
const FOV_BASE = 55;
const FOV_BOOST = 66;   // speed punch — the cheapest "fast" cue there is

// ---- track dressing ----
const ROAD_SEGMENTS = 420;   // ribbon resolution around the loop
const KERB_EVERY = 2.2;      // nominal world units between candy-cane kerb blocks
const DASH_EVERY = 7;        // nominal world units between racing-line dashes
/** Width of the sugar-crumb shoulder each side. Sized so the crumb reaches all
 *  the way to MAX_U — otherwise a kid holding a turn drives off the shoulder
 *  onto bare lawn while the game still calls it "the rough". */
const ROUGH_W = MAX_U * TRACK_HALF_W - TRACK_HALF_W + 0.3;

/** Wrap a curve parameter into [0,1). */
const mod1 = (t: number): number => t - Math.floor(t);
/** Shortest distance between two lap fractions, accounting for the seam. */
const fracGap = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
};
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export function createCakeyRacerEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: CakeyRacerSceneProps,
  tuning: CakeyRacerTuning,
  cb: CakeyRacerCallbacks,
): CakeyRacerEngine {
  const roundMs = getSessionDurationMs();

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  { const { w, h } = sizeOf(); renderer.setSize(w, h, false); }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  // ---------- Scene ----------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfff4e2);
  scene.fog = new THREE.Fog(0xfff4e2, 70, 190); // far enough to see the next corner
  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(FOV_BASE, w0 / h0, 0.1, 400);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3da, 0.95);
  sun.position.set(-40, 70, 30);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xfff3da, 0x9fe8b5, 0.5));

  // ---------- Dispose sinks ----------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const g = <T extends THREE.BufferGeometry>(v: T): T => { geos.push(v); return v; };
  const m = <T extends THREE.Material>(v: T): T => { mats.push(v); return v; };
  const std = (color: number, rough = 0.8): THREE.MeshStandardMaterial =>
    m(new THREE.MeshStandardMaterial({ color, roughness: rough }));

  // ---------- The circuit ----------
  const curve = new THREE.CatmullRomCurve3(
    TRACK_POINTS.map(([x, z]) => new THREE.Vector3(x * TRACK_SCALE, 0, z * TRACK_SCALE)),
    true,
    'catmullrom',
    0.5,
  );
  // Default 200 divisions leaves the arc-length table coarse enough that speed
  // visibly surges through tight corners. 1200 makes `s` genuinely uniform.
  curve.arcLengthDivisions = 1200;
  const trackLen = curve.getLength();

  const UP = new THREE.Vector3(0, 1, 0);
  const _p = new THREE.Vector3();
  const _t = new THREE.Vector3();
  const _side = new THREE.Vector3();
  // Camera scratch. Hoisted rather than allocated in placeCamera: two Vector3s
  // a frame is ~120 throwaway objects a second, and this runs on iPads.
  const _eye = new THREE.Vector3();
  const _look = new THREE.Vector3();

  /** Unit vector pointing to the driver's RIGHT at curve parameter `t`, i.e.
   *  screen-right for a chase camera looking along the tangent.
   *
   *  The order matters and is easy to get backwards: `tangent × UP`, NOT
   *  `UP × tangent`. The latter is the negation, which silently mirrors the
   *  whole track — steering ▶ moved the car left. Every consumer (the car
   *  positions AND the road ribbon) goes through here so the two can never
   *  disagree about which way is right; they were separate cross products
   *  before, which is exactly how the sign error hid. */
  const sideAt = (t: number, out: THREE.Vector3): THREE.Vector3 => {
    curve.getTangentAt(t, _t);
    return out.crossVectors(_t, UP).normalize();
  };

  /** World point at (distance along track, lateral offset). */
  const posAt = (s: number, u: number, out: THREE.Vector3): THREE.Vector3 => {
    const t = mod1(s / trackLen);
    curve.getPointAt(t, _p);
    sideAt(t, _side);
    return out.copy(_p).addScaledVector(_side, u * TRACK_HALF_W);
  };
  /** Y-rotation that points a +Z-facing model down the track at `s`. */
  const headingAt = (s: number): number => {
    curve.getTangentAt(mod1(s / trackLen), _t);
    return Math.atan2(_t.x, _t.z);
  };

  // ---------- Road ribbon ----------
  // Hand-rolled rather than TubeGeometry/ExtrudeGeometry: a road is a flat
  // ribbon, and sweeping a rectangle is exactly two triangles per segment. The
  // built-ins would each need fighting into shape for more code than this.
  const buildRibbon = (halfW: number, y: number, color: number): THREE.Mesh => {
    const verts = new Float32Array((ROAD_SEGMENTS + 1) * 6);
    for (let i = 0; i <= ROAD_SEGMENTS; i++) {
      const t = mod1(i / ROAD_SEGMENTS);
      curve.getPointAt(t, _p);
      sideAt(t, _side);
      const o = i * 6;
      // vertex pair per station: LEFT edge then RIGHT edge.
      verts[o] = _p.x - _side.x * halfW; verts[o + 1] = y; verts[o + 2] = _p.z - _side.z * halfW;
      verts[o + 3] = _p.x + _side.x * halfW; verts[o + 4] = y; verts[o + 5] = _p.z + _side.z * halfW;
    }
    const idx: number[] = [];
    for (let i = 0; i < ROAD_SEGMENTS; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      // Winding must stay counter-clockwise seen from ABOVE or the road is
      // back-face culled and you drive on bare lawn. It is tied to the handedness
      // of `sideAt` — when that was corrected from UP×tangent to tangent×UP, the
      // left/right vertices swapped meaning and this had to flip with it.
      idx.push(a, b, c, b, d, c);
    }
    const geo = g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, std(color, 0.88));
    mesh.receiveShadow = true;
    return mesh;
  };

  scene.add(buildRibbon(TRACK_HALF_W + ROUGH_W, 0.01, RACER.ROUGH_SUGAR)); // crumb shoulder
  scene.add(buildRibbon(TRACK_HALF_W, 0.03, RACER.ASPHALT));               // the road itself

  // Lawn under everything. Big enough that the fog eats the edge.
  const lawn = new THREE.Mesh(g(new THREE.PlaneGeometry(600, 600)), std(RACER.LAWN, 0.95));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = -0.02;
  scene.add(lawn);

  /** Scatter an instanced prop around the circuit at a given lateral band.
   *  Every mesh is tracked: an InstancedMesh owns instance buffers of its own,
   *  which disposing the shared geometry + material does NOT release. */
  const instanced: THREE.InstancedMesh[] = [];
  const scatter = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    count: number,
    place: (i: number, dummy: THREE.Object3D) => void,
  ): THREE.InstancedMesh => {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    instanced.push(inst);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      place(i, dummy);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    return inst;
  };

  // ---------- Candy-cane kerbs ----------
  // Alternating blocks in two InstancedMeshes rather than a striped texture: no
  // texture to author, no UV seam at the start/finish, and the stripe stays
  // crisp at any distance.
  // Spacing is derived by DIVIDING the lap, not by stepping a fixed distance —
  // stepping leaves a ragged gap at the start/finish seam where the last block
  // lands short of the line, and that seam is the one bit of kerb a kid stares
  // at on every lap.
  const kerbCount = Math.round(trackLen / KERB_EVERY);
  const kerbStep = trackLen / kerbCount;
  const geoKerb = g(new THREE.BoxGeometry(0.55, 0.14, kerbStep * 0.86));
  for (const [colorKey, parity] of [['KERB_A', 0], ['KERB_B', 1]] as const) {
    const mat = std(RACER[colorKey], 0.6);
    const perSide = Math.floor((kerbCount - parity + 1) / 2);
    scene.add(scatter(geoKerb, mat, perSide * 2, (i, d) => {
      const side = i % 2 === 0 ? -1 : 1;
      const s = (Math.floor(i / 2) * 2 + parity) * kerbStep;
      posAt(s, side * 1.13, d.position);
      d.position.y = 0.07;
      d.rotation.set(0, headingAt(s), 0);
      d.scale.setScalar(1);
    }));
  }

  // ---------- Racing line ----------
  const dashCount = Math.round(trackLen / DASH_EVERY);
  const dashStep = trackLen / dashCount;
  const geoDash = g(new THREE.BoxGeometry(0.34, 0.02, 2.6));
  scene.add(scatter(geoDash, std(RACER.RACING_LINE, 0.65), dashCount, (i, d) => {
    const s = i * dashStep;
    posAt(s, 0, d.position);
    d.position.y = 0.05;
    d.rotation.set(0, headingAt(s), 0);
    d.scale.setScalar(1);
  }));

  // ---------- Start / finish checker ----------
  // Chocolate + vanilla, never black + white — a monochrome grid is the one
  // thing on this island that would read as "not Gamecakes".
  const CHECK_COLS = 12;
  const geoCheck = g(new THREE.BoxGeometry((TRACK_HALF_W * 2) / CHECK_COLS, 0.02, 1.1));
  for (const [colorKey, parity] of [['CHECKER_A', 0], ['CHECKER_B', 1]] as const) {
    const cells: number[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < CHECK_COLS; col++) if ((row + col) % 2 === parity) cells.push(row * CHECK_COLS + col);
    }
    scene.add(scatter(geoCheck, std(RACER[colorKey], 0.7), cells.length, (i, d) => {
      const cell = cells[i];
      const row = Math.floor(cell / CHECK_COLS), col = cell % CHECK_COLS;
      const s = row * 1.1;
      posAt(s, (col + 0.5) / CHECK_COLS * 2 - 1, d.position);
      d.position.y = 0.06;
      d.rotation.set(0, headingAt(s), 0);
      d.scale.setScalar(1);
    }));
  }

  // ---------- Gantries: start/finish + the boost gate arches ----------
  const geoPost = g(new THREE.BoxGeometry(0.5, 4.6, 0.5));
  const geoBeam = g(new THREE.BoxGeometry(TRACK_HALF_W * 2 + 1.6, 0.7, 0.55));
  const matGantry = std(RACER.GANTRY, 0.55);
  const matArch = std(RACER.GATE_ARCH, 0.5);
  const buildGantry = (s: number, mat: THREE.Material): THREE.Group => {
    const grp = new THREE.Group();
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(geoPost, mat);
      post.position.set(side * (TRACK_HALF_W + 0.7), 2.3, 0);
      grp.add(post);
    }
    const beam = new THREE.Mesh(geoBeam, mat);
    beam.position.y = 4.4;
    grp.add(beam);
    posAt(s, 0, grp.position);
    grp.rotation.y = headingAt(s);
    scene.add(grp);
    return grp;
  };
  buildGantry(0, matGantry);
  // One arch per gate fraction — they're static, so a single set serves all four
  // laps. Kept dim until the lap's gate is actually live (see `armArches`).
  const archGlow: THREE.Mesh[] = [];
  const geoGlowRing = g(new THREE.TorusGeometry(TRACK_HALF_W * 0.8, 0.22, 8, 28));
  for (const frac of GATES_AT) {
    const s = frac * trackLen;
    buildGantry(s, matArch);
    const ring = new THREE.Mesh(
      geoGlowRing,
      m(new THREE.MeshStandardMaterial({
        color: RACER.GATE_GLOW, roughness: 0.3,
        emissive: RACER.GATE_GLOW, emissiveIntensity: 0.5,
      })),
    );
    posAt(s, 0, ring.position);
    ring.position.y = 2.4;
    ring.rotation.y = headingAt(s);
    scene.add(ring);
    archGlow.push(ring);
  }

  // ---------- Roadside crowd: gumdrops + licorice tyre stacks ----------
  const geoGum = g(new THREE.SphereGeometry(1, 10, 8));
  RACER.GUMDROP.forEach((color, ci) => {
    const per = 22;
    scene.add(scatter(geoGum, std(color, 0.35), per, (i, d) => {
      // Deterministic scatter: golden-angle around the loop so the crowd never
      // clumps, alternating sides, pushed clear of the sugar shoulder.
      const s = ((i * RACER.GUMDROP.length + ci) * 0.6180339887 * trackLen) % trackLen;
      const side = (i + ci) % 2 === 0 ? -1 : 1;
      const out = MAX_U + 0.9 + ((i * 7 + ci * 3) % 9) * 0.35; // crowd beyond the tyre wall
      posAt(s, side * out, d.position);
      const r = 0.5 + ((i * 5 + ci) % 5) * 0.16;
      d.position.y = r * 0.75;
      d.scale.set(r, r * 0.85, r);
      d.rotation.set(0, i, 0);
    }));
  });

  const geoTyre = g(new THREE.CylinderGeometry(0.6, 0.6, 0.42, 12));
  scene.add(scatter(geoTyre, std(RACER.TYRE_STACK, 0.85), 90, (i, d) => {
    // Stacks of three, parked just PAST the steering limit so they read as the
    // thing stopping you rather than scenery you clip through.
    const stack = Math.floor(i / 3);
    const s = (stack * 0.6180339887 * trackLen) % trackLen;
    const side = stack % 2 === 0 ? -1 : 1;
    posAt(s, side * (MAX_U + 0.12), d.position);
    d.position.y = 0.22 + (i % 3) * 0.42;
    d.rotation.set(0, headingAt(s), 0);
    d.scale.setScalar(1);
  }));

  // ---------- Cones ----------
  const geoCone = g(new THREE.ConeGeometry(0.42, 1.05, 12));
  const geoConeBand = g(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12));
  const activeCones = tuning.cones ? CONES : [];
  if (activeCones.length > 0) {
    const matCone = std(RACER.CONE, 0.55);
    const matBand = std(RACER.CONE_STRIPE, 0.55);
    for (const c of activeCones) {
      const s = c.at * trackLen;
      const grp = new THREE.Group();
      const cone = new THREE.Mesh(geoCone, matCone);
      cone.position.y = 0.52;
      grp.add(cone);
      const band = new THREE.Mesh(geoConeBand, matBand);
      band.position.y = 0.55;
      grp.add(band);
      posAt(s, c.u, grp.position);
      scene.add(grp);
    }
  }

  // ---------- Cars ----------
  /** The kid's frosting colour, as a hex int, for the bodywork. */
  const playerBody = (() => {
    const fro = props.cupcakeConfig?.frosting;
    if (!fro) return RACER.PLAYER_BODY;
    const css = FROSTING_COLORS[fro]?.fill;
    // White frosting would make an invisible white car on a cream track — the
    // one frosting that has to be overridden rather than honoured.
    if (!css || css.toLowerCase() === '#ffffff') return RACER.PLAYER_BODY;
    return parseInt(css.slice(1), 16);
  })();

  const mkCar = (bodyColor: number, trimColor: number): { group: THREE.Group; spin: THREE.Object3D[] } => {
    const v = buildJeep(THREE, { bodyColor, trimColor });
    geos.push(...v.geometries);
    mats.push(...v.materials);
    const group = new THREE.Group();
    group.add(v.group);
    scene.add(group);
    return { group, spin: v.spinParts ?? [] };
  };

  const player = mkCar(playerBody, RACER.PLAYER_TRIM);
  // The kid's own cupcake rides in the cockpit — buildJeep documents a +0.5 seat.
  const rider = buildCupcakeModel(THREE, props.cupcakeConfig as CupcakeConfig | undefined);
  geos.push(...rider.geometries);
  mats.push(...rider.materials);
  rider.group.position.y = 0.5;
  rider.group.scale.setScalar(0.85);
  player.group.add(rider.group);

  const geoDriver = g(new THREE.SphereGeometry(0.3, 10, 8));
  const rivals = RIVALS.map((spec) => {
    const car = mkCar(spec.bodyColor, spec.trimColor);
    // A gumdrop driver so a rival reads as a racer and not an empty prop.
    const driver = new THREE.Mesh(geoDriver, std(spec.trimColor, 0.35));
    driver.position.y = 0.78;
    car.group.add(driver);
    return { spec, car, s: 0, u: spec.startU, bumpCooldown: 0 };
  });

  // ---------- State ----------
  let s = 0;                 // player distance travelled — monotonic
  let u = PLAYER_START_U;
  let speed = 0;
  let steer: Steer = 0;
  let boostUntil = 0;
  let wasOnTrack = true;

  let lap = 0;
  let place = 1;
  let gatesCleared = 0;
  let wrongAnswers = 0;
  let bumps = 0;
  let bestLapMs: number | null = null;
  let lapStartMs = 0;
  const conesHit = new Set<string>();

  // Gate schedule as absolute `s` values, ascending. A pointer walks it, so a
  // gate can neither be missed nor fire twice — no lap-fraction crossing test,
  // no seam.
  const gateS: number[] = [];
  for (let l = 0; l < LAPS; l++) for (const frac of GATES_AT) gateS.push((l + frac) * trackLen);
  gateS.sort((a, b) => a - b);
  let gateIdx = 0;

  let elapsedMs = 0;
  let lastEmitSec = -1;
  let lastEmitPlace = -1;
  let lastEmitBoost = false;
  let awaiting = false;      // maths modal is up — the whole race is frozen
  let paused = false;
  let ended = false;
  let finished = false;
  let raf = 0;
  let last = performance.now();

  const steerRate = STEER_RATE * tuning.steerMul;
  const bumpMul = Math.min(0.95, BUMP_MUL * tuning.bumpForgiveness);

  const endRound = (reason: 'finish' | 'timeout'): void => {
    if (ended) return;
    ended = true;
    finished = reason === 'finish';
    cb.onSfx?.(reason === 'finish' ? 'win' : 'timeUp');
    cb.onRoundEnd(reason);
  };

  const bump = (): void => {
    speed *= bumpMul;
    bumps += 1;
    cb.onSfx?.('bump');
  };

  // ---------- Per-frame ----------
  const stepPlayer = (dt: number, now: number): void => {
    // Steering. `u` is clamped to the scenery boundary, never to the road — a
    // kid who holds left just ends up slow, never stopped.
    u = clamp(u + steer * steerRate * dt, -MAX_U, MAX_U);

    const boosting = now < boostUntil;
    const cap = speedCapAt(u, boosting) * tuning.playerSpeedMul;
    // Accelerate toward the cap; decelerate twice as hard so running wide bites
    // immediately and coming back on feels like a reward.
    const rate = speed < cap ? ACCEL : ACCEL * 2;
    speed += clamp(cap - speed, -rate * dt, rate * dt);

    const on = isOnTrack(u);
    if (on !== wasOnTrack) { wasOnTrack = on; if (!on) cb.onSfx?.('rough'); }

    s += speed * dt;

    // Cones. Keyed by lap so each cone bites once per lap and not once per frame.
    if (activeCones.length > 0) {
      const f = lapFrac(s, trackLen);
      const l = lapOf(s, trackLen);
      for (let i = 0; i < activeCones.length; i++) {
        const c = activeCones[i];
        const key = `${l}:${i}`;
        if (conesHit.has(key)) continue;
        if (fracGap(f, c.at) * trackLen < CAR_LEN_S && Math.abs(u - c.u) < CAR_HALF_U * 2) {
          conesHit.add(key);
          bump();
        }
      }
    }

    // Lap split.
    if (s >= (lap + 1) * trackLen) {
      lap += 1;
      const lapMs = now - lapStartMs;
      if (bestLapMs === null || lapMs < bestLapMs) bestLapMs = lapMs;
      lapStartMs = now;
      cb.onLap(lap);
      if (lap >= LAPS) { endRound('finish'); return; }
      cb.onSfx?.('lap');
    }

    // Boost gate.
    if (gateIdx < gateS.length && s >= gateS[gateIdx]) {
      gateIdx += 1;
      awaiting = true;
      cb.onSfx?.('gate');
      cb.onChallenge('boost-gate');
    }
  };

  const stepRivals = (dt: number): void => {
    for (const r of rivals) {
      const base = TOP_SPEED * r.spec.pace * tuning.rivalSpeedMul;
      r.s += rivalSpeed(base, r.s, s) * dt;
      r.u = r.spec.startU * 0.4 + rivalOffset(r.s, r.spec.weaveAmp, r.spec.weaveFreq, r.spec.weavePhase);
      if (r.bumpCooldown > 0) r.bumpCooldown -= dt;
      else if (overlaps(s, u, r.s, r.u)) {
        // Shunt both cars apart so contact resolves instead of grinding.
        r.bumpCooldown = 0.8;
        const away = Math.sign(u - r.u) || 1;
        u = clamp(u + away * 0.22, -MAX_U, MAX_U);
        bump();
      }
      posAt(r.s, r.u, r.car.group.position);
      r.car.group.rotation.y = headingAt(r.s);
      for (const p of r.car.spin) p.rotation.x += dt * 9;
    }
  };

  const placeCamera = (dt: number): void => {
    // Eye and aim point both track the car's own lateral offset closely. They
    // used to be damped hard (0.6 / 0.35), which let the car drift toward the
    // frame edge exactly when it was furthest off-centre — i.e. when the kid
    // most needed to see it.
    posAt(s - CAM_BACK, u * 0.9, _eye);
    _eye.y = CAM_H;
    // Frame-rate independent smoothing; snap on the first frame so the race
    // doesn't open with the camera flying in from the origin.
    const k = dt > 0 ? 1 - Math.exp(-dt * 6) : 1;
    camera.position.lerp(_eye, k);
    posAt(s + CAM_LOOK_AHEAD, u * 0.9, _look);
    _look.y = 1.1;
    camera.lookAt(_look);

    const boosting = performance.now() < boostUntil;
    const targetFov = boosting ? FOV_BOOST : FOV_BASE;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 5);
      camera.updateProjectionMatrix();
    }
  };

  // ---------- Input ----------
  const setSteer = (next: Steer): void => { steer = next; };
  // Touch: hold a side of the canvas. One axis, no gesture to learn, and it
  // works identically under a thumb or a mouse.
  const steerFromX = (clientX: number): Steer => {
    const rect = renderer.domElement.getBoundingClientRect();
    return clientX < rect.left + rect.width / 2 ? -1 : 1;
  };
  const onPointerDown = (e: PointerEvent): void => { setSteer(steerFromX(e.clientX)); };
  const onPointerMove = (e: PointerEvent): void => { if (e.buttons !== 0 || e.pointerType === 'touch') setSteer(steerFromX(e.clientX)); };
  const onPointerUp = (): void => { setSteer(0); };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerUp);

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

    if (!paused && !ended && !awaiting) {
      stepPlayer(dt, now);
      if (!ended) stepRivals(dt);

      // Boost is EDGE-DETECTED off the clock rather than announced by a
      // setTimeout: back-to-back gates would otherwise let the first boost's
      // timer switch the HUD off in the middle of the second boost.
      const boostingNow = now < boostUntil;
      if (boostingNow !== lastEmitBoost) { lastEmitBoost = boostingNow; cb.onBoost(boostingNow); }

      cb.onSpeed(clamp(speed / TOP_SPEED, 0, 1.6));
      const nextPlace = placeOf(s, rivals.map((r) => r.s));
      if (nextPlace !== lastEmitPlace) { lastEmitPlace = nextPlace; place = nextPlace; cb.onPlace(nextPlace); }

      elapsedMs += dtMs;
      const remaining = Math.max(0, roundMs - elapsedMs);
      const sec = Math.ceil(remaining / 1000);
      if (sec !== lastEmitSec) {
        lastEmitSec = sec;
        cb.onTimeLeft(remaining);
        if (sec <= 15 && sec > 0) cb.onSfx?.('tick');
      }
      if (remaining <= 0) endRound('timeout');
    }

    // The car itself keeps rendering even while a gate is open, so the world
    // never looks frozen behind the modal.
    posAt(s, u, player.group.position);
    player.group.rotation.y = headingAt(s);
    if (!awaiting && !paused) for (const p of player.spin) p.rotation.x += dt * (speed * 0.55);

    // Only the arch the car is actually driving toward pulses; the other sits
    // dim, so "the glowing one is next" is a rule a kid can learn in one lap.
    const liveArch = gateIdx < gateS.length ? gateIdx % GATES_AT.length : -1;
    for (let i = 0; i < archGlow.length; i++) {
      const mat = archGlow[i].material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = i === liveArch ? 0.45 + Math.sin(now / 220) * 0.3 : 0.12;
    }

    placeCamera(dt);
    renderer.render(scene, camera);
  };

  // Seed the opening frame so nothing pops: park the camera and the cars on the
  // grid before the first rAF.
  posAt(s, u, player.group.position);
  player.group.rotation.y = headingAt(s);
  for (const r of rivals) { posAt(r.s, r.u, r.car.group.position); r.car.group.rotation.y = headingAt(r.s); }
  placeCamera(0);
  lapStartMs = performance.now();
  raf = window.requestAnimationFrame(tick);

  return {
    setSteer,
    resolveChallenge(correct: boolean): void {
      if (!awaiting) return;
      awaiting = false;
      if (correct) {
        gatesCleared += 1;
        boostUntil = performance.now() + BOOST_MS;
        cb.onSfx?.('correct');
        cb.onSfx?.('boost');
        // onBoost is emitted by the loop's edge detector — not here — so the
        // flag can only ever agree with `boostUntil`.
      } else {
        wrongAnswers += 1;
        // A wrong answer costs momentum, never progress. Losing distance to the
        // pack is punishment enough; rewinding the car would undo driving the
        // kid already did well.
        speed *= 0.5;
        cb.onSfx?.('wrong');
      }
      last = performance.now();
    },
    setPaused(p: boolean): void { paused = p; if (!p) last = performance.now(); },
    resize(): void { onResize(); },
    getSummaryStats() {
      return { laps: lap, place, bestLapMs, gatesCleared, wrongAnswers, bumps, finished };
    },
    dispose(): void {
      ended = true;
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointerleave', onPointerUp);
      window.removeEventListener('resize', onResize);
      for (const inst of instanced) inst.dispose();
      for (const geo of geos) geo.dispose();
      for (const mat of mats) mat.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    },
  };
}
