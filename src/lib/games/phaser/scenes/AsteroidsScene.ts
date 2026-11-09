// Math Asteroids — classic Asteroids physics with math baked into the
// destruction loop.
//
// Gameplay:
//   - Ship at center with rotation + thrust + momentum + screen wrap.
//   - Asteroids drift linearly (no rotation so equation text stays
//     readable) and wrap around the screen edges.
//   - Bullet hits an asteroid → it freezes, the modal opens with its
//     equation. Correct destroys it (+1 score), wrong closes the modal
//     and the asteroid resumes drifting (wrongAnswers++, no life lost).
//   - Asteroid collides with ship → −1 LIFE, modal opens and is
//     "sticky": wrong answers re-open the modal until the kid gets it.
//   - Lives = 0 → session:end.
//
// Architecture (same shape as FlappyScene):
//   - Host injects sceneProps + hostBus via registry.
//   - Scene emits 'challenge:open', 'session:end', 'scene:sfx'.
//   - Scene listens for 'challenge:result' + 'scene:reset'.
//
// No Phaser physics bodies — movement is manual integration so we can
// do Asteroids-authentic drag + wrap without fighting arcade gravity.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import type { Challenge } from '@/lib/games/shared/challenge';
import {
  buildSessionSummary,
  type SoundName,
} from '@/lib/games/phaser/session';
// Non-Phaser exports live in the sibling .factory.ts; see FlappyScene.factory.ts
// comment for the dev-mode rationale.
import {
  ASTEROIDS_VIEW_W,
  ASTEROIDS_VIEW_H,
  ASTEROIDS_SCENE_KEY,
  type AsteroidsDifficulty,
  type AsteroidsSceneProps,
} from './AsteroidsScene.factory';
import {
  drawScoreBadge,
  drawLivesRow,
  drawTimerBadge,
  type BadgeHandle,
  type LivesHandle,
  type TimerHandle,
  sparkleAt,
  bigHitFx,
  drawCupcake,
} from '@/lib/games/theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Re-alias factory-owned dims to the short names the rest of this file uses.
const VIEW_W = ASTEROIDS_VIEW_W;
const VIEW_H = ASTEROIDS_VIEW_H;
const HUD_RESERVED_TOP = 48;     // top strip reserved for lives/score HUD
const TOUCH_BAR_H = 92;          // bottom strip for on-screen touch buttons
const PLAYFIELD_BOTTOM = VIEW_H - TOUCH_BAR_H;

const SHIP_SIZE = 14;             // triangle "radius" from center to nose
const ROT_SPEED = 3.4;            // rad/s
const BULLET_SPEED = 420;         // px/s (relative to world, not ship)
const BULLET_TTL_MS = 1100;
const BULLET_RADIUS = 3;
const FIRE_COOLDOWN_MS = 220;

const ASTEROID_RADIUS = 30;       // bounding radius for collision + visual

const IMMUNITY_MS = 2000;
const MAX_LIVES = 3;
const STICKY_RETRY_DELAY_MS = 500;

// Round length = the kid's chosen 1/2/3-min pick (see session-duration).
// Lives-out ends earlier; the timer caps the session otherwise.
const TICK_LAST_MS = 30_000;

const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;
const COUNTDOWN_STEP_MS = 700;

// ---------------------------------------------------------------------------
// Difficulty presets — tune from DIFFICULTY_TUNING after playtest.
// ---------------------------------------------------------------------------

interface AsteroidsTuning {
  asteroidCount: number;
  asteroidSpeed: number;   // px/s drift speed
  shipThrust: number;      // px/s² acceleration while thrust is held
  shipDrag: number;        // 0..1; higher = more "stopping power" per second
  shipMaxSpeed: number;    // px/s cap
}

const DIFFICULTY_TUNING: Record<AsteroidsDifficulty, AsteroidsTuning> = {
  easy:   { asteroidCount: 3, asteroidSpeed: 40,  shipThrust: 140, shipDrag: 0.6, shipMaxSpeed: 140 },
  medium: { asteroidCount: 4, asteroidSpeed: 70,  shipThrust: 200, shipDrag: 0.4, shipMaxSpeed: 180 },
  hard:   { asteroidCount: 5, asteroidSpeed: 110, shipThrust: 260, shipDrag: 0.2, shipMaxSpeed: 220 },
};

