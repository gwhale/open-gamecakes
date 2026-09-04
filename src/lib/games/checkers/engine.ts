// The Cakey Checkers 3D engine.
//
// Structure is pit stop's (fixed camera, no physics, no cannon-es, hand-rolled
// timeline) with tower's hands (raycast tap onto discrete objects in a static
// scene). The rules live in rules.ts and the opponent in bot.ts; this file owns
// pixels, taps and time, and nothing else.
//
// THE INTERACTION RULES, which are product decisions and not implementation
// details:
//
//   TAP-TO-SELECT, TAP-TO-MOVE. No drag. On a perspective 3D board a drag's
//   screen delta does not map linearly to squares, and a kid dragging toward the
//   far rank overshoots every time.
//
//   RESELECTING A DIFFERENT PIECE IS FREE AND IS NEVER AN ERROR. Kids change
//   their minds constantly. Making that an error state is the "difficulty in the
//   interface" failure DESIGN.md rules out.
//
//   A FORCED JUMP IS A HINT, NEVER A REFUSAL. When jumps exist the jumping
//   pieces pulse before the kid touches anything, and tapping a piece that
//   cannot move plays the ordinary tap sound — never playWrong, never a buzz,
//   never a red anything — while the opponent explains it in their own voice.
//   The rule is real; being told off for it is not.
//
// The engine owns NO React state; the host owns NO game state.
//
// No runtime `three` import — the namespace arrives as a factory argument.

import type * as THREE from 'three';
import { CAKE } from '@/lib/games/theme/palette';
import { hapticSuccess, hapticTap, hapticThump } from '@/lib/haptics';
import { playCorrect, playLevelUp, playTap, playWin } from '@/lib/games/shared/sounds';
import {
  applyMove,
  initialState,
  legalMoves,
  material,
  movesFrom,
  opponent,
  positionKey,
  result,
  sideOf,
  squareToRC,
  type CheckersMove,
  type CheckersState,
  type Side,
} from './rules';
import {
  BLUNDER_CP,
  GRADING_DEPTH,
  GRADING_WEIGHTS,
  THINK_BASE_MS,
  THINK_FLOURISH_MS,
  THINK_JITTER_MS,
  THINK_MIN_MS,
  chooseBotMove,
  makeRng,
  scoreRootMoves,
} from './bot';
import { opponentForLevel } from './opponents';
import { styleById } from './styles';
import { buildBoard, buildTrays, squarePos, trayPos } from './board';
import { buildPieceSet } from './pieces';
import {
  BOARD_U,
  CAM_DRAG_PITCH_DEG,
  CAM_DRAG_YAW_DEG,
  CAM_EASE,
  CAM_FIT_PAD,
  CAM_FOV,
  CAM_PITCH_DEG,
  CAM_PITCH_MAX_DEG,
  CAM_PITCH_MIN_DEG,
  CAM_VIEW_PITCH,
  CAM_ZOOM_MAX,
  CAM_ZOOM_MIN,
  CAPTURE_AT,
  CHAIN_BEAT_MS,
  CROWN_MS,
  DEST_HIT_R,
  HIT_H,
  HIT_R,
  HOP_MS,
  MOVE_MS,
  RM_FADE_MS,
  RM_MOVE_MS,
  SCENE_BG,
  WOBBLE_MS,
  Y_MARKER,
  Y_PIECE,
  Y_RING,
  type CameraView,
  type CheckersCallbacks,
  type CheckersEngine,
  type CheckersSceneProps,
  type ThreeNS,
} from './types';

/** Tilt presets, in the order the one tilt button walks through them. */
const TILT_ORDER: ReadonlyArray<Exclude<CameraView, 'home'>> = ['tilted', 'low', 'top'];

/** Kid turns before the game is adjudicated on material. Chess Challenge uses
 *  120; checkers games are shorter and a dragged-out one is worse here because
 *  two kings can circle forever. */
const MAX_KID_TURNS = 80;

/** Consecutive kid turns with no capture and no man advance before the
 *  move-quality score starts flagging them.
 *
 *  ⚠️ THIS IS THE ANTI-FARM RULE AND IT IS NOT OPTIONAL. Repetition detection
 *  alone is NOT enough in checkers, which is the trap the chess version does not
 *  have to worry about: two kings on an open board can walk a four-square loop
 *  generating four DISTINCT positions forever, at zero risk, and bank the whole
 *  session token cap. Checkers shuffling is far easier than chess shuffling. */
