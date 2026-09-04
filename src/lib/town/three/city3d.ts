// Procedural 3D candy city for the free-roam Gamecakes City.
//
// Builds every static piece of the world from the REGIONS catalog: a tinted
// ground pad + hero landmark cake per region, a small cake "booth" per game
// (these double as the tap-to-enter targets), golden roads along the region
// neighbor graph, floating name + emoji sprites, and a translucent fog dome
// over each locked region with an animated reveal.
//
// Everything lives under a single returned THREE.Group the engine adds to the
// scene. No runtime `three` import — the namespace arrives as an argument
// (see types.ts for the why).

import type * as THREE from 'three';
import type { ThreeNS } from './types';
// Frame-rate-independent damping (maath is a tiny, three-free util — safe static
// import; stays in this client-only engine chunk, never the server bundle).
import { damp } from 'maath/easing';
import { PX_PER_UNIT, pxToSceneX, pxToSceneZ } from './types';
import { cityCenterPx, ZONE_SCALE, cityBoundsPx, cityRectPx, type RectPx } from './layout';
import { makePier } from './pier';
import { checkersBoothAnchorPx } from './checkersboard';
import { islandOf } from '@/lib/town/islands';
import { REGIONS, type Region } from '@/lib/town/regions';
import { findGame } from '@/lib/games/registry';
import { buildCupcakeModel } from './avatar';
import { buildLandStructure } from './land-structure';
import { AUTHORED_HERO_SLUGS, type AuthoredRegistry } from './authored-registry';
import { evolutionForLevel } from '@/lib/town/land-evolution';
import { CAKE, RIBBON, WORLD, CAKEY_ROAD, RACER } from '@/lib/games/theme/palette';
import { glowSprite, frostingMat, cakeMat, candyMat } from './materials';
import type { CupcakeConfig } from '@/lib/cupcake/config';

/** A game booth inside a region — the raycast target for entering its game. */
export interface CityBooth {
  gameSlug: string;
  /** World-pixel position of the booth (avatar walks here to enter). */
  posPx: { x: number; y: number };
  /** The tappable mesh (raycast hit → walk + enter). */
  hit: THREE.Object3D;
}

interface RegionNode {
  region: Region;
  /** Cotton-candy cloud group over a locked region, or null for starters /
   *  already-discovered regions. While non-null the region blocks entry. */
  fog: THREE.Group | null;
  /** Active reveal (dissolve) tween progress in [0,1], or -1 when not revealing. */
  revealT: number;
  /** Active storm roll-in (grow + fade-in) progress in [0,1], or -1 when idle.
   *  Set by refogRegion(); animated to -1 (idle bob) in update(). */
  growT: number;
  /** True when this cloud is a temporary weather storm (⏳), not a permanent
   *  lock (🔒) — drives the extra glow pulse so it reads as passing. */
  storm: boolean;
  /** The storm cloud's glow-halo material, for the pulse. */
  stormGlowMat?: THREE.SpriteMaterial;
  fogMats: THREE.Material[];
  /** Per-region phase offset (radians) so idle clouds bob out of sync. */
  bobPhase: number;
  /** The region's center hero group — celebrateRegion() overshoot-pops it. */
  hero: THREE.Group;
  /** Celebration overshoot tween progress in [0,1], or -1 when idle. */
  celebT: number;
  /** Per-kid land live-upgrade state (undefined for non-kid lands): the pad
   *  mesh (scaled per stage), the swappable structure+garden sub-build with
   *  its OWN disposables (so setLandLevel can rebuild it live), and the
   *  pop-in tween. */
  land?: {
    pad: THREE.Mesh;
    /** The land's arch gate — tracked so setLandLevel can hide it at Tower/
     *  Castle (where the structure's own marquee carries the land name). */
    gate: THREE.Group;
    extras: {
      group: THREE.Group;
      geos: THREE.BufferGeometry[];
      mats: THREE.Material[];
      texs: THREE.Texture[];
    } | null;
    popT: number;
  };
}

/** Per-booth animation record — drives idle sign-bob + proximity hover (the
 *  "you can enter here" affordance) each frame from update(). */
interface BoothAnim {
  /** Whole booth group — scales up slightly as the cupcake approaches. */
  group: THREE.Group;
  /** Sign sub-group (glow + glyph + name) — idle-bobs independently. */
  sign: THREE.Group;
  /** Body material — emissive pulses up on approach. */
  bodyMat: THREE.MeshStandardMaterial;
  /** Additive glow halo material — opacity rises on approach. */
  glowMat: THREE.SpriteMaterial;
  /** World-pixel booth position (avatar distance is measured against this). */
  posPx: { x: number; y: number };
  /** Baseline glow opacity when the cupcake is far away. */
  glowBase: number;
  /** Idle-bob phase offset so booths don't bob in lockstep. */
  phase: number;
}

export interface City3D {
  group: THREE.Group;
  /** All game booths across all regions (engine raycasts these). */
  booths: CityBooth[];
  /** Pier deck footprints (city-px) + the region each belongs to. The engine
   *  makes these walkable over deep water once the owning region is discovered,
   *  so water-game booths on a pier stay unlock-gated. */
  pierDecks: Array<{ rect: RectPx; slug: string }>;
  /** True if the region still has a fog dome blocking entry. */
  isFogged(slug: string): boolean;
  /** Begin dissolving a region's fog (call after a successful discover, or to
   *  clear a storm). */
  revealRegion(slug: string): void;
  /** Roll a fresh cotton-candy cloud back onto an already-revealed land (a
   *  weather storm). Marked ⏳ (temporary) and grows in; no-op if it already has
   *  a cloud. Visual only — the engine owns the entry re-lock separately. */
  refogRegion(slug: string): void;
  /** Overshoot-pop the region's hero landmark (1 → 1.15 → 1) — the unlock
   *  celebration beat. Skipped under reduced-motion. */
  celebrateRegion(slug: string): void;
  /** Rebuild a per-kid land's evolved structure + garden at `level` LIVE and
   *  rescale its pad — no page reload. The new build pops in with a scale
   *  overshoot (instant under reduced-motion). No-op for non-kid lands. */
  setLandLevel(slug: string, level: number): void;
  /** Advance idle motion + fog-reveal tweens. Call once per frame from the
   *  engine loop. `avatarPx` (world-pixel avatar position) drives the booth
   *  proximity-hover affordance; omit it to skip proximity animation. */
  update(dtMs: number, avatarPx?: { x: number; y: number }): void;
  dispose(scene: THREE.Scene): void;
}

interface CreateCityOpts {
  /** Region slugs already revealed — these spawn with no fog. */
  discovered: Set<string>;
  /** Region slug → owning kid's cupcake_config. When present for a region, its
   *  center landmark renders as that kid's cupcake (on a pedestal) instead of
   *  the generic hero cake + emoji. Resolved server-side; `{}` for guests. */
  landCupcakes: Record<string, CupcakeConfig>;
  /** Region slug → owner's land evolution level (0..N). Scales the land's pad +
   *  hero and adds its evolved structure (Cottage → Tower → Castle). Visual
   *  only — the logical rect/roads/spawn/walk-clamp are untouched. `{}` = all
   *  level 0. */
  landLevels: Record<string, number>;
  /** Preloaded authored GLB art. When it holds a model for a land level, that
   *  is used instead of the procedural silhouette; absent or still loading, the
   *  procedural builder runs and nothing looks different. Optional so tests and
   *  any future caller can omit it entirely. */
  authored?: AuthoredRegistry | null;
  /** The VIEWING kid's own land slug, if any. The owner-only "Grow My Land"
   *  upgrade kiosk (a booth carrying the sentinel slug `land:upgrade`) is built
   *  only on this region, so non-owners viewing the land don't see it. */
  ownedLandSlug?: string;
  /** May a scenery prop stand at this city-px point?
   *
   *  The scatter below picks points across the WHOLE archipelago bounding box
   *  and its only rejection test is "inside a region rect" — so it had no idea
   *  where the land is, and dropped 42% of the lollipop trees and candy props
   *  into open sea, plus one growing out of the Sugar Mile's deck. city3d has
   *  no access to the island distance field, the roads or the race circuit;
   *  the engine owns all three, so it supplies the predicate. Omit it and the
   *  scatter behaves as before. */
  canPlaceDecor?: (px: number, py: number) => boolean;
}

/** 0xRRGGBB int → '#rrggbb' string for canvas 2D fills/strokes. */
function colorHex(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

// ---- Sprite helpers (canvas-texture billboards; no asset pipeline) ----

function makeCanvasTexture(
  THREE: ThreeNS,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  w: number,
  h: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeEmojiSprite(THREE: ThreeNS, emoji: string, scaleU: number): {
  sprite: THREE.Sprite;
  tex: THREE.Texture;
  mat: THREE.SpriteMaterial;
} {
  const tex = makeCanvasTexture(
    THREE,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${Math.floor(h * 0.8)}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, w / 2, h / 2 + h * 0.04);
    },
    128,
    128,
  );
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(scaleU, scaleU, 1);
  return { sprite, tex, mat };
}

/** The brand display face (Fredoka) for canvas text. next/font exposes it under
 *  a hashed family name via the `--font-fredoka` CSS var (max loaded weight 700),
 *  which we read at draw time so signs use the real brand font; falls back to a
 *  rounded system stack if the var/webfont isn't available yet. */
