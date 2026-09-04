// Marble Math Maze — roll a cherry-red marble through a strawberry-cake
// maze by tilting the iPad. Each gate blocks the path until the kid solves
// a math problem; correct opens it, wrong stays closed. Reach the mint
// goal zone to win. Watch out for cake holes — they drain a life!
//
// Controls:
//   - iOS/iPadOS with motion permission: `deviceorientation` → gamma/beta
//     mapped to marble acceleration. Baseline captured on start so any
//     holding angle works.
//   - Fallback: pointer drag. Finger down anywhere in the canvas, marble
//     accelerates toward the pointer. Desktop testing + devices without
//     orientation sensors get this.
//
// Physics: Phaser Arcade with gravity disabled (we apply directional
// acceleration ourselves). Marble has drag + bounce so it feels marbly
// against walls. Max velocity cap so it doesn't teleport.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import {
  buildSessionSummary,
  type SoundName,
} from '@/lib/games/phaser/session';
import {
  MARBLE_MAZE_SCENE_KEY,
  MARBLE_MAZE_VIEW_W,
  MARBLE_MAZE_VIEW_H,
  type MarbleMazeSceneProps,
} from './MarbleMazeScene.factory';
import {
  drawCakeBands,
  drawSprinkles,
  drawFrostingDrizzle,
  drawTimerBadge,
  sparkleAt,
  type TimerHandle,
} from '@/lib/games/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW_W = MARBLE_MAZE_VIEW_W;
const VIEW_H = MARBLE_MAZE_VIEW_H;

const MARBLE_RADIUS = 12;
// Tuning notes (kid ticket Apr 23: "too hard to get the ball through"):
// the v1 numbers had MARBLE_DRAG (180) ≈ TILT_SENSITIVITY × 5° (175), which
// meant a comfortable hold produced near-zero net acceleration — the kid
// had to over-tilt to budge the marble at all. New tuning:
//   - sensitivity well above drag at moderate tilts (60 × 5° = 300 vs drag 110)
//   - smaller deadzone so a gentle hold registers (1.5° → 0.6°)
//   - higher max speed so firm tilts actually traverse a corridor
//   - softer bounce so wall hits don't ricochet across the maze
//   - snappier finger-drag for the no-tilt fallback
const MARBLE_MAX_SPEED = 340;         // px/s
const MARBLE_DRAG = 110;              // px/s² deceleration when no input
const MARBLE_BOUNCE = 0.18;

// Tilt sensitivity — gamma degrees × k = acceleration in px/s².
const TILT_SENSITIVITY = 60;
const TILT_DEADZONE_DEG = 0.6;
const DRAG_PULL_K = 600;              // px/s² toward pointer

const MAX_LIVES = 3;
const IMMUNITY_MS = 1800;             // ms of trap immunity after respawn

// Standardized round length across the catalog. Reaching the goal ends
// the round early with completed=true; running out of lives ends with
// completed=false; otherwise the timer caps the session at 3 min.
const GAME_DURATION_MS = 3 * 60 * 1000;
const TICK_LAST_MS = 30_000;

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;
const COUNTDOWN_STEP_MS = 700;

// Brand palette — three-layer cake: mint / vanilla / strawberry
const COLOR_BG_MINT       = 0xd1fae5;   // mint layer (top of scene)
const COLOR_BG_VANILLA    = 0xfef3c7;   // vanilla layer (middle)
const COLOR_BG_STRAWBERRY = 0xfce7f3;   // strawberry tint (bottom)
const COLOR_WALL          = 0xfb7185;   // strawberry
const COLOR_WALL_EDGE     = 0xe11d48;   // strawberry deep
const COLOR_GATE_CLOSED   = 0xfbbf24;   // amber
const COLOR_GATE_OPEN     = 0xa7f3d0;   // mint tint
const COLOR_GOAL          = 0x10b981;   // mint deep
const COLOR_MARBLE        = 0xdc2626;   // cherry
const COLOR_MARBLE_HILITE = 0xfecaca;   // cherry pink
const COLOR_TRAP          = 0x1e1b4b;   // deep indigo (hole)
const COLOR_TRAP_RING     = 0x7c3aed;   // violet (swirl ring)
const COLOR_FROSTING      = 0xffffff;   // frosting drizzle on walls

// ---------------------------------------------------------------------------
// Maze layouts — three rotating designs (kid ticket May 2: "different
// map mazes / more designs pls"). Each layout is a self-contained set of
// walls/gates/traps/treats/start/goal. Scene picks one randomly on
// create() and resetScene() so every Play Again gets variety.
//
// Coordinates are in scene space (400×600).
// Layout invariant: gates sit in the *gap* between two wall segments, not
// overlapping either one's physics body — otherwise solving the gate
// leaves an invisible wall behind that the marble can't pass.
// Layout invariant 2: trap centers must be ≥40px from any treat center.
// A kid reported "don't put bonuses on top of cake holes."
// ---------------------------------------------------------------------------

interface WallDef { x: number; y: number; w: number; h: number; }
interface GateDef { x: number; y: number; w: number; h: number; id: string; }
interface TrapDef { x: number; y: number; r: number; }
interface TreatDef { x: number; y: number; emoji: string; }
interface MazeLayout {
  name: string;
  start: { x: number; y: number };
  goal: { x: number; y: number; r: number };
  walls: readonly WallDef[];
  gates: readonly GateDef[];
  traps: readonly TrapDef[];
  treats: readonly TreatDef[];
}

// Standard outer frame, reused by all layouts.
const FRAME: readonly WallDef[] = [
  { x: 0,   y: 0,   w: 400, h: 14  },
  { x: 0,   y: 586, w: 400, h: 14  },
  { x: 0,   y: 0,   w: 14,  h: 600 },
  { x: 386, y: 0,   w: 14,  h: 600 },
];