const DEFAULT_DIFFICULTY: AsteroidsDifficulty = 'medium';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface Asteroid {
  group: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  challenge: Challenge;
  frozen: boolean;
}

interface Bullet {
  sprite: Phaser.GameObjects.Arc;
  x: number;
  y: number;
  vx: number;
  vy: number;
  expiresAt: number;
}

type ModalSource = 'bullet' | 'collision';
interface PendingChallenge {
  asteroid: Asteroid;
  source: ModalSource;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class AsteroidsScene extends Phaser.Scene {
  // Injected
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: AsteroidsSceneProps;
  private tuning: AsteroidsTuning = DIFFICULTY_TUNING[DEFAULT_DIFFICULTY];

  // Game objects
  private ship!: Phaser.GameObjects.Container;
  private shipBody!: Phaser.GameObjects.Graphics;
  private flame!: Phaser.GameObjects.Graphics;
  /** The kid's cupcake riding in the cockpit (if they have one). Kept
   *  counter-rotated against the ship each frame so it stays upright. */
  private cockpitCake?: Phaser.GameObjects.Container;
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];

  // Ship state
  private shipVx = 0;
  private shipVy = 0;

  // Input flags (polled each frame)
  private rotLeft = false;
  private rotRight = false;
  private thrust = false;
  private lastFireAt = 0;

  // HUD
  private scoreBadge!: BadgeHandle;
  private timerBadge!: TimerHandle;
  // Round length captured at create() from the kid's chosen 1/2/3-min pick.
  private roundMs = 3 * 60 * 1000;
  private livesRow!: LivesHandle;

  // Round timer — pause-aware. pauseStartedAt > 0 while the math modal
  // is up; pauseMs accumulates total paused time so the timer only
  // counts active gameplay.
  private pauseStartedAt = 0;
  private pauseMs = 0;
  private lastTickSec = -1;

  // Start overlay
  private startHint?: Phaser.GameObjects.Text;
  private startHintSub?: Phaser.GameObjects.Text;

  // State
  private started = false;
  private paused = false;
  private dead = false;
  private score = 0;
  private wrongAnswers = 0;
  private lives = MAX_LIVES;
  private immuneUntil = 0;
  private sessionStart = 0;
  private pending: PendingChallenge | null = null;

  constructor() {
    super(ASTEROIDS_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as AsteroidsSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.tuning = DIFFICULTY_TUNING[this.sceneProps.difficulty ?? DEFAULT_DIFFICULTY];
    this.sessionStart = Date.now();

    this.drawBackground();
    this.createShip();
    this.spawnInitialAsteroids();
    this.drawHud();
    this.drawTouchControls();
    this.drawStartHint();
    this.installInput();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  private drawBackground(): void {
    // Near-black space.
    this.add.rectangle(VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0x0b1020);

    // Starfield — one graphics object with scattered dots for cheap render.
    const stars = this.add.graphics();
    stars.setDepth(1);
    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, VIEW_W);
      const y = Phaser.Math.Between(0, PLAYFIELD_BOTTOM);
      const r = Phaser.Math.FloatBetween(0.4, 1.4);
      const alpha = Phaser.Math.FloatBetween(0.3, 0.9);
      stars.fillStyle(0xffffff, alpha).fillCircle(x, y, r);
    }

    // Touch bar backing — separates playfield from on-screen controls.
    this.add.rectangle(
      VIEW_W / 2, PLAYFIELD_BOTTOM + TOUCH_BAR_H / 2,
      VIEW_W, TOUCH_BAR_H, 0x050812,
    ).setDepth(40);
    this.add.rectangle(
      VIEW_W / 2, PLAYFIELD_BOTTOM + 1,
      VIEW_W, 2, 0x1e293b,
    ).setDepth(41);
  }

