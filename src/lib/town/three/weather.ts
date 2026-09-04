// Town weather — pure visuals for the 3D Gamecakes City.
//
// This module owns the LOOK of weather and nothing else: it crossfades the sky
// background, the THREE.Fog, and the three shared lights toward per-state
// presets, drives one shared THREE.Points cloud of falling sprinkles/snow, a
// pastel rainbow, and a few drifting cotton-candy clouds. The engine owns the
// DIRECTOR (when to change) and the STORM gameplay (which land re-fogs/re-locks)
// — this module just renders whatever `setWeather(kind)` it's told.
//
// Cozy-diorama rules (from the creative director): warm/low-contrast, never
// dark or scary — overcast/storm DIM the sun but RAISE ambient so shadows go
// soft, never black; a storm sky is periwinkle, not grey. No bloom/Effect
// composer — additive glow sprites only. Everything respects reduced-motion and
// is disposed via the tracked sinks.
//
// No runtime `three` import — the namespace arrives as an argument.

import type * as THREE from 'three';
import type { ThreeNS } from './types';
import { glowSprite } from './materials';
import { SPRINKLE_COLORS, WATER, WORLD } from '@/lib/games/theme/palette';
import { WEATHER_TRANSITION_MS, PRECIP_RAMP_MS, type WeatherKind } from '@/lib/town/weather-config';

export interface Weather {
  group: THREE.Group;
  setWeather(kind: WeatherKind): void;
  getWeather(): WeatherKind;
  /** Per-frame. `focus` is the avatar's scene-unit position so precipitation
   *  follows the camera instead of covering the whole (mostly-off-screen) map. */
  update(dtMs: number, focus: { x: number; z: number }): void;
  dispose(): void;
}

interface Preset {
  bg: number;
  /** Skydome tint. The engine's gradient skydome fully surrounds the camera
   *  (it paints over scene.background every frame), so the dome material's
   *  color — which MULTIPLIES its baked vertex gradient — is the only knob
   *  that actually changes the visible sky. White = the baked sunny gradient;
   *  a pastel here washes the whole dome toward that weather's mood. */
  skyTint: number;
  fog: number;
  fogNear: number;
  fogFarMul: number; // relative to the captured clear far plane
  sun: number;
  hemi: number;
  amb: number;
  /** Precipitation, or null for none. `density` is a fraction of the cap. */
  precip: { density: number; colors: number[]; fall: number; windX: number; sway: number; size: number } | null;
  clouds: boolean; // drifting cotton-candy overcast puffs
  rainbow: boolean;
}

// Presets lerp FROM the captured clear snapshot (so `sunny` returns to the true
// baseline). Iron rule baked in: sun ≥ 0.62, amb ≥ 0.55, bg always light/warm.
const PRESETS: Record<Exclude<WeatherKind, 'sunny'>, Preset> = {
  overcast: {
    bg: WORLD.SKY_OVERCAST, skyTint: WORLD.SKY_OVERCAST, fog: 0xf0e2e8, fogNear: 15, fogFarMul: 0.82,
    sun: 0.66, hemi: 0.58, amb: 0.6, precip: null, clouds: true, rainbow: false,
  },
  shower: {
    bg: WORLD.SKY_SHOWER, skyTint: WORLD.SKY_SHOWER, fog: 0xe4e6ec, fogNear: 14, fogFarMul: 0.78,
    sun: 0.72, hemi: 0.55, amb: 0.58,
    precip: { density: 0.9, colors: [...SPRINKLE_COLORS, WATER.DROPLET], fall: 8, windX: 1.5, sway: 0.25, size: 0.14 },
    clouds: false, rainbow: false,
  },
  snow: {
    bg: WORLD.SKY_SNOW, skyTint: WORLD.SKY_SNOW, fog: 0xf2eee9, fogNear: 16, fogFarMul: 0.8,
    sun: 0.8, hemi: 0.6, amb: 0.62,
    precip: { density: 0.62, colors: [0xffffff, 0xfff0f6], fall: 2, windX: 0, sway: 1.2, size: 0.2 },
    clouds: false, rainbow: false,
  },
  storm: {
    bg: WORLD.SKY_STORM, skyTint: WORLD.SKY_STORM, fog: 0xe8e2ee, fogNear: 14, fogFarMul: 0.8,
    sun: 0.72, hemi: 0.58, amb: 0.6,
    precip: { density: 0.3, colors: [...SPRINKLE_COLORS], fall: 6, windX: 1.0, sway: 0.4, size: 0.14 },
    clouds: true, rainbow: false,
  },
  rainbow: {
    bg: WORLD.SKY_RAINBOW, skyTint: WORLD.SKY_RAINBOW, fog: 0xf0ece2, fogNear: 18, fogFarMul: 1.0,
    sun: 1.05, hemi: 0.55, amb: 0.58, precip: null, clouds: false, rainbow: true,
  },
};

