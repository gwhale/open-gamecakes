// Cakey Castle Jump — a vertical, bouncy climb up Cakey's layer-cake castle.
//
// Concept (from the founding kids' hand-drawn board, 2026-07):
//   - Start at the BOTTOM of the castle, climb to the TOP. One screen; the
//     world scrolls down as Cakey rises (Doodle-Jump camera).
//   - Cakey auto-bounces (gravity + a spring off every platform) — that
//     "bounce and gravity vibe, like Mario but vertical." The kid TAPS or
//     HOLDS the left / right half of the screen to steer between platforms.
//   - Platform kinds:
//       normal  — plain frosting ledge, gives the standard bounce
//       spring  — coil; launches Cakey way up (bonus)
//       spike   — landing on it drops Cakey through + costs a life ("if you
//                 land on the spikes you fall down off of it")
//       moving  — drifts side to side (harder tiers)
//       gate    — a full-width barrier with a math button. You CAN'T climb
//                 past without solving it, and a "clear zone" above means a
//                 normal bounce falls back onto the gate — only a correct
//                 answer's spring launch clears it. Gate problems get harder
//                 the higher you climb.
//   - ⭐ stars float between platforms for bonus points.
//   - 🐦 birds / 🪰 dragonflies fly across; touching one knocks Cakey down
//     and costs a life ("you got to jump out of its way").
//   - 3 lives (hearts). Spikes, critters, and falling off the bottom each
//     cost one. Gate problems never cost a life — a wrong answer just drops
//     you back onto the gate to try again.
//
// Difficulty of the MATH scales with height: each gate is generated at a
// tier of (baseTier + gates cleared), clamped to 10, so problems get harder
// as the castle gets taller — exactly what the kids asked for.
//
// Talks to the React host only through the injected EventEmitter
// (`game.registry.get('hostBus')`). The host owns the challenge modal, the
// session clock (hostTimer), and the /api/attempts POST — this scene just
// emits events.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import { buildSessionSummary, type SoundName } from '@/lib/games/phaser/session';
import {
  CASTLE_JUMP_SCENE_KEY,
  CASTLE_JUMP_VIEW_W,
  CASTLE_JUMP_VIEW_H,
  type CastleJumpDifficulty,
  type CastleJumpSceneProps,
} from './CastleJumpScene.factory';
import {
  CAKE,
  CSS,
  SKY,
  drawSkyBands,
  drawCakeySun,
  drawCakeyCloud,
  drawScoreBadge,
  drawLivesRow,
  sparkleAt,
  floatScore,
  bigHitFx,
  confettiBurst,
  type BadgeHandle,
  type LivesHandle,
} from '@/lib/games/theme';

const VIEW_W = CASTLE_JUMP_VIEW_W;
const VIEW_H = CASTLE_JUMP_VIEW_H;

// --- Cakey (the hero) ---
const CAKE_W = 34;
const CAKE_H = 42;

// --- Platforms ---
const PLAT_H = 16;
const PLAT_W = 94;
const GATE_W = VIEW_W - 24; // gates span (almost) the full width — unavoidable

// The camera scroll line: whenever Cakey rises above this screen-y, the
// whole world shifts down to keep him here and the climb counter grows.
const SCROLL_LINE = VIEW_H * 0.42;

// Vertical "floor" size — every FLOOR_PX of climb is one castle floor, shown
// in the HUD and used to scale the ambient decor.
const FLOOR_PX = 140;

// Clear zone above a gate: no platform spawns within this gap, so a normal
// bounce can't carry Cakey past an unsolved gate — only the correct-answer
// spring launch (tuned to clear GATE_CLEAR + margin) gets him up.
const GATE_CLEAR = 190;

// Generated-height spacing between gates (in px of platform ladder built).
// Tuned so the first gate shows up within the first ~30s of a climb — the
// math is the point, so kids should meet it quickly.
const GATE_GEN_SPACING = 470;
// The castle has NO summit. It used to end after 4 gates, which arrived inside
// a couple of minutes and then stopped the game dead with a "you reached the
// top!" card — too soon, and a terminal state a kid could get stuck staring at.
// The climb is endless now: gates keep coming, the tier keeps rising, and the
// score is how high you got. Nothing to finish means nothing to hang on.
//
// Every MILESTONE_FLOORS floors is celebrated instead, so "getting somewhere"
// is a thing that keeps happening rather than a thing that happens once.
const MILESTONE_FLOORS = 10;
const MILESTONE_POINTS = 50;

// Points
const STAR_POINTS = 15;
const GATE_POINTS = 60;
const FLOOR_POINTS = 2;

const IMMUNITY_MS = 1600;

interface CastleTuning {
  gravity: number;
  steerVx: number;
  gapMin: number;
  gapMax: number;
  enemyChance: number;   // per non-gate platform spawned
  springChance: number;
  spikeChance: number;
  movingChance: number;
}

const DIFFICULTY_TUNING: Record<CastleJumpDifficulty, CastleTuning> = {
  easy:   { gravity: 1000, steerVx: 235, gapMin: 74,  gapMax: 120, enemyChance: 0.08, springChance: 0.20, spikeChance: 0.04, movingChance: 0.00 },
  medium: { gravity: 1120, steerVx: 268, gapMin: 80,  gapMax: 132, enemyChance: 0.15, springChance: 0.16, spikeChance: 0.10, movingChance: 0.12 },
  hard:   { gravity: 1260, steerVx: 300, gapMin: 88,  gapMax: 146, enemyChance: 0.24, springChance: 0.12, spikeChance: 0.16, movingChance: 0.22 },
};

