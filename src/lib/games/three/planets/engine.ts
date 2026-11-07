// Musical Planets engine — the whole game as one three.js scene.
//
// Two things are drawn every frame:
//   * the WORLD: the circle of fifths as twelve candy planets around a sun,
//     Cakey's rocket, the stars. The camera flies through it: up high to see
//     the whole circle (space view), or down to one planet (planet view).
//   * the STAGE: the staff and the piano, laid out in camera space and drawn
//     after the world with the depth buffer cleared, so a planet behind can
//     never cut into a key. They slide in when the camera lands and out when
//     it leaves.
//
// The host owns the lesson (missions, what to say, what to play). This file
// only shows state the host hands it and reports taps: onPlanetTap(i) and
// onKeyDown(midi). Positions come from layout.ts, musical facts from theory.ts.
//
// Every object is Blender art from public/models/music/ (art/blender/music-*.py)
// through the town's authored registry; a missing file falls back to a plain
// shape so the lesson still works. Text, glyphs, glows and particles are
// canvas sprites.
//
// No runtime `three` import — the namespace arrives as an argument, like every
// other 3D game here.

import type * as THREE_T from 'three';
import { SOFT_RIG, addTownLights, configureTownRenderer } from '@/lib/town/three/lighting';
import { createAuthoredRegistry, settleRegistry, type AuthoredRegistry } from '@/lib/town/three/authored-registry';
import { cloneMaterial, glowSprite } from '@/lib/town/three/materials';
import type { ThreeNS as TownThreeNS } from '@/lib/town/three/types';
import { SPRINKLE_COLORS } from '@/lib/games/theme/palette';
import {
  CIRCLE,
  keyLabels,
  keyOf,
  majorScale,
  pcName,
  pcOf,
  pianoKeys,
  signatureMarks,
  spellInKey,
  staffStep,
  type KeyId,
  type Letter,
} from '@/lib/games/music/theory';
import {
  BED_FLOOR,
  BLACK_BASE,
  BLACK_H,
  BLACK_LEN,
  FOV,
  MIN_WHITE_PX,
  ORBIT_R,
  PLANET_COLORS,
  PLANET_R,
  STAFF_LEN,
  STAFF_STEP,
  WHITE_H,
  WHITE_LEN,
  WHITE_W,
  halfH,
  isBlack,
  keyX,
  ndcBands,
  pianoWindow,
  planetCamera,
  planetPos,
  spaceCamera,
  spaceFit,
  staffLayout,
  type CameraPose,
  WHITE_COUNT,
  fitInBand,
} from './layout';
import { planetAngle } from './angle';
import { accidentalTex, bubbleTex, clefTex, hex, labelTex, panelTex, skyTex, sparkTex } from './glyphs';

export type ThreeNS = typeof THREE_T;

export type PlanetStatus = 'open' | 'locked' | 'future';

export interface PlanetLook {
  status: PlanetStatus;
  /** Missions done on this planet, and how many it has. */
  done: number;
  total: number;
}

export type View =
  | { mode: 'space'; planet: number; staff: boolean }
  | { mode: 'planet'; planet: number };

export interface StaffSpec {
  keyId: KeyId;
  /** The scale after the signature. */
  showScale: boolean;
  /** "Match the sign": the signature only, no notes, no names. */
  mystery: boolean;
  focusLetter: Letter | null;
  hideNames: boolean;
}

export interface PianoSpec {
  keyId: KeyId;
  /** Dot the keys in the scale. */
  showScale: boolean;
  hideNames: boolean;
  /** Keys with an answer bubble over them (the tune mission). */
  choices: readonly number[];
  /** Pitch classes glowing as a hint, every octave. */
  hintPcs: readonly number[];
  /** A pitch class to tint softly: the note the signature changes. */
  focusPc: number | null;
}

export interface Insets {
  /** CSS px the HUD covers at the top and bottom of the canvas. */
  top: number;
  bottom: number;
  /** Planet view: CSS px under `top` kept for the planet's row (the HUD
   *  beside it on a wide screen). 0 lets the engine choose. */
  planetRow: number;
}

export interface PlanetsEngineProps {
  looks: readonly PlanetLook[];
  reducedMotion: boolean;
  /** CSS font-family strings, resolved by the host from the page's fonts. */
  displayFont: string;
  musicFont: string;
}

export interface PlanetsEngineCallbacks {
  onPlanetTap: (index: number) => void;
  onKeyDown: (midi: number) => void;
}