function displayFontFamily(): string {
  const fallback = 'ui-rounded, "Segoe UI", system-ui, sans-serif';
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue('--font-fredoka')
    .trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** Draws a game name onto a cream sign-face canvas, AUTO-FITTING the font to the
 *  card's inner width and wrapping the longest names to at most two balanced
 *  lines so text never spills past the background. Returns the CanvasTexture
 *  only (mounted on a plane by makeBoothSign); the caller tracks it for
 *  disposal. */
function makeLabelTexture(THREE: ThreeNS, text: string): THREE.CanvasTexture {
  const W = 640;
  const H = 232; // ~2.75:1 — room for one or two lines with padding
  return makeCanvasTexture(
    THREE,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      // Cream sign face — nearly fills the canvas; the rounded-corner
      // transparency lets the ribbon frame board behind peek through as a candy
      // border around the card.
      const r = 44;
      const inset = 10;
      ctx.fillStyle = 'rgba(255,250,240,0.97)';
      ctx.beginPath();
      ctx.moveTo(r + inset, inset);
      ctx.arcTo(w - inset, inset, w - inset, h - inset, r);
      ctx.arcTo(w - inset, h - inset, inset, h - inset, r);
      ctx.arcTo(inset, h - inset, inset, inset, r);
      ctx.arcTo(inset, inset, w - inset, inset, r);
      ctx.closePath();
      ctx.fill();

      // Fit + wrap. Pad generously so text never touches the edge.
      const family = displayFontFamily();
      const padX = 48;
      const padY = 30;
      const iw = w - padX * 2;
      const ih = h - padY * 2;
      const MAX = 84;
      const MIN = 34;
      const maxLines = 2;
      const lineFactor = 1.16;
      // Greedy word-wrap at a given font size.
      const wrap = (size: number): string[] => {
        ctx.font = `700 ${size}px ${family}`;
        const words = text.split(/\s+/);
        if (words.length === 1) return [text];
        const lines: string[] = [];
        let cur = words[0];
        for (let i = 1; i < words.length; i++) {
          const t = `${cur} ${words[i]}`;
          if (ctx.measureText(t).width <= iw) cur = t;
          else {
            lines.push(cur);
            cur = words[i];
          }
        }
        lines.push(cur);
        return lines;
      };
      // Largest size (few big words) down to the floor (long names → 2 lines).
      let size = MIN;
      let lines: string[] = [text];
      for (let s = MAX; s >= MIN; s -= 2) {
        const ls = wrap(s);
        if (ls.length > maxLines) continue;
        ctx.font = `700 ${s}px ${family}`;
        const widest = Math.max(...ls.map((l) => ctx.measureText(l).width));
        if (widest <= iw && s * lineFactor * ls.length <= ih) {
          size = s;
          lines = ls;
          break;
        }
      }
      // Last-resort clamp for an unbreakable long token: shrink to width.
      ctx.font = `700 ${size}px ${family}`;
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      if (widest > iw) {
        size = Math.max(20, Math.floor(size * (iw / widest)));
        ctx.font = `700 ${size}px ${family}`;
      }
      // Draw the (1-2) lines centered.
      ctx.fillStyle = '#3a2a1e';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lineH = size * lineFactor;
      const startY = h / 2 - (lineH * (lines.length - 1)) / 2;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], w / 2, startY + i * lineH + 2);
      }
    },
    W,
    H,
  );
}

/** A hanging shop sign that mounts UNDER the booth's front eave — a ribbon-candy
 *  framed board with the auto-fit game name on its cream face, slung from two
 *  frosting pegs so the name reads as part of the little building (not a floating
 *  pill). Built in booth-local coords (faces +z, the booth's front); the caller
 *  positions the returned group and tracks its disposables. Fixed-orientation is
 *  fine because the glyph+glow beacon above the roof keeps the booth findable
 *  from any angle. */
function makeBoothSign(
  THREE: ThreeNS,
  text: string,
  bodyHex: number,
  deepHex: number,
): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
} {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const signW = 2.15;
  const signH = 0.78;
  const depth = 0.14;

  // Ribbon-deep candy frame — a real 3D board (physical depth = part of the
  // building, not a billboard), which also forms the candy border.
  const frameGeo = new THREE.BoxGeometry(signW, signH, depth);
  geometries.push(frameGeo);
  const frameMat = candyMat(THREE, deepHex);
  materials.push(frameMat);
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  group.add(frame);

  // Cream sign face with the auto-fit name, on an UNLIT plane so the text stays
  // crisp + legible regardless of scene lighting.
  const faceTex = makeLabelTexture(THREE, text);
  textures.push(faceTex);
  const faceGeo = new THREE.PlaneGeometry(signW - 0.16, signH - 0.14);
  geometries.push(faceGeo);
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true });
  materials.push(faceMat);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = depth / 2 + 0.01;
  group.add(face);

  // Two frosting/candy pegs slinging the board up under the eave.
  const pegGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8);
  geometries.push(pegGeo);
  const pegMat = candyMat(THREE, bodyHex);
  materials.push(pegMat);
  for (const sx of [-signW * 0.34, signW * 0.34]) {
    const peg = new THREE.Mesh(pegGeo, pegMat);
    peg.position.set(sx, signH / 2 + 0.05, 0);
    group.add(peg);
  }

  return { group, geometries, materials, textures };
}

/** A land-name marquee: a rounded, ribbon-colored plaque with a candy border
 *  and a cakey rounded name. Camera-facing (Sprite) so it stays legible when
 *  the world spins — unlike the game-title pills it is boldly colored, not a
 *  cream pill, so region names read as land banners, not another game sign. */