// Layout 1 — "Cake Tower" (the original v1 design).
// Path: START top-left → right → GATE1 → down → left → GATE2 → right-down
// → GATE3 → GOAL. Three gates, vertical descent through stacked dividers.
const MAZE_CAKE_TOWER: MazeLayout = {
  name: '🎂 Cake Tower',
  start: { x: 40, y: 70 },
  goal:  { x: 355, y: 555, r: 38 },
  walls: [
    ...FRAME,
    { x: 14,  y: 120, w: 220, h: 14  },   // divider 1
    { x: 270, y: 120, w: 14,  h: 130 },   // divider 2
    { x: 80,  y: 250, w: 306, h: 14  },   // divider 3
    { x: 80,  y: 250, w: 14,  h: 120 },   // divider 4
    { x: 94,  y: 400, w: 230, h: 14  },   // divider 5
    { x: 306, y: 414, w: 14,  h: 72  },   // divider 6
    { x: 14,  y: 490, w: 331, h: 14  },   // divider 7
  ],
  gates: [
    { x: 234, y: 120, w: 36,  h: 14,  id: 'g1' },
    { x: 80,  y: 370, w: 14,  h: 120, id: 'g2' },
    { x: 345, y: 490, w: 40,  h: 14,  id: 'g3' },
  ],
  traps: [
    { x: 310, y: 65,  r: 14 },
    { x: 225, y: 195, r: 14 },
    { x: 170, y: 470, r: 14 },
  ],
  treats: [
    { x: 140, y: 70,  emoji: '🧁' },
    { x: 210, y: 185, emoji: '🍒' },
    { x: 45,  y: 340, emoji: '🍪' },
    { x: 60,  y: 455, emoji: '🍩' },
    { x: 360, y: 475, emoji: '🍭' },
  ],
};

// Layout 2 — "Stairway".
// Path: START top-left → right (collect treats) → GATE1 down-right →
// left across → GATE2 down-left → right across → GATE3 down → GOAL.
// Three horizontal "steps" with gates at alternating ends. Easier to
// read than Cake Tower but still demands all three gate solves.
const MAZE_STAIRWAY: MazeLayout = {
  name: '🪜 Stairway',
  start: { x: 40, y: 60 },
  goal:  { x: 355, y: 545, r: 36 },
  walls: [
    ...FRAME,
    // Step 1 — horizontal divider y=160. Wall left, gate right.
    { x: 14,  y: 160, w: 280, h: 14 },
    // Step 2 — horizontal divider y=300. Wall right, gate left.
    { x: 106, y: 300, w: 280, h: 14 },
    // Step 3 — horizontal divider y=440. Wall left, gate right.
    { x: 14,  y: 440, w: 280, h: 14 },
    // Short vertical pegs hint at the path direction
    { x: 226, y: 60,  w: 14, h: 60 },     // peg between start and step 1
    { x: 110, y: 198, w: 14, h: 70 },     // peg in mid-section
    { x: 226, y: 340, w: 14, h: 60 },     // peg in mid-lower
  ],
  gates: [
    { x: 294, y: 160, w: 78, h: 14, id: 'g1' },   // top-right opening
    { x: 14,  y: 300, w: 92, h: 14, id: 'g2' },   // mid-left opening
    { x: 294, y: 440, w: 78, h: 14, id: 'g3' },   // bot-right opening
  ],
  traps: [
    { x: 130, y: 220, r: 14 },   // tempting shortcut in the mid-left band
    { x: 290, y: 380, r: 14 },   // mid-right detour
    { x: 60,  y: 510, r: 14 },   // lower-left, kids overshoot here
  ],
  treats: [
    { x: 110, y: 95,  emoji: '🧁' },   // top corridor
    { x: 350, y: 95,  emoji: '🍒' },   // pre-gate-1
    { x: 350, y: 240, emoji: '🍪' },   // post-gate-1
    { x: 60,  y: 380, emoji: '🍩' },   // post-gate-2
    { x: 220, y: 510, emoji: '🍭' },   // pre-goal corridor
  ],
};

// Layout 3 — "Twin Halls".
// Path: START top-left → down LEFT channel → GATE1 across → enter RIGHT
// channel → down → GATE2 cross-back → LEFT channel → down → GATE3 →
// GOAL. The marble bounces between two parallel vertical halls via cross-
// gates, which feels different from the descending-step pattern.
const MAZE_TWIN_HALLS: MazeLayout = {
  name: '🏛️ Twin Halls',
  start: { x: 50, y: 60 },
  goal:  { x: 350, y: 555, r: 36 },
  walls: [
    ...FRAME,
    // Central vertical divider, broken by 3 cross-gates
    { x: 193, y: 14,  w: 14, h: 152 },   // upper segment
    { x: 193, y: 222, w: 14, h: 142 },   // middle segment
    { x: 193, y: 420, w: 14, h: 166 },   // lower segment
    // Horizontal teasers — short walls inside each channel that force
    // the marble to wiggle past instead of plummeting straight down.
    { x: 14,  y: 280, w: 100, h: 14 },   // left channel shelf
    { x: 290, y: 200, w: 96,  h: 14 },   // right channel shelf
    { x: 290, y: 380, w: 96,  h: 14 },   // right channel lower shelf
    { x: 14,  y: 480, w: 100, h: 14 },   // left channel lower shelf
  ],
  gates: [
    // Gate 1 — first crossing from left to right channel
    { x: 193, y: 166, w: 14, h: 56, id: 'g1' },
    // Gate 2 — back from right to left channel
    { x: 193, y: 364, w: 14, h: 56, id: 'g2' },
    // Gate 3 — final cross to goal side
    { x: 193, y: 500, w: 14, h: 60, id: 'g3' },
  ],
  traps: [
    { x: 60,  y: 200, r: 14 },   // upper-left tempting straight-down path
    { x: 340, y: 290, r: 14 },   // upper-right detour
    { x: 110, y: 420, r: 14 },   // lower-left between shelf and gate 3
  ],
  treats: [
    { x: 130, y: 90,  emoji: '🧁' },
    { x: 50,  y: 350, emoji: '🍒' },
    { x: 350, y: 130, emoji: '🍪' },
    { x: 350, y: 470, emoji: '🍩' },
    { x: 60,  y: 555, emoji: '🍭' },
  ],
};