const DEFAULT_DIFFICULTY: CastleJumpDifficulty = 'medium';

type PlatformKind = 'normal' | 'spring' | 'spike' | 'moving' | 'gate';

interface Platform {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  w: number;
  kind: PlatformKind;
  vx: number;             // moving platforms only
  solved: boolean;        // gates only — true once the math is answered right
  chain?: Phaser.GameObjects.Container; // gate lock visual, cleared on solve
  gateTier?: number;      // gates only — math tier for this gate
}

interface Star {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  taken: boolean;
}

interface Enemy {
  c: Phaser.GameObjects.Container;
  x: number;
  y: number;
  vx: number;
}

export class CastleJumpScene extends Phaser.Scene {
  // injected
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: CastleJumpSceneProps;
  private tuning: CastleTuning = DIFFICULTY_TUNING[DEFAULT_DIFFICULTY];

  // derived bounce velocities (computed in create from gravity + gaps)
  private bounceVel = -600;
  private springVel = -960;
  private gateSpringVel = -840;

  // hero
  private cakey!: Phaser.GameObjects.Container;
  private prevFeet = 0;

  // world objects (moved manually; only Cakey has a physics body)
  private platforms: Platform[] = [];
  private stars: Star[] = [];
  private enemies: Enemy[] = [];
  private highestPlatformY = 0; // screen-y of the topmost platform
  private genClimb = 0;         // total ladder height generated (px)
  private nextGateGen = GATE_GEN_SPACING;
  private gatesSpawned = 0;
  private forceClearNext = false; // force a big gap after a gate
  // Next rung must be the spike half of a spring→spike pair (see spawnNextPlatform).
  private pendingSpike = false;

  // parallax backdrop (crenellation strip that scrolls with the climb)
  private wallStrip!: Phaser.GameObjects.TileSprite | Phaser.GameObjects.Graphics;
  private wallOffset = 0;

  // state
  private steerDir: -1 | 0 | 1 = 0;
  private climbPx = 0;
  private maxClimbPx = 0;
  private lastMilestone = 0;   // highest floor milestone already celebrated
  private points = 0;
  private starCount = 0;
  private gatesPassed = 0;    // correct gate answers → summary "score"
  private wrongAnswers = 0;
  private lives = 3;
  private immuneUntil = 0;
  private paused = false;      // true while the math modal is up
  private ended = false;
  private sessionStart = 0;
  private activeGate: Platform | null = null;
  private startHint?: Phaser.GameObjects.Text;

  // HUD
  private scoreBadge!: BadgeHandle;
  private livesRow!: LivesHandle;
  private floorBadge!: Phaser.GameObjects.Text;

