// Meringue Downhill — a Ski Free-style game, Gamecakes "cakey" edition.
//
// The skier IS the kid's Cakey Store cupcake (drawCupcake). Movement follows
// real Ski Free momentum physics rather than a fixed side-scroll:
//
//   • The cupcake has a HEADING (which way it points, from the fall line) and
//     a SPEED. Gravity accelerates it DOWN THE FALL LINE by accel·cos(heading);
//     drag caps it at a terminal speed. Drag your finger left/right to aim the
//     heading — point straight down to tuck and BUILD SPEED, carve sideways to
//     dodge (trading descent speed for lateral movement).
//   • The world scrolls at the DOWNHILL component (speed·cos(heading)); the
//     lateral component (speed·sin(heading)) slides the skier across the run.
//   • TREES / ROCKS are real hazards — hit one and you WIPE OUT: tumble, stop,
//     and the Yeti gains on you (crashing is how it catches you, just like the
//     original). RAMPS launch you into the air (brief hang time, invulnerable,
//     small speed boost on landing) — the classic Ski Free jump.
//   • SLALOM GATES pose a tier-calibrated math problem when you thread the
//     flags: correct = pass + score + shove the Yeti back uphill; miss/whiff =
//     the Yeti creeps in. Math accuracy literally buys survival time.
//   • THE YETI appears from uphill after a distance, RAMPS UP faster than you
//     can ski, and catches you with a chomp if it reaches you — ending the run
//     early. You can only delay it (tuck to outrun, solve gates to knock back).
//
// Score-attack, host-timed (1/2/3 min). All visuals/audio come from
// @/lib/games/theme + drawCupcake + the host bus — no asset files. Gate/tree/
// ramp/yeti art is game-specific so it lives inline here.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import {
  buildSessionSummary,
  type SoundName,
} from '@/lib/games/phaser/session';
import {
  CAKE,
  CSS,
  MOUNTAIN,
  SKY,
  drawSprinkles,
  drawScoreBadge,
  type BadgeHandle,
  drawCupcake,
  splashAt,
  sparkleAt,
  floatScore,
  bigHitFx,
} from '@/lib/games/theme';
import {
  SKI_FREE_SCENE_KEY,
  SKI_FREE_VIEW_W,
  SKI_FREE_VIEW_H,
  type SkiFreeSceneProps,
  type SkiFreeDifficulty,
} from './SkiFreeScene.factory';

const VIEW_W = SKI_FREE_VIEW_W;
const VIEW_H = SKI_FREE_VIEW_H;

// The skier is pinned to this screen row; the slope scrolls past it.
const SKIER_Y = 190;
const SKIER_R = 16;               // collision half-width for tree/gate checks
                                  // (shrunk with the sprite so small ≠ unfair crashes)

// --- Momentum-physics constants (shared across difficulties) ---
const MAX_HEADING = 1.30;         // rad (~74°) — hardest carve, nearly stalls
const DRAG = 1.5;                 // 1/s — speed·DRAG friction; sets terminal v
const STEER_SENS = 0.011;         // finger-offset px → target heading rad
const PX_PER_M = 14;              // world px per displayed "meter"

const CRASH_MS = 850;             // wipeout lockout
const AIR_MS = 780;               // ramp hang time
const YETI_CATCH_Y = 12;          // yeti within this many px of the skier row…
const YETI_CATCH_X = 38;          // …and this close in x = chomp (near true overlap)
const YETI_TRACK_X = 0.6;         // yeti sideways homing (fraction/sec). Lowered
                                  // from 1.1 per kid feedback ("even if you avoid
                                  // the yeti it ends the game") — 1.1 re-centred
                                  // the yeti under the skier every frame, erasing
                                  // any carve before the catch check ran. 0.6 lets
                                  // a well-timed dodge open a gap the whiff branch
                                  // catches, while a skier who sits still is still caught.

// ---------------------------------------------------------------------------
// Difficulty presets. Per the game-feel doctrine kids notice 2× changes, so
// these step meaningfully. maxSpeed drives the whole feel; the yeti knobs set
// how forgiving the chase is; spawn cadences set obstacle/gate density.
// ---------------------------------------------------------------------------