const MAZES: readonly MazeLayout[] = [MAZE_CAKE_TOWER, MAZE_STAIRWAY, MAZE_TWIN_HALLS];

/** Mechanical 90° transpose: swap (x,y) and (w,h) on every shape so a
 *  maze designed in 400×600 portrait works in a 600×400 landscape
 *  canvas. The FRAME walls flip — old "top" becomes new "left", etc.
 *  Path topology is preserved (the kid plays the same maze rotated). */
function transposeMaze(m: MazeLayout): MazeLayout {
  return {
    name: m.name,
    start: { x: m.start.y, y: m.start.x },
    goal:  { x: m.goal.y,  y: m.goal.x,  r: m.goal.r },
    walls:  m.walls.map(w  => ({ x: w.y, y: w.x, w: w.h, h: w.w })),
    gates:  m.gates.map(g  => ({ x: g.y, y: g.x, w: g.h, h: g.w, id: g.id })),
    traps:  m.traps.map(t  => ({ x: t.y, y: t.x, r: t.r })),
    treats: m.treats.map(t => ({ x: t.y, y: t.x, emoji: t.emoji })),
  };
}

// ---------------------------------------------------------------------------
// Procedural maze generator — the real fix for "the same maze keeps coming
// up, it is boring, make 50 variations" (Guest ticket, Jul 6). Instead of
// rotating three hand-authored layouts, we grow a FRESH descending-bands maze
// every round: N horizontal dividers, each with a single gate opening on an
// (mostly) alternating side. The path is solvable *by construction* — zig-zag
// down, one gate per band, corridors always open horizontally — so no
// pathfinding check is needed. Treats line the corridors; traps are
// rejection-sampled to stay ≥40px off any treat (the old kid ticket "don't put
// bonuses on cake holes" invariant). Effectively unlimited variety, not 50.
// ---------------------------------------------------------------------------

const TREAT_EMOJIS = ['🧁', '🍒', '🍪', '🍩', '🍭', '🍰', '🍬', '🍫', '🍮', '🧇'] as const;
const MAZE_ADJECTIVES = ['Sugar', 'Sprinkle', 'Frosting', 'Cocoa', 'Berry', 'Caramel', 'Waffle', 'Honey', 'Mint', 'Toffee'];
const MAZE_NOUNS = ['Switchback', 'Descent', 'Cascade', 'Ladder', 'Drop', 'Slalom', 'Tumble', 'Run'];

function generateProceduralMaze(): MazeLayout {
  const W = 400, H = 600, INSET = 14, WT = 14; // canvas + wall thickness
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const rndInt = (a: number, b: number) => Math.floor(rnd(a, b + 1));
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const bandCount = Math.random() < 0.28 ? 4 : 3; // 3 gates usually, 4 now and then
  const topPad = 118, botPad = 108;
  const usable = H - topPad - botPad;

  const walls: WallDef[] = [...FRAME];
  const gates: GateDef[] = [];
  const treats: TreatDef[] = [];
  const traps: TrapDef[] = [];
  const gateCenters: { x: number; y: number }[] = [];
  const bandYs: number[] = [];

  // One horizontal divider per band, each with a single gate gap. The wall
  // fills everything except the gap; the gate fills the gap exactly — so the
  // marble MUST solve it to descend, with no slip-through leak.
  let side: 'L' | 'R' = Math.random() < 0.5 ? 'L' : 'R';
  for (let i = 0; i < bandCount; i++) {
    const y = Math.round(topPad + (usable * (i + 0.5)) / bandCount + rnd(-16, 16));
    bandYs.push(y);
    const gap = Math.round(rnd(70, 104));
    if (side === 'R') {
      const gateStart = W - INSET - gap;
      walls.push({ x: INSET, y, w: gateStart - INSET, h: WT });
      gates.push({ x: gateStart, y, w: gap, h: WT, id: `g${i + 1}` });
      gateCenters.push({ x: gateStart + gap / 2, y });
    } else {
      const gateEnd = INSET + gap;
      walls.push({ x: gateEnd, y, w: (W - INSET) - gateEnd, h: WT });
      gates.push({ x: INSET, y, w: gap, h: WT, id: `g${i + 1}` });
      gateCenters.push({ x: INSET + gap / 2, y });
    }
    side = Math.random() < 0.8 ? (side === 'R' ? 'L' : 'R') : side; // mostly alternate
  }

  // Optional mid-corridor shelves for texture. Narrow + kept ≥60px clear on
  // BOTH ends, so the marble can always roll around — never blocks a band.
  for (let s = 0, shelves = rndInt(0, 2); s < shelves; s++) {
    const bi = rndInt(0, bandCount - 1);
    const yTop = bi === 0 ? topPad : bandYs[bi - 1];
    const yBot = bandYs[bi];
    if (yBot - yTop < 74) continue;
    const sw = Math.round(rnd(70, 110));
    const sx = clamp(Math.round(W / 2 - sw / 2 + rnd(-40, 40)), INSET + 60, W - INSET - 60 - sw);
    walls.push({ x: sx, y: Math.round(rnd(yTop + 26, yBot - 26)), w: sw, h: WT });
  }

  // Start above the first band; goal below the last, near its gate exit.
  const start = { x: Math.round(rnd(34, 60)), y: 60 };
  const lastGate = gateCenters[gateCenters.length - 1];
  const goal = { x: Math.round(clamp(lastGate.x + rnd(-30, 30), 60, W - 60)), y: 552, r: 36 };

  // Treats: one per corridor between successive rows, with varied emojis.
  const used = new Set<string>();
  const nextEmoji = () => {
    let e = pick(TREAT_EMOJIS), guard = 0;
    while (used.has(e) && guard++ < 8) e = pick(TREAT_EMOJIS);
    used.add(e);
    return e;
  };
  const rowYs = [start.y + 30, ...bandYs, goal.y - 40];
  for (let i = 0; i < rowYs.length - 1; i++) {
    treats.push({
      x: Math.round(rnd(INSET + 24, W - INSET - 24)),
      y: Math.round((rowYs[i] + rowYs[i + 1]) / 2),
      emoji: nextEmoji(),
    });
  }

  // Traps: rejection-sample ≥40px off any treat, clear of gates/start/goal.
  const clashes = (x: number, y: number) => {
    for (const t of treats) if (Math.hypot(t.x - x, t.y - y) < 40) return true;
    for (const g of gateCenters) if (Math.hypot(g.x - x, g.y - y) < 34) return true;
    if (Math.hypot(start.x - x, start.y - y) < 46) return true;
    if (Math.hypot(goal.x - x, goal.y - y) < goal.r + 20) return true;
    return false;
  };
  for (let a = 0; traps.length < 3 && a < 60; a++) {
    const x = Math.round(rnd(INSET + 30, W - INSET - 30));
    const y = Math.round(rnd(topPad - 30, H - botPad + 30));
    if (!clashes(x, y)) traps.push({ x, y, r: 14 });
  }

  return { name: `🍰 ${pick(MAZE_ADJECTIVES)} ${pick(MAZE_NOUNS)}`, start, goal, walls, gates, traps, treats };
}

