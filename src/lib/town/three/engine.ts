// Gamecakes City 3D — free-roam walkable engine (three.js, no physics).
//
// `createTownEngine` builds the scene and returns an imperative handle the
// React host drives (revealRegion / setPaused / resize / dispose / getState)
// plus callbacks the engine fires back (region change, throttled position
// save, approach-to-unlock, near-building hint, enter-game). The host owns NO
// scene state; the engine owns NO React state.
//
// Movement is kinematic — the cupcake walks toward a tapped target (or steers
// under a held drag) at a fixed speed, clamped to the world and blocked from
// entering fogged regions. ALL gameplay math is in world pixels (the 1024×768
// REGIONS space); we convert to three.js units only when positioning meshes.
//
// No runtime `three` import — the loaded namespace is passed in, so this module
// stays out of the server bundle and only loads in the browser.

import type * as THREE from 'three';
import type { ThreeNS, ThreeTownProps } from './types';
import {
  PX_PER_UNIT,
  WALK_SPEED_PX,
  FOG_APPROACH_PX,
  ENTER_PROMPT_PX,
  ARRIVE_EPS_PX,
  POSITION_POST_INTERVAL_MS,
  CAM_BACK_U,
  CAM_HEIGHT_U,
  CAKEY_SPEED_PX,
  CAKEY_PAUSE_MIN_MS,
  CAKEY_PAUSE_MAX_MS,
  CAKEY_WANDER_MIN_PX,
  CAKEY_WANDER_MAX_PX,
  CAKEY_NEAR_PX,
  CAKEY_HEAD_U,
  WADE_ND,
  WADE_DIP_U,
  pxToSceneX,
  pxToSceneZ,
  sceneToPx,
} from './types';
import {
  REGIONS,
  findRegion,
  isAdjacentToDiscovered,
  type Region,
} from '@/lib/town/regions';
import type { StoryStyle } from '@/lib/town/story-events';
import {
  cityRectPx,
  cityBoundsPx,
  cityCenterPx,
  origToCity,
  cityToOrig,
  mainlandBoundsPx,
  type RectPx,
} from './layout';
import { allIslands, islandOf, ferryIslands, type SolvedIsland } from '@/lib/town/islands';
import { getTownSessionSinceStorm, setTownSessionSinceStorm } from '@/lib/town/town-session';
import { beanNd, beanShoreDist } from './bean';
import { pitchCenterPx, pitchRectPx } from './soccer-pitch';
import { fitRaceTrack, type RaceTrack } from './race-track';
import { makeRaceIsle, type RaceIsle } from './race-isle';
import { buildChessBoard, chessBoardRectPx, type ChessBoardHandle } from './chessboard';
import { buildCheckersBoard, checkersBoardRectPx, type CheckersBoardHandle } from './checkersboard';
import { createCity3D } from './city3d';
import { createAvatar, preloadCupcakeArt, stepAvatarToward } from './avatar';
import { createCakey } from './cakey';
import { createWeather } from './weather';
import { VEHICLE_BUILDERS, type VehicleModel } from './vehicles';
import { findVehicle, type VehicleKind } from '@/lib/town/vehicles';
import { arrivalPrice } from '@/lib/tokens/economy';
import { createTrain, TRAIN_RIDE_Y, sugarExpressRing } from './train';
import { createFerry, FERRY_RIDE_Y, MAINLAND_STOP, type FerryStop, type FerryLayout, type TownFerry } from './ferry';
import { makeBridge, BRIDGE_HALF_W_PX, BRIDGE_BARRIER_T } from './bridge';
import { makeSubDock, SUB_DOCK_REGION, SUB_BOARD_R_PX, SUB_DOCK_ROOT_FRAC } from './sub-dock';
import { createBus, BUS_RIDE_Y, type BusStop } from './bus';
import { CAM_SMOOTH_S, ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, computeCamPose, createCamRig, stepCamRig, type CamMode } from './camera-pose';
import { WATER, CAKE, SPRINKLE_COLORS, WORLD, RIBBON } from '@/lib/games/theme/palette';
import { candyMat, cookieMat, frostingMat, glowSprite, groundDecalDepthBias, emojiSprite, pathMat, pathRibbonGeo } from './materials';
import { projectToScreenPct } from './screen-anchor';
import { loadAuthoredModel, type AuthoredModel } from './authored-model';
import {
  AUTHORED_HEROES,
  AUTHORED_PROPS,
  AUTHORED_BUILDS,
  AUTHORED_CHEST,
  AUTHORED_JETSKI,
  AUTHORED_JETSKI_DOCK,
  AUTHORED_SKI_RAMP,
  AUTHORED_SLALOM_ARROW,
  AUTHORED_SLALOM_BUOY,
  createAuthoredRegistry,
  settleRegistry,
  type AuthoredRegistry,
} from './authored-registry';
import { AUTHORED_LAND_STRUCTURES } from './land-structure';
import { createOccluderFader } from './occlusion';
import { pickLandChestSpots } from './land-chest-spots';
import { createLandChests3D, type LandChests3D } from './land-chests3d';
import { pickJetskiDocks, JETSKI_DOCK_CENTRE_PX } from './jetski-docks';
import { newSlalomRun, planJetskiCourse, stepSlalom, type SlalomEvent } from './jetski-course';
import { addTownLights, configureTownRenderer } from './lighting';
import { createBuildLayer } from './builds3d';
import {
  CELL_PX,
  cellCenterPx,
  cellKey,
  cellOfPx,
  siblingLandAt,
  type BuildKind,
  type BuildProblem,
  type TownBuild,
} from '@/lib/town/builds';

/** First Blender-authored asset in the town. Plain GLB, loaded by three's own
 *  GLTFLoader — the Needle runtime is not involved in rendering it. */
const AUTHORED_GAME_DOME_URL = '/models/town/game-dome.glb';
/** Stand it beside the booth rather than on top of it (city pixels). */
const AUTHORED_DOME_OFFSET_PX = 120;
/** Rigged Cakey with his clips (art/blender/cakey.py). Optional: absent, he
 *  stays procedural. */
const CAKEY_RIG_URL = '/models/town/cakey.glb';
import {
  STORM_DURATION_MS,
  STORM_MIN_GAP_MS,
  STORM_CLEAR_COST,
  STORM_APPROACH_PX,
  WEATHER_DWELL_MIN_MS,
  WEATHER_DWELL_MAX_MS,
  WEATHER_WEIGHTS,
  PRECIP_CAP_TABLET,
  PRECIP_CAP_DESKTOP,
  type WeatherKind,
} from '@/lib/town/weather-config';

export interface TownPositionPayload {
  region_slug: string;
  x: number;
  y: number;
}

export interface TownCallbacks {
  /** Avatar entered a different region (containing rect). */
  onRegionChange(slug: string): void;
  /** Throttled position save — host fire-and-forgets POST /api/town/position. */
  onPositionUpdate(payload: TownPositionPayload): void;
  /** Avatar walked within reach of a fogged, unlock-eligible region. */
  onApproachFog(payload: { regionSlug: string; cost: number }): void;
  /** Nearest enterable game booth (discovered region), or null when none near.
   *  Host renders a floating "Play" prompt off this. */
  onNearBuilding(gameSlug: string | null): void;
  /** Kid chose to enter a game (tapped a booth and arrived). */
  onEnterGame(gameSlug: string): void;
  /** Cupcake walked within boarding range of the train, or back out of it.
   *  Host shows a "Hop on" prompt. Not fired while already riding. */
  onNearTrain(near: boolean): void;
  /** The kid tapped Cakey (the wandering mascot). Host opens his talk panel. */
  onCakeyTap?(): void;
  /** Throttled report of Cakey's on-screen position + state, so the host can
   *  anchor his speech bubble and time ambient lines. */
  onCakeyMove?(info: CakeyMoveInfo): void;
  /** The sky changed to a new weather state (host cues Cakey's weather line). */
  onWeatherChange?(kind: WeatherKind): void;
  /** Kid walked up to a storm-locked land — host offers to clear it for tokens. */
  onApproachStorm?(payload: { regionSlug: string; cost: number }): void;
  /** A storm cleared (paid or waited out) — host closes any clear-storm modal. */
  onStormCleared?(): void;
  /** A story cutscene advanced to a new beat (index into the story's beats).
   *  Host renders beats[index] in the caption band — the engine stays text-free. */
  onCutsceneBeat?(index: number): void;
  /** A story cutscene finished (camera restored, sim unpaused). Host tears down
   *  the caption band. */
  onCutsceneEnd?(): void;
  /** Avatar walked within boarding range of a docked ferry (or back out —
   *  null). There is one boat per ferry island (islands.ts `transport`), so
   *  the payload says WHICH boat: the island it serves and whether boarding
   *  it takes the kid home. Host shows a "Take the ferry" prompt priced from
   *  the landing region. Not fired while aboard. */
  onNearFerry?(near: FerryPrompt | null): void;
  /** Avatar walked out to the submarine on Caramel Cove's jetty (or back off
   *  it). Host shows a "Dive" prompt and, if taken, saves position and pushes
   *  to /town/deep — the same save-then-navigate contract a game booth uses.
   *  Never fires while the cove is still fogged: no dock is built at all. */
  onNearSub?(near: boolean): void;
  /** Within reach of one of the three hidden land chests that this kid has not
   *  opened yet (or out of reach again — null). Host shows "Open the chest" and,
   *  if taken, the same three-question gate the ocean's chests use. */
  onNearLandChest?(slug: string | null): void;
  /** On the beach at a jet ski rental dock, on foot (or walked away again).
   *  Host shows "Rent a jet ski" / "Ride your jet ski"; the jet ski mounts only
   *  here, onto the dock's moored ski. */
  onNearJetskiDock?(near: boolean): void;
  /** The jet ski slalom: a run started, a gate was driven through (or
   *  missed), or the run finished with its time. Host shows the run's HUD. */
  onSlalom?(ev: SlalomEvent): void;
  /** Standing at a Sugar Mile bus stop with the bus parked → host offers "Ride
   *  the bus". The bus is TRANSIT, not a rental: there is nothing to own, and
   *  it's always waiting, so this is purely a proximity prompt. */
  onNearBus?(near: boolean): void;
  /** A ferry crossing finished (avatar disembarked). Host clears its "aboard the
   *  ferry" state so the transport buttons return. */
  onFerryDone?(): void;
  /** Arrived on an offshore island — by ferry, by bus, by driving the Sugar Mile,
   *  or by landing a flying ride. The engine already revealed it locally; the
   *  host persists it server-side + charges whatever that route costs (the
   *  server sets the price; 'fly' and 'drive' are free because the rental was
   *  already paid for). Fires only on the FIRST (discovering) arrival. */
  onIslandArrival?(payload: { regionSlug: string; via: 'ferry' | 'bus' | 'drive' | 'fly' }): void;
  onSfx?(name: 'tap' | 'levelUp' | 'start' | 'step' | 'bump' | 'launch' | 'board'): void;
  /** Build mode moved its aim to a square. `problem` is null when the tool can
   *  be used there (the piece fits, or there's something to remove). */
  onBuildAim?(aim: { gx: number; gy: number; problem: BuildProblem | null }): void;
}

/** Which ferry the kid is standing beside. */
export interface FerryPrompt {
  /** islands.ts id of the island this boat serves. */
  islandId: string;
  /** The island's landing land — what the trip discovers and charges for
   *  (regions[0] of the island; carries LAND.ISLAND). */
  regionSlug: string;
  /** True when the boat is docked AT the island, so boarding sails home. The
   *  home trip is always free and must never show a price. */
  returning: boolean;
}

/** What the host asks the engine to stage for a story cutscene. The engine owns
 *  the camera + FX + timing; the TEXT stays in React (only the beat COUNT is
 *  passed, and the engine reports the active index via onCutsceneBeat). */
export interface StoryCutsceneSpec {
  /** Region to frame — the camera pans to it and FX fires over it. Omit to hold
   *  on the avatar (a non-spatial story). */
  regionSlug?: string;
  /** Flavor → camera framing + which juice fires (see StoryStyle). */
  style: StoryStyle;
  /** Number of beats — sizes the hold duration (the caption band shows each). */
  beatCount: number;
}

/** Cakey's live screen anchor + state, reported to the host ~11×/sec. */
export interface CakeyMoveInfo {
  /** Bubble anchor as a fraction of the canvas: 0..1 from the left / top. */
  xPct: number;
  yPct: number;
  /** False when Cakey is behind the camera or off the viewport — hide the
   *  bubble rather than pin it to an edge. */
  onScreen: boolean;
  /** Whether he's currently walking (host may prefer to talk while he's still). */
  isMoving: boolean;
  /** True when he's wandered close to the kid — a natural "notice you" beat. */
  nearPlayer: boolean;
}

/** Static shape data for the "you are here" minimap — the island silhouettes
 *  and zone dots, all normalized to [0,1] within the archipelago's bounding
 *  box. `outline` is the mainland; `isles` are the offshore islands, each with
 *  its own traced coastline so they read as real islands, not lost grey dots
 *  in open water. `ferryRoutes` are the dock-to-dock crossings, one per ferry
 *  island, drawn as dotted lines in that island's colour so kids can SEE how
 *  to reach each one. */
export interface TownMinimap {
  outline: Array<{ nx: number; ny: number }>;
  isles: Array<Array<{ nx: number; ny: number }>>;
  ferryRoutes: Array<{
    islandId: string;
    /** CSS colour — the island's ribbon, matching its boat's sail. */
    color: string;
    a: { nx: number; ny: number };
    b: { nx: number; ny: number };
  }>;
  /** The submarine dock in Caramel Cove, or null when the cove is still fogged.
   *  Null-when-locked on purpose: the minimap should not advertise a place you
   *  cannot get to yet, the same way a fogged zone shows grey rather than its
   *  contents. */
  subDock: { nx: number; ny: number } | null;
  zones: Array<{ nx: number; ny: number; discovered: boolean; slug: string }>;
}

export interface TownEngine {
  /** Replace the family's drawn builds. Ids in `popIds` grow in (just placed,
   *  here or by a sibling). */
  setBuilds(list: TownBuild[], popIds?: string[]): void;
  /** Turn build mode on with a tool (a piece, or the remove tool), change the
   *  tool or its turn, or turn it off (null). While on, a tap on the ground
   *  aims the tool at that square instead of walking; the engine reports each
   *  aim through onBuildAim. */
  setBuildTool(tool: { tool: BuildKind | 'remove'; rot: number } | null): void;
  /** The square build mode is aimed at, or null when it's off. */
  getBuildAim(): { gx: number; gy: number } | null;
  /** The placed piece on a square, if any. */
  buildAt(gx: number, gy: number): TownBuild | null;
  /** Mark a region revealed (after a successful discover) — dissolves its fog
   *  and unblocks entry. */
  revealRegion(slug: string): void;
  /** Swing a land chest's lid open (the gate said yes). */
  openLandChest(slug: string): void;
  /** Rebuild a per-kid land's evolved structure + garden at `level` LIVE (no
   *  page reload) with a sprinkle burst + scale-overshoot pop. Called by the
   *  host right after a successful POST /api/land/upgrade. No-op for slugs
   *  that aren't per-kid lands. */
  refreshLandLevel(slug: string, level: number): void;
  /** Play a scripted mini-cutscene: pan the camera to focus a region (if given),
   *  hold while the host shows the beats, then restore the chase rig. Reports the
   *  active beat via onCutsceneBeat and fires onCutsceneEnd when the camera is
   *  home. Honors reduced-motion (skips camera + particle FX, still paces beats). */
  playStoryCutscene(spec: StoryCutsceneSpec): void;
  /** Cut a running cutscene short: fast-forward FX to its end-state and restore
   *  the chase rig immediately (the "Skip" button). No-op if none is running. */
  skipStoryCutscene(): void;
  /** Static minimap geometry (island outline + zone dots), normalized [0,1]. */
  minimap: TownMinimap;
  /** Live avatar position for the minimap marker, normalized [0,1]. Poll it. */
  getMinimapPos(): { nx: number; ny: number };
  /** Current avatar position + region for a save-before-navigate. */
  getState(): TownPositionPayload;
  setPaused(paused: boolean): void;
  resize(): void;
  /** Multiply the chase-camera distance (>1 zooms out, <1 zooms in). Clamped. */
  zoomBy(factor: number): void;
  /** Spin the camera around the avatar by `rad` radians (orbit the world so
   *  kids can look toward regions they haven't explored). */
  rotateBy(rad: number): void;
  /** Tell the engine the kid's current Sugar Token balance. Needed because
   *  DRIVING or FLYING onto an offshore island discovers it — and discovery now
   *  charges for the land, so the engine must know whether the kid can afford it
   *  BEFORE revealing anything. Without this it would reveal optimistically and
   *  the server would reject the charge, leaving a land that vanishes on
   *  reload. */
  setBalance(n: number): void;
  /** Hop the cupcake onto the train. Returns false if it's out of range. */
  boardTrain(): boolean;
  /** Board the Cakey Ferry the kid is standing beside (the boat the last
   *  onNearFerry reported): sails to its other stop (mainland↔that island),
   *  gluing the avatar to the boat. Returns false if no boat is in range, it is
   *  not docked, or the kid is already aboard another ride. Arrival is reported
   *  via onIslandArrival. */
  boardFerry(): boolean;
  /** Board the Sugar Mile bus from a stop: drives to the other end of the road
   *  bridge (mainland↔Race Island), gluing the avatar aboard. Returns false if
   *  the bus isn't parked here / the kid is already on another ride. Arrival is
   *  reported via onIslandArrival (fare charged on the FIRST crossing only, so
   *  the trip home is always free). */
  boardBus(): boolean;
  /** Hop off — drop the cupcake where the train currently is. */
  exitTrain(): void;
  /** Mount a rented ride (skateboard/jeep/biplane/balloon). Returns false if
   *  already on a ride or the train. */
  mountVehicle(kind: VehicleKind): boolean;
  /** Hop off the current ride (fly rides glide down to the ground first). */
  dismountVehicle(): void;
  /** Trim a FLYING ride's altitude: +1 climb, -1 dive, 0 hold. Held from the
   *  host's climb/dive buttons; ignored by drive rides + while landing. */
  setClimb(dir: -1 | 0 | 1): void;
  /** Stream the host thumb-pad's steer vector (screen-space, magnitude 0..1;
   *  x right, y down) while a ride is mounted; null on release. Magnitude
   *  scales speed. Overrides any tap target while active. */
  setPadSteer(v: { x: number; y: number } | null): void;
  /** Jet ski throttle, 0..1. Above 0 the ski drives on by itself along its
   *  heading at that speed and the pad only steers; 0 hands speed back to the
   *  pad. Reset to 0 on every mount. Ignored on other rides. */
  setThrottle(v: number): void;
  /** Cycle the world camera (chase → action → drone → sky) and return the new
   *  mode. A persistent setting — applies on foot and on every ride, and
   *  survives mounting/dismounting. */
  cycleCameraMode(): 'chase' | 'action' | 'drone' | 'sky';
  /** Freeze/unfreeze Cakey's wander (he stops and turns to the kid while a talk
   *  panel is open, then resumes roaming when it closes). */
  setCakeyPaused(paused: boolean): void;
  /** Clear the storm re-fogging `slug` (called after a paid token clear). */
  clearStorm(slug: string): void;
  /** Set the sky state directly (testing / a future kid weather control). */
  setWeather(kind: WeatherKind): void;
  dispose(): void;
}

// ---- City-pixel rect helpers (rects come from layout.cityRectPx) ----
function insideRect(px: number, py: number, rc: RectPx): boolean {
  return px >= rc.x0 && px <= rc.x1 && py >= rc.y0 && py <= rc.y1;
}
function distToRect(px: number, py: number, rc: RectPx): number {
  const cx = Math.max(rc.x0, Math.min(px, rc.x1));
  const cy = Math.max(rc.y0, Math.min(py, rc.y1));
  return Math.hypot(px - cx, py - cy);
}

interface BeachBall {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Height of the ball's BOTTOM above the terrain (scene units). 0 = resting. */
  h: number;
  /** Vertical velocity (scene units/sec) — drives the hop-and-bounce arc. */
  vh: number;
  hot: boolean;
  /** Radius in scene units — soccer ball is a touch bigger than beach balls. */
  r: number;
  /** 'soccer' balls score in the goals + reset to center; 'beach' just roam. */
  kind: 'beach' | 'soccer';
}

/** Starts loading every Blender-authored land asset. Every entry is optional:
 *  no file, no problem — the procedural builder runs instead. */
function createTownArtRegistry(THREE: ThreeNS): AuthoredRegistry {
  return createAuthoredRegistry(
    THREE,
    [
      ...Object.values(AUTHORED_LAND_STRUCTURES),
      ...Object.values(AUTHORED_HEROES),
      ...Object.values(AUTHORED_PROPS),
      ...Object.values(AUTHORED_BUILDS),
      AUTHORED_CHEST,
      AUTHORED_JETSKI,
      AUTHORED_JETSKI_DOCK,
      AUTHORED_SLALOM_BUOY,
      AUTHORED_SLALOM_ARROW,
      AUTHORED_SKI_RAMP,
    ].map((spec) => ({
      key: spec.key,
      url: `/models/town/${spec.key}.glb`,
      targetHeightU: spec.targetHeightU,
      relief: CAKE_BUILDING_KEYS.has(spec.key),
    })),
  );
}

/** Authored assets that are cake buildings, so their walls get sponge crumb.
 *  Candy props (trees, gumdrops, the arch, wafers) stay smooth. */
const CAKE_BUILDING_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(AUTHORED_LAND_STRUCTURES).map((s) => s.key),
  ...Object.values(AUTHORED_HEROES).map((s) => s.key),
  AUTHORED_PROPS.booth.key,
  AUTHORED_PROPS.heroCake.key,
]);

/** How long the town will wait for its Blender art before building anyway. */
const TOWN_ART_MAX_WAIT_MS = 4000;

/**
 * Loads the town's Blender art BEFORE the engine is built. createTownEngine is
 * synchronous and builds every land, booth and tree once, so a registry it
 * created itself would still be fetching when city3d asked it for models —
 * and every authored asset would lose to its code fallback on first load. Pass
 * the result to createTownEngine, which then owns and disposes it.
 */
export async function preloadTownArt(THREE: ThreeNS): Promise<AuthoredRegistry> {
  const registry = createTownArtRegistry(THREE);
  // The cupcakes (the kid's avatar, every land's landmark) are Blender parts
  // too, held by avatar.ts rather than this registry.
  await Promise.all([
    settleRegistry(registry, TOWN_ART_MAX_WAIT_MS),
    preloadCupcakeArt(THREE, TOWN_ART_MAX_WAIT_MS),
  ]);
  return registry;
}

/** Scene units one grain tile covers. Small enough to read as texture from the
 *  chase camera, big enough that the repeat never shows as a grid. */
const GRAIN_TILE_U = 3.5;

/** A seamless, near-white grass grain: soft mottling plus short blades, all
 *  between ~84% and 100% brightness so it shades the vertex colour instead of
 *  repainting it. Drawn once on a canvas; no image asset to ship. */