interface Preset {
  maxSpeed: number;       // terminal straight-down speed (px/s)
  turnRate: number;       // rad/s the heading eases toward the finger
  gateEveryMs: number;
  treeEveryMs: number;
  rampEveryMs: number;
  gapHalf: number;        // half-width of a gate opening
  yetiDelayM: number;     // meters descended before the yeti appears
  yetiBaseSpeed: number;  // yeti's initial downhill speed (px/s)
  yetiRamp: number;       // px/s² the yeti accelerates (eventually out-skis you)
  yetiMaxSpeed: number;   // hard ceiling on yeti speed — kept BELOW maxSpeed so a
                          // clean straight tuck can always pull away (the escape).
  yetiKnockback: number;  // px the yeti is shoved uphill per correct gate
}

const PRESETS: Record<SkiFreeDifficulty, Preset> = {
  easy: {
    maxSpeed: 230, turnRate: 3.4, gateEveryMs: 2600, treeEveryMs: 1500, rampEveryMs: 6000,
    gapHalf: 74, yetiDelayM: 78, yetiBaseSpeed: 135, yetiRamp: 5, yetiMaxSpeed: 200, yetiKnockback: 150,
  },
  medium: {
    maxSpeed: 300, turnRate: 3.9, gateEveryMs: 2200, treeEveryMs: 1150, rampEveryMs: 5200,
    gapHalf: 62, yetiDelayM: 62, yetiBaseSpeed: 195, yetiRamp: 7, yetiMaxSpeed: 270, yetiKnockback: 135,
  },
  hard: {
    maxSpeed: 375, turnRate: 4.3, gateEveryMs: 1800, treeEveryMs: 900, rampEveryMs: 4600,
    gapHalf: 52, yetiBaseSpeed: 265, yetiDelayM: 48, yetiRamp: 9, yetiMaxSpeed: 350, yetiKnockback: 120,
  },
};

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

interface Gate {
  container: Phaser.GameObjects.Container;
  centerX: number;
  gapHalf: number;
  y: number;
  resolved: boolean;
  challenge: Challenge;
}

interface Obstacle {
  container: Phaser.GameObjects.Container;
  x: number;
  y: number;
  kind: 'tree' | 'ramp';
  used: boolean;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class SkiFreeScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: SkiFreeSceneProps;
  private preset!: Preset;

  // Skier — outer container holds the drawn cupcake + a pair of skis, so we
  // can lean/tumble/launch the whole rig with one transform.
  private skier!: Phaser.GameObjects.Container;
  private skis!: Phaser.GameObjects.Graphics;

  // Physics state
  private heading = 0;            // rad; 0 = straight down the fall line
  private targetHeading = 0;
  private speed = 0;              // px/s along the heading
  private accel = 0;              // px/s² down-line pull (== maxSpeed*DRAG)
  private crashMs = 0;            // >0 while wiped out (controls locked)
  private airMs = 0;             // >0 while airborne off a ramp

  // World
  private snowLayer!: Phaser.GameObjects.Graphics;
  private gates: Gate[] = [];
  private obstacles: Obstacle[] = [];
  private lastGateCenterX = VIEW_W / 2;
  private gateTimerMs = 0;
  private treeTimerMs = 0;
  private rampTimerMs = 0;

  // Yeti
  private yeti: Phaser.GameObjects.Container | null = null;
  private yetiSpeed = 0;
  private yetiWarned = false;
  private yetiTelegraphed = false;  // showed the "a yeti is coming" heads-up yet?

  // HUD
  private scoreBadge!: BadgeHandle;
  private distBadge!: BadgeHandle;
  private hintText?: Phaser.GameObjects.Text;

  // State
  private score = 0;             // gates cleared (= math right)
  private wrongAnswers = 0;
  private missedGates = 0;
  private jumps = 0;
  private crashes = 0;
  private distanceM = 0;
  private elapsedPlayMs = 0;
  private sessionStart = 0;
  private paused = false;
  private ended = false;
  private activeGate: Gate | null = null;