export interface PlanetsEngine {
  setLooks(looks: readonly PlanetLook[]): void;
  /** Fly to a view. Resolves when the camera arrives. */
  setView(view: View): Promise<void>;
  /** The fifth missions' payoff: up to space, rocket along the orbit, down
   *  onto the new planet. Resolves on landing. */
  travel(from: number, to: number): Promise<void>;
  setStaff(spec: StaffSpec): void;
  setPiano(spec: PianoSpec): void;
  /** Keys sounding now, and which scale note on the staff (or null). */
  setLit(midis: readonly number[], scaleIndex: number | null): void;
  /** Press a key from the computer keyboard: the same dip a tap gives. */
  flashKey(midi: number): void;
  setLink(link: readonly [number, number] | null): void;
  pulse(index: number): void;
  /** A planet wobbles "no" (a wrong pick in the match mission). */
  shake(index: number): void;
  /** Confetti from the focused planet. */
  celebrate(): void;
  setInsets(insets: Insets): void;
  setReducedMotion(on: boolean): void;
  resize(): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------

const ASSETS = ['music-planet', 'music-rocket', 'music-key-white', 'music-key-black', 'music-piano-bed', 'music-staff', 'music-ledger', 'music-note', 'music-sun'] as const;
type AssetKey = (typeof ASSETS)[number];

const LOCKED_GREY = 0x9d97b8;
const LIT = 0x2dd4bf;
const HINT = 0xfbbf24;
const FOCUS = 0xf59e0b;
const KEYS = pianoKeys();
/** Scale of a planet by state. */
const SCALE = { focus: 1.7, selected: 1.9, open: 1.45, locked: 1.2, future: 1.05, behind: 0.7 } as const;
const STAGE_DEPTH = 12;
/** How far the keyboard tips toward the camera, radians. */
const PIANO_TILT = 0.95;
/** Space view with the mystery staff: the share of the free screen it takes. */
const MATCH_STAFF = 0.27;
/** Planet label width on screen, CSS px. */
const LABEL_PX = 76;

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number): number => {
  const c = 1.5;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

function sigShort(id: KeyId): string {
  const s = keyOf(id).signature;
  if (s === 0) return 'no ♯ or ♭';
  return `${Math.abs(s)}${s > 0 ? '♯' : '♭'}`;
}

function planetName(id: KeyId): string {
  return id === 'F#' ? 'F♯/G♭' : pcName(keyOf(id).tonic);
}

export async function createPlanetsEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: PlanetsEngineProps,
  cb: PlanetsEngineCallbacks,
): Promise<PlanetsEngine> {
  let reduced = props.reducedMotion;
  let looks = props.looks;
  const font = props.displayFont;

  // Everything this file creates and must free. Registry clones are NOT in
  // here: the registry owns those (see authored-registry.ts).
  const geos: THREE_T.BufferGeometry[] = [];
  const mats: THREE_T.Material[] = [];
  const texs: THREE_T.Texture[] = [];
  const g = <T extends THREE_T.BufferGeometry>(x: T): T => { geos.push(x); return x; };
  const m = <T extends THREE_T.Material>(x: T): T => { mats.push(x); return x; };
  const t = <T extends THREE_T.Texture>(x: T): T => { texs.push(x); return x; };

  // ---------- art ----------
  const registry: AuthoredRegistry = createAuthoredRegistry(
    THREE as unknown as TownThreeNS,
    ASSETS.map((key) => ({ key, url: `/models/music/${key}.glb` })),
  );
  await settleRegistry(registry, 5000);

  /** A Blender asset, or the plain stand-in when it did not load. */
  function art(key: AssetKey, tints?: { tint?: number; tint2?: number }): THREE_T.Object3D {
    const got = registry.take(key, tints) as THREE_T.Object3D | null;
    if (got) return got;
    return fallback(key, tints?.tint ?? 0xffffff, tints?.tint2 ?? 0xffffff);
  }

  const fallbackGeo = new Map<string, THREE_T.BufferGeometry>();
  const fallbackMat = new Map<number, THREE_T.Material>();
  function fmat(color: number, rough = 0.35): THREE_T.Material {
    let mm = fallbackMat.get(color);
    if (!mm) {
      mm = m(new THREE.MeshStandardMaterial({ color, roughness: rough, emissive: color, emissiveIntensity: 0.05 }));
      fallbackMat.set(color, mm);
    }
    return mm;
  }
  function fgeo(key: string, make: () => THREE_T.BufferGeometry): THREE_T.BufferGeometry {
    let gg = fallbackGeo.get(key);
    if (!gg) { gg = g(make()); fallbackGeo.set(key, gg); }
    return gg;
  }
  function fallback(key: AssetKey, tint: number, tint2: number): THREE_T.Object3D {
    const grp = new THREE.Group();
    const add = (geo: THREE_T.BufferGeometry, mat: THREE_T.Material, x = 0, y = 0, z = 0): THREE_T.Mesh => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      grp.add(mesh);
      return mesh;
    };
    switch (key) {
      case 'music-planet': {
        add(fgeo('ball', () => new THREE.SphereGeometry(0.5, 32, 20)), fmat(tint, 0.3), 0, 0.5, 0);
        const ring = add(fgeo('pring', () => new THREE.TorusGeometry(0.78, 0.05, 8, 48)), fmat(tint2), 0, 0.5, 0);
        ring.rotation.x = Math.PI / 2 - 0.38;
        break;
      }
      case 'music-sun':
        add(fgeo('sun', () => new THREE.SphereGeometry(0.9, 32, 20)), fmat(0xfde68a), 0, 1, 0);
        break;
      case 'music-rocket': {
        add(fgeo('rbody', () => new THREE.CylinderGeometry(0.2, 0.2, 0.55, 16)), fmat(0xfff1d6), 0, 0.42, 0);
        add(fgeo('rnose', () => new THREE.ConeGeometry(0.2, 0.32, 16)), fmat(0xfb7185), 0, 0.85, 0);
        break;
      }
      case 'music-key-white':
        add(fgeo('kw', () => new THREE.BoxGeometry(0.94, WHITE_H, WHITE_LEN)), fmat(0xfff8ec), 0, WHITE_H / 2, 0);
        break;
      case 'music-key-black':
        add(fgeo('kb', () => new THREE.BoxGeometry(0.56, BLACK_H, BLACK_LEN)), fmat(0x2b2b33, 0.25), 0, BLACK_H / 2, 0);
        break;
      case 'music-piano-bed':
        add(fgeo('bed', () => new THREE.BoxGeometry(16.4, BED_FLOOR, 5.6)), fmat(0xb5764a), 0, BED_FLOOR / 2, 0);
        add(fgeo('rail', () => new THREE.BoxGeometry(16.4, 0.9, 0.7)), fmat(0x8b5e3c), 0, 0.45, -2.45);
        break;
      case 'music-staff':
        for (let i = 0; i < 5; i++) add(fgeo('sline', () => new THREE.BoxGeometry(STAFF_LEN, 0.08, 0.08)), fmat(0xffffff), 0, 0.045 + i * 0.5, 0);
        break;
      case 'music-ledger':
        add(fgeo('ledger', () => new THREE.BoxGeometry(0.95, 0.08, 0.08)), fmat(0xffffff), 0, 0.045, 0);
        break;
      case 'music-note': {
        const head = add(fgeo('note', () => new THREE.SphereGeometry(0.25, 20, 14)), fmat(tint, 0.25), 0, 0.22, 0);
        head.scale.set(1.25, 0.88, 0.6);
        head.rotation.z = 0.35;
        break;
      }
    }
    return grp;
  }

  /** Box size of an object, for recentring. */
  const box = new THREE.Box3();
  const v3 = new THREE.Vector3();
  function centreOf(o: THREE_T.Object3D): THREE_T.Vector3 {
    box.setFromObject(o);
    return box.getCenter(new THREE.Vector3());
  }

  // ---------- renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  configureTownRenderer(THREE as unknown as TownThreeNS, renderer);
  renderer.shadowMap.enabled = false;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);
  const canvasEl = renderer.domElement;
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  canvasEl.style.display = 'block';
  canvasEl.style.touchAction = 'none';
  canvasEl.setAttribute('aria-hidden', 'true');

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';

  // ---------- the world ----------
  const world = new THREE.Scene();
  world.background = t(skyTex(THREE));
  const lights = addTownLights(THREE as unknown as TownThreeNS, world as never, renderer as never, { centerX: 0, centerZ: 0, halfU: 8 }, SOFT_RIG);
  lights.sun.castShadow = false;
  lights.ambient.intensity = 0.45;
  const sunLight = new THREE.PointLight(0xffd59a, 55, 0, 2);
  sunLight.position.set(0, 1.2, 0);
  world.add(sunLight);

  const spark = t(sparkTex(THREE));

  // Stars: a shell of sprinkles far out, slowly turning.
  const stars = (() => {
    const count = 700;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const r1 = Math.abs(Math.sin(i * 91.7) * 43758.5453) % 1;
      const r2 = Math.abs(Math.sin(i * 12.9) * 24634.6345) % 1;
      const r3 = Math.abs(Math.sin(i * 47.3) * 13758.123) % 1;
      const th = r1 * Math.PI * 2;
      const ph = Math.acos(2 * r2 - 1);
      const rad = 70 + r3 * 40;
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * rad;
      pos[i * 3 + 1] = Math.cos(ph) * rad;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * rad;
      c.setHex(i % 3 === 0 ? SPRINKLE_COLORS[i % SPRINKLE_COLORS.length] : 0xffffff);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = m(new THREE.PointsMaterial({ size: 1.1, map: spark, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.95 }));
    const pts = new THREE.Points(geo, mat);
    world.add(pts);
    return pts;
  })();

  // Nebula clouds: big soft glows far behind the circle.
  for (const [color, x, y, z, s] of [
    [0xf472b6, -30, -6, -60, 60], [0x6ee7b7, 34, 10, -70, 54], [0x8b93f8, 0, 26, -80, 70], [0xfbbf24, -40, 20, 30, 50],
  ] as const) {
    const gs = glowSprite(THREE as unknown as TownThreeNS, color, s, 0.22);
    t(gs.tex); m(gs.mat);
    gs.sprite.position.set(x, y, z);
    world.add(gs.sprite);
  }

  // The sun at the centre.
  const sun = new THREE.Group();
  {
    const body = art('music-sun');
    const c = centreOf(body);
    body.position.sub(c);
    sun.add(body);
    const halo = glowSprite(THREE as unknown as TownThreeNS, 0xffd28a, 7, 0.75);
    t(halo.tex); m(halo.mat);
    sun.add(halo.sprite);
    world.add(sun);
  }

  // The orbit: a ring of sugar pearls, every planet sitting on it.
  {
    const pearls = 144;
    const geo = g(new THREE.SphereGeometry(0.045, 8, 6));
    const mat = m(new THREE.MeshStandardMaterial({ color: 0xfff4e2, roughness: 0.3, emissive: 0xfff4e2, emissiveIntensity: 0.35 }));
    const inst = new THREE.InstancedMesh(geo, mat, pearls);
    const mm4 = new THREE.Matrix4();
    for (let i = 0; i < pearls; i++) {
      const a = (i / pearls) * Math.PI * 2;
      mm4.makeTranslation(Math.cos(a) * ORBIT_R, 0, Math.sin(a) * ORBIT_R);
      inst.setMatrixAt(i, mm4);
    }
    world.add(inst);
  }

  // "One more ♯ / one more ♭" signposts just outside the ring near the top.
  const signposts: THREE_T.Sprite[] = [];
  for (const [text, side] of [['↻ one more ♯', 1], ['↺ one more ♭', -1]] as const) {
    const tex = t(labelTex(THREE, { lines: [text], fg: '#fff7ed', bg: 'rgba(30,16,70,0.55)', fontFamily: font, w: 512, h: 112, big: 54 }));
    const mat = m(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    const sp = new THREE.Sprite(mat);
    const a = planetAngle(side === 1 ? 1.5 : -1.5);
    sp.position.set(Math.cos(a) * (ORBIT_R + 2.2), 0.4, -Math.sin(a) * (ORBIT_R + 2.2));
    sp.scale.set(3.2, 0.7, 1);
    world.add(sp);
    signposts.push(sp);
  }

  // ---------- planets ----------
  interface Planet {
    group: THREE_T.Group;
    spin: THREE_T.Group;
    body: THREE_T.Object3D | null;
    centre: THREE_T.Vector3;
    hit: THREE_T.Mesh;
    label: THREE_T.Sprite;
    labelMat: THREE_T.SpriteMaterial;
    labelTex: THREE_T.CanvasTexture | null;
    labelKey: string;
    glow: THREE_T.Sprite;
    glowMat: THREE_T.SpriteMaterial;
    base: THREE_T.Vector3;
    scale: number;
    targetScale: number;
    pulseT: number;
    shakeT: number;
    tintKey: string;
  }
  const hitGeo = g(new THREE.SphereGeometry(1, 12, 8));
  const hitMat = m(new THREE.MeshBasicMaterial({ visible: false }));
  const planets: Planet[] = CIRCLE.map((id, i) => {
    const group = new THREE.Group();
    const p = planetPos(i);
    const base = new THREE.Vector3(p.x, p.y, p.z);
    group.position.copy(base);
    const spin = new THREE.Group();
    group.add(spin);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    // Generous: a finger lands anywhere near the planet, short of its neighbour.
    hit.scale.setScalar(1.0);
    hit.userData.planet = i;
    group.add(hit);
    const gs = glowSprite(THREE as unknown as TownThreeNS, PLANET_COLORS[id], 2.8, 0);
    t(gs.tex); m(gs.mat);
    group.add(gs.sprite);
    const labelMat = m(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
    const label = new THREE.Sprite(labelMat);
    label.renderOrder = 5;
    label.center.set(0.5, 1);
    world.add(label);
    world.add(group);
    return {
      group, spin, body: null, centre: new THREE.Vector3(), hit, label, labelMat, labelTex: null, labelKey: '',
      glow: gs.sprite, glowMat: gs.mat, base, scale: 1, targetScale: 1, pulseT: -1, shakeT: -1, tintKey: '',
    };
  });

  let view: View = { mode: 'space', planet: 0, staff: false };
  let flying = false;

  /** Planet labels come out about LABEL_PX wide on any screen: the space
   *  camera stands further back on a phone, so the label grows to match. */
  let labelW = 1.7;
  function labelWidth(): number {
    return labelW;
  }

  function paintPlanet(i: number): void {
    const p = planets[i];
    const id = CIRCLE[i];
    const look = looks[i];
    const open = look.status === 'open';
    const col = open ? PLANET_COLORS[id] : mix(PLANET_COLORS[id], LOCKED_GREY, look.status === 'locked' ? 0.45 : 0.4);
    const ring = open ? mix(PLANET_COLORS[id], 0xffffff, 0.55) : mix(col, 0xffffff, 0.35);
    const key = `${col}:${ring}`;
    if (key !== p.tintKey) {
      p.tintKey = key;
      if (p.body) p.spin.remove(p.body);
      const body = art('music-planet', { tint: col, tint2: ring });
      body.position.set(0, 0, 0);
      const c = centreOf(body);
      body.position.sub(c);
      p.spin.add(body);
      p.body = body;
    }
    // Label: name, signature, and the missions done here.
    const stars = look.total > 0 && open ? '★'.repeat(look.done) + '☆'.repeat(look.total - look.done) : '';
    const lines = [planetName(id), look.status === 'locked' ? '🔒' : look.status === 'future' ? sigShort(id) : stars || sigShort(id)];
    if (open && stars) lines.splice(1, 0, sigShort(id));
    const labelKey = lines.join('|');
    if (labelKey !== p.labelKey) {
      p.labelKey = labelKey;
      p.labelTex?.dispose();
      p.labelTex = labelTex(THREE, {
        lines,
        fg: open ? '#1c1033' : '#4b4566',
        bg: open ? 'rgba(255,250,240,0.94)' : 'rgba(225,220,240,0.78)',
        fontFamily: font,
        w: 256,
        h: lines.length > 2 ? 200 : 150,
        big: 70,
        small: 36,
      });
      p.labelMat.map = p.labelTex;
      p.labelMat.needsUpdate = true;
      const lw = labelWidth();
      p.label.scale.set(lw, (lw * (lines.length > 2 ? 200 : 150)) / 256, 1);
    }
  }

  function targetScales(): void {
    planets.forEach((p, i) => {
      const st = looks[i].status;
      let s: number = st === 'open' ? SCALE.open : st === 'locked' ? SCALE.locked : SCALE.future;
      if (i === view.planet) s = view.mode === 'planet' ? SCALE.focus : SCALE.selected;
      else if (view.mode === 'planet') s *= SCALE.behind;
      p.targetScale = s;
      p.glowMat.opacity = i === view.planet ? (view.mode === 'planet' ? 0.5 : 0.8) : 0;
      if (reduced) p.scale = s;
    });
  }

  function applyLooks(): void {
    planets.forEach((_, i) => paintPlanet(i));
    targetScales();
  }
  applyLooks();

  // ---------- the rocket ----------
  const rocket = new THREE.Group();
  {
    const body = art('music-rocket');
    body.scale.setScalar(0.9);
    rocket.add(body);
    world.add(rocket);
  }
  const flame = glowSprite(THREE as unknown as TownThreeNS, 0xffa94d, 0.9, 0);
  t(flame.tex); m(flame.mat);
  flame.sprite.position.set(0, -0.12, 0);
  rocket.add(flame.sprite);
  /** Rocket flight along the orbit, when travelling. */
  let rocketArc: { a0: number; a1: number; t: number; dur: number; done: () => void } | null = null;
  const trail = (() => {
    const count = 60;
    const geo = g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const mat = m(new THREE.PointsMaterial({ size: 0.35, map: spark, color: 0xffd28a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    world.add(pts);
    return { pts, mat, geo, count, head: 0 };
  })();

  // ---------- the lit arc between two neighbours ----------
  let link: THREE_T.Mesh | null = null;
  const linkMat = m(new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 }));
  function setLink(l: readonly [number, number] | null): void {
    if (link) { world.remove(link); link.geometry.dispose(); link = null; }
    if (!l) return;
    let a0 = planetAngle(l[0]);
    let a1 = planetAngle(l[1]);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a0 -= Math.PI * 2;
    const pts: THREE_T.Vector3[] = [];
    for (let k = 0; k <= 32; k++) {
      const a = a0 + ((a1 - a0) * k) / 32;
      pts.push(new THREE.Vector3(Math.cos(a) * ORBIT_R, 0.02, -Math.sin(a) * ORBIT_R));
    }
    link = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.1, 8, false), linkMat);
    world.add(link);
  }

  // ---------- the stage (camera space) ----------
  const stage = new THREE.Scene();
  stage.environment = lights.envRT.texture;
  const stageRoot = new THREE.Group();
  stage.add(stageRoot);
  stageRoot.add(new THREE.AmbientLight(0xffffff, 0.6));
  stageRoot.add(new THREE.HemisphereLight(0xfff4e0, 0xc4b5fd, 0.9));
  {
    const key = new THREE.DirectionalLight(0xfff4e0, 1.5);
    key.position.set(-3, 6, 4);
    key.target.position.set(0, 0, -STAGE_DEPTH);
    stageRoot.add(key, key.target);
  }

  // ---- the staff ----
  const staffGroup = new THREE.Group(); // placed + scaled on screen
  const staffInner = new THREE.Group(); // staff units: x 0..14, bottom line y=0
  staffGroup.add(staffInner);
  stageRoot.add(staffGroup);
  const staffLines = new THREE.Group();
  {
    const lines = art('music-staff');
    const c = centreOf(lines);
    // Line up the rods: x from 0, bottom line at y = 0.
    box.setFromObject(lines);
    lines.position.set(-box.min.x, -box.min.y - 0.045, -c.z);
    staffLines.add(lines);
    staffInner.add(staffLines);
  }
  // A dark glassy panel behind the staff so it reads over any planet.
  const staffPanelMat = m(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
  /** The panel behind the staff, in staff units; the staff is centred on it. */
  const panel = { w: STAFF_LEN + 0.6, h: 5.3, cy: 0.75 };
  const staffPanel = new THREE.Mesh(g(new THREE.PlaneGeometry(1, 1)), staffPanelMat);
  staffPanel.renderOrder = -1;
  staffInner.add(staffPanel);

  const clefMat = m(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: 0xffffff }));
  const clef = new THREE.Mesh(g(new THREE.PlaneGeometry(1, 1)), clefMat);
  staffInner.add(clef);
  function drawClef(): void {
    const c = clefTex(THREE, props.musicFont, '#ffffff');
    clefMat.map?.dispose();
    clefMat.map = c.tex;
    clefMat.needsUpdate = true;
    clef.scale.set(c.w, c.h, 1);
    const L = staffLayout(0);
    clef.position.set(L.clefX, 2 * STAFF_STEP - c.gLineY, 0.02);
  }
  drawClef();
  // The music font may still be on its way; redraw the clef once it lands.
  if (typeof document !== 'undefined' && document.fonts?.load) {
    document.fonts.load(`80px ${props.musicFont}`, '\u{1D11E}').then(() => { if (!disposed) drawClef(); }).catch(() => {});
  }

  const accTex = { sharp: accidentalTex(THREE, 1, '#ffffff'), flat: accidentalTex(THREE, -1, '#ffffff') };
  t(accTex.sharp.tex);
  t(accTex.flat.tex);
  const sigMats = { normal: m(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })), focus: m(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: FOCUS })) };
  const glyphGeo = g(new THREE.PlaneGeometry(1, 1));

  interface StaffNote { group: THREE_T.Group; head: THREE_T.Object3D; glow: THREE_T.Sprite; glowMat: THREE_T.SpriteMaterial; label: THREE_T.Sprite | null; bump: number }
  let staffDyn: THREE_T.Object3D[] = [];
  let staffNotes: StaffNote[] = [];
  const staffLabelTexs: THREE_T.Texture[] = [];
  /** Materials made by setStaff; freed on the next rebuild. */
  const staffMats: THREE_T.Material[] = [];
  const staffGlow = glowSprite(THREE as unknown as TownThreeNS, 0xffffff, 1, 1);
  const staffGlowTex = t(staffGlow.tex);
  m(staffGlow.mat);
  let staffSpec: StaffSpec | null = null;
  let staffWidth = STAFF_LEN;

  function setStaff(spec: StaffSpec): void {
    staffSpec = spec;
    for (const o of staffDyn) staffInner.remove(o);
    staffDyn = [];
    staffNotes = [];
    for (const x of staffLabelTexs.splice(0)) x.dispose();
    for (const x of staffMats.splice(0)) x.dispose();
    const sm = <T extends THREE_T.Material>(x: T): T => { staffMats.push(x); return x; };
    const k = keyOf(spec.keyId);
    const marks = signatureMarks(k);
    const L = staffLayout(marks.length);
    const add = (o: THREE_T.Object3D): void => { staffInner.add(o); staffDyn.push(o); };

    marks.forEach((mk, i) => {
      const tex = mk.acc === 1 ? accTex.sharp : accTex.flat;
      const focus = !spec.mystery && spec.focusLetter === mk.pitch.letter;
      // Per-glyph material: the map differs, the colour says focus or not.
      const mat = (focus ? sigMats.focus : sigMats.normal).clone();
      mat.map = tex.tex;
      staffMats.push(mat);
      const mesh = new THREE.Mesh(glyphGeo, mat);
      mesh.scale.set(tex.w * 1.15, tex.h * 1.15, 1);
      mesh.position.set(L.sigX(i), staffStep(mk.pitch) * STAFF_STEP, 0.03);
      add(mesh);
      if (focus) {
        const gl = new THREE.Sprite(sm(new THREE.SpriteMaterial({ map: staffGlowTex, color: FOCUS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
        gl.scale.setScalar(1.4);
        gl.position.copy(mesh.position);
        add(gl);
      }
    });

    let right = L.sigX(Math.max(1, marks.length)) + 0.6;
    if (spec.showScale && !spec.mystery) {
      const scale = majorScale(k);
      const color = PLANET_COLORS[spec.keyId];
      scale.forEach((p, i) => {
        const step = staffStep(p);
        const x = L.noteX(i);
        const grp = new THREE.Group();
        grp.position.set(x, step * STAFF_STEP, 0.06);
        const focus = spec.focusLetter === p.letter;
        const head = art('music-note', { tint: focus ? FOCUS : color });
        const hc = centreOf(head);
        head.position.sub(hc);
        grp.add(head);
        const glowMat = sm(new THREE.SpriteMaterial({ map: staffGlowTex, color: LIT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        const glow = new THREE.Sprite(glowMat);
        glow.scale.setScalar(1.6);
        grp.add(glow);
        add(grp);
        // Ledger lines below (C4) or above (A5 and up).
        for (let s = -2; s >= step; s -= 2) {
          const led = art('music-ledger');
          const lc = centreOf(led);
          led.position.set(x - lc.x, s * STAFF_STEP - lc.y, 0.02);
          add(led);
        }
        for (let s = 10; s <= step; s += 2) {
          const led = art('music-ledger');
          const lc = centreOf(led);
          led.position.set(x - lc.x, s * STAFF_STEP - lc.y, 0.02);
          add(led);
        }
        let label: THREE_T.Sprite | null = null;
        if (!spec.hideNames) {
          const tex = labelTex(THREE, { lines: [pcName(p)], fg: focus ? '#fbbf24' : '#ffffff', fontFamily: font, w: 128, h: 96, big: 64 });
          staffLabelTexs.push(tex);
          label = new THREE.Sprite(sm(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })));
          label.scale.set(0.8, 0.6, 1);
          label.position.set(x, -1.15, 0.05);
          add(label);
        }
        staffNotes.push({ group: grp, head, glow, glowMat, label, bump: 0 });
      });
      right = L.noteX(7) + 0.8;
    }
    staffWidth = Math.min(STAFF_LEN, Math.max(6, right));
    // Panel behind: the visible part of the staff plus a margin.
    const named = spec.showScale && !spec.mystery && !spec.hideNames;
    panel.w = staffWidth + 0.7;
    panel.h = named ? 5.9 : 4.9;
    panel.cy = named ? 0.9 : 1.35;
    staffPanel.scale.set(panel.w, panel.h, 1);
    staffPanel.position.set(staffWidth / 2, panel.cy, -0.05);
    staffInner.position.set(-staffWidth / 2, -panel.cy, 0);
    staffPanelMat.map?.dispose();
    staffPanelMat.map = panelTex(THREE, panel.w, panel.h);
    staffPanelMat.needsUpdate = true;
    // Hide the rods past the right edge in the short (mystery) staff.
    staffLines.scale.x = staffWidth / STAFF_LEN;
    layout();
  }

  // ---- the piano ----
  const pianoGroup = new THREE.Group(); // placed on screen
  const pianoTilt = new THREE.Group(); // tipped toward the camera
  const pianoInner = new THREE.Group(); // keyboard frame, keys along x
  pianoGroup.add(pianoTilt);
  pianoTilt.add(pianoInner);
  stageRoot.add(pianoGroup);
  {
    const bed = art('music-piano-bed');
    box.setFromObject(bed);
    // The bed's front lip sits just in front of the white keys' fronts.
    bed.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, WHITE_LEN / 2 + 0.25 - box.max.z);
    pianoInner.add(bed);
  }

  interface PianoKeyObj {
    midi: number;
    black: boolean;
    pivot: THREE_T.Group;
    mats: THREE_T.MeshStandardMaterial[];
    label: THREE_T.Mesh;
    labelMat: THREE_T.MeshBasicMaterial;
    labelKey: string;
    press: number; // 0..1, decays
    lit: boolean;
    hint: boolean;
    focus: boolean;
    flash: number;
  }
  const keyLabelGeo = g(new THREE.PlaneGeometry(1, 1));
  const keyObjs: PianoKeyObj[] = KEYS.map((k) => {
    const black = k.black;
    const pivot = new THREE.Group();
    const len = black ? BLACK_LEN : WHITE_LEN;
    // Hinge at the back of the key, like a real one.
    pivot.position.set(keyX(k.midi), black ? BLACK_BASE : BED_FLOOR, -WHITE_LEN / 2);
    const mesh = art(black ? 'music-key-black' : 'music-key-white');
    box.setFromObject(mesh);
    mesh.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -box.min.z);
    // Own materials, so one key can glow without the rest.
    const own: THREE_T.MeshStandardMaterial[] = [];
    mesh.traverse((o) => {
      const mesh2 = o as THREE_T.Mesh;
      if (mesh2.isMesh && !Array.isArray(mesh2.material)) {
        const c = cloneMaterial(mesh2.material as THREE_T.MeshStandardMaterial);
        c.emissive = new THREE.Color(0x000000);
        c.emissiveIntensity = 1;
        mesh2.material = c;
        own.push(c);
        mats.push(c);
        mesh2.userData.midi = k.midi;
      }
    });
    pivot.add(mesh);
    const labelMat = m(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
    const label = new THREE.Mesh(keyLabelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    const top = black ? BLACK_H : WHITE_H;
    if (black) {
      label.scale.set(0.62, 0.8, 1);
      label.position.set(0, top + 0.012, len - 0.55);
    } else {
      label.scale.set(0.9, 1.0, 1);
      label.position.set(0, top + 0.012, len - 0.75);
    }
    label.userData.midi = k.midi;
    pivot.add(label);
    pianoInner.add(pivot);
    return { midi: k.midi, black, pivot, mats: own, label, labelMat, labelKey: '', press: 0, lit: false, hint: false, focus: false, flash: 0 };
  });
  const keyByMidi = new Map(keyObjs.map((k) => [k.midi, k]));
  // The keyboard's extent, measured once while nothing above it is moved.
  const pianoBounds = (() => {
    box.setFromObject(pianoInner);
    return { y0: box.min.y, y1: box.max.y + 0.3, z0: box.min.z, z1: box.max.z };
  })();
  const keyLabelTexs = new Map<number, THREE_T.Texture>();

  // Answer bubbles and hint arrows float over keys.
  interface Floater { sprite: THREE_T.Sprite; mat: THREE_T.SpriteMaterial; midi: number; phase: number }
  let bubbles: Floater[] = [];
  const bubbleTexs: THREE_T.Texture[] = [];
  const arrowTex = t(labelTex(THREE, { lines: ['👇'], fontFamily: '"Segoe UI Emoji","Apple Color Emoji",sans-serif', w: 128, h: 128, big: 96 }));
  const arrows: Floater[] = [];
  for (let i = 0; i < 4; i++) {
    const mat = m(new THREE.SpriteMaterial({ map: arrowTex, transparent: true, depthWrite: false, depthTest: false }));
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    sprite.scale.setScalar(1.1);
    pianoInner.add(sprite);
    arrows.push({ sprite, mat, midi: 0, phase: i });
  }

  // Music notes that float up from a sounding key.
  const noteTex = t(labelTex(THREE, { lines: ['♪'], fg: '#ffffff', fontFamily: font, w: 128, h: 128, big: 110 }));
  const notePuffs: { sprite: THREE_T.Sprite; mat: THREE_T.SpriteMaterial; t: number; vx: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const mat = m(new THREE.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    const sprite = new THREE.Sprite(mat);
    sprite.visible = false;
    pianoInner.add(sprite);
    notePuffs.push({ sprite, mat, t: -1, vx: 0 });
  }
  let puffNext = 0;
  function puff(midi: number, color: number): void {
    const p = notePuffs[puffNext++ % notePuffs.length];
    p.t = 0;
    p.vx = (Math.random() - 0.5) * 0.6;
    p.mat.color.setHex(color);
    p.sprite.position.set(keyX(midi), 1.2, isBlack(midi) ? -1.2 : 0.4);
    p.sprite.visible = true;
  }

  let pianoSpec: PianoSpec | null = null;
  function setPiano(spec: PianoSpec): void {
    pianoSpec = spec;
    const k = keyOf(spec.keyId);
    const dot = hex(PLANET_COLORS[spec.keyId]);
    for (const ko of keyObjs) {
      const spelled = spellInKey(k, ko.midi);
      const inScale = spelled !== null;
      const names = spec.hideNames ? [] : inScale ? [pcName(spelled)] : keyLabels(ko.midi);
      const isC = !ko.black && ko.midi % 12 === 0;
      const lines = names.length === 0 ? [''] : ko.black ? names : isC && inScale ? [`${names[0]}${Math.floor(ko.midi / 12) - 1}`] : names;
      const showDot = spec.showScale && inScale;
      const labelKey = `${lines.join('/')}|${showDot ? dot : ''}`;
      if (labelKey !== ko.labelKey) {
        ko.labelKey = labelKey;
        keyLabelTexs.get(ko.midi)?.dispose();
        const tex = labelTex(THREE, {
          lines,
          fg: ko.black ? '#ffffff' : '#27272a',
          dot: showDot ? dot : null,
          fontFamily: font,
          w: 128,
          h: 144,
          big: ko.black ? (lines.length > 1 ? 34 : 44) : 54,
          small: 34,
        });
        keyLabelTexs.set(ko.midi, tex);
        ko.labelMat.map = tex;
        ko.labelMat.needsUpdate = true;
      }
      ko.hint = spec.hintPcs.includes(ko.midi % 12);
      ko.focus = spec.focusPc !== null && ko.midi % 12 === spec.focusPc;
    }
    // Hint arrows: one per hinted key in view.
    const hinted = keyObjs.filter((ko) => ko.hint).slice(0, arrows.length);
    arrows.forEach((a, i) => {
      const ko = hinted[i];
      a.sprite.visible = !!ko;
      if (ko) a.midi = ko.midi;
    });
    // Answer bubbles.
    for (const b of bubbles) pianoInner.remove(b.sprite);
    for (const x of bubbleTexs.splice(0)) x.dispose();
    for (const b of bubbles) b.mat.dispose();
    bubbles = spec.choices.map((midi, i) => {
      const spelled = spellInKey(k, midi);
      const tex = bubbleTex(THREE, spelled ? pcName(spelled) : keyLabels(midi)[0], hex(PLANET_COLORS[spec.keyId]), font);
      bubbleTexs.push(tex);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(0.98);
      sprite.userData.midi = midi;
      sprite.renderOrder = 4;
      pianoInner.add(sprite);
      return { sprite, mat, midi, phase: i * 1.3 };
    });
    layout();
  }

  // ---------- confetti (stage space) ----------
  const confetti = (() => {
    const count = 160;
    const geo = g(new THREE.BufferGeometry());
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = m(new THREE.PointsMaterial({ size: 0.32, map: spark, vertexColors: true, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 10;
    stageRoot.add(pts);
    return { pts, geo, mat, pos, col, vel, count, t: -1 };
  })();
  function celebrate(): void {
    if (reduced) return;
    // From the focused planet's place on screen.
    const p = planets[view.planet];
    v3.copy(p.group.position).project(camera);
    const d = 8;
    const hh = halfH(d);
    const cx = v3.x * hh * camera.aspect;
    const cy = v3.y * hh;
    const c = new THREE.Color();
    for (let i = 0; i < confetti.count; i++) {
      confetti.pos.set([cx, cy, -d], i * 3);
      const a = Math.random() * Math.PI * 2;
      const s = 2.5 + Math.random() * 4;
      confetti.vel.set([Math.cos(a) * s, Math.sin(a) * s + 2.5, (Math.random() - 0.5) * 2], i * 3);
      c.setHex(SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]);
      confetti.col.set([c.r, c.g, c.b], i * 3);
    }
    confetti.geo.attributes.color.needsUpdate = true;
    confetti.t = 0;
  }

  // ---------- layout ----------
  let insets: Insets = { top: 0, bottom: 0, planetRow: 0 };
  const size = { w: 1, h: 1 };
  /** The stage's two pieces, where they sit and how big, by view. */
  const place = {
    staff: { y: 0, s: 1, shown: 0, target: 0 },
    piano: { y: 0, s: 1, shown: 0, target: 0, shift: 0 },
  };

  function fracs(): { top: number; bottom: number } {
    return { top: Math.min(0.6, insets.top / size.h), bottom: Math.min(0.3, insets.bottom / size.h) };
  }

  /** Planet view bands, top to bottom: planet, staff, piano. */
  function planetBands(): { y: number; h: number }[] {
    const { top, bottom } = fracs();
    const free = Math.max(1, size.h * (1 - top - bottom));
    const row = insets.planetRow > 0 ? Math.min(0.42, Math.max(0.2, insets.planetRow / free)) : 0.28;
    const rest = 1 - row;
    return ndcBands(top, bottom, [row, rest * 0.4, rest * 0.6]);
  }

  function layout(): void {
    const aspect = size.w / size.h;
    const { top, bottom } = fracs();
    const flat = (w: number, h: number): { x: number; y: number; z: number }[] =>
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => ({ x: (sx * w) / 2, y: (sy * h) / 2, z: 0 }));
    if (view.mode === 'planet') {
      const [, staffBand, pianoBand] = planetBands();
      const sf = fitInBand(flat(panel.w, panel.h), STAGE_DEPTH, aspect, staffBand.y, staffBand.h * 0.94, 1.9);
      place.staff.s = sf.s;
      place.staff.y = sf.y;
      // Piano: the window of keys that fits fingers, tipped toward the kid.
      const narrow = size.w / WHITE_COUNT < MIN_WHITE_PX;
      const win = pianoWindow(pianoSpec?.keyId ?? 'C', narrow);
      const mid = (WHITE_W * (win.lo + win.hi)) / 2 - (WHITE_W * (WHITE_COUNT - 1)) / 2;
      const pw = (win.hi - win.lo + 1) * WHITE_W + 0.4;
      const cos = Math.cos(PIANO_TILT);
      const sin = Math.sin(PIANO_TILT);
      const corners: { x: number; y: number; z: number }[] = [];
      for (const x of [-pw / 2, pw / 2]) for (const y of [pianoBounds.y0, pianoBounds.y1]) for (const z of [pianoBounds.z0, pianoBounds.z1]) {
        corners.push({ x, y: y * cos - z * sin, z: y * sin + z * cos });
      }
      const pf = fitInBand(corners, STAGE_DEPTH, aspect, pianoBand.y, pianoBand.h, 1.99, 'bottom');
      place.piano.s = pf.s;
      place.piano.y = pf.y;
      place.piano.shift = -mid;
    } else {
      // Space: the mystery staff, if any, at the top of the free band.
      const [staffBand] = ndcBands(top, bottom, [MATCH_STAFF, 1 - MATCH_STAFF]);
      const sf = fitInBand(flat(panel.w, panel.h), STAGE_DEPTH, aspect, staffBand.y, staffBand.h * 0.9, 1.6);
      place.staff.s = sf.s;
      place.staff.y = sf.y;
    }
    place.staff.target = (view.mode === 'planet' || (view.mode === 'space' && view.staff)) && staffSpec ? 1 : 0;
    place.piano.target = view.mode === 'planet' && pianoSpec ? 1 : 0;
  }

  function resize(): void {
    size.w = container.clientWidth || 1;
    size.h = container.clientHeight || 1;
    renderer.setSize(size.w, size.h, false);
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    {
      const { top, bottom } = fracs();
      const dist = spaceFit(camera.aspect, top, bottom).dist;
      // A phone's circle is small, so its labels give way to the planets.
      const px = size.w < 500 ? LABEL_PX * 0.8 : LABEL_PX;
      labelW = Math.min(2.6, Math.max(1.2, (px * 2 * halfH(dist)) / size.h));
    }
    const lw = labelWidth();
    for (const p of planets) p.label.scale.set(lw, (lw * p.label.scale.y) / (p.label.scale.x || 1), 1);
    layout();
  }
  resize();

  // ---------- camera poses + flight ----------
  function poseFor(v: View): CameraPose {
    const aspect = size.w / size.h;
    const { top, bottom } = fracs();
    if (v.mode === 'space') {
      const reserve = v.staff ? MATCH_STAFF * (1 - top - bottom) : 0;
      const fit = spaceFit(aspect, top + reserve, bottom);
      return spaceCamera(fit.dist, fit.ndcY);
    }
    const [band] = planetBands();
    const radius = PLANET_R * SCALE.focus;
    const ndcR = Math.min(band.h * 0.62, 0.36 * aspect);
    return planetCamera(planetPos(v.planet), radius, band.y + 0.02, ndcR);
  }

  const qFrom = new THREE.Quaternion();
  const qTo = new THREE.Quaternion();
  const eul = new THREE.Euler(0, 0, 0, 'YXZ');
  function quatOf(p: CameraPose, out: THREE_T.Quaternion): THREE_T.Quaternion {
    eul.set(-p.pitch, p.yaw, 0, 'YXZ');
    return out.setFromEuler(eul);
  }
  let flight: { from: CameraPose; fromQ: THREE_T.Quaternion; t: number; dur: number; lift: number; done: () => void } | null = null;

  function applyPose(p: CameraPose): void {
    camera.position.set(p.x, p.y, p.z);
    camera.quaternion.copy(quatOf(p, qTo));
  }

  function setView(v: View): Promise<void> {
    const prev = view;
    view = v;
    targetScales();
    layout();
    const same = prev.mode === v.mode && prev.planet === v.planet;
    if (reduced || same) {
      flight?.done();
      flight = null;
      applyPose(poseFor(v));
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      flight?.done();
      const from: CameraPose = { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: 0, pitch: 0 };
      // Planet to planet swoops up through space; into or out of a planet is
      // a straight dive.
      const hop = prev.mode === 'planet' && v.mode === 'planet';
      flight = { from, fromQ: camera.quaternion.clone(), t: 0, dur: hop ? 2.0 : 1.35, lift: hop ? 6 : 0, done: resolve };
      flying = true;
    });
  }

  function travel(from: number, to: number): Promise<void> {
    return (async () => {
      await setView({ mode: 'space', planet: from, staff: false });
      if (!reduced) {
        let a0 = planetAngle(from);
        let a1 = planetAngle(to);
        if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
        if (a0 - a1 > Math.PI) a0 -= Math.PI * 2;
        await new Promise<void>((resolve) => { rocketArc = { a0, a1, t: 0, dur: 1.8, done: resolve }; });
      }
      view = { mode: 'space', planet: to, staff: false };
      targetScales();
      pulse(to);
      await setView({ mode: 'planet', planet: to });
    })();
  }

  applyPose(poseFor(view));

  // ---------- input ----------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function onPointerDown(e: PointerEvent): void {
    if (flying) return;
    const r = canvasEl.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (view.mode === 'planet' && place.piano.shown > 0.9) {
      // Bubbles first (they float over keys), then keys.
      const hitB = ray.intersectObjects(bubbles.map((b) => b.sprite), false)[0];
      const hitK = hitB ?? ray.intersectObjects(keyObjs.map((k) => k.pivot), true)[0];
      const midi = hitK?.object.userData.midi as number | undefined;
      if (midi !== undefined) {
        e.preventDefault();
        press(midi);
        cb.onKeyDown(midi);
        return;
      }
    }
    if (view.mode === 'space') {
      const hits = ray.intersectObjects(planets.map((p) => p.hit), false);
      const i = hits[0]?.object.userData.planet as number | undefined;
      if (i !== undefined) {
        e.preventDefault();
        cb.onPlanetTap(i);
      }
    }
  }
  canvasEl.addEventListener('pointerdown', onPointerDown);

  function press(midi: number): void {
    const ko = keyByMidi.get(midi);
    if (!ko) return;
    ko.press = 1;
    ko.flash = 1;
    puff(midi, pianoSpec ? PLANET_COLORS[pianoSpec.keyId] : 0xffffff);
  }

  let litScale: number | null = null;
  function setLit(midis: readonly number[], scaleIndex: number | null): void {
    for (const ko of keyObjs) {
      const on = midis.includes(ko.midi);
      if (on && !ko.lit) puff(ko.midi, LIT);
      ko.lit = on;
    }
    if (scaleIndex !== null && scaleIndex !== litScale && staffNotes[scaleIndex]) staffNotes[scaleIndex].bump = 1;
    litScale = scaleIndex;
  }

  function pulse(i: number): void { planets[i].pulseT = 0; }
  function shake(i: number): void { planets[i].shakeT = 0; }

  // ---------- frame loop ----------
  let raf = 0;
  let disposed = false;
  let last = performance.now();
  let clock = 0;
  const em = new THREE.Color();
  const qa = new THREE.Quaternion();
  const camUp = new THREE.Vector3();

  function tick(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    clock += dt;
    const still = reduced;

    // -- camera --
    if (flight) {
      flight.t += dt / flight.dur;
      const k = Math.min(1, flight.t);
      const e = easeInOut(k);
      const to = poseFor(view);
      camera.position.set(
        flight.from.x + (to.x - flight.from.x) * e,
        flight.from.y + (to.y - flight.from.y) * e + Math.sin(Math.PI * e) * flight.lift,
        flight.from.z + (to.z - flight.from.z) * e,
      );
      qFrom.copy(flight.fromQ);
      camera.quaternion.slerpQuaternions(qFrom, quatOf(to, qTo), e);
      if (k >= 1) {
        const done = flight.done;
        flight = null;
        flying = false;
        done();
      }
    } else if (!rocketArc) {
      // Ease toward the pose so a resize or an inset change glides.
      const to = poseFor(view);
      const f = still ? 1 : Math.min(1, dt * 6);
      camera.position.x += (to.x - camera.position.x) * f;
      camera.position.y += (to.y - camera.position.y) * f;
      camera.position.z += (to.z - camera.position.z) * f;
      camera.quaternion.slerp(quatOf(to, qa), f);
      flying = false;
    }
    if (rocketArc) flying = true;
    camera.updateMatrixWorld();

    // -- planets --
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    planets.forEach((p, i) => {
      if (still) p.scale = p.targetScale;
      else p.scale += (p.targetScale - p.scale) * Math.min(1, dt * 7);
      let s = p.scale;
      if (p.pulseT >= 0) {
        p.pulseT += dt;
        const k = p.pulseT / 0.8;
        if (k >= 1) p.pulseT = -1;
        else if (!still) s *= 1 + Math.sin(k * Math.PI) * 0.3 * (1 - k);
      }
      let sx = 0;
      if (p.shakeT >= 0) {
        p.shakeT += dt;
        const k = p.shakeT / 0.5;
        if (k >= 1) p.shakeT = -1;
        else sx = Math.sin(k * Math.PI * 6) * 0.18 * (1 - k);
      }
      p.group.scale.setScalar(s);
      const bob = still ? 0 : Math.sin(clock * 1.2 + i * 0.9) * 0.08;
      p.group.position.set(p.base.x + sx, p.base.y + bob, p.base.z);
      if (!still) p.spin.rotation.y += dt * (i === view.planet ? 0.45 : 0.25);
      // Label under the planet, facing the camera, only in space view.
      p.label.visible = view.mode === 'space' && !flight;
      // Just under the planet as the camera sees it.
      p.label.position.copy(p.group.position).addScaledVector(camUp, -(PLANET_R * s + 0.1));
      p.labelMat.opacity = view.mode === 'space' ? 1 : 0.55;
    });
    for (const sp of signposts) sp.visible = view.mode === 'space';
    if (!still) {
      sun.rotation.y += dt * 0.15;
      stars.rotation.y += dt * 0.004;
    }

    // -- rocket --
    {
      const pl = planets[view.planet];
      let tx: number, ty: number, tz: number;
      let tilt = 0;
      let heading = 0;
      if (rocketArc) {
        rocketArc.t += dt / rocketArc.dur;
        const k = Math.min(1, rocketArc.t);
        const e = easeInOut(k);
        const a = rocketArc.a0 + (rocketArc.a1 - rocketArc.a0) * e;
        const r = ORBIT_R + 0.9;
        tx = Math.cos(a) * r;
        tz = -Math.sin(a) * r;
        ty = 0.8 + Math.sin(Math.PI * k) * 1.2;
        heading = Math.atan2(-Math.sin(a) * Math.sign(rocketArc.a1 - rocketArc.a0), -Math.cos(a) * Math.sign(rocketArc.a1 - rocketArc.a0));
        tilt = Math.PI / 2.4;
        flame.mat.opacity = 0.95;
        // Trail sparkles.
        const tp = trail.geo.attributes.position as THREE_T.BufferAttribute;
        tp.setXYZ(trail.head++ % trail.count, tx, ty - 0.1, tz);
        tp.needsUpdate = true;
        trail.mat.opacity = 0.9;
        rocket.position.set(tx, ty, tz);
        if (k >= 1) {
          const done = rocketArc.done;
          rocketArc = null;
          done();
        }
      } else {
        const ps = pl.group.scale.x;
        if (view.mode === 'planet') {
          // Parked on top of the focused planet.
          tx = pl.group.position.x;
          ty = pl.group.position.y + PLANET_R * ps * 0.92;
          tz = pl.group.position.z;
        } else {
          // Hovering just outside the selected planet.
          const len = Math.hypot(pl.base.x, pl.base.z) || 1;
          tx = pl.base.x + (pl.base.x / len) * (0.95 * ps);
          tz = pl.base.z + (pl.base.z / len) * (0.95 * ps);
          ty = 0.35 + (still ? 0 : Math.sin(clock * 2) * 0.1);
          tilt = 0.25;
        }
        flame.mat.opacity = Math.max(0, flame.mat.opacity - dt * 2);
        trail.mat.opacity = Math.max(0, trail.mat.opacity - dt * 0.8);
        const f = still ? 1 : Math.min(1, dt * 5);
        rocket.position.x += (tx - rocket.position.x) * f;
        rocket.position.y += (ty - rocket.position.y) * f;
        rocket.position.z += (tz - rocket.position.z) * f;
        heading = Math.atan2(camera.position.x - rocket.position.x, camera.position.z - rocket.position.z);
      }
      rocket.rotation.set(0, 0, 0);
      rocket.rotateY(heading);
      rocket.rotateX(tilt);
      rocket.scale.setScalar(view.mode === 'planet' && !rocketArc ? 0.55 : 0.8);
    }

    if (link) linkMat.opacity = still ? 0.95 : 0.7 + Math.sin(clock * 4) * 0.25;

    // -- stage --
    stageRoot.position.copy(camera.position);
    stageRoot.quaternion.copy(camera.quaternion);
    for (const part of [place.staff, place.piano]) {
      const want = flight && view.mode === 'planet' ? 0 : part.target;
      if (still) part.shown = want;
      else part.shown += Math.sign(want - part.shown) * Math.min(Math.abs(want - part.shown), dt * 3.2);
    }
    {
      const k = place.staff.shown;
      const e = k <= 0 ? 0 : easeOutBack(k);
      staffGroup.visible = k > 0.001;
      staffGroup.position.set(0, place.staff.y, -STAGE_DEPTH);
      staffGroup.scale.setScalar(Math.max(0.001, place.staff.s * e));
    }
    {
      const k = place.piano.shown;
      const e = k <= 0 ? 0 : easeOutBack(k);
      pianoGroup.visible = k > 0.001;
      pianoGroup.position.set(0, place.piano.y - (1 - k) * 8, -STAGE_DEPTH);
      pianoGroup.scale.setScalar(place.piano.s);
      pianoTilt.rotation.x = PIANO_TILT - (1 - e) * 0.5;
      // Slide the keyboard so the window of keys is centred.
      const f = still ? 1 : Math.min(1, dt * 6);
      pianoInner.position.x += (place.piano.shift - pianoInner.position.x) * f;
    }

    // Keys: dip when pressed or sounding, glow by state.
    const hintGlow = 0.35 + 0.35 * Math.sin(clock * 6);
    const pressCol = pianoSpec ? PLANET_COLORS[pianoSpec.keyId] : 0xffffff;
    for (const ko of keyObjs) {
      ko.press = Math.max(0, ko.press - dt * 5);
      ko.flash = Math.max(0, ko.flash - dt * 3);
      const down = Math.max(ko.press, ko.lit ? 1 : 0);
      ko.pivot.rotation.x = down * 0.07;
      let intensity = 0;
      if (ko.lit) { em.setHex(LIT); intensity = 0.55; }
      else if (ko.flash > 0) { em.setHex(pressCol); intensity = 0.6 * ko.flash; }
      else if (ko.hint) { em.setHex(HINT); intensity = still ? 0.5 : hintGlow; }
      else if (ko.focus) { em.setHex(FOCUS); intensity = 0.22; }
      for (const mm of ko.mats) {
        mm.emissive.copy(em);
        mm.emissiveIntensity = intensity;
      }
    }
    for (const a of arrows) {
      if (!a.sprite.visible) continue;
      const black = isBlack(a.midi);
      a.sprite.position.set(keyX(a.midi), (black ? 2.0 : 1.7) + (still ? 0 : Math.sin(clock * 5 + a.phase) * 0.18), black ? -0.9 : 0.6);
    }
    for (const b of bubbles) {
      const black = isBlack(b.midi);
      b.sprite.position.set(keyX(b.midi), (black ? 2.6 : 2.2) + (still ? 0 : Math.sin(clock * 2.4 + b.phase) * 0.14), black ? -0.9 : 0.4);
    }
    for (const p of notePuffs) {
      if (p.t < 0) continue;
      p.t += dt;
      const k = p.t / 1.1;
      if (k >= 1) { p.t = -1; p.sprite.visible = false; continue; }
      p.sprite.position.y += dt * 2.4;
      p.sprite.position.x += dt * p.vx;
      p.sprite.scale.setScalar(0.7 + k * 0.4);
      p.mat.opacity = still ? 0 : 1 - k;
    }

    // Staff notes: the sounding one glows and hops.
    staffNotes.forEach((n, i) => {
      const on = litScale === i;
      n.glowMat.opacity += ((on ? 0.9 : 0) - n.glowMat.opacity) * Math.min(1, dt * 12);
      n.bump = Math.max(0, n.bump - dt * 3);
      const s = 1 + (on ? 0.25 : 0) + (still ? 0 : Math.sin(n.bump * Math.PI) * 0.25);
      n.head.scale.setScalar(s);
    });

    // Confetti.
    if (confetti.t >= 0) {
      confetti.t += dt;
      const k = confetti.t / 1.8;
      if (k >= 1) {
        confetti.t = -1;
        confetti.mat.opacity = 0;
      } else {
        for (let i = 0; i < confetti.count; i++) {
          confetti.vel[i * 3 + 1] -= 6 * dt;
          confetti.pos[i * 3] += confetti.vel[i * 3] * dt;
          confetti.pos[i * 3 + 1] += confetti.vel[i * 3 + 1] * dt;
          confetti.pos[i * 3 + 2] += confetti.vel[i * 3 + 2] * dt;
        }
        confetti.geo.attributes.position.needsUpdate = true;
        confetti.mat.opacity = 1 - k * k;
      }
    }

    renderer.clear();
    renderer.render(world, camera);
    renderer.clearDepth();
    renderer.render(stage, camera);
  }
  raf = requestAnimationFrame(tick);

  return {
    setLooks(l) { looks = l; applyLooks(); },
    setView,
    travel,
    setStaff,
    setPiano,
    setLit,
    flashKey: press,
    setLink,
    pulse,
    shake,
    celebrate,
    setInsets(i) {
      if (i.top === insets.top && i.bottom === insets.bottom && i.planetRow === insets.planetRow) return;
      insets = i;
      resize();
    },
    setReducedMotion(on) { reduced = on; targetScales(); },
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      setLink(null);
      for (const p of planets) p.labelTex?.dispose();
      for (const x of keyLabelTexs.values()) x.dispose();
      for (const x of staffLabelTexs) x.dispose();
      for (const x of bubbleTexs) x.dispose();
      for (const x of staffMats) x.dispose();
      for (const b of bubbles) b.mat.dispose();
      clefMat.map?.dispose();
      staffPanelMat.map?.dispose();
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
      for (const x of texs) x.dispose();
      lights.envRT.dispose();
      registry.dispose();
      renderer.dispose();
      canvasEl.remove();
    },
  };
}

/** Which CIRCLE index a key is. */
export function planetIndex(id: KeyId): number {
  return CIRCLE.indexOf(id);
}

/** Pitch class of a key's tonic: the piano's hint for "home". */
export function tonicPc(id: KeyId): number {
  return pcOf(keyOf(id).tonic);
}