const NO_PROGRESS_FLAG_AT = 12;

interface PieceRec {
  group: THREE.Group;
  sq: number;
  side: Side;
}

type Phase = 'idle' | 'selected' | 'animating' | 'thinking' | 'over';

interface Hop {
  from: { x: number; z: number };
  to: { x: number; z: number };
  /** Square of the piece eaten on this hop, or null for a quiet step. */
  victim: number | null;
}

export function createCheckersEngine(
  THREE: ThreeNS,
  container: HTMLElement,
  props: CheckersSceneProps,
  cb: CheckersCallbacks,
): CheckersEngine {
  const reduceMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const style = styleById(props.styleId);
  const foe = opponentForLevel(props.level);
  const rng = makeRng(props.seed);
  const kidSide = props.kidSide;
  const botSide = opponent(kidSide);

  // --- renderer ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  // PCFShadowMap, not PCFSoftShadowMap — three 0.184 deprecates the latter.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const sizeOf = (): { w: number; h: number } => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 });
  {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
  }
  container.appendChild(renderer.domElement);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE_BG);
  // Soft falloff so the stand does not end on a hard line. No EffectComposer
  // anywhere in this repo and a board game is not where to introduce one.
  scene.fog = new THREE.Fog(SCENE_BG, 16, 40);

  const { w: w0, h: h0 } = sizeOf();
  const camera = new THREE.PerspectiveCamera(CAM_FOV, w0 / h0, 0.1, 80);

  // Sun from the kid's front-left, so shadows fall AWAY from camera and never
  // land on the destination markers. Contact shadows are load-bearing here:
  // mid-hop, a piece's shadow is what tells you which square it is over.
  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const sun = new THREE.DirectionalLight(0xfff3da, 1.0);
  sun.position.set(-5, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -7;
  sc.right = 7;
  sc.top = 7;
  sc.bottom = -7;
  sc.near = 0.5;
  sc.far = 28;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xfff3da, 0x9fe8b5, 0.45));

  // --- static geometry -----------------------------------------------------
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const drain = (b: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[]; textures: THREE.Texture[] }) => {
    geos.push(...b.geometries);
    mats.push(...b.materials);
    texs.push(...b.textures);
  };

  const board = buildBoard(THREE);
  scene.add(board.group);
  drain(board);
  const trays = buildTrays(THREE);
  scene.add(trays.group);
  drain(trays);

  const pieceSet = buildPieceSet(THREE, style);
  geos.push(...pieceSet.geometries);
  mats.push(...pieceSet.materials);
  texs.push(...pieceSet.textures);

  // --- highlight pool ------------------------------------------------------
  const ringGeo = new THREE.TorusGeometry(0.44, 0.035, 6, 28);
  const ringMat = new THREE.MeshStandardMaterial({ color: CAKE.MINT_DEEP, roughness: 0.3, emissive: 0x0a3a24 });
  const discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 20);
  const quietMat = new THREE.MeshStandardMaterial({ color: CAKE.MINT, transparent: true, opacity: 0.8 });
  const jumpMat = new THREE.MeshStandardMaterial({ color: CAKE.AMBER, transparent: true, opacity: 0.85 });
  // The white outer edge is DESIGN.md's focus ring translated into 3D: amber
  // alone is 1.70:1 on the cocoa square, which is not a visible indicator.
  const haloGeo = new THREE.TorusGeometry(0.36, 0.022, 6, 26);
  const haloMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
  geos.push(ringGeo, discGeo, haloGeo);
  mats.push(ringMat, quietMat, jumpMat, haloMat);

  const selRing = new THREE.Mesh(ringGeo, ringMat);
  selRing.rotation.x = Math.PI / 2;
  selRing.visible = false;
  scene.add(selRing);

  const markers: THREE.Group[] = [];
  const markerPool = (): THREE.Group => {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(discGeo, quietMat);
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.004;
    g.add(disc, halo);
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(DEST_HIT_R, DEST_HIT_R, HIT_H, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    hit.position.y = HIT_H / 2;
    g.add(hit);
    g.visible = false;
    scene.add(g);
    markers.push(g);
    return g;
  };
  // 12 is comfortably above the most destinations a single piece can offer.
  for (let i = 0; i < 12; i += 1) markerPool();
  markers.forEach((m) => {
    const hit = m.children[2] as THREE.Mesh;
    geos.push(hit.geometry);
    mats.push(hit.material as THREE.Material);
  });

  // --- pieces --------------------------------------------------------------
  let state: CheckersState = initialState();
  const pieces = new Map<number, PieceRec>();
  /** Shared invisible tap proxy geometry — see HIT_R in types.ts for why 0.62. */
  const hitGeo = new THREE.CylinderGeometry(HIT_R, HIT_R, HIT_H, 10);
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  geos.push(hitGeo);
  mats.push(hitMat);
  const hitMeshes: THREE.Mesh[] = [];

  const spawn = (sq: number, side: Side): void => {
    const g = pieceSet.make(side);
    const { x, z } = squarePos(sq);
    g.position.set(x, Y_PIECE, z);
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.position.y = HIT_H / 2;
    hit.userData.sq = sq;
    g.add(hit);
    hitMeshes.push(hit);
    scene.add(g);
    pieces.set(sq, { group: g, sq, side });
  };

  for (let sq = 0; sq < 64; sq += 1) {
    const p = state.board[sq];
    if (p !== 0) spawn(sq, sideOf(p)!);
  }
  const syncHitSquares = (): void => {
    for (const [sq, rec] of pieces) {
      const hit = rec.group.children.find((c) => c.userData.sq !== undefined);
      if (hit) hit.userData.sq = sq;
    }
  };

  // --- camera --------------------------------------------------------------
  //
  // Yaw is FREE, pitch is clamped — see the note on CAM_PITCH_MIN_DEG in
  // types.ts. Drag writes the live angles directly (1:1; a direct-manipulation
  // gesture that eases feels broken), while the preset buttons write only the
  // targets and let the loop slide into them.
  const RAD = Math.PI / 180;
  const homeYaw = kidSide === 'dark' ? 0 : Math.PI;
  let yaw = homeYaw;
  let pitch = CAM_PITCH_DEG * RAD;
  let zoom = 1;
  let yawT = yaw;
  let pitchT = pitch;
  let zoomT = zoom;
  let tiltIdx = TILT_ORDER.indexOf('tilted');
  /** Fitted distance before zoom. Depends only on aspect, so it is recomputed
   *  on resize and nowhere else. */
  let baseDist = 10;
  let viewMoved = false;

  const clampPitch = (p: number): number => Math.max(CAM_PITCH_MIN_DEG * RAD, Math.min(CAM_PITCH_MAX_DEG * RAD, p));
  const clampZoom = (z: number): number => Math.max(CAM_ZOOM_MIN, Math.min(CAM_ZOOM_MAX, z));

  /** Shortest signed way round from a to b, so easing to a preset never takes
   *  the long way after the kid has spun the board twice. */
  const wrapDelta = (a: number, b: number): number => {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };

  /** Tell the UI whether there is anything to reset, so the reset button is
   *  honest rather than permanently lit. */
  const reportMoved = (): void => {
    const moved =
      Math.abs(wrapDelta(yawT, homeYaw)) > 0.02 ||
      Math.abs(pitchT - CAM_PITCH_DEG * RAD) > 0.02 ||
      Math.abs(zoomT - 1) > 0.02;
    if (moved !== viewMoved) {
      viewMoved = moved;
      cb.onViewMoved(moved);
    }
  };

  const applyCamera = (): void => {
    const dist = baseDist * zoom;
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    camera.lookAt(0, 0, 0);
  };

  const fit = (): void => {
    const { w, h } = sizeOf();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Worst case is the board's DIAGONAL, because yaw swings its corners under
    // the frame. Fitting the edge instead clips them the moment anyone turns it.
    const half = (BOARD_U / 2) * Math.SQRT2;
    const vFov = camera.fov * RAD;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    baseDist = Math.max(half / Math.tan(vFov / 2), half / Math.tan(hFov / 2)) * CAM_FIT_PAD;
    camera.updateProjectionMatrix();
    applyCamera();
  };
  fit();

  // --- highlight state -----------------------------------------------------
  let phase: Phase = 'idle';
  let selected: number | null = null;
  let selectedMoves: CheckersMove[] = [];
  let pulseT = 0;

  const clearMarkers = (): void => {
    for (const m of markers) m.visible = false;
  };

  const showMoves = (sq: number): void => {
    clearMarkers();
    // ONE MARKER PER DESTINATION SQUARE. Two different jump chains can finish on
    // the same square (going round a loop the other way), and two markers on one
    // square means the kid can only ever reach whichever we drew last. Where
    // that happens, keep the chain that takes MORE pieces — a kid who taps a
    // square wants the bigger jump, and the shorter one is reachable by taking
    // the pieces in the other order anyway.
    const byDest = new Map<number, CheckersMove>();
    for (const m of movesFrom(state, sq)) {
      const prior = byDest.get(m.to);
      if (!prior || m.captures.length > prior.captures.length) byDest.set(m.to, m);
    }
    selectedMoves = [...byDest.values()];
    const { x, z } = squarePos(sq);
    selRing.position.set(x, Y_RING, z);
    selRing.visible = true;
    selectedMoves.forEach((m, i) => {
      const g = markers[i];
      if (!g) return;
      const dest = squarePos(m.to);
      g.position.set(dest.x, Y_MARKER, dest.z);
      const disc = g.children[0] as THREE.Mesh;
      disc.material = m.captures.length > 0 ? jumpMat : quietMat;
      g.userData.moveIndex = i;
      (g.children[2] as THREE.Mesh).userData.moveIndex = i;
      g.visible = true;
    });
  };

  const deselect = (): void => {
    selected = null;
    selectedMoves = [];
    selRing.visible = false;
    clearMarkers();
    if (phase === 'selected') phase = 'idle';
  };

  // --- telemetry -----------------------------------------------------------
  const history = new Map<string, number>([[positionKey(state), 1]]);
  let kidTurns = 0;
  let flaggedTurns = 0;
  let kidCaptures = 0;
  let botCaptures = 0;
  let kidCrownings = 0;
  let noProgressKidTurns = 0;
  const trayCount: Record<Side, number> = { light: 0, dark: 0 };

  /** Was this kid turn a mistake, for move-quality purposes?
   *
   *  Graded at a FIXED depth regardless of which opponent the kid chose — never
   *  grade with the handicapped search they played against, or a tier-1 bot's
   *  opinion decides a kid's mastery. */
  const gradeKidTurn = (before: CheckersState, played: CheckersMove): boolean => {
    // ⚠️ A forced single jump is not a decision. Checkers offers exactly one
    // legal turn constantly, unlike chess — flagging those would punish a kid
    // for a move they had no choice about.
    const options = legalMoves(before);
    if (options.length <= 1) return false;

    const ranked = scoreRootMoves(before, GRADING_DEPTH, GRADING_WEIGHTS);
    const best = ranked[0]?.score ?? 0;
    const mine = ranked.find(
      (r) => r.move.from === played.from && r.move.to === played.to && r.move.captures.length === played.captures.length,
    );
    if (mine && best - mine.score >= BLUNDER_CP) return true;

    // Anti-farm, part one: a position seen before this game.
    const after = applyMove(before, played);
    if ((history.get(positionKey(after)) ?? 0) >= 2) return true;

    // Anti-farm, part two: the shuffle counter. See NO_PROGRESS_FLAG_AT.
    if (noProgressKidTurns >= NO_PROGRESS_FLAG_AT) return true;

    return false;
  };

  // --- animation -----------------------------------------------------------
  interface Anim {
    rec: PieceRec;
    hops: Hop[];
    i: number;
    t: number;
    beat: number;
    crowns: boolean;
    crownT: number;
    move: CheckersMove;
    by: Side;
    flagged: boolean;
  }
  let anim: Anim | null = null;
  let wobble: { obj: THREE.Object3D; t: number } | null = null;
  const fading: Array<{ group: THREE.Group; t: number; side: Side; index: number }> = [];

  const hopsFor = (m: CheckersMove): Hop[] => {
    const stops = [...m.path, m.to];
    const hops: Hop[] = [];
    let from = squarePos(m.from);
    stops.forEach((sq, i) => {
      const to = squarePos(sq);
      hops.push({ from, to, victim: m.captures[i] ?? null });
      from = to;
    });
    return hops;
  };

  const startMove = (m: CheckersMove, by: Side, flagged: boolean): void => {
    const rec = pieces.get(m.from);
    if (!rec) return;
    pieces.delete(m.from);
    phase = 'animating';
    deselect();
    anim = { rec, hops: hopsFor(m), i: 0, t: 0, beat: 0, crowns: m.crowns, crownT: -1, move: m, by, flagged };
  };

  const removePiece = (sq: number): void => {
    const victim = pieces.get(sq);
    if (!victim) return;
    pieces.delete(sq);
    // ⚠️ Retire the tap proxy too. A captured piece keeps its mesh (it flies to
    // the tray as the material counter), and if its proxy stays in hitMeshes it
    // stays raycastable — so a tap on the TRAY resolves to a stale square index
    // and selects whatever now stands there. Leaving this out is invisible until
    // a kid taps their own pile and a piece across the board lights up.
    const hit = victim.group.children.find((c) => c.userData.sq !== undefined);
    if (hit) {
      const i = hitMeshes.indexOf(hit as THREE.Mesh);
      if (i >= 0) hitMeshes.splice(i, 1);
    }
    const eaten = victim.side;
    fading.push({ group: victim.group, t: 0, side: eaten, index: trayCount[eaten] });
    trayCount[eaten] += 1;
  };

  const finishMove = (a: Anim): void => {
    const m = a.move;
    const before = state;
    state = applyMove(before, m);
    const key = positionKey(state);
    history.set(key, (history.get(key) ?? 0) + 1);

    // Land the piece and re-key it.
    const dest = squarePos(m.to);
    a.rec.group.position.set(dest.x, Y_PIECE, dest.z);
    a.rec.group.rotation.set(0, 0, 0);
    a.rec.sq = m.to;
    pieces.set(m.to, a.rec);
    syncHitSquares();

    if (m.crowns) {
      pieceSet.crown(a.rec.group, a.by);
      const crown = a.rec.group.getObjectByName('crown');
      if (crown) crown.scale.setScalar(reduceMotion ? 1 : 0.001);
      if (a.by === kidSide) {
        kidCrownings += 1;
        playLevelUp();
        hapticSuccess();
        cb.onOpponentLine('gotCrowned');
      } else {
        cb.onOpponentLine('botCrowned');
      }
    }

    if (a.by === kidSide) {
      kidTurns += 1;
      kidCaptures += m.captures.length;
      if (a.flagged) flaggedTurns += 1;
      noProgressKidTurns = m.captures.length > 0 || m.crowns ? 0 : noProgressKidTurns + 1;
      if (m.captures.length >= 2) cb.onOpponentLine('kidChains');
      else if (m.captures.length === 1) cb.onOpponentLine('kidCaptures');
      else if (!a.flagged) cb.onOpponentLine('goodMove');
      else cb.onOpponentLine('kidSlip');
    } else {
      botCaptures += m.captures.length;
      if (m.captures.length > 0) cb.onOpponentLine('botCaptures');
    }

    cb.onTurn(a.by, { captures: m.captures.length, crowns: m.crowns }, a.flagged);
    announce(a.by, m);
    anim = null;

    afterTurn();
  };

  const announce = (by: Side, m: CheckersMove): void => {
    const who = by === kidSide ? 'You' : foe.name;
    const { rank } = squareToRC(m.to);
    const took = m.captures.length;
    const parts = [`${who} moved to row ${rank + 1}`];
    if (took === 1) parts.push('and took a piece');
    else if (took > 1) parts.push(`and took ${took} pieces`);
    if (m.crowns) parts.push('and got crowned');
    cb.onAnnounce(`${parts.join(' ')}.`);
  };

  // --- turn flow -----------------------------------------------------------
  let thinkUntil = 0;
  let pendingBotMove: CheckersMove | null = null;

  const finish = (outcome: 'win' | 'loss' | 'draw', reason: CheckersOutcomeReason): void => {
    phase = 'over';
    deselect();
    if (outcome === 'win') {
      playWin();
      hapticSuccess();
    }
    cb.onOpponentLine(outcome === 'win' ? 'botLoses' : outcome === 'loss' ? 'botWins' : 'draw');
    cb.onGameOver(outcome, {
      kidTurns,
      flaggedTurns,
      kidCaptures,
      botCaptures,
      kidCrownings,
      reason,
    });
  };

  type CheckersOutcomeReason = 'no-moves' | 'repetition' | 'no-progress' | 'adjudicated' | 'resigned';

  const afterTurn = (): void => {
    const done = result(state, history);
    if (done) {
      if (done.kind === 'win') finish(done.side === kidSide ? 'win' : 'loss', 'no-moves');
      else finish('draw', done.reason);
      return;
    }
    if (kidTurns >= MAX_KID_TURNS) {
      const m = material(state);
      const score = (x: { men: number; kings: number }) => x.men + x.kings * 1.6;
      const edge = score(m[kidSide]) - score(m[botSide]);
      finish(edge > 0.5 ? 'win' : edge < -0.5 ? 'loss' : 'draw', 'adjudicated');
      return;
    }
    if (state.turn === botSide) {
      phase = 'thinking';
      cb.onThinking(true);
      const t0 = performance.now();
      pendingBotMove = chooseBotMove(state, foe.bot, rng);
      const searched = performance.now() - t0;
      const flourish = pendingBotMove && pendingBotMove.captures.length > 0 ? THINK_FLOURISH_MS : 0;
      const target = THINK_BASE_MS + rng() * THINK_JITTER_MS + flourish;
      // Subtract the search we already did, so every tier feels like the same
      // character deliberating and the jank hides inside a pause that was going
      // to happen anyway. The floor matters: an instant reply reads to a kid as
      // "the computer already knew".
      thinkUntil = performance.now() + Math.max(THINK_MIN_MS, target - searched);
    } else {
      phase = 'idle';
      cb.onThinking(false);
      // Say it BEFORE the kid touches anything: the jump is a hint, not a
      // correction after the fact.
      if (legalMoves(state).some((m) => m.captures.length > 0)) {
        cb.onAnnounce('You have a jump. Jumps have to be taken.');
      }
    }
  };

  // --- input ---------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  /** Live pointers, so two fingers can pinch. */
  const pointers = new Map<number, { x: number; y: number }>();
  let dragX = 0;
  let dragY = 0;
  let moved = false;
  let pinchStart = 0;
  let pinchZoom0 = 1;

  const pick = (clientX: number, clientY: number): void => {
    if (phase !== 'idle' && phase !== 'selected') return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);

    // Destinations first — a lit square is what the kid is aiming at, and its
    // proxy overlaps the neighbouring pieces' proxies by design.
    if (selected !== null) {
      const hits = raycaster.intersectObjects(
        markers.filter((m) => m.visible).map((m) => m.children[2]),
        false,
      );
      const idx = hits[0]?.object.userData.moveIndex as number | undefined;
      if (idx !== undefined && selectedMoves[idx]) {
        const m = selectedMoves[idx];
        playCorrect();
        hapticTap();
        startMove(m, kidSide, gradeKidTurn(state, m));
        return;
      }
    }

    const pieceHits = raycaster.intersectObjects(hitMeshes, false);
    const sq = pieceHits[0]?.object.userData.sq as number | undefined;
    if (sq !== undefined) {
      const rec = pieces.get(sq);
      if (rec && rec.side === kidSide && state.turn === kidSide) {
        if (selected === sq) {
          deselect();
          playTap();
          return;
        }
        const can = movesFrom(state, sq);
        if (can.length === 0) {
          // Cannot move — almost always because a jump exists elsewhere. This is
          // the hint path, and it must never sound like a mistake.
          nudge(rec.group);
          cb.onOpponentLine('forcedJump');
          return;
        }
        selected = sq;
        phase = 'selected';
        playTap();
        showMoves(sq);
        return;
      }
      if (rec) {
        nudge(rec.group);
        return;
      }
    }
    if (selected !== null) deselect();
  };

  /** The "nothing happened, and that is fine" feedback. Never playWrong. */
  const nudge = (obj: THREE.Object3D): void => {
    playTap();
    if (!reduceMotion) wobble = { obj, t: 0 };
  };

  const pinchDist = (): number => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onDown = (e: PointerEvent): void => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    renderer.domElement.setPointerCapture?.(e.pointerId);
    if (pointers.size === 1) {
      moved = false;
      dragX = e.clientX;
      dragY = e.clientY;
    } else if (pointers.size === 2) {
      // A second finger turns the gesture into a pinch. Whatever the first one
      // was doing stops counting as a tap — otherwise letting go of a pinch
      // lands a move on whichever square happened to be under a finger.
      moved = true;
      pinchStart = pinchDist();
      pinchZoom0 = zoom;
    }
  };

  const onMove = (e: PointerEvent): void => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (pointers.size >= 2) {
      if (pinchStart > 0) {
        // Fingers apart = closer in, which is the direction every photo app on
        // the device has already taught these kids.
        zoom = clampZoom(pinchZoom0 * (pinchStart / Math.max(1, pinchDist())));
        zoomT = zoom;
        applyCamera();
        reportMoved();
      }
      return;
    }

    const dx = e.clientX - dragX;
    const dy = e.clientY - dragY;
    // 8px of slack before a tap becomes a drag — a kid's tap is never perfectly
    // still, and turning every wobbly tap into a camera nudge would make the
    // board feel like it is dodging them.
    if (!moved && Math.hypot(dx, dy) > 8) moved = true;
    if (!moved) return;

    const el = renderer.domElement;
    yaw -= (dx / (el.clientWidth || 1)) * CAM_DRAG_YAW_DEG * RAD;
    // Drag DOWN raises the camera: you are tipping the board's far edge toward
    // you, the way you would with a real one on a table.
    pitch = clampPitch(pitch + (dy / (el.clientHeight || 1)) * CAM_DRAG_PITCH_DEG * RAD);
    yawT = yaw;
    pitchT = pitch;
    dragX = e.clientX;
    dragY = e.clientY;
    applyCamera();
    reportMoved();
  };

  const onUp = (e: PointerEvent): void => {
    const had = pointers.delete(e.pointerId);
    if (!had) return;
    if (pointers.size < 2) pinchStart = 0;
    // A drag is a look, not a move. Only a clean tap picks — and only when it
    // was the last finger down, so lifting one finger out of a pinch does not
    // fire one.
    if (pointers.size === 0 && !moved) pick(e.clientX, e.clientY);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);

  // --- loop ----------------------------------------------------------------
  let raf = 0;
  let last = performance.now();
  let paused = false;

  const tick = (): void => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    // Clamp: a tab-switch stall must not fling a piece across the board.
    const dt = Math.min(now - last, 50) / 1000;
    last = now;
    if (paused) {
      renderer.render(scene, camera);
      return;
    }

    // Ease toward a preset. Drag already wrote the live angles, so this only
    // ever has work to do after a button — which is also why it does not need a
    // reduced-motion branch: it IS the reduced-motion path, a short move between
    // two states the kid asked for, and removing it would teleport the board.
    {
      const dYaw = wrapDelta(yaw, yawT);
      const dPitch = pitchT - pitch;
      const dZoom = zoomT - zoom;
      if (Math.abs(dYaw) > 0.001 || Math.abs(dPitch) > 0.001 || Math.abs(dZoom) > 0.001) {
        const k = reduceMotion ? 1 : CAM_EASE;
        yaw += dYaw * k;
        pitch += dPitch * k;
        zoom += dZoom * k;
        applyCamera();
      }
    }

    // Jump pulse — the affordance that makes the forced-capture rule fair. Under
    // reduced motion the amber discs and their white halo carry it statically.
    pulseT += dt;
    if (!reduceMotion) {
      const s = 1 + Math.sin(pulseT * 8.8) * 0.08;
      for (const m of markers) if (m.visible) m.children[0].scale.set(s, 1, s);
    }

    // Bot commit.
    if (phase === 'thinking' && now >= thinkUntil) {
      cb.onThinking(false);
      if (pendingBotMove) {
        startMove(pendingBotMove, botSide, false);
        pendingBotMove = null;
      } else {
        finish('win', 'no-moves');
      }
    }

    // Piece in flight.
    if (anim) {
      if (anim.beat > 0) {
        anim.beat -= dt * 1000;
      } else {
        const hop = anim.hops[anim.i];
        const jump = hop.victim !== null;
        const dur = (reduceMotion ? RM_MOVE_MS : jump ? HOP_MS : MOVE_MS) / 1000;
        anim.t = Math.min(1, anim.t + dt / dur);
        const u = anim.t;
        const x = hop.from.x + (hop.to.x - hop.from.x) * u;
        const z = hop.from.z + (hop.to.z - hop.from.z) * u;

        if (reduceMotion) {
          anim.rec.group.position.set(x, Y_PIECE, z);
        } else {
          // A parabola for a jump, a low lift for a step.
          const peakH = jump ? 0.55 : 0.22;
          const y = Y_PIECE + Math.sin(u * Math.PI) * peakH;
          anim.rec.group.position.set(x, y, z);
          if (jump) {
            // A FRONT FLIP, not a yaw spin. A checker is rotationally symmetric
            // about its own axis, so spinning it is completely invisible.
            const dx = hop.to.x - hop.from.x;
            const dz = hop.to.z - hop.from.z;
            const len = Math.hypot(dx, dz) || 1;
            anim.rec.group.rotation.set(0, 0, 0);
            anim.rec.group.rotateOnAxis(new THREE.Vector3(dz / len, 0, -dx / len), u * Math.PI * 2);
          }
        }

        // Remove the victim while the mover is OVERHEAD, not on arrival — cause
        // and effect have to land together or the piece just vanishes.
        if (hop.victim !== null && u >= (reduceMotion ? 0.9 : CAPTURE_AT)) {
          removePiece(hop.victim);
          hop.victim = null;
          hapticThump();
        }

        if (anim.t >= 1) {
          anim.rec.group.rotation.set(0, 0, 0);
          anim.i += 1;
          anim.t = 0;
          if (anim.i >= anim.hops.length) {
            finishMove(anim);
          } else {
            anim.beat = reduceMotion ? 0 : CHAIN_BEAT_MS;
          }
        }
      }
    }

    // Coronation.
    for (const [, rec] of pieces) {
      const crown = rec.group.getObjectByName('crown');
      if (crown && crown.scale.x < 1) {
        const s = Math.min(1, crown.scale.x + dt * (1000 / CROWN_MS) * 1.35);
        // A touch of overshoot, settling back — the most generous beat in the
        // game, because this is the moment a kid will remember.
        crown.scale.setScalar(s < 0.85 ? s * 1.3 : s);
      }
    }

    // Captured pieces shrinking onto their plate.
    for (let i = fading.length - 1; i >= 0; i -= 1) {
      const f = fading[i];
      f.t = Math.min(1, f.t + dt * (1000 / RM_FADE_MS));
      const s = 1 - f.t;
      f.group.scale.setScalar(Math.max(0.001, s));
      if (f.t >= 1) {
        const pos = trayPos(f.side, f.index);
        f.group.position.set(pos.x, pos.y, pos.z);
        f.group.scale.setScalar(0.8);
        f.group.rotation.set(0, 0, 0);
        fading.splice(i, 1);
      }
    }

    // Invalid-tap wobble.
    if (wobble) {
      wobble.t = Math.min(1, wobble.t + dt * (1000 / WOBBLE_MS));
      wobble.obj.scale.setScalar(1 + Math.sin(wobble.t * Math.PI * 3) * 0.04);
      if (wobble.t >= 1) {
        wobble.obj.scale.setScalar(1);
        wobble = null;
      }
    }

    renderer.render(scene, camera);
  };

  cb.onOpponentLine('greeting');
  afterTurn();
  raf = requestAnimationFrame(tick);

  return {
    resize: fit,
    setPaused(p) {
      paused = p;
      if (!p) last = performance.now();
    },
    setView(view) {
      if (view === 'home') {
        // Home restores yaw and zoom too, not just tilt. That is what makes it
        // the RECOVERY affordance — a kid who spun the board round and cannot
        // find their own pieces needs one button, not three.
        yawT = yaw + wrapDelta(yaw, homeYaw);
        pitchT = CAM_PITCH_DEG * RAD;
        zoomT = 1;
        tiltIdx = TILT_ORDER.indexOf('tilted');
      } else {
        tiltIdx = TILT_ORDER.indexOf(view);
        pitchT = clampPitch(CAM_VIEW_PITCH[view] * RAD);
      }
      reportMoved();
    },
    spinView(deltaDeg) {
      yawT += deltaDeg * RAD;
      reportMoved();
    },
    cycleTilt() {
      tiltIdx = (tiltIdx + 1) % TILT_ORDER.length;
      const next = TILT_ORDER[tiltIdx];
      pitchT = clampPitch(CAM_VIEW_PITCH[next] * RAD);
      reportMoved();
      return next;
    },
    resign() {
      if (phase !== 'over') finish('loss', 'resigned');
    },
    dispose() {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onUp);
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
      scene.clear();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    },
  };
}