  constructor() {
    super(CASTLE_JUMP_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as CastleJumpSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.tuning = DIFFICULTY_TUNING[this.sceneProps.difficulty ?? DEFAULT_DIFFICULTY];
    this.sessionStart = Date.now();

    // Derive bounce velocities so reachability is guaranteed by construction:
    // a normal bounce always clears the largest gap; the gate spring always
    // clears the gate's clear-zone.
    const g = this.tuning.gravity;
    this.bounceVel = -Math.sqrt(2 * g * (this.tuning.gapMax + 26));
    this.springVel = -Math.sqrt(2 * g * (this.tuning.gapMax * 2.4));
    this.gateSpringVel = -Math.sqrt(2 * g * (GATE_CLEAR + 130));

    this.physics.world.gravity.set(0, g);

    this.drawBackdrop();
    this.buildInitialLadder();
    this.createCakey();
    this.drawHud();
    this.drawStartHint();
    this.installInput();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    this.hostBus.on('scene:timeUp', this.onTimeUp, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Backdrop — sky at the very top, a scrolling castle-brick wall below it,
  // plus Cakey's sun + a drifting cloud so the top of the climb feels airy.
  // -------------------------------------------------------------------------

  private drawBackdrop(): void {
    // Base sky fill behind everything.
    this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, SKY.MID).setDepth(-20);
    drawSkyBands(this, { viewW: VIEW_W, topH: 150, midH: 150, lowH: 120, depth: -20 });

    // Castle wall — a repeating strawberry-brick strip drawn once into a
    // Graphics texture-ish band. We scroll it by redrawing the offset in
    // update(); cheap enough for one column.
    this.wallStrip = this.add.graphics().setDepth(-15);
    this.redrawWall();

    drawCakeySun(this, VIEW_W - 74, 74, { depth: -10 });
    drawCakeyCloud(this, { x: 120, y: 130, scale: 0.8, driftSpeedSec: 20, viewW: VIEW_W, depth: -10 });
  }

  /** Redraw the parallax brick wall at the current wallOffset. Bricks are a
   *  simple strawberry/vanilla running-bond pattern with battlement teeth up
   *  the sides so the whole screen reads "inside a layer-cake castle." */
  private redrawWall(): void {
    const g = this.wallStrip as Phaser.GameObjects.Graphics;
    g.clear();
    const brickH = 34;
    const brickW = 70;
    const off = this.wallOffset % brickH;
    for (let row = -1; row * brickH < VIEW_H + brickH; row++) {
      const y = row * brickH + off;
      const stagger = row % 2 === 0 ? 0 : brickW / 2;
      const band = row % 2 === 0 ? 0xf9d5db : 0xf6c3cb; // alt strawberry tints
      g.fillStyle(band, 1);
      g.fillRect(0, y, VIEW_W, brickH);
      g.lineStyle(2, 0xe7a9b3, 0.6);
      for (let x = -brickW + stagger; x < VIEW_W + brickW; x += brickW) {
        g.strokeRect(x, y, brickW, brickH);
      }
    }
    // Side battlement columns for the "fortress" read.
    g.fillStyle(CAKE.VANILLA_DEEP, 0.9);
    g.fillRect(0, 0, 16, VIEW_H);
    g.fillRect(VIEW_W - 16, 0, 16, VIEW_H);
    g.fillStyle(CAKE.VANILLA, 1);
    for (let y = ((this.wallOffset % 48) - 48); y < VIEW_H; y += 48) {
      g.fillRect(0, y, 16, 22);
      g.fillRect(VIEW_W - 16, y, 16, 22);
    }
  }

  // -------------------------------------------------------------------------
  // Ladder generation
  // -------------------------------------------------------------------------

  private buildInitialLadder(): void {
    // Cakey starts a bit below the camera scroll line so the very first
    // bounce carries him across it and the climb engages immediately (no
    // "dead zone" of un-counted climbing at the bottom, Doodle-Jump style).
    const startY = Math.round(SCROLL_LINE + 120);
    // The wide, safe starting ledge, centered. Kept as platforms[0] so
    // createCakey / resetScene can spawn Cakey on top of it.
    this.highestPlatformY = startY + 1; // so the first spawn sits above it
    this.spawnPlatform(VIEW_W / 2, startY, PLAT_W + 40, 'normal');
    // A couple of forgiving ledges BELOW the start so the bottom of the
    // castle reads as solid ground and early mis-steers have a safety net.
    // (These sit lower than the start, so they don't move highestPlatformY.)
    this.spawnPlatform(VIEW_W * 0.32, startY + 90, PLAT_W, 'normal');
    this.spawnPlatform(VIEW_W * 0.72, startY + 150, PLAT_W, 'normal');
    // Fill the screen upward with a starter ladder.
    while (this.highestPlatformY > -60) this.spawnNextPlatform();
  }

  /** Spawn the next platform above the current top, choosing kind by the
   *  difficulty weights + the gate schedule. */
  private spawnNextPlatform(): void {
    let gap: number;
    if (this.forceClearNext) {
      gap = GATE_CLEAR;
      this.forceClearNext = false;
    } else {
      gap = Phaser.Math.Between(this.tuning.gapMin, this.tuning.gapMax);
    }
    this.genClimb += gap;
    const y = this.highestPlatformY - gap;

    // Gate schedule — a full-width barrier every GATE_GEN_SPACING of ladder.
    if (this.genClimb >= this.nextGateGen) {
      this.nextGateGen += GATE_GEN_SPACING;
      this.gatesSpawned++;
      this.forceClearNext = true; // next platform sits in the clear zone
      // Drop any owed spike — it would land in the gate's clear zone, where the
      // gate spring's budget (GATE_CLEAR + 130) can't also cover a rung past it.
      // The spring we already laid below is harmless on its own.
      this.pendingSpike = false;
      {
        // Gates forever. The tier still climbs with each one cleared and still
        // caps at 10, so the maths gets harder as you go without ever running
        // out of castle.
        const gt = Phaser.Math.Clamp(
          (this.sceneProps.tier ?? 1) + this.gatesPassed,
          1,
          10,
        );
        const gate = this.spawnPlatform(VIEW_W / 2, y, GATE_W, 'gate');
        gate.gateTier = gt;
      }
      return;
    }

    // Non-gate platform: weighted kind + a chance of a star and/or enemy.
    // Hazards ramp in with height so the bottom of the castle is gentle for
    // little climbers and the danger builds as they get higher.
    const floor = Math.floor(this.maxClimbPx / FLOOR_PX);
    const hazard = Phaser.Math.Clamp(floor / 5, 0.12, 1);
    const spikeCh = this.tuning.spikeChance * hazard;
    const movingCh = this.tuning.movingChance * hazard;
    const x = Phaser.Math.Between(40, VIEW_W - 40);
    let kind: PlatformKind = 'normal';
    if (this.pendingSpike) {
      // Second half of a spring→spike pair — the spring is the rung below.
      this.pendingSpike = false;
      kind = 'spike';
    } else {
      const r = Math.random();
      // A spike can't be bounced off, so clearing one means reaching the rung
      // ABOVE it — two gaps, ≥ 2×gapMin, which always exceeds the ~gapMax+26 a
      // normal bounce buys. A spike over a normal ledge is therefore a WALL:
      // Cakey bounces below it forever (the soft-lock landOn() already patches
      // for cleared gates). Only a spring reaches two rungs (gapMax×2.4), so a
      // rolled spike lays the SPRING here and takes the spike next rung. That
      // also makes back-to-back spikes structurally impossible — three rungs is
      // past even the spring's budget.
      if (r < spikeCh) {
        kind = 'spring';
        this.pendingSpike = true;
      } else if (r < spikeCh + this.tuning.springChance) kind = 'spring';
      else if (r < spikeCh + this.tuning.springChance + movingCh) kind = 'moving';
    }
    const plat = this.spawnPlatform(x, y, PLAT_W, kind);
    if (kind === 'moving') plat.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 30);

    // Star hovering above a (safe) platform.
    if (kind !== 'spike' && Math.random() < 0.5) {
      this.spawnStar(x + Phaser.Math.Between(-20, 20), y - 46);
    }
    // Flying critter drifting across near this height (also height-ramped).
    if (Math.random() < this.tuning.enemyChance * hazard) {
      this.spawnEnemy(y - Phaser.Math.Between(10, 40));
    }
  }

  private spawnPlatform(x: number, y: number, w: number, kind: PlatformKind): Platform {
    const c = this.add.container(x, y).setDepth(4);
    this.drawPlatformInto(c, w, kind);
    const plat: Platform = { c, x, y, w, kind, vx: 0, solved: false };
    if (kind === 'gate') plat.chain = this.drawGateLock(c, w);
    this.platforms.push(plat);
    if (y < this.highestPlatformY) this.highestPlatformY = y;
    return plat;
  }

  /** Draw a platform's body into its container based on kind. */
  private drawPlatformInto(c: Phaser.GameObjects.Container, w: number, kind: PlatformKind): void {
    const g = this.add.graphics();
    const half = w / 2;

    if (kind === 'gate') {
      // Full-width barrier ledge — deep strawberry with a button pad.
      g.fillStyle(CAKE.STRAWBERRY_DEEP, 1);
      g.lineStyle(3, CAKE.STRAWBERRY_DARK, 1);
      g.fillRoundedRect(-half, -PLAT_H / 2, w, PLAT_H, 5);
      g.strokeRoundedRect(-half, -PLAT_H / 2, w, PLAT_H, 5);
      // frosting drizzle highlight
      g.fillStyle(CAKE.FROSTING, 0.4);
      g.fillRect(-half + 4, -PLAT_H / 2 + 2, w - 8, 3);
      c.add(g);
      return;
    }

    // Rounded frosting ledge for the rest; color-coded by kind.
    let fill: number = CAKE.MINT;
    let stroke: number = CAKE.MINT_DARK;
    if (kind === 'spring') { fill = 0x93c5fd; stroke = 0x1d4ed8; }
    if (kind === 'moving') { fill = CAKE.VANILLA_DEEP; stroke = CAKE.AMBER_DEEP; }
    if (kind === 'spike')  { fill = 0xcbd5e1; stroke = 0x64748b; }
    g.fillStyle(fill, 1);
    g.lineStyle(2.5, stroke, 1);
    g.fillRoundedRect(-half, -PLAT_H / 2, w, PLAT_H, 6);
    g.strokeRoundedRect(-half, -PLAT_H / 2, w, PLAT_H, 6);
    g.fillStyle(CAKE.FROSTING, 0.35);
    g.fillRect(-half + 4, -PLAT_H / 2 + 2, w - 8, 3);
    c.add(g);

    if (kind === 'spring') {
      // Coil spring sitting on the ledge.
      const s = this.add.graphics();
      s.lineStyle(3, 0x1d4ed8, 1);
      for (let i = 0; i < 3; i++) s.strokeEllipse(0, -PLAT_H / 2 - 6 - i * 5, 16 - i * 2, 6);
      s.fillStyle(0x60a5fa, 1);
      s.fillRoundedRect(-12, -PLAT_H / 2 - 26, 24, 6, 3);
      c.add(s);
    }
    if (kind === 'spike') {
      // Row of spikes across the top — the "don't land here" hazard.
      const s = this.add.graphics();
      s.fillStyle(0x94a3b8, 1);
      s.lineStyle(1.5, 0x475569, 1);
      for (let x = -half + 8; x < half - 6; x += 14) {
        s.fillTriangle(x, -PLAT_H / 2, x + 7, -PLAT_H / 2 - 13, x + 14, -PLAT_H / 2);
        s.strokeTriangle(x, -PLAT_H / 2, x + 7, -PLAT_H / 2 - 13, x + 14, -PLAT_H / 2);
      }
      c.add(s);
    }
  }

  /** Gate lock — a chained calculator button spanning the gate, cleared with
   *  a break-apart tween once the kid answers correctly. */
  private drawGateLock(c: Phaser.GameObjects.Container, w: number): Phaser.GameObjects.Container {
    const lock = this.add.container(0, -PLAT_H / 2 - 20);
    const g = this.add.graphics();
    // Chain rail across the gate.
    g.lineStyle(3, 0x64748b, 1);
    g.lineBetween(-w / 2 + 8, 0, w / 2 - 8, 0);
    for (let x = -w / 2 + 14; x < w / 2 - 10; x += 18) g.strokeCircle(x, 0, 4);
    lock.add(g);
    // Calculator button in the middle.
    const pad = this.add.graphics();
    pad.fillStyle(0x334155, 1);
    pad.lineStyle(2, 0x0f172a, 1);
    pad.fillRoundedRect(-15, -16, 30, 30, 5);
    pad.strokeRoundedRect(-15, -16, 30, 30, 5);
    pad.fillStyle(0xbbf7d0, 1);
    pad.fillRoundedRect(-11, -12, 22, 9, 2);
    lock.add(pad);
    lock.add(this.add.text(0, 2, '🔒', { fontSize: '15px' }).setOrigin(0.5));
    c.add(lock);
    return lock;
  }

  private spawnStar(x: number, y: number): void {
    const c = this.add.container(x, y).setDepth(6);
    const g = this.add.graphics();
    g.fillStyle(CAKE.AMBER, 1);
    g.lineStyle(2, CAKE.AMBER_DEEP, 1);
    this.drawStarShape(g, 11, 5);
    c.add(g);
    this.tweens.add({ targets: c, angle: 360, duration: 4000, repeat: -1, ease: 'Linear' });
    this.tweens.add({ targets: c, scale: { from: 0.85, to: 1.1 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.stars.push({ c, x, y, taken: false });
  }

  private drawStarShape(g: Phaser.GameObjects.Graphics, outer: number, inner: number): void {
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private spawnEnemy(y: number): void {
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -30 : VIEW_W + 30;
    const c = this.add.container(x, y).setDepth(7);
    // A little cartoon bird/dragonfly — body + two flapping wings + beak.
    const body = this.add.ellipse(0, 0, 22, 14, 0x7c3aed);
    body.setStrokeStyle(2, 0x5b21b6);
    const wingU = this.add.triangle(0, -3, 0, 0, -16, -12, -16, 4, 0xa78bfa).setOrigin(0.5);
    const eye = this.add.circle(6, -2, 2.4, 0xffffff);
    const pupil = this.add.circle(6.6, -2, 1.1, 0x111827);
    const beak = this.add.triangle(0, 0, 10, -2, 18, 0, 10, 3, CAKE.AMBER).setOrigin(0.5);
    c.add([wingU, body, beak, eye, pupil]);
    this.tweens.add({ targets: wingU, scaleY: { from: 1, to: -1 }, duration: 160, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const vx = (fromLeft ? 1 : -1) * (55 + Math.random() * 45);
    if (!fromLeft) c.setScale(-1, 1);
    this.enemies.push({ c, x, y, vx });
  }

  // -------------------------------------------------------------------------
  // Hero
  // -------------------------------------------------------------------------

  private createCakey(): void {
    const startPlat = this.platforms[0];
    this.cakey = this.drawCakeyHero(startPlat.x, startPlat.y - CAKE_H / 2 - PLAT_H / 2);
    this.physics.world.enable(this.cakey);
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;
    body.setSize(CAKE_W * 0.8, CAKE_H * 0.85);
    body.setAllowGravity(true);
    body.setVelocityY(this.bounceVel); // start mid-bounce
    this.prevFeet = this.cakey.y + CAKE_H / 2;
  }

  /** Cakey as a cheery cupcake — wrapper, frosting swirl, cherry, face. */
  private drawCakeyHero(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y).setDepth(12);
    const g = this.add.graphics();
    // Wrapper (trapezoid).
    g.fillStyle(0xf59e0b, 1);
    g.lineStyle(2, 0xb45309, 1);
    g.beginPath();
    g.moveTo(-15, 4); g.lineTo(15, 4); g.lineTo(11, 20); g.lineTo(-11, 20);
    g.closePath(); g.fillPath(); g.strokePath();
    g.lineStyle(1.5, 0xb45309, 0.7);
    for (const wx of [-7, 0, 7]) g.lineBetween(wx, 5, wx * 0.75, 19);
    // Frosting swirl.
    g.fillStyle(CAKE.FROSTING, 1);
    g.lineStyle(2, 0xf3d9df, 1);
    g.fillCircle(0, -4, 15);
    g.fillCircle(-9, 1, 9);
    g.fillCircle(9, 1, 9);
    g.fillStyle(0xfbcfe8, 1);
    g.fillCircle(0, -9, 8);
    // Cherry on top.
    g.fillStyle(CAKE.STRAWBERRY_DEEP, 1);
    g.fillCircle(0, -18, 5);
    g.lineStyle(2, 0x166534, 1);
    g.lineBetween(0, -22, 4, -28);
    c.add(g);
    // Face.
    const f = this.add.graphics();
    f.fillStyle(0x1f2937, 1);
    f.fillCircle(-5, -3, 2);
    f.fillCircle(5, -3, 2);
    f.lineStyle(2, 0x1f2937, 1);
    f.beginPath();
    f.arc(0, 0, 4, 0.1 * Math.PI, 0.9 * Math.PI, false);
    f.strokePath();
    c.add(f);
    return c;
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  private drawHud(): void {
    this.scoreBadge = drawScoreBadge(this, { anchor: 'tl', width: 120, initialValue: '⭐ 0' });
    this.livesRow = drawLivesRow(this, { x: 150, y: 26, max: 3, initialLives: this.lives, fontSize: 20 });
    // Floor / height readout bottom-left (host clock owns the top-right).
    this.floorBadge = this.add.text(14, VIEW_H - 30, '🏰 Floor 0', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: CSS.TEXT_LIGHT,
      stroke: '#0f172a',
      strokeThickness: 3,
    }).setDepth(50);
  }

  /** Every MILESTONE_FLOORS floors, make a fuss. With no summit to arrive at,
   *  this is what keeps "I'm getting somewhere" happening — and it scales for
   *  as long as the kid keeps climbing, which a single ending never could. */
  private checkMilestone(): void {
    const floor = Math.floor(this.maxClimbPx / FLOOR_PX);
    const reached = Math.floor(floor / MILESTONE_FLOORS);
    if (reached <= this.lastMilestone) return;
    this.lastMilestone = reached;
    const at = reached * MILESTONE_FLOORS;
    this.points += MILESTONE_POINTS;
    this.emitSfx('levelUp');
    confettiBurst(this, { x: this.cakey.x, y: this.cakey.y, count: 22, spread: 90 });
    floatScore(this, {
      x: VIEW_W / 2, y: VIEW_H * 0.3,
      label: `🏰 Floor ${at}!`, color: CSS.SCORE_BULLSEYE, fontSize: 30, rise: 40,
    });
    this.refreshHud();
  }

  private refreshHud(): void {
    this.scoreBadge.setValue(`⭐ ${this.points}`);
    this.livesRow.setLives(this.lives);
    this.floorBadge.setText(`🏰 Floor ${Math.floor(this.maxClimbPx / FLOOR_PX)}`);
  }

  private drawStartHint(): void {
    this.startHint = this.add.text(
      VIEW_W / 2,
      VIEW_H * 0.66,
      'Tap LEFT or RIGHT to steer!\nBounce up to the castle top 🏰',
      {
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#1e293b',
        align: 'center',
        backgroundColor: '#ffffffcc',
        padding: { x: 14, y: 10 },
      },
    ).setOrigin(0.5).setDepth(70);
    this.time.delayedCall(3200, () => {
      this.tweens.add({
        targets: this.startHint,
        alpha: 0,
        duration: 500,
        onComplete: () => { this.startHint?.destroy(); this.startHint = undefined; },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Input — hold/tap the left or right half to steer.
  // -------------------------------------------------------------------------

  private installInput(): void {
    this.steerDir = 0;
    const setDirFromPointer = (p: Phaser.Input.Pointer): void => {
      this.steerDir = p.x < VIEW_W / 2 ? -1 : 1;
      this.startHint?.setAlpha(0.15);
    };
    this.input.on('pointerdown', setDirFromPointer);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) setDirFromPointer(p);
    });
    this.input.on('pointerup', () => { this.steerDir = 0; });
    this.input.keyboard?.on('keydown-LEFT', () => { this.steerDir = -1; });
    this.input.keyboard?.on('keydown-RIGHT', () => { this.steerDir = 1; });
    this.input.keyboard?.on('keyup-LEFT', () => { if (this.steerDir === -1) this.steerDir = 0; });
    this.input.keyboard?.on('keyup-RIGHT', () => { if (this.steerDir === 1) this.steerDir = 0; });
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (this.paused || this.ended) return;
    const dt = delta / 1000;
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;

    // Horizontal steer + screen wrap (forgiving, Doodle-Jump style).
    body.setVelocityX(this.steerDir * this.tuning.steerVx);
    if (this.cakey.x < -CAKE_W / 2) this.cakey.x = VIEW_W + CAKE_W / 2;
    else if (this.cakey.x > VIEW_W + CAKE_W / 2) this.cakey.x = -CAKE_W / 2;
    // Tilt Cakey slightly toward travel for life.
    this.cakey.setRotation(Phaser.Math.Clamp(body.velocity.x / 1400, -0.25, 0.25));

    // Scroll the world down when Cakey climbs above the scroll line.
    if (this.cakey.y < SCROLL_LINE) {
      const dy = SCROLL_LINE - this.cakey.y;
      this.cakey.y = SCROLL_LINE;
      this.scrollWorld(dy);
      this.climbPx += dy;
      if (this.climbPx > this.maxClimbPx) {
        this.maxClimbPx = this.climbPx;
        this.points = Math.max(this.points, Math.floor(this.maxClimbPx / FLOOR_PX) * FLOOR_POINTS + this.starCount * STAR_POINTS + this.gatesPassed * GATE_POINTS);
        this.refreshHud();
        this.checkMilestone();
      }
    }

    // Move platforms (moving kind) + top-of-platform bounce detection.
    const feet = this.cakey.y + CAKE_H / 2;
    for (const p of this.platforms) {
      if (p.vx !== 0) {
        p.x += p.vx * dt;
        if (p.x < 40 + p.w / 2) { p.x = 40 + p.w / 2; p.vx *= -1; }
        if (p.x > VIEW_W - 40 - p.w / 2) { p.x = VIEW_W - 40 - p.w / 2; p.vx *= -1; }
        p.c.x = p.x;
      }
      // Only land when falling and the feet cross the platform top this frame.
      if (body.velocity.y > 0) {
        const top = p.y - PLAT_H / 2;
        const withinX = Math.abs(this.cakey.x - p.x) < p.w / 2 + CAKE_W * 0.45;
        if (withinX && this.prevFeet <= top && feet >= top) {
          this.landOn(p);
          break;
        }
      }
    }
    this.prevFeet = this.cakey.y + CAKE_H / 2;

    // Move + recycle enemies; check contact.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.x += e.vx * dt;
      e.c.x = e.x;
      if (e.x < -60 || e.x > VIEW_W + 60) { e.c.destroy(); this.enemies.splice(i, 1); continue; }
      if (this.time.now > this.immuneUntil &&
          Math.abs(e.x - this.cakey.x) < 22 && Math.abs(e.y - this.cakey.y) < 24) {
        this.hitByEnemy(e);
        break;
      }
    }

    // Star pickups.
    for (const s of this.stars) {
      if (s.taken) continue;
      if (Math.abs(s.x - this.cakey.x) < 22 && Math.abs(s.y - this.cakey.y) < 24) {
        s.taken = true;
        s.c.destroy();
        this.starCount++;
        this.points += STAR_POINTS;
        this.emitSfx('catch');
        sparkleAt(this, s.x, s.y, { count: 5, spread: 18, fontSize: 14, rise: 20 });
        floatScore(this, { x: s.x, y: s.y - 10, label: `+${STAR_POINTS}`, color: CSS.SCORE_CRATE, fontSize: 20 });
        this.refreshHud();
      }
    }

    // Fell off the bottom of the screen → lose a life.
    if (this.cakey.y > VIEW_H + CAKE_H) {
      this.fellOff();
    }
  }

  /** Shift all world objects down by dy (Cakey stays at the scroll line),
   *  cull anything below the screen, and generate fresh ladder above. */
  private scrollWorld(dy: number): void {
    this.wallOffset += dy * 0.5; // parallax: wall drifts slower than platforms
    this.redrawWall();

    for (const p of this.platforms) { p.y += dy; p.c.y = p.y; }
    for (const s of this.stars) { s.y += dy; s.c.y = s.y; }
    for (const e of this.enemies) { e.y += dy; e.c.y = e.y; }
    this.highestPlatformY += dy;

    // Cull off-screen-bottom objects.
    for (let i = this.platforms.length - 1; i >= 0; i--) {
      if (this.platforms[i].y > VIEW_H + 80) {
        this.platforms[i].c.destroy();
        this.platforms.splice(i, 1);
      }
    }
    for (let i = this.stars.length - 1; i >= 0; i--) {
      if (this.stars[i].y > VIEW_H + 60) { this.stars[i].c.destroy(); this.stars.splice(i, 1); }
    }

    // Keep the ladder stocked above the top edge.
    while (this.highestPlatformY > -60) this.spawnNextPlatform();
  }

  // -------------------------------------------------------------------------
  // Landing outcomes
  // -------------------------------------------------------------------------

  private landOn(p: Platform): void {
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;

    if (p.kind === 'spike') {
      // Fall THROUGH the spikes + lose a life (no bounce).
      this.loseLife('spike', p.x, p.y);
      return;
    }

    if (p.kind === 'gate' && !p.solved) {
      this.openGateChallenge(p);
      return;
    }

    // Snap feet to the platform top so the bounce reads cleanly.
    this.cakey.y = p.y - PLAT_H / 2 - CAKE_H / 2;

    if (p.kind === 'spring') {
      body.setVelocityY(this.springVel);
      this.emitSfx('hop');
      this.squash(1.35);
      sparkleAt(this, p.x, p.y - 20, { count: 4, spread: 14, fontSize: 12, rise: 16 });
    } else if (p.kind === 'gate' && p.solved) {
      // Re-landing on an already-cleared gate: launch with the full gate-spring
      // so we clear the 190px zone above it. A normal bounce (~158px) can't
      // reach the next platform, which soft-locked the kid bouncing on the red
      // gate forever (it's full-width, so they never fell off to lose a life).
      body.setVelocityY(this.gateSpringVel);
      this.emitSfx('hop');
      this.squash(1.3);
      sparkleAt(this, p.x, p.y - 20, { count: 4, spread: 14, fontSize: 12, rise: 16 });
    } else {
      body.setVelocityY(this.bounceVel);
      this.squash(1.15);
    }
    this.prevFeet = this.cakey.y + CAKE_H / 2;
  }

  /** Little squash-and-stretch on every bounce for that springy feel. */
  private squash(sy: number): void {
    this.cakey.setScale(2 - sy, sy);
    this.tweens.add({
      targets: this.cakey,
      scaleX: 1, scaleY: 1,
      duration: 180,
      ease: 'Quad.easeOut',
    });
  }

  private openGateChallenge(gate: Platform): void {
    this.paused = true;
    this.activeGate = gate;
    // Freeze Cakey on the gate while the modal is up.
    this.cakey.y = gate.y - PLAT_H / 2 - CAKE_H / 2;
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);

    const tier = gate.gateTier ?? this.sceneProps.tier ?? 1;
    const challenge = generateChallengeForMode(this.sceneProps.challengeMode ?? 'math', {
      tier,
      mathType: this.sceneProps.mathType,
    });
    this.hostBus.emit('challenge:open', {
      challenge,
      reason: `🔒 Castle Gate ${this.gatesPassed + 1} — solve to climb!`,
    });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const gate = this.activeGate;
    this.activeGate = null;
    this.paused = false;
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);

    if (!gate) return;

    if (payload.correct) {
      gate.solved = true;
      this.gatesPassed++;
      this.points += GATE_POINTS;
      this.emitSfx('win');
      // Break the lock apart + launch Cakey up past the clear zone.
      if (gate.chain) {
        const chain = gate.chain;
        gate.chain = undefined;
        this.tweens.add({ targets: chain, y: chain.y - 30, alpha: 0, angle: 40, duration: 480, ease: 'Cubic.easeIn', onComplete: () => chain.destroy() });
      }
      bigHitFx(this, { flashMs: 90, shakeMs: 0, shakeIntensity: 0 });
      confettiBurst(this, { x: this.cakey.x, y: this.cakey.y, count: 16, spread: 60 });
      floatScore(this, { x: this.cakey.x, y: this.cakey.y - 30, label: `+${GATE_POINTS}`, color: CSS.SCORE_BULLSEYE });
      body.setVelocityY(this.gateSpringVel);
      this.squash(1.4);
      this.refreshHud();
    } else {
      // Wrong — no life lost (gates only block). Weak bounce drops Cakey
      // back onto the gate so they can try again; count it for stats.
      this.wrongAnswers++;
      this.emitSfx('wrong');
      body.setVelocityY(this.bounceVel * 0.5);
      floatScore(this, { x: this.cakey.x, y: this.cakey.y - 20, label: 'Try again!', color: '#ef4444', fontSize: 20 });
    }
    this.prevFeet = this.cakey.y + CAKE_H / 2;
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  private hitByEnemy(e: Enemy): void {
    e.c.destroy();
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    this.loseLife('enemy', this.cakey.x, this.cakey.y);
  }

  private fellOff(): void {
    if (this.time.now < this.immuneUntil) return;
    this.loseLife('fall', this.cakey.x, VIEW_H - 20);
  }

  private loseLife(cause: 'spike' | 'enemy' | 'fall', x: number, y: number): void {
    if (this.time.now < this.immuneUntil && cause !== 'spike') return;
    this.lives--;
    this.refreshHud();
    this.emitSfx('escape');
    this.flashDamage();
    if (this.lives <= 0) {
      this.endSession(false);
      return;
    }
    this.immuneUntil = this.time.now + IMMUNITY_MS;
    // Rescue: drop Cakey onto the nearest safe platform below the scroll line
    // with a fresh upward bounce + a brief blink of immunity.
    const rescue = this.nearestSafePlatform();
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;
    if (rescue) {
      this.cakey.setPosition(rescue.x, rescue.y - PLAT_H / 2 - CAKE_H / 2);
    } else {
      this.cakey.setPosition(VIEW_W / 2, SCROLL_LINE);
    }
    body.setVelocity(0, this.bounceVel);
    body.setAllowGravity(true);
    this.prevFeet = this.cakey.y + CAKE_H / 2;
    this.tweens.add({ targets: this.cakey, alpha: { from: 0.3, to: 1 }, duration: 250, repeat: 3, yoyo: true, onComplete: () => this.cakey.setAlpha(1) });
    void x; void y;
  }

  /** Nearest non-hazard platform at or below the scroll line — used to
   *  respawn Cakey after a life loss so he never lands straight onto spikes. */
  private nearestSafePlatform(): Platform | null {
    let best: Platform | null = null;
    let bestDy = Infinity;
    for (const p of this.platforms) {
      if (p.kind === 'spike') continue;
      if (p.y < SCROLL_LINE || p.y > VIEW_H - 30) continue;
      const dy = Math.abs(p.y - SCROLL_LINE);
      if (dy < bestDy) { bestDy = dy; best = p; }
    }
    return best;
  }

  private flashDamage(): void {
    const flash = this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xdc2626)
      .setAlpha(0.4).setDepth(78);
    this.tweens.add({ targets: flash, alpha: 0, duration: 320, onComplete: () => flash.destroy() });
    this.cameras.main.shake(180, 0.006);
  }

  // -------------------------------------------------------------------------
  // Session end
  // -------------------------------------------------------------------------

  private onTimeUp(): void {
    // Running the clock out IS finishing an endless climb — it is not a
    // failure to reach something. Passing `won` here meant every timed-out
    // round was recorded as incomplete.
    this.endSession(true);
  }

  private endSession(completed: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.emitSfx(completed ? 'win' : 'timeUp');
    const floor = Math.floor(this.maxClimbPx / FLOOR_PX);
    const meta: string[] = [
      `🏰 Reached floor ${floor}`,
      `⭐ ${this.starCount} stars · 🍬 ${this.points} points`,
      `🔓 ${this.gatesPassed} gates opened`,
    ];
    if (this.lastMilestone > 0) {
      meta.push(`🎉 Passed floor ${this.lastMilestone * MILESTONE_FLOORS}!`);
    }
    const summary = buildSessionSummary({
      score: this.gatesPassed,       // gates solved → drives efficiency/mastery
      wrongAnswers: this.wrongAnswers,
      sessionStart: this.sessionStart,
      completed,
      optimalTaps: this.gatesPassed,
      metaLines: meta,
    });
    this.hostBus.emit('session:end', { summary });
  }

  // -------------------------------------------------------------------------
  // Reset (Play Again)
  // -------------------------------------------------------------------------

  private resetScene(): void {
    for (const p of this.platforms) p.c.destroy();
    for (const s of this.stars) s.c.destroy();
    for (const e of this.enemies) e.c.destroy();
    this.platforms = [];
    this.stars = [];
    this.enemies = [];

    this.climbPx = 0;
    this.maxClimbPx = 0;
    this.lastMilestone = 0;
    this.points = 0;
    this.starCount = 0;
    this.gatesPassed = 0;
    this.wrongAnswers = 0;
    this.lives = 3;
    this.immuneUntil = 0;
    this.paused = false;
    this.ended = false;
    this.activeGate = null;
    this.steerDir = 0;
    this.genClimb = 0;
    this.nextGateGen = GATE_GEN_SPACING;
    this.gatesSpawned = 0;
    this.forceClearNext = false;
    this.pendingSpike = false;
    this.wallOffset = 0;
    this.sessionStart = Date.now();
    this.redrawWall();

    this.buildInitialLadder();
    const startPlat = this.platforms[0];
    this.cakey.setPosition(startPlat.x, startPlat.y - CAKE_H / 2 - PLAT_H / 2);
    this.cakey.setAlpha(1).setRotation(0).setScale(1);
    const body = this.cakey.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setVelocity(0, this.bounceVel);
    this.prevFeet = this.cakey.y + CAKE_H / 2;

    this.refreshHud();
    this.drawStartHint();
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
    this.hostBus?.off('scene:timeUp', this.onTimeUp, this);
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}