function pickRandomMaze(): MazeLayout {
  // Mostly fresh procedural mazes (the "50 variations" ask); ~1-in-4 rounds a
  // hand-crafted classic, so the polished designs still make an appearance.
  const layout = Math.random() < 0.25
    ? MAZES[Math.floor(Math.random() * MAZES.length)]
    : generateProceduralMaze();
  return transposeMaze(layout);
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class MarbleMazeScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: MarbleMazeSceneProps;
  /** Current layout. Picked randomly on create() and re-rolled on
   *  resetScene() so each Play Again gets a different maze. */
  private currentMaze: MazeLayout = MAZE_CAKE_TOWER;

  private marble!: Phaser.GameObjects.Container;
  private marbleSprite!: Phaser.GameObjects.Graphics;
  private walls: Phaser.GameObjects.Rectangle[] = [];
  /** Gate rect + whether it's been solved. Solved gates have their
   *  static body disabled so the marble passes through. */
  private gates: Array<{
    rect: Phaser.GameObjects.Rectangle;
    def: GateDef;
    solved: boolean;
  }> = [];
  /** Invisible physics zones — the visual trap objects are decorative only */
  private trapZones: Phaser.GameObjects.Arc[] = [];
  /** Collectible treats with their physics zones and current-state flag.
   *  Once collected, the zone is disabled so repeat overlaps don't fire. */
  private treats: Array<{
    zone: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
    def: TreatDef;
    collected: boolean;
  }> = [];
  private treatsCollected = 0;
  private goalZone!: Phaser.GameObjects.Arc;
  private goalFx!: Phaser.GameObjects.Arc;

  // Tilt state
  private tiltEnabled = false;
  private tiltBeta = 0;
  private tiltGamma = 0;
  private tiltBaselineBeta = 0;
  private tiltBaselineGamma = 0;
  private tiltListener?: (e: DeviceOrientationEvent) => void;
  /** Re-captures the tilt baseline whenever the iPad rotates so the
   *  marble doesn't shoot off in the old axis direction. */
  private orientationListener?: () => void;

  // Pointer-drag fallback
  private pointerActive = false;
  private pointerX = VIEW_W / 2;
  private pointerY = VIEW_H / 2;

  // Session state
  private started = false;
  private paused = false;
  private dead = false;
  private lives = MAX_LIVES;
  private immuneUntil = 0;
  private wrongAnswers = 0;
  private gatesOpened = 0;
  private sessionStart = 0;
  private pendingGate: GateDef | null = null;
  // Tracks which kind of challenge the host modal is currently resolving.
  //   'gate'      — gate unlock; wrong bounces marble back, no life lost
  //   'lifesaver' — cake-hole fall; correct refunds the life
  //   null        — no modal open
  private pendingChallengeKind: 'gate' | 'lifesaver' | null = null;

  // HUD
  private livesText!: Phaser.GameObjects.Text;
  private hudText!: Phaser.GameObjects.Text;
  private timerBadge!: TimerHandle;
  private startHint?: Phaser.GameObjects.Text;
  private startHintSub?: Phaser.GameObjects.Text;

  // Round timer — pause-aware. pauseStartedAt > 0 while the math modal
  // is up; pauseMs accumulates total paused time so the timer only
  // counts active gameplay.
  private pauseStartedAt = 0;
  private pauseMs = 0;
  private lastTickSec = -1;

  constructor() {
    super(MARBLE_MAZE_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as MarbleMazeSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.tiltEnabled = Boolean(this.sceneProps.tiltEnabled);
    // Calibration step (MarbleMazeCalibration.tsx) captures these while
    // the kid holds the iPad flat and taps "Start". Apply them up front
    // so the very first physics frame has the right zero. Falls back to
    // 0 for drag mode where baselines are null.
    this.tiltBaselineGamma = this.sceneProps.tiltBaselineGamma ?? 0;
    this.tiltBaselineBeta  = this.sceneProps.tiltBaselineBeta  ?? 0;
    this.sessionStart = Date.now();
    this.currentMaze = pickRandomMaze();

    // No gravity — tilt (or drag) drives acceleration manually.
    this.physics.world.gravity.set(0, 0);
    this.physics.world.setBounds(0, 0, VIEW_W, VIEW_H);

    this.drawBackground();
    this.drawDecor();
    this.buildWalls();
    this.buildGates();
    this.buildGoal();
    this.buildTraps();
    this.buildTreats();
    this.drawPathHints();
    this.createMarble();
    this.drawHud();
    this.drawStartHint();

    this.installInput();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private drawBackground(): void {
    // Cake bands + sprinkle confetti from the shared theme module.
    drawCakeBands(this, { viewW: VIEW_W, viewH: VIEW_H });
    drawSprinkles(this, {
      bounds: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
      count: 52,
      seed: 0xCAFE_42,
      alpha: 0.5,
    });
  }

  private drawDecor(): void {
    const start = this.currentMaze.start;
    const goal = this.currentMaze.goal;
    // Cake emoji anchors to reinforce the theme
    this.add.text(start.x, 20, '🎂', { fontSize: '18px' }).setOrigin(0.5).setDepth(2).setAlpha(0.55);
    this.add.text(goal.x,  515, '🍰', { fontSize: '18px' }).setOrigin(0.5).setDepth(2).setAlpha(0.5);
    // Scattered sparkles in the corners
    for (const [tx, ty] of [[372, 28], [28, 560], [200, 22], [372, 555]] as const) {
      this.add.text(tx, ty, '✨', { fontSize: '12px' }).setOrigin(0.5).setDepth(2).setAlpha(0.4);
    }
  }

  private buildWalls(): void {
    for (const w of this.currentMaze.walls) {
      const rect = this.add.rectangle(
        w.x + w.w / 2, w.y + w.h / 2, w.w, w.h, COLOR_WALL,
      ).setStrokeStyle(2, COLOR_WALL_EDGE).setDepth(5);
      // Frosting drizzle on top of each wall segment (theme primitive).
      drawFrostingDrizzle(this, { x: w.x, y: w.y, w: w.w });
      this.physics.add.existing(rect, true);
      this.walls.push(rect);
    }
  }

  private buildGates(): void {
    for (const g of this.currentMaze.gates) {
      const rect = this.add.rectangle(
        g.x + g.w / 2, g.y + g.h / 2, g.w, g.h, COLOR_GATE_CLOSED,
      ).setStrokeStyle(2, COLOR_WALL_EDGE).setDepth(5);
      this.physics.add.existing(rect, true);
      const lock = this.add.text(
        g.x + g.w / 2, g.y + g.h / 2, '🔒',
        { fontSize: '20px' },
      ).setOrigin(0.5).setDepth(6);
      rect.setData('lockIcon', lock);
      this.gates.push({ rect, def: g, solved: false });
    }
  }

  private buildGoal(): void {
    const goal = this.currentMaze.goal;
    // Pulsing mint ring at the goal
    this.goalFx = this.add.circle(goal.x, goal.y, goal.r + 10, COLOR_GOAL, 0)
      .setStrokeStyle(4, COLOR_GOAL).setDepth(3);
    this.tweens.add({
      targets: this.goalFx,
      scale: { from: 0.8, to: 1.25 },
      alpha: { from: 0.95, to: 0.3 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Actual target zone — needs a physics body for overlap detection
    this.goalZone = this.add.circle(goal.x, goal.y, goal.r, COLOR_GOAL, 0.45)
      .setStrokeStyle(3, COLOR_GOAL).setDepth(4);
    this.physics.add.existing(this.goalZone, true);
    this.add.text(goal.x, goal.y, '⭐', { fontSize: '40px' })
      .setOrigin(0.5).setDepth(5);
  }

  private buildTreats(): void {
    for (const t of this.currentMaze.treats) {
      // Decorative emoji
      const text = this.add.text(t.x, t.y, t.emoji, { fontSize: '22px' })
        .setOrigin(0.5).setDepth(4);
      // Gentle float animation so treats read as "collectible"
      this.tweens.add({
        targets: text,
        y: { from: t.y - 2, to: t.y + 2 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // Invisible physics zone for overlap detection
      const zone = this.add.circle(t.x, t.y, 16, 0x000000, 0).setDepth(4);
      this.physics.add.existing(zone, true);
      this.treats.push({ zone, text, def: t, collected: false });
    }
  }

  private buildTraps(): void {
    for (const t of this.currentMaze.traps) {
      // Visual: dark swirling hole with violet ring
      this.add.circle(t.x, t.y, t.r, COLOR_TRAP, 1).setDepth(4);
      const ring = this.add.circle(t.x, t.y, t.r + 5, COLOR_TRAP_RING, 0)
        .setStrokeStyle(3, COLOR_TRAP_RING).setDepth(4);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.8, to: 1.15 },
        alpha: { from: 0.6, to: 1 },
        duration: 750 + Math.random() * 250,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.add.text(t.x, t.y, '🌀', { fontSize: '16px' }).setOrigin(0.5).setDepth(5);

      // Invisible physics zone — SHRUNK from t.r to t.r*0.55 (kid ticket
      // ticket May 2: "cake holes are too sensitive"). The visual ring
      // tells the kid where the danger is, but the marble has to actually
      // roll near the center to fall in — no more glancing brushes.
      const zone = this.add.circle(t.x, t.y, t.r * 0.55, 0x000000, 0).setDepth(4);
      this.physics.add.existing(zone, true);
      this.trapZones.push(zone);
    }
  }

  private drawPathHints(): void {
    // No hardcoded arrow positions — they don't generalize across the
    // three maze layouts. Kids find the path through treat breadcrumbs
    // and a quick scan of the gate locks instead.
  }

  private createMarble(): void {
    const start = this.currentMaze.start;
    this.marbleSprite = this.add.graphics();
    this.drawMarble(this.marbleSprite);
    this.marble = this.add.container(start.x, start.y, [this.marbleSprite])
      .setDepth(10);
    this.marble.setSize(MARBLE_RADIUS * 2, MARBLE_RADIUS * 2);

    this.physics.world.enable(this.marble);
    const body = this.marble.body as Phaser.Physics.Arcade.Body;
    body.setCircle(MARBLE_RADIUS, -MARBLE_RADIUS, -MARBLE_RADIUS);
    body.setBounce(MARBLE_BOUNCE, MARBLE_BOUNCE);
    body.setCollideWorldBounds(true);
    body.setDrag(MARBLE_DRAG, MARBLE_DRAG);
    body.setMaxVelocity(MARBLE_MAX_SPEED, MARBLE_MAX_SPEED);

    for (const w of this.walls) this.physics.add.collider(this.marble, w);
    for (const g of this.gates) {
      this.physics.add.collider(this.marble, g.rect, () => this.onGateTouched(g));
    }

    // Trap overlaps — immune window prevents draining all lives in one frame
    for (const zone of this.trapZones) {
      this.physics.add.overlap(this.marble, zone, () => {
        if (!this.started || this.paused || this.dead) return;
        if (this.time.now < this.immuneUntil) return;
        this.onTrap();
      });
    }

    // Treat overlaps — collect on contact. One fire per treat via `collected`.
    for (const t of this.treats) {
      this.physics.add.overlap(this.marble, t.zone, () => {
        if (t.collected || this.paused || this.dead) return;
        this.onCollectTreat(t);
      });
    }

    // Goal overlap — win detection
    this.physics.add.overlap(this.marble, this.goalZone, () => this.onGoal());
  }

  private onCollectTreat(t: {
    zone: Phaser.GameObjects.Arc;
    text: Phaser.GameObjects.Text;
    def: TreatDef;
    collected: boolean;
  }): void {
    t.collected = true;
    const zoneBody = t.zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (zoneBody) zoneBody.enable = false;
    this.treatsCollected++;
    this.refreshHud();
    this.emitSfx('correct');

    // Pop + fade the emoji
    this.tweens.add({
      targets: t.text,
      scale: { from: 1, to: 1.8 },
      alpha: { from: 1, to: 0 },
      y: t.text.y - 24,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => t.text.destroy(),
    });

    sparkleAt(this, t.def.x, t.def.y, { count: 5, spread: 20, fontSize: 12, rise: 18 });
  }

  private drawMarble(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    // Shadow
    g.fillStyle(0x7f1d1d, 0.4).fillCircle(2, 2, MARBLE_RADIUS);
    // Body
    g.fillStyle(COLOR_MARBLE, 1).fillCircle(0, 0, MARBLE_RADIUS);
    // Highlight
    g.fillStyle(COLOR_MARBLE_HILITE, 0.85).fillCircle(-4, -5, MARBLE_RADIUS * 0.45);
    // Tiny white glint
    g.fillStyle(0xffffff, 0.9).fillCircle(-5, -6, 1.8);
  }

  private drawHud(): void {
    this.livesText = this.add.text(12, 10, this.hudLivesString(), {
      fontSize: '18px',
    }).setDepth(50);

    this.hudText = this.add.text(12, 34, this.hudGatesString(), {
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#7f1d1d',
    }).setDepth(50);

    // Round timer top-right (replaces the static maze-name label — kids
    // don't need to know which random layout they're on, but they DO
    // need to see how much time is left).
    this.timerBadge = drawTimerBadge(this, {
      anchor: 'tr',
      viewW: VIEW_W,
      initialValue: '3:00',
    });
  }

  private hudLivesString(): string {
    let s = '';
    for (let i = 0; i < MAX_LIVES; i++) s += i < this.lives ? '❤️' : '🖤';
    return s;
  }

  private hudGatesString(): string {
    const total = this.gates.length;
    const mode = this.tiltEnabled ? '🎯 Tilt' : '👆 Drag';
    const treatStr = this.treats.length > 0
      ? `  ·  🧁 ${this.treatsCollected}/${this.treats.length}`
      : '';
    return `${mode}  ·  Gates ${this.gatesOpened}/${total}${treatStr}`;
  }

  private refreshHud(): void {
    this.livesText.setText(this.hudLivesString());
    this.hudText.setText(this.hudGatesString());
  }

  private drawStartHint(): void {
    this.startHint = this.add.text(
      VIEW_W / 2, VIEW_H / 2,
      this.tiltEnabled ? 'Hold iPad flat' : 'Drag the marble',
      { fontSize: '22px', fontStyle: 'bold', color: '#7f1d1d' },
    ).setOrigin(0.5).setDepth(60);

    this.startHintSub = this.add.text(
      VIEW_W / 2, VIEW_H / 2 + 28,
      'Watch out for 🌀 cake holes!',
      { fontSize: '13px', color: '#7f1d1d' },
    ).setOrigin(0.5).setDepth(60);
  }

  private installInput(): void {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    if (this.tiltEnabled && typeof window !== 'undefined') {
      this.tiltListener = (e: DeviceOrientationEvent) => {
        if (e.beta  !== null) this.tiltBeta  = e.beta;
        if (e.gamma !== null) this.tiltGamma = e.gamma;
      };
      window.addEventListener('deviceorientation', this.tiltListener);

      // Rotate the iPad → gamma/beta axes swap meaning. Without a re-
      // baseline, the marble either freezes (kid holds flat in new
      // orientation but deltas now read ±90°) or shoots off in the old
      // axis direction. Capturing a fresh zero after the browser settles
      // restores expected "hold flat, marble still" behavior.
      this.orientationListener = () => {
        // Small delay lets the OS finish dispatching the rotated pose
        // before we sample — otherwise we bake in mid-rotation gyro noise.
        this.time.delayedCall(180, () => {
          this.tiltBaselineBeta = this.tiltBeta;
          this.tiltBaselineGamma = this.tiltGamma;
        });
      };
      window.addEventListener('orientationchange', this.orientationListener);
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.dead) return;

    if (!this.started) {
      this.started = true;
      this.startHint?.destroy();
      this.startHint = undefined;
      this.startHintSub?.destroy();
      this.startHintSub = undefined;
      // Baseline already captured in the calibration step — don't re-snap
      // here. The kid is mid-tap-reach right now, so their iPad is rarely
      // at the angle they intend to play at.
      this.runCountdown(() => {
        // Round officially begins when the countdown completes.
        this.sessionStart = Date.now();
        this.pauseMs = 0;
        this.pauseStartedAt = 0;
        this.lastTickSec = -1;
      });
      return;
    }

    this.pointerActive = true;
    this.pointerX = pointer.x;
    this.pointerY = pointer.y;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.pointerActive) return;
    this.pointerX = pointer.x;
    this.pointerY = pointer.y;
  }

  private onPointerUp(): void {
    this.pointerActive = false;
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (!this.started || this.paused || this.dead) return;
    const dt = delta / 1000;

    const body = this.marble.body as Phaser.Physics.Arcade.Body;

    let ax = 0;
    let ay = 0;

    if (this.tiltEnabled) {
      const dg = this.tiltGamma - this.tiltBaselineGamma;
      const db = this.tiltBeta - this.tiltBaselineBeta;
      if (Math.abs(dg) > TILT_DEADZONE_DEG) ax = dg * TILT_SENSITIVITY;
      if (Math.abs(db) > TILT_DEADZONE_DEG) ay = db * TILT_SENSITIVITY;
    }

    if (this.pointerActive) {
      const dx = this.pointerX - this.marble.x;
      const dy = this.pointerY - this.marble.y;
      const len = Math.hypot(dx, dy) || 1;
      ax += (dx / len) * DRAG_PULL_K;
      ay += (dy / len) * DRAG_PULL_K;
    }

    body.setAcceleration(ax, ay);
    void dt;

    // Round timer — only ticks during active play. pauseMs is subtracted
    // so math gates (and the lifesaver modal) don't burn round time.
    const elapsed = Date.now() - this.sessionStart - this.pauseMs;
    const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
    this.timerBadge.setMs(remaining);
    if (remaining <= TICK_LAST_MS) {
      this.timerBadge.setWarning(true);
      const sec = Math.floor(remaining / 1000);
      if (sec !== this.lastTickSec && sec >= 0) {
        this.lastTickSec = sec;
        this.emitSfx('tick');
      }
    }
    if (remaining <= 0) {
      this.endSession(true);
    }
  }

  // -------------------------------------------------------------------------
  // Gate + goal + trap handling
  // -------------------------------------------------------------------------

  private onGateTouched(gate: { rect: Phaser.GameObjects.Rectangle; def: GateDef; solved: boolean }): void {
    if (gate.solved) return;
    if (this.paused || this.pendingGate !== null) return;
    this.pendingGate = gate.def;
    this.openGateChallenge();
  }

  private openGateChallenge(): void {
    this.paused = true;
    this.pauseStartedAt = Date.now();
    this.pendingChallengeKind = 'gate';
    const body = this.marble.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);

    const challenge: Challenge = generateChallengeForMode(
      this.sceneProps.challengeMode ?? 'math',
      { tier: this.sceneProps.tier, mathType: this.sceneProps.mathType },
    );
    
    this.emitSfx('tap');
    this.hostBus.emit('challenge:open', {
      challenge,
      reason: '🔒 Gate locked — solve to open',
    });
  }

  /** Cake-hole recovery (kid ticket Apr 23: "if you lose you can
   *  answer a math question"). Runs after life decrement + visual flash —
   *  correct answer refunds the life so the kid can come back even from 0.
   *  Wrong answer at 0 lives ends the session; wrong with lives left just
   *  respawns at start with normal immunity. */
  private openLifesaverChallenge(): void {
    this.paused = true;
    this.pauseStartedAt = Date.now();
    this.pendingChallengeKind = 'lifesaver';
    this.pointerActive = false; // force re-tap so marble doesn't bolt on resume

    const body = this.marble.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);

    const challenge: Challenge = generateChallengeForMode(
      this.sceneProps.challengeMode ?? 'math',
      { tier: this.sceneProps.tier, mathType: this.sceneProps.mathType },
    );
    
    this.hostBus.emit('challenge:open', {
      challenge,
      reason: '❤️ Save your marble! Answer to keep rolling.',
    });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const kind = this.pendingChallengeKind;
    this.pendingChallengeKind = null;
    if (kind === 'lifesaver') {
      this.handleLifesaverResult(payload.correct);
      return;
    }
    if (kind !== 'gate' || this.pendingGate === null) return;

    const gateId = this.pendingGate.id;
    const gate = this.gates.find((g) => g.def.id === gateId);
    this.pendingGate = null;

    if (!gate) {
      this.accumulatePauseAndResume();
      return;
    }

    if (payload.correct) {
      const gbody = gate.rect.body as Phaser.Physics.Arcade.StaticBody;
      gbody.enable = false;
      gate.solved = true;
      gate.rect.setFillStyle(COLOR_GATE_OPEN, 0.35);
      const lock = gate.rect.getData('lockIcon') as Phaser.GameObjects.Text | undefined;
      if (lock) {
        this.tweens.add({
          targets: lock,
          alpha: 0,
          y: lock.y - 14,
          duration: 400,
          onComplete: () => lock.destroy(),
        });
      }
      this.gatesOpened++;
      this.refreshHud();
      this.emitSfx('correct');
      this.accumulatePauseAndResume();
    } else {
      this.wrongAnswers++;
      this.emitSfx('wrong');
      const body = this.marble.body as Phaser.Physics.Arcade.Body;
      const dx = this.marble.x - (gate.def.x + gate.def.w / 2);
      const dy = this.marble.y - (gate.def.y + gate.def.h / 2);
      const len = Math.hypot(dx, dy) || 1;
      body.setVelocity((dx / len) * 180, (dy / len) * 180);
      this.accumulatePauseAndResume();
    }
  }

  /** Roll the time spent in the math modal into pauseMs and clear the
   *  start marker. Called whenever the modal closes. */
  private accumulatePauseAndResume(): void {
    if (this.pauseStartedAt > 0) {
      this.pauseMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.paused = false;
  }

  private handleLifesaverResult(correct: boolean): void {
    if (correct) {
      this.lives++;            // refund the life lost in onTrap
      this.refreshHud();
      this.emitSfx('correct');
      this.accumulatePauseAndResume();
      this.respawnAtStart();
      return;
    }
    // Wrong answer.
    this.wrongAnswers++;
    this.emitSfx('wrong');
    if (this.lives <= 0) {
      this.endSession(false);
      return;
    }
    // Lives remaining — respawn and keep rolling.
    this.accumulatePauseAndResume();
    this.respawnAtStart();
  }

  /** Unified session-end emit. Snapshots pauseMs (so any in-flight modal
   *  pause is rolled into session_ms) and emits with the given completed
   *  flag. completed=true → reached goal OR survived the full 3 min;
   *  completed=false → lives ran out. */
  private endSession(completed: boolean): void {
    if (this.dead) return;
    this.dead = true;
    if (this.pauseStartedAt > 0) {
      this.pauseMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.paused = false;
    const body = this.marble.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    const summary = buildSessionSummary({
      score: this.gatesOpened,
      wrongAnswers: this.wrongAnswers,
      sessionStart: this.sessionStart,
      completed,
      optimalTaps: this.gates.length,
    });
    this.hostBus.emit('session:end', { summary });
  }

  /** Reset marble position + grant immunity + run countdown before play
   *  resumes. Used by both the lifesaver-correct and lifesaver-wrong-but-
   *  still-alive branches so the kid always gets a moment of breathing room
   *  before the trap zones re-arm. */
  private respawnAtStart(): void {
    const body = this.marble.body as Phaser.Physics.Arcade.Body;
    const start = this.currentMaze.start;
    this.marble.setPosition(start.x, start.y);
    body.setVelocity(0, 0);
    body.setAcceleration(0, 0);
    this.immuneUntil = this.time.now + IMMUNITY_MS;

    // Blink marble to signal the immunity window
    this.tweens.add({
      targets: this.marble,
      alpha: { from: 0.25, to: 1 },
      duration: 180,
      repeat: 6,
      yoyo: true,
      ease: 'Linear',
      onComplete: () => { this.marble.setAlpha(1); },
    });

    // Countdown clears `paused` itself when it hits GO.
    this.runCountdown(() => { /* live */ });
  }

  private onTrap(): void {
    this.loseLife();
  }

  /** Cake-hole life loss — decrement, flash, then open the lifesaver math
   *  challenge. Respawn happens in handleLifesaverResult so the marble
   *  can't roll into another trap during the modal. */
  private loseLife(): void {
    this.lives--;
    this.refreshHud();
    this.emitSfx('escape');
    this.showLifeLost();
    this.openLifesaverChallenge();
  }

  private showLifeLost(): void {
    // Dark purple flash (matches trap color)
    const flash = this.add.rectangle(
      VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, COLOR_TRAP,
    ).setAlpha(0.5).setDepth(80);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const banner = this.add.text(VIEW_W / 2, VIEW_H / 2, '🌀 Fell in!', {
      fontSize: '48px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(90).setScale(0.4);
    banner.setShadow(0, 3, '#1e1b4b', 12, true, true);
    this.tweens.add({
      targets: banner,
      scale: 1.2,
      y: VIEW_H / 2 - 65,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => banner.destroy(),
    });

    this.cameras.main.shake(260, 0.01);
  }

  private onGoal(): void {
    if (this.dead) return;
    this.emitSfx('win');
    this.endSession(true);
  }

  // -------------------------------------------------------------------------
  // Countdown
  // -------------------------------------------------------------------------

  private runCountdown(onComplete: () => void): void {
    this.paused = true;
    const text = this.add.text(VIEW_W / 2, VIEW_H / 2, '', {
      fontSize: '100px',
      fontStyle: 'bold',
      color: '#7f1d1d',
    }).setOrigin(0.5).setDepth(100);

    let i = 0;
    const tick = (): void => {
      text.setText(COUNTDOWN_STEPS[i]);
      text.setScale(0.4).setAlpha(1);
      this.emitSfx(i === COUNTDOWN_STEPS.length - 1 ? 'start' : 'tick');
      this.tweens.add({
        targets: text,
        scale: 1.2,
        alpha: 0,
        duration: COUNTDOWN_STEP_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          i++;
          if (i < COUNTDOWN_STEPS.length) tick();
          else {
            text.destroy();
            this.paused = false;
            onComplete();
          }
        },
      });
    };
    tick();
  }

  // -------------------------------------------------------------------------
  // Reset + cleanup
  // -------------------------------------------------------------------------

  private resetScene(): void {
    // Use scene.restart() rather than an in-place rebuild so create() re-
    // rolls a new random maze and we get genuine variety on Play Again
    // (kid ticket: "different map mazes / more designs"). The
    // SHUTDOWN handler cleans up listeners; create() reattaches them
    // and picks a new layout from the MAZES array.
    this.scene.restart();
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
    if (typeof window !== 'undefined') {
      if (this.tiltListener) {
        window.removeEventListener('deviceorientation', this.tiltListener);
        this.tiltListener = undefined;
      }
      if (this.orientationListener) {
        window.removeEventListener('orientationchange', this.orientationListener);
        this.orientationListener = undefined;
      }
    }
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}