  private createShip(): void {
    this.flame = this.add.graphics();
    this.shipBody = this.add.graphics();
    this.drawShipBody(this.shipBody);

    this.ship = this.add.container(VIEW_W / 2, (HUD_RESERVED_TOP + PLAYFIELD_BOTTOM) / 2, [
      this.flame,
      this.shipBody,
    ]);
    // Rotation=0 means nose points along +x. Starting rotation -π/2 faces up.
    this.ship.setRotation(-Math.PI / 2);
    this.ship.setDepth(20);

    // The kid's cupcake rides in the cockpit. It's a child of the ship
    // (so it tracks position + gets destroyed with it), sat at the ship's
    // centre — a rotation-invariant point — behind a small windscreen
    // bubble. update() counter-rotates it so it always reads upright even
    // as the ship spins a full 360°. Guests (no config) fly a bare ship.
    if (this.sceneProps.cupcakeConfig) {
      const bubble = this.add.circle(0, 0, SHIP_SIZE * 0.7, 0xbae6fd, 0.9)
        .setStrokeStyle(1.5, 0x0284c7);
      this.cockpitCake = drawCupcake(this, 0, 0, {
        config: this.sceneProps.cupcakeConfig,
        scale: 0.34,
      });
      this.ship.add([bubble, this.cockpitCake]);
      this.cockpitCake.setRotation(-this.ship.rotation); // upright at spawn
    }
  }

