// Musical Planets engine — the circle of fifths as twelve candy planets.
//
// What lives here: the scene, the twelve planets on one orbit ring, the
// selection glow, a highlighted arc between two neighbours, gentle idle motion
// and a celebration pulse. What does NOT: text and input. Every planet's label
// and tap target is a DOM button the host floats over the planet using the
// screen positions this engine reports each frame (onFrame). That keeps the
// planets focusable, labelled for a screen reader, 56px to a finger, and
// identical in the no-WebGL fallback, where the same buttons sit on an SVG
// ring instead of a canvas.
//
// The camera never moves. The PRD forbids learning that depends on navigating
// a moving camera, and the keyboard and staff are the real lesson; the circle
// is the map. Only the planets bob and spin, and under reduced motion they
// hold still.
//
// No runtime `three` import — the namespace arrives as an argument, like every
// other 3D game here.

import type * as THREE_T from 'three';
import { candyMat, frostingMat, glowSprite } from '@/lib/town/three/materials';
import { SPRINKLE_COLORS } from '@/lib/games/theme/palette';
import { planetAngle } from './angle';

export type ThreeNS = typeof THREE_T;

export interface PlanetLook {
  color: number;
  /** A lesson planet (C, G, F) once unlocked. */
  open: boolean;
}

export interface PlanetsEngineProps {
  looks: readonly PlanetLook[];
  reducedMotion: boolean;
}

export interface ScreenPos {
  x: number;
  y: number;
  /** On-screen radius of the planet, px. */
  r: number;
}

export interface PlanetsEngine {
  setSelected(index: number): void;
  setLooks(looks: readonly PlanetLook[]): void;
  /** Light the orbit between two neighbouring planets, or clear it. */
  setLink(link: readonly [number, number] | null): void;
  /** A short bounce on one planet — success. */
  pulse(index: number): void;
  setReducedMotion(on: boolean): void;
  resize(): void;
  dispose(): void;
}