function makeGroundGrain(THREE: ThreeNS, renderer: THREE.WebGLRenderer, repeatX: number, repeatY: number): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Draw at all 9 wrap offsets so marks crossing an edge continue on the
  // opposite side: that is what makes the tile seamless.
  const wrap = (draw: (dx: number, dy: number) => void): void => {
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) draw(dx, dy);
  };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 18 + rnd() * 40, a = 0.05 + rnd() * 0.07;
    wrap((dx, dy) => {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, `rgba(150,170,140,${a})`);
      g.addColorStop(1, 'rgba(150,170,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S, y = rnd() * S, len = 3 + rnd() * 5, lean = (rnd() - 0.5) * 3;
    const light = rnd() < 0.3;
    ctx.strokeStyle = light ? 'rgba(255,255,255,0.9)' : `rgba(120,150,110,${0.12 + rnd() * 0.12})`;
    ctx.lineWidth = 1 + rnd() * 0.8;
    wrap((dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx + lean, y + dy - len);
      ctx.stroke();
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  // The chase camera looks across the ground at a low angle; without this the
  // grain smears into mush a few metres out.
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

export function createTownEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: ThreeTownProps,
  cb: TownCallbacks,
  /** From preloadTownArt. The engine takes ownership and disposes it. */
  authoredArt?: AuthoredRegistry,
): TownEngine {
  // ---------- Spread world extent (city-px + scene-unit derivations) ----------
  // BOUNDS spans the WHOLE archipelago (all islands) — sizes the shared ground +
  // water plane, fog, and shadow frustum. MAINLAND_B is just the mainland, for
  // features that must stay on it (train loop, frosting mountain, terrain
  // edge-fade) rather than crossing the open sea to the offshore islands.
  const BOUNDS = cityBoundsPx();
  const MAINLAND_B = mainlandBoundsPx();
  const extentXU = (BOUNDS.x1 - BOUNDS.x0) / PX_PER_UNIT;
  const extentZU = (BOUNDS.y1 - BOUNDS.y0) / PX_PER_UNIT;
  const sceneCenterX = pxToSceneX((BOUNDS.x0 + BOUNDS.x1) / 2);
  const sceneCenterZ = pxToSceneZ((BOUNDS.y0 + BOUNDS.y1) / 2);
  const halfMaxU = Math.max(extentXU, extentZU) / 2;

  // ---------- Renderer ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  configureTownRenderer(THREE, renderer);
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
  scene.background = new THREE.Color(0xbfe8ff);
  // Warm haze (was a cold blue-white) so the diorama edge reads like a cozy
  // afternoon-birthday light instead of a cold fog.
  const FOG_NEAR_U = 18;
  // On a jet ski the camera skims the water, where a haze 18u out covers most
  // of the sea in cream; it eases back this far while sailing.
  const SAIL_FOG_NEAR_U = 55;
  scene.fog = new THREE.Fog(0xe7e0d8, FOG_NEAR_U, halfMaxU * 2 + 34);

  const { w: w0, h: h0 } = sizeOf();
  // near/far are BOTH load-bearing, and neither may go back to a literal:
  //
  //   far  — must stay clear of scene.fog.far above, or geometry clips against a
  //          background you can still see through: a hard edge sliding across the
  //          sea, worst from a fly ride or the sky camera. This was a hardcoded
  //          200 against a fog far of 191 — nine units of accidental headroom that
  //          went negative the moment an island grew. Derived now, so it can't.
  //   near — 0.5, not the old 0.1. Perspective depth precision is dominated by
  //          near, so this is ~5x the resolution for free and it is what keeps
  //          coplanar-ish ground decals from fighting on a 16-bit depth buffer
  //          (iPads). Not 1.0: the binding constraint is not the avatar (the
  //          closest camera pose is action mode at ~4.6u) but props the camera
  //          brushes PAST — booth bodies, arch posts, chess pieces — which would
  //          punch a hole as they clipped.
  const CAM_FOV = 55;
  const camera = new THREE.PerspectiveCamera(CAM_FOV, w0 / h0, 0.5, halfMaxU * 2 + 60);

  // ---------- Lights + soft image-based lighting ----------
  // Shared with scripts/assets/preview-model.mjs so an asset's look preview is
  // lit exactly like the town (see lighting.ts).
  const { ambient, hemi, sun, envRT } = addTownLights(THREE, scene, renderer, {
    centerX: sceneCenterX,
    centerZ: sceneCenterZ,
    halfU: halfMaxU,
  });

  // ---------- Pastel skydome ----------
  // A soft cream→strawberry→sky gradient dome replaces the flat blue background,
  // so the diorama reads like a cozy sky instead of a wall. It FOLLOWS the camera
  // each frame and renders as a pure backdrop (depthTest/Write off, renderOrder
  // −1) so it never occludes distant lands. Horizon color = the fog color, so the
  // fogged shoreline melts into the sky. Static → no reduced-motion concern.
  const skyDome = ((): THREE.Mesh => {
    const geo = new THREE.SphereGeometry(150, 24, 16);
    const zenith = new THREE.Color(0xbfe8ff); // soft sky blue overhead
    const band = new THREE.Color(0xffdcea); // strawberry-cream mid
    const horizon = new THREE.Color(0xe7e0d8); // fog cream at the horizon (blends)
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const ny = Math.max(0, pos.getY(i) / 150); // 0 at/below horizon → 1 at zenith
      if (ny < 0.35) c.copy(horizon).lerp(band, ny / 0.35);
      else c.copy(band).lerp(zenith, (ny - 0.35) / 0.65);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      depthTest: false,
    });
    const dome = new THREE.Mesh(geo, mat);
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    scene.add(dome);
    return dome;
  })();
  // The dome's material color MULTIPLIES its baked vertex gradient — weather
  // tints it (periwinkle storm, sugar-snow, …). Without this hook every weather
  // sky change was painted behind the opaque dome and never reached the screen.
  const skyDomeMat = skyDome.material as THREE.MeshBasicMaterial;

  // ---------- Terrain height field (gentle rolling topography) ----------
  // The town used to be a dead-flat plane. This one height field gives the open
  // land some roll while staying flat exactly where flatness matters:
  //   * inside/near a zone rect  → booths, roads, and fog pads sit clean at y=0
  //   * near the world edge      → the Sugar Express's perimeter rails stay level
  // EVERYTHING that rests on the ground (avatar, balls, trampolines, and the
  // displaced ground mesh itself) samples this same function, so they agree on
  // where the ground is. Heights are >= 0, so hills only ever rise.
  const zoneRects = REGIONS.map((r) => cityRectPx(r));

  // Soccer pitch footprint — picked here (before the ground is displaced) so it
  // can be added to the flat mask and stay level while the land around it rolls.
  // 4× the footprint of the original 360×240 pitch (2× each side).
  const FIELD_W_PX = 720;
  const FIELD_H_PX = 480;
  const fieldCenter = pitchCenterPx(FIELD_W_PX, FIELD_H_PX, zoneRects);
  const fieldRect: RectPx = pitchRectPx(fieldCenter, FIELD_W_PX, FIELD_H_PX);
  // Rects kept dead-flat: every zone footprint, the soccer pitch, and the walk-on
  // chess board. The board is built ~1,400 lines below, long after the scatter has
  // already run, so its footprint is computed up here from the solved island centre
  // — otherwise lollipop trees and gumdrops spawn on top of it, which they have
  // been doing (ChessBoardHandle.rect documented this reservation but nothing ever
  // read it). Flattening is a no-op offshore, where terrain is already flat; the
  // point is the scatter exclusion.
  const chessIsleSpec = allIslands().find((i) => i.id === 'chess-isle');
  const flatRects = [
    ...zoneRects,
    fieldRect,
    ...(chessIsleSpec
      ? [chessBoardRectPx(chessIsleSpec.center), checkersBoardRectPx(chessIsleSpec.center)]
      : []),
  ];

  // Road corridors kept dead-flat too — city3d draws thin golden roads between
  // adjacent region centers at y≈0, so any hill under one would bury it. We
  // rebuild the same center-to-center segments here and flatten around them.
  const roadSegs: Array<{ ax: number; ay: number; bx: number; by: number }> = [];
  {
    const seen = new Set<string>();
    for (const r of REGIONS) {
      const a = cityCenterPx(r.slug);
      for (const nslug of r.neighbors) {
        const key = [r.slug, nslug].sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        if (!findRegion(nslug)) continue;
        const b = cityCenterPx(nslug);
        roadSegs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    }
  }
  const distToSeg = (px: number, py: number, s: { ax: number; ay: number; bx: number; by: number }): number => {
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const wx = px - s.ax;
    const wy = py - s.ay;
    const len2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
    return Math.hypot(px - (s.ax + t * vx), py - (s.ay + t * vy));
  };

  // The Sugar Express runs a rounded (elliptical) ring around the mainland
  // coast; keep a flat corridor under it so hills don't bury the rails. The
  // ring is fitted ONCE in train-track.ts and read here — engine.ts and train.ts
  // previously derived it separately from MAINLAND_B, held together by a "MUST
  // match" comment. Now there is one answer and nothing to keep in sync.
  const { cx: trackCx, cy: trackCy, rx: trackRx, ry: trackRy } = sugarExpressRing();

  // ---------- Frosting Mountain ----------
  // A big climbable peak that makes the topography actually dramatic (the rest
  // of the land is gentle rolling hills). It's baked into the terrain height —
  // so the ground mesh forms it, the cupcake climbs it, and its upper slopes get
  // a white "frosting" cap in the vertex colors — with a cherry on top. Placed
  // on an open pocket clear of zones, the pitch, the train ring, and roads.
  const MTN_R_PX = 340; // footprint radius
  const MTN_H_U = 5.2; // peak height (scene units) — a dramatic, climbable peak
  const mtnCenter = ((): { x: number; y: number } => {
    // Search on the MAINLAND only (the mountain must not land in the open sea).
    const cc = { x: (MAINLAND_B.x0 + MAINLAND_B.x1) / 2, y: (MAINLAND_B.y0 + MAINLAND_B.y1) / 2 };
    const x0 = MAINLAND_B.x0 + MTN_R_PX + 40;
    const x1 = MAINLAND_B.x1 - MTN_R_PX - 40;
    const y0 = MAINLAND_B.y0 + MTN_R_PX + 40;
    const y1 = MAINLAND_B.y1 - MTN_R_PX - 40;
    if (x1 <= x0 || y1 <= y0) return cc;
    const clear = (c: { x: number; y: number }, avoidRoads: boolean): boolean => {
      if (zoneRects.some((rc) => distToRect(c.x, c.y, rc) < MTN_R_PX + 30)) return false;
      if (distToRect(c.x, c.y, fieldRect) < MTN_R_PX + 30) return false;
      const te = Math.hypot((c.x - trackCx) / trackRx, (c.y - trackCy) / trackRy);
      if (Math.abs(te - 1) < 0.14) return false; // off the train ring
      if (avoidRoads && roadSegs.some((s) => distToSeg(c.x, c.y, s) < MTN_R_PX + 20)) return false;
      return true;
    };
    // Prefer a spot ~0.22·width out from the middle; relax road-avoidance only
    // if nothing else fits.
    for (const avoidRoads of [true, false]) {
      let best: { x: number; y: number } | null = null;
      let bestScore = Infinity;
      for (let gx = 0; gx <= 6; gx++) {
        for (let gy = 0; gy <= 6; gy++) {
          const cand = { x: x0 + ((x1 - x0) * gx) / 6, y: y0 + ((y1 - y0) * gy) / 6 };
          if (!clear(cand, avoidRoads)) continue;
          const d = Math.hypot(cand.x - cc.x, cand.y - cc.y);
          const score = Math.abs(d - (MAINLAND_B.x1 - MAINLAND_B.x0) * 0.22);
          if (score < bestScore) {
            bestScore = score;
            best = cand;
          }
        }
      }
      if (best) return best;
    }
    return cc;
  })();
  const mtnH = (px: number, py: number): number => {
    const d = Math.hypot(px - mtnCenter.x, py - mtnCenter.y);
    if (d >= MTN_R_PX) return 0;
    const t = 1 - d / MTN_R_PX;
    return MTN_H_U * Math.pow(t, 1.4); // peakier than a plain dome
  };

  const TERRAIN_MAX_U = 0.62; // tallest hill, scene units (~40px) — gentle so decor stays planted
  const TERRAIN_FLAT_PAD_PX = 40; // fully flat within this of a zone/pitch/road
  const TERRAIN_RAMP_PX = 150; // flat → full-hills ramp distance
  const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
  const terrainHeightPx = (px: number, py: number): number => {
    const mtn = mtnH(px, py); // the frosting mountain overrides the gentle-hill masks
    // Flatten a band along the elliptical train track.
    const te = Math.hypot((px - trackCx) / trackRx, (py - trackCy) / trackRy);
    if (Math.abs(te - 1) < 0.06) return mtn;
    let minFlatD = Infinity;
    for (const rc of flatRects) {
      const d = distToRect(px, py, rc);
      if (d < minFlatD) minFlatD = d;
    }
    for (const s of roadSegs) {
      const d = distToSeg(px, py, s) - 26; // road half-width (~0.8u) kept flat
      if (d < minFlatD) minFlatD = d;
    }
    let open = clamp01((minFlatD - TERRAIN_FLAT_PAD_PX) / TERRAIN_RAMP_PX);
    if (open <= 0) return mtn;
    // Fade to flat near the MAINLAND edge so the train loop stays grounded.
    // (Offshore islands fall outside this box → flat grass, which is fine.)
    const edgeD = Math.min(
      px - MAINLAND_B.x0,
      MAINLAND_B.x1 - px,
      py - MAINLAND_B.y0,
      MAINLAND_B.y1 - py,
    );
    open *= clamp01((edgeD - 120) / 200);
    if (open <= 0) return mtn;
    // Two octaves of rolling swells (~300px + ~160px wavelengths) — short enough
    // that the slopes actually catch the sun and read as hills, not a flat plain.
    const n =
      Math.sin(px * 0.021) * Math.cos(py * 0.019) * 0.62 +
      Math.sin(px * 0.039 + 1.3) * Math.sin(py * 0.041 + 0.5) * 0.38;
    return ((n + 1) / 2) * TERRAIN_MAX_U * open + mtn;
  };

  // ---------- Jelly-bean island + surrounding water ----------
  // The town used to be a flat rectangular slab. Now it's an organic bean-
  // shaped island poking out of a big water plane. We DON'T rebuild the ground
  // into a bean outline — that would break raycasting, the rectangular movement
  // clamp, the train's perimeter loop, and decor placement. Instead we keep the
  // rectangular ground plane and SUBMERGE everything outside a bean-shaped mask
  // below the water: the rectangle's corners sink out of sight and what stays
  // above water reads as a jelly bean. One `islandNd` field (~0 at the center,
  // 1 at the shoreline, >1 out to sea) drives the land height, the grass→sand
  // vertex colors, and the avatar's walk boundary.
  // ---------- Archipelago: one land "bean" per island ----------
  // Each island (see islands.ts) gets its OWN jelly-bean centered on its own
  // regions, auto-fit so ONLY that island's rects sit inland. islandNd = the
  // MIN across all beans → land wherever any island says land, open sea only
  // where you're outside them ALL. That real sea between islands blocks walking
  // for free (the sea-gate walls read islandNd), makes Chess a genuine separate
  // island, and rings each island with beach/foam automatically. Replaces the
  // old single bean + the Chess "channel" moat hack.
  // Each island gets its OWN jelly-bean. The layout SOLVER (islands.ts) already
  // computed each island's center + half-extents + auto-fit pad + x-stretch —
  // and spaced the islands SEA_GAP apart — using the SAME bean math (bean.ts)
  // we render here, so the rendered coastline is provably the shape the solver
  // used. islandNd = MIN across beans → land wherever any island says land, open
  // sea (blocked + colored as water) only outside them all.
  interface IslandBean {
    id: string;
    cx: number;
    cy: number;
    nd: (px: number, py: number) => number;
  }
  const islandBeans: IslandBean[] = allIslands().map((isl) => ({
    id: isl.id,
    cx: isl.center.x,
    cy: isl.center.y,
    nd: (px: number, py: number) =>
      beanNd(isl.center.x, isl.center.y, isl.halfW, isl.halfH, isl.pad, isl.stretch, px, py, isl.cove),
  }));
  const islandNd = (px: number, py: number): number => {
    let m = Infinity;
    for (const bean of islandBeans) {
      const v = bean.nd(px, py);
      if (v < m) m = v;
    }
    return m;
  };
  // The MAINLAND bean's center/extent — the reference for gameplay features that
  // stay on the mainland (mountain, decor rings, snap-toward-land recovery).
  const mainBean = islandBeans.find((b) => b.id === 'mainland') ?? islandBeans[0];
  /** Race Island's land field — used to detect "the wheels have touched the
   *  island" for drive/bus arrival discovery. */
  const raceBean = islandBeans.find((b) => b.id === 'race-isle') ?? null;

  // ---------- Race Island's circuit (geometry only — meshes come much later) ----------
  // Solved HERE, ~150 lines before the prop scatter, because the scatter needs
  // to know where the tarmac is. Race Island shipped ~77% bare grass with two
  // decal-painted pads; this turns the island itself into the racetrack, so the
  // two lands become the ENDS of a circuit rather than interchangeable pads.
  //
  // The ellipse is DERIVED from the island's own bean, never hard-coded: the
  // island was already resized once via the per-island size/gap knobs, and a
  // literal radius would have quietly drifted off the coast when that landed.
  const RACE_TRACK_HALF_W_PX = 70; // ≈ the Sugar Mile's deck half-width
  const raceIslandSpec = allIslands().find((i) => i.id === 'race-isle') ?? null;
  const raceTrack: RaceTrack | null =
    raceIslandSpec && raceBean
      ? fitRaceTrack({
          cx: raceIslandSpec.center.x,
          cy: raceIslandSpec.center.y,
          halfW: raceIslandSpec.halfW,
          halfH: raceIslandSpec.halfH,
          halfWidthPx: RACE_TRACK_HALF_W_PX,
          nd: raceBean.nd,
          // Only the CORE of each land is off-limits, not its whole rect.
          // Excluding the full pad squeezes the circuit into the gap BETWEEN
          // the two lands — a timid ring in the middle of the island, which is
          // the opposite of "the island is the racetrack". The lands are 704px
          // tall on a 1,283px island, so their rects alone eat the whole
          // north–south window. Racetracks run right past the pit complex; only
          // the middle of a land, where the hero and booths stand, must stay
          // clear.
          pads: (raceIslandSpec.regions ?? [])
            .map((s) => findRegion(s))
            .filter((r): r is NonNullable<typeof r> => !!r)
            .map((r) => {
              const rc = cityRectPx(r);
              const cxr = (rc.x0 + rc.x1) / 2;
              const cyr = (rc.y0 + rc.y1) / 2;
              const k = 0.62; // keep-clear core, as a fraction of the pad
              return {
                x0: cxr - ((rc.x1 - rc.x0) / 2) * k,
                y0: cyr - ((rc.y1 - rc.y0) / 2) * k,
                x1: cxr + ((rc.x1 - rc.x0) / 2) * k,
                y1: cyr + ((rc.y1 - rc.y0) / 2) * k,
              };
            }),
          padClearPx: 20,
        })
      : null;
  // Into roadSegs so the terrain flattener and the prop scatter both respect it.
  if (raceTrack) for (const s of raceTrack.segments(96)) roadSegs.push(s);
  /** Cheap radial "is this on the circuit" test for prop placement.
   *
   *  roadSegs alone is not enough: the scatter's road test uses a 46px radius,
   *  while the tarmac is 70px half-width plus a 46px sugar shoulder. The radial
   *  approximation is a little loose at the hairpins, which for decor placement
   *  only ever means a slightly wider keep-off — the safe direction. */
  const onRaceTrack = (px: number, py: number): boolean => {
    if (!raceTrack) return false;
    const dx = px - raceTrack.cx;
    const dy = py - raceTrack.cy;
    const a = Math.atan2(dy, dx);
    const rEll = Math.hypot(raceTrack.rx * Math.cos(a), raceTrack.ry * Math.sin(a));
    return Math.abs(Math.hypot(dx, dy) - rEll) < RACE_TRACK_HALF_W_PX + 110;
  };
  const islandCx = mainBean.cx;
  const islandCy = mainBean.cy;
  const mainB = mainlandBoundsPx();
  const islandHalfW = (mainB.x1 - mainB.x0) / 2;
  const islandHalfH = (mainB.y1 - mainB.y0) / 2;

  // ---------- Cakey Ferry layouts (computed EARLY, before the terrain bake) ----------
  // ONE PER FERRY ISLAND (islands.ts `transport: 'ferry'`): dock/board/arrive
  // points derived from the mainland's and that island's actual shorelines (no
  // baked-in orientation) — self-corrects at any island placement. Computed
  // here, before the ground displacement below, so the frosting trail that
  // leads kids to each dock can be registered as a flat road corridor first.
  // March out from a bean center along a direction to its shoreline (nd ≈ 1).
  // Shared by the ferry layout and the race bridge layout — both need "where
  // does this island actually end, facing that one?" and neither should bake in
  // an orientation.
  const shoreR = (bean: IslandBean, dirx: number, diry: number): number => {
    let lo = 0;
    let hi = 12000;
    for (let it = 0; it < 24; it += 1) {
      const mid = (lo + hi) / 2;
      if (bean.nd(bean.cx + dirx * mid, bean.cy + diry * mid) < 1) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const computeFerryLayout = (isle: SolvedIsland): FerryLayout => {
    const isleB = islandBeans.find((b) => b.id === isle.id) ?? mainBean;
    const dx = isleB.cx - mainBean.cx;
    const dy = isleB.cy - mainBean.cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len; // mainland → island unit vector
    const uy = dy / len;
    const mainShoreR = shoreR(mainBean, ux, uy); // mainland shore facing the island
    const isleShoreR = shoreR(isleB, -ux, -uy); // island shore facing the mainland
    const mainShore = { x: mainBean.cx + ux * mainShoreR, y: mainBean.cy + uy * mainShoreR };
    const isleShore = { x: isleB.cx - ux * isleShoreR, y: isleB.cy - uy * isleShoreR };
    const DOCK_OUT = 70; // dock sits this far out in the water from the shore
    const BOARD_IN = 80; // board point this far inland from the shore (solid land)
    // The boat is colour-coded to where it goes: the landing land's ribbon.
    // Chess's ribbon is PURPLE = 0xa855f7, the colour its sail always was.
    const landing = findRegion(isle.regions[0]);
    return {
      islandId: isle.id,
      mainlandDockPx: { x: mainShore.x + ux * DOCK_OUT, y: mainShore.y + uy * DOCK_OUT },
      islandDockPx: { x: isleShore.x - ux * DOCK_OUT, y: isleShore.y - uy * DOCK_OUT },
      mainlandBoardPx: { x: mainShore.x - ux * BOARD_IN, y: mainShore.y - uy * BOARD_IN },
      arrivePx: { x: isleB.cx, y: isleB.cy }, // island center — guaranteed dry land
      sailColor: landing ? RIBBON[landing.ribbon] : RIBBON.PURPLE,
      glyph: landing?.landmark ?? '⛴️',
    };
  };

  // The frosting trail that leads kids to a ferry dock: nearest mainland
  // region center → that boat's boarding point. Registered as a road corridor
  // NOW so the terrain bake below keeps it flat (a rolling hill would bury it)
  // and the prop scatter avoids it. The trail meshes are built with the ferry.
  const nearestMainlandCenter = (to: { x: number; y: number }): { x: number; y: number } => {
    let best = cityCenterPx(REGIONS[0].slug);
    let bestD = Infinity;
    for (const r of REGIONS) {
      // The trail starts on the MAINLAND. This used to skip 'chess-club' by
      // name; with a second offshore island (race-isle) that name check would
      // have let a race land win "nearest region" and drawn the ferry's
      // approach trail across the open sea. Ask the island catalog instead, so
      // it stays correct for every island added after this one.
      if (islandOf(r.slug).id !== 'mainland') continue;
      const c = cityCenterPx(r.slug);
      const d = Math.hypot(c.x - to.x, c.y - to.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  };
  /** One ferry line per ferry island: its solved layout and the mainland land
   *  its approach trail starts from. The boats themselves are built later
   *  (after the terrain), from these. */
  interface FerryLine {
    islandId: string;
    /** The landing land — discovered + charged on arrival. */
    regionSlug: string;
    layout: FerryLayout;
    trailFrom: { x: number; y: number };
    ferry: TownFerry;
  }
  const ferryLines: Array<Omit<FerryLine, 'ferry'>> = ferryIslands().map((isle) => {
    const layout = computeFerryLayout(isle);
    const trailFrom = nearestMainlandCenter(layout.mainlandBoardPx);
    roadSegs.push({ ax: trailFrom.x, ay: trailFrom.y, bx: layout.mainlandBoardPx.x, by: layout.mainlandBoardPx.y });
    return { islandId: isle.id, regionSlug: isle.regions[0], layout, trailFrom };
  });

  // ---------- The Sugar Mile: road bridge layout (mainland ↔ Race Island) ----------
  // Same derivation as the ferry docks — march each bean out to its real
  // shoreline along the bearing between them — so the deck lands on solid ground
  // at BOTH ends at whatever placement the layout solver picks. The deck
  // deliberately OVERLAPS each shore by BRIDGE_INLAND_PX so there is no step or
  // gap where road meets beach.
  const bridgeL = ((): { aPx: { x: number; y: number }; bPx: { x: number; y: number } } => {
    const raceB = islandBeans.find((b) => b.id === 'race-isle') ?? mainBean;
    const dx = raceB.cx - mainBean.cx;
    const dy = raceB.cy - mainBean.cy;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len; // mainland → race unit vector
    const uy = dy / len;
    const BRIDGE_INLAND_PX = 150;
    const mainShoreR = shoreR(mainBean, ux, uy) - BRIDGE_INLAND_PX;
    const raceShoreR = shoreR(raceB, -ux, -uy) - BRIDGE_INLAND_PX;
    return {
      aPx: { x: mainBean.cx + ux * mainShoreR, y: mainBean.cy + uy * mainShoreR },
      bPx: { x: raceB.cx - ux * raceShoreR, y: raceB.cy - uy * raceShoreR },
    };
  })();
  /** Deck centre-line as a segment — the capsule the walk gate tests against. */
  const bridgeSeg = {
    ax: bridgeL.aPx.x,
    ay: bridgeL.aPx.y,
    bx: bridgeL.bPx.x,
    by: bridgeL.bPx.y,
  };
  // Keep the terrain flat under the landward approach so a rolling hill doesn't
  // swallow the bridgehead, and so the prop scatter leaves the road clear.
  roadSegs.push({ ...bridgeSeg });

  const WATER_Y = -0.3; // water surface (scene units)
  const UNDERWATER_Y = -1.4; // submerged seabed, hidden under the water plane
  // Jet skis: how deep the hull sits, the dock's authored deck height (see
  // art/blender/jetski-dock.py DECK_Z) and how far above the sea it stands.
  const JETSKI_DRAUGHT_U = 0.12;
  const JETSKI_DECK_TOP_U = 0.7;
  const JETSKI_DECK_ABOVE_WATER_U = 0.42;
  /** A sail ride stays out where the hull floats: a little past the visible
   *  waterline (WATERLINE_ND ≈ 1.039), off every island's beach. */
  const SAIL_MIN_ND = 1.048;
  /** On the beach within this of a dock's rent point → the dock prompt. */
  const JETSKI_REACH_PX = 140;

  // Land surface height: hills inland (y≈0 base, unchanged from the old flat
  // ground so roads/booths keep their clearances), a sandy beach that fades the
  // hills to the waterline near nd≈1, then a quick drop to the seabed at sea.
  const groundHeightPx = (px: number, py: number): number => {
    const nd = islandNd(px, py);
    if (nd < 0.9) return terrainHeightPx(px, py);
    if (nd < 1.0) return terrainHeightPx(px, py) * (1 - (nd - 0.9) / 0.1);
    return clamp01((nd - 1.0) / 0.18) * UNDERWATER_Y;
  };

  // ---------- Ground (raycast plane, displaced into the island) ----------
  // Extend well past the play area so the whole bean + its submerged skirt fit
  // on the mesh; the water plane covers everything beyond.
  // Scale ground resolution with the world span so terrain (esp. the mainland
  // mountain peak) stays smooth as the archipelago spreads — floored at the old
  // 190, capped at 320 for tablet vertex budget (static mesh, built once).
  const GROUND_SEG = Math.min(320, Math.max(190, Math.round((extentXU * 1.9 + 20) * 0.9)));
  const groundGeo = new THREE.PlaneGeometry(extentXU * 1.9 + 20, extentZU * 1.9 + 20, GROUND_SEG, GROUND_SEG);
  // Grain on top of the per-vertex grass/sand colours: a near-white tile the
  // material multiplies in, so one texture works for every terrain colour.
  const groundTex = makeGroundGrain(THREE, renderer, groundGeo.parameters.width / GRAIN_TILE_U, groundGeo.parameters.height / GRAIN_TILE_U);
  // Relief under the grain, baked by art/blender/land-normals.py: buttercream
  // tufts on the grass, brown-sugar wind ripples on the sand. One mesh carries
  // both, so the shader blends the two normal maps by a per-vertex `aSand`
  // weight (0 on grass, 1 by the beach).
  const loadNormal = (url: string, tileU: number): THREE.Texture => {
    const tex = new THREE.TextureLoader().load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tex.repeat.set(groundGeo.parameters.width / tileU, groundGeo.parameters.height / tileU);
    return tex;
  };
  const GRASS_RELIEF_TILE_U = 5; // not a multiple of GRAIN_TILE_U, so the two never line up
  const SAND_RELIEF_TILE_U = 4;
  const grassNormalTex = loadNormal('/textures/town/grass-normal.png', GRASS_RELIEF_TILE_U);
  const sandNormalTex = loadNormal('/textures/town/sand-normal.png', SAND_RELIEF_TILE_U);
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    map: groundTex,
    normalMap: grassNormalTex,
    normalScale: new THREE.Vector2(0.9, 0.9),
  });
  groundMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSandNormal = { value: sandNormalTex };
    // Sand is sampled through the grass map's UV transform, rescaled to its tile.
    shader.uniforms.uSandUvScale = { value: GRASS_RELIEF_TILE_U / SAND_RELIEF_TILE_U };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSand;\nvarying float vSand;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSand = aSand;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSandNormal;\nuniform float uSandUvScale;\nvarying float vSand;')
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        'vec3 mapN = mix( texture2D( normalMap, vNormalMapUv ).xyz, texture2D( uSandNormal, vNormalMapUv * uSandUvScale ).xyz, vSand ) * 2.0 - 1.0;',
      );
  };
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(sceneCenterX, 0, sceneCenterZ);
  ground.receiveShadow = true;
  scene.add(ground);
  // Displace to the island surface (local +Z → world +Y after the −90° X spin)
  // and paint grass → sand → seabed per vertex.
  {
    const posAttr = groundGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    const sandW = new Float32Array(posAttr.count);
    const grass = new THREE.Color(WORLD.TERRAIN_GRASS);
    const sand = new THREE.Color(WORLD.TERRAIN_SAND);
    const seabed = new THREE.Color(WORLD.TERRAIN_SEABED);
    const frosting = new THREE.Color(WORLD.TERRAIN_FROSTING); // pink-white frosting cap
    const tmp = new THREE.Color();
    for (let i = 0; i < posAttr.count; i++) {
      const worldX = sceneCenterX + posAttr.getX(i);
      const worldZ = sceneCenterZ - posAttr.getY(i);
      const p = sceneToPx(worldX, worldZ);
      const h = groundHeightPx(p.x, p.y);
      posAttr.setZ(i, h);
      const nd = islandNd(p.x, p.y);
      if (nd < 0.82) tmp.copy(grass);
      else if (nd < 1.0) tmp.copy(grass).lerp(sand, (nd - 0.82) / 0.18);
      else tmp.copy(sand).lerp(seabed, clamp01((nd - 1.0) / 0.14));
      // Ripples take over a little later than the sand colour, so the grass
      // edge keeps its tufts as it fades to sand.
      sandW[i] = clamp01((nd - 0.86) / 0.1);
      // Frost the upper slopes of the mountain white.
      const frostT = clamp01((h - MTN_H_U * 0.45) / (MTN_H_U * 0.4));
      if (frostT > 0) tmp.lerp(frosting, frostT * 0.92);
      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }
    groundGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    groundGeo.setAttribute('aSand', new THREE.BufferAttribute(sandW, 1));
    posAttr.needsUpdate = true;
    groundGeo.computeVertexNormals();
  }

  // ---------- Candy-prop scatter (fills the open grass) ----------
  // Instanced gumdrops + grass tufts sprinkled across the open ground between
  // regions so the island doesn't read empty. TWO InstancedMeshes = two draw
  // calls total (also two instanced shadow draws) — tablet-cheap. Opaque (no
  // overdraw), fog-faded (StandardMaterial), count-capped, and placed only on
  // GRASS (islandNd < 0.8), OFF region pads / roads / the train ring. Static
  // decor — no per-frame cost, no reduced-motion concern. Seeded RNG so the
  // layout is stable across loads (reads intentional, not random).
  const scatterMeshes: THREE.InstancedMesh[] = [];
  const scatterGeos: THREE.BufferGeometry[] = [];
  const scatterMats: THREE.Material[] = [];
  {
    let seed = 20260719 | 0;
    const rng = (): number => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const onRoad = (px: number, py: number): boolean =>
      roadSegs.some((s) => distToSeg(px, py, s) < 46);
    const onTrack = (px: number, py: number): boolean =>
      Math.abs(Math.hypot((px - trackCx) / trackRx, (py - trackCy) / trackRy) - 1) < 0.05;
    const validSpot = (px: number, py: number): boolean =>
      islandNd(px, py) < 0.8 && // on grass, off the beach/sea
      !flatRects.some((r) => insideRect(px, py, r)) && // off region pads + the soccer field
      !onRoad(px, py) &&
      !onTrack(px, py) && // the mainland's Sugar Express ring
      !onRaceTrack(px, py); // Race Island's circuit

    const GUMDROP_CAP = 140;
    const TUFT_CAP = 260;
    const spots: Array<{ x: number; y: number }> = [];
    const need = GUMDROP_CAP + TUFT_CAP;
    for (let tries = 0; spots.length < need && tries < need * 24; tries += 1) {
      const px = BOUNDS.x0 + rng() * (BOUNDS.x1 - BOUNDS.x0);
      const py = BOUNDS.y0 + rng() * (BOUNDS.y1 - BOUNDS.y0);
      if (validSpot(px, py)) spots.push({ x: px, y: py });
    }

    const dummy = new THREE.Object3D();
    // Gumdrops — low-poly candy nuggets, per-instance candy color, tiny shadows.
    const gumCount = Math.min(GUMDROP_CAP, spots.length);
    if (gumCount > 0) {
      const gumGeo = new THREE.IcosahedronGeometry(0.22, 0);
      const gumMat = new THREE.MeshStandardMaterial({ roughness: 0.35 });
      scatterGeos.push(gumGeo);
      scatterMats.push(gumMat);
      const gum = new THREE.InstancedMesh(gumGeo, gumMat, gumCount);
      gum.castShadow = true;
      const col = new THREE.Color();
      for (let i = 0; i < gumCount; i += 1) {
        const s = spots[i];
        const sc = 0.7 + rng() * 0.7;
        dummy.position.set(pxToSceneX(s.x), groundHeightPx(s.x, s.y) + 0.12 * sc, pxToSceneZ(s.y));
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        gum.setMatrixAt(i, dummy.matrix);
        col.set(SPRINKLE_COLORS[Math.floor(rng() * SPRINKLE_COLORS.length)]);
        gum.setColorAt(i, col);
      }
      gum.instanceMatrix.needsUpdate = true;
      if (gum.instanceColor) gum.instanceColor.needsUpdate = true;
      scene.add(gum);
      scatterMeshes.push(gum);
    }
    // Grass tufts — little pastel cones for ground texture (no shadow, tiny).
    const tuftCount = Math.min(TUFT_CAP, Math.max(0, spots.length - gumCount));
    if (tuftCount > 0) {
      const tuftGeo = new THREE.ConeGeometry(0.13, 0.4, 5);
      const tuftMat = new THREE.MeshStandardMaterial({ color: WORLD.GRASS_TUFT, roughness: 0.9 });
      scatterGeos.push(tuftGeo);
      scatterMats.push(tuftMat);
      const tuft = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
      for (let i = 0; i < tuftCount; i += 1) {
        const s = spots[gumCount + i];
        const sc = 0.7 + rng() * 0.8;
        dummy.position.set(pxToSceneX(s.x), groundHeightPx(s.x, s.y) + 0.2 * sc, pxToSceneZ(s.y));
        dummy.rotation.set(0, rng() * Math.PI * 2, 0);
        dummy.scale.setScalar(sc);
        dummy.updateMatrix();
        tuft.setMatrixAt(i, dummy.matrix);
      }
      tuft.instanceMatrix.needsUpdate = true;
      scene.add(tuft);
      scatterMeshes.push(tuft);
    }
  }

  // ---------- Water (candy-sea plane around the island) ----------
  // Respect reduced-motion for the gentle swell animation below — the surface
  // stays flat and still when set. Same probe as city3d.ts.
  const reduceMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const WATER_SEG = 48; // subdivided so we can paint a depth gradient + roll a swell
  const waterW = extentXU * 3.2 + 40;
  const waterD = extentZU * 3.2 + 40;
  const waterGeo = new THREE.PlaneGeometry(waterW, waterD, WATER_SEG, WATER_SEG);

  // Ripples are a tiling normal map baked from Blender's FFT ocean, smoothed
  // into rounded swells (art/blender/water-normals.py). The sun and the pastel
  // IBL light it, so the highlights move as the camera does. It is used twice
  // at different tile sizes, scrolling different ways: as the surface's
  // normalMap and as the clearcoat's, a sugar-glaze layer over the water. Two
  // layers crossing hide the repeat that one sliding sheet would show.
  const WATER_TILE_U = 9; // scene units per repeat of the base ripples
  const GLAZE_TILE_U = 23; // larger and not a multiple, so the two never line up
  const waterNormalTex = new THREE.TextureLoader().load('/textures/town/water-normal.png');
  waterNormalTex.wrapS = THREE.RepeatWrapping;
  waterNormalTex.wrapT = THREE.RepeatWrapping;
  waterNormalTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  waterNormalTex.repeat.set(waterW / WATER_TILE_U, waterD / WATER_TILE_U);
  const glazeNormalTex = waterNormalTex.clone(); // shares the image, own transform
  glazeNormalTex.repeat.set(waterW / GLAZE_TILE_U, waterD / GLAZE_TILE_U);
  glazeNormalTex.rotation = 0.9;
  // Per-vertex depth gradient keyed to the same islandNd field the ground uses
  // (nd=1.0 at the waterline): a creamy frosting foam rim at the shore → cyan
  // shallows → brand blue mid-sea → deep blue offshore. This is what makes the
  // flat plane read as real, on-brand water instead of a single blue sheet.
  {
    const wp = waterGeo.attributes.position as THREE.BufferAttribute;
    const wcol = new Float32Array(wp.count * 3);
    const shallow = new THREE.Color(WATER.BALLOON_HI); // 0x93c5fd
    const mid = new THREE.Color(WATER.BALLOON); // 0x3b82f6
    const deep = new THREE.Color(WATER.BALLOON_DEEP); // 0x1d4ed8
    const foamC = new THREE.Color(CAKE.FROSTING); // 0xffffff icing rim
    const tmp = new THREE.Color();
    for (let i = 0; i < wp.count; i++) {
      const worldX = sceneCenterX + wp.getX(i);
      const worldZ = sceneCenterZ - wp.getY(i);
      const p = sceneToPx(worldX, worldZ);
      const nd = islandNd(p.x, p.y);
      const deepT = clamp01((nd - 1.0) / 1.2); // 0 at shore → 1 by nd≈2.2
      if (deepT < 0.5) tmp.copy(shallow).lerp(mid, deepT / 0.5);
      else tmp.copy(mid).lerp(deep, (deepT - 0.5) / 0.5);
      // Frosting foam rim, centered just past the shore where the seabed first
      // drops below the water surface (nd≈1.06) so it hugs the visible edge.
      // Kept narrow and light: the moving wash and wave crests in the water
      // shader (below) carry the shoreline, and a wide flat rim hid them.
      const foam = clamp01(1 - Math.abs(nd - 1.05) / 0.07);
      if (foam > 0) tmp.lerp(foamC, foam * 0.45);
      wcol[i * 3] = tmp.r;
      wcol[i * 3 + 1] = tmp.g;
      wcol[i * 3 + 2] = tmp.b;
    }
    waterGeo.setAttribute('color', new THREE.BufferAttribute(wcol, 3));
  }
  const waterMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    color: 0xffffff, // let the vertex gradient carry the hue
    transparent: true,
    opacity: 0.85, // shallows reveal the wet sandbar beneath
    roughness: 0.22, // broad soft highlights under the glaze
    metalness: 0.1,
    normalMap: waterNormalTex,
    normalScale: new THREE.Vector2(0.55, 0.55),
    clearcoat: 0.8,
    clearcoatRoughness: 0.06, // the glaze carries the crisp sun glint
    clearcoatNormalMap: glazeNormalTex,
    clearcoatNormalScale: new THREE.Vector2(0.35, 0.35),
  });

  // Shore detail and player rings, drawn per pixel in the water shader.
  //  - Lapping waves: thin foam crests roll in toward every shore and fade as
  //    they arrive, and the wash at the waterline creeps up and back. Both are
  //    keyed to islandNd, which the shader reads from a small baked field
  //    (SHORE_FIELD_PX², over the ground's extent; the open sea beyond it is
  //    past the foam zone anyway). The 48-segment mesh is far too coarse to
  //    carry a crisp foam line, which is why this isn't per vertex.
  //  - Player rings: soft rings spread outward from the player over the water.
  //    uPlayer.z is their strength, set each frame from how close the player
  //    is to the water and whether they're moving (see tick).
  // The visible waterline sits where the sloping seabed crosses WATER_Y.
  const WATERLINE_ND = 1.0 + 0.18 * (-WATER_Y / -UNDERWATER_Y);
  const WAKE_POINTS = 24;
  const WAKE_LIFE_S = 1.6; // a point's ring is gone this long after it was dropped
  const WAKE_EVERY_MS = 66; // 24 points x 66 ms covers the whole life
  const SHORE_ND0 = 0.95; // field encodes nd over [SHORE_ND0, SHORE_ND0 + SHORE_ND_SPAN]
  const SHORE_ND_SPAN = 0.5;
  const SHORE_FIELD_PX = 256; // ~50 ms of islandNd at startup on a desktop; 512 was ~210
  const shoreW = groundGeo.parameters.width;
  const shoreD = groundGeo.parameters.height;
  const shoreField = (() => {
    const data = new Uint8Array(SHORE_FIELD_PX * SHORE_FIELD_PX);
    for (let j = 0; j < SHORE_FIELD_PX; j++) {
      const worldZ = sceneCenterZ - shoreD / 2 + ((j + 0.5) / SHORE_FIELD_PX) * shoreD;
      for (let i = 0; i < SHORE_FIELD_PX; i++) {
        const worldX = sceneCenterX - shoreW / 2 + ((i + 0.5) / SHORE_FIELD_PX) * shoreW;
        const p = sceneToPx(worldX, worldZ);
        data[j * SHORE_FIELD_PX + i] = Math.round(clamp01((islandNd(p.x, p.y) - SHORE_ND0) / SHORE_ND_SPAN) * 255);
      }
    }
    const tex = new THREE.DataTexture(data, SHORE_FIELD_PX, SHORE_FIELD_PX, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  })();
  const waterUniforms = {
    uTime: { value: 0 },
    uShore: { value: shoreField },
    uShoreOrigin: { value: new THREE.Vector2(sceneCenterX - shoreW / 2, sceneCenterZ - shoreD / 2) },
    uShoreSize: { value: new THREE.Vector2(shoreW, shoreD) },
    uPlayer: { value: new THREE.Vector3(0, 0, 0) },
    // Jet ski wake: the ski's recent positions (x, z), each point's age in
    // seconds and its strength (0 = unused). Filled in tick.
    uWake: { value: Array.from({ length: WAKE_POINTS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };
  waterMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vWaterXZ;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vWaterXZ;
uniform float uTime;
uniform sampler2D uShore;
uniform vec2 uShoreOrigin;
uniform vec2 uShoreSize;
uniform vec3 uPlayer;
uniform vec4 uWake[ ${WAKE_POINTS} ];
vec3 ringN = vec3( 0.0 ); // view-space nudge from the player rings, shared by both normal layers`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float nd = ${SHORE_ND0.toFixed(3)} + texture2D( uShore, ( vWaterXZ - uShoreOrigin ) / uShoreSize ).r * ${SHORE_ND_SPAN.toFixed(3)};
  float s = nd - ${WATERLINE_ND.toFixed(4)}; // > 0 offshore, 0 at the waterline
  float breakup = texture2D( normalMap, vNormalMapUv * 0.31 ).r; // ripple map doubles as foam noise
  // Crests: bands of constant distance from shore, travelling shoreward.
  float w = fract( s * 11.0 + uTime * 0.16 + breakup * 0.45 );
  float crest = smoothstep( 0.72, 0.86, w ) * ( 1.0 - smoothstep( 0.86, 0.97, w ) );
  crest *= ( 1.0 - smoothstep( 0.04, 0.2, s ) ) * smoothstep( 0.0, 0.03, s );
  crest *= smoothstep( 0.35, 0.6, breakup + 0.15 ); // broken, not ruled lines
  // Wash: foam hugging the waterline, its outer edge creeping up and back.
  // The phase drifts along the coast so the whole shore doesn't breathe at once.
  float lap = 0.5 + 0.5 * sin( uTime * 0.9 + ( vWaterXZ.x + vWaterXZ.y ) * 0.11 + breakup * 2.0 );
  float wash = 1.0 - smoothstep( 0.008 + 0.022 * lap, 0.02 + 0.03 * lap, s );
  float foam = max( wash * 0.95, crest * 0.85 );
  // Player rings: lighter crests where the rings peak.
  vec2 dp = vWaterXZ - uPlayer.xy;
  float d = length( dp );
  float env = uPlayer.z * exp( -d * 0.35 ) * smoothstep( 0.2, 0.7, d );
  float phase = d * 4.5 - uTime * 2.2;
  foam = max( foam, smoothstep( 0.6, 1.0, sin( phase ) ) * env * 0.55 );
  // Jet ski wake: every dropped point spreads a foam ring that widens and
  // fades as it ages, with churned water at its centre. The ski outruns the
  // rings, so together they trail behind it as a V with a white track down
  // the middle.
  float wk = 0.0;
  for ( int i = 0; i < ${WAKE_POINTS}; i++ ) {
    vec4 wp = uWake[ i ];
    if ( wp.w <= 0.0 ) continue;
    float wd = length( vWaterXZ - wp.xy );
    float life = 1.0 - wp.z / ${WAKE_LIFE_S.toFixed(2)};
    float r = 0.18 + wp.z * 1.25;
    float band = 1.0 - smoothstep( 0.0, 0.1 + wp.z * 0.14, abs( wd - r ) );
    float churn = 1.0 - smoothstep( 0.0, 0.34, wd );
    wk = max( wk, max( band * life * life * 0.85, churn * life ) * wp.w );
  }
  foam = max( foam, wk * smoothstep( 0.2, 0.7, breakup + 0.3 ) );
  vec2 dir = dp / max( d, 1e-3 );
  float slope = cos( phase ) * env * 0.45;
  ringN = ( viewMatrix * vec4( dir.x * slope, 0.0, dir.y * slope, 0.0 ) ).xyz;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.985, 0.97 ), foam );
  diffuseColor.a = max( diffuseColor.a, foam );
}`,
      )
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize( normal + ringN );')
      .replace(
        '#include <clearcoat_normal_fragment_maps>',
        '#include <clearcoat_normal_fragment_maps>\nclearcoatNormal = normalize( clearcoatNormal + ringN );',
      );
  };
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(sceneCenterX, WATER_Y, sceneCenterZ);
  scene.add(water);
  // Captured for the per-frame gentle swell (see tick).
  const waterPos = waterGeo.attributes.position as THREE.BufferAttribute;
  // The swell's height in the plane's own coordinates (it lies rotated -90deg
  // about X, so local y is world -z), and the same at a scene point, so a jet
  // ski can ride the surface the kid sees. Flat under reduced-motion.
  const swellLocal = (x: number, y: number, t: number): number =>
    0.08 * (Math.sin(x * 0.03 + t * 0.0016) + 0.5 * Math.sin(y * 0.045 + t * 0.0011));
  const swellAt = (sx: number, sz: number): number =>
    reduceMotion ? 0 : swellLocal(sx - water.position.x, -(sz - water.position.z), walkClock);

  // ---------- Frosting Mountain cherry topper ----------
  const mtnGeos: THREE.BufferGeometry[] = [];
  const mtnMats: THREE.Material[] = [];
  const mtnGroup = new THREE.Group();
  {
    const peakY = terrainHeightPx(mtnCenter.x, mtnCenter.y); // ground height at the summit
    const bx = pxToSceneX(mtnCenter.x);
    const bz = pxToSceneZ(mtnCenter.y);
    const stemGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a7c2f, roughness: 0.7 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(bx, peakY + 1.15, bz);
    stem.rotation.z = 0.25;
    mtnGroup.add(stem);
    const cherryGeo = new THREE.SphereGeometry(0.55, 18, 14);
    const cherryMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.28, metalness: 0.1 });
    const cherry = new THREE.Mesh(cherryGeo, cherryMat);
    cherry.position.set(bx, peakY + 0.55, bz);
    cherry.castShadow = true;
    mtnGroup.add(cherry);
    mtnGeos.push(stemGeo, cherryGeo);
    mtnMats.push(stemMat, cherryMat);
  }
  scene.add(mtnGroup);

  // ---------- Authored art registry ----------
  // Hands out clones of Blender-authored GLBs synchronously, so city3d and the
  // land-structure rebuild on upgrade (which cannot await a fetch) can use
  // them. Normally preloaded by the host (preloadTownArt); a registry created
  // here would still be loading while the city below is built, so only a
  // later rebuild could pick its models up.
  const authored = authoredArt ?? createTownArtRegistry(THREE);

  // ---------- City (regions, roads, booths, fog) ----------
  const discovered = new Set<string>(props.discovered);
  const city = createCity3D(THREE, {
    authored,
    discovered,
    landCupcakes: props.landCupcakes ?? {},
    landLevels: props.landLevels ?? {},
    ownedLandSlug: props.ownedLandSlug,
    // city3d scatters its lollipop trees + candy props across the whole
    // archipelago bounding box and cannot itself tell land from sea, so 42% of
    // them stood in open water and one grew out of the Sugar Mile's deck. The
    // engine owns the island field, the roads and the race circuit, so it
    // supplies the test. 95px clears the bridge deck (half-width 78) — the
    // scatter's own 46px road radius was not wide enough to keep a tree off it.
    canPlaceDecor: (px: number, py: number): boolean =>
      islandNd(px, py) < 0.82 &&
      !flatRects.some((r) => insideRect(px, py, r)) &&
      !roadSegs.some((s) => distToSeg(px, py, s) < 95) &&
      !onRaceTrack(px, py),
  });
  scene.add(city.group);
  const occluderFader = createOccluderFader(THREE, city.occluders);
  const occTarget = new THREE.Vector3();

  // ---------- Town builds (kid-placed roads + small structures) ----------
  // The family's pieces, drawn as instances (builds3d.ts), and the grid rules
  // only the engine can check because only it knows the terrain. The plot rule
  // (not on a sibling's land) is shared with the server in @/lib/town/builds.
  const ownLandRegion = props.ownedLandSlug ? findRegion(props.ownedLandSlug) : undefined;
  const ownLandRect = ownLandRegion ? cityRectPx(ownLandRegion) : null;
  const siblingLands = new Set(props.siblingLands ?? []);
  /** Build height: the terrain, or the top of the land pad on your own land. */
  const buildHeightAt = (px: number, py: number): number =>
    ownLandRect && insideRect(px, py, ownLandRect) ? 0.12 : terrainHeightPx(px, py);
  const buildLayer = createBuildLayer(THREE, buildHeightAt, reduceMotion, authored);
  scene.add(buildLayer.group);
  let builds: TownBuild[] = props.builds ?? [];
  let buildCells = new Set(builds.map((b) => cellKey(b.gx, b.gy)));
  buildLayer.setBuilds(builds);

  /** Why a piece can't go on this square, or null if it can. */
  const buildCellProblem = (gx: number, gy: number): BuildProblem | null => {
    if (buildCells.has(cellKey(gx, gy))) return 'taken';
    if (siblingLandAt(gx, gy, siblingLands)) return 'sibling';
    const c = cellCenterPx(gx, gy);
    // All four corners must be dry land too, so nothing hangs over the beach.
    const h = CELL_PX / 2;
    for (const [dx, dy] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) {
      if (islandNd(c.x + dx, c.y + dy) >= 0.8) return 'water';
    }
    // Nearest land must be open: no building next to a fogged or storm-locked one.
    let near: { slug: string; d: number } | null = null;
    for (const r of REGIONS) {
      const d = distToRect(c.x, c.y, cityRectPx(r));
      if (!near || d < near.d) near = { slug: r.slug, d };
    }
    if (near && city.isFogged(near.slug)) return 'locked';
    if (city.booths.some((b) => Math.hypot(b.posPx.x - c.x, b.posPx.y - c.y) < 90)) return 'busy';
    if (ownLandRegion && ownLandRect && insideRect(c.x, c.y, ownLandRect)) {
      // Your own land: anywhere on the pad except the centre (your cupcake and
      // its cottage/tower/castle) and the arch at the back edge.
      const oc = cityCenterPx(ownLandRegion.slug);
      const gateY = oc.y - (ownLandRect.y1 - ownLandRect.y0) * 0.42;
      if (Math.hypot(c.x - oc.x, c.y - oc.y) < 150) return 'busy';
      if (Math.hypot(c.x - oc.x, c.y - gateY) < 100) return 'busy';
      return null;
    }
    if (flatRects.some((r) => distToRect(c.x, c.y, r) < h * 0.5)) return 'busy';
    if (roadSegs.some((s) => distToSeg(c.x, c.y, s) < 40 + h * 0.5)) return 'road';
    if (Math.abs(Math.hypot((c.x - trackCx) / trackRx, (c.y - trackCy) / trackRy) - 1) < 0.07) return 'road';
    if (onRaceTrack(c.x, c.y)) return 'road';
    return null;
  };

  /** The free square nearest `start` (ring by ring, out to BUILD_SEEK_RINGS),
   *  or `start` itself if there is none. Opening the tray beside a shop used to
   *  greet the kid with "Too close to a shop" before they had picked anything. */
  const BUILD_SEEK_RINGS = 6;
  const nearestBuildableCell = (start: { gx: number; gy: number }): { gx: number; gy: number } => {
    for (let r = 0; r <= BUILD_SEEK_RINGS; r++) {
      let best: { gx: number; gy: number } | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const c = { gx: start.gx + dx, gy: start.gy + dy };
          if (buildCellProblem(c.gx, c.gy) !== null) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
      if (best) return best;
    }
    return start;
  };

  /** Build mode: which tool is out, its turn, and the square it's aimed at. */
  let buildTool: { tool: BuildKind | 'remove'; rot: number } | null = null;
  let buildCell: { gx: number; gy: number } | null = null;
  const refreshGhost = (): void => {
    if (!buildTool || !buildCell) {
      buildLayer.setGhost(null);
      return;
    }
    const { gx, gy } = buildCell;
    if (buildTool.tool === 'remove') {
      const has = buildCells.has(cellKey(gx, gy));
      buildLayer.setGhost({ kind: 'remove', gx, gy, rot: 0, ok: has });
      cb.onBuildAim?.({ gx, gy, problem: has ? null : 'empty' });
      return;
    }
    const problem = buildCellProblem(gx, gy);
    buildLayer.setGhost({ kind: buildTool.tool, gx, gy, rot: buildTool.rot, ok: problem === null });
    cb.onBuildAim?.({ gx, gy, problem });
  };

  // ---------- Race Island's speedway dressing ----------
  // The start/finish is aligned to wherever the Sugar Mile actually lands, so
  // crossing the bridge delivers you onto the main straight over the chequer
  // rather than into an empty field. Both ends are solved, so this holds if the
  // island or the bridge bearing ever moves.
  const raceIsle: RaceIsle | null = (() => {
    if (!raceTrack) return null;
    const pitRow = findRegion('race-pit-row');
    const victory = findRegion('race-victory-lane');
    if (!pitRow || !victory) return null;
    // Half-extents from cityRectPx (already imported) rather than pulling in
    // layout-core's regionRectHalf for a single call.
    const pr = cityRectPx(pitRow);
    return makeRaceIsle(THREE, {
      track: raceTrack,
      pitRowPx: cityCenterPx(pitRow.slug),
      victoryLanePx: cityCenterPx(victory.slug),
      padHalfPx: { hw: (pr.x1 - pr.x0) / 2, hh: (pr.y1 - pr.y0) / 2 },
      finishT: raceTrack.nearestT(bridgeL.bPx),
      reduceMotion,
    });
  })();
  if (raceIsle) scene.add(raceIsle.group);

  // ---------- Authored art (Blender → GLB) ----------
  // The first real asset dropped into the procedurally-built town. Everything
  // here is deliberately additive and failure-tolerant: the load is async and
  // off the critical path, so if the file 404s or the GPU rejects it the town
  // renders exactly as it did before and the kid never sees a difference.
  //
  // Placed beside the cookie-corner word-memory booth because that is the dome's
  // own declared identity (see the asset manifest). It is scenery only — the
  // procedural booth still owns the tap target, so gameplay is untouched.
  let authoredDome: AuthoredModel | null = null;
  let authoredDisposed = false;
  {
    const boothPx = city.booths.find((b) => b.gameSlug === 'word-memory')?.posPx;
    if (boothPx) {
      const spotPx = { x: boothPx.x + AUTHORED_DOME_OFFSET_PX, y: boothPx.y };
      loadAuthoredModel(THREE, AUTHORED_GAME_DOME_URL, { targetHeightU: 2.4 })
        .then((model) => {
          // The engine may have been torn down while the GLB was in flight.
          if (authoredDisposed) {
            model.dispose();
            return;
          }
          model.root.position.set(
            pxToSceneX(spotPx.x),
            terrainHeightPx(spotPx.x, spotPx.y),
            pxToSceneZ(spotPx.y),
          );
          model.root.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          scene.add(model.root);
          authoredDome = model;
        })
        .catch((error: unknown) => {
          // Decorative only — never escalate.
          console.warn('[town] authored model failed to load:', error);
        });
    }
  }

  // Pier decks (city-px) — walkable over deep water once their region is
  // discovered (a starter or in the `discovered` set). Drives avatar wading +
  // pier entry gating below.
  const pierDecks = city.pierDecks;
  // The submarine jetty's deck. It is NOT in city.pierDecks -- makeSubDock is
  // called from here, not from city3d -- and until the deck was laid out to
  // sea that did not matter, because it stood on sand and the ordinary ground
  // walk carried the kid along it. Now it ends in open water, so without this
  // the jetty would be a walkway the kid cannot set foot on. Assigned after
  // the dock is built, a few hundred lines below; the gate is the same one
  // that decides whether the dock exists at all.
  let subDeckContains: ((px: number, py: number) => boolean) | null = null;

  const onWalkablePier = (px: number, py: number): boolean =>
    subDeckContains?.(px, py) === true ||
    pierDecks.some(
      (d) =>
        ((findRegion(d.slug)?.starter ?? false) || discovered.has(d.slug)) &&
        // ORIENTED, not insideRect: the sub jetty is laid on a bearing, and its
        // bounding rect covers two triangles of open sea beside the deck.
        d.contains(px, py),
    );

  // ---------- Wade ripples (splash rings while the cupcake paddles) ----------
  interface Ripple {
    mesh: THREE.Mesh;
    life: number;
  }
  const ripples: Ripple[] = [];
  const rippleGeo = new THREE.RingGeometry(0.16, 0.3, 20);
  const RIPPLE_LIFE = 0.75;
  let rippleTimer = 0;
  const spawnRipple = (sx: number, sz: number): void => {
    const mat = new THREE.MeshBasicMaterial({
      color: WATER.SPLASH,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(rippleGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(sx, WATER_Y + 0.03, sz);
    scene.add(m);
    ripples.push({ mesh: m, life: RIPPLE_LIFE });
  };
  const updateRipples = (dt: number): void => {
    const dts = dt / 1000;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.life -= dts;
      const k = 1 - rp.life / RIPPLE_LIFE; // 0 → 1
      rp.mesh.scale.setScalar(0.6 + k * 2.6);
      (rp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      if (rp.life <= 0) {
        scene.remove(rp.mesh);
        (rp.mesh.material as THREE.Material).dispose();
        ripples.splice(i, 1);
      }
    }
  };

  // ---------- Tap-destination ring (visible feedback for every walk/ride tap) ----------
  // Sound-only tap feedback fails on an iPad with the volume off — kids re-tap,
  // which restarts pathing and reads as "it's not listening." A quick warm
  // frosting ring at the tapped point (reusing the wade-ripple geometry) shows
  // exactly where the cupcake is headed. User-driven feedback, so it still runs
  // under reduced-motion — just as a short static ring instead of a growing one.
  interface TapRing {
    mesh: THREE.Mesh;
    life: number;
    max: number;
  }
  const tapRings: TapRing[] = [];
  const TAP_RING_LIFE = 0.45;
  const spawnTapRing = (px: number, py: number): void => {
    const mat = new THREE.MeshBasicMaterial({
      color: WORLD.GLOW_WARM,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(rippleGeo, mat);
    m.rotation.x = -Math.PI / 2;
    // Sits on the ground; a fly-ride tap over open sea rings the water surface.
    const gy = Math.max(groundHeightPx(px, py), WATER_Y);
    m.position.set(pxToSceneX(px), gy + 0.06, pxToSceneZ(py));
    const life = reduceMotion ? 0.22 : TAP_RING_LIFE;
    if (reduceMotion) m.scale.setScalar(1.7); // static ring, no growth
    scene.add(m);
    tapRings.push({ mesh: m, life, max: life });
  };
  const updateTapRings = (dt: number): void => {
    const dts = dt / 1000;
    for (let i = tapRings.length - 1; i >= 0; i--) {
      const t = tapRings[i];
      t.life -= dts;
      const k = 1 - t.life / t.max;
      if (!reduceMotion) t.mesh.scale.setScalar(0.6 + k * 2.4);
      (t.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (t.life <= 0) {
        scene.remove(t.mesh);
        (t.mesh.material as THREE.Material).dispose();
        tapRings.splice(i, 1);
      }
    }
  };

  // ---------- Avatar ----------
  const kidEmoji = undefined; // name-tag emoji is optional; host passes none for now
  const avatar = createAvatar(THREE, kidEmoji, props.cupcakeConfig);
  scene.add(avatar.group);

  // ---------- Cakey (wandering mascot NPC) ----------
  // The self-aware cake guide ambles the discovered island and, when tapped,
  // opens his talk panel (trivia / What's New) via cb.onCakeyTap. He reuses the
  // kid avatar's locomotion (stepAvatarToward), the same collision (blockedAt),
  // and the same terrain sampling as everything else that rests on the ground.
  const cakey = createCakey(THREE, { reduceMotion });
  scene.add(cakey.group);
  // He starts procedural and swaps to the rigged Blender model when it lands.
  // A missing or broken GLB just leaves him procedural. If the engine is torn
  // down first, attachRig disposes the late model itself.
  loadAuthoredModel(THREE, CAKEY_RIG_URL, { groundAndCentre: false })
    .then((model) => cakey.attachRig(model))
    .catch((error: unknown) => {
      console.warn('[town] rigged Cakey failed to load; staying procedural:', error);
    });
  const cakeyStart = cityCenterPx('town-square'); // a starter region → always walkable
  const cakeyPos = { x: cakeyStart.x, y: cakeyStart.y };
  let cakeyTarget: { x: number; y: number } | null = null;
  let cakeyPauseLeft = 1400; // brief dwell before his first stroll
  let cakeyPaused = false; // frozen while a talk panel is open
  let cakeyCelebrateLeft = 0; // ms Cakey holds his 'celebrate' face after an unlock/upgrade
  const cakeyAnchor = new THREE.Vector3(); // reused for the screen-anchor projection

  // ---------- Weather (ambient sky director + the mysterious-force storm) ----------
  // weather.ts owns the LOOK (sky/fog/light crossfade + precip + rainbow); the
  // director + storm gameplay (target land, re-fog, re-lock, token-clear) live
  // here. A storm suspends the ambient director until it resolves.
  const isCoarsePointer =
    typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const weather = createWeather(THREE, {
    scene,
    ambient,
    hemi,
    sun,
    skyMat: skyDomeMat,
    reduceMotion,
    precipCap: isCoarsePointer ? PRECIP_CAP_TABLET : PRECIP_CAP_DESKTOP,
    center: { x: sceneCenterX, z: sceneCenterZ },
  });
  let weatherDwellLeft = 14_000; // first ambient change comes shortly after entry
  let lastKind: WeatherKind = 'sunny';
  let stormLockedSlug: string | null = null; // land currently re-locked by a storm
  let stormRect: RectPx | null = null; // its rect, so blockedAt walls it off
  let stormLeftMs = 0; // remaining free auto-clear time
  // Storm cooldown, counted in PLAYING TIME and persisted across town remounts.
  // A per-mount clock would reset every time a kid walks into a game and back,
  // so an hour-long gap measured on one would never elapse — a kid rarely spends
  // an unbroken hour in the town itself. Seeded from the tab session, ticked
  // below, and reset to 0 when a storm ends.
  let sinceStormMs = getTownSessionSinceStorm();
  let sinceStormSaveMs = 0; // throttles the write-back
  let currentStormApproach = false; // debounces the clear-storm prompt
  const emitWeather = (kind: WeatherKind): void => {
    weather.setWeather(kind);
    cb.onWeatherChange?.(kind);
  };

  // ---------- Train (Sugar Express — loops the outer perimeter, 5 stops) ----------
  const train = createTrain(THREE);
  scene.add(train.group);
  // Hop on within this of the train. Widened from 95 when the station stops
  // were removed: the train no longer dwells anywhere, so this radius IS the
  // boarding window. At 300px/s, 95px gave a 0.6s chance once per ~67s lap —
  // far too sharp for a 6-year-old. 210px restores ~1.4s, about what the old
  // 1.6s station dwell allowed. Kids now flag down the train anywhere on the
  // ring rather than walking to one of 5 platforms.
  const BOARD_R_PX = 210;
  const RIDE_Y = TRAIN_RIDE_Y; // cupcake stands on the raised ride-platform floor
  let riding = false;
  let nearTrain = false;

  // ---------- The Cakey Ferries (one per ferry island) ----------
  // A directed boat across the OPEN SEA between the mainland and each ferry
  // island (Chess, Puzzle). Real sea (min-of-beans) makes ferry/fly the only
  // ways onto them; a ferry glues the avatar like the train and discovers its
  // island on arrival. The layouts (docks/board/arrive) were computed early,
  // before the terrain bake — see computeFerryLayout up by the island beans.
  const ferries: FerryLine[] = ferryLines.map((l) => ({ ...l, ferry: createFerry(THREE, reduceMotion, l.layout) }));
  for (const line of ferries) scene.add(line.ferry.group);
  const FERRY_BOARD_R_PX = 120; // board within this of a docked ferry
  /** The boat the kid is aboard, or null on land. */
  let ferrying: FerryLine | null = null;
  /** The docked boat within boarding range, or null. */
  let nearFerry: FerryLine | null = null;
  /** What the host needs to know about a boat in range. */
  const ferryPrompt = (line: FerryLine): FerryPrompt => ({
    islandId: line.islandId,
    regionSlug: line.regionSlug,
    returning: line.ferry.getDockedAt() !== MAINLAND_STOP,
  });

  // ---------- The submarine dock (Caramel Cove) ----------
  // Built ONLY if the cove is already discovered. That is the whole access
  // rule: the ocean rides on the land's existing DEEP unlock cost, so there is
  // no second gate to keep in sync, and a kid who has not bought the cove sees
  // no submarine rather than a locked one. It is not revealed live by
  // revealRegion() either — buying the cove mid-session leaves the dock absent
  // until the next visit, which is the same deal the piers already make.
  const coveRegion = findRegion(SUB_DOCK_REGION);
  const coveOpen = !!coveRegion && (coveRegion.starter || discovered.has(SUB_DOCK_REGION));
  // WHERE THE JETTY STANDS: at the head of the bay, on its axis.
  //
  // It used to hang off the cove region's east edge, which was fine while the
  // coast was a smooth curve. Now that there is a notch, that anchor sits ~7
  // degrees off the bay's axis and well inland of its head, so a deck laid down
  // the axis started 300px inside the land and crossed the shoreline late.
  // Standing it on the axis is both shorter and the thing a harbour actually
  // is: a jetty at the back of a bay, pointing out of the mouth.
  //
  // All of it derived from the solved island -- bearing, shoreline distance and
  // anchor -- so the dock follows the coast if the layout ever moves.
  const subIsland = coveRegion ? islandOf(SUB_DOCK_REGION) : null;
  const subBayAng =
    subIsland?.cove?.ang ??
    (subIsland && coveRegion
      ? Math.atan2(
          cityCenterPx(SUB_DOCK_REGION).y - subIsland.center.y,
          cityRectPx(coveRegion).x1 - subIsland.center.x,
        )
      : 0);
  const subDockOriginPx =
    subIsland && coveRegion
      ? (() => {
          const shoreR = beanShoreDist(
            subIsland.halfW,
            subIsland.halfH,
            subIsland.pad,
            subIsland.stretch,
            subBayAng,
            subIsland.cove,
          );
          // Just inland of the waterline, so the deck's root is on dry sand and
          // a kid can step onto it from the beach.
          const r = shoreR * SUB_DOCK_ROOT_FRAC;
          return {
            x: subIsland.center.x + Math.cos(subBayAng) * r,
            y: subIsland.center.y + Math.sin(subBayAng) * r,
          };
        })()
      : null;
  const subDock =
    coveRegion && coveOpen && subDockOriginPx
      ? makeSubDock(THREE, {
          originPx: subDockOriginPx,
          waterY: WATER_Y,
          headingRad: subBayAng,
        })
      : null;
  if (subDock) {
    scene.add(subDock.group);
    subDeckContains = subDock.containsPx;
  }
  let nearSub = false;

  // ---------- The Sugar Mile (road bridge to Race Island) ----------
  // Geometry only; the ACCESS RULE lives in the walk gate below (see
  // mayUseRoad). The boom is driven each frame from that same predicate, so what
  // the kid sees and what the collision does can never drift apart.
  const bridge = makeBridge(THREE, {
    aPx: bridgeL.aPx,
    bPx: bridgeL.bPx,
    waterY: WATER_Y,
    reduceMotion,
  });
  scene.add(bridge.group);

  // ---------- The Sugar Mile Bus ----------
  // Public transit, NOT a rental (see bus.ts): no VehicleKind, nothing to own,
  // always parked at its stop. The ferry's twin — board, ride, arrive.
  // Set down at the island's centre — guaranteed dry land, well clear of the
  // deck, the same guarantee the ferry's arrivePx gives on Chess.
  const busArrivePx = raceBean ? { x: raceBean.cx, y: raceBean.cy } : bridgeL.bPx;
  const bus = createBus(THREE, reduceMotion, {
    mainlandStopPx: bridgeL.aPx,
    raceStopPx: bridgeL.bPx,
    arrivePx: busArrivePx,
  });
  scene.add(bus.group);
  const BUS_BOARD_R_PX = 130; // board within this of the parked bus
  let busing = false;
  let nearBus = false;
  /** Kid's Sugar Token balance, pushed in by the host (see setBalance). Starts
   *  at 0 so an un-wired host can never hand out a land for free. */
  let balance = 0;

  // ---------- Ferry wayfinding: frosting trail + glowing dock signpost ----------
  // The voyage to an island is the archipelago's flagship feature, but the
  // dock used to be an unmarked plank pad a kid had to stumble within 120px of.
  // Now a piped-frosting trail (same recipe as the city3d region trails) leads
  // from the nearest land to each boarding point, where a candy-cane signpost
  // with a ⛴️ board in that island's colour and a warm glow says "the adventure
  // starts here." One per ferry line; they share the disposal lists.
  const ferryWayGeos: THREE.BufferGeometry[] = [];
  const ferryWayMats: THREE.Material[] = [];
  const ferryWayTexs: THREE.Texture[] = [];
  const ferryWayGroup = new THREE.Group();
  scene.add(ferryWayGroup);
  for (const line of ferries) {
    const ferryL = line.layout;
    const ferryTrailFrom = line.trailFrom;
    const ax = pxToSceneX(ferryTrailFrom.x);
    const az = pxToSceneZ(ferryTrailFrom.y);
    const bx = pxToSceneX(ferryL.mainlandBoardPx.x);
    const bz = pxToSceneZ(ferryL.mainlandBoardPx.y);
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const trail = new THREE.Group();
    trail.position.set((ax + bx) / 2, 0.04, (az + bz) / 2);
    trail.rotation.y = -Math.atan2(dz, dx);
    const { mat: pathBase, tex: pathTex } = pathMat(THREE, WORLD.FROSTING_PATH);
    const pathEdge = frostingMat(THREE, WORLD.FROSTING_PATH_EDGE);
    ferryWayMats.push(pathBase, pathEdge);
    ferryWayTexs.push(pathTex);
    const baseGeo = pathRibbonGeo(THREE, len, 0.06, 0.9);
    const railGeo = new THREE.BoxGeometry(len, 0.1, 0.16);
    ferryWayGeos.push(baseGeo, railGeo);
    const base = new THREE.Mesh(baseGeo, pathBase);
    base.receiveShadow = true;
    trail.add(base);
    for (const rz of [-0.42, 0.42]) {
      const rail = new THREE.Mesh(railGeo, pathEdge);
      rail.position.set(0, 0.015, rz);
      trail.add(rail);
    }
    ferryWayGroup.add(trail);

    // Signpost at the boarding point, nudged off the trail line.
    const post = new THREE.Group();
    const sx = pxToSceneX(ferryL.mainlandBoardPx.x);
    const sz = pxToSceneZ(ferryL.mainlandBoardPx.y);
    post.position.set(sx + 0.7, 0, sz);
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 1.7, 10);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    ferryWayGeos.push(poleGeo);
    ferryWayMats.push(poleMat);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 0.85;
    pole.castShadow = true;
    post.add(pole);
    const boardGeo = new THREE.BoxGeometry(1.0, 0.62, 0.1);
    const boardMat = candyMat(THREE, ferryL.sailColor); // the island's colour, matching the sail
    ferryWayGeos.push(boardGeo);
    ferryWayMats.push(boardMat);
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.y = 1.55;
    board.castShadow = true;
    post.add(board);
    // ⛴️ above the board says "boat"; the island's own badge beside it says
    // WHICH boat — the same glyph that flies from that ferry's masthead, so the
    // signpost and the boat it points at read as one thing.
    const glyph = emojiSprite(THREE, '⛴️', 0.95);
    ferryWayTexs.push(glyph.tex);
    ferryWayMats.push(glyph.mat);
    glyph.sprite.position.set(-0.3, 2.35, 0);
    post.add(glyph.sprite);
    const dest = emojiSprite(THREE, ferryL.glyph, 0.7);
    ferryWayTexs.push(dest.tex);
    ferryWayMats.push(dest.mat);
    dest.sprite.position.set(0.45, 2.3, 0.05);
    post.add(dest.sprite);
    // Warm glow halo so the dock reads from across the island (fake bloom).
    const halo = glowSprite(THREE, WORLD.GLOW_WARM, 2.6, 0.4);
    ferryWayTexs.push(halo.tex);
    ferryWayMats.push(halo.mat);
    halo.sprite.position.y = 1.9;
    post.add(halo.sprite);
    ferryWayGroup.add(post);
  }

  // ---------- Rideable vehicles (rented from the Cakey Garage) ----------
  // Mount/dismount mirrors the train's `riding` flag, but a vehicle is a SEPARATE
  // mode: pointer input stays live (you steer/tap to drive/fly it), so the walk
  // handlers gate on `riding` (train) only, and the tick routes movement through
  // the vehicle branch whenever `vehicleKind` is set. 'drive' rides obey the same
  // walls as walking (applyMove); 'fly' rides climb to a cruise altitude and
  // ignore ground collision. Built on mount, disposed on dismount (only one ever
  // exists), so the fleet's meshes cost nothing until a kid actually rents one.
  // Builders come from VEHICLE_BUILDERS (./vehicles), plus the jet ski: Blender
  // art from this town's registry. take() clones share the registry's geometry
  // and materials, so its arrays are EMPTY: finalizeDismount's dispose loops
  // must not free what the moored skis at the docks are still drawing with.
  const rideBuilders: Record<VehicleKind, (t: ThreeNS) => VehicleModel> = {
    ...VEHICLE_BUILDERS,
    jetski: () => {
      const group = new THREE.Group();
      const ski = authored.take(AUTHORED_JETSKI.key);
      if (ski) group.add(ski);
      return { group, geometries: [], materials: [] };
    },
  };
  // How far a FLYING ride may roam. Walking + drive rides are caged to the
  // walkable island (applyMove / the WORLD_PX rect), but a kid on a plane or
  // balloon asked to soar the whole sea they can SEE — the old WORLD_PX clamp
  // (16×12 tiles) was a tiny box inside a much wider ocean. The visible water
  // plane spans extentXU*3.2 units (see the water mesh), so let fly rides reach
  // ~82% of that half-extent out from the island centre: most of the rendered
  // sea, with a margin so a plane never sails off the water plane's edge into
  // the empty background.
  const FLY_FILL = 0.82;
  const flyHalfXPx = ((extentXU * 3.2 + 40) / 2) * FLY_FILL * PX_PER_UNIT;
  const flyHalfYPx = ((extentZU * 3.2 + 40) / 2) * FLY_FILL * PX_PER_UNIT;
  // Centered on the WHOLE-archipelago (BOUNDS) center + the water plane, so a
  // flyer can roam the full rendered sea and reach EVERY island (incl. Chess).
  const worldCxPx = (BOUNDS.x0 + BOUNDS.x1) / 2;
  const worldCyPx = (BOUNDS.y0 + BOUNDS.y1) / 2;
  const FLY_BOUNDS = {
    x0: worldCxPx - flyHalfXPx,
    x1: worldCxPx + flyHalfXPx,
    y0: worldCyPx - flyHalfYPx,
    y1: worldCyPx + flyHalfYPx,
  };
  const clampFly = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
  // A sail ride gets the fly rides' sea (the water plane a kid can see) but
  // none of the land: every island's shallows are a wall, so it slides along
  // the coast the way a walker slides along a fog wall.
  function sailOutOfBounds(px: number, py: number): boolean {
    return px < FLY_BOUNDS.x0 || px > FLY_BOUNDS.x1 || py < FLY_BOUNDS.y0 || py > FLY_BOUNDS.y1;
  }
  const sailBlockedAt = (px: number, py: number): boolean =>
    islandNd(px, py) < SAIL_MIN_ND || sailOutOfBounds(px, py);
  const applySail = (nx: number, ny: number): void => {
    if (!sailBlockedAt(nx, ny)) {
      pos.x = nx;
      pos.y = ny;
    } else if (!sailBlockedAt(nx, pos.y)) {
      pos.x = nx;
    } else if (!sailBlockedAt(pos.x, ny)) {
      pos.y = ny;
    }
  };
  let vehicleKind: VehicleKind | null = null;
  let vehicleModel: VehicleModel | null = null;
  let flyAlt = 0; // current altitude (scene units) — ramps up on takeoff
  let flyAltTarget = 0; // cruise altitude for fly rides, 0 for drive
  let landing = false; // fly ride is descending after a dismount request
  // ---- Per-ride "feel" state (smoothed so each ride steers like ITS OWN thing) ----
  let vehHeading = 0; // the ride BODY's yaw, eased toward travel dir at turnResponse
  let vehBank = 0; // current roll (rad) — banks into turns
  let vehPitch = 0; // current pitch (rad) — nose up climbing / down diving
  let vehBobPhase = 0; // motion-bob clock (skateboard hop / jeep rumble / balloon sway)
  let climbDir: -1 | 0 | 1 = 0; // held climb/dive trim from the host buttons
  let boostLeft = 0; // ms left in the current double-tap boost burst
  let boostCd = 0; // ms until boost is available again
  let lastVehTapAt = -Infinity; // walk-clock of the last ride tap (double-tap detect)
  // Host thumb-pad steer (screen-space, magnitude ≤ 1). Rides scale speed by
  // the magnitude — a gentle push creeps, full tilt is full speed — because the
  // vehicle branch integrates the UN-normalized direction. Null when released.
  let padSteer: { x: number; y: number } | null = null;
  // Tear down the current ride's mesh + reset all ride state (called once a
  // drive ride is dismounted, or once a fly ride finishes its descent).
  const finalizeDismount = (): void => {
    // A flying rental that touches down on the still-fogged Chess island
    // discovers it — the ferry's twin (both are the only ways onto the island).
    // Runs FIRST, while vehicleKind is still set and BEFORE the blocked-snap
    // below, so the reveal clears the wall and the kid lands cleanly instead of
    // being bounced back toward the mainland.
    if (vehicleKind && findVehicle(vehicleKind)?.control === 'fly') {
      // ANY offshore land, not just Chess. Hardcoding 'chess-club' here would
      // have left a pilot who touched down on Race Island inside a fog rect,
      // where the blocked-snap below then drags them off the island entirely.
      for (const r of REGIONS) {
        if (discovered.has(r.slug) || r.starter) continue;
        if (islandOf(r.slug).id === 'mainland') continue;
        if (insideRect(pos.x, pos.y, cityRectPx(r))) {
          // Affordability gate, same reasoning as the drive path.
          if (balance >= arrivalPrice(r.unlock_cost, 'fly')) discoverIsland(r.slug, 'fly');
          break;
        }
      }
    }
    if (vehicleModel) {
      scene.remove(vehicleModel.group);
      for (const g of vehicleModel.geometries) g.dispose();
      for (const m of vehicleModel.materials) m.dispose();
    }
    vehicleModel = null;
    vehicleKind = null;
    landing = false;
    flyAlt = 0;
    flyAltTarget = 0;
    vehBank = 0;
    vehPitch = 0;
    climbDir = 0;
    boostLeft = 0;
    target = null;
    steer = null;
    padSteer = null;
    // camMode deliberately survives — it's a world camera setting, not a ride one.
    // A fly ride can hop off over deep water or a fogged land — spots the
    // cupcake can't stand on. Snap it back to the nearest walkable point toward
    // the island center (same radial bisection tap-to-walk uses) so it's never
    // stranded off-map.
    if (avatarBlockedAt(pos.x, pos.y)) {
      // Snap toward the centre of the island the kid is actually OVER, not
      // always the mainland's. Anchoring on the mainland used to haul a pilot
      // who hopped off above a fogged offshore land back across open sea — the
      // "it returned me to the main island" class of bug. Pick the bean with the
      // lowest nd here: that is the same min-of-beans test the terrain itself
      // uses to decide which island owns a point, so it can't disagree with what
      // the kid sees. (Nearest-by-centre would be wrong — the mainland's centre
      // is far from its own south shore, so a small isle can be "closer" while
      // the kid is plainly standing on the mainland.)
      let anchor = mainBean;
      let bestNd = Infinity;
      for (const b of islandBeans) {
        const v = b.nd(pos.x, pos.y);
        if (v < bestNd) {
          bestNd = v;
          anchor = b;
        }
      }
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 16; it++) {
        const mid = (lo + hi) / 2;
        const qx = anchor.cx + (pos.x - anchor.cx) * mid;
        const qy = anchor.cy + (pos.y - anchor.cy) * mid;
        if (avatarBlockedAt(qx, qy)) hi = mid;
        else lo = mid;
      }
      pos.x = anchor.cx + (pos.x - anchor.cx) * lo;
      pos.y = anchor.cy + (pos.y - anchor.cy) * lo;
    }
    cb.onSfx?.('board');
  };

  // Discover an offshore island on arrival (ferry, bus, driving the Sugar Mile,
  // or a fly landing) — reveals it locally and synchronously so the wall clears
  // before any blocked-test runs, then tells the host to persist + charge.
  // Idempotent: a repeat arrival is a no-op.
  // `applyReveal` is defined later; called at runtime so the closure resolves
  // (same forward-reference pattern finalizeDismount uses for avatarBlockedAt).
  const discoverIsland = (slug: string, via: 'ferry' | 'bus' | 'drive' | 'fly'): void => {
    if (discovered.has(slug)) return;
    // One payment opens the WHOLE island, so reveal every land on it — not just
    // the one the kid stepped onto. The server grants the siblings for free on
    // the same arrival (/api/town/ferry); revealing them here keeps the world in
    // step with the wallet instead of leaving a fogged land the kid has in fact
    // already bought.
    const isle = islandOf(slug);
    for (const s of isle.id === 'mainland' ? [slug] : isle.regions) {
      if (!discovered.has(s)) applyReveal(s);
    }
    cb.onIslandArrival?.({ regionSlug: slug, via });
  };

  // A ferry finished a crossing — disembark the kid on land. Arriving at the
  // island discovers it (first time); arriving back at the mainland just drops
  // them on the boarding grass. Called from the tick's ferry glue.
  const onFerryArrive = (line: FerryLine, dest: FerryStop): void => {
    if (dest === line.islandId) {
      discoverIsland(line.regionSlug, 'ferry');
      pos.x = line.layout.arrivePx.x;
      pos.y = line.layout.arrivePx.y;
    } else {
      pos.x = line.layout.mainlandBoardPx.x;
      pos.y = line.layout.mainlandBoardPx.y;
    }
    cb.onFerryDone?.();
  };

  // The bus finished a run. Arriving on the island discovers it (first time,
  // which is also the only time a fare is charged — see 0035_bus_ride.sql);
  // arriving back on the mainland just drops the kid at the stop. Because the
  // fare rides on DISCOVERY, the trip home is always free and a kid can never be
  // stranded on the island by an empty wallet.
  const onBusArrive = (dest: BusStop): void => {
    if (dest === 'race') {
      discoverIsland('race-pit-row', 'bus');
      pos.x = busArrivePx.x;
      pos.y = busArrivePx.y;
    } else {
      pos.x = bridgeL.aPx.x;
      pos.y = bridgeL.aPx.y;
    }
    cb.onFerryDone?.();
  };

  // ---------- Trampolines (bounce pads scattered around town) ----------
  // Was a single pad in Town Square; kids asked for "more trampolines" to
  // bounce around on, so there's now one near the square plus one in the open
  // ground off each region. Only one launch runs at a time (the avatar can only
  // be on one pad), so `launching`/`launchT` stay engine-global; each pad just
  // tracks its own `hot` rising-edge and squashes its own mat on launch.
  const TRAMP_R_PX = 48; // step within this to launch
  const LAUNCH_MS = 750; // up-and-down arc duration
  const LAUNCH_H = 2.6; // peak height (scene units)
  let launching = false;
  let launchT = 0;
  let launchMat: THREE.Mesh | null = null; // the pad mat to squash this launch
  const trampGeos: THREE.BufferGeometry[] = [];
  const trampMats: THREE.Material[] = [];
  interface Tramp {
    px: { x: number; y: number };
    group: THREE.Group;
    matMesh: THREE.Mesh;
    hot: boolean;
  }
  const tramps: Tramp[] = [];
  {
    // Shared geometries across every pad (materials stay per-pad for color).
    const ringGeo = new THREE.TorusGeometry(0.8, 0.14, 10, 24);
    const matGeo = new THREE.CylinderGeometry(0.74, 0.74, 0.1, 24);
    const legGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8);
    trampGeos.push(ringGeo, matGeo, legGeo);
    const padColors = SPRINKLE_COLORS; // pad mats cycle the brand sprinkle hues
    const buildTramp = (px: { x: number; y: number }, colorIdx: number): Tramp => {
      const group = new THREE.Group();
      const ringMat = new THREE.MeshStandardMaterial({ color: 0xe11d48, roughness: 0.5 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.22;
      ring.castShadow = true;
      group.add(ring);
      const matMat = new THREE.MeshStandardMaterial({
        color: padColors[colorIdx % padColors.length],
        roughness: 0.4,
      });
      const matMesh = new THREE.Mesh(matGeo, matMat);
      matMesh.position.y = 0.2;
      group.add(matMesh);
      const legMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.6 });
      for (const [lx, lz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, 0.1, lz);
        group.add(leg);
      }
      trampMats.push(ringMat, matMat, legMat);
      group.position.set(pxToSceneX(px.x), terrainHeightPx(px.x, px.y), pxToSceneZ(px.y));
      scene.add(group);
      return { px, group, matMesh, hot: false };
    };
    // Original Town-Square pad, then one off each region (skip any that would
    // land inside a zone footprint so pads always sit on open, walkable ground).
    const sq = cityCenterPx('town-square');
    const spots: Array<{ x: number; y: number }> = [{ x: sq.x + 120, y: sq.y + 110 }];
    REGIONS.forEach((r) => {
      const c = cityCenterPx(r.slug);
      const cand = { x: c.x + 190, y: c.y - 170 };
      const clear =
        !zoneRects.some((rc) => insideRect(cand.x, cand.y, rc)) &&
        cand.x > BOUNDS.x0 + 40 &&
        cand.x < BOUNDS.x1 - 40 &&
        cand.y > BOUNDS.y0 + 40 &&
        cand.y < BOUNDS.y1 - 40;
      if (clear) spots.push(cand);
    });
    // Six more pads spread in a ring around the island so there's always one to
    // bounce on nearby. Each searches inward from the coast until it lands on
    // open ground (inside the island, clear of every zone footprint).
    const ringCx = (BOUNDS.x0 + BOUNDS.x1) / 2;
    const ringCy = (BOUNDS.y0 + BOUNDS.y1) / 2;
    const ringHalfW = (BOUNDS.x1 - BOUNDS.x0) / 2;
    const ringHalfH = (BOUNDS.y1 - BOUNDS.y0) / 2;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2 + 0.5; // phase-offset so they don't align with the region pads
      for (const frac of [0.74, 0.62, 0.5, 0.38, 0.26]) {
        const cand = { x: ringCx + Math.cos(ang) * ringHalfW * frac, y: ringCy + Math.sin(ang) * ringHalfH * frac };
        const clear = islandNd(cand.x, cand.y) < 0.85 && !zoneRects.some((rc) => insideRect(cand.x, cand.y, rc));
        if (clear) {
          spots.push(cand);
          break;
        }
      }
    }
    spots.forEach((s, i) => tramps.push(buildTramp(s, i)));
  }

  // ---------- Fireworks launch pad ----------
  // Step onto the pad and it shoots a little fireworks show into the sky. Like
  // the trampolines it's a rising-edge trigger: a show fires a short volley of
  // shells that rocket up and explode into fading colored sparks.
  const FIRE_R_PX = 46; // step within this to set it off
  // Celebration colors = the brand sprinkle palette (+ white flash). Shared by
  // the fireworks toy AND every land celebration (applyReveal / endStorm /
  // cutscene FX) so unlocks read on-brand — the old list was an invented
  // palette that existed nowhere else in Gamecakes.
  const FIRE_COLORS = [...SPRINKLE_COLORS, 0xffffff];
  const firePx = ((): { x: number; y: number } => {
    const cc = { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 };
    const hw = (BOUNDS.x1 - BOUNDS.x0) / 2;
    const hh = (BOUNDS.y1 - BOUNDS.y0) / 2;
    const ok = (c: { x: number; y: number }): boolean =>
      islandNd(c.x, c.y) < 0.8 &&
      !zoneRects.some((rc) => insideRect(c.x, c.y, rc)) &&
      Math.hypot(c.x - mtnCenter.x, c.y - mtnCenter.y) > MTN_R_PX + 90 &&
      distToRect(c.x, c.y, fieldRect) > 60 &&
      Math.abs(Math.hypot((c.x - trackCx) / trackRx, (c.y - trackCy) / trackRy) - 1) > 0.14;
    for (const frac of [0.5, 0.62, 0.38, 0.72, 0.26]) {
      for (let k = 0; k < 8; k++) {
        const ang = (k / 8) * Math.PI * 2 + 0.9;
        const cand = { x: cc.x + Math.cos(ang) * hw * frac, y: cc.y + Math.sin(ang) * hh * frac };
        if (ok(cand)) return cand;
      }
    }
    return cc;
  })();
  const fireBaseY = terrainHeightPx(firePx.x, firePx.y);
  const fireSx = pxToSceneX(firePx.x);
  const fireSz = pxToSceneZ(firePx.y);

  const fireGeos: THREE.BufferGeometry[] = [];
  const fireMats: THREE.Material[] = [];
  const fireGroup = new THREE.Group();
  {
    // Launcher base + three angled mortar tubes so the pad reads as a launcher.
    const baseGeo = new THREE.CylinderGeometry(0.75, 0.92, 0.22, 20);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x3b2b45, roughness: 0.7 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(fireSx, fireBaseY + 0.11, fireSz);
    base.receiveShadow = true;
    fireGroup.add(base);
    const tubeGeo = new THREE.CylinderGeometry(0.13, 0.15, 0.7, 12);
    const tubeColors = [0xe11d48, 0xf59e0b, 0x2563eb];
    ([[-0.34, 0.12], [0.34, 0.12], [0, -0.34]] as Array<[number, number]>).forEach(([tx, tz], i) => {
      const tubeMat = new THREE.MeshStandardMaterial({ color: tubeColors[i], roughness: 0.5 });
      const tube = new THREE.Mesh(tubeGeo, tubeMat);
      tube.position.set(fireSx + tx, fireBaseY + 0.45, fireSz + tz);
      tube.rotation.x = tz * 0.5; // splay the tubes outward a touch
      tube.rotation.z = -tx * 0.5;
      tube.castShadow = true;
      fireGroup.add(tube);
      fireMats.push(tubeMat);
    });
    fireGeos.push(baseGeo, tubeGeo);
    fireMats.push(baseMat);
  }
  scene.add(fireGroup);

  // Particle system: rockets rise then explode into gravity-fed, fading sparks.
  interface FireP {
    mesh: THREE.Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    rocket: boolean;
    color: number;
  }
  const fireworks: FireP[] = [];
  const sparkGeo = new THREE.SphereGeometry(0.11, 6, 5);
  fireGeos.push(sparkGeo);
  const FIRE_GRAV = 7; // units/s² pull on sparks
  const addParticle = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, rocket: boolean, color: number): void => {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: rocket ? 2.2 : 1.8,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      roughness: 0.4,
    });
    const m = new THREE.Mesh(sparkGeo, mat);
    m.position.set(x, y, z);
    if (rocket) m.scale.setScalar(1.3);
    fireGroup.add(m);
    fireworks.push({ mesh: m, vx, vy, vz, life, maxLife: life, rocket, color });
  };
  const explode = (x: number, y: number, z: number, color: number): void => {
    const n = 20 + Math.floor(Math.random() * 8);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1; // even direction on a sphere
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const sp = 3.5 + Math.random() * 2.5;
      addParticle(x, y, z, Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp, 1.0 + Math.random() * 0.6, false, color);
    }
    cb.onSfx?.('bump');
  };
  const launchShell = (): void => {
    const color = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
    addParticle(
      fireSx + (Math.random() - 0.5) * 0.4,
      fireBaseY + 0.7,
      fireSz + (Math.random() - 0.5) * 0.4,
      (Math.random() - 0.5) * 1.2,
      8.5 + Math.random() * 2.5,
      (Math.random() - 0.5) * 1.2,
      0.75 + Math.random() * 0.25,
      true,
      color,
    );
  };
  let fireHot = false;
  let showLeft = 0; // ms remaining in the current show
  let shellIn = 0; // ms until the next shell
  const startShow = (): void => {
    showLeft = 2000;
    shellIn = 0;
    cb.onSfx?.('launch');
  };
  const updateFireworks = (dt: number): void => {
    const dts = dt / 1000;
    if (showLeft > 0) {
      showLeft -= dt;
      shellIn -= dt;
      if (shellIn <= 0) {
        launchShell();
        shellIn = 260 + Math.random() * 220;
      }
    }
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const p = fireworks[i];
      p.life -= dts;
      p.vy -= FIRE_GRAV * (p.rocket ? 0.35 : 1) * dts; // rockets slow near apex; sparks fall
      p.mesh.position.x += p.vx * dts;
      p.mesh.position.y += p.vy * dts;
      p.mesh.position.z += p.vz * dts;
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      if (!p.rocket) mat.opacity = Math.max(0, p.life / p.maxLife);
      if (p.life <= 0) {
        if (p.rocket) explode(p.mesh.position.x, p.mesh.position.y, p.mesh.position.z, p.color);
        fireGroup.remove(p.mesh);
        mat.dispose();
        fireworks.splice(i, 1);
      }
    }
  };

  // ---------- Mutable gameplay state (CITY PIXELS) ----------
  // Spawn arrives in ORIGINAL region-px; map it into the spread city-space.
  const spawnCity = origToCity(props.spawnPx, props.spawnRegionSlug);
  const pos = { x: spawnCity.x, y: spawnCity.y };
  // Saved positions are clamped to WORLD_PX server-side (/api/town/position), and
  // original space is centred on the region's own spawnPoint — so for an offshore
  // island, whose radius dwarfs the tile grid, a shore position can be truncated
  // on the way in. Truncation pulls TOWARD the region centre, which is dry land,
  // so this has never actually dropped anyone in the sea; it is a guard, not a
  // fix. (The real fix is storing region-relative offsets, which is a contract
  // change.) Islands got bigger, so the truncation did too — snap anything that
  // lands off-land back to the region centre rather than trusting it.
  if (islandNd(pos.x, pos.y) > 0.95) {
    const safe = cityCenterPx(props.spawnRegionSlug);
    pos.x = safe.x;
    pos.y = safe.y;
  }
  let target: { x: number; y: number } | null = null;
  let intentEnterSlug: string | null = null;
  let steer: { x: number; y: number } | null = null; // unit dir in px-space while drag-steering

  let currentRegionSlug = props.spawnRegionSlug;
  let currentApproachRegion: string | null = null;
  let nearBuildingSlug: string | null = null;
  let lastPostAt = -Infinity;
  let movedSincePost = false;

  let paused = false;
  let raf = 0;
  let lastTime = performance.now();

  // ---------- Beach + soccer balls (bump-reactive field toys) ----------
  // Horizontal motion is in city-px/sec; vertical hop is in scene-units/sec.
  // The loop hands us dt in MILLISECONDS, so every integration below converts
  // to seconds first (`dts`). The old code integrated px/sec directly against a
  // millisecond dt AND applied friction per-ms, so a kick teleported the ball a
  // frame then froze — the "ball gravity and bounce" the kid wanted never
  // existed. Now: kicks pop the ball up, gravity pulls it back, and it bounces
  // with damping; friction only bites while it's actually rolling on the ground.
  const BALL_R_U = 0.6;
  const BALL_BUMP_PX = BALL_R_U * PX_PER_UNIT + 28; // avatar-center → ball-center contact
  const BALL_KICK = 340; // px/sec horizontal kick on a bump
  const BALL_KICK_UP_U = 5.5; // units/sec upward pop on a bump
  const BALL_GRAVITY_U = 22; // units/sec² downward
  const BALL_REST = 0.55; // vertical bounce energy kept per landing
  const BALL_FRICTION = 1.7; // per-second horizontal decay (grounded only)
  // Minimum gap between hop "boing"s, in MILLISECONDS — the loop's dt is
  // performance.now() deltas (ms), NOT seconds. The original stepTimer
  // compared ms against a seconds-flavored constant (0.34, later 0.8),
  // which is true on every ~16ms frame — so the boing fired at 60Hz as a
  // continuous drone, and tuning the constant audibly changed nothing
  // ("too fast, doesn't sound right, only play 1 per second" — feedback
  // tickets 2026-06-05 + 2026-06-10). Also a global since-last-boing
  // throttle (not a per-walk timer that resets on every stop), so
  // sub-second tap bursts can't retrigger it either.
  const STEP_INTERVAL_MS = 1000;
  let walkClock = 0;            // accumulated update time (ms)
  let lastStepAt = -Infinity;   // walkClock value of the last boing
  const beachBalls: BeachBall[] = [];
  const ballGeo = new THREE.SphereGeometry(BALL_R_U, 20, 16);
  const ballCanvas = document.createElement('canvas');
  ballCanvas.width = 256;
  ballCanvas.height = 128;
  {
    const bctx = ballCanvas.getContext('2d')!;
    // Brand sprinkle hues (hex strings) — the classic beach-ball stripes, drawn
    // from the shared palette instead of invented one-off colors.
    const cols = ['#fb7185', '#ffffff', '#93c5fd', '#fbbf24', '#ffffff', '#6ee7b7'];
    const cw = ballCanvas.width / cols.length;
    cols.forEach((c, i) => {
      bctx.fillStyle = c;
      bctx.fillRect(i * cw, 0, cw + 1, ballCanvas.height);
    });
  }
  const ballTex = new THREE.CanvasTexture(ballCanvas);
  ballTex.colorSpace = THREE.SRGBColorSpace;
  const ballMat = new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.4 });
  // Extra canvas textures (pitch, soccer ball) collected for disposal.
  const ballTexHolder: THREE.Texture[] = [];
  {
    const inZone = (x: number, y: number): boolean =>
      zoneRects.some((rc) => x >= rc.x0 - 30 && x <= rc.x1 + 30 && y >= rc.y0 - 30 && y <= rc.y1 + 30);
    let bseed = 99;
    const brng = (): number => {
      bseed = (bseed * 1103515245 + 12345) & 0x7fffffff;
      return bseed / 0x7fffffff;
    };
    let placed = 0;
    let attempts = 0;
    while (placed < 3 && attempts < 240) {
      attempts += 1;
      const x = BOUNDS.x0 + brng() * (BOUNDS.x1 - BOUNDS.x0);
      const y = BOUNDS.y0 + brng() * (BOUNDS.y1 - BOUNDS.y0);
      if (inZone(x, y)) continue;
      placed += 1;
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      mesh.position.set(pxToSceneX(x), terrainHeightPx(x, y) + BALL_R_U, pxToSceneZ(y));
      mesh.castShadow = true;
      scene.add(mesh);
      beachBalls.push({ mesh, x, y, vx: 0, vy: 0, h: 0, vh: 0, hot: false, r: BALL_R_U, kind: 'beach' });
    }
  }

  // ---------- Chess Isle's walk-on board ----------
  // A full 8×8 board with 32 kid-height pieces you can barge over. Lives on
  // the chess island, so it is built off that island's SOLVED centre rather
  // than any tile rect — the solver moves islands around as the archipelago
  // grows, and hardcoding a position here would silently drift.
  // Same island spec the flat/no-scatter rect above was reserved from, so the
  // board can never be built somewhere the scatter did not know to avoid.
  let chessBoard: ChessBoardHandle | null = null;
  let checkersBoard: CheckersBoardHandle | null = null;
  if (chessIsleSpec) {
    chessBoard = buildChessBoard(THREE, scene, {
      centerPx: chessIsleSpec.center,
      onTopple: () => cb.onSfx?.('bump'),
    });
    // The island's WEST wing. Same solved centre as the eastern board and the
    // same reserved rect above, so neither arena can be built somewhere the
    // scatter did not know to avoid.
    checkersBoard = buildCheckersBoard(THREE, scene, {
      centerPx: chessIsleSpec.center,
      onKick: () => cb.onSfx?.('bump'),
    });
  }

  // ---------- Soccer pitch + goals + kickable ball ----------
  // A striped-grass pitch on the flattened footprint reserved above, two goals
  // on its end lines, and a soccer ball that scores + resets when it crosses a
  // goal mouth. The ball reuses the same bump/gravity/bounce physics as the
  // beach balls (kind:'soccer' just adds goal detection).
  const fieldGeos: THREE.BufferGeometry[] = [];
  const fieldMats: THREE.Material[] = [];
  const goals: Array<{ lineX: number; y0: number; y1: number; dir: number }> = [];
  const GOAL_MOUTH_PX = 240; // scales with the 4× pitch
  {
    // Pitch surface — grass stripes + boundary + center circle baked into a
    // canvas texture (no extra line meshes needed).
    const pc = document.createElement('canvas');
    pc.width = 512;
    pc.height = 342;
    const g = pc.getContext('2d')!;
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 === 0 ? '#4ea34e' : '#57b357';
      g.fillRect((i * pc.width) / stripes, 0, pc.width / stripes + 1, pc.height);
    }
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 6;
    g.strokeRect(10, 10, pc.width - 20, pc.height - 20);
    g.beginPath();
    g.moveTo(pc.width / 2, 10);
    g.lineTo(pc.width / 2, pc.height - 10);
    g.stroke();
    g.beginPath();
    g.arc(pc.width / 2, pc.height / 2, 46, 0, Math.PI * 2);
    g.stroke();
    const pitchTex = new THREE.CanvasTexture(pc);
    pitchTex.colorSpace = THREE.SRGBColorSpace;
    const pitchGeo = new THREE.PlaneGeometry(FIELD_W_PX / PX_PER_UNIT, FIELD_H_PX / PX_PER_UNIT);
    // Only 2cm above a vertex-displaced ground plane — coplanar wherever the
    // terrain rises under it, so bias its depth instead of raising it further.
    const pitchMat = groundDecalDepthBias(
      new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95 }),
    );
    const pitch = new THREE.Mesh(pitchGeo, pitchMat);
    pitch.rotation.x = -Math.PI / 2;
    pitch.position.set(pxToSceneX(fieldCenter.x), 0.02, pxToSceneZ(fieldCenter.y));
    pitch.receiveShadow = true;
    scene.add(pitch);
    fieldGeos.push(pitchGeo);
    fieldMats.push(pitchMat);
    ballTexHolder.push(pitchTex);

    // Goals — a white frame (2 posts + crossbar) on each end line.
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.3, 8);
    const barGeo = new THREE.CylinderGeometry(0.08, 0.08, GOAL_MOUTH_PX / PX_PER_UNIT, 8);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    fieldGeos.push(postGeo, barGeo);
    fieldMats.push(goalMat);
    const mouthHalf = GOAL_MOUTH_PX / 2;
    for (const dir of [-1, 1] as const) {
      const lineX = dir > 0 ? fieldRect.x1 : fieldRect.x0;
      const sx = pxToSceneX(lineX);
      const y0z = pxToSceneZ(fieldCenter.y - mouthHalf);
      const y1z = pxToSceneZ(fieldCenter.y + mouthHalf);
      const p0 = new THREE.Mesh(postGeo, goalMat);
      p0.position.set(sx, 0.65, y0z);
      p0.castShadow = true;
      scene.add(p0);
      const p1 = new THREE.Mesh(postGeo, goalMat);
      p1.position.set(sx, 0.65, y1z);
      p1.castShadow = true;
      scene.add(p1);
      const bar = new THREE.Mesh(barGeo, goalMat);
      bar.position.set(sx, 1.3, pxToSceneZ(fieldCenter.y));
      bar.rotation.x = Math.PI / 2; // lie the crossbar along z
      scene.add(bar);
      goals.push({ lineX, y0: fieldCenter.y - mouthHalf, y1: fieldCenter.y + mouthHalf, dir });
    }

    // The soccer ball — classic white/black panels via a simple canvas.
    const sc = document.createElement('canvas');
    sc.width = 128;
    sc.height = 128;
    const sg = sc.getContext('2d')!;
    sg.fillStyle = '#ffffff';
    sg.fillRect(0, 0, 128, 128);
    sg.fillStyle = '#222222';
    for (const [cx, cy] of [[24, 30], [96, 24], [64, 70], [28, 100], [104, 96]]) {
      sg.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(a) * 14;
        const py = cy + Math.sin(a) * 14;
        if (k === 0) sg.moveTo(px, py);
        else sg.lineTo(px, py);
      }
      sg.closePath();
      sg.fill();
    }
    const soccerTex = new THREE.CanvasTexture(sc);
    soccerTex.colorSpace = THREE.SRGBColorSpace;
    const soccerMat = new THREE.MeshStandardMaterial({ map: soccerTex, roughness: 0.5 });
    fieldMats.push(soccerMat);
    ballTexHolder.push(soccerTex);
    const soccerMesh = new THREE.Mesh(ballGeo, soccerMat);
    soccerMesh.castShadow = true;
    soccerMesh.position.set(pxToSceneX(fieldCenter.x), BALL_R_U, pxToSceneZ(fieldCenter.y));
    scene.add(soccerMesh);
    beachBalls.push({
      mesh: soccerMesh,
      x: fieldCenter.x,
      y: fieldCenter.y,
      vx: 0,
      vy: 0,
      h: 0,
      vh: 0,
      hot: false,
      r: BALL_R_U,
      kind: 'soccer',
    });
  }

  const updateBeachBalls = (dt: number): void => {
    const dts = dt / 1000; // loop dt is milliseconds; ball physics is per-second
    for (const ball of beachBalls) {
      // --- Avatar contact: horizontal kick + a pop up off the ground ---
      const dx = ball.x - pos.x;
      const dy = ball.y - pos.y;
      const d = Math.hypot(dx, dy);
      if (d < BALL_BUMP_PX && d > 0.001) {
        const push = (BALL_BUMP_PX - d) / BALL_BUMP_PX;
        ball.vx += (dx / d) * BALL_KICK * push;
        ball.vy += (dy / d) * BALL_KICK * push;
        if (ball.h < 0.02 && ball.vh < 0.02) ball.vh += BALL_KICK_UP_U * push;
        if (!ball.hot) {
          ball.hot = true;
          cb.onSfx?.('bump');
        }
      } else if (d > BALL_BUMP_PX + 12) {
        ball.hot = false;
      }

      const grounded = ball.h <= 0.001;
      const active =
        Math.hypot(ball.vx, ball.vy) > 0.5 || ball.h > 0.001 || Math.abs(ball.vh) > 0.01;
      if (active) {
        // Horizontal integrate (+ ground-only friction).
        ball.x += ball.vx * dts;
        ball.y += ball.vy * dts;
        if (grounded) {
          const decay = Math.exp(-BALL_FRICTION * dts);
          ball.vx *= decay;
          ball.vy *= decay;
        }
        if (ball.x < BOUNDS.x0) { ball.x = BOUNDS.x0; ball.vx = -ball.vx * 0.6; }
        if (ball.x > BOUNDS.x1) { ball.x = BOUNDS.x1; ball.vx = -ball.vx * 0.6; }
        if (ball.y < BOUNDS.y0) { ball.y = BOUNDS.y0; ball.vy = -ball.vy * 0.6; }
        if (ball.y > BOUNDS.y1) { ball.y = BOUNDS.y1; ball.vy = -ball.vy * 0.6; }

        // Vertical gravity + bounce.
        ball.vh -= BALL_GRAVITY_U * dts;
        ball.h += ball.vh * dts;
        if (ball.h <= 0) {
          ball.h = 0;
          ball.vh = ball.vh < -0.4 ? -ball.vh * BALL_REST : 0;
        }

        const terr = terrainHeightPx(ball.x, ball.y);
        ball.mesh.position.set(pxToSceneX(ball.x), terr + ball.r + ball.h, pxToSceneZ(ball.y));
        // Roll proportional to horizontal travel (px / radius-px = radians).
        const rpx = ball.r * PX_PER_UNIT;
        ball.mesh.rotation.x += (ball.vy * dts) / rpx;
        ball.mesh.rotation.z -= (ball.vx * dts) / rpx;
      }

      // --- Soccer goal: crossed an end line inside the mouth, near the ground ---
      if (ball.kind === 'soccer' && ball.h < 1.3) {
        for (const gl of goals) {
          const inMouth = ball.y > gl.y0 && ball.y < gl.y1;
          const crossed = gl.dir > 0 ? ball.x > gl.lineX : ball.x < gl.lineX;
          if (inMouth && crossed) {
            cb.onSfx?.('levelUp');
            ball.x = fieldCenter.x;
            ball.y = fieldCenter.y;
            ball.vx = 0;
            ball.vy = 0;
            ball.vh = 0;
            ball.h = 0;
            ball.mesh.position.set(
              pxToSceneX(ball.x),
              terrainHeightPx(ball.x, ball.y) + ball.r,
              pxToSceneZ(ball.y),
            );
            break;
          }
        }
      }
    }
  };

  // ---------- Ride wake FX (sugar-dust / contrail / burner puff) ----------
  // A tiny shared pool of fading puff sprites the ridden vehicle drops behind
  // itself (each ride's `trail` in vehicles.ts sets the tint/rate/size). Cheap
  // billowing spheres, hard-capped, and skipped entirely under reduced-motion.
  const RIDE_PUFF_CAP = 40;
  const rideFxGroup = new THREE.Group();
  scene.add(rideFxGroup);
  const rideFxGeos: THREE.BufferGeometry[] = [];
  const puffGeo = new THREE.SphereGeometry(1, 6, 5); // unit sphere, scaled per puff
  rideFxGeos.push(puffGeo);
  interface RidePuff {
    mesh: THREE.Mesh;
    life: number;
    maxLife: number;
    vy: number;
    // Spray only: thrown sideways and falling back (0 for the drifting puffs).
    vx: number;
    vz: number;
    g: number;
    grow: number; // billow rate, per second (spray does not billow)
  }
  const ridePuffs: RidePuff[] = [];
  let puffTimer = 0;
  let sprayTimer = 0;
  let wakeTimer = 0;
  let wakeNext = 0;
  const spawnPuff = (x: number, y: number, z: number, color: number, sizeU: number): void => {
    if (ridePuffs.length >= RIDE_PUFF_CAP) return;
    // Per-puff material so each can fade its own opacity (freed on death).
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      roughness: 0.95,
    });
    const m = new THREE.Mesh(puffGeo, mat);
    m.position.set(x, y, z);
    m.scale.setScalar(sizeU * (0.7 + Math.random() * 0.5));
    rideFxGroup.add(m);
    ridePuffs.push({ mesh: m, life: 0.6, maxLife: 0.6, vy: 0.35 + Math.random() * 0.3, vx: 0, vz: 0, g: 0, grow: 1.6 });
  };
  // Jet ski spray: a droplet flung out from the hull's side that arcs up and
  // falls back into the sea. Same pool and cap as the puffs.
  const spawnSpray = (x: number, y: number, z: number, vx: number, vz: number, vy: number): void => {
    if (ridePuffs.length >= RIDE_PUFF_CAP) return;
    spawnPuff(x, y, z, 0xf4fbff, 0.045);
    const p = ridePuffs[ridePuffs.length - 1];
    p.grow = 0;
    p.vx = vx;
    p.vz = vz;
    p.vy = vy;
    p.g = 6;
    p.life = p.maxLife = 0.45;
  };
  // The jet ski playground, stepped each frame while sailing: climb a ramp and
  // fly off its lip, fall back with a splash, and run the slalom.
  const stepJetskiPlay = (dt: number, frac: number): void => {
    const dts = dt / 1000;
    // Ramps: on the deck, heading up it, the ski rides its slope.
    let lift = -1;
    for (const r of course.ramps) {
      const dx = pos.x - r.at.x;
      const dy = pos.y - r.at.y;
      const along = dx * r.dir.x + dy * r.dir.y;
      const lat = dx * -r.dir.y + dy * r.dir.x;
      if (Math.abs(lat) > SKI_RAMP_HALF_W_PX || Math.abs(along) > SKI_RAMP_HALF_LEN_PX) continue;
      const heading = Math.sin(vehHeading) * r.dir.x + Math.cos(vehHeading) * r.dir.y;
      if (heading < 0.4) continue;
      lift = ((along + SKI_RAMP_HALF_LEN_PX) / (2 * SKI_RAMP_HALF_LEN_PX)) * SKI_RAMP_LIP_U;
    }
    if (lift >= 0 && jumpY <= lift + 0.05) {
      onRamp = true;
      jumpY = lift;
      jumpVy = 0;
      return;
    }
    if (onRamp) {
      // Off the deck: over the lip at speed is a jump; a slow roll off just drops.
      onRamp = false;
      if (frac > 0.3) {
        jumpVy = SKI_JUMP_VY_U * Math.min(1.3, frac);
        cb.onSfx?.('launch');
      }
    }
    if (jumpY > 0) {
      jumpVy -= SKI_GRAVITY_U * dts;
      jumpY += jumpVy * dts;
      if (jumpY <= 0) {
        // Splash down: a ring of spray, louder for a bigger drop.
        const hard = jumpVy < -3;
        jumpY = 0;
        jumpVy = 0;
        if (hard) cb.onSfx?.('bump');
        if (!reduceMotion) {
          const gx = pxToSceneX(pos.x);
          const gz = pxToSceneZ(pos.y);
          for (let k = 0; k < 12; k++) {
            const a = (k / 12) * Math.PI * 2;
            spawnSpray(gx + Math.cos(a) * 0.3, WATER_Y + 0.05, gz + Math.sin(a) * 0.3, Math.cos(a) * 2, Math.sin(a) * 2, 2 + Math.random());
          }
        }
      }
    }
    // Slalom.
    if (course.gates.length > 0) {
      const ev = stepSlalom(slalomRun, course, pos, walkClock);
      if (ev) {
        cb.onSlalom?.(ev);
        if (ev.kind === 'finish') cb.onSfx?.('levelUp');
        else if (ev.kind === 'gate' && !ev.made) cb.onSfx?.('bump');
        else cb.onSfx?.('tap');
        if (!reduceMotion && (ev.kind !== 'gate' || ev.made)) {
          const g = course.gates[ev.kind === 'gate' ? ev.index : ev.kind === 'start' ? 0 : course.gates.length - 1];
          // A gate made spouts a fountain off both its buoys; the finish
          // gets fireworks.
          for (const b of [g.left, g.right]) {
            for (let k = 0; k < 4; k++) {
              spawnSpray(pxToSceneX(b.x), WATER_Y + 0.6, pxToSceneZ(b.y), (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 3 + Math.random());
            }
          }
          if (ev.kind === 'finish') {
            for (let k = 0; k < 3; k++) {
              explode(pxToSceneX(g.centre.x), WATER_Y + 3 + k * 0.6, pxToSceneZ(g.centre.y), FIRE_COLORS[k % FIRE_COLORS.length]);
            }
          }
        }
      }
    }
  };
  const updateRidePuffs = (dt: number): void => {
    const dts = dt / 1000;
    for (let i = ridePuffs.length - 1; i >= 0; i--) {
      const p = ridePuffs[i];
      p.life -= dts;
      p.vy -= p.g * dts;
      p.mesh.position.x += p.vx * dts;
      p.mesh.position.y += p.vy * dts;
      p.mesh.position.z += p.vz * dts;
      p.mesh.scale.multiplyScalar(1 + dts * p.grow); // billow out as it fades
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, (p.life / p.maxLife) * 0.7);
      if (p.life <= 0) {
        rideFxGroup.remove(p.mesh);
        mat.dispose();
        ridePuffs.splice(i, 1);
      }
    }
  };

  // ---------- Sugar gems: collectible treats that reward roaming ----------
  // Glittering candy octahedrons scattered in three tiers so DIFFERENT rides
  // reach different finds:
  //   * 'ground' — hover low over the island: walk / skateboard / jeep grab them.
  //   * 'sea'    — hover just over the waves: only a FLYING ride skimming low.
  //   * 'high'   — soar way up over the open sea + fogged lands: you must CLIMB a
  //                plane/balloon to their altitude (the climb/dive buttons) to
  //                snag them — a direct payoff for the altitude control.
  // Grabbing one pops a sparkle burst (reuses the fireworks `explode`) + a chime.
  // Purely cosmetic — the server economy is untouched. Collected for the session.
  const gemGroup = new THREE.Group();
  scene.add(gemGroup);

  // ---------- The three hidden land chests ----------
  // Placed on the SOLVED map by kind of hiding place (land-chest-spots.ts), never
  // by pinned pixel, so a layout change moves them somewhere equally quiet
  // rather than into a land. Clearance is the distance to anywhere a kid already
  // goes: a land, a road, the pitch, the rails.
  const landChestSpots = pickLandChestSpots({
      bounds: MAINLAND_B,
      centre: { x: mainBean.cx, y: mainBean.cy },
      nd: (x, y) => mainBean.nd(x, y),
      clearance: (x, y) => {
        let d = Infinity;
        for (const rc of zoneRects) d = Math.min(d, distToRect(x, y, rc));
        d = Math.min(d, distToRect(x, y, fieldRect));
        for (const sg of roadSegs) d = Math.min(d, distToSeg(x, y, sg));
        // The rail ring, approximately: how far off the ellipse, in px.
        const te = Math.hypot((x - trackCx) / trackRx, (y - trackCy) / trackRy);
        d = Math.min(d, Math.abs(te - 1) * Math.min(trackRx, trackRy));
        return d;
      },
      mountain: { x: mtnCenter.x, y: mtnCenter.y, r: MTN_R_PX },
    });
  const landChests: LandChests3D = createLandChests3D(THREE, {
    authored,
    spots: landChestSpots,
    opened: new Set(props.openedLandChests ?? []),
    groundY: (x, y) => terrainHeightPx(x, y),
    centre: { x: mainBean.cx, y: mainBean.cy },
  });
  scene.add(landChests.group);
  let nearLandChest: string | null = null;

  // ---------- Jet ski rental docks ----------
  // Three wafer jetties round the mainland (jetski-docks.ts picks the coast
  // nearest the lands, clear of the ferries, the sub jetty, the bridge and the
  // hidden chests), each with a jet ski moored alongside. The moored ski is the
  // only place the jet ski mounts, and hopping off returns the kid to the
  // nearest dock's beach, so a 'sail' ride starts and ends on dry sand.
  // Both models are Blender art; without them there are simply no docks.
  const jetDocks =
    authored.has(AUTHORED_JETSKI.key) && authored.has(AUTHORED_JETSKI_DOCK.key)
      ? pickJetskiDocks({
          centre: { x: mainBean.cx, y: mainBean.cy },
          nd: (x, y) => mainBean.nd(x, y),
          waterlineNd: WATERLINE_ND,
          seaOk: (x, y) => islandNd(x, y) >= SAIL_MIN_ND && !sailOutOfBounds(x, y),
          nearLand: (x, y) => {
            let d = Infinity;
            for (const r of REGIONS) {
              if (islandOf(r.slug).id !== 'mainland') continue;
              d = Math.min(d, distToRect(x, y, cityRectPx(r)));
            }
            return d;
          },
          avoid: [
            ...ferryLines.map((l) => l.layout.mainlandDockPx),
            ...(subDockOriginPx ? [subDockOriginPx] : []),
            bridgeL.aPx,
            ...pierDecks.map((d) => ({ x: (d.rect.x0 + d.rect.x1) / 2, y: (d.rect.y0 + d.rect.y1) / 2 })),
            ...Object.values(landChestSpots).filter((p): p is { x: number; y: number } => p !== null),
          ],
        })
      : [];
  const jetDockGroup = new THREE.Group();
  scene.add(jetDockGroup);
  const parkedSkis: THREE.Object3D[] = [];
  for (const d of jetDocks) {
    const yaw = Math.atan2(d.out.x, d.out.y); // the models' sea end is +Z
    const dock = authored.take(AUTHORED_JETSKI_DOCK.key);
    if (dock) {
      // Straddling the waterline, deck just above the water.
      const mid = JETSKI_DOCK_CENTRE_PX;
      dock.position.set(
        pxToSceneX(d.shorePx.x + d.out.x * mid),
        WATER_Y + JETSKI_DECK_ABOVE_WATER_U - JETSKI_DECK_TOP_U,
        pxToSceneZ(d.shorePx.y + d.out.y * mid),
      );
      dock.rotation.y = yaw;
      jetDockGroup.add(dock);
    }
    const ski = authored.take(AUTHORED_JETSKI.key) ?? new THREE.Object3D();
    ski.position.set(pxToSceneX(d.skiPx.x), WATER_Y - JETSKI_DRAUGHT_U, pxToSceneZ(d.skiPx.y));
    ski.rotation.y = yaw;
    jetDockGroup.add(ski);
    parkedSkis.push(ski);
  }
  // The jet ski playground (jetski-course.ts): a buoy slalom off one dock
  // and a floating jump ramp off each of the others. Blender art throughout;
  // without the models there is no course, and the ski just rides.
  const SKI_RAMP_SCALE = AUTHORED_SKI_RAMP.targetHeightU / 0.893; // native GLB height
  const SKI_RAMP_HALF_LEN_PX = ((2.5 * SKI_RAMP_SCALE) / 2) * PX_PER_UNIT;
  const SKI_RAMP_HALF_W_PX = 1.15 * PX_PER_UNIT;
  const SKI_RAMP_SINK_U = 0.1; // the low end sits just under the surface
  const SKI_RAMP_LIP_U = 0.6 * SKI_RAMP_SCALE - SKI_RAMP_SINK_U; // lip, above the water
  const SKI_JUMP_VY_U = 4.6; // take-off climb at full speed, units/s
  const SKI_GRAVITY_U = 11;
  const BUOY_DRAUGHT_U = 0.22;
  const ARROW_HOVER_U = 1.9;
  const courseReady =
    jetDocks.length > 0 &&
    authored.has(AUTHORED_SLALOM_BUOY.key) &&
    authored.has(AUTHORED_SLALOM_ARROW.key) &&
    authored.has(AUTHORED_SKI_RAMP.key);
  const course = courseReady
    ? planJetskiCourse(jetDocks, (x, y) => islandNd(x, y) >= SAIL_MIN_ND && !sailOutOfBounds(x, y))
    : { slalomDock: -1, gates: [], axis: { x: 0, y: 1 }, ramps: [] };
  const buoys: THREE.Object3D[] = [];
  for (const g of course.gates) {
    for (const b of [g.left, g.right]) {
      const m = authored.take(AUTHORED_SLALOM_BUOY.key);
      if (!m) continue;
      m.position.set(pxToSceneX(b.x), WATER_Y - BUOY_DRAUGHT_U, pxToSceneZ(b.y));
      jetDockGroup.add(m);
      buoys.push(m);
    }
  }
  const slalomArrow = course.gates.length > 0 ? authored.take(AUTHORED_SLALOM_ARROW.key) : null;
  if (slalomArrow) {
    slalomArrow.visible = false;
    jetDockGroup.add(slalomArrow);
  }
  for (const r of course.ramps) {
    const m = authored.take(AUTHORED_SKI_RAMP.key);
    if (!m) continue;
    m.position.set(pxToSceneX(r.at.x), WATER_Y - SKI_RAMP_SINK_U, pxToSceneZ(r.at.y));
    m.rotation.y = Math.atan2(r.dir.x, r.dir.y); // lip toward +Z, like a ride
    jetDockGroup.add(m);
  }
  const slalomRun = newSlalomRun();
  let throttle = 0;
  // Airborne off a ramp: height above the ride base and its climb rate.
  let jumpY = 0;
  let jumpVy = 0;
  let onRamp = false;
  let nearJetDock = -1; // index into jetDocks; -1 when not at one
  let jetBobT = 0;
  /** Jet ski chase camera: how fast it swings round behind the heading at full
   *  speed (per second), and how many degrees the lens widens at full speed. */
  const SKI_CAM_FOLLOW = 2.6;
  /** Speed at the throttle's bottom and top notch, as a share of the ski's
   *  speedPx (the pad alone tops out at 1). */
  const SKI_THROTTLE_MIN = 0.4;
  const SKI_THROTTLE_MAX = 1.4;
  const SKI_FOV_KICK = 9;
  const gemGeos: THREE.BufferGeometry[] = [];
  const gemMats: THREE.Material[] = [];
  const gemTexs: THREE.Texture[] = [];
  const gemGeo = new THREE.OctahedronGeometry(0.34, 0);
  gemGeos.push(gemGeo);
  const gemColorMats = SPRINKLE_COLORS.map((c) => {
    const m = candyMat(THREE, c);
    m.emissiveIntensity = 0.4; // extra self-glow so they twinkle from afar
    gemMats.push(m);
    return m;
  });
  interface Gem {
    mesh: THREE.Mesh;
    x: number; // world px
    y: number; // world px
    wy: number; // scene-Y the gem hovers at (its "altitude")
    phase: number;
    got: boolean;
    color: number;
  }
  const gems: Gem[] = [];
  const GEM_R_PX = 38; // horizontal grab radius
  const GEM_V_TOL = 1.4; // how close in altitude the rider must be
  let gemSeed = 20260714;
  const grng = (): number => {
    gemSeed = (gemSeed * 1103515245 + 12345) & 0x7fffffff;
    return gemSeed / 0x7fffffff;
  };
  const inAnyZone = (x: number, y: number): boolean =>
    zoneRects.some((rc) => x >= rc.x0 - 24 && x <= rc.x1 + 24 && y >= rc.y0 - 24 && y <= rc.y1 + 24);
  let gemColorIdx = 0;
  const addGem = (x: number, y: number, wy: number): void => {
    const color = SPRINKLE_COLORS[gemColorIdx % SPRINKLE_COLORS.length];
    const mesh = new THREE.Mesh(gemGeo, gemColorMats[gemColorIdx % gemColorMats.length]);
    gemColorIdx += 1;
    mesh.position.set(pxToSceneX(x), wy, pxToSceneZ(y));
    mesh.castShadow = true;
    gemGroup.add(mesh);
    gems.push({ mesh, x, y, wy, phase: grng() * Math.PI * 2, got: false, color });
  };
  {
    // Ground gems tucked around the island (clear of zones + the mountain core).
    let placed = 0;
    let tries = 0;
    while (placed < 7 && tries < 400) {
      tries += 1;
      const x = BOUNDS.x0 + grng() * (BOUNDS.x1 - BOUNDS.x0);
      const y = BOUNDS.y0 + grng() * (BOUNDS.y1 - BOUNDS.y0);
      const nd = islandNd(x, y);
      if (nd > 0.82 || nd < 0.2) continue;
      if (inAnyZone(x, y)) continue;
      if (Math.hypot(x - mtnCenter.x, y - mtnCenter.y) < MTN_R_PX + 40) continue;
      addGem(x, y, terrainHeightPx(x, y) + 0.85);
      placed += 1;
    }
    // Sea gems ringing the island just off the shore, skim-height.
    placed = 0;
    tries = 0;
    while (placed < 6 && tries < 400) {
      tries += 1;
      const ang = grng() * Math.PI * 2;
      const rad = 0.45 + grng() * 0.35; // fraction of the fly half-extent
      const x = islandCx + Math.cos(ang) * flyHalfXPx * rad;
      const y = islandCy + Math.sin(ang) * flyHalfYPx * rad;
      if (islandNd(x, y) < 1.08) continue; // must be OVER the water
      addGem(x, y, WATER_Y + 1.05);
      placed += 1;
    }
    // High gems soaring over the open sea — only reachable by climbing.
    placed = 0;
    tries = 0;
    while (placed < 4 && tries < 400) {
      tries += 1;
      const ang = grng() * Math.PI * 2;
      const rad = 0.55 + grng() * 0.3;
      const x = islandCx + Math.cos(ang) * flyHalfXPx * rad;
      const y = islandCy + Math.sin(ang) * flyHalfYPx * rad;
      addGem(x, y, WATER_Y + 4.6 + grng() * 1.2);
      placed += 1;
    }
  }

  // A tiny sprinkle isle out in the wide sea — the payoff for flying to the edge
  // of the widened range: a cookie islet with a lollipop palm, a warm glow that
  // reads from afar, and its own gem cluster (some only reachable by climbing).
  {
    const ang = -0.7; // fixed corner so it's a findable landmark, not random
    const isleX = islandCx + Math.cos(ang) * flyHalfXPx * 0.82;
    const isleY = islandCy + Math.sin(ang) * flyHalfYPx * 0.82;
    const sx = pxToSceneX(isleX);
    const sz = pxToSceneZ(isleY);
    const discGeo = new THREE.CylinderGeometry(1.4, 1.7, 0.4, 16);
    const discMat = cookieMat(THREE, 0xcf9a52);
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.set(sx, WATER_Y + 0.02, sz);
    disc.receiveShadow = true;
    gemGroup.add(disc);
    gemGeos.push(discGeo);
    gemMats.push(discMat);
    const capGeo = new THREE.CylinderGeometry(1.15, 1.3, 0.14, 16);
    const capMat = frostingMat(THREE, CAKE.VANILLA);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(sx, WATER_Y + 0.24, sz);
    gemGroup.add(cap);
    gemGeos.push(capGeo);
    gemMats.push(capMat);
    const stickGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 8);
    const stickMat = candyMat(THREE, CAKE.STRAWBERRY_DEEP);
    const stick = new THREE.Mesh(stickGeo, stickMat);
    stick.position.set(sx + 0.2, WATER_Y + 1.0, sz);
    stick.castShadow = true;
    gemGroup.add(stick);
    gemGeos.push(stickGeo);
    gemMats.push(stickMat);
    const popGeo = new THREE.SphereGeometry(0.5, 12, 10);
    const popMat = candyMat(THREE, SPRINKLE_COLORS[4]);
    const pop = new THREE.Mesh(popGeo, popMat);
    pop.position.set(sx + 0.2, WATER_Y + 1.9, sz);
    pop.castShadow = true;
    gemGroup.add(pop);
    gemGeos.push(popGeo);
    gemMats.push(popMat);
    const halo = glowSprite(THREE, WORLD.GLOW_WARM, 4.5, 0.5);
    halo.sprite.position.set(sx, WATER_Y + 1.6, sz);
    gemGroup.add(halo.sprite);
    gemMats.push(halo.mat);
    gemTexs.push(halo.tex);
    // Its cluster: two skim-height gems + one you must climb for.
    addGem(isleX - 40, isleY, WATER_Y + 1.05);
    addGem(isleX + 40, isleY + 30, WATER_Y + 1.05);
    addGem(isleX, isleY - 30, WATER_Y + 3.8);
  }

  // `riderY` is the cupcake's current scene-Y (its altitude on foot or on a ride)
  // — a gem is grabbed only when the rider is close in the ground plane AND close
  // in altitude, which is what gates the high gems behind actually climbing.
  const updateGems = (dt: number, riderY: number): void => {
    for (const g of gems) {
      if (g.got) continue;
      if (!reduceMotion) {
        g.phase += dt / 900;
        g.mesh.rotation.y += dt * 0.0022;
        g.mesh.position.y = g.wy + Math.sin(g.phase) * 0.12;
      }
      const dHoriz = Math.hypot(g.x - pos.x, g.y - pos.y);
      if (dHoriz < GEM_R_PX && Math.abs(riderY - g.wy) < GEM_V_TOL) {
        g.got = true;
        g.mesh.visible = false;
        explode(pxToSceneX(g.x), g.mesh.position.y, pxToSceneZ(g.y), g.color);
        cb.onSfx?.('levelUp');
      }
    }
  };

  // ---------- Pointer (tap-to-walk + drag-to-steer) ----------
  const DRAG_THRESHOLD = 8; // screen px before a press becomes a steer
  let down = false;
  let moved = false;
  const downAt = { x: 0, y: 0 };

  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  const groundPointPx = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    // First, did we hit a game booth? (raycast its solid mesh)
    const hits = raycaster.intersectObjects(city.booths.map((b) => b.hit), false);
    if (hits.length > 0) {
      const slug = hits[0].object.userData.gameSlug as string | undefined;
      const booth = city.booths.find((b) => b.gameSlug === slug);
      if (booth) {
        intentEnterSlug = booth.gameSlug;
        return { ...booth.posPx };
      }
    }
    // Otherwise intersect the ground plane.
    const gh = raycaster.intersectObject(ground, false);
    if (gh.length > 0) {
      intentEnterSlug = null;
      const p = sceneToPx(gh[0].point.x, gh[0].point.z);
      // Allow taps into the wade ring + onto a walkable pier. If the tapped
      // point is itself walkable, use it; otherwise pull it back toward the
      // island center to the farthest walkable point along that ray (nearest
      // shore/pier edge), so a tap out to sea walks the cupcake to the shallows.
      if (!avatarBlockedAt(p.x, p.y)) return { x: p.x, y: p.y };
      let lo = 0;
      let hi = 1;
      for (let it = 0; it < 14; it++) {
        const mid = (lo + hi) / 2;
        const qx = islandCx + (p.x - islandCx) * mid;
        const qy = islandCy + (p.y - islandCy) * mid;
        if (avatarBlockedAt(qx, qy)) hi = mid;
        else lo = mid;
      }
      return { x: islandCx + (p.x - islandCx) * lo, y: islandCy + (p.y - islandCy) * lo };
    }
    return null;
  };

  // Ground/sea point for FLYING vehicles — NO walkability clamp, so a tap out
  // over the open sea (or a still-fogged land) is a valid fly target. We hit
  // the ground OR the wide sea plane (whichever the ray reaches first — the
  // ground sits above the water, so it wins where they overlap), so a tap far
  // past the island's ground plane still lands on the water instead of missing.
  // Clamped to FLY_BOUNDS so you can't fly off the edge of the world.
  const rawGroundPointPx = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const gh = raycaster.intersectObjects([ground, water], false);
    if (gh.length === 0) return null;
    const p = sceneToPx(gh[0].point.x, gh[0].point.z);
    return {
      x: clampFly(p.x, FLY_BOUNDS.x0, FLY_BOUNDS.x1),
      y: clampFly(p.y, FLY_BOUNDS.y0, FLY_BOUNDS.y1),
    };
  };

  // Did this screen point hit Cakey's (invisible) tap box? Checked before the
  // ground raycast on a tap so tapping him talks instead of walking there.
  const raycastCakey = (clientX: number, clientY: number): boolean => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObject(cakey.hitMesh, false).length > 0;
  };

  const onPointerDown = (e: PointerEvent): void => {
    if (paused || riding) return;
    down = true;
    moved = false;
    downAt.x = e.clientX;
    downAt.y = e.clientY;
    try {
      renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      // best-effort
    }
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!down || paused || riding) return;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    // Steer: screen-right → world +x, screen-down → world +y (toward camera).
    const len = Math.hypot(dx, dy) || 1;
    steer = { x: dx / len, y: dy / len };
    target = null;
    intentEnterSlug = null;
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (!down) return;
    down = false;
    steer = null;
    try {
      renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      // harmless
    }
    if (paused || riding) return;
    if (!moved) {
      // Build mode: a tap aims the piece at that square instead of walking.
      // Dragging still walks, so a kid can stroll over to where they're building.
      if (buildTool) {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
        raycaster.setFromCamera(ndc, camera);
        const gh = raycaster.intersectObject(ground, false);
        if (gh.length > 0) {
          const p = sceneToPx(gh[0].point.x, gh[0].point.z);
          buildCell = cellOfPx(p.x, p.y);
          refreshGhost();
          cb.onSfx?.('tap');
        }
        return;
      }
      // Riding a vehicle: a tap re-targets the ride (fly rides use the
      // unclamped point so you can head out over the sea) — never enters a
      // booth or talks to Cakey.
      if (vehicleKind) {
        const info = findVehicle(vehicleKind);
        // Double-tap → a short, forgiving BOOST burst (brief cooldown so it can't
        // be spammed). A quick whoosh of extra wake puffs sells the surge.
        const nowMs = performance.now();
        if (info && nowMs - lastVehTapAt < 320 && boostCd <= 0) {
          boostLeft = 700;
          boostCd = 1200;
          cb.onSfx?.('launch');
          if (!reduceMotion && vehicleModel) {
            const gp = vehicleModel.group.position;
            for (let k = 0; k < 5; k++) {
              spawnPuff(
                gp.x - Math.sin(vehHeading) * (0.4 + k * 0.15),
                gp.y + info.trail.yOffU + 0.1,
                gp.z - Math.cos(vehHeading) * (0.4 + k * 0.15),
                info.trail.color,
                info.trail.sizeU * 1.3,
              );
            }
          }
        }
        lastVehTapAt = nowMs;
        const t =
          info?.control === 'fly'
            ? rawGroundPointPx(e.clientX, e.clientY)
            : groundPointPx(e.clientX, e.clientY);
        if (t) {
          target = t;
          intentEnterSlug = null;
          spawnTapRing(t.x, t.y);
          cb.onSfx?.('tap');
        }
        return;
      }
      // A tap on Cakey opens his talk panel instead of walking there.
      if (cb.onCakeyTap && raycastCakey(e.clientX, e.clientY)) {
        cb.onSfx?.('tap');
        cb.onCakeyTap();
        return;
      }
      // Otherwise a tap → walk to the ground/booth point.
      const t = groundPointPx(e.clientX, e.clientY);
      if (t) {
        target = t;
        spawnTapRing(t.x, t.y);
        cb.onSfx?.('tap');
      }
    }
  };
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);

  // ---------- The Sugar Mile access rule ----------
  // "Cross in a vehicle, or ride the bus. Never on foot."
  //
  // `control: 'drive'` rides already run through this same avatarBlockedAt (see
  // vehicles.ts), so allowing them costs exactly one clause. Fly rides never
  // consult it — they ignore ground collision entirely — so they reach the
  // island regardless, which is intended.
  const onBridgeDeck = (px: number, py: number): boolean =>
    distToSeg(px, py, bridgeSeg) <= BRIDGE_HALF_W_PX;
  /** How far along the deck a point sits, 0 at the mainland end, 1 at the island. */
  const bridgeProgress = (px: number, py: number): number => {
    const vx = bridgeSeg.bx - bridgeSeg.ax;
    const vy = bridgeSeg.by - bridgeSeg.ay;
    const len2 = vx * vx + vy * vy || 1;
    return Math.max(0, Math.min(1, ((px - bridgeSeg.ax) * vx + (py - bridgeSeg.ay) * vy) / len2));
  };
  const mayUseRoad = (): boolean =>
    busing || (vehicleKind !== null && findVehicle(vehicleKind)?.control === 'drive');
  /** Blocked by the boom: on foot, at or past the barrier. Deliberately checked
   *  independently of the sea gate — the landward stretch of deck sits over LAND,
   *  so without this a walker would stroll onto the bridgehead and only stop
   *  somewhere out over open water, which reads as a bug rather than a rule. */
  const stoppedByBoom = (px: number, py: number): boolean =>
    !mayUseRoad() && onBridgeDeck(px, py) && bridgeProgress(px, py) >= BRIDGE_BARRIER_T;

  // ---------- Movement clamp + fog wall ----------
  const blockedAt = (px: number, py: number): boolean => {
    // Keep the cupcake on the island — the beach is walkable, the sea is not.
    // 0.985 lets the cupcake stand right at the lapping waterline (nd=1.0 is
    // the shore); the sea beyond stays off-limits.
    if (islandNd(px, py) > 0.985) return true;
    // A storm re-locks a discovered land temporarily (separate from `discovered`
    // so the earned-land state is never touched).
    if (stormRect && insideRect(px, py, stormRect)) return true;
    for (const r of REGIONS) {
      if (r.starter || discovered.has(r.slug)) continue;
      if (insideRect(px, py, cityRectPx(r))) return true;
    }
    return false;
  };
  // Avatar-only walk test: like blockedAt, but the sea gate is pushed out to a
  // shallow WADE ring (WADE_ND), and a discovered pier's deck is walkable even
  // over deep water. Cakey keeps the strict `blockedAt` (stays on land).
  const avatarBlockedAt = (px: number, py: number): boolean => {
    if (stoppedByBoom(px, py)) return true;
    if (islandNd(px, py) > WADE_ND && !onWalkablePier(px, py) && !(onBridgeDeck(px, py) && mayUseRoad()))
      return true;
    if (stormRect && insideRect(px, py, stormRect)) return true;
    for (const r of REGIONS) {
      if (r.starter || discovered.has(r.slug)) continue;
      if (insideRect(px, py, cityRectPx(r))) return true;
    }
    return false;
  };
  /** Move from `pos` to candidate, sliding along walls (try full, then X-only,
   *  then Z-only). The only outer bound is the island water-test in blockedAt
   *  (the beach out to the waterline is walkable on every side) plus the fog
   *  walls of undiscovered lands — NOT the old BOUNDS rectangle, which used to
   *  fence the player ~40px past the train ring, well short of the shore. The
   *  train is pure decoration; the cupcake now crosses it to reach the water. */
  const applyMove = (nx: number, ny: number): void => {
    if (!avatarBlockedAt(nx, ny)) {
      pos.x = nx;
      pos.y = ny;
    } else if (!avatarBlockedAt(nx, pos.y)) {
      pos.x = nx;
    } else if (!avatarBlockedAt(pos.x, ny)) {
      pos.y = ny;
    }
    // else fully blocked — stay put.
  };

  // Pick a fresh wander spot for Cakey: a reachable, unfogged, on-land point
  // near his current position, occasionally biased toward the kid so he drifts
  // over to say hi. Rejects blocked points (sea + undiscovered lands) via the
  // same test the avatar uses; returns null (→ dwell + retry) if nothing valid.
  const pickCakeyTarget = (): { x: number; y: number } | null => {
    // 1-in-5 strolls, aim near the kid instead of a random spot.
    if (Math.random() < 0.2) {
      const jx = pos.x + (Math.random() - 0.5) * 120;
      const jy = pos.y + (Math.random() - 0.5) * 120;
      if (!blockedAt(jx, jy)) return { x: jx, y: jy };
    }
    for (let i = 0; i < 24; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = CAKEY_WANDER_MIN_PX + Math.random() * (CAKEY_WANDER_MAX_PX - CAKEY_WANDER_MIN_PX);
      const tx = cakeyPos.x + Math.cos(ang) * rad;
      const ty = cakeyPos.y + Math.sin(ang) * rad;
      if (!blockedAt(tx, ty)) return { x: tx, y: ty };
    }
    return null;
  };

  // ---------- Region / approach / near-building scans ----------
  const regionAtPx = (px: number, py: number): Region | null =>
    REGIONS.find((r) => insideRect(px, py, cityRectPx(r))) ?? null;

  const scanApproach = (): void => {
    let nearest: string | null = null;
    let nearestDist = FOG_APPROACH_PX;
    for (const r of REGIONS) {
      if (r.starter || discovered.has(r.slug)) continue;
      if (!isAdjacentToDiscovered(r.slug, [...discovered])) continue;
      const d = distToRect(pos.x, pos.y, cityRectPx(r));
      if (d <= nearestDist) {
        nearest = r.slug;
        nearestDist = d;
      }
    }
    if (nearest && nearest !== currentApproachRegion) {
      currentApproachRegion = nearest;
      const region = findRegion(nearest);
      if (region) cb.onApproachFog({ regionSlug: nearest, cost: region.unlock_cost });
    } else if (!nearest) {
      currentApproachRegion = null;
    }
  };

  const scanNearBuilding = (): void => {
    let nearest: string | null = null;
    let best = ENTER_PROMPT_PX;
    for (const b of city.booths) {
      const region = REGIONS.find((r) => r.games.includes(b.gameSlug));
      if (region && !region.starter && !discovered.has(region.slug)) continue;
      // Suppress "Play" prompts for a land a storm has re-locked.
      if (region && region.slug === stormLockedSlug) continue;
      const d = Math.hypot(pos.x - b.posPx.x, pos.y - b.posPx.y);
      if (d <= best) {
        nearest = b.gameSlug;
        best = d;
      }
    }
    if (nearest !== nearBuildingSlug) {
      nearBuildingSlug = nearest;
      cb.onNearBuilding(nearest);
    }
  };

  const maybePostPosition = (now: number, force: boolean): void => {
    // Never persist a position while riding a vehicle — a fly ride roams over
    // sea/fog, and respawning there would strand the cupcake. The last on-foot
    // (walkable) spot stays saved until it next moves on foot.
    if (vehicleKind) return;
    if (!force && (!movedSincePost || now - lastPostAt < POSITION_POST_INTERVAL_MS)) return;
    lastPostAt = now;
    movedSincePost = false;
    // Convert city-px back to original region-px so the stored coords stay in
    // the contract's space (and any other consumer reads them correctly).
    const o = cityToOrig({ x: pos.x, y: pos.y }, currentRegionSlug);
    cb.onPositionUpdate({ region_slug: currentRegionSlug, x: Math.round(o.x), y: Math.round(o.y) });
  };

  // ---------- Weather director + the mysterious-force storm ----------
  // Lands a storm can target: discovered, non-starter GAME lands the kid isn't
  // standing in and that aren't already fogged.
  const stormTargets = (): Region[] =>
    REGIONS.filter(
      (r) =>
        !r.starter &&
        r.games.length > 0 &&
        discovered.has(r.slug) &&
        r.slug !== currentRegionSlug &&
        !city.isFogged(r.slug),
    );
  const stormAllowed = (): boolean =>
    sinceStormMs >= STORM_MIN_GAP_MS && stormTargets().length > 0;

  const weightedPick = (): WeatherKind => {
    const entries = Object.entries(WEATHER_WEIGHTS) as [WeatherKind, number][];
    let total = 0;
    for (const [, w] of entries) total += w;
    let r = Math.random() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return 'sunny';
  };
  // Anti-chaos: rainbow always follows a shower/storm, then sunny; snow settles
  // to a calm state; never two "busy" states back-to-back.
  const pickWeather = (): WeatherKind => {
    if (lastKind === 'shower' || lastKind === 'storm') return 'rainbow';
    if (lastKind === 'rainbow') return 'sunny';
    if (lastKind === 'snow') return Math.random() < 0.5 ? 'sunny' : 'overcast';
    let k = weightedPick();
    if (k === 'storm' && !stormAllowed()) k = 'overcast';
    return k;
  };

  const startStorm = (): boolean => {
    const targets = stormTargets();
    if (targets.length === 0) return false;
    const region = targets[Math.floor(Math.random() * targets.length)];
    stormLockedSlug = region.slug;
    stormRect = cityRectPx(region);
    stormLeftMs = STORM_DURATION_MS;
    currentStormApproach = false;
    city.refogRegion(region.slug); // roll the pink fog back on
    emitWeather('storm');
    lastKind = 'storm';
    return true;
  };
  const endStorm = (): void => {
    if (!stormLockedSlug) return;
    const slug = stormLockedSlug;
    city.revealRegion(slug); // dissolve the storm fog
    // Sprinkle-burst over the freed land (reuses the fireworks particles).
    const cc = cityCenterPx(slug);
    const bx = pxToSceneX(cc.x);
    const bz = pxToSceneZ(cc.y);
    const by = terrainHeightPx(cc.x, cc.y) + 2.0;
    for (let k = 0; k < 2; k += 1) {
      explode(
        bx + (Math.random() - 0.5) * 1.4,
        by + Math.random() * 1.0,
        bz + (Math.random() - 0.5) * 1.4,
        FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
      );
    }
    stormLockedSlug = null;
    stormRect = null;
    stormLeftMs = 0;
    // Restart the hour. Written through immediately (not on the 5s throttle) so
    // closing the tab right after a storm can't hand the kid a fresh one on
    // their next visit.
    sinceStormMs = 0;
    setTownSessionSinceStorm(0);
    currentStormApproach = false;
    cb.onStormCleared?.();
    emitWeather('rainbow');
    lastKind = 'rainbow';
    weatherDwellLeft = 9_000; // brief rainbow, then back to sunny
  };
  const goWeather = (kind: WeatherKind): void => {
    if (kind === 'storm') {
      if (!startStorm()) {
        emitWeather('overcast');
        lastKind = 'overcast';
      }
      return;
    }
    emitWeather(kind);
    lastKind = kind;
  };

  const scanStormApproach = (): void => {
    if (!stormLockedSlug || !stormRect) {
      currentStormApproach = false;
      return;
    }
    const d = distToRect(pos.x, pos.y, stormRect);
    if (d <= STORM_APPROACH_PX && !currentStormApproach) {
      currentStormApproach = true;
      cb.onApproachStorm?.({ regionSlug: stormLockedSlug, cost: STORM_CLEAR_COST });
    } else if (d > STORM_APPROACH_PX + 20) {
      currentStormApproach = false;
    }
  };

  const updateWeatherDirector = (dt: number): void => {
    // Accumulate playing time toward the next storm and write it back at most
    // every ~5s, so a kid who closes the tab mid-session keeps their progress
    // toward the next storm without hammering sessionStorage every frame.
    sinceStormMs += dt;
    sinceStormSaveMs += dt;
    if (sinceStormSaveMs >= 5_000) {
      sinceStormSaveMs = 0;
      setTownSessionSinceStorm(sinceStormMs);
    }
    if (stormLockedSlug) {
      // A storm is running — hold the sky, count down the free auto-clear, and
      // offer the paid skip when the kid comes near.
      stormLeftMs -= dt;
      scanStormApproach();
      if (stormLeftMs <= 0) endStorm();
      return;
    }
    weatherDwellLeft -= dt;
    if (weatherDwellLeft <= 0) {
      goWeather(pickWeather());
      weatherDwellLeft =
        WEATHER_DWELL_MIN_MS + Math.random() * (WEATHER_DWELL_MAX_MS - WEATHER_DWELL_MIN_MS);
    }
  };

  // ============================================================================
  // LEARNING-MODE CONTRIBUTION POINT #2 — the chase-camera feel
  // ============================================================================
  //
  // updateCamera places the chase camera behind + above the cupcake each frame.
  // The default lerps the camera position toward an offset anchor and looks at
  // the avatar with a little forward look-ahead. The trade-offs that decide
  // whether the world reads as "big studio" vs "stiff":
  //   * CAM_LERP high (~0.2) = tight/responsive but can feel jittery on quick
  //     direction changes; low (~0.04) = lazy/cinematic but laggy on fast roam.
  //   * Look-ahead (biasing lookAt toward velocity) makes turns feel anticipatory
  //     and "directed"; zero look-ahead keeps the avatar dead-center and calmer.
  //   * Pitch (camera height vs back distance) sets how top-down vs over-the-
  //     shoulder it reads.
  // George — tune SHOULDER_BACK_U / SHOULDER_HEIGHT_U / SHOULDER_LOOK_U in
  // types.ts (CAM_BACK_U / CAM_HEIGHT_U still drive the other modes), and the
  // look-ahead in camera-pose.ts, to taste. Keep the avatar visible at all
  // bounds. The pose math and its smoothing live in camera-pose.ts so the
  // close-up angle is unit-tested; read its header before changing either.
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camRig = createCamRig();
  let zoom = ZOOM_DEFAULT;
  // Orbit yaw (radians) — the user spins the world with the ↺/↻ buttons. The
  // camera sits behind+above the avatar at this yaw; steering is rotated by the
  // same yaw (below) so "screen-up" always walks away from the camera no matter
  // which way the world is turned.
  let camYaw = 0;

  // ---- Fun world cameras (cycled by the host's 🎥 button) ----
  //   'chase'  — the classic rig.
  //   'action' — low + tight behind the cupcake/ride; the ground rushes.
  //   'drone'  — a slow cinematic orbit (a static wide 3/4 shot under
  //              reduced-motion — no continuous camera motion).
  //   'sky'    — a high kite cam looking steeply down.
  // A persistent WORLD camera setting: applies on foot, on the Sugar Express /
  // ferry, and on rentals alike, and survives mounting/dismounting. Non-chase
  // modes follow the terrain under the avatar (see updateCamera) so the low
  // action cam still works climbing the frosting mountain.
  const CAM_MODES: CamMode[] = ['chase', 'action', 'drone', 'sky'];
  let camMode: CamMode = 'chase';
  let droneAngle = 0; // accumulated orbit angle for 'drone'
  // The yaw the camera ACTUALLY used this frame (camYaw + any drone orbit).
  // Steering rotates by THIS, so "push up" always drives away from the camera
  // even while the drone circles. One frame of lag is imperceptible.
  let camYawEffective = 0;

  // ---------- Story cutscene (scripted camera takeover) ----------
  // A gentle pan to a region and back, used by playStoryCutscene. While active
  // it OWNS the camera (updateCamera early-returns into it) and `paused` freezes
  // the sim. Timing advances in tick(); FX fires once at the hold. Kept null when
  // idle, so the normal chase rig is completely untouched.
  const CUT_IN_MS = 900; // ease from the chase pose out to the region
  const CUT_OUT_MS = 900; // ease back to the chase pose
  const CUT_BEAT_MS = 2600; // per-beat display window (paces the caption band)
  interface Cutscene {
    startPos: THREE.Vector3;
    startLook: THREE.Vector3;
    toPos: THREE.Vector3;
    toLook: THREE.Vector3;
    t: number; // elapsed ms
    inMs: number;
    holdMs: number;
    outMs: number;
    beatCount: number;
    lastBeat: number;
    fxFired: boolean;
    style: StoryStyle;
    regionSlug?: string;
  }
  let cutscene: Cutscene | null = null;
  const easeInOut = (x: number): number =>
    x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;

  const updateCamera = (velX: number, velZ: number, dtMs = 16): void => {
    // Cutscene takeover: keyframe the camera between the chase pose and the
    // region target, then return before any chase math runs.
    if (cutscene) {
      const { t, inMs, holdMs, outMs } = cutscene;
      if (t < inMs) {
        const p = easeInOut(inMs > 0 ? t / inMs : 1);
        camPos.lerpVectors(cutscene.startPos, cutscene.toPos, p);
        camLook.lerpVectors(cutscene.startLook, cutscene.toLook, p);
      } else if (t < inMs + holdMs) {
        camPos.copy(cutscene.toPos);
        camLook.copy(cutscene.toLook);
      } else {
        const q = easeInOut(outMs > 0 ? Math.min(1, (t - inMs - holdMs) / outMs) : 1);
        camPos.lerpVectors(cutscene.toPos, cutscene.startPos, q);
        camLook.lerpVectors(cutscene.toLook, cutscene.startLook, q);
      }
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      return;
    }

    const ax = pxToSceneX(pos.x);
    const az = pxToSceneZ(pos.y);
    // Altitude framing: while flying, pull the camera UP + BACK and lift the look
    // target with the ride's height, so climbing literally reveals more of the
    // world (and diving drops you back down over the waves).
    let altB = 0;
    if (vehicleKind) {
      const info = findVehicle(vehicleKind);
      if (info?.control === 'fly') altB = flyAlt;
    }
    // Base chase pose, then the world-camera mode reshapes it (on foot AND on
    // any ride — the mode is a persistent world setting). Every mode rides the
    // terrain under the avatar, so the low shoulder and action cams don't sink
    // beneath the rolling hills / the 5.2u frosting mountain. The raw ground
    // height goes in; the rig smooths it once for both camera and aim height.
    // On a jet ski the camera rides the sea surface, not the seabed below it.
    const sailing = !!vehicleKind && findVehicle(vehicleKind)?.control === 'sail';
    const gY = sailing ? WATER_Y : terrainHeightPx(pos.x, pos.y);
    if (sailing && (camMode === 'chase' || camMode === 'action') && !reduceMotion) {
      // Swing round behind the ski's heading, faster the faster it goes, so the
      // kid always looks down the bow. Steering stays camera-relative, so
      // holding left on the pad carves a steady turn, as in a jet ski game.
      // The ↺/↻ buttons still turn it; the follow brings it back.
      const info = findVehicle(vehicleKind!)!;
      const frac = Math.min(1, Math.hypot(velX, velZ) / (info.speedPx / PX_PER_UNIT));
      let dYaw = vehHeading + Math.PI - camYaw;
      while (dYaw > Math.PI) dYaw -= Math.PI * 2;
      while (dYaw < -Math.PI) dYaw += Math.PI * 2;
      camYaw += dYaw * Math.min(1, SKI_CAM_FOLLOW * frac * (dtMs / 1000));
      // Widen the lens with speed (more with a boost) so a run feels fast.
      const fov = CAM_FOV + SKI_FOV_KICK * frac * (boostLeft > 0 ? 1.6 : 1);
      if (Math.abs(camera.fov - fov) > 0.05) {
        camera.fov += (fov - camera.fov) * Math.min(1, (dtMs / 1000) * 4);
        camera.updateProjectionMatrix();
      }
    } else if (camera.fov !== CAM_FOV) {
      camera.fov = CAM_FOV;
      camera.updateProjectionMatrix();
    }
    const fog = scene.fog as THREE.Fog;
    const fogNear = sailing ? SAIL_FOG_NEAR_U : FOG_NEAR_U;
    if (fog.near !== fogNear) {
      fog.near += (fogNear - fog.near) * Math.min(1, (dtMs / 1000) * 2);
      if (Math.abs(fog.near - fogNear) < 0.1) fog.near = fogNear;
    }
    let yaw = camYaw;
    if (camMode === 'drone') {
      // Slow cinematic orbit; reduced-motion holds a static 3/4 wide shot.
      if (!reduceMotion) droneAngle += (dtMs / 1000) * 0.32;
      yaw = camYaw + droneAngle + (reduceMotion ? 0.8 : 0);
    }
    camYawEffective = yaw;
    const desired = computeCamPose({ ax, az, groundY: gY, velX, velZ, zoom, yaw, mode: camMode, altB, ski: sailing });
    // Position AND aim through the same critically-damped, frame-rate-
    // independent filter, so the view direction holds while the kid moves.
    stepCamRig(camRig, desired, CAM_SMOOTH_S, dtMs / 1000);
    camPos.set(camRig.pos.x, camRig.pos.y, camRig.pos.z);
    camLook.set(camRig.look.x, camRig.look.y, camRig.look.z);
    // A low camera can end up inside a hill that rises BEHIND the avatar; keep
    // it above the ground where the camera itself stands. Applied to the
    // smoothed result, never to the filter's target, so a hill only lifts the
    // rendered camera and cannot kick the filter (which would swing the pitch
    // after the hill was passed).
    const camAt = sceneToPx(camPos.x, camPos.z);
    const camGroundY = sailing
      ? Math.max(terrainHeightPx(camAt.x, camAt.y) + 1.2, WATER_Y + 0.55)
      : terrainHeightPx(camAt.x, camAt.y) + 1.2;
    if (camPos.y < camGroundY) camPos.y = camGroundY;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    // Fade any booth / gate / landmark standing between the camera and the
    // cupcake (the low shoulder pose puts them in the way often).
    occTarget.set(ax, gY + 0.9 + altB, az);
    occluderFader.update(camera, occTarget, dtMs);
  };

  // Fire a cutscene's one-shot juice over its focus region. Deliberately
  // COSMETIC-ONLY: the fog dissolve runs only for a land the kid already owns
  // (city.revealRegion is visual — it does NOT touch the `discovered` gate — but
  // we still gate it so a fogged land never looks unlocked when its wall stays
  // up). Sprinkle bursts reuse the fireworks `explode` pool; 'farewell' stays
  // quiet. Honors reduced-motion via the caller (fxFired preset true).
  const fireCutsceneFx = (cs: Cutscene): void => {
    if (!cs.regionSlug) return;
    const cc = cityCenterPx(cs.regionSlug);
    const bx = pxToSceneX(cc.x);
    const bz = pxToSceneZ(cc.y);
    const by = terrainHeightPx(cc.x, cc.y) + 2.2;
    if (cs.style === 'arrival' && discovered.has(cs.regionSlug)) {
      city.revealRegion(cs.regionSlug); // cosmetic re-dissolve of an owned land
    }
    if (cs.style !== 'farewell') {
      for (let k = 0; k < 3; k += 1) {
        const col = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
        explode(
          bx + (Math.random() - 0.5) * 1.6,
          by + Math.random() * 1.2,
          bz + (Math.random() - 0.5) * 1.6,
          col,
        );
      }
    }
  };

  // Tear down a running cutscene: release the camera (the chase rig eases home on
  // its own CAM_LERP), unpause, and tell the host. Resets lastTime so the resume
  // frame doesn't see a giant dt.
  const endCutscene = (): void => {
    if (!cutscene) return;
    cutscene = null;
    paused = false;
    lastTime = performance.now();
    cb.onCutsceneEnd?.();
  };

  // ---------- Main loop ----------
  const tick = (): void => {
    raf = window.requestAnimationFrame(tick);
    const now = performance.now();
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 50) dt = 50;

    let isMoving = false;
    let velPxX = 0;
    let velPxY = 0;

    if (!paused) {
      train.update(dt);
      for (const line of ferries) line.ferry.update(dt);
      bus.update(dt);
      // The boom is driven by the SAME predicate the collision uses, so the
      // barrier can never look open while the road is shut (or vice versa).
      bridge.update(dt, mayUseRoad());

      // Drove the Sugar Mile onto Race Island → discover it. The island's lands
      // have no walkable neighbour (regions.ts), so the normal approach-to-
      // unlock scan never fires for them; arrival IS the discovery, exactly as
      // it is for the ferry and for a fly landing. Keyed on the race bean's own
      // land field rather than the region rect so it triggers the moment the
      // wheels touch the island's beach, not only once fully inside the rect.
      if (raceBean && !discovered.has('race-pit-row') && mayUseRoad() && raceBean.nd(pos.x, pos.y) < 1) {
        // Only reveal if the kid can actually AFFORD the land. Driving over is
        // fare-free but the land still costs, and this reveal is optimistic (the
        // POST follows it), so revealing an unaffordable land would show it and
        // then lose it on the next reload. Better they drive the island's beach
        // and come back once they have earned it.
        const price = arrivalPrice(findRegion('race-pit-row')?.unlock_cost ?? 0, 'drive');
        if (balance >= price) discoverIsland('race-pit-row', 'drive');
      }

      if (riding) {
        // Glue the cupcake to the train; walk input is ignored while riding.
        const tp = train.getPositionPx();
        pos.x = tp.x;
        pos.y = tp.y;
        const th = train.getHeadingPx();
        velPxX = th.x * 60;
        velPxY = th.y * 60;
        movedSincePost = true;
      } else if (ferrying) {
        // Glue the cupcake to the ferry as it sails; disembark on arrival.
        const line = ferrying;
        const fp = line.ferry.getPositionPx();
        pos.x = fp.x;
        pos.y = fp.y;
        const fh = line.ferry.getHeadingPx();
        velPxX = fh.x * 60;
        velPxY = fh.y * 60;
        movedSincePost = true;
        const arrived = line.ferry.consumeArrival();
        if (arrived) {
          ferrying = null;
          onFerryArrive(line, arrived);
        }
      } else if (busing) {
        // Glue the cupcake to the bus as it drives; step off on arrival. Same
        // shape as the ferry branch above — the kid is a passenger, not a driver.
        const bp = bus.getPositionPx();
        pos.x = bp.x;
        pos.y = bp.y;
        const bh = bus.getHeadingPx();
        velPxX = bh.x * 60;
        velPxY = bh.y * 60;
        movedSincePost = true;
        const arrived = bus.consumeArrival();
        if (arrived) {
          busing = false;
          onBusArrive(arrived);
        }
      } else if (vehicleKind) {
        // Riding a rented vehicle — same steer/target input as walking, at the
        // ride's own speed. Drive rides obey walls (applyMove); fly rides move
        // free within the world rect. Frozen while a fly ride is landing.
        const info = findVehicle(vehicleKind)!;
        // Boost burst (double-tap) + its cooldown wind down regardless of input,
        // so the surge is short and can't be spammed. `boosting` scales speed.
        if (boostLeft > 0) boostLeft -= dt;
        if (boostCd > 0) boostCd -= dt;
        const boosting = boostLeft > 0;
        if (!landing) {
          // Altitude trim: a held climb/dive button retrims a fly ride's target
          // altitude within its band. Skim the waves low, soar high to peek over
          // fogged lands.
          if (info.control === 'fly' && climbDir !== 0) {
            flyAltTarget = clampFly(
              flyAltTarget + climbDir * info.climbRateU * (dt / 1000),
              info.minAltitudeU,
              info.maxAltitudeU,
            );
          }
          let dirx = 0;
          let diry = 0;
          // Thumb-pad input wins over canvas drag; both are screen-space and
          // rotate by the EFFECTIVE camera yaw (incl. any drone orbit) so
          // "push up" always drives away from the camera. The pad vector keeps
          // its magnitude (≤1) — integrating the un-normalized direction below
          // scales speed, so a gentle push creeps and full tilt is full speed.
          const sv = padSteer ?? steer;
          if (sv && Math.hypot(sv.x, sv.y) > 0.08) {
            const sinY = Math.sin(camYawEffective);
            const cosY = Math.cos(camYawEffective);
            dirx = sv.x * cosY + sv.y * sinY;
            diry = -sv.x * sinY + sv.y * cosY;
          } else if (target) {
            const dx = target.x - pos.x;
            const dy = target.y - pos.y;
            const d = Math.hypot(dx, dy);
            if (d > ARRIVE_EPS_PX) {
              dirx = dx / d;
              diry = dy / d;
            } else {
              target = null;
            }
          }
          // Jet ski throttle: the ski drives on along its heading at the
          // throttle's speed; the pad (or a tap) only picks the direction.
          let throttleMul = 1;
          if (info.control === 'sail' && throttle > 0) {
            const len = Math.hypot(dirx, diry);
            if (len > 0) {
              dirx /= len;
              diry /= len;
            } else {
              dirx = Math.sin(vehHeading);
              diry = Math.cos(vehHeading);
            }
            throttleMul = SKI_THROTTLE_MIN + (SKI_THROTTLE_MAX - SKI_THROTTLE_MIN) * throttle;
          }
          if (dirx !== 0 || diry !== 0) {
            const spd = info.speedPx * (boosting ? info.boostMult : 1) * throttleMul;
            const step = (spd * dt) / 1000;
            const nx = pos.x + dirx * step;
            const ny = pos.y + diry * step;
            if (info.control === 'fly') {
              pos.x = clampFly(nx, FLY_BOUNDS.x0, FLY_BOUNDS.x1);
              pos.y = clampFly(ny, FLY_BOUNDS.y0, FLY_BOUNDS.y1);
            } else if (info.control === 'sail') {
              applySail(nx, ny);
            } else {
              applyMove(nx, ny);
            }
            velPxX = dirx * spd;
            velPxY = diry * spd;
            isMoving = true;
          }
        }
        movedSincePost = true;
      } else if (steer) {
        const stepLen = (WALK_SPEED_PX * dt) / 1000;
        // Rotate the screen-space steer into world space by the EFFECTIVE
        // camera yaw (incl. any drone-cam orbit), so dragging "up" always
        // walks the way the camera faces, even after the world has been spun
        // or while the drone camera circles.
        const sinY = Math.sin(camYawEffective);
        const cosY = Math.cos(camYawEffective);
        const wx = steer.x * cosY + steer.y * sinY;
        const wy = -steer.x * sinY + steer.y * cosY;
        applyMove(pos.x + wx * stepLen, pos.y + wy * stepLen);
        velPxX = wx * WALK_SPEED_PX;
        velPxY = wy * WALK_SPEED_PX;
        isMoving = true;
        movedSincePost = true;
      } else if (target) {
        const before = { x: pos.x, y: pos.y };
        const r = stepAvatarToward(pos, target, WALK_SPEED_PX, dt, ARRIVE_EPS_PX);
        applyMove(r.x, r.y);
        // If a fog wall stopped us short, abandon the target so we don't grind.
        if (Math.hypot(pos.x - before.x, pos.y - before.y) < 0.01 && !r.arrived) {
          target = null;
          intentEnterSlug = null;
        }
        velPxX = r.vx;
        velPxY = r.vy;
        isMoving = !r.arrived;
        movedSincePost = true;
        if (r.arrived) {
          target = null;
          if (intentEnterSlug) {
            const slug = intentEnterSlug;
            intentEnterSlug = null;
            maybePostPosition(now, true);
            cb.onSfx?.('start');
            cb.onEnterGame(slug);
          }
        }
      }

      // Region change.
      const here = regionAtPx(pos.x, pos.y);
      if (here && here.slug !== currentRegionSlug) {
        currentRegionSlug = here.slug;
        cb.onRegionChange(here.slug);
        maybePostPosition(now, true);
      }

      if (riding || vehicleKind || ferrying || busing) {
        // No "Play X" / approach prompts while riding past booths or lands.
        if (nearBuildingSlug !== null) {
          nearBuildingSlug = null;
          cb.onNearBuilding(null);
        }
      } else {
        scanApproach();
        scanNearBuilding();
        // Trampolines — rising edge as the cupcake steps onto any pad. Only one
        // launch runs at a time; each pad tracks its own hot flag.
        for (const tr of tramps) {
          const td = Math.hypot(pos.x - tr.px.x, pos.y - tr.px.y);
          if (td < TRAMP_R_PX && !tr.hot && !launching) {
            tr.hot = true;
            launching = true;
            launchT = 0;
            launchMat = tr.matMesh;
            cb.onSfx?.('launch');
          } else if (td > TRAMP_R_PX + 12) {
            tr.hot = false;
          }
        }
        // Fireworks pad — rising edge as the cupcake steps on.
        const fd = Math.hypot(pos.x - firePx.x, pos.y - firePx.y);
        if (fd < FIRE_R_PX && !fireHot && showLeft <= 0) {
          fireHot = true;
          startShow();
        } else if (fd > FIRE_R_PX + 12) {
          fireHot = false;
        }
        // Near the train? → host shows a "Hop on" prompt.
        const tp = train.getPositionPx();
        const near = Math.hypot(pos.x - tp.x, pos.y - tp.y) < BOARD_R_PX;
        if (near !== nearTrain) {
          nearTrain = near;
          cb.onNearTrain(near);
        }
        // Near a docked ferry? → host shows a "Take the ferry" prompt for THAT
        // boat. The board point is its mainland dock (before you've crossed) or
        // its island (to sail back). While a boat is sailing there's nothing to
        // board. First hit wins — the docks are far apart by construction
        // (ferry-routes.test.ts asserts it), so there is never a tie.
        let nf: FerryLine | null = null;
        for (const line of ferries) {
          if (line.ferry.getState() !== 'docked') continue;
          const bp = line.ferry.getDockedAt() === MAINLAND_STOP ? line.layout.mainlandBoardPx : line.layout.arrivePx;
          if (Math.hypot(pos.x - bp.x, pos.y - bp.y) < FERRY_BOARD_R_PX) {
            nf = line;
            break;
          }
        }
        if (nf !== nearFerry) {
          nearFerry = nf;
          cb.onNearFerry?.(nf ? ferryPrompt(nf) : null);
        }
        // Out at the end of the cove's jetty, beside the submarine? -> host
        // shows "Dive". Like the bus there is no separate board point: the sub
        // is moored at the deck's seaward end, so being at the sub IS being at
        // the boarding spot. Suppressed while riding anything, because a kid
        // driving a jeep down the jetty has not decided to go diving.
        const ns =
          !!subDock && !ferrying && !riding && vehicleKind === null &&
          Math.hypot(pos.x - subDock.boardPx.x, pos.y - subDock.boardPx.y) < SUB_BOARD_R_PX;
        if (ns !== nearSub) {
          nearSub = ns;
          cb.onNearSub?.(ns);
        }
        // A hidden land chest in reach? Same suppression as the sub: a kid
        // driving past one has not decided to stop and open it.
        const nc = !ferrying && !riding && vehicleKind === null ? landChests.nearest(pos) : null;
        if (nc !== nearLandChest) {
          nearLandChest = nc;
          cb.onNearLandChest?.(nc);
        }
        // On the beach at a jet ski dock, on foot.
        let nj = -1;
        if (!ferrying && !riding && vehicleKind === null) {
          for (let i = 0; i < jetDocks.length; i++) {
            const b = jetDocks[i].beachPx;
            if (Math.hypot(pos.x - b.x, pos.y - b.y) < JETSKI_REACH_PX) {
              nj = i;
              break;
            }
          }
        }
        if (nj !== nearJetDock) {
          const was = nearJetDock >= 0;
          nearJetDock = nj;
          if (was !== nj >= 0) cb.onNearJetskiDock?.(nj >= 0);
        }
        // Near the parked bus? → host shows a "Ride the bus" prompt. Unlike the
        // ferry there is no separate board point: the bus parks at the stop, so
        // proximity to the bus IS proximity to the stop.
        let nb = false;
        if (bus.getState() === 'parked') {
          const sp = bus.getPositionPx();
          nb = Math.hypot(pos.x - sp.x, pos.y - sp.y) < BUS_BOARD_R_PX;
        }
        if (nb !== nearBus) {
          nearBus = nb;
          cb.onNearBus?.(nb);
        }
      }
      maybePostPosition(now, false);
      city.update(dt, pos);
      buildLayer.update(dt);
      raceIsle?.update(dt);
      updateBeachBalls(dt);
      chessBoard?.update(dt, pos, now);
      checkersBoard?.update(dt, pos, now);
      updateFireworks(dt);
      updateRidePuffs(dt);
      // Weather: advance the ambient director + storm timers, then render the
      // sky/precip (precip follows the avatar's ground position).
      updateWeatherDirector(dt);
      weather.update(dt, { x: pxToSceneX(pos.x), z: pxToSceneZ(pos.y) });
    }

    // Vertical offset: rest on the terrain, add a trampoline arc, or glue to
    // the train roof. Terrain height is the ground the cupcake stands on.
    let baseY = terrainHeightPx(pos.x, pos.y);
    // Wading: past the shoreline (and NOT on a pier deck), dip the cupcake's
    // base below the water surface so it reads as feet-in-the-water. On a pier
    // the deck sits at ground level, so terrain height already places it right.
    const avatarNd = islandNd(pos.x, pos.y);
    if (!vehicleKind && avatarNd > 1.0 && !onWalkablePier(pos.x, pos.y)) {
      const t = Math.min(1, (avatarNd - 1.0) / (WADE_ND - 1.0));
      baseY += (WATER_Y - WADE_DIP_U - baseY) * t;
    }
    let avatarY = baseY;
    if (vehicleKind && vehicleModel) {
      // Ride sits on the terrain (drive) or at a cruise altitude (fly, ramped
      // in on takeoff / out on landing). The cupcake rides its seat offset above.
      const info = findVehicle(vehicleKind)!;
      if (info.control === 'fly') {
        flyAlt += (flyAltTarget - flyAlt) * Math.min(1, dt / 220);
      }
      // Motion bob — the whole ride+rider bounces so each ride has body language:
      // skateboard hops, jeep rumbles fast, balloon sways big and slow. Frozen
      // under reduced-motion.
      let bobY = 0;
      if (!reduceMotion && !landing) {
        // Fly and sail rides bob at rest too (air, swell); drive rides only
        // while rolling.
        if (isMoving || info.control !== 'drive') {
          vehBobPhase += (dt / 1000) * info.bobHz * Math.PI * 2;
          bobY = Math.sin(vehBobPhase) * info.bobAmpU;
        }
      }
      // A jet ski rides the swell, and at speed lifts onto the plane and
      // skips over the chop.
      let rideBase = baseY;
      if (info.control === 'sail') {
        const frac = Math.min(1, Math.hypot(velPxX, velPxY) / info.speedPx);
        const chop = reduceMotion ? 0 : Math.abs(Math.sin(vehBobPhase * 2.3)) * 0.05 * frac;
        rideBase = WATER_Y + swellAt(pxToSceneX(pos.x), pxToSceneZ(pos.y)) - JETSKI_DRAUGHT_U + frac * 0.05 + chop + jumpY;
      }
      const vy = rideBase + (info.control === 'fly' ? flyAlt : 0) + bobY;
      vehicleModel.group.position.set(pxToSceneX(pos.x), vy, pxToSceneZ(pos.y));
      avatarY = vy + info.seatOffsetU;
      // A fly ride finishes its descent once it's essentially on the ground.
      if (landing && flyAlt < 0.06) finalizeDismount();
    } else if (launching) {
      if (!paused) launchT += dt / LAUNCH_MS;
      if (launchT >= 1) {
        launching = false;
        if (launchMat) launchMat.scale.y = 1;
        launchMat = null;
      } else {
        avatarY = baseY + Math.sin(Math.PI * launchT) * LAUNCH_H;
        if (launchMat) launchMat.scale.y = launchT < 0.15 ? 0.5 : 1;
      }
    } else if (riding) {
      avatarY = RIDE_Y;
    } else if (ferrying) {
      avatarY = FERRY_RIDE_Y;
    } else if (busing) {
      avatarY = BUS_RIDE_Y;
    }

    // Ride body dynamics: ease the ride's OWN yaw toward the travel heading at
    // its per-ride turnResponse, BANK (roll) into the turn, PITCH to the climb
    // trim, and spin the wheels/prop. The cupcake rider is then fed the body's
    // heading so it stays aligned — leaning into the body's slower turns, which
    // reads as weight (nimble skateboard vs. wide-banking biplane vs. laggy
    // balloon) rather than laggy input.
    let riderVelX = velPxX;
    let riderVelZ = velPxY;
    if (vehicleKind && vehicleModel) {
      const info = findVehicle(vehicleKind)!;
      const targetHeading = isMoving ? Math.atan2(velPxX, velPxY) : vehHeading;
      let delta = targetHeading - vehHeading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      vehHeading += delta * Math.min(1, info.turnResponse * (dt / 1000));
      // Bank ∝ the (clamped) heading error → full roll mid-turn, levels as it
      // lines up. Pitch noses a fly ride up/down to its climb/dive trim.
      const bankTarget = reduceMotion ? 0 : Math.max(-1, Math.min(1, -delta * 1.6)) * info.bankRad;
      const pitchTarget = reduceMotion
        ? 0
        : info.control === 'fly'
          ? climbDir * 0.22
          : info.control === 'sail' && (jumpY > 0 || onRamp)
            ? Math.max(-0.45, Math.min(0.35, -jumpVy * 0.07 - (onRamp ? 0.25 : 0))) // up the ramp, then nose over
            : info.control === 'sail' && isMoving
              ? -0.09 // nose up on the plane
              : 0;
      const ease = Math.min(1, (dt / 1000) * 8);
      vehBank += (bankTarget - vehBank) * ease;
      vehPitch += (pitchTarget - vehPitch) * ease;
      // YXZ order = yaw about world-up first, then pitch + roll about the ride's
      // OWN axes, so the bank reads as an aircraft roll, not a world-space tilt.
      vehicleModel.group.rotation.order = 'YXZ';
      vehicleModel.group.rotation.set(vehPitch, vehHeading, vehBank);
      if (!reduceMotion && vehicleModel.spinParts && vehicleModel.spinAxis) {
        const radPerSec = info.control === 'fly' ? 22 : isMoving ? 14 : 0;
        const d = radPerSec * (dt / 1000);
        if (d !== 0) {
          for (const p of vehicleModel.spinParts) p.rotation[vehicleModel.spinAxis] += d;
        }
      }
      // Wake puffs — sugar-dust / contrail / burner. Dropped behind (or under,
      // for the balloon's climb burner) the ride; capped + reduced-motion off.
      if (!reduceMotion && !landing) {
        const tr = info.trail;
        // A jet ski's wake is drawn in the water itself (uWake), not puffed.
        const active = info.control !== 'sail' && (tr.mode === 'climb' ? climbDir > 0 : isMoving);
        puffTimer += dt;
        if (active && puffTimer >= tr.everyMs) {
          puffTimer = 0;
          const gp = vehicleModel.group.position;
          spawnPuff(
            gp.x - Math.sin(vehHeading) * tr.backU,
            gp.y + tr.yOffU,
            gp.z - Math.cos(vehHeading) * tr.backU,
            tr.color,
            tr.sizeU,
          );
        }
      }
      if (info.control === 'sail' && !paused) stepJetskiPlay(dt, Math.min(1.5, Math.hypot(velPxX, velPxY) / info.speedPx));
      // Jet ski: spray flung off both sides of the hull, more in a hard turn.
      if (!reduceMotion && info.control === 'sail' && isMoving) {
        sprayTimer += dt;
        const every = boostLeft > 0 ? 28 : 45;
        if (sprayTimer >= every) {
          sprayTimer = 0;
          const gp = vehicleModel.group.position;
          const fx = Math.sin(vehHeading);
          const fz = Math.cos(vehHeading);
          for (const side of [-1, 1]) {
            // A carve throws more spray off the outside of the turn.
            const kick = 1 + Math.max(0, side * delta) * 2.5;
            const sx = fz * side;
            const sz = -fx * side;
            spawnSpray(
              gp.x + sx * 0.3 - fx * 0.1,
              WATER_Y + 0.05,
              gp.z + sz * 0.3 - fz * 0.1,
              sx * (1.1 + Math.random() * 0.6) * kick - fx * 0.8,
              sz * (1.1 + Math.random() * 0.6) * kick - fz * 0.8,
              1.3 + Math.random() * 0.8,
            );
          }
        }
      }
      const spd = Math.hypot(velPxX, velPxY);
      if (isMoving && spd > 0.001) {
        riderVelX = Math.sin(vehHeading) * spd;
        riderVelZ = Math.cos(vehHeading) * spd;
      }
    }

    // Place + animate the avatar (convert px → scene units).
    avatar.group.position.set(pxToSceneX(pos.x), avatarY, pxToSceneZ(pos.y));
    avatar.update(dt, isMoving, riderVelX / PX_PER_UNIT, riderVelZ / PX_PER_UNIT);
    if (!paused) updateGems(dt, avatarY);
    if (!paused) landChests.update(dt);
    // Moored skis rock gently, each a little out of step with the others.
    if (!paused && !reduceMotion && parkedSkis.length > 0) {
      jetBobT += dt / 1000;
      for (let i = 0; i < parkedSkis.length; i++) {
        const sk = parkedSkis[i];
        sk.position.y = WATER_Y - JETSKI_DRAUGHT_U + Math.sin(jetBobT * 1.7 + i * 2.1) * 0.035;
        sk.rotation.z = Math.sin(jetBobT * 1.3 + i) * 0.04;
      }
      for (let i = 0; i < buoys.length; i++) {
        const b = buoys[i];
        b.position.y = WATER_Y - BUOY_DRAUGHT_U + Math.sin(jetBobT * 2.1 + i * 1.3) * 0.04;
        b.rotation.z = Math.sin(jetBobT * 1.6 + i * 0.7) * 0.07;
      }
    }
    // The arrow hovers over the next gate while a kid is on a jet ski.
    if (slalomArrow) {
      const sailing = !!vehicleKind && findVehicle(vehicleKind)?.control === 'sail';
      slalomArrow.visible = sailing;
      if (sailing) {
        const g = course.gates[slalomRun.next < course.gates.length ? slalomRun.next : 0];
        slalomArrow.position.set(
          pxToSceneX(g.centre.x),
          WATER_Y + ARROW_HOVER_U + (reduceMotion ? 0 : Math.sin(jetBobT * 3) * 0.15),
          pxToSceneZ(g.centre.y),
        );
        if (!reduceMotion) slalomArrow.rotation.y += dt * 0.0015;
      }
    }

    // Wade ripples — periodic splash rings while paddling in the shallows
    // (skipped under reduced-motion; the static dip stays).
    rippleTimer -= dt;
    if (!reduceMotion && !vehicleKind && isMoving && avatarNd > 1.0 && !onWalkablePier(pos.x, pos.y) && rippleTimer <= 0) {
      spawnRipple(pxToSceneX(pos.x), pxToSceneZ(pos.y));
      rippleTimer = 260;
    }
    updateRipples(dt);
    updateTapRings(dt);

    // ---- Cakey: advance his wander (only while the world is live and he isn't
    // mid-conversation), place him on the terrain every frame, and report his
    // screen anchor to the host for the follow bubble. ----
    let cakeyMoving = false;
    let cakeyVelX = 0;
    let cakeyVelY = 0;
    if (!paused && !cakeyPaused) {
      if (cakeyPauseLeft > 0) {
        cakeyPauseLeft -= dt;
      } else {
        if (!cakeyTarget) cakeyTarget = pickCakeyTarget();
        if (cakeyTarget) {
          const cr = stepAvatarToward(cakeyPos, cakeyTarget, CAKEY_SPEED_PX, dt, ARRIVE_EPS_PX);
          if (!blockedAt(cr.x, cr.y)) {
            cakeyPos.x = cr.x;
            cakeyPos.y = cr.y;
            cakeyVelX = cr.vx;
            cakeyVelY = cr.vy;
            cakeyMoving = !cr.arrived;
          } else {
            cakeyTarget = null; // bumped a wall — repick next frame
          }
          if (cr.arrived) {
            cakeyTarget = null;
            cakeyPauseLeft =
              CAKEY_PAUSE_MIN_MS + Math.random() * (CAKEY_PAUSE_MAX_MS - CAKEY_PAUSE_MIN_MS);
          }
        } else {
          cakeyPauseLeft = 800; // nowhere valid to go right now — wait + retry
        }
      }
    } else if (cakeyPaused) {
      // Talking: stand still but turn to face the kid (velocity → heading only).
      cakeyVelX = pos.x - cakeyPos.x;
      cakeyVelY = pos.y - cakeyPos.y;
    }
    const cakeyBaseY = terrainHeightPx(cakeyPos.x, cakeyPos.y);
    cakey.group.position.set(pxToSceneX(cakeyPos.x), cakeyBaseY, pxToSceneZ(cakeyPos.y));
    cakey.update(dt, cakeyMoving, cakeyVelX / PX_PER_UNIT, cakeyVelY / PX_PER_UNIT);
    const cakeyNearPlayer = Math.hypot(pos.x - cakeyPos.x, pos.y - cakeyPos.y) < CAKEY_NEAR_PX;
    // A fresh unlock/upgrade wins the mood for a couple of seconds — Cakey
    // celebrates WITH the kid, then settles back into his ambient moods.
    if (cakeyCelebrateLeft > 0) cakeyCelebrateLeft -= dt;
    cakey.setMood(
      cakeyCelebrateLeft > 0 ? 'celebrate' : cakeyPaused ? 'happy' : cakeyNearPlayer ? 'wave' : 'idle',
    );
    // Squishy footstep cadence while the cupcake bounces along —
    // strictly rate-limited to one boing per STEP_INTERVAL_MS of wall
    // time, across stop/start boundaries (see declaration comment).
    walkClock += dt;
    if (isMoving && walkClock - lastStepAt >= STEP_INTERVAL_MS) {
      lastStepAt = walkClock;
      cb.onSfx?.('step');
    }

    // Advance a running cutscene (runs even though `paused` freezes the sim — the
    // camera tween + beats must keep going). Fires FX once at the hold, emits the
    // active beat index, and ends when the out-phase completes.
    if (cutscene) {
      cutscene.t += dt;
      if (!cutscene.fxFired && cutscene.t >= cutscene.inMs) {
        cutscene.fxFired = true;
        fireCutsceneFx(cutscene);
      }
      const idx = Math.min(cutscene.beatCount - 1, Math.floor(cutscene.t / CUT_BEAT_MS));
      if (idx !== cutscene.lastBeat) {
        cutscene.lastBeat = idx;
        cb.onCutsceneBeat?.(idx);
      }
      if (cutscene.t >= cutscene.inMs + cutscene.holdMs + cutscene.outMs) {
        endCutscene();
      }
    }

    updateCamera(velPxX / PX_PER_UNIT, velPxY / PX_PER_UNIT, dt);

    // Cakey's bubble anchor — deliberately AFTER updateCamera and BEFORE the
    // render. Projecting earlier in the frame (where this used to live) meant
    // the anchor was computed against the camera pose from the PREVIOUS frame,
    // so the bubble trailed Cakey by a frame whenever the camera was moving.
    // Reported every frame: the overlay writes style.left/top at 60Hz, so a
    // throttled value here is what made the bubble lag behind him.
    if (cb.onCakeyMove) {
      cakeyAnchor.set(pxToSceneX(cakeyPos.x), cakeyBaseY + CAKEY_HEAD_U, pxToSceneZ(cakeyPos.y));
      const { xPct, yPct, onScreen } = projectToScreenPct(cakeyAnchor, camera);
      cb.onCakeyMove({
        xPct,
        yPct,
        onScreen,
        isMoving: cakeyMoving,
        nearPlayer: cakeyNearPlayer,
      });
    }

    // Sea life: drift the two ripple layers against each other and gently roll
    // the surface with a two-wave swell. Both are purely decorative, so
    // reduced-motion freezes them — the ripples hold still and the plane stays flat.
    const sailInfo = vehicleKind ? findVehicle(vehicleKind) : undefined;
    const sailingNow = sailInfo?.control === 'sail' && !landing;
    const sailSpeedPx = sailInfo?.speedPx ?? 1;
    if (!reduceMotion) {
      waterNormalTex.offset.x += dt * 0.000012;
      waterNormalTex.offset.y += dt * 0.000008;
      glazeNormalTex.offset.x -= dt * 0.000007;
      glazeNormalTex.offset.y += dt * 0.00001;
      const t = walkClock;
      for (let i = 0; i < waterPos.count; i++) {
        waterPos.setZ(i, swellLocal(waterPos.getX(i), waterPos.getY(i), t));
      }
      waterPos.needsUpdate = true;
      waterUniforms.uTime.value = walkClock / 1000;
      // Rings spread from the player once they're at the water's edge (beach,
      // shallows, a boat, a low flight), stronger while moving, gone up high.
      const nearWater = clamp01((avatarNd - 0.93) / 0.08);
      const lowEnough = clamp01(1 - (avatarY - WATER_Y) / 2.5);
      const ringTarget = nearWater * lowEnough * (isMoving ? 1 : 0.6);
      const pl = waterUniforms.uPlayer.value;
      pl.x = avatar.group.position.x;
      pl.y = avatar.group.position.z;
      pl.z += (ringTarget - pl.z) * Math.min(1, dt * 0.004);
      // Age the jet ski wake, and drop a new point behind a moving ski.
      const wake = waterUniforms.uWake.value;
      for (const w of wake) {
        if (w.w <= 0) continue;
        w.z += dt / 1000;
        if (w.z >= WAKE_LIFE_S) w.w = 0;
      }
      wakeTimer += dt;
      if (sailingNow && isMoving && wakeTimer >= WAKE_EVERY_MS) {
        wakeTimer = 0;
        const w = wake[wakeNext];
        wakeNext = (wakeNext + 1) % WAKE_POINTS;
        w.set(
          avatar.group.position.x - Math.sin(vehHeading) * 0.45,
          avatar.group.position.z - Math.cos(vehHeading) * 0.45,
          0,
          Math.min(1, Math.hypot(velPxX, velPxY) / sailSpeedPx),
        );
      }
    }

    // Keep the skydome centered on the camera so the gradient never goes lopsided.
    skyDome.position.copy(camera.position);
    renderer.render(scene, camera);
  };
  updateCamera(0, 0);
  raf = window.requestAnimationFrame(tick);

  // ---------- Resize ----------
  const onResize = (): void => {
    const { w, h } = sizeOf();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  };
  window.addEventListener('resize', onResize);

  // Wheel / trackpad zoom (desktop). Touch zoom is via the host's ± buttons.
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * (e.deltaY > 0 ? 1.1 : 0.9)));
  };
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  // ---------- Minimap ("you are here") ----------
  // Trace EVERY island's shoreline (nd ≈ 1 on its bean) into a polygon, then
  // normalize — plus the zone centers, ferry docks, and the live avatar
  // position — into [0,1] within the archipelago's bounding box. The host
  // draws the mainland + each offshore isle + a dotted route per ferry, so a
  // separate island reads as a real destination, not a stray dot.
  const minimapFrame = (() => {
    const N = 44;
    const maxR = Math.max(islandHalfW, islandHalfH) * 4 + 400;
    const traceBean = (bean: IslandBean): Array<{ x: number; y: number }> => {
      const shoreR = (th: number): number => {
        let lo = 0;
        let hi = maxR;
        for (let it = 0; it < 18; it += 1) {
          const mid = (lo + hi) / 2;
          if (bean.nd(bean.cx + Math.cos(th) * mid, bean.cy + Math.sin(th) * mid) < 1) lo = mid;
          else hi = mid;
        }
        return lo;
      };
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const R = shoreR(th);
        pts.push({ x: bean.cx + Math.cos(th) * R, y: bean.cy + Math.sin(th) * R });
      }
      return pts;
    };
    const pts = traceBean(mainBean);
    const isles = islandBeans.filter((b) => b !== mainBean).map(traceBean);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const acc = (x: number, y: number): void => {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    };
    for (const p of pts) acc(p.x, p.y);
    for (const isle of isles) for (const p of isle) acc(p.x, p.y);
    for (const r of REGIONS) {
      const c = cityCenterPx(r.slug);
      acc(c.x, c.y);
    }
    // Normalize BOTH axes by the same scale so the islands keep their proportions.
    const scale = Math.max(maxX - minX, maxY - minY) || 1;
    return { pts, isles, minX, minY, scale };
  })();
  const mmNx = (x: number): number => (x - minimapFrame.minX) / minimapFrame.scale;
  const mmNy = (y: number): number => (y - minimapFrame.minY) / minimapFrame.scale;
  const minimap: TownMinimap = {
    outline: minimapFrame.pts.map((p) => ({ nx: mmNx(p.x), ny: mmNy(p.y) })),
    isles: minimapFrame.isles.map((isle) => isle.map((p) => ({ nx: mmNx(p.x), ny: mmNy(p.y) }))),
    ferryRoutes: ferries.map((line) => ({
      islandId: line.islandId,
      color: `#${line.layout.sailColor.toString(16).padStart(6, '0')}`,
      a: { nx: mmNx(line.layout.mainlandDockPx.x), ny: mmNy(line.layout.mainlandDockPx.y) },
      b: { nx: mmNx(line.layout.islandDockPx.x), ny: mmNy(line.layout.islandDockPx.y) },
    })),
    // The dock only exists as an object when the cove is discovered, so this is
    // null exactly when there is nothing to find.
    subDock: subDock ? { nx: mmNx(subDock.boardPx.x), ny: mmNy(subDock.boardPx.y) } : null,
    zones: REGIONS.map((r) => {
      const c = cityCenterPx(r.slug);
      return { nx: mmNx(c.x), ny: mmNy(c.y), discovered: r.starter || discovered.has(r.slug), slug: r.slug };
    }),
  };

  // Reveal a land locally: dissolve its fog, celebrate, and update the minimap.
  // Shared by the public revealRegion (paid discover) and discoverChess (ferry/
  // fly arrival) — see the forward-reference note on discoverChess.
  function applyReveal(slug: string): void {
    discovered.add(slug);
    city.revealRegion(slug);
    cb.onSfx?.('levelUp');
    // Sprinkle-burst celebration over the freshly-unlocked land — reuses the
    // fireworks particle system (explode) so unlocking feels earned.
    const cc = cityCenterPx(slug);
    const cbx = pxToSceneX(cc.x);
    const cbz = pxToSceneZ(cc.y);
    const cby = terrainHeightPx(cc.x, cc.y) + 2.2;
    for (let k = 0; k < 3; k += 1) {
      const col = FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)];
      explode(
        cbx + (Math.random() - 0.5) * 1.6,
        cby + Math.random() * 1.2,
        cbz + (Math.random() - 0.5) * 1.6,
        col,
      );
    }
    // The revealed land's hero does a happy overshoot pop, and Cakey joins in —
    // a paid unlock should feel earned, not identical to the free fireworks toy.
    city.celebrateRegion(slug);
    cakeyCelebrateLeft = 2200;
    // Re-scan so the just-revealed region stops triggering approach.
    currentApproachRegion = null;
    // Reflect the unlock in the minimap dots.
    const z = minimap.zones.find((zz) => zz.slug === slug);
    if (z) z.discovered = true;
  }

  return {
    setBuilds(list: TownBuild[], popIds?: string[]): void {
      builds = list;
      buildCells = new Set(list.map((b) => cellKey(b.gx, b.gy)));
      buildLayer.setBuilds(list, popIds ? new Set(popIds) : undefined);
      refreshGhost();
    },
    setBuildTool(tool: { tool: BuildKind | 'remove'; rot: number } | null): void {
      const wasOff = !buildTool;
      buildTool = tool;
      if (!tool) {
        buildCell = null;
      } else if (wasOff || !buildCell) {
        // Start aimed two squares ahead of the cupcake, away from the camera.
        const fx = pxToSceneX(pos.x) - camera.position.x;
        const fz = pxToSceneZ(pos.y) - camera.position.z;
        const len = Math.hypot(fx, fz) || 1;
        const start = cellOfPx(pos.x + (fx / len) * CELL_PX * 2, pos.y + (fz / len) * CELL_PX * 2);
        buildCell = tool.tool === 'remove' ? start : nearestBuildableCell(start);
      }
      refreshGhost();
    },
    getBuildAim(): { gx: number; gy: number } | null {
      return buildCell ? { ...buildCell } : null;
    },
    buildAt(gx: number, gy: number): TownBuild | null {
      return builds.find((b) => b.gx === gx && b.gy === gy) ?? null;
    },
    openLandChest(slug: string): void {
      landChests.open(slug);
      // It is open now, so it stops being a prompt.
      if (nearLandChest === slug) {
        nearLandChest = null;
        cb.onNearLandChest?.(null);
      }
    },

    revealRegion(slug: string): void {
      applyReveal(slug);
    },
    refreshLandLevel(slug: string, level: number): void {
      city.setLandLevel(slug, level);
      // Sprinkle burst over the land so the upgrade lands with a pop the second
      // the kid pays (the host already plays the level-up sound + haptic).
      const cc = cityCenterPx(slug);
      const ux = pxToSceneX(cc.x);
      const uz = pxToSceneZ(cc.y);
      const uy = terrainHeightPx(cc.x, cc.y) + 2.0;
      for (let k = 0; k < 3; k += 1) {
        explode(
          ux + (Math.random() - 0.5) * 1.6,
          uy + Math.random() * 1.2,
          uz + (Math.random() - 0.5) * 1.6,
          FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
        );
      }
      cakeyCelebrateLeft = 2200;
    },
    playStoryCutscene(spec: StoryCutsceneSpec): void {
      if (cutscene) return; // one at a time
      const beatCount = Math.max(1, spec.beatCount);
      // Reduced-motion: no camera move, no particle FX — just pace the beats so
      // the caption band still tells the story (fxFired preset true skips FX).
      const inMs = reduceMotion ? 0 : CUT_IN_MS;
      const outMs = reduceMotion ? 0 : CUT_OUT_MS;

      const startPos = camPos.clone();
      const startLook = camLook.clone();
      let toPos = startPos.clone();
      let toLook = startLook.clone();
      if (spec.regionSlug && !reduceMotion) {
        // Frame the region center: sit back+above it along the current world yaw,
        // looking at the land. Distance/height vary by style (see StoryStyle).
        const cc = cityCenterPx(spec.regionSlug);
        const tx = pxToSceneX(cc.x);
        const tz = pxToSceneZ(cc.y);
        const gy = terrainHeightPx(cc.x, cc.y);
        const sinY = Math.sin(camYaw);
        const cosY = Math.cos(camYaw);
        const dist = spec.style === 'spotlight' ? CAM_BACK_U * 0.9 : CAM_BACK_U * 1.4;
        const height = spec.style === 'farewell' ? CAM_HEIGHT_U * 2.1 : CAM_HEIGHT_U * 1.5;
        toPos = new THREE.Vector3(tx + dist * sinY, gy + height, tz + dist * cosY);
        toLook = new THREE.Vector3(tx, gy + 0.8, tz);
      }

      cutscene = {
        startPos,
        startLook,
        toPos,
        toLook,
        t: 0,
        inMs,
        holdMs: beatCount * CUT_BEAT_MS,
        outMs,
        beatCount,
        lastBeat: 0,
        fxFired: reduceMotion, // reduced-motion → never fire particle FX
        style: spec.style,
        regionSlug: spec.regionSlug,
      };
      paused = true;
      // Show beat 0 immediately (during the opening pan) so the caption never lags.
      cb.onCutsceneBeat?.(0);
    },
    skipStoryCutscene(): void {
      if (!cutscene) return;
      // Leave the world in the cutscene's end-state (FX applied), then restore.
      if (!cutscene.fxFired) {
        cutscene.fxFired = true;
        fireCutsceneFx(cutscene);
      }
      endCutscene();
    },
    minimap,
    getMinimapPos(): { nx: number; ny: number } {
      return { nx: mmNx(pos.x), ny: mmNy(pos.y) };
    },
    getState(): TownPositionPayload {
      const o = cityToOrig({ x: pos.x, y: pos.y }, currentRegionSlug);
      return { region_slug: currentRegionSlug, x: Math.round(o.x), y: Math.round(o.y) };
    },
    setBalance(n: number): void {
      balance = n;
    },
    setPaused(p: boolean): void {
      paused = p;
      if (!p) lastTime = performance.now();
    },
    resize(): void {
      onResize();
    },
    zoomBy(factor: number): void {
      zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * factor));
    },
    rotateBy(rad: number): void {
      camYaw += rad;
    },
    boardTrain(): boolean {
      // Board from anywhere — the cupcake hops onto the train wherever it is and
      // the chase camera swoops to follow. Requiring proximity to a moving train
      // made boarding nearly impossible ("can't ride the train").
      if (riding || vehicleKind || busing) return false;
      riding = true;
      nearTrain = false;
      cb.onNearTrain(false);
      cb.onSfx?.('board');
      target = null;
      steer = null;
      intentEnterSlug = null;
      return true;
    },
    exitTrain(): void {
      if (!riding) return;
      riding = false;
      cb.onSfx?.('board');
    },
    boardBus(): boolean {
      // Mid-run dismount is impossible by construction: there is no exit action
      // while `busing`, and the tick glues the avatar to the bus until it parks.
      // That is what keeps a kid from stepping off over open water.
      if (riding || vehicleKind || ferrying || busing) return false;
      if (bus.getState() !== 'parked') return false;
      const at = bus.getParkedAt();
      if (!at) return false;
      // Run to the OTHER stop; the return trip is symmetric (and free).
      const dest: BusStop = at === 'mainland' ? 'race' : 'mainland';
      if (!bus.depart(dest)) return false;
      busing = true;
      target = null;
      steer = null;
      nearBus = false;
      cb.onNearBus?.(false);
      cb.onSfx?.('board');
      return true;
    },
    boardFerry(): boolean {
      if (riding || vehicleKind || ferrying || busing) return false;
      // The boat in range is the one the last onNearFerry reported.
      const line = nearFerry;
      if (!line || line.ferry.getState() !== 'docked') return false;
      const at = line.ferry.getDockedAt();
      if (!at) return false;
      // Sail to the OTHER stop (mainland↔this boat's island); a return trip is
      // symmetric.
      const dest: FerryStop = at === MAINLAND_STOP ? line.islandId : MAINLAND_STOP;
      if (!line.ferry.depart(dest)) return false;
      ferrying = line;
      target = null;
      steer = null;
      nearFerry = null;
      cb.onNearFerry?.(null);
      cb.onSfx?.('board');
      return true;
    },
    mountVehicle(kind: VehicleKind): boolean {
      if (riding) return false; // can't mount a ride while glued to the train
      // A previous FLY ride may still be gliding down (landing === true) with its
      // mesh not yet torn down. Don't make the kid wait out that descent to hop
      // onto the next ride — finalize the old ride now, then mount fresh. (An
      // actively-ridden vehicle that ISN'T landing means "hop off first".)
      if (vehicleKind) {
        if (!landing) return false;
        finalizeDismount();
      }
      const info = findVehicle(kind);
      if (!info) return false;
      // A jet ski mounts only at a dock, onto that dock's moored ski: the kid
      // is moved out to it, and the moored one hides while it is in use.
      if (info.control === 'sail') {
        if (nearJetDock < 0 || !authored.has(AUTHORED_JETSKI.key)) return false;
        const d = jetDocks[nearJetDock];
        pos.x = d.skiPx.x;
        pos.y = d.skiPx.y;
        parkedSkis[nearJetDock].visible = false;
        avatar.group.rotation.y = Math.atan2(d.out.x, d.out.y);
        // Turn the view to look out to sea. On foot the camera faced the beach
        // the kid walked up, so the first tap would land on sand, which a sail
        // ride can never reach. Forward at yaw θ is (-sin θ, -cos θ) in px.
        camYaw = Math.atan2(-d.out.x, -d.out.y);
        throttle = 0;
        jumpY = 0;
        jumpVy = 0;
        onRamp = false;
        nearJetDock = -1;
        cb.onNearJetskiDock?.(false);
      }
      const model = rideBuilders[kind](THREE);
      // Start the ride body facing the way the cupcake was already facing, so it
      // doesn't spin to align on the first frame.
      vehHeading = avatar.group.rotation.y;
      vehBank = 0;
      vehPitch = 0;
      climbDir = 0;
      boostLeft = 0;
      boostCd = 0;
      puffTimer = 0;
      model.group.rotation.order = 'YXZ';
      model.group.rotation.y = vehHeading;
      scene.add(model.group);
      vehicleModel = model;
      vehicleKind = kind;
      landing = false;
      flyAlt = 0;
      flyAltTarget = info.control === 'fly' ? info.cruiseAltitudeU : 0;
      target = null;
      steer = null;
      padSteer = null;
      intentEnterSlug = null;
      cb.onSfx?.('board');
      return true;
    },
    dismountVehicle(): void {
      if (!vehicleKind) return;
      const info = findVehicle(vehicleKind)!;
      // Fly rides glide down first (a hard drop from altitude looks wrong);
      // drive rides just hop off in place.
      if (info.control === 'fly' && flyAlt > 0.08) {
        landing = true;
        flyAltTarget = 0;
        target = null;
        steer = null;
      } else if (info.control === 'sail') {
        // Back on the beach at the nearest dock. Every moored ski reappears:
        // a kid who rode across to another dock should not leave one empty.
        let best = -1;
        let bestD = Infinity;
        for (let i = 0; i < jetDocks.length; i++) {
          const b = jetDocks[i].beachPx;
          const dd = Math.hypot(pos.x - b.x, pos.y - b.y);
          if (dd < bestD) {
            bestD = dd;
            best = i;
          }
        }
        if (best >= 0) {
          pos.x = jetDocks[best].beachPx.x;
          pos.y = jetDocks[best].beachPx.y;
        }
        for (const sk of parkedSkis) sk.visible = true;
        finalizeDismount();
      } else {
        finalizeDismount();
      }
    },
    setClimb(dir: -1 | 0 | 1): void {
      // Only meaningful for a fly ride that isn't landing; harmless otherwise.
      climbDir = dir;
    },
    setPadSteer(v: { x: number; y: number } | null): void {
      if (v) {
        const m = Math.hypot(v.x, v.y);
        padSteer = m > 1 ? { x: v.x / m, y: v.y / m } : { x: v.x, y: v.y };
        // Pad input overrides any in-flight tap target.
        target = null;
        intentEnterSlug = null;
      } else {
        padSteer = null;
      }
    },
    setThrottle(v: number): void {
      throttle = Math.max(0, Math.min(1, v));
    },
    cycleCameraMode(): 'chase' | 'action' | 'drone' | 'sky' {
      const i = CAM_MODES.indexOf(camMode);
      camMode = CAM_MODES[(i + 1) % CAM_MODES.length];
      droneAngle = 0; // each visit to 'drone' starts its orbit from behind
      return camMode;
    },
    setCakeyPaused(p: boolean): void {
      cakeyPaused = p;
      if (p) cakeyTarget = null; // drop his stroll target so he resumes fresh
    },
    clearStorm(slug: string): void {
      if (stormLockedSlug === slug) endStorm();
    },
    setWeather(kind: WeatherKind): void {
      // Manual override (testing / a future kid control). Storms route through
      // the full orchestration; other kinds only set the sky, and are ignored
      // while a storm is resolving.
      if (kind === 'storm') {
        if (!stormLockedSlug) goWeather('storm');
        return;
      }
      if (stormLockedSlug) return;
      goWeather(kind);
      weatherDwellLeft = WEATHER_DWELL_MIN_MS;
    },
    dispose(): void {
      window.cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);

      // Flag first: the authored GLB may still be in flight, and its .then()
      // checks this so a late arrival disposes itself instead of attaching to
      // a scene that is being torn down.
      authoredDisposed = true;
      authored.dispose();
      if (authoredDome) {
        scene.remove(authoredDome.root);
        authoredDome.dispose();
        authoredDome = null;
      }

      avatar.dispose();
      scene.remove(avatar.group);
      cakey.dispose();
      scene.remove(cakey.group);
      if (vehicleModel) {
        scene.remove(vehicleModel.group);
        for (const g of vehicleModel.geometries) g.dispose();
        for (const m of vehicleModel.materials) m.dispose();
      }
      weather.dispose();
      if (subDock) {
        scene.remove(subDock.group);
        for (const g of subDock.geometries) g.dispose();
        for (const m of subDock.materials) m.dispose();
        for (const t of subDock.textures) t.dispose();
      }
      for (const rp of ripples) {
        scene.remove(rp.mesh);
        (rp.mesh.material as THREE.Material).dispose();
      }
      for (const t of tapRings) {
        scene.remove(t.mesh);
        (t.mesh.material as THREE.Material).dispose();
      }
      rippleGeo.dispose();
      train.dispose(scene);
      for (const line of ferries) line.ferry.dispose(scene);
      scene.remove(ferryWayGroup);
      for (const g of ferryWayGeos) g.dispose();
      for (const m of ferryWayMats) m.dispose();
      for (const t of ferryWayTexs) t.dispose();
      scene.remove(bridge.group);
      for (const g of bridge.geometries) g.dispose();
      for (const m of bridge.materials) m.dispose();
      if (raceIsle) {
        scene.remove(raceIsle.group);
        // InstancedMesh owns per-instance buffers that disposing the shared
        // geometry does NOT release — same reason the racer game tracks them.
        for (const i of raceIsle.instanced) i.dispose();
        for (const g of raceIsle.geometries) g.dispose();
        for (const m of raceIsle.materials) m.dispose();
      }
      bus.dispose(scene);
      envRT.dispose(); // frees the PMREM env-map render target + its texture
      skyDome.geometry.dispose();
      (skyDome.material as THREE.Material).dispose();
      for (const m of scatterMeshes) m.dispose(); // frees per-instance buffers
      for (const g of scatterGeos) g.dispose();
      for (const m of scatterMats) m.dispose();
      for (const tr of tramps) scene.remove(tr.group);
      for (const g of trampGeos) g.dispose();
      for (const m of trampMats) m.dispose();
      chessBoard?.dispose();
      checkersBoard?.dispose();
      for (const ball of beachBalls) scene.remove(ball.mesh);
      ballGeo.dispose();
      ballMat.dispose();
      ballTex.dispose();
      for (const g of fieldGeos) g.dispose();
      for (const m of fieldMats) m.dispose();
      for (const t of ballTexHolder) t.dispose();
      scene.remove(fireGroup);
      for (const p of fireworks) (p.mesh.material as THREE.Material).dispose();
      for (const g of fireGeos) g.dispose();
      for (const m of fireMats) m.dispose();
      scene.remove(rideFxGroup);
      for (const p of ridePuffs) (p.mesh.material as THREE.Material).dispose();
      for (const g of rideFxGeos) g.dispose();
      scene.remove(gemGroup);
      for (const g of gemGeos) g.dispose();
      for (const m of gemMats) m.dispose();
      for (const t of gemTexs) t.dispose();
      scene.remove(landChests.group);
      landChests.dispose();
      city.dispose(scene);
      scene.remove(buildLayer.group);
      buildLayer.dispose();
      scene.remove(ground, water, mtnGroup, ambient, sun);
      groundGeo.dispose();
      groundMat.dispose();
      groundTex.dispose();
      grassNormalTex.dispose();
      sandNormalTex.dispose();
      waterGeo.dispose();
      waterMat.dispose();
      waterNormalTex.dispose();
      glazeNormalTex.dispose();
      shoreField.dispose();
      for (const g of mtnGeos) g.dispose();
      for (const m of mtnMats) m.dispose();

      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    },
  };
}