function makeMarqueeSprite(
  THREE: ThreeNS,
  text: string,
  widthU: number,
  bodyHex: number,
  deepHex: number,
): { sprite: THREE.Sprite; tex: THREE.Texture; mat: THREE.SpriteMaterial } {
  const W = 512;
  const H = 160;
  const tex = makeCanvasTexture(
    THREE,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const r = 46;
      const pill = (inset: number): void => {
        ctx.beginPath();
        ctx.moveTo(r, inset);
        ctx.arcTo(w - inset, inset, w - inset, h - inset, r);
        ctx.arcTo(w - inset, h - inset, inset, h - inset, r);
        ctx.arcTo(inset, h - inset, inset, inset, r);
        ctx.arcTo(inset, inset, w - inset, inset, r);
        ctx.closePath();
      };
      // Deep candy border, then the ribbon-colored plaque face.
      ctx.fillStyle = colorHex(deepHex);
      pill(6);
      ctx.fill();
      ctx.fillStyle = colorHex(bodyHex);
      pill(20);
      ctx.fill();
      // Sprinkle dots along the top edge for a cakey touch.
      const sprinkles = ['#ffffff', '#fff1a8', '#bff7d0', '#ffd1e6'];
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = sprinkles[i % sprinkles.length];
        ctx.beginPath();
        ctx.arc(60 + i * ((w - 120) / 8), 40, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Name — bold rounded, white with a dark candy outline for contrast on
      // any ribbon color. Uses the brand display face (Fredoka) like the booth
      // signs — the land marquees are the biggest text in the world, so they
      // must not be the one place off the brand font.
      ctx.font = `800 62px ${displayFontFamily()}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(60,20,10,0.55)';
      ctx.lineWidth = 8;
      ctx.strokeText(text, w / 2, h / 2 + 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, w / 2, h / 2 + 12);
    },
    W,
    H,
  );
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(widthU, widthU * (H / W), 1);
  return { sprite, tex, mat };
}

/** A cakey candy archway gate for a land — two candy-cane posts, a ribbon-
 *  colored arched beam, a cherry keystone, and the land-name marquee hung at
 *  the apex. Built in local coords with its base at y=0 and the opening facing
 *  ±z; the caller plants it at the region's back edge (north) so it never
 *  shares screen space with the game-title pills on the south booth row.
 *  Returns its disposables for the caller to track. */
function makeRegionArch(
  THREE: ThreeNS,
  region: Region,
): {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
  textures: THREE.Texture[];
} {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const bodyHex = RIBBON[region.ribbon];
  const deepHex = RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON];

  // Gateway sizing (scene units). Keep it a walk-under span, not the full pad
  // width (region.size.w * ZONE_SCALE ≈ 8.8 units for a 4-tile land).
  const regionW = region.size.w * ZONE_SCALE;
  const archW = Math.min(regionW * 0.62, 5.2);
  const half = archW / 2;
  const postH = 3.0;

  // Candy-cane stripe texture (diagonal white/deep stripes), shared by posts.
  const stripeTex = makeCanvasTexture(
    THREE,
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = colorHex(deepHex);
      ctx.lineWidth = w * 0.34;
      for (let i = -h; i < w + h; i += w * 0.55) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
      }
    },
    48,
    96,
  );
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(1, 3);
  textures.push(stripeTex);
  const postMat = new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 });
  materials.push(postMat);
  const postGeo = new THREE.CylinderGeometry(0.16, 0.18, postH, 14);
  geometries.push(postGeo);
  for (const sx of [-half, half]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(sx, postH / 2, 0);
    post.castShadow = true;
    group.add(post);
  }

  // Arched beam — a half torus bridging the post tops.
  const archGeo = new THREE.TorusGeometry(half, 0.22, 12, 30, Math.PI);
  geometries.push(archGeo);
  const archMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.45 });
  materials.push(archMat);
  const arch = new THREE.Mesh(archGeo, archMat);
  arch.position.set(0, postH, 0);
  arch.castShadow = true;
  group.add(arch);

  // Cherry keystone at the apex.
  const cherryGeo = new THREE.SphereGeometry(0.26, 14, 12);
  geometries.push(cherryGeo);
  const cherryMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 });
  materials.push(cherryMat);
  const cherry = new THREE.Mesh(cherryGeo, cherryMat);
  cherry.position.set(0, postH + half + 0.1, 0);
  cherry.castShadow = true;
  group.add(cherry);

  // Land-name marquee hung across the opening, just under the apex.
  const marquee = makeMarqueeSprite(THREE, region.name, archW * 0.94, bodyHex, deepHex);
  marquee.sprite.position.set(0, postH + 0.15, 0.02);
  group.add(marquee.sprite);
  textures.push(marquee.tex);
  materials.push(marquee.mat);

  return { group, geometries, materials, textures };
}

// ---- Locked-region "cotton-candy cloud" styling ----
// Locked (undiscovered, non-starter) regions used to wear a dark slate dome
// that read heavier than the active play area. It's now a soft pink cotton-
// candy cloud: a low, lumpy cluster of pastel puffs that recedes visually and
// gently bobs. Kept translucent + faintly self-lit so it stays candy-bright in
// shadow instead of graying out.
const CLOUD_COLOR = 0xffa3d3; // soft cotton-candy pink
const CLOUD_EMISSIVE = 0xff8fc6; // gentle pink self-glow so shadow doesn't gray it
const CLOUD_OPACITY = 0.74;
const CLOUD_BOB_AMP = 0.12; // scene units of vertical drift
const CLOUD_BOB_SPEED = 0.0016; // radians per ms — gentle

/** Stable non-negative hash of a slug, for deterministic per-region cloud
 *  shape + bob phase (so a region's cloud looks identical every mount but
 *  differs from its neighbours). Mirrors the LCG-seed convention used by the
 *  tree scatter below. */
function slugSeed(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) h = (h * 31 + slug.charCodeAt(i)) & 0x7fffffff;
  return h;
}

// ---- Region rect geometry (world px → scene units) ----

function regionRectU(region: Region): { cx: number; cz: number; w: number; d: number } {
  // Spread center (city-px) → scene units. size is in tiles, and 1 tile == 1
  // unit, so size IS the unit footprint (pads keep their original size; only
  // the centers fly apart — that's what opens the gaps between towns).
  const c = cityCenterPx(region.slug);
  return {
    cx: pxToSceneX(c.x),
    cz: pxToSceneZ(c.y),
    w: region.size.w * ZONE_SCALE,
    d: region.size.h * ZONE_SCALE,
  };
}

/** Deterministic booth offsets inside a region for N games — spreads them in a
 *  small arc near the region center so they read as a cluster of shops.
 *
 *  Exported only so scripts/chess-isle-check.mjs can assert against the REAL
 *  function rather than a copy of this arithmetic that would silently drift.
 *  Nothing in the app should call it from outside this module. */
export function boothOffsetsPx(region: Region, n: number): { x: number; y: number }[] {
  const c = cityCenterPx(region.slug);
  const halfW = (region.size.w * PX_PER_UNIT * ZONE_SCALE) / 2;
  const halfH = (region.size.h * PX_PER_UNIT * ZONE_SCALE) / 2;
  const out: { x: number; y: number }[] = [];
  // Lay the game buildings out in a wide front row pushed to the SOUTH edge of
  // the zone (toward the camera) — well clear of the hero cake + the region's
  // name label at the center, which used to overlap the game-name pills. The
  // wider span keeps each game-name pill from colliding with its neighbour.
  // Race Island is approached from the NORTH — the Sugar Mile lands there and
  // the region arches already face that way. A south-edge booth row put Cakey
  // Racer's shopfront behind Victory Lane, invisible from the bridgehead, with
  // its back to everything else on the island. Flipping the row is one sign
  // change and puts the whole land on one frontage.
  const BOOTH_EDGE: Record<string, 'north' | 'south' | undefined> = {
    'race-pit-row': 'north',
    'race-victory-lane': 'north',
  };
  const edge = BOOTH_EDGE[region.slug] ?? 'south';
  const rowY = c.y + (edge === 'north' ? -1 : 1) * halfH * 0.82;
  const span = halfW * 1.55;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    out.push({ x: c.x - span / 2 + t * span, y: rowY });
  }
  return out;
}

// Booth body colors live in the shared palette (WORLD.SHOP_BODIES) so the town
// and the games stay on one color vocabulary.

export function createCity3D(THREE: ThreeNS, opts: CreateCityOpts): City3D {
  const group = new THREE.Group();

  // Shared disposables.
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const track = <T,>(arr: T[], item: T): T => {
    arr.push(item);
    return item;
  };

  const nodes = new Map<string, RegionNode>();
  // Monotonic ms accumulator driving the idle cloud bob (see update()).
  let elapsed = 0;
  const booths: CityBooth[] = [];
  // Pier deck footprints (city-px) collected as piers are built (see the games
  // loop). Exposed so the engine can make them walkable + gate them.
  const pierDecks: Array<{ rect: RectPx; slug: string }> = [];
  // Which regions get a water-pier off their seaward (east) edge, and how big.
  // Kept here (not in the regions catalog) since pier geometry is a town-3D
  // concern. Their game booths move onto the pier instead of the inland row.
  const PIER_CONFIG: Record<string, { lengthPx: number; halfWidthPx: number }> = {
    'sprinkle-shore': { lengthPx: 360, halfWidthPx: 130 },
  };

  /** Games whose booth stands at its own arena instead of in the land's shared
   *  row: region slug → game slug → anchor, given that land's ISLAND centre.
   *
   *  ⚠️ The anchor takes the ISLAND centre, not the region centre, because the
   *  arenas are positioned from the island centre (the solver moves islands as
   *  the archipelago grows, so anything offshore hangs off the solved centre or
   *  it silently drifts). Those two points are equal for chess-club today only
   *  because it is the sole region on its island — adding a second land would
   *  move the region centre and leave a booth stranded in open grass.
   *
   *  Each anchor is derived from its board's own rect, so moving the board moves
   *  the booth with it rather than leaving a second hardcoded offset to drift. */
  const WING_BOOTHS: Record<
    string,
    Record<string, (islandCenterPx: { x: number; y: number }) => { x: number; y: number }>
  > = {
    'chess-club': { 'cakey-checkers': checkersBoothAnchorPx },
  };
  // Landmarks that idle-spin each frame (per-kid cupcake icons on their pedestal).
  const spinners: THREE.Object3D[] = [];
  // Booth idle-bob + proximity-hover records (see update()).
  const boothAnims: BoothAnim[] = [];
  // Lollipop trees that gently sway (tilt about their base) each frame.
  const swayers: { obj: THREE.Object3D; phase: number }[] = [];
  // Honor reduced-motion for purely-idle animation (bob/sway/spin). Proximity
  // hover + reveal tweens are user-driven affordances, so they stay on.
  const reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // World-px radius at which a booth begins to "wake up" as the cupcake nears.
  const BOOTH_HOVER_PX = 150;

  /** Build a cotton-candy fog cloud (5–7 pastel puffs + glow halo + a marker
   *  glyph) over a region's rect. Deterministic shape per slug. Puff geometries
   *  and the glow texture go into the shared disposal sinks; the puff/glow/lock
   *  MATERIALS are returned in `fogMats` (the node owns their disposal). Shared
   *  by the initial locked-region pass and the on-demand storm re-fog. */
  const buildFogCloud = (
    region: Region,
    rect: { cx: number; cz: number; w: number; d: number },
    marker: string,
  ): { fog: THREE.Group; fogMats: THREE.Material[]; glowMat: THREE.SpriteMaterial } => {
    const fog = new THREE.Group();
    const fogMats: THREE.Material[] = [];
    const spanU = Math.max(rect.w, rect.d);
    let s = slugSeed(region.slug) || 1;
    const rand = (): number => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    const puffCount = 5 + Math.floor(rand() * 3);
    let topY = 0;
    for (let i = 0; i < puffCount; i += 1) {
      const r = spanU * (0.24 + rand() * 0.18);
      const ang = rand() * Math.PI * 2;
      const rad = spanU * 0.3 * rand();
      const px = rect.cx + Math.cos(ang) * rad;
      const pz = rect.cz + Math.sin(ang) * rad;
      const py = 0.3 + rand() * 0.4;
      const puffGeo = track(geos, new THREE.SphereGeometry(r, 12, 8));
      const puffMat = new THREE.MeshStandardMaterial({
        color: CLOUD_COLOR,
        emissive: CLOUD_EMISSIVE,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: CLOUD_OPACITY,
        roughness: 1,
      });
      puffMat.userData.baseOpacity = CLOUD_OPACITY;
      fogMats.push(puffMat);
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.position.set(px, py, pz);
      fog.add(puff);
      topY = Math.max(topY, py + r);
    }
    const glow = glowSprite(THREE, WORLD.GLOW_PINK, spanU * 1.6, 0.5);
    track(texs, glow.tex);
    glow.mat.userData.baseOpacity = 0.5;
    glow.sprite.position.set(rect.cx, topY * 0.6, rect.cz);
    fog.add(glow.sprite);
    fogMats.push(glow.mat);
    const lock = makeEmojiSprite(THREE, marker, 1.0);
    track(texs, lock.tex);
    lock.sprite.position.set(rect.cx, topY + 0.35, rect.cz);
    lock.mat.userData.baseOpacity = 1;
    fog.add(lock.sprite);
    fogMats.push(lock.mat);
    return { fog, fogMats, glowMat: glow.mat };
  };

  // Shared invisible hit-proxy for booth taps (opacity-0 material, same pattern
  // as cakey.hitMesh — invisible to the renderer, still raycastable). One unit
  // box, scaled per booth to cover body + hanging sign + the glyph beacon.
  const boothHitGeo = track(geos, new THREE.BoxGeometry(1, 1, 1));
  const boothHitMat = track(
    mats,
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );

  /** Build one shop booth (a game entrance, or the Cakey Store) — a rounded,
   *  frosting-roofed shop with a glowing sign that bobs and brightens as the
   *  cupcake approaches, so game destinations read as obviously enterable. The
   *  tap/enter target is an invisible proxy box covering the WHOLE booth (body
   *  + sign + beacon) — the art makes the beacon the most tappable-looking
   *  thing in the world, so it must actually take the tap. Registers the booth
   *  in `booths` + its animation in `boothAnims`. */
  const makeShopBooth = (opts: {
    bodyColor: number;
    glyph: string;
    label: string;
    posPx: { x: number; y: number };
    slug: string;
    /** Land ribbon hue — mount-peg / frame accents for the hanging shop sign. */
    bodyHex: number;
    /** Deep ribbon hue — the sign board's candy frame. */
    deepHex: number;
    bodyW?: number;
  }): void => {
    const w = opts.bodyW ?? 1.8;
    const booth = new THREE.Group();
    booth.position.set(pxToSceneX(opts.posPx.x), 0, pxToSceneZ(opts.posPx.y));
    // Body — the raycast/enter target. Emissive-capable (starts at 0) so it can
    // pulse warm as the cupcake approaches.
    const bGeo = track(geos, new THREE.BoxGeometry(w, 1.55, w));
    // Kept as a typed MeshStandardMaterial (not the widened track() return) so
    // its emissiveIntensity can be pulsed by the proximity-hover code.
    const bMat = new THREE.MeshStandardMaterial({
      color: opts.bodyColor,
      roughness: 0.55,
      emissive: opts.bodyColor,
      emissiveIntensity: 0,
    });
    mats.push(bMat);
    const bMesh = new THREE.Mesh(bGeo, bMat);
    bMesh.position.y = 0.78;
    bMesh.castShadow = true;
    bMesh.receiveShadow = true;
    booth.add(bMesh);
    // Frosting-dripped roof — a 4-sided pyramid + a torus "drip" ring at the
    // eaves so it reads as an iced shop, not a generic house.
    const roofMat = track(mats, frostingMat(THREE, 0xfff1d6));
    const roof = new THREE.Mesh(track(geos, new THREE.ConeGeometry(w * 0.92, 1.0, 4)), roofMat);
    roof.position.y = 2.05;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    booth.add(roof);
    const drip = new THREE.Mesh(track(geos, new THREE.TorusGeometry(w * 0.6, 0.1, 8, 20)), roofMat);
    drip.position.y = 1.58;
    drip.rotation.x = Math.PI / 2;
    booth.add(drip);
    // Door.
    const door = new THREE.Mesh(
      track(geos, new THREE.BoxGeometry(0.58, 0.88, 0.08)),
      track(mats, new THREE.MeshStandardMaterial({ color: 0x7b4a2b, roughness: 0.8 })),
    );
    door.position.set(0, 0.46, w / 2 + 0.02);
    booth.add(door);
    // Beacon group — glow halo behind a big game glyph, floating above the roof.
    // Camera-facing (Sprites) so the booth is identifiable from ANY orbit angle;
    // it idle-bobs and its glow brightens on approach.
    const sign = new THREE.Group();
    const glow = glowSprite(THREE, WORLD.GLOW_WARM, 2.6, 0.32);
    track(texs, glow.tex);
    track(mats, glow.mat);
    glow.sprite.position.set(0, 3.15, 0);
    sign.add(glow.sprite);
    const glyph = makeEmojiSprite(THREE, opts.glyph, 1.55);
    track(texs, glyph.tex);
    track(mats, glyph.mat);
    glyph.sprite.position.set(0, 3.15, 0);
    sign.add(glyph.sprite);
    booth.add(sign);
    // Hanging shop sign — the game name on a candy-framed board mounted under the
    // front eave, above the door. A child of `booth` (NOT the bobbing beacon), so
    // it stays firmly part of the building and scales with the proximity hover.
    const nameSign = makeBoothSign(THREE, opts.label, opts.bodyHex, opts.deepHex);
    nameSign.geometries.forEach((g) => geos.push(g));
    nameSign.materials.forEach((m) => mats.push(m));
    nameSign.textures.forEach((t) => texs.push(t));
    nameSign.group.position.set(0, 1.05, w / 2 + 0.28);
    booth.add(nameSign.group);
    // Invisible hit proxy spanning the body, the hanging sign, and the floating
    // glyph beacon (top ≈ y 3.9 incl. its bob) — so tapping the big glowing
    // sign enters the game too, not just the small body box.
    const hitMesh = new THREE.Mesh(boothHitGeo, boothHitMat);
    hitMesh.scale.set(w * 1.4, 4.2, w * 1.4);
    hitMesh.position.y = 2.1;
    hitMesh.userData.gameSlug = opts.slug;
    booth.add(hitMesh);
    group.add(booth);
    bMesh.userData.gameSlug = opts.slug;
    booths.push({ gameSlug: opts.slug, posPx: opts.posPx, hit: hitMesh });
    boothAnims.push({
      group: booth,
      sign,
      bodyMat: bMat,
      glowMat: glow.mat,
      posPx: opts.posPx,
      glowBase: 0.32,
      phase: ((slugSeed(opts.slug) % 100) / 100) * Math.PI * 2,
    });
  };

  // ---- Frosting-trail paths (drawn first, so pads/structures sit on top) ----
  // One trail per unique neighbor pair. The old flat gold box read like a debug
  // road; this is a piped-cream trail — a soft frosting ribbon flanked by two
  // slightly-proud piping rails, so paths clearly say "walk here" and match the
  // edible world. Kept low (top under the 0.12 pad tops) so it tucks beneath the
  // land pads at the centers and shows between them.
  const drawnPairs = new Set<string>();
  const pathBaseMat = track(mats, frostingMat(THREE, WORLD.FROSTING_PATH));
  const pathEdgeMat = track(mats, frostingMat(THREE, WORLD.FROSTING_PATH_EDGE));
  for (const region of REGIONS) {
    const a = regionRectU(region);
    for (const nslug of region.neighbors) {
      const key = [region.slug, nslug].sort().join('|');
      if (drawnPairs.has(key)) continue;
      drawnPairs.add(key);
      const nb = REGIONS.find((r) => r.slug === nslug);
      if (!nb) continue;
      const b = regionRectU(nb);
      const dx = b.cx - a.cx;
      const dz = b.cz - a.cz;
      const len = Math.hypot(dx, dz) || 1;
      const trail = new THREE.Group();
      trail.position.set((a.cx + b.cx) / 2, 0.04, (a.cz + b.cz) / 2);
      trail.rotation.y = -Math.atan2(dz, dx);
      // Race Island's one internal link gets COCOA, not piped cream. A frosting
      // trail is the right vocabulary everywhere else in the world, but running
      // a dessert-table doily down the spine of a speedway — between the pit
      // garages and the podium, inside the circuit — was the most on-brand
      // object on that island and the most off-message.
      const isRaceLink = region.slug.startsWith('race-') && nslug.startsWith('race-');
      if (isRaceLink) {
        const road = new THREE.Mesh(
          track(geos, new THREE.BoxGeometry(len, 0.06, 1.1)),
          track(mats, new THREE.MeshStandardMaterial({ color: RACER.ASPHALT, roughness: 0.92 })),
        );
        road.receiveShadow = true;
        trail.add(road);
        // Dashed frosting centre-line, matching the circuit's racing line.
        const dashGeo = track(geos, new THREE.BoxGeometry(0.9, 0.02, 0.14));
        const dashMat = track(mats, frostingMat(THREE, RACER.RACING_LINE));
        const dashes = Math.max(2, Math.floor(len / 2.2));
        for (let i = 0; i < dashes; i++) {
          const dash = new THREE.Mesh(dashGeo, dashMat);
          dash.position.set(-len / 2 + (i + 0.5) * (len / dashes), 0.04, 0);
          trail.add(dash);
        }
        group.add(trail);
        continue;
      }
      // Cream base ribbon (top ≈ 0.07, under the pads).
      const base = new THREE.Mesh(track(geos, new THREE.BoxGeometry(len, 0.06, 0.9)), pathBaseMat);
      base.receiveShadow = true;
      trail.add(base);
      // Two piped frosting rails along the long edges — the "piping" read.
      const railGeo = track(geos, new THREE.BoxGeometry(len, 0.1, 0.16));
      for (const rz of [-0.42, 0.42]) {
        const rail = new THREE.Mesh(railGeo, pathEdgeMat);
        rail.position.set(0, 0.015, rz);
        trail.add(rail);
      }
      group.add(trail);
    }
  }

  /** Build a per-kid land's swappable evolution content — the evolved structure
   *  (Cottage → Tower → Castle) plus the candy-flower garden ring that grows
   *  with the level. Owns its OWN disposables (not the shared sinks) so
   *  setLandLevel can tear it down and rebuild LIVE when the owner upgrades.
   *  Returns null at level 0 (a bare Plot — the first upgrade should read as a
   *  change). */
  const buildLandExtras = (
    level: number,
    region: Region,
    rect: { cx: number; cz: number; w: number; d: number },
  ): {
    group: THREE.Group;
    geos: THREE.BufferGeometry[];
    mats: THREE.Material[];
    texs: THREE.Texture[];
  } | null => {
    if (level <= 0) return null;
    const g = new THREE.Group();
    const egeos: THREE.BufferGeometry[] = [];
    const emats: THREE.Material[] = [];
    const etexs: THREE.Texture[] = [];
    const struct = buildLandStructure(THREE, level, opts.authored);
    // The structure's height is baked NATIVELY into its geometry (see
    // land-structure.ts — the Castle keep already tops ~18u), so we stand it at
    // scale 1 and DON'T multiply by padScale. padScale is the pad FOOTPRINT
    // scale (capped ≤2.5); using it for height would cap the castle short.
    //
    // Place the structure CENTERED at the land's back (north) edge — exactly
    // where the arch gate was (we hide that gate at Tower/Castle) — so the
    // castle is the land's HERO, with the kid's spinning cupcake reading as the
    // character marker in front of it. backZ pins the structure's north face on
    // the padScale-grown pad and keeps its south face clear of the center
    // pedestal, at every stage.
    const footHalf = level >= 3 ? 2.5 : level === 2 ? 0.8 : 1.1;
    const padHalfDepth = rect.d * 0.96 * 0.5 * evolutionForLevel(level).padScale;
    const backZ = Math.min(-0.9, -padHalfDepth + footHalf + 0.3);
    struct.group.position.set(0, 0, backZ);
    g.add(struct.group);
    struct.geometries.forEach((x) => egeos.push(x));
    struct.materials.forEach((x) => emats.push(x));

    // At Tower/Castle the arch gate is hidden, so the land needs its name back:
    // a camera-facing marquee floating over the structure (its texture is
    // tracked in `texs` so it's disposed on rebuild + teardown).
    if (level >= 2) {
      const bodyHex = RIBBON[region.ribbon];
      const deepHex = RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON];
      const marquee = makeMarqueeSprite(
        THREE,
        region.name,
        level >= 3 ? 4.6 : 3.4,
        bodyHex,
        deepHex,
      );
      marquee.sprite.position.set(0, level >= 3 ? 6.2 : 4.6, backZ + (level >= 3 ? 3.5 : 2.0));
      g.add(marquee.sprite);
      emats.push(marquee.mat);
      etexs.push(marquee.tex);
    }

    // A garden that GROWS with the land level — a ring of candy flowers
    // (stem + gumdrop blossom), 4 more per stage, in a FRONT (south, +z) arc so
    // blossoms never sit inside the back structure's footprint.
    const flowerCount = level * 4;
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.34, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x6ee7b7, roughness: 0.7 });
    const blossomGeo = new THREE.SphereGeometry(0.12, 10, 8);
    egeos.push(stemGeo, blossomGeo);
    emats.push(stemMat);
    const blossomMats = WORLD.GUMDROP.map((c) => {
      const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.3 });
      emats.push(m);
      return m;
    });
    const ringR = 1.9;
    for (let i = 0; i < flowerCount; i += 1) {
      // Front arc (π/6 → 5π/6) across the south of the pedestal; +z is toward
      // the camera/booths, away from the back-edge structure.
      const a = Math.PI / 6 + (i / Math.max(1, flowerCount - 1)) * ((Math.PI * 2) / 3);
      const fx = Math.cos(a) * ringR;
      const fz = Math.sin(a) * ringR;
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(fx, 0.17, fz);
      g.add(stem);
      const blossom = new THREE.Mesh(blossomGeo, blossomMats[i % blossomMats.length]);
      blossom.position.set(fx, 0.4, fz);
      blossom.castShadow = true;
      g.add(blossom);
    }
    return { group: g, geos: egeos, mats: emats, texs: etexs };
  };

  // ---- Per-region content ----
  for (const region of REGIONS) {
    const rect = regionRectU(region);
    const themeColor = new THREE.Color(region.themeColor);

    // Land evolution: a per-kid land grows its pad + gains a structure as it's
    // upgraded in the Cakey Store. VISUAL ONLY — regionRectU/layout are
    // untouched, so roads, spawn, and the walk-clamp stay put; we just enlarge
    // the pad box in place (padScale is capped ≤ 2.5 in land-evolution.ts).
    const landLevel = opts.landLevels[region.slug] ?? 0;
    const padScale = evolutionForLevel(landLevel).padScale;

    // Tinted ground pad. A few lands replace the flat theme tint with a PAINTED
    // surface that says what the place is at a glance. Kept as a small lookup
    // rather than a growing if/else chain of slug comparisons — Race Island
    // added two more of these, and the next island will add more still.
    //   'checker' — Chess Island's licorice-and-cream board
    //   'track'   — Pit Row's oval circuit
    //   'podium'  — Victory Lane's chequered finish
    //   'flat'    — everything else: the region's theme tint
    // `| undefined` on the value type is load-bearing: without it TS treats a
    // Record<string, T> lookup as always present, decides the `?? 'flat'` can
    // never fire, and then flags every later `padStyle === 'flat'` as dead code.
    type PadStyle = 'checker' | 'track' | 'podium' | 'flat';
    const PAD_STYLE: Record<string, PadStyle | undefined> = {
      'chess-club': 'checker',
      'race-pit-row': 'track',
      'race-victory-lane': 'podium',
    };
    const padStyle: PadStyle = PAD_STYLE[region.slug] ?? 'flat';
    // Painted surfaces are deliberately SMALLER than the zone (a board/circuit ON
    // grass) so the island still reads green like the mainland rather than
    // wall-to-wall texture. The circuit gets more room than the others — a
    // racetrack that doesn't dominate its land doesn't read as a racetrack.
    const padFactor = padStyle === 'flat' ? 0.96 : padStyle === 'track' ? 0.88 : 0.58;
    // Stage scale is applied via mesh.scale (not baked into the geometry) so
    // setLandLevel can grow the pad live when the owner upgrades.
    const padGeo = track(geos, new THREE.BoxGeometry(rect.w * padFactor, 0.12, rect.d * padFactor));
    let padMat: THREE.Material;
    if (padStyle === 'track') {
      // Pit Row's PIT APRON: a cocoa service lane along the north edge with
      // piped-frosting bay markings and a peppermint kerb dividing lane from
      // apron.
      //
      // This used to paint a whole circuit-in-miniature — a cocoa oval with its
      // own racing line and chequer. That read fine on a scenic island, but now
      // that a real circuit runs around the land, a second tiny circuit inside
      // it reads as a toy MODEL of the thing right behind it. An apron says
      // "this is the working end of that racetrack" instead of competing with
      // it. One texture, no extra geometry, same as before.
      const apronTex = track(
        texs,
        makeCanvasTexture(
          THREE,
          (ctx, w) => {
            ctx.fillStyle = colorHex(CAKE.VANILLA);
            ctx.fillRect(0, 0, w, w);
            // Service lane across the top third.
            const laneY = w * 0.16;
            const laneH = w * 0.17;
            ctx.fillStyle = colorHex(CAKEY_ROAD.ROAD_COCOA);
            ctx.fillRect(0, laneY, w, laneH);
            // Peppermint kerb along the lane's inner edge.
            const kerbH = w * 0.022;
            const cell = w / 24;
            for (let i = 0; i < 24; i++) {
              ctx.fillStyle = i % 2 === 0 ? colorHex(RACER.KERB_A) : colorHex(RACER.KERB_B);
              ctx.fillRect(i * cell, laneY + laneH, cell + 1, kerbH);
            }
            // Piped-frosting bay markings below the lane, one per garage.
            ctx.strokeStyle = colorHex(CAKE.FROSTING);
            ctx.lineWidth = w * 0.014;
            const bays = 4;
            const bw = w * 0.17;
            const bh = w * 0.2;
            const gap = (w - bays * bw) / (bays + 1);
            for (let i = 0; i < bays; i++) {
              const bx = gap + i * (bw + gap);
              ctx.beginPath();
              ctx.moveTo(bx, laneY + laneH + kerbH + w * 0.02);
              ctx.lineTo(bx, laneY + laneH + kerbH + bh);
              ctx.lineTo(bx + bw, laneY + laneH + kerbH + bh);
              ctx.lineTo(bx + bw, laneY + laneH + kerbH + w * 0.02);
              ctx.stroke();
            }
          },
          512,
          512,
        ),
      );
      padMat = track(mats, new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.92 }));
    } else if (padStyle === 'podium') {
      // Victory Lane: a broad chequered finish band across a warm gold apron.
      const podiumTex = track(
        texs,
        makeCanvasTexture(
          THREE,
          (ctx, w) => {
            ctx.fillStyle = colorHex(CAKE.VANILLA_DEEP);
            ctx.fillRect(0, 0, w, w);
            const n = 8;
            const s = w / n;
            for (let ix = 0; ix < n; ix++) {
              for (let iy = 0; iy < 3; iy++) {
                // VANILLA, not FROSTING (#ffffff). Chocolate against pure white
                // is a monochrome racing chequer — the one motorsport cliché
                // that reads as off-brand here. This was the only white chequer
                // in the world; Chess Island and the racer game both use vanilla.
                ctx.fillStyle =
                  (ix + iy) % 2 === 0 ? colorHex(RACER.CHECKER_B) : colorHex(RACER.CHECKER_A);
                ctx.fillRect(ix * s, w / 2 - (1.5 - iy) * s, s + 1, s + 1);
              }
            }
          },
          512,
          512,
        ),
      );
      padMat = track(mats, new THREE.MeshStandardMaterial({ map: podiumTex, roughness: 0.92 }));
    } else if (padStyle === 'checker') {
      const checkerTex = track(
        texs,
        makeCanvasTexture(
          THREE,
          (ctx, w) => {
            // Licorice-and-cream board (was slate grey — the one dark, non-
            // edible surface in a pastel candy world). Vanilla squares with
            // deep-chocolate "licorice" squares keep the checker read while
            // staying on the cake palette.
            const n = 8;
            const s = w / n;
            for (let iy = 0; iy < n; iy++) {
              for (let ix = 0; ix < n; ix++) {
                ctx.fillStyle =
                  (ix + iy) % 2 === 0 ? colorHex(CAKE.VANILLA) : colorHex(CAKE.CHOCOLATE_DEEP);
                ctx.fillRect(ix * s, iy * s, s + 1, s + 1);
              }
            }
          },
          512,
          512,
        ),
      );
      padMat = track(mats, new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.9 }));
    } else {
      padMat = track(mats, new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.95 }));
    }
    const pad = new THREE.Mesh(padGeo, padMat);
    pad.position.set(rect.cx, 0.06, rect.cz);
    pad.scale.set(padScale, 1, padScale);
    pad.receiveShadow = true;
    group.add(pad);

    // Hero landmark at the region center. Per-kid lands (region.kidLand)
    // render the owning kid's own cupcake avatar as their icon;
    // every other region keeps its themed hero (cookie / chess king / 2-tier
    // cake) + a floating emoji.
    const kidCupcake = opts.landCupcakes[region.slug];
    const hero = new THREE.Group();
    hero.position.set(rect.cx, 0.12, rect.cz);
    // Per-kid lands: the swappable structure+garden build (owned disposables so
    // setLandLevel can rebuild it live). Null for level 0 / non-kid lands.
    let landExtras: ReturnType<typeof buildLandExtras> = null;

    // Authored hero landmark, if one has been dropped in for this region.
    //
    // Only the FIXED heroes are swappable. Deliberately excluded:
    //   * per-kid lands (kidCupcake) — the hero is that kid's own cupcake,
    //     assembled at runtime from their CupcakeConfig, so a fixed mesh cannot
    //     represent it. That branch is checked first below and always wins.
    //   * the generic 2-tier cake — it is tinted per region by themeColor.
    // Its resources belong to the registry, so nothing here is track()ed.
    const authoredHero =
      !kidCupcake && AUTHORED_HERO_SLUGS.has(region.slug)
        ? (opts.authored?.take(`hero-${region.slug}`) ?? null)
        : null;

    if (kidCupcake) {
      // The land's main icon IS the kid's player-character cupcake, raised on a
      // frosting pedestal and gently spinning so it reads as "their" land.
      const plinthGeo = track(geos, new THREE.CylinderGeometry(0.7, 0.85, 0.5, 22));
      const plinthMat = track(mats, new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.8 }));
      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.25;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      hero.add(plinth);
      const bandGeo = track(geos, new THREE.CylinderGeometry(0.78, 0.78, 0.12, 22));
      const bandMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.5 }));
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 0.52;
      hero.add(band);
      // buildCupcakeModel stands ~0.9u tall with its base at y=0; scale it up to
      // a hero landmark and hang it off a spin pivot.
      const pivot = new THREE.Group();
      pivot.position.y = 0.58;
      const model = buildCupcakeModel(THREE, kidCupcake);
      model.group.scale.setScalar(2.4);
      pivot.add(model.group);
      hero.add(pivot);
      model.geometries.forEach((g) => geos.push(g));
      model.materials.forEach((m) => mats.push(m));
      spinners.push(pivot);
      // A couple of themed balloon spheres flanking the pedestal so the land
      // feels decorated, not just a plinth.
      const balloonGeo = track(geos, new THREE.SphereGeometry(0.22, 14, 12));
      const balloonMat = track(mats, new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.35 }));
      for (const bxp of [-1.15, 1.15]) {
        const balloon = new THREE.Mesh(balloonGeo, balloonMat);
        balloon.position.set(bxp, 1.1, -0.2);
        balloon.scale.y = 1.2;
        balloon.castShadow = true;
        hero.add(balloon);
      }
      // Evolved structure (Cottage → Tower → Castle) + growing garden ring —
      // the SWAPPABLE build (see buildLandExtras / setLandLevel). Null at
      // level 0 (Plot), so the first upgrade reads as a real change.
      landExtras = buildLandExtras(landLevel, region, rect);
      if (landExtras) hero.add(landExtras.group);
    } else if (authoredHero) {
      // An authored GLB replaces this region's fixed hero wholesale.
      hero.add(authoredHero);
    } else if (region.slug === 'cookie-corner') {
      // A shiny Sugar Token coin. The region name is still "Cookie Corner", but
      // the currency long ago rebranded cookies → Sugar Tokens (🪙), and kids
      // kept reading the old golden chocolate-chip cookie hero here as "the
      // cookie currency I shouldn't see anymore." So the hero is now
      // unmistakably a COIN: a thick gold disc stood upright on a frosting
      // stand, with a raised rim and an embossed sugar-star on its face — no
      // dark chips anywhere.
      const standGeo = track(geos, new THREE.CylinderGeometry(0.32, 0.44, 0.5, 20));
      const standMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 }));
      const stand = new THREE.Mesh(standGeo, standMat);
      stand.position.y = 0.25;
      stand.castShadow = true;
      stand.receiveShadow = true;
      hero.add(stand);
      // Coin parts are built face-up (front face along +Y) then the whole pivot
      // is tilted to stand the coin upright, angling its face toward the raised
      // chase camera (same facing as the old cookie so the emboss always reads).
      const coin = new THREE.Group();
      coin.position.y = 1.05;
      coin.rotation.x = -1.0;
      const coinGeo = track(geos, new THREE.CylinderGeometry(0.82, 0.82, 0.24, 36));
      const coinMat = track(mats, new THREE.MeshStandardMaterial({
        color: CAKE.AMBER, metalness: 0.55, roughness: 0.35,
        emissive: CAKE.AMBER_DEEP, emissiveIntensity: 0.15, // faint warm sheen
      }));
      const disc = new THREE.Mesh(coinGeo, coinMat);
      disc.castShadow = true;
      coin.add(disc);
      // Raised rim ring around the coin edge (hole axis rotated to +Y so it
      // frames the face), a touch darker gold than the body.
      const rimGeo = track(geos, new THREE.TorusGeometry(0.82, 0.1, 8, 32));
      const rimMat = track(mats, new THREE.MeshStandardMaterial({ color: CAKE.AMBER_DEEP, metalness: 0.6, roughness: 0.3 }));
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      coin.add(rim);
      // Embossed 5-point sugar-star stamped on the front face — the "token"
      // motif that says currency, not cookie. Built in the XY plane, then laid
      // flat so the extrude raises it off the face toward +Y.
      const star = new THREE.Shape();
      const starPoints = 5, outerR = 0.42, innerR = 0.18;
      for (let i = 0; i < starPoints * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const a = (i / (starPoints * 2)) * Math.PI * 2 - Math.PI / 2;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r;
        if (i === 0) star.moveTo(sx, sy);
        else star.lineTo(sx, sy);
      }
      star.closePath();
      const starGeo = track(geos, new THREE.ExtrudeGeometry(star, { depth: 0.06, bevelEnabled: false }));
      const starMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.4 }));
      const starMesh = new THREE.Mesh(starGeo, starMat);
      starMesh.rotation.x = -Math.PI / 2; // lay flat, extrude toward +Y
      starMesh.position.y = 0.12;          // sit on the coin's front face
      coin.add(starMesh);
      hero.add(coin);
    } else if (region.slug === 'chess-club') {
      // A stylized chess king as the landmark — glossy chocolate "licorice"
      // candy (was near-black charcoal, brushing the nothing-dark rule) with a
      // cherry finial so the destination kids pay a ferry fare to reach reads
      // as candy, not gravestone.
      const kMat = track(mats, candyMat(THREE, CAKE.CHOCOLATE_DEEP));
      const kBase = new THREE.Mesh(track(geos, new THREE.CylinderGeometry(0.55, 0.7, 0.35, 20)), kMat);
      kBase.position.y = 0.35;
      kBase.castShadow = true;
      hero.add(kBase);
      const kBody = new THREE.Mesh(track(geos, new THREE.CylinderGeometry(0.32, 0.5, 0.9, 20)), kMat);
      kBody.position.y = 1.0;
      kBody.castShadow = true;
      hero.add(kBody);
      const kHead = new THREE.Mesh(track(geos, new THREE.SphereGeometry(0.34, 16, 12)), kMat);
      kHead.position.y = 1.6;
      kHead.castShadow = true;
      hero.add(kHead);
      const crossV = new THREE.Mesh(track(geos, new THREE.BoxGeometry(0.1, 0.42, 0.1)), kMat);
      crossV.position.y = 2.05;
      hero.add(crossV);
      const crossH = new THREE.Mesh(track(geos, new THREE.BoxGeometry(0.32, 0.1, 0.1)), kMat);
      crossH.position.y = 2.0;
      hero.add(crossH);
      // Cherry finial — the king wears the brand.
      const finialGeo = track(geos, new THREE.SphereGeometry(0.14, 12, 10));
      const finialMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 }));
      const finial = new THREE.Mesh(finialGeo, finialMat);
      finial.position.y = 2.34;
      finial.castShadow = true;
      hero.add(finial);
    } else if (region.slug === 'race-pit-row') {
      // A stack of liquorice tyres with a traffic cone — the universal "this is
      // a pit lane" read, and cheap: three torus rings and a cone.
      const tyreMat = track(mats, candyMat(THREE, CAKE.CHOCOLATE_DEEP));
      const tyreGeo = track(geos, new THREE.TorusGeometry(0.5, 0.2, 10, 22));
      for (let i = 0; i < 3; i++) {
        const tyre = new THREE.Mesh(tyreGeo, tyreMat);
        tyre.rotation.x = -Math.PI / 2; // lay flat
        tyre.position.y = 0.22 + i * 0.4;
        tyre.rotation.z = i * 0.5; // stagger so the stack isn't a perfect column
        tyre.castShadow = true;
        hero.add(tyre);
      }
      // Candy-corn cone on top, vanilla band round its middle. Uses RACER.CONE
      // so a cone is the same sweet here as on the circuit and in the racer
      // game — it was strawberry here and candy-corn orange everywhere else,
      // which is two different sweets pretending to be one prop.
      const coneMat = track(mats, candyMat(THREE, RACER.CONE));
      const cone = new THREE.Mesh(track(geos, new THREE.ConeGeometry(0.34, 0.8, 16)), coneMat);
      cone.position.y = 1.8;
      cone.castShadow = true;
      hero.add(cone);
      const coneBand = new THREE.Mesh(
        track(geos, new THREE.CylinderGeometry(0.26, 0.3, 0.14, 16)),
        track(mats, new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.5 })),
      );
      coneBand.position.y = 1.72;
      hero.add(coneBand);
    } else if (region.slug === 'race-victory-lane') {
      // A golden cup on a plinth. Bowl + stem + foot + two handles.
      const goldMat = track(mats, candyMat(THREE, CAKE.AMBER));
      const plinth = new THREE.Mesh(
        track(geos, new THREE.CylinderGeometry(0.62, 0.75, 0.5, 20)),
        track(mats, new THREE.MeshStandardMaterial({ color: CAKE.FROSTING, roughness: 0.6 })),
      );
      plinth.position.y = 0.25;
      plinth.castShadow = true;
      hero.add(plinth);
      const foot = new THREE.Mesh(track(geos, new THREE.CylinderGeometry(0.34, 0.42, 0.16, 18)), goldMat);
      foot.position.y = 0.58;
      hero.add(foot);
      const stem = new THREE.Mesh(track(geos, new THREE.CylinderGeometry(0.12, 0.12, 0.42, 14)), goldMat);
      stem.position.y = 0.86;
      hero.add(stem);
      const bowl = new THREE.Mesh(track(geos, new THREE.CylinderGeometry(0.52, 0.26, 0.66, 20)), goldMat);
      bowl.position.y = 1.4;
      bowl.castShadow = true;
      hero.add(bowl);
      const handleGeo = track(geos, new THREE.TorusGeometry(0.2, 0.055, 8, 16));
      for (const side of [-1, 1]) {
        const handle = new THREE.Mesh(handleGeo, goldMat);
        handle.position.set(side * 0.55, 1.45, 0);
        handle.rotation.y = Math.PI / 2;
        hero.add(handle);
      }
      // Cherry on the cup — the brand signature the chess king wears too.
      const cherry = new THREE.Mesh(
        track(geos, new THREE.SphereGeometry(0.16, 12, 10)),
        track(mats, new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 })),
      );
      cherry.position.y = 1.82;
      cherry.castShadow = true;
      hero.add(cherry);
    } else {
      const baseGeo = track(geos, new THREE.CylinderGeometry(0.7, 0.8, 0.7, 20));
      const baseMat = track(mats, new THREE.MeshStandardMaterial({ color: themeColor, roughness: 0.7 }));
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.35;
      base.castShadow = true;
      hero.add(base);
      const topGeo = track(geos, new THREE.CylinderGeometry(0.42, 0.5, 0.5, 18));
      const topMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 }));
      const top = new THREE.Mesh(topGeo, topMat);
      top.position.y = 0.95;
      top.castShadow = true;
      hero.add(top);
      const cherryGeo = track(geos, new THREE.SphereGeometry(0.13, 12, 10));
      const cherryMat = track(mats, new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.3 }));
      const cherry = new THREE.Mesh(cherryGeo, cherryMat);
      cherry.position.y = 1.32;
      cherry.castShadow = true;
      hero.add(cherry);
    }
    // Emoji landmark floats above the themed hero — but a per-kid land's icon is
    // its cupcake, so skip the emoji there.
    if (!kidCupcake) {
      const land = makeEmojiSprite(THREE, region.landmark, 1.3);
      track(texs, land.tex);
      track(mats, land.mat);
      land.sprite.position.set(0, 2.3, 0);
      hero.add(land.sprite);
    }
    group.add(hero);

    // Cakey archway gate at the land's back (north) edge. It carries the land
    // name on its marquee and is planted opposite the south booth row, so the
    // name never shares screen space with the game-title pills (the old floating
    // cream name pill — visually identical to those pills — is gone).
    const gate = makeRegionArch(THREE, region);
    gate.group.position.set(rect.cx, 0.12, rect.cz - rect.d * 0.42);
    group.add(gate.group);
    gate.geometries.forEach((g) => geos.push(g));
    gate.materials.forEach((m) => mats.push(m));
    gate.textures.forEach((t) => texs.push(t));
    // At Tower/Castle the structure's own marquee carries the land name, so hide
    // the arch gate to avoid a duplicate label. At Plot/Cottage (level 0/1) the
    // gate stays and keeps the name.
    if (kidCupcake && landLevel >= 2) gate.group.visible = false;

    // Game shops — one frosting-roofed booth per game (the body stays the
    // tap/enter target). makeShopBooth gives each a glowing sign that bobs and
    // brightens as the cupcake approaches, so game destinations are obvious.
    // Water-game regions get a plank pier off their seaward (east) edge; their
    // game booths sit on the pier deck OUT over the sea instead of the inland
    // row. Everything else keeps the standard south-edge booth row.
    // WING BOOTHS — games that belong to a land but stand at their own arena
    // rather than in the shared row.
    //
    // Chess Island has two arenas now, one per wing, and a booth's job is to
    // front the arena it is the entrance to. Cakey Checkers therefore stands at
    // the WEST board's edge instead of taking a slot in the plaza row, the way
    // Chess Challenge fronts the eastern board.
    //
    // ⚠️ The game STAYS in region.games. It must: that array is what
    // getRegionForGame, the unlock gating and the build-time "every live game is
    // placed" invariant all read. This only changes where the booth is DRAWN.
    // Pulling it out of games[] would make the game read as unplaced and
    // unreachable from the town.
    //
    // Removing checkers from the row also leaves chess-challenge exactly where
    // it was: boothOffsetsPx spreads N slots across a FIXED span, so at N=2 the
    // slots are -436.5/+436.5 — the same eastmost x it held at N=3. The arena
    // side is preserved to the pixel, which is what the games[] ordering note in
    // regions.ts exists to protect. scripts/chess-isle-check.mjs asserts it.
    const wingGames = WING_BOOTHS[region.slug] ?? {};
    const rowGames = region.games.filter((g) => !(g in wingGames));

    const pierCfg = PIER_CONFIG[region.slug];
    let offsets: { x: number; y: number }[];
    if (pierCfg && region.games.length > 0) {
      const rc = cityRectPx(region);
      const pier = makePier(THREE, {
        originPx: { x: rc.x1, y: cityCenterPx(region.slug).y }, // east edge midpoint
        lengthPx: pierCfg.lengthPx,
        halfWidthPx: pierCfg.halfWidthPx,
        waterY: -0.3, // must match engine WATER_Y
        boothCount: region.games.length,
      });
      group.add(pier.group);
      pier.geometries.forEach((g) => geos.push(g));
      pier.materials.forEach((m) => mats.push(m));
      pierDecks.push({ rect: pier.deckRect, slug: region.slug });
      offsets = pier.boothAnchorsPx;
    } else {
      offsets = boothOffsetsPx(region, rowGames.length);
    }
    const boothAt = (gameSlug: string, pos: { x: number; y: number }): void => {
      makeShopBooth({
        bodyColor: WORLD.SHOP_BODIES[booths.length % WORLD.SHOP_BODIES.length],
        glyph: findGame(gameSlug)?.glyph ?? '🎮',
        label: findGame(gameSlug)?.label ?? gameSlug,
        posPx: pos,
        slug: gameSlug,
        bodyHex: RIBBON[region.ribbon],
        deepHex: RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON],
      });
    };
    // A pier sizes its deck from region.games.length, so its anchors still line
    // up 1:1 with the full list; the row list only diverges on wing lands, and
    // no land is both.
    (pierCfg ? region.games : rowGames).forEach((gameSlug, i) => {
      boothAt(gameSlug, { x: offsets[i].x, y: offsets[i].y });
    });
    for (const [gameSlug, anchor] of Object.entries(wingGames)) {
      if (!region.games.includes(gameSlug)) continue; // game left the land — drop the wing booth with it
      boothAt(gameSlug, anchor(islandOf(region.slug).center));
    }

    // "Grow My Land" kiosk — the owner-only, IN-WORLD upgrade affordance. Built
    // only on the VIEWING kid's own land (opts.ownedLandSlug), so other kids
    // just see the diorama. It's a booth carrying the sentinel slug
    // 'land:upgrade': walking up shows the "Grow my land" prompt and tapping it
    // opens the evolution flow (branched in ThreeTownHost.doEnter), bringing the
    // Plot → Cottage → Tower → Castle upgrade OUT of the Store menu and onto the
    // land itself. Placed at the pad's west-center, clear of the south booth row
    // and the central cupcake pedestal.
    if (opts.ownedLandSlug === region.slug) {
      const c = cityCenterPx(region.slug);
      const halfW = (region.size.w * PX_PER_UNIT * ZONE_SCALE) / 2;
      makeShopBooth({
        bodyColor: 0x34d399, // mint — distinct from the game booths on this land
        glyph: '🏗️',
        label: 'Grow my land',
        posPx: { x: c.x - halfW * 0.62, y: c.y },
        slug: 'land:upgrade',
        bodyHex: RIBBON[region.ribbon],
        deepHex: RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON],
      });
    }

    // Cakey Store — a shop at the town hall (Town Square). It's not a game:
    // it carries the sentinel slug 'store:customize' so the shared booth
    // enter path (raycast → walk → onEnterGame, and the proximity button)
    // routes to /kids/customize instead of /games/… (branched in
    // ThreeTownHost.doEnter). Town Square is a starter, so it's always
    // reachable and never fogged.
    if (region.slug === 'town-square') {
      const off = boothOffsetsPx(region, 1)[0];
      makeShopBooth({
        bodyColor: 0xf472b6,
        glyph: '🧁',
        label: 'Cakey Store',
        posPx: { x: off.x, y: off.y },
        slug: 'store:customize',
        bodyHex: RIBBON[region.ribbon],
        deepHex: RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON],
        bodyW: 1.95,
      });
      // Cakey Garage — the vehicle rental kiosk, a second sentinel-slug shop
      // ('store:garage') set a little west of the Cakey Store so the two don't
      // overlap. Walking up opens the in-town RentalModal instead of navigating
      // (branched in ThreeTownHost.doEnter). Town Square is a starter → always
      // reachable, never fogged.
      const garageOff = {
        x: off.x - region.size.w * PX_PER_UNIT * ZONE_SCALE * 0.4,
        y: off.y,
      };
      makeShopBooth({
        bodyColor: 0x60a5fa,
        glyph: '🚙',
        label: 'Cakey Garage',
        posPx: garageOff,
        slug: 'store:garage',
        bodyHex: RIBBON[region.ribbon],
        deepHex: RIBBON[`${region.ribbon}_DEEP` as keyof typeof RIBBON],
        bodyW: 1.95,
      });
    }

    // Cotton-candy cloud over locked, non-starter regions. A low, lumpy
    // cluster of soft-pink puffs (deterministic per slug) that reads light and
    // recedes — replacing the old dark dome that stole attention — with a 🔒
    // hint nested on top. Idle bob is applied in update(); a reveal dissolves
    // the whole group via fogMats + userData.baseOpacity.
    let fog: THREE.Group | null = null;
    let fogMats: THREE.Material[] = [];
    const bobPhase = ((slugSeed(region.slug) % 1000) / 1000) * Math.PI * 2;
    if (!region.starter && !opts.discovered.has(region.slug)) {
      // Cotton-candy cloud over a locked, non-starter land — a glowing, tempting
      // secret (not a grey blocker) with a 🔒 hint. Idle bob in update(); a
      // reveal dissolves it via fogMats + userData.baseOpacity.
      const built = buildFogCloud(region, rect, '🔒');
      fog = built.fog;
      fogMats = built.fogMats;
      group.add(fog);
    }

    nodes.set(region.slug, {
      region,
      fog,
      revealT: -1,
      growT: -1,
      storm: false,
      fogMats,
      bobPhase,
      hero,
      celebT: -1,
      land: kidCupcake ? { pad, gate: gate.group, extras: landExtras, popT: -1 } : undefined,
    });
  }

  // ---- Lollipop trees + candy props scattered on the open ground ----
  {
    const bounds = cityBoundsPx();
    const rects = REGIONS.map((r) => cityRectPx(r));
    const insideAnyZone = (x: number, y: number): boolean =>
      rects.some((rc) => x >= rc.x0 - 36 && x <= rc.x1 + 36 && y >= rc.y0 - 36 && y <= rc.y1 + 36);
    /** On land, off the roads and the circuit. See CreateCityOpts.canPlaceDecor
     *  — without it this scatter has no concept of where the ground is. */
    const onGround = (x: number, y: number): boolean =>
      !insideAnyZone(x, y) && (opts.canPlaceDecor?.(x, y) ?? true);
    // Deterministic LCG so the scatter is identical every mount.
    let seed = 1337;
    const rng = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    // Lollipop / cotton-candy trees — a biscuit stick + a squashed pastel candy
    // canopy (replacing the old generic low-poly cone-pines). Grouped per tree
    // so each can gently sway about its base (see update()).
    const trunkGeo = track(geos, new THREE.CylinderGeometry(0.1, 0.14, 0.7, 8));
    const trunkMat = track(mats, cakeMat(THREE, 0xe7b98a));
    const canopyGeo = track(geos, new THREE.SphereGeometry(0.72, 12, 10));
    const canopyMats = [0xffc2e0, 0xa7f3d0, 0xbfe3ff, 0xfff0a8].map((c) =>
      track(mats, candyMat(THREE, c)),
    );
    let placed = 0;
    let attempts = 0;
    while (placed < 56 && attempts < 4000) {
      attempts += 1;
      const x = bounds.x0 + rng() * (bounds.x1 - bounds.x0);
      const y = bounds.y0 + rng() * (bounds.y1 - bounds.y0);
      if (!onGround(x, y)) continue;
      placed += 1;
      const s = 0.7 + rng() * 0.7;
      const tree = new THREE.Group();
      tree.position.set(pxToSceneX(x), 0, pxToSceneZ(y));
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.35 * s;
      trunk.scale.setScalar(s);
      trunk.castShadow = true;
      tree.add(trunk);
      const canopy = new THREE.Mesh(canopyGeo, canopyMats[placed % canopyMats.length]);
      canopy.position.y = 1.12 * s;
      canopy.scale.set(s, s * 0.9, s);
      canopy.castShadow = true;
      tree.add(canopy);
      group.add(tree);
      swayers.push({ obj: tree, phase: rng() * Math.PI * 2 });
    }
    // Candy props — glossy gumdrops + biscuit wafer pebbles so the open ground
    // never reads flat/empty. Same scatter mask as the trees.
    const gumGeo = track(geos, new THREE.SphereGeometry(0.28, 12, 10));
    const gumMats = WORLD.GUMDROP.map((c) => track(mats, candyMat(THREE, c)));
    const waferGeo = track(geos, new THREE.BoxGeometry(0.5, 0.14, 0.36));
    const waferMat = track(mats, cakeMat(THREE, WORLD.WAFER));
    let props = 0;
    let pAttempts = 0;
    while (props < 40 && pAttempts < 4000) {
      pAttempts += 1;
      const x = bounds.x0 + rng() * (bounds.x1 - bounds.x0);
      const y = bounds.y0 + rng() * (bounds.y1 - bounds.y0);
      if (!onGround(x, y)) continue;
      props += 1;
      const sx = pxToSceneX(x);
      const sz = pxToSceneZ(y);
      if (props % 3 === 0) {
        const wafer = new THREE.Mesh(waferGeo, waferMat);
        wafer.position.set(sx, 0.08, sz);
        wafer.rotation.y = rng() * Math.PI;
        wafer.castShadow = true;
        group.add(wafer);
      } else {
        const gs = 0.6 + rng() * 0.7;
        const gum = new THREE.Mesh(gumGeo, gumMats[props % gumMats.length]);
        gum.position.set(sx, 0.24 * gs, sz);
        gum.scale.set(gs, gs * 0.85, gs);
        gum.castShadow = true;
        group.add(gum);
      }
    }
  }

  return {
    group,
    booths,
    pierDecks,
    isFogged(slug: string): boolean {
      const n = nodes.get(slug);
      return !!n && n.fog !== null;
    },
    revealRegion(slug: string): void {
      const n = nodes.get(slug);
      if (n && n.fog && n.revealT < 0) n.revealT = 0;
    },
    refogRegion(slug: string): void {
      const n = nodes.get(slug);
      if (!n || n.fog) return; // unknown, or already fogged/locked
      const rect = regionRectU(n.region);
      const built = buildFogCloud(n.region, rect, '⏳');
      n.fog = built.fog;
      n.fogMats = built.fogMats;
      n.storm = true;
      n.stormGlowMat = built.glowMat;
      n.revealT = -1;
      n.growT = 0; // roll-in: grow + fade from nothing
      n.fog.scale.setScalar(0.001);
      for (const m of built.fogMats) (m as THREE.Material & { opacity: number }).opacity = 0;
      group.add(n.fog);
    },
    celebrateRegion(slug: string): void {
      const n = nodes.get(slug);
      if (n && !reduceMotion) n.celebT = 0;
    },
    setLandLevel(slug: string, level: number): void {
      const n = nodes.get(slug);
      if (!n?.land) return; // not a per-kid land
      const land = n.land;
      // Tear down the old structure+garden (its disposables are self-owned).
      if (land.extras) {
        n.hero.remove(land.extras.group);
        for (const g of land.extras.geos) g.dispose();
        for (const m of land.extras.mats) m.dispose();
        for (const t of land.extras.texs) t.dispose();
        land.extras = null;
      }
      // Grow the pad to the new stage's footprint.
      const padScale = evolutionForLevel(level).padScale;
      land.pad.scale.set(padScale, 1, padScale);
      // Toggle the arch gate: shown at Plot/Cottage (it carries the name),
      // hidden at Tower/Castle (the structure's own marquee carries the name).
      land.gate.visible = level < 2;
      // Build the new stage and pop it in (instant under reduced-motion).
      land.extras = buildLandExtras(level, n.region, regionRectU(n.region));
      if (land.extras) {
        n.hero.add(land.extras.group);
        if (reduceMotion) {
          land.popT = -1;
        } else {
          land.popT = 0;
          land.extras.group.scale.setScalar(0.001);
        }
      }
    },
    update(dtMs: number, avatarPx?: { x: number; y: number }): void {
      elapsed += dtMs;
      // Gentle idle spin for per-kid cupcake landmarks.
      if (!reduceMotion) for (const s of spinners) s.rotation.y += dtMs / 2600;
      // Lollipop trees sway about their base.
      if (!reduceMotion) {
        for (const t of swayers) t.obj.rotation.z = Math.sin(elapsed * 0.001 + t.phase) * 0.05;
      }
      // Booths: idle sign-bob (idle motion, gated) + proximity hover. The hover
      // is a user-driven "you can enter here" affordance, so it runs even under
      // reduced-motion; it eases the booth scale/emissive/glow up as the cupcake
      // nears and back down as it leaves.
      for (const b of boothAnims) {
        if (!reduceMotion) b.sign.position.y = Math.sin(elapsed * 0.0022 + b.phase) * 0.12;
        let p = 0;
        if (avatarPx) {
          const d = Math.hypot(avatarPx.x - b.posPx.x, avatarPx.y - b.posPx.y);
          p = Math.max(0, Math.min(1, 1 - d / BOOTH_HOVER_PX));
        }
        const target = 1 + 0.09 * p;
        // Critically-damped, frame-rate-independent hover ease (was a dt-scaled
        // linear lerp). damp mutates scale.x; mirror it to y/z for uniform scale.
        damp(b.group.scale, 'x', target, 0.1, dtMs / 1000);
        b.group.scale.setScalar(b.group.scale.x);
        b.bodyMat.emissiveIntensity = 0.18 * p;
        b.glowMat.opacity = b.glowBase + 0.55 * p;
      }
      for (const n of nodes.values()) {
        // Unlock-celebration overshoot on the hero landmark (1 → 1.15 → 1).
        if (n.celebT >= 0) {
          n.celebT = Math.min(1, n.celebT + dtMs / 600);
          n.hero.scale.setScalar(1 + 0.15 * Math.sin(Math.PI * n.celebT));
          if (n.celebT >= 1) {
            n.hero.scale.setScalar(1);
            n.celebT = -1;
          }
        }
        // Live land-upgrade pop-in (0 → 1.12 → 1) on the fresh structure.
        if (n.land && n.land.popT >= 0 && n.land.extras) {
          n.land.popT = Math.min(1, n.land.popT + dtMs / 550);
          const t = n.land.popT;
          const s = t < 0.72 ? (t / 0.72) * 1.12 : 1.12 - 0.12 * ((t - 0.72) / 0.28);
          n.land.extras.group.scale.setScalar(Math.max(0.001, s));
          if (n.land.popT >= 1) {
            n.land.extras.group.scale.setScalar(1);
            n.land.popT = -1;
          }
        }
        if (!n.fog) continue;
        if (n.growT >= 0) {
          // Storm roll-in: grow + fade the cloud IN (reverse of the dissolve).
          // Reduced-motion fades opacity only, no scale roll.
          n.growT = Math.min(1, n.growT + dtMs / 900);
          const e = n.growT;
          n.fog.scale.setScalar(reduceMotion ? 1 : 0.001 + e);
          for (const m of n.fogMats) {
            const sm = m as THREE.Material & { opacity: number };
            const base = (m.userData?.baseOpacity as number | undefined) ?? 1;
            sm.opacity = base * e;
          }
          if (n.growT >= 1) n.growT = -1; // settle into idle bob
          continue;
        }
        if (n.revealT < 0) {
          // Idle: a gentle staggered bob so each locked cloud drifts. Uses
          // position.y only — independent of the reveal dissolve's scale. Storm
          // clouds also pulse their glow so they read as passing, not permanent.
          if (!reduceMotion) {
            n.fog.position.y = Math.sin(elapsed * CLOUD_BOB_SPEED + n.bobPhase) * CLOUD_BOB_AMP;
            if (n.storm && n.stormGlowMat) {
              n.stormGlowMat.opacity = 0.5 + 0.14 * Math.sin(elapsed * 0.004 + n.bobPhase);
            }
          }
          continue;
        }
        // Revealing: shrink + fade the whole cloud away.
        n.revealT = Math.min(1, n.revealT + dtMs / 700);
        const e = 1 - n.revealT;
        n.fog.scale.setScalar(0.001 + e); // shrink away
        for (const m of n.fogMats) {
          const sm = m as THREE.Material & { opacity: number };
          const base = (m.userData?.baseOpacity as number | undefined) ?? 1;
          sm.opacity = base * e;
        }
        if (n.revealT >= 1) {
          group.remove(n.fog);
          n.fog = null; // entry now allowed; isFogged() flips false
          n.storm = false;
          n.stormGlowMat = undefined;
        }
      }
    },
    dispose(scene: THREE.Scene): void {
      scene.remove(group);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      for (const n of nodes.values()) for (const m of n.fogMats) m.dispose();
      // Per-kid land extras own their disposables (they're swappable at runtime).
      for (const n of nodes.values()) {
        if (n.land?.extras) {
          for (const g of n.land.extras.geos) g.dispose();
          for (const m of n.land.extras.mats) m.dispose();
          for (const t of n.land.extras.texs) t.dispose();
        }
      }
      group.clear();
      nodes.clear();
      booths.length = 0;
      spinners.length = 0;
      boothAnims.length = 0;
      swayers.length = 0;
    },
  };
}