const N = 12;
const ORBIT_R = 3.7;
const PLANET_R = 0.5;
const LOCKED_GREY = 0xd8d4e6;

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function createPlanetsEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: PlanetsEngineProps,
  cb: { onFrame: (positions: ScreenPos[]) => void },
): PlanetsEngine {
  let reduced = props.reducedMotion;
  const geos: THREE_T.BufferGeometry[] = [];
  const mats: THREE_T.Material[] = [];
  const texs: THREE_T.Texture[] = [];
  const g = <T extends THREE_T.BufferGeometry>(x: T): T => { geos.push(x); return x; };
  const m = <T extends THREE_T.Material>(x: T): T => { mats.push(x); return x; };

  // ---------- renderer: transparent, so the page's sky gradient shows ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.pointerEvents = 'none';
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  // A slight look up from below the ring's plane: depth without tilting the
  // map so far that the bottom planets crowd the top ones.
  camera.position.set(0, -2.4, 12.5);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff7ed, 0xc4b5fd, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-4, 6, 8);
  scene.add(sun);

  // ---------- the orbit ring ----------
  const orbitMat = m(frostingMat(THREE, 0xfff4e2));
  orbitMat.transparent = true;
  orbitMat.opacity = 0.75;
  const orbit = new THREE.Mesh(g(new THREE.TorusGeometry(ORBIT_R, 0.035, 8, 160)), orbitMat);
  scene.add(orbit);

  // ---------- the centre: a frosted star ----------
  const core = new THREE.Mesh(g(new THREE.SphereGeometry(0.7, 32, 24)), m(frostingMat(THREE, 0xfde68a)));
  scene.add(core);
  const coreGlow = glowSprite(THREE, 0xffe6a8, 3.6, 0.65);
  texs.push(coreGlow.tex); mats.push(coreGlow.mat);
  scene.add(coreGlow.sprite);

  // ---------- sprinkle stars ----------
  {
    const count = 140;
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = Math.sin(i * 91.7) * 43758.5453;
      const b = Math.sin(i * 12.9) * 24634.6345;
      const u = a - Math.floor(a);
      const v = b - Math.floor(b);
      pos[i * 3] = (u - 0.5) * 22;
      pos[i * 3 + 1] = (v - 0.5) * 14;
      pos[i * 3 + 2] = -3 - ((u * 7 + v * 3) % 4);
      c.setHex(SPRINKLE_COLORS[i % SPRINKLE_COLORS.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = g(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(geo, m(new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.9 }))));
  }

  // ---------- planets ----------
  interface Planet {
    group: THREE_T.Group;
    ball: THREE_T.Mesh;
    mat: THREE_T.MeshStandardMaterial;
    band: THREE_T.Mesh;
    ring: THREE_T.Mesh;
    glow: THREE_T.Sprite;
    glowMat: THREE_T.SpriteMaterial;
    base: THREE_T.Vector3;
    scale: number;
    targetScale: number;
    pulseT: number;
  }
  const ballGeo = g(new THREE.SphereGeometry(PLANET_R, 32, 24));
  const bandGeo = g(new THREE.TorusGeometry(PLANET_R * 1.0, 0.07, 10, 48));
  const ringGeo = g(new THREE.TorusGeometry(PLANET_R * 1.55, 0.05, 8, 64));
  const bandMat = m(frostingMat(THREE, 0xffffff));
  const ringMat = m(frostingMat(THREE, 0xfff4e2));

  const planets: Planet[] = [];
  for (let i = 0; i < N; i++) {
    const a = planetAngle(i);
    const group = new THREE.Group();
    const base = new THREE.Vector3(Math.cos(a) * ORBIT_R, Math.sin(a) * ORBIT_R, 0);
    group.position.copy(base);
    const mat = m(candyMat(THREE, 0xffffff));
    const ball = new THREE.Mesh(ballGeo, mat);
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.rotation.x = Math.PI / 2 - 0.35;
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 - 0.5;
    ring.visible = false;
    const gs = glowSprite(THREE, 0xffffff, 2.6, 0);
    texs.push(gs.tex); mats.push(gs.mat);
    group.add(gs.sprite, ball, band, ring);
    scene.add(group);
    planets.push({ group, ball, mat, band, ring, glow: gs.sprite, glowMat: gs.mat, base, scale: 1, targetScale: 1, pulseT: -1 });
  }

  let selected = 0;
  let looks = props.looks;
  function applyLooks(): void {
    planets.forEach((p, i) => {
      const look = looks[i];
      const col = look.open ? look.color : mix(look.color, LOCKED_GREY, 0.62);
      p.mat.color.setHex(col);
      p.mat.emissive.setHex(col);
      p.mat.emissiveIntensity = look.open ? 0.14 : 0.04;
      p.targetScale = i === selected ? 1.45 : look.open ? 1.08 : 0.78;
      p.ring.visible = i === selected;
      p.glowMat.color.setHex(look.color);
      p.glowMat.opacity = i === selected ? 0.75 : 0;
      if (reduced) p.scale = p.targetScale;
    });
  }
  applyLooks();

  // ---------- the lit arc between two neighbours ----------
  let link: THREE_T.Mesh | null = null;
  const linkMat = m(new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.95 }));
  function setLink(l: readonly [number, number] | null): void {
    if (link) { scene.remove(link); link.geometry.dispose(); link = null; }
    if (!l) return;
    // The short way round between two neighbours.
    let a0 = planetAngle(l[0]);
    let a1 = planetAngle(l[1]);
    if (a1 - a0 > Math.PI) a1 -= Math.PI * 2;
    if (a0 - a1 > Math.PI) a0 -= Math.PI * 2;
    const pts: THREE_T.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const a = a0 + ((a1 - a0) * k) / 24;
      pts.push(new THREE.Vector3(Math.cos(a) * ORBIT_R, Math.sin(a) * ORBIT_R, 0.02));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    link = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.09, 8, false), linkMat);
    scene.add(link);
  }

  // ---------- size + projection ----------
  function resize(): void {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the ring plus a planet's width on the narrow axis.
    const half = ORBIT_R + 1.25;
    const dist = camera.position.length();
    const vNeeded = 2 * Math.atan(half / dist);
    const hNeeded = 2 * Math.atan(Math.tan(Math.atan(half / dist)) / camera.aspect);
    camera.fov = (Math.max(vNeeded, hNeeded) * 180) / Math.PI;
    camera.updateProjectionMatrix();
  }
  resize();

  const tmp = new THREE.Vector3();
  const edge = new THREE.Vector3();
  function project(): ScreenPos[] {
    const { w, h } = sizeOf();
    return planets.map((p) => {
      tmp.copy(p.group.position).project(camera);
      edge.copy(p.group.position);
      edge.x += PLANET_R * p.scale;
      edge.project(camera);
      return {
        x: (tmp.x * 0.5 + 0.5) * w,
        y: (-tmp.y * 0.5 + 0.5) * h,
        r: Math.abs(edge.x - tmp.x) * 0.5 * w,
      };
    });
  }

  // ---------- frame loop ----------
  let raf = 0;
  let disposed = false;
  let last = performance.now();
  let t = 0;
  function tick(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    if (!reduced) t += dt;

    planets.forEach((p, i) => {
      // Ease toward the target size; a pulse adds a springy overshoot.
      if (reduced) p.scale = p.targetScale;
      else p.scale += (p.targetScale - p.scale) * Math.min(1, dt * 9);
      let s = p.scale;
      if (p.pulseT >= 0) {
        p.pulseT += dt;
        const k = p.pulseT / 0.7;
        if (k >= 1) p.pulseT = -1;
        else if (!reduced) s *= 1 + Math.sin(k * Math.PI) * 0.28 * (1 - k);
      }
      p.group.scale.setScalar(s);
      p.group.position.set(p.base.x, p.base.y + (reduced ? 0 : Math.sin(t * 1.3 + i) * 0.06), p.base.z);
      if (!reduced) p.ball.rotation.y += dt * 0.5;
      if (i === selected && !reduced) p.ring.rotation.z += dt * 0.6;
    });
    if (!reduced) core.rotation.y += dt * 0.2;
    if (link) linkMat.opacity = reduced ? 0.95 : 0.75 + Math.sin(t * 4) * 0.2;

    renderer.render(scene, camera);
    cb.onFrame(project());
  }
  raf = requestAnimationFrame(tick);

  return {
    setSelected(i) { selected = i; applyLooks(); },
    setLooks(l) { looks = l; applyLooks(); },
    setLink,
    pulse(i) { planets[i].pulseT = 0; },
    setReducedMotion(on) { reduced = on; applyLooks(); },
    resize,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      setLink(null);
      for (const x of geos) x.dispose();
      for (const x of mats) x.dispose();
      for (const x of texs) x.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