  constructor() {
    super(SKI_FREE_SCENE_KEY);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as SkiFreeSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.preset = PRESETS[this.sceneProps.difficulty ?? 'medium'];
    this.accel = this.preset.maxSpeed * DRAG;
    this.sessionStart = Date.now();

    this.physics.world.gravity.set(0, 0); // top-down; all motion is manual

    this.drawSlope();
    this.createSkier();
    this.drawHud();
    this.drawHint();
    this.installInput();

    this.emitSfx('start');

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    this.hostBus.on('scene:timeUp', () => this.endSession(true, false), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  /** Snowy meringue slope: cool sky band up top blending into a bright snow
   *  field, with faint sprinkle flecks for the cakey texture. */
  private drawSlope(): void {
    this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, MOUNTAIN.SNOW).setDepth(0);
    this.add.rectangle(VIEW_W / 2, 44, VIEW_W, 88, SKY.LOW).setDepth(0);
    this.add.rectangle(VIEW_W / 2, 110, VIEW_W, 44, MOUNTAIN.SNOW_EDGE).setDepth(0);

    // Moving snow "speed lines" (redrawn each frame in shimmerSnow()).
    this.snowLayer = this.add.graphics().setDepth(1).setAlpha(0.5);

    drawSprinkles(this, {
      bounds: { x: 0, y: 0, w: VIEW_W, h: VIEW_H },
      count: 40, seed: 0x5305, alpha: 0.3, depth: 1,
    });
  }

  /** The skier = the kid's Cakey Store cupcake on a pair of skis. */
  private createSkier(): void {
    this.skier = this.add.container(VIEW_W / 2, SKIER_Y).setDepth(10);
    this.skis = this.add.graphics();
    // The cupcake, centered a touch above the skis so it "sits" on them.
    // Smaller sprite (ticket: "make the player icon smaller") — the hitbox
    // (SKIER_R) shrank to match so it stays fair.
    const cake = drawCupcake(this, 0, -4, {
      config: this.sceneProps.cupcakeConfig,
      scale: 0.7,
    });
    this.skier.add([this.skis, cake]);
    this.drawSkis();
  }

  /** Two sleek candy-striped skis with bindings and upturned tips. They
   *  splay apart in a carve and tuck parallel when you point straight down —
   *  reads as "the cupcake knows how to ski" (ticket: "cleverer skis"). */
  private drawSkis(): void {
    const g = this.skis;
    g.clear();

    // Carve read: 0 = straight tuck (parallel), 1 = hardest carve (splayed).
    const carve = Math.min(Math.abs(this.heading) / MAX_HEADING, 1);
    const splay = 4 + carve * 3;          // half-gap between the two skis
    const len = 15;                        // ski length (px)
    const yTop = 12, yBot = yTop + 5;

    for (const dir of [-1, 1] as const) {
      const cx = dir * splay;
      const x0 = cx - 4, x1 = cx + 4;      // ski body left/right edges

      // Ski base — strawberry body with a deep-red edge for depth.
      g.fillStyle(CAKE.STRAWBERRY, 1);
      g.fillRoundedRect(x0, yTop, 8, len - yTop + 5, 2);
      g.fillStyle(CAKE.STRAWBERRY_DEEP, 1);
      g.fillRect(x0, yBot, 8, 2);

      // Candy-cane stripe down the middle.
      g.fillStyle(CAKE.FROSTING, 0.9);
      g.fillRect(cx - 1, yTop + 1, 2, len - yTop);

      // Boot binding — a little dark buckle where the cupcake stands.
      g.fillStyle(0x4a2c2a, 1);
      g.fillCircle(cx, yTop + 4, 1.8);

      // Upturned frosting tip, angled outward on the carving side.
      g.fillStyle(CAKE.FROSTING, 1);
      g.fillTriangle(x0, yTop, x0 - 2 - carve * 2 * dir, yTop - 4, x1, yTop);
    }
  }

  private drawHud(): void {
    this.scoreBadge = drawScoreBadge(this, {
      anchor: 'tl', width: 190, initialValue: '⛷️ 0  ·  ❌ 0',
    });
    this.distBadge = drawScoreBadge(this, {
      anchor: 'bl', viewH: VIEW_H, width: 150, height: 32, initialValue: '🏔️ 0m',
    });
  }

  private drawHint(): void {
    this.hintText = this.add.text(
      VIEW_W / 2, VIEW_H - 40,
      'Drag to steer — point straight down to speed up! 🎂',
      { fontSize: '15px', color: CSS.TEXT_DARK, fontStyle: 'bold',
        align: 'center', wordWrap: { width: VIEW_W - 40 } },
    ).setOrigin(0.5, 1).setDepth(40).setAlpha(0.85);
  }

  private installInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.steerTo(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.steerTo(p);
    });
  }

  /** The finger's horizontal offset from the skier sets the TARGET heading;
   *  the heading eases toward it (momentum), so steering has weight. */
  private steerTo(p: Phaser.Input.Pointer): void {
    if (this.paused || this.ended || this.crashMs > 0) return;
    const offset = p.worldX - this.skier.x;
    this.targetHeading = Phaser.Math.Clamp(offset * STEER_SENS, -MAX_HEADING, MAX_HEADING);
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (this.paused || this.ended) return;
    const dt = delta / 1000;
    this.elapsedPlayMs += delta;

    const downhill = this.stepSkier(dt);
    this.scrollWorld(downhill * dt);
    this.spawnScheduled(delta);
    this.updateYeti(dt, downhill);
    this.shimmerSnow(downhill);
    this.updateHud();
  }

  /** Advance the momentum model one tick. Returns the DOWNHILL speed (px/s)
   *  the world should scroll by. Handles crash + airborne states too. */
  private stepSkier(dt: number): number {
    // Wiped out — locked, decelerating hard, no steering.
    if (this.crashMs > 0) {
      this.crashMs -= dt * 1000;
      this.speed = Math.max(0, this.speed - this.speed * 6 * dt);
      if (this.crashMs <= 0) this.recoverFromCrash();
      return this.speed * Math.cos(this.heading);
    }

    // Airborne off a ramp — keep momentum, no steering weight change, float.
    if (this.airMs > 0) {
      this.airMs -= dt * 1000;
      if (this.airMs <= 0) this.land();
    } else {
      // Ease heading toward the finger target (this is the "weight").
      const dh = this.targetHeading - this.heading;
      const turn = this.preset.turnRate * dt;
      this.heading += Phaser.Math.Clamp(dh, -turn, turn);
    }

    // Fall-line acceleration + drag → terminal speed depends on heading.
    const along = this.accel * Math.cos(this.heading);
    this.speed += along * dt;
    this.speed -= this.speed * DRAG * dt;
    this.speed = Math.max(0, this.speed);

    // Move laterally; the world takes the downhill component.
    const vx = this.speed * Math.sin(this.heading);
    let nx = this.skier.x + vx * dt;
    nx = Phaser.Math.Clamp(nx, 16, VIEW_W - 16);
    if (nx === 16 || nx === VIEW_W - 16) {
      // Scraped the edge — bleed the outward heading so we don't stick.
      this.targetHeading *= 0.3;
      this.heading *= 0.5;
    }
    this.skier.x = nx;

    // Lean the cupcake into the carve (unless airborne, where we spin instead).
    if (this.airMs <= 0) {
      this.skier.setAngle(Phaser.Math.RadToDeg(this.heading) * 0.55);
    }
    this.drawSkis();

    return this.speed * Math.cos(this.heading);
  }

  /** Scroll every world object up by `dyDown`, reap off-screen, and run the
   *  gate-crossing / tree-crash / ramp-launch checks at the skier's row. */
  private scrollWorld(dyDown: number): void {
    // Gates
    for (const gate of this.gates) {
      gate.y -= dyDown;
      gate.container.y = gate.y;
      if (!gate.resolved && gate.y <= SKIER_Y) {
        gate.resolved = true;
        if (this.airMs > 0) continue; // flew over the gate — no problem, no score
        const withinGap = Math.abs(this.skier.x - gate.centerX) <= gate.gapHalf;
        if (withinGap) {
          this.openGateChallenge(gate);
          return; // paused now
        }
        this.missedGates++;
        this.creepYeti(this.preset.yetiKnockback * 0.5);
        this.emitSfx('hop');
      }
    }
    this.gates = this.gates.filter((g) => {
      if (g.y < -60) { g.container.destroy(); return false; }
      return true;
    });

    // Obstacles (trees crash, ramps launch)
    for (const ob of this.obstacles) {
      ob.y -= dyDown;
      ob.container.y = ob.y;
      if (ob.used) continue;
      const near = Math.abs(ob.y - SKIER_Y) < 20 && Math.abs(ob.x - this.skier.x) < SKIER_R + 4;
      if (!near) continue;
      if (ob.kind === 'tree') {
        if (this.airMs > 0) continue; // jumped clean over it
        ob.used = true;
        this.crash();
      } else {
        ob.used = true;
        this.launch();
      }
    }
    this.obstacles = this.obstacles.filter((o) => {
      if (o.y < -60) { o.container.destroy(); return false; }
      return true;
    });
  }

  private spawnScheduled(delta: number): void {
    this.gateTimerMs += delta;
    if (this.gateTimerMs >= this.preset.gateEveryMs) { this.gateTimerMs = 0; this.spawnGate(); }
    this.treeTimerMs += delta;
    if (this.treeTimerMs >= this.preset.treeEveryMs) { this.treeTimerMs = 0; this.spawnTree(); }
    this.rampTimerMs += delta;
    if (this.rampTimerMs >= this.preset.rampEveryMs) { this.rampTimerMs = 0; this.spawnRamp(); }
  }

  // -------------------------------------------------------------------------
  // Spawners
  // -------------------------------------------------------------------------

  private spawnGate(): void {
    const gap = this.preset.gapHalf;
    const minX = gap + 24;
    const maxX = VIEW_W - gap - 24;
    const shift = Phaser.Math.Between(-200, 200);
    const centerX = Phaser.Math.Clamp(this.lastGateCenterX + shift, minX, maxX);
    this.lastGateCenterX = centerX;

    const y = VIEW_H + 60;
    const c = this.add.container(centerX, y).setDepth(6);
    for (const side of [-1, 1] as const) {
      const px = side * gap;
      const pole = this.add.rectangle(px, 0, 4, 40, CAKE.STRAWBERRY_DEEP).setOrigin(0.5, 1);
      const flag = this.add.text(px + side * 2, -34, '🚩', { fontSize: '22px' }).setOrigin(0.5);
      c.add([pole, flag]);
    }
    const line = this.add.rectangle(0, -2, gap * 2, 3, CAKE.MINT_DEEP, 0.5).setOrigin(0.5, 1);
    c.add(line);

    this.gates.push({
      container: c, centerX, gapHalf: gap, y, resolved: false,
      challenge: this.makeChallenge(),
    });
  }

  private makeChallenge(): Challenge {
    return generateChallengeForMode(this.sceneProps.challengeMode ?? 'math', {
      tier: this.sceneProps.tier,
      mathType: this.sceneProps.mathType,
    });
  }

  private spawnTree(): void {
    const x = Phaser.Math.Between(24, VIEW_W - 24);
    const y = VIEW_H + 60;
    const c = this.add.container(x, y).setDepth(5);
    // Snow-dusted evergreen: brown trunk + green tiers + white cap.
    const trunk = this.add.rectangle(0, 0, 8, 14, CAKE.CHOCOLATE).setOrigin(0.5, 1);
    const lower = this.add.triangle(0, -8, 0, 0, -18, 20, 18, 20, 0x16a34a);
    const upper = this.add.triangle(0, -20, 0, 0, -14, 18, 14, 18, 0x22c55e);
    const cap = this.add.triangle(0, -30, 0, 0, -8, 10, 8, 10, MOUNTAIN.SNOW);
    c.add([trunk, lower, upper, cap]);
    this.obstacles.push({ container: c, x, y, kind: 'tree', used: false });
  }

  private spawnRamp(): void {
    const x = Phaser.Math.Between(40, VIEW_W - 40);
    const y = VIEW_H + 60;
    const c = this.add.container(x, y).setDepth(4);
    // A little vanilla-frosting kicker ramp with an up-arrow hint.
    const base = this.add.triangle(0, 0, -22, 8, 22, 8, 22, -12, CAKE.VANILLA_DEEP)
      .setStrokeStyle(2, CAKE.AMBER_DEEP);
    const lip = this.add.rectangle(16, -12, 14, 4, CAKE.FROSTING).setOrigin(0.5, 1);
    const arrow = this.add.text(0, -2, '⤒', { fontSize: '16px', color: '#b45309' }).setOrigin(0.5);
    c.add([base, lip, arrow]);
    this.obstacles.push({ container: c, x, y, kind: 'ramp', used: false });
  }

  // -------------------------------------------------------------------------
  // Crash / jump
  // -------------------------------------------------------------------------

  private crash(): void {
    this.crashMs = CRASH_MS;
    this.crashes++;
    this.speed = 0;
    this.targetHeading = 0;
    this.emitSfx('wrong');
    floatScore(this, { x: this.skier.x, y: SKIER_Y - 24, label: 'Wipeout!', color: CSS.TIMER_WARN, fontSize: 22 });
    // Tumble spin for the lockout duration.
    this.tweens.add({
      targets: this.skier,
      angle: 360,
      duration: CRASH_MS,
      ease: 'Cubic.easeOut',
    });
  }

  private recoverFromCrash(): void {
    this.crashMs = 0;
    this.heading = 0;
    this.targetHeading = 0;
    this.skier.setAngle(0);
    this.speed = this.preset.maxSpeed * 0.2; // shove off again, slowly
    sparkleAt(this, this.skier.x, SKIER_Y, { count: 4, spread: 20, rise: 12 });
  }

  private launch(): void {
    this.airMs = AIR_MS;
    this.jumps++;
    this.emitSfx('swoop');
    floatScore(this, { x: this.skier.x, y: SKIER_Y - 30, label: 'Jump! 🎿', color: CSS.SCORE_BULLSEYE, fontSize: 20 });
    // Lift + a full stylish spin while airborne.
    this.tweens.add({ targets: this.skier, scale: 1.35, duration: AIR_MS / 2, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.skier, angle: this.skier.angle + 360, duration: AIR_MS, ease: 'Sine.easeInOut' });
  }

  private land(): void {
    this.airMs = 0;
    this.skier.setScale(1);
    this.skier.setAngle(0);
    this.speed = Math.min(this.preset.maxSpeed, this.speed * 1.12); // stomp = boost
    this.emitSfx('catch');
    sparkleAt(this, this.skier.x, SKIER_Y + 10, { count: 6, spread: 30, rise: 16 });
  }

  private shimmerSnow(downhill: number): void {
    const g = this.snowLayer;
    g.clear();
    g.lineStyle(2, MOUNTAIN.SNOW_EDGE, 0.9);
    // Speed lines lengthen with downhill speed so fast tucks read as fast.
    const len = 8 + (downhill / this.preset.maxSpeed) * 20;
    const phase = (this.elapsedPlayMs * downhill) / 1000;
    for (let i = 0; i < 10; i++) {
      const baseY = (i * 74 + phase) % (VIEW_H + 40);
      const y = VIEW_H + 40 - baseY;
      const x = (i * 137) % VIEW_W;
      g.lineBetween(x, y, x, y + len);
    }
  }

  private updateHud(): void {
    this.distBadge.setValue(`🏔️ ${Math.floor(this.distanceM)}m`);
  }

  // -------------------------------------------------------------------------
  // The Yeti
  // -------------------------------------------------------------------------

  private updateYeti(dt: number, downhill: number): void {
    this.distanceM += (downhill * dt) / PX_PER_M;

    if (!this.yeti) {
      // Telegraph the chase a bit before it starts, so the Yeti never just
      // materialises next to the skier. Gives ~8 m of runway to react.
      if (!this.yetiTelegraphed && this.distanceM >= this.preset.yetiDelayM - 8) {
        this.yetiTelegraphed = true;
        this.showHint('❄️ Uh oh — a Yeti is coming! Tuck straight to outrun it, or solve gates to shove it back.');
      }
      if (this.distanceM >= this.preset.yetiDelayM) this.spawnYeti();
      return;
    }

    // Ramp the yeti's speed toward its ceiling; its closing rate = its speed
    // minus YOUR downhill speed. The ceiling sits below the skier's top speed,
    // so a clean straight tuck ALWAYS pulls away — carve or crash and it gains.
    this.yetiSpeed = Math.min(this.yetiSpeed + this.preset.yetiRamp * dt, this.preset.yetiMaxSpeed);
    this.yeti.y += (this.yetiSpeed - downhill) * dt;
    this.yeti.y = Math.max(-90, this.yeti.y); // can't recede past just off-screen

    const dx = this.skier.x - this.yeti.x;
    this.yeti.x += dx * Math.min(YETI_TRACK_X * dt, 1);
    this.yeti.setScale(1 + Math.sin(this.elapsedPlayMs / 110) * 0.05);

    if (!this.yetiWarned && this.yeti.y > SKIER_Y - 170) {
      this.yetiWarned = true;
      this.showHint('The Yeti is on you! 🍦👹 Solve gates to shove it back!');
    }
    if (this.yetiWarned && this.yeti.y < SKIER_Y - 240) {
      // Pulled well clear — drop the warning.
      this.yetiWarned = false;
      this.clearHint();
    }

    // Resolve the moment the Yeti draws level with the skier's row: chomp if
    // it's lined up in x, otherwise it lunged and MISSED — the skier slipped by.
    if (this.yeti.y >= SKIER_Y - YETI_CATCH_Y) {
      if (Math.abs(this.yeti.x - this.skier.x) < YETI_CATCH_X) {
        this.endSession(this.score > 0, true);
      } else {
        // Whiff! The Yeti tumbles back uphill and has to chase again, giving
        // the kid room. Rewards steering aside as it closes in.
        this.yeti.y = SKIER_Y - 150;
        this.yetiSpeed = Math.max(this.preset.yetiBaseSpeed, this.yetiSpeed - 45);
        this.emitSfx('swoop');
        this.showHint('Dodged the Yeti! 🍦💨');
        this.yetiWarned = false;
      }
    }
  }

  private spawnYeti(): void {
    this.emitSfx('swoop');
    this.yetiSpeed = this.preset.yetiBaseSpeed;
    this.yetiWarned = false;
    const c = this.add.container(this.skier.x, -70).setDepth(20);

    // A cakey frosting monster (brand rule: sweets, not animals). Cream blob
    // with strawberry drips, dark eyes, a fanged strawberry grin, stubby arms.
    const armL = this.add.rectangle(-24, 2, 12, 7, CAKE.FROSTING).setStrokeStyle(2, CAKE.STRAWBERRY);
    const armR = this.add.rectangle(24, 2, 12, 7, CAKE.FROSTING).setStrokeStyle(2, CAKE.STRAWBERRY);
    const dripL = this.add.circle(-14, 16, 7, CAKE.FROSTING).setStrokeStyle(3, CAKE.STRAWBERRY);
    const dripR = this.add.circle(12, 18, 6, CAKE.FROSTING).setStrokeStyle(3, CAKE.STRAWBERRY);
    const body = this.add.circle(0, 0, 26, CAKE.FROSTING).setStrokeStyle(3, CAKE.STRAWBERRY);
    const eyes = this.add.graphics();
    eyes.fillStyle(0x1e1b4b, 1);
    eyes.fillCircle(-9, -6, 4);
    eyes.fillCircle(9, -6, 4);
    const mouth = this.add.graphics();
    mouth.fillStyle(CAKE.STRAWBERRY_DEEP, 1);
    mouth.fillEllipse(0, 8, 22, 12);
    mouth.fillStyle(CAKE.FROSTING, 1);
    mouth.fillTriangle(-6, 3, -2, 3, -4, 10);
    mouth.fillTriangle(6, 3, 2, 3, 4, 10);

    c.add([armL, armR, dripL, dripR, body, eyes, mouth]);
    this.yeti = c;
  }

  /** Push the yeti uphill (away) — the reward for a correct gate. */
  private shoveYeti(px: number): void {
    if (this.yeti) this.yeti.y = Math.max(-90, this.yeti.y - px);
  }

  /** Let the yeti creep toward the skier — the cost of a miss/whiff. */
  private creepYeti(px: number): void {
    if (this.yeti) this.yeti.y = Math.min(SKIER_Y, this.yeti.y + px);
  }

  // -------------------------------------------------------------------------
  // Gate challenge flow
  // -------------------------------------------------------------------------

  private openGateChallenge(gate: Gate): void {
    this.paused = true;
    this.activeGate = gate;
    this.emitSfx('tap');
    this.hostBus.emit('challenge:open', {
      challenge: gate.challenge,
      reason: '🚩 Solve to clear the gate!',
    });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const gate = this.activeGate;
    this.activeGate = null;
    this.paused = false;
    if (!gate) return;

    const x = gate.centerX;
    const y = SKIER_Y;
    if (payload.correct) {
      this.score++;
      this.emitSfx('correct');
      splashAt(this, x, y, { scale: 0.8, color: CAKE.MINT_DEEP });
      sparkleAt(this, x, y, { count: 5, spread: 26, fontSize: 14, rise: 22 });
      floatScore(this, { x, y: y - 26, label: '+1', color: CSS.SCORE_KID });
      this.shoveYeti(this.preset.yetiKnockback);
      if (this.yeti) sparkleAt(this, this.yeti.x, this.yeti.y, { count: 4, spread: 18, rise: 10 });
    } else {
      this.wrongAnswers++;
      this.emitSfx('wrong');
      this.creepYeti(this.preset.yetiKnockback * 0.4);
    }
    this.updateScoreDisplay();
  }

  private updateScoreDisplay(): void {
    this.scoreBadge.setValue(`⛷️ ${this.score}  ·  ❌ ${this.wrongAnswers}`);
    if (this.hintText && !this.yetiWarned) this.clearHint();
  }

  // -------------------------------------------------------------------------
  // Hints
  // -------------------------------------------------------------------------

  private showHint(msg: string): void {
    this.clearHint();
    this.hintText = this.add.text(VIEW_W / 2, VIEW_H - 40, msg, {
      fontSize: '14px', color: CSS.TEXT_STRAWBERRY, fontStyle: 'bold',
      align: 'center', wordWrap: { width: VIEW_W - 40 },
    }).setOrigin(0.5, 1).setDepth(40);
  }

  private clearHint(): void {
    this.hintText?.destroy();
    this.hintText = undefined;
  }

  // -------------------------------------------------------------------------
  // End / reset
  // -------------------------------------------------------------------------

  private endSession(won: boolean, caughtByYeti: boolean): void {
    if (this.ended) return;
    this.ended = true;

    if (caughtByYeti) {
      bigHitFx(this, { flashColor: [251, 113, 133], shakeMs: 220, shakeIntensity: 0.01 });
      this.emitSfx('wrong');
      if (this.yeti) {
        // Yeti pounces onto the skier for the gotcha chomp.
        this.tweens.add({
          targets: this.yeti, y: SKIER_Y, x: this.skier.x, scale: 1.35,
          duration: 180, ease: 'Quad.easeIn',
        });
      }
    }
    this.emitSfx(won && !caughtByYeti ? 'win' : 'timeUp');

    const metaLines = [
      `⛷️ ${this.score} gates cleared`,
      `🏔️ ${Math.floor(this.distanceM)}m skied`,
    ];
    if (this.jumps > 0) metaLines.push(`🎿 ${this.jumps} jumps`);
    if (this.crashes > 0) metaLines.push(`💥 ${this.crashes} wipeouts`);
    metaLines.push(caughtByYeti ? '🍦👹 Caught by the Yeti!' : '🏁 Made it down the mountain!');

    // Meringue Downhill is a TIMED game, so any real end — down the mountain,
    // caught by the Yeti, or the clock running out — is a completed session and
    // earns the normal participation drip (1/2/3 🪙 by chosen length), matching
    // every other timed game. Getting caught no longer zeroes the reward. `won`
    // still drives the win/lose sfx + metaLine above; efficiency (gates vs
    // misses) still drives the game-over celebration tier.
    const summary = buildSessionSummary({
      score: this.score,
      wrongAnswers: this.wrongAnswers,
      sessionStart: this.sessionStart,
      completed: true,
      optimalTaps: this.score,
      metaLines,
    });
    this.hostBus.emit('session:end', { summary });
  }

  private resetScene(): void {
    for (const g of this.gates) g.container.destroy();
    for (const o of this.obstacles) o.container.destroy();
    this.gates = [];
    this.obstacles = [];
    this.yeti?.destroy();
    this.yeti = null;
    this.yetiSpeed = 0;
    this.yetiWarned = false;
    this.yetiTelegraphed = false;

    this.tweens.killTweensOf(this.skier);
    this.skier.setPosition(VIEW_W / 2, SKIER_Y);
    this.skier.setAngle(0);
    this.skier.setScale(1);
    this.heading = 0;
    this.targetHeading = 0;
    this.speed = 0;
    this.crashMs = 0;
    this.airMs = 0;
    this.lastGateCenterX = VIEW_W / 2;
    this.gateTimerMs = 0;
    this.treeTimerMs = 0;
    this.rampTimerMs = 0;
    this.drawSkis();

    this.score = 0;
    this.wrongAnswers = 0;
    this.missedGates = 0;
    this.jumps = 0;
    this.crashes = 0;
    this.distanceM = 0;
    this.elapsedPlayMs = 0;
    this.sessionStart = Date.now();
    this.paused = false;
    this.ended = false;
    this.activeGate = null;

    this.updateScoreDisplay();
    this.updateHud();
    this.showHint('Drag to steer — point straight down to speed up! 🎂');
    this.emitSfx('start');
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}