const RAINBOW_BANDS = [0xfb7185, 0xfbbf24, 0xfde68a, 0x6ee7b7, 0x93c5fd, 0xc084fc];

export function createWeather(
  THREE: ThreeNS,
  opts: {
    scene: THREE.Scene;
    ambient: THREE.AmbientLight;
    hemi: THREE.HemisphereLight;
    sun: THREE.DirectionalLight;
    /** The engine's gradient skydome material. Its `color` multiplies the baked
     *  vertex gradient — the ONLY way a weather change reaches the visible sky,
     *  since the dome fully occludes scene.background. Optional so tests / a
     *  dome-less scene still work (falls back to bg-only, which is invisible
     *  behind a dome but harmless). */
    skyMat?: THREE.MeshBasicMaterial;
    reduceMotion: boolean;
    precipCap: number;
    center: { x: number; z: number };
  },
): Weather {
  const { scene, ambient, hemi, sun, skyMat, reduceMotion, precipCap, center } = opts;
  const group = new THREE.Group();
  scene.add(group);
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];

  // ---- Capture the CLEAR snapshot (the true "sunny" baseline) ----
  const bg0 = (scene.background as THREE.Color).clone();
  const fog = scene.fog as THREE.Fog; // engine always sets a linear Fog
  const fog0 = fog.color.clone();
  const fogNear0 = fog.near;
  const fogFar0 = fog.far;
  const sun0 = sun.intensity;
  const hemi0 = hemi.intensity;
  const amb0 = ambient.intensity;

  const sunnyPreset = (): Preset => ({
    // skyTint white = the dome's baked sunny gradient, untinted.
    bg: bg0.getHex(), skyTint: 0xffffff, fog: fog0.getHex(), fogNear: fogNear0, fogFarMul: 1,
    sun: sun0, hemi: hemi0, amb: amb0, precip: null, clouds: false, rainbow: false,
  });
  const presetFor = (kind: WeatherKind): Preset => (kind === 'sunny' ? sunnyPreset() : PRESETS[kind]);

  // ---- Crossfade state (from → to over WEATHER_TRANSITION_MS) ----
  let current: WeatherKind = 'sunny';
  const fromBg = bg0.clone();
  const toBg = bg0.clone();
  const fromSky = new THREE.Color(0xffffff);
  const toSky = new THREE.Color(0xffffff);
  const fromFog = fog0.clone();
  const toFog = fog0.clone();
  let fromNear = fogNear0, toNear = fogNear0;
  let fromFar = fogFar0, toFar = fogFar0;
  let fromSun = sun0, toSun = sun0;
  let fromHemi = hemi0, toHemi = hemi0;
  let fromAmb = amb0, toAmb = amb0;
  let transT = 1; // 1 = settled

  // ---- Precipitation: ONE shared THREE.Points (single draw call) ----
  const dot = document.createElement('canvas');
  dot.width = 32; dot.height = 32;
  {
    const c = dot.getContext('2d')!;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 32);
  }
  const dotTex = new THREE.CanvasTexture(dot);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  texs.push(dotTex);
  const N = Math.max(1, precipCap);
  const SPAN = 16; // half-width of the local fall box (scene units)
  const TOP = 14;  // spawn height
  const posArr = new Float32Array(N * 3);
  const colArr = new Float32Array(N * 3);
  const fallFactor = new Float32Array(N);
  const swayPhase = new Float32Array(N);
  let pseed = 20260710;
  const prand = (): number => { pseed = (pseed * 1103515245 + 12345) & 0x7fffffff; return pseed / 0x7fffffff; };
  for (let i = 0; i < N; i++) {
    posArr[i * 3] = (prand() * 2 - 1) * SPAN;
    posArr[i * 3 + 1] = prand() * TOP;
    posArr[i * 3 + 2] = (prand() * 2 - 1) * SPAN;
    fallFactor[i] = 0.8 + prand() * 0.4;
    swayPhase[i] = prand() * Math.PI * 2;
  }
  const precipGeo = new THREE.BufferGeometry();
  precipGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  precipGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  precipGeo.setDrawRange(0, 0);
  geos.push(precipGeo);
  const precipMat = new THREE.PointsMaterial({
    map: dotTex, size: 0.16, sizeAttenuation: true, transparent: true,
    depthWrite: false, vertexColors: true, opacity: 0.95,
  });
  mats.push(precipMat);
  const precip = new THREE.Points(precipGeo, precipMat);
  precip.frustumCulled = false;
  group.add(precip);
  let precipDensity = 0;       // live (ramps)
  let precipTargetDensity = 0; // target
  let precipFall = 8, precipWind = 0, precipSway = 0.25;

  const paintPrecip = (colors: number[]): void => {
    const tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      tmp.set(colors[i % colors.length]);
      colArr[i * 3] = tmp.r; colArr[i * 3 + 1] = tmp.g; colArr[i * 3 + 2] = tmp.b;
    }
    (precipGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  };

  // ---- Drifting cotton-candy overcast clouds (3 additive puffs) ----
  const clouds: Array<{ sprite: THREE.Sprite; mat: THREE.SpriteMaterial; x: number; z: number; y: number; speed: number }> = [];
  for (let i = 0; i < 3; i++) {
    const gs = glowSprite(THREE, WORLD.CLOUD_PINK, 10 + i * 2, 0);
    texs.push(gs.tex); mats.push(gs.mat);
    gs.sprite.position.set(center.x + (i - 1) * 12, 11 + i, center.z - 6 - i * 4);
    group.add(gs.sprite);
    clouds.push({ sprite: gs.sprite, mat: gs.mat, x: gs.sprite.position.x, z: gs.sprite.position.z, y: gs.sprite.position.y, speed: 0.4 + i * 0.15 });
  }
  let cloudTargetOpacity = 0;

  // ---- Pastel rainbow (6 concentric half-tori), shown during rainbow melt ----
  const rainbowGroup = new THREE.Group();
  rainbowGroup.position.set(center.x, 0.4, center.z - 34);
  const rainbowMats: THREE.MeshBasicMaterial[] = [];
  RAINBOW_BANDS.forEach((c, i) => {
    const r = 20 + i * 0.9;
    const geo = new THREE.TorusGeometry(r, 0.45, 8, 60, Math.PI);
    geos.push(geo);
    const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, depthWrite: false, fog: false });
    mats.push(mat); rainbowMats.push(mat);
    rainbowGroup.add(new THREE.Mesh(geo, mat));
  });
  group.add(rainbowGroup);
  let rainbowTargetOpacity = 0;

  const apply = (preset: Preset): void => {
    // Capture current live values as the crossfade origin.
    fromBg.copy(scene.background as THREE.Color); toBg.set(preset.bg);
    if (skyMat) fromSky.copy(skyMat.color);
    toSky.set(preset.skyTint);
    fromFog.copy(fog.color); toFog.set(preset.fog);
    fromNear = fog.near; toNear = preset.fogNear;
    fromFar = fog.far; toFar = fogFar0 * preset.fogFarMul;
    fromSun = sun.intensity; toSun = preset.sun;
    fromHemi = hemi.intensity; toHemi = preset.hemi;
    fromAmb = ambient.intensity; toAmb = preset.amb;
    transT = 0;
    // Precip: reduced-motion suppresses falling particles entirely.
    if (preset.precip && !reduceMotion) {
      precipTargetDensity = preset.precip.density;
      precipFall = preset.precip.fall; precipWind = preset.precip.windX; precipSway = preset.precip.sway;
      precipMat.size = preset.precip.size;
      paintPrecip(preset.precip.colors);
    } else {
      precipTargetDensity = 0;
    }
    cloudTargetOpacity = preset.clouds ? 0.45 : 0;
    rainbowTargetOpacity = preset.rainbow ? 0.9 : 0;
  };

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

  return {
    group,
    setWeather(kind: WeatherKind): void {
      current = kind;
      apply(presetFor(kind));
    },
    getWeather(): WeatherKind {
      return current;
    },
    update(dtMs: number, focus: { x: number; z: number }): void {
      // Sky/fog/light crossfade (ease-in-out). Color/intensity lerps aren't
      // vestibular, so they run even under reduced-motion.
      if (transT < 1) {
        transT = Math.min(1, transT + dtMs / WEATHER_TRANSITION_MS);
        const e = transT < 0.5 ? 2 * transT * transT : 1 - Math.pow(-2 * transT + 2, 2) / 2;
        (scene.background as THREE.Color).lerpColors(fromBg, toBg, e);
        // Tint the skydome (the actual visible sky) toward the preset's mood —
        // the dome occludes scene.background, so without this a storm never
        // reaches the screen.
        if (skyMat) skyMat.color.lerpColors(fromSky, toSky, e);
        fog.color.lerpColors(fromFog, toFog, e);
        fog.near = lerp(fromNear, toNear, e);
        fog.far = lerp(fromFar, toFar, e);
        sun.intensity = lerp(fromSun, toSun, e);
        hemi.intensity = lerp(fromHemi, toHemi, e);
        ambient.intensity = lerp(fromAmb, toAmb, e);
      }

      // Precipitation — follow the avatar, ramp count, fall + wrap.
      precip.position.set(focus.x, 0, focus.z);
      const ramp = Math.min(1, dtMs / PRECIP_RAMP_MS);
      precipDensity += (precipTargetDensity - precipDensity) * ramp;
      const active = Math.round(precipDensity * N);
      if (active > 0) {
        const dts = dtMs / 1000;
        for (let i = 0; i < active; i++) {
          let y = posArr[i * 3 + 1] - precipFall * fallFactor[i] * dts;
          let x = posArr[i * 3] + precipWind * dts + Math.sin(swayPhase[i] + y * 0.6) * precipSway * dts;
          if (y <= 0) { y = TOP; x = (prand() * 2 - 1) * SPAN; posArr[i * 3 + 2] = (prand() * 2 - 1) * SPAN; }
          if (x > SPAN) x -= SPAN * 2; else if (x < -SPAN) x += SPAN * 2;
          posArr[i * 3] = x; posArr[i * 3 + 1] = y;
        }
        (precipGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      precipGeo.setDrawRange(0, active);

      // Overcast clouds — drift + wrap, fade opacity toward target.
      for (const cl of clouds) {
        cl.mat.opacity += (cloudTargetOpacity - cl.mat.opacity) * Math.min(1, dtMs / 1200);
        if (!reduceMotion) {
          cl.x += cl.speed * (dtMs / 1000);
          if (cl.x > center.x + 26) cl.x = center.x - 26;
          cl.sprite.position.x = cl.x;
        }
      }

      // Rainbow — fade in/out (no motion; safe under reduced-motion).
      const rt = Math.min(1, dtMs / 900);
      for (const m of rainbowMats) m.opacity += (rainbowTargetOpacity - m.opacity) * rt;
      rainbowGroup.visible = rainbowMats[0].opacity > 0.01;
    },
    dispose(): void {
      scene.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