  private drawShipBody(g: Phaser.GameObjects.Graphics): void {
    g.clear();
    g.lineStyle(2, 0x86efac, 1);
    g.fillStyle(0x064e3b, 0.9);
    g.beginPath();
    g.moveTo(SHIP_SIZE, 0);                    // nose (+x)
    g.lineTo(-SHIP_SIZE * 0.8, SHIP_SIZE * 0.7); // right wing
    g.lineTo(-SHIP_SIZE * 0.4, 0);              // tail notch
    g.lineTo(-SHIP_SIZE * 0.8, -SHIP_SIZE * 0.7); // left wing
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private drawFlame(active: boolean): void {
    this.flame.clear();
    if (!active) return;
    // Flickering flame behind the ship (so behind = -x relative to ship).
    const flicker = Phaser.Math.FloatBetween(0.7, 1.1);
    this.flame.fillStyle(0xfbbf24, 0.9);
    this.flame.beginPath();
    this.flame.moveTo(-SHIP_SIZE * 0.4, SHIP_SIZE * 0.35);
    this.flame.lineTo(-SHIP_SIZE * (1.1 + flicker * 0.4), 0);
    this.flame.lineTo(-SHIP_SIZE * 0.4, -SHIP_SIZE * 0.35);
    this.flame.closePath();
    this.flame.fillPath();
  }

  private spawnInitialAsteroids(): void {
    for (let i = 0; i < this.tuning.asteroidCount; i++) {
      this.spawnAsteroidAtEdge();
    }
  }

  /**
   * Spawn a new asteroid just inside a random edge of the playfield,
   * drifting toward the center. Spawning *inside* the bounds (rather than
   * outside and letting them drift in) keeps wrapPlayfieldY from
   * teleporting them to the opposite side on the very first frame.
   */
  private spawnAsteroidAtEdge(): void {
    const insetX = ASTEROID_RADIUS + 4;
    const insetY = ASTEROID_RADIUS + 4;
    const edge = Phaser.Math.Between(0, 3);
    let x: number;
    let y: number;
    switch (edge) {
      case 0: x = insetX; y = Phaser.Math.Between(HUD_RESERVED_TOP + insetY, PLAYFIELD_BOTTOM - insetY); break;
      case 1: x = VIEW_W - insetX; y = Phaser.Math.Between(HUD_RESERVED_TOP + insetY, PLAYFIELD_BOTTOM - insetY); break;
      case 2: x = Phaser.Math.Between(insetX, VIEW_W - insetX); y = HUD_RESERVED_TOP + insetY; break;
      default: x = Phaser.Math.Between(insetX, VIEW_W - insetX); y = PLAYFIELD_BOTTOM - insetY; break;
    }

    // Bias velocity toward the playfield center so the asteroid enters
    // visible play quickly, with some jitter to avoid every spawn aiming
    // at the same spot.
    const cx = VIEW_W / 2;
    const cy = (HUD_RESERVED_TOP + PLAYFIELD_BOTTOM) / 2;
    const dir = Math.atan2(cy - y, cx - x) + Phaser.Math.FloatBetween(-0.6, 0.6);
    const speed = this.tuning.asteroidSpeed * Phaser.Math.FloatBetween(0.8, 1.2);
    const vx = Math.cos(dir) * speed;
    const vy = Math.sin(dir) * speed;

    this.pushAsteroid(x, y, vx, vy);
  }

  private pushAsteroid(x: number, y: number, vx: number, vy: number): void {
    const challenge = generateChallengeForMode(
      this.sceneProps.challengeMode ?? 'math',
      { tier: this.sceneProps.tier, mathType: this.sceneProps.mathType },
    );

    const shape = this.add.graphics();
    drawAsteroidShape(shape, ASTEROID_RADIUS);

    // Verbal prompts ("Means the same as BIG") are far longer than "7 + 3",
    // so shrink + word-wrap them to fit the rock; numeric keeps the big font.
    const isChoice = challenge.kind === 'choice';
    const label = this.add.text(0, 0, challenge.prompt, {
      fontSize: isChoice ? '11px' : '18px',
      fontStyle: 'bold',
      color: '#fef3c7',
      fontFamily: isChoice ? 'sans-serif' : 'monospace',
      align: 'center',
      ...(isChoice ? { wordWrap: { width: ASTEROID_RADIUS * 1.8 } } : {}),
    }).setOrigin(0.5);
    label.setShadow(0, 1, '#000000', 3, true, true);

    const group = this.add.container(x, y, [shape, label]);
    group.setDepth(10);

    this.asteroids.push({
      group,
      label,
      x,
      y,
      vx,
      vy,
      radius: ASTEROID_RADIUS,
      challenge,
      frozen: false,
    });
  }

  private drawHud(): void {
    // Theme-module HUD chrome — same translucent panels every other game uses.
    this.scoreBadge = drawScoreBadge(this, {
      anchor: 'tl',
      width: 110,
      initialValue: '0',
    });
    this.livesRow = drawLivesRow(this, {
      x: 130,
      y: 26,
      max: MAX_LIVES,
      initialLives: this.lives,
      fontSize: 22,
    });
    // Timer top-right (replaces the static difficulty badge — kids picked
    // difficulty in the launcher; the round-length cue matters more
    // mid-game).
    this.roundMs = getSessionDurationMs();
    this.timerBadge = drawTimerBadge(this, {
      anchor: 'tr',
      viewW: VIEW_W,
      initialValue: `${Math.floor(this.roundMs / 60000)}:${String(Math.floor((this.roundMs % 60000) / 1000)).padStart(2, '0')}`,
    });
  }

  private refreshHud(): void {
    this.livesRow.setLives(this.lives);
    this.scoreBadge.setValue(String(this.score));
  }

  private drawStartHint(): void {
    const midY = (HUD_RESERVED_TOP + PLAYFIELD_BOTTOM) / 2;
    this.startHint = this.add.text(VIEW_W / 2, midY - 60, 'Blast the Rocks!', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(60);
    this.startHintSub = this.add.text(
      VIEW_W / 2, midY - 28,
      'Solve the math to destroy them.',
      { fontSize: '13px', color: '#cbd5e1' },
    ).setOrigin(0.5).setDepth(60);
  }

  private drawTouchControls(): void {
    const y = PLAYFIELD_BOTTOM + TOUCH_BAR_H / 2;
    const btnW = 88;
    const btnH = 64;
    const gap = 8;

    // Layout: [Rot L] [Thrust] [Rot R]           [Fire]
    const leftX  = 24 + btnW / 2;
    const thrustX = leftX + btnW + gap;
    const rightX = thrustX + btnW + gap;
    const fireX = VIEW_W - 24 - btnW / 2;

    const makeBtn = (x: number, label: string, colorTop: number, colorBot: number): Phaser.GameObjects.Container => {
      const bg = this.add.rectangle(0, 0, btnW, btnH, colorBot)
        .setStrokeStyle(2, colorTop);
      const txt = this.add.text(0, 0, label, {
        fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5);
      const c = this.add.container(x, y, [bg, txt]).setDepth(45);
      c.setSize(btnW, btnH);
      c.setInteractive({ useHandCursor: true });
      // Visual press feedback.
      c.on('pointerdown', () => {
        bg.setScale(0.94);
      });
      c.on('pointerup', () => bg.setScale(1));
      c.on('pointerout', () => bg.setScale(1));
      return c;
    };

    const leftBtn   = makeBtn(leftX,   '↺', 0x86efac, 0x064e3b);
    const rightBtn  = makeBtn(rightX,  '↻', 0x86efac, 0x064e3b);
    const thrustBtn = makeBtn(thrustX, '▲', 0xfbbf24, 0x78350f);
    const fireBtn   = makeBtn(fireX,   '●', 0xfca5a5, 0x7f1d1d);

    // Hold-to-activate semantics for rotation + thrust.
    leftBtn.on('pointerdown', () => { this.rotLeft = true; this.startIfNeeded(); });
    leftBtn.on('pointerup',   () => { this.rotLeft = false; });
    leftBtn.on('pointerout',  () => { this.rotLeft = false; });

    rightBtn.on('pointerdown', () => { this.rotRight = true; this.startIfNeeded(); });
    rightBtn.on('pointerup',   () => { this.rotRight = false; });
    rightBtn.on('pointerout',  () => { this.rotRight = false; });

    thrustBtn.on('pointerdown', () => { this.thrust = true; this.startIfNeeded(); });
    thrustBtn.on('pointerup',   () => { this.thrust = false; });
    thrustBtn.on('pointerout',  () => { this.thrust = false; });

    fireBtn.on('pointerdown', () => { this.startIfNeeded(); this.fire(); });
  }

  private installInput(): void {
    const kb = this.input.keyboard;
    if (!kb) return;

    kb.on('keydown-LEFT',  () => { this.rotLeft = true; this.startIfNeeded(); });
    kb.on('keyup-LEFT',    () => { this.rotLeft = false; });
    kb.on('keydown-RIGHT', () => { this.rotRight = true; this.startIfNeeded(); });
    kb.on('keyup-RIGHT',   () => { this.rotRight = false; });
    kb.on('keydown-UP',    () => { this.thrust = true; this.startIfNeeded(); });
    kb.on('keyup-UP',      () => { this.thrust = false; });
    // Fire is discrete (cooldown-gated in fire()).
    kb.on('keydown-SPACE', () => { this.startIfNeeded(); this.fire(); });
  }

  /** First meaningful input begins the session: run 3-2-1 countdown then
   *  let update() start acting on inputs. */
  private startIfNeeded(): void {
    if (this.started || this.dead) return;
    this.started = true;
    this.startHint?.destroy();
    this.startHint = undefined;
    this.startHintSub?.destroy();
    this.startHintSub = undefined;
    // Pause motion while countdown plays. The 3-min round officially
    // begins when the countdown completes — that's when we anchor
    // sessionStart so the timer doesn't burn during 3-2-1.
    this.runCountdown(() => {
      this.sessionStart = Date.now();
      this.pauseMs = 0;
      this.pauseStartedAt = 0;
      this.lastTickSec = -1;
    });
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  update(time: number, delta: number): void {
    if (this.paused || this.dead || !this.started) {
      this.drawFlame(false);
      return;
    }

    const dt = delta / 1000;

    // Ship rotation
    if (this.rotLeft)  this.ship.rotation -= ROT_SPEED * dt;
    if (this.rotRight) this.ship.rotation += ROT_SPEED * dt;

    // Keep the cockpit cupcake upright regardless of the ship's heading.
    this.cockpitCake?.setRotation(-this.ship.rotation);

    // Thrust
    if (this.thrust) {
      this.shipVx += Math.cos(this.ship.rotation) * this.tuning.shipThrust * dt;
      this.shipVy += Math.sin(this.ship.rotation) * this.tuning.shipThrust * dt;
    }
    this.drawFlame(this.thrust);

    // Drag (multiplicative per second → frame-rate independent).
    const dragFactor = Math.pow(1 - this.tuning.shipDrag, dt);
    this.shipVx *= dragFactor;
    this.shipVy *= dragFactor;

    // Cap speed
    const speedSq = this.shipVx * this.shipVx + this.shipVy * this.shipVy;
    const maxSq = this.tuning.shipMaxSpeed * this.tuning.shipMaxSpeed;
    if (speedSq > maxSq) {
      const k = this.tuning.shipMaxSpeed / Math.sqrt(speedSq);
      this.shipVx *= k;
      this.shipVy *= k;
    }

    // Integrate + wrap (ship stays inside the playfield bounds vertically).
    this.ship.x = wrapX(this.ship.x + this.shipVx * dt);
    this.ship.y = wrapPlayfieldY(this.ship.y + this.shipVy * dt);

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x = wrapX(b.x + b.vx * dt);
      b.y = wrapPlayfieldY(b.y + b.vy * dt);
      b.sprite.setPosition(b.x, b.y);
      if (time >= b.expiresAt) {
        b.sprite.destroy();
        this.bullets.splice(i, 1);
      }
    }

    // Asteroids (skip frozen ones — they sit still until their modal resolves).
    for (const a of this.asteroids) {
      if (a.frozen) continue;
      a.x = wrapX(a.x + a.vx * dt);
      a.y = wrapPlayfieldY(a.y + a.vy * dt);
      a.group.setPosition(a.x, a.y);
    }

    // Bullet × asteroid collisions
    for (let bi = this.bullets.length - 1; bi >= 0; bi--) {
      const b = this.bullets[bi];
      for (const a of this.asteroids) {
        if (a.frozen) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < (a.radius + BULLET_RADIUS) * (a.radius + BULLET_RADIUS)) {
          b.sprite.destroy();
          this.bullets.splice(bi, 1);
          this.openChallenge(a, 'bullet');
          return; // scene is paused now; bail out of update.
        }
      }
    }

    // Ship × asteroid collision (respects immunity)
    const immune = time < this.immuneUntil;
    if (!immune) {
      for (const a of this.asteroids) {
        if (a.frozen) continue;
        const dx = a.x - this.ship.x;
        const dy = a.y - this.ship.y;
        if (dx * dx + dy * dy < (a.radius + SHIP_SIZE * 0.7) * (a.radius + SHIP_SIZE * 0.7)) {
          this.handleCollision(a);
          return;
        }
      }
    }

    // Round timer — only ticks during active play (paused/dead/!started
    // bail out at the top of update). pauseMs is subtracted so the
    // math modal doesn't burn the round.
    const elapsed = Date.now() - this.sessionStart - this.pauseMs;
    const remaining = Math.max(0, this.roundMs - elapsed);
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
  // Actions
  // -------------------------------------------------------------------------

  private fire(): void {
    if (!this.started || this.paused || this.dead) return;
    const now = this.time.now;
    if (now - this.lastFireAt < FIRE_COOLDOWN_MS) return;
    this.lastFireAt = now;

    const rot = this.ship.rotation;
    // Spawn at the ship nose.
    const noseX = this.ship.x + Math.cos(rot) * (SHIP_SIZE + 2);
    const noseY = this.ship.y + Math.sin(rot) * (SHIP_SIZE + 2);
    // Bullet inherits a bit of ship velocity so thrusting shots "lead".
    const vx = Math.cos(rot) * BULLET_SPEED + this.shipVx * 0.4;
    const vy = Math.sin(rot) * BULLET_SPEED + this.shipVy * 0.4;

    const sprite = this.add.circle(noseX, noseY, BULLET_RADIUS, 0xffffff)
      .setStrokeStyle(1, 0xfde68a).setDepth(15);

    this.bullets.push({
      sprite,
      x: noseX,
      y: noseY,
      vx,
      vy,
      expiresAt: now + BULLET_TTL_MS,
    });

    this.emitSfx('tap');
  }

  private openChallenge(asteroid: Asteroid, source: ModalSource): void {
    this.paused = true;
    this.pauseStartedAt = Date.now();
    asteroid.frozen = true;
    this.pending = { asteroid, source };

    const reason = source === 'collision'
      ? '💥 Hit! Solve to continue'
      : '🎯 Locked on — solve to blast';

    this.hostBus.emit('challenge:open', { challenge: asteroid.challenge, reason });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    if (!this.pending) return;
    const { asteroid, source } = this.pending;

    if (payload.correct) {
      // Explode the asteroid and respawn a fresh one.
      this.pending = null;
      this.accumulatePauseAndResume();
      this.explodeAsteroid(asteroid);
      // Theme-module sparkle on each rock destruction so the catalog
      // shares its "you got the math right" celebration vocabulary.
      sparkleAt(this, asteroid.x, asteroid.y, { count: 7, spread: 40, fontSize: 16, rise: 26 });
      this.score++;
      this.refreshHud();
      this.emitSfx('win');
      this.spawnAsteroidAtEdge();
      return;
    }

    // Wrong answer.
    this.wrongAnswers++;

    if (source === 'collision') {
      // Sticky retry — modal re-opens after a beat so the red flash plays.
      this.emitSfx('wrong');
      this.time.delayedCall(STICKY_RETRY_DELAY_MS, () => {
        if (this.dead) return;
        this.hostBus.emit('challenge:open', {
          challenge: asteroid.challenge,
          reason: '💥 Try again — solve to continue',
        });
      });
      return;
    }

    // Bullet + wrong → close modal, asteroid resumes drifting. Kid re-shoots to retry.
    asteroid.frozen = false;
    this.pending = null;
    this.accumulatePauseAndResume();
    this.emitSfx('wrong');
  }

  /** Roll the time spent in the math modal into pauseMs and clear the
   *  start marker. Called whenever the modal closes for real (correct
   *  answer, or a bullet-wrong that doesn't sticky-re-open). For sticky
   *  collision-wrong we deliberately leave pauseStartedAt set so the
   *  pause accumulates across the kid's retry-loop. */
  private accumulatePauseAndResume(): void {
    if (this.pauseStartedAt > 0) {
      this.pauseMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.paused = false;
  }

  private handleCollision(asteroid: Asteroid): void {
    this.lives--;
    this.refreshHud();
    this.showLifeLost();
    this.emitSfx('escape');

    if (this.lives <= 0) {
      // No sticky modal — game's over immediately.
      this.endSession(false);
      return;
    }

    // Immunity window so the ship isn't clobbered while the modal is up.
    this.immuneUntil = this.time.now + IMMUNITY_MS;
    this.tweens.add({
      targets: this.ship,
      alpha: { from: 0.3, to: 1 },
      duration: 400,
      ease: 'Sine.easeOut',
    });
    // Briefly push the ship away from the asteroid so it's not still overlapping
    // when immunity ends.
    const dx = this.ship.x - asteroid.x;
    const dy = this.ship.y - asteroid.y;
    const len = Math.hypot(dx, dy) || 1;
    this.shipVx = (dx / len) * this.tuning.shipMaxSpeed * 0.6;
    this.shipVy = (dy / len) * this.tuning.shipMaxSpeed * 0.6;

    // Open the sticky math modal for this asteroid.
    this.openChallenge(asteroid, 'collision');
  }

  private showLifeLost(): void {
    const flash = this.add.rectangle(
      VIEW_W / 2, VIEW_H / 2, VIEW_W, VIEW_H, 0xdc2626,
    ).setAlpha(0.45).setDepth(80);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    const banner = this.add.text(VIEW_W / 2, VIEW_H / 2, '−1 LIFE', {
      fontSize: '56px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(90).setScale(0.4);
    banner.setShadow(0, 3, '#7f1d1d', 10, true, true);
    this.tweens.add({
      targets: banner,
      scale: 1.25,
      y: VIEW_H / 2 - 70,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => banner.destroy(),
    });

    bigHitFx(this, { flashMs: 0, shakeMs: 200, shakeIntensity: 0.008 });
  }

  private explodeAsteroid(asteroid: Asteroid): void {
    // Expanding ring → fades out and destroys. Tweening scale is more
    // robust than animating geometry on Phaser.GameObjects.Arc.
    const ring = this.add.circle(asteroid.x, asteroid.y, asteroid.radius, 0xfbbf24, 0)
      .setStrokeStyle(3, 0xfbbf24).setDepth(12);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    const idx = this.asteroids.indexOf(asteroid);
    if (idx >= 0) this.asteroids.splice(idx, 1);
    asteroid.group.destroy();
  }

  // -------------------------------------------------------------------------
  // 3-2-1 countdown
  // -------------------------------------------------------------------------

  private runCountdown(onComplete: () => void): void {
    this.paused = true;
    const text = this.add.text(VIEW_W / 2, VIEW_H / 2, '', {
      fontSize: '120px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(100);
    text.setShadow(0, 4, '#000000', 12, true, true);

    let i = 0;
    const tick = (): void => {
      text.setText(COUNTDOWN_STEPS[i]);
      text.setColor(i === COUNTDOWN_STEPS.length - 1 ? '#facc15' : '#ffffff');
      text.setScale(0.4).setAlpha(1);
      this.emitSfx(i === COUNTDOWN_STEPS.length - 1 ? 'start' : 'tick');
      this.tweens.add({
        targets: text,
        scale: 1.25,
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
  // Session end / reset
  // -------------------------------------------------------------------------

  private endSession(completed: boolean): void {
    if (this.dead) return;
    this.dead = true;
    this.emitSfx('timeUp');
    const summary = buildSessionSummary({
      score: this.score,
      wrongAnswers: this.wrongAnswers,
      sessionStart: this.sessionStart,
      completed,
    });
    this.hostBus.emit('session:end', { summary });
  }

  private resetScene(): void {
    for (const a of this.asteroids) a.group.destroy();
    this.asteroids = [];
    for (const b of this.bullets) b.sprite.destroy();
    this.bullets = [];

    this.score = 0;
    this.wrongAnswers = 0;
    this.lives = MAX_LIVES;
    this.started = false;
    this.paused = false;
    this.dead = false;
    this.immuneUntil = 0;
    this.sessionStart = Date.now();
    this.pauseStartedAt = 0;
    this.pauseMs = 0;
    this.lastTickSec = -1;
    this.timerBadge.setMs(this.roundMs);
    this.timerBadge.setWarning(false);
    this.pending = null;
    this.shipVx = 0;
    this.shipVy = 0;
    this.rotLeft = this.rotRight = this.thrust = false;

    this.ship.setPosition(VIEW_W / 2, (HUD_RESERVED_TOP + PLAYFIELD_BOTTOM) / 2);
    this.ship.setRotation(-Math.PI / 2);
    this.ship.setAlpha(1);

    this.spawnInitialAsteroids();
    this.refreshHud();
    if (!this.startHint) this.drawStartHint();
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}

// ---------------------------------------------------------------------------
// Module helpers
// ---------------------------------------------------------------------------

/** Wrap x onto [0, VIEW_W). */
function wrapX(x: number): number {
  return ((x % VIEW_W) + VIEW_W) % VIEW_W;
}

/** Wrap y onto the playfield band so ships/asteroids don't leak into HUD
 *  or touch-button zones. */
function wrapPlayfieldY(y: number): number {
  const top = HUD_RESERVED_TOP;
  const bottom = PLAYFIELD_BOTTOM;
  const span = bottom - top;
  return top + (((y - top) % span) + span) % span;
}

/** Draw a rough polygon asteroid centered at (0,0) with the given radius. */
function drawAsteroidShape(g: Phaser.GameObjects.Graphics, r: number): void {
  g.clear();
  g.lineStyle(2, 0xcbd5e1, 1);
  g.fillStyle(0x1e293b, 0.95);

  const verts = 9;
  g.beginPath();
  for (let i = 0; i < verts; i++) {
    const theta = (i / verts) * Math.PI * 2;
    const jitter = Phaser.Math.FloatBetween(0.78, 1.08);
    const x = Math.cos(theta) * r * jitter;
    const y = Math.sin(theta) * r * jitter;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillPath();
  g.strokePath();
}

// AsteroidsSceneFactory moved to AsteroidsScene.factory.ts — that sibling
// file has no top-level Phaser import, so it's safe to import from server-
// rendered routes. The factory's `create()` dynamically imports this module
// on the client.
