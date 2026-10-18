// Flappy Math as a Phaser 3 scene.
//
// Gameplay (refined per a kid ticket, 2026-04-18):
//   - Bird at fixed x, gravity-driven y, flap applies instant upward vel
//   - Pipes scroll left; every other pipe is a "gate" pipe (math/reading
//     challenge). Regular pipes in between act as recovery lanes.
//   - Hitting a regular pipe now costs 1 of 3 lives (no math modal).
//     Bird auto-respawns with 2s immunity. Lives hit 0 → game over.
//   - Reaching a gate still triggers a challenge → correct = advance
//     phase (gap shrinks, speed grows) + 3-2-1 countdown before pipes
//     resume; wrong = game over
//   - A 3-2-1-GO countdown also runs on first flap so the kid gets a
//     moment to orient after tapping Play / Play Again
//   - HUD renders in-canvas: ❤️ lives top-left, score top-center,
//     phase top-right
//
// Communicates with the React host through an injected EventEmitter
// (`game.registry.get('hostBus')`). Never touches /api/attempts or any
// React state directly — the host handles that.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import { getSessionDurationMs } from '@/lib/games/session-duration';
import type { Challenge } from '@/lib/games/shared/challenge';
import {
  buildSessionSummary,
  type SoundName,
} from '@/lib/games/phaser/session';
// Non-Phaser exports (dimensions, key, types, factory) live in the sibling
// .factory.ts so shells don't need to import this Phaser-using module.
import {
  FLAPPY_SCENE_KEY,
  FLAPPY_VIEW_W,
  FLAPPY_VIEW_H,
  type FlappyControls,
  type FlappyDifficulty,
  type FlappySceneProps,
} from './FlappyScene.factory';
import {
  GRASS,
  drawSkyBands,
  drawCakeySun,
  drawCakeyCloud,
  drawScoreBadge,
  drawLivesRow,
  drawTimerBadge,
  type BadgeHandle,
  type LivesHandle,
  type TimerHandle,
  sparkleAt,
  bigHitFx,
  drawCakeyPlane,
  drawBaBearPlane,
} from '@/lib/games/theme';

// ---------------------------------------------------------------------------
// Constants (carried over from the original FlappyMath.tsx)
// ---------------------------------------------------------------------------

// Re-alias the factory-owned dims to the short names this file's code uses.
const VIEW_W = FLAPPY_VIEW_W;
const VIEW_H = FLAPPY_VIEW_H;
const BIRD_X = 100;
const BIRD_SIZE = 32;
const PIPE_W = 56;
const PIPE_SPACING = 240;
const GROUND_H = 60;
// Every 2nd pipe is a math-challenge gate (was every 5th). Kids get more
// practice reps and the regular pipes in between act as recovery lanes.
const PIPES_PER_PHASE = 2;
const IMMUNITY_MS = 2000;
const MAX_LIVES = 3;

// Round length = the kid's chosen 1/2/3-min pick (see session-duration).
// Lives-out ends earlier; the timer caps the session otherwise.
const TICK_LAST_MS = 30_000;

// Countdown timing: 3 → 2 → 1 → GO!, each step scale-fading over 700ms.
const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;
const COUNTDOWN_STEP_MS = 700;

// ---------------------------------------------------------------------------
// Difficulty presets
// ---------------------------------------------------------------------------
// Per-session "flight mode" — controls physics feel only, not math generator.
// Tune these if kids' playtesting shows a preset is too floaty or too punchy.
//   gravity      — px/s² pull; lower = floatier, more reaction time
//   flapVel      — px/s upward on flap; scaled with gravity to keep jump shape
//   pipeGapBase  — starting vertical gap; biggest lever on "easy vs. hard"
//   pipeGapShrink — px removed per phase advance
//   pipeSpeedBase — starting horizontal scroll speed
//   pipeSpeedGrow — px/s added per phase advance

interface FlappyTuning {
  gravity: number;
  flapVel: number;
  pipeGapBase: number;
  pipeGapShrink: number;
  pipeSpeedBase: number;
  pipeSpeedGrow: number;
}

const DIFFICULTY_TUNING: Record<FlappyDifficulty, FlappyTuning> = {
  easy:   { gravity: 1000, flapVel: -360, pipeGapBase: 215, pipeGapShrink: 4, pipeSpeedBase: 85,  pipeSpeedGrow: 6  },
  medium: { gravity: 1200, flapVel: -400, pipeGapBase: 195, pipeGapShrink: 6, pipeSpeedBase: 100, pipeSpeedGrow: 8  },
  hard:   { gravity: 1500, flapVel: -450, pipeGapBase: 160, pipeGapShrink: 8, pipeSpeedBase: 130, pipeSpeedGrow: 12 },
};

const DEFAULT_DIFFICULTY: FlappyDifficulty = 'medium';
const DEFAULT_CONTROLS: FlappyControls = 'tap';

// Drag-mode tuning — the bird follows the pointer Y via a critically-damped
// lerp. Lower DRAG_FOLLOW = floatier / laggier; higher = snappier / stiffer.
// 12 feels responsive without being twitchy on an iPad finger-drag.
const DRAG_FOLLOW = 12;
const DRAG_MAX_SPEED = 520;

interface PipePair {
  /** Parent container so we can scroll + destroy as one unit. */
  group: Phaser.GameObjects.Container;
  /** Top pipe body (used for overlap). */
  top: Phaser.GameObjects.Rectangle;
  /** Bottom pipe body (used for overlap). */
  bot: Phaser.GameObjects.Rectangle;
  x: number;
  gapY: number;
  passed: boolean;
  isGate: boolean;
  gateTriggered: boolean;
  /** Gate pipes only: the chain + calculator "lock" blocking the gap.
   *  Cleared (with a break-apart tween) when the challenge is answered
   *  correctly — see breakGateLock(). */
  lock?: {
    chainTop: Phaser.GameObjects.Graphics;
    chainBot: Phaser.GameObjects.Graphics;
    calc: Phaser.GameObjects.Container;
  };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class FlappyScene extends Phaser.Scene {
  // injected
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: FlappySceneProps;
  private tuning: FlappyTuning = DIFFICULTY_TUNING[DEFAULT_DIFFICULTY];
  private controls: FlappyControls = DEFAULT_CONTROLS;

  // game objects — `bird` is the Container returned by drawCakeyPlane;
  // physics + tweens act on the Container directly. The inner Graphics
  // is encapsulated inside drawCakeyPlane and not referenced again.
  private bird!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Rectangle;
  private pipes: PipePair[] = [];
  private startHint?: Phaser.GameObjects.Text;
  private startHintSub?: Phaser.GameObjects.Text;

  // HUD — handles from the shared theme module so chrome stays consistent.
  private scoreBadge!: BadgeHandle;
  private timerBadge!: TimerHandle;
  private livesRow!: LivesHandle;
  // Round length captured at create() from the kid's chosen 1/2/3-min pick.
  private roundMs = 3 * 60 * 1000;

  // Round timer — pause-aware. pauseStartedAt > 0 while the math modal
  // is up; pauseMs accumulates total paused time so the timer only
  // counts active gameplay (no penalty for slow math answers).
  private pauseStartedAt = 0;
  private pauseMs = 0;
  private lastTickSec = -1;

  // state
  private started = false;
  private paused = false;           // true while challenge modal OR countdown is up
  private dead = false;             // true while waiting for game-over POST
  private score = 0;
  private wrongAnswers = 0;
  private phase = 1;
  private lives = MAX_LIVES;
  private immuneUntil = 0;
  private sessionStart = 0;
  private awaitingGatePipe: PipePair | null = null;
  // Tracks which kind of challenge the host modal is currently resolving.
  //   'gate'      — phase gate; wrong answer ends the game
  //   'lifesaver' — drag-mode life-loss; correct refunds the life
  //   null        — no modal open
  private pendingChallengeKind: 'gate' | 'lifesaver' | null = null;

  // Drag-mode state — only used when `controls === 'drag'`.
  private dragPointerActive = false;
  private dragTargetY = VIEW_H / 3;

  // derived — pull tuning from the selected difficulty preset.
  private get pipeGap(): number {
    return this.tuning.pipeGapBase - (this.phase - 1) * this.tuning.pipeGapShrink;
  }
  private get pipeSpeed(): number {
    return this.tuning.pipeSpeedBase + (this.phase - 1) * this.tuning.pipeSpeedGrow;
  }

  constructor() {
    super(FLAPPY_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as FlappySceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.phase = this.sceneProps.startPhase ?? 1;
    this.tuning = DIFFICULTY_TUNING[this.sceneProps.difficulty ?? DEFAULT_DIFFICULTY];
    this.controls = this.sceneProps.controls ?? DEFAULT_CONTROLS;
    this.sessionStart = Date.now();

    this.drawBackground();
    this.createBird();
    this.spawnInitialPipes();
    this.drawHud();
    this.drawStartHint();
    this.installInput();

    // Listen for host events.
    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);

    // Clean up when scene shuts down.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  private drawBackground(): void {
    // Sky bands (theme primitive). Sized to leave room for the ground.
    const skyH = VIEW_H - GROUND_H;
    drawSkyBands(this, {
      viewW: VIEW_W,
      topH: skyH * 0.45,
      midH: skyH * 0.35,
      lowH: skyH * 0.20,
    });

    // Cake-themed sun in the upper right + a couple drifting clouds for
    // visual life. Sun rays slowly rotate; clouds loop horizontally.
    drawCakeySun(this, VIEW_W - 80, 70);
    drawCakeyCloud(this, { x: 120, y: 90, scale: 0.8, driftSpeedSec: 14, viewW: VIEW_W });
    drawCakeyCloud(this, { x: 320, y: 160, scale: 0.65, driftSpeedSec: 18, viewW: VIEW_W });

    // Grass-colored ground (theme palette tokens for visual consistency).
    this.ground = this.add.rectangle(VIEW_W / 2, VIEW_H - GROUND_H / 2, VIEW_W, GROUND_H, GRASS.LIT);
    this.add.rectangle(VIEW_W / 2, VIEW_H - GROUND_H + 2, VIEW_W, 4, GRASS.MID);
  }

  private createBird(): void {
    // The "bird" is a mascot-in-a-plane — same physics body + same
    // tween targets either way; birdStyle only swaps the visual. Both
    // draw functions return identically-sized Containers.
    this.bird =
      this.sceneProps.birdStyle === 'ba-bear'
        ? drawBaBearPlane(this, BIRD_X, VIEW_H / 3)
        : drawCakeyPlane(this, BIRD_X, VIEW_H / 3, {
            cupcakeConfig: this.sceneProps.cupcakeConfig,
          });
    this.bird.setSize(BIRD_SIZE, BIRD_SIZE);

    this.physics.world.enable(this.bird);
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setSize(BIRD_SIZE * 0.8, BIRD_SIZE * 0.8);
    body.setAllowGravity(false); // gravity kicks in after first flap
    body.setVelocity(0, 0);
  }

  private spawnInitialPipes(): void {
    for (let i = 0; i < 4; i++) {
      const isGate = (i + 1) % PIPES_PER_PHASE === 0;
      this.addPipe(VIEW_W + 100 + i * PIPE_SPACING, isGate);
    }
  }

  private addPipe(x: number, isGate: boolean): void {
    const minGapY = 100;
    const maxGapY = VIEW_H - GROUND_H - 100;
    const gapY = Phaser.Math.Between(minGapY, maxGapY);
    const gap = this.pipeGap;
    const color = isGate ? 0xfb7185 : 0x6ee7b7;
    const stroke = isGate ? 0xe11d48 : 0x10b981;

    const container = this.add.container(x, 0);
    const topH = gapY - gap / 2;
    const botY = gapY + gap / 2;
    const botH = VIEW_H - GROUND_H - botY;

    const top = this.add.rectangle(PIPE_W / 2, topH / 2, PIPE_W, topH, color)
      .setStrokeStyle(2, stroke);
    const bot = this.add.rectangle(PIPE_W / 2, botY + botH / 2, PIPE_W, botH, color)
      .setStrokeStyle(2, stroke);

    const topCap = this.add.rectangle(PIPE_W / 2, topH - 10, PIPE_W + 8, 20, color)
      .setStrokeStyle(2, stroke);
    const botCap = this.add.rectangle(PIPE_W / 2, botY + 10, PIPE_W + 8, 20, color)
      .setStrokeStyle(2, stroke);

    container.add([top, bot, topCap, botCap]);

    // Gate pipes: the gap is chained off with a little calculator
    // "lock" in the middle — the kid has to crack the code (answer the
    // challenge) to break the chain and pass. Replaces the old flat
    // 'GATE' text label.
    let lock: PipePair['lock'];
    if (isGate) {
      const cx = PIPE_W / 2;
      const gapTop = gapY - gap / 2;
      const gapBot = gapY + gap / 2;

      const chainTop = this.add.graphics();
      this.drawChainStrip(chainTop, cx, gapTop, gapY - 16);
      const chainBot = this.add.graphics();
      this.drawChainStrip(chainBot, cx, gapY + 16, gapBot);

      // Mini calculator: slate body, mint screen showing "?", 3×3
      // button grid. Vector-drawn so it scales crisply with the canvas.
      const calc = this.add.container(cx, gapY);
      const cg = this.add.graphics();
      cg.fillStyle(0x334155, 1);
      cg.lineStyle(2, 0x0f172a, 1);
      cg.fillRoundedRect(-11, -13, 22, 26, 4);
      cg.strokeRoundedRect(-11, -13, 22, 26, 4);
      cg.fillStyle(0xbbf7d0, 1);
      cg.fillRoundedRect(-8, -10, 16, 7, 2);
      cg.fillStyle(0xe2e8f0, 1);
      for (const bx of [-6, 0, 6]) {
        for (const by of [1, 5.5, 10]) {
          cg.fillCircle(bx, by, 1.6);
        }
      }
      calc.add(cg);
      calc.add(
        this.add.text(0, -6.5, '?', {
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#065f46',
        }).setOrigin(0.5),
      );

      container.add([chainTop, chainBot, calc]);
      lock = { chainTop, chainBot, calc };
    }

    this.pipes.push({
      group: container,
      top,
      bot,
      x,
      gapY,
      passed: false,
      isGate,
      gateTriggered: false,
      lock,
    });
  }

  /** Vertical chain of alternating wide/narrow links (front-facing and
   *  edge-on, the classic cartoon chain read) from yStart to yEnd. */
  private drawChainStrip(
    g: Phaser.GameObjects.Graphics,
    x: number,
    yStart: number,
    yEnd: number,
  ): void {
    g.lineStyle(2, 0x64748b, 1);
    let i = 0;
    for (let y = yStart + 6; y <= yEnd - 5; y += 9, i++) {
      g.strokeEllipse(x, y, i % 2 === 0 ? 8 : 4, 11);
    }
  }

  /** "Code cracked!" — chain halves fly apart, the calculator lock
   *  tumbles away, and the gap reads as visually open. Runs during the
   *  post-answer countdown (our `paused` flag freezes update(), not
   *  Phaser's tween manager). */
  private breakGateLock(p: PipePair): void {
    if (!p.lock) return;
    const { chainTop, chainBot, calc } = p.lock;
    p.lock = undefined;
    this.tweens.add({
      targets: chainTop,
      y: '-=26', alpha: 0,
      duration: 420, ease: 'Cubic.easeIn',
    });
    this.tweens.add({
      targets: chainBot,
      y: '+=26', alpha: 0,
      duration: 420, ease: 'Cubic.easeIn',
    });
    this.tweens.add({
      targets: calc,
      y: '+=46', angle: 150, alpha: 0,
      duration: 520, ease: 'Cubic.easeIn',
    });
    sparkleAt(this, p.group.x + PIPE_W / 2, p.gapY, {
      count: 6, spread: 24, fontSize: 14, rise: 24,
    });
  }

  private drawStartHint(): void {
    const main = this.controls === 'drag' ? 'Drag to Steer!' : 'Tap to Flap!';
    const sub = this.controls === 'drag'
      ? 'Hold finger anywhere; bird follows. Math saves your life!'
      : 'Avoid the pipes. Crack the code to break the chains!';
    this.startHint = this.add.text(VIEW_W / 2, VIEW_H / 2 - 20, main, {
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#1e293b',
    }).setOrigin(0.5);
    this.startHintSub = this.add.text(
      VIEW_W / 2,
      VIEW_H / 2 + 20,
      sub,
      { fontSize: '14px', color: '#64748b' },
    ).setOrigin(0.5);
  }

  private drawHud(): void {
    // Score badge top-left (translucent panel, white text — same chrome
    // as Marble Maze and Water Balloons via the shared theme module).
    this.scoreBadge = drawScoreBadge(this, {
      anchor: 'tl',
      width: 110,
      initialValue: '0',
    });
    // Lives row sits next to the score badge — heart emojis grouped at
    // a fixed x/y so they don't compete with the badge for space.
    this.livesRow = drawLivesRow(this, {
      x: 130,
      y: 26,
      max: MAX_LIVES,
      initialLives: this.lives,
      fontSize: 22,
    });
    // Timer top-right (replaces the old phase badge — phase changes are
    // already telegraphed by the math-modal subtitle "Phase Gate —
    // entering phase N+1", which is the moment kids actually need that
    // info; static "Phase 1" badge was redundant).
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

  /** Roll the time spent in the math modal into pauseMs and clear the
   *  start marker. Called whenever the modal closes — even if we're
   *  about to enter a brief countdown pause (the countdown manages its
   *  own paused flag and doesn't need to participate in pauseMs). */
  private accumulatePauseAndResume(): void {
    if (this.pauseStartedAt > 0) {
      this.pauseMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    this.paused = false;
  }

  private installInput(): void {
    if (this.controls === 'drag') {
      // Drag-mode: pointer position = bird target Y. First pointerdown
      // still kicks off the countdown like tap-mode's first flap.
      this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (!this.started) {
          this.beginSession();
          this.dragTargetY = p.y;
          this.dragPointerActive = true;
          return;
        }
        if (this.paused || this.dead) return;
        this.dragPointerActive = true;
        this.dragTargetY = p.y;
      });
      this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
        if (!this.dragPointerActive) return;
        this.dragTargetY = p.y;
      });
      this.input.on('pointerup', () => { this.dragPointerActive = false; });
      return;
    }
    // Canvas tap = flap
    this.input.on('pointerdown', () => this.flap());
    // Space / ArrowUp
    this.input.keyboard?.on('keydown-SPACE', () => this.flap());
    this.input.keyboard?.on('keydown-UP', () => this.flap());
  }

  /** Shared first-input bootstrap: tears down the start hint and kicks
   *  off the 3-2-1-GO countdown. Used by both tap flap() and drag input. */
  private beginSession(): void {
    this.started = true;
    this.startHint?.destroy();
    this.startHint = undefined;
    this.startHintSub?.destroy();
    this.startHintSub = undefined;
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false); // hold during countdown
    body.setVelocity(0, 0);
    this.runCountdown(() => {
      const b = this.bird.body as Phaser.Physics.Arcade.Body;
      if (this.controls === 'drag') {
        // Drag mode: pure velocity control, no gravity.
        b.setAllowGravity(false);
        b.setMaxVelocity(DRAG_MAX_SPEED, DRAG_MAX_SPEED);
      } else {
        b.setAllowGravity(true);
        b.setGravityY(this.tuning.gravity);
      }
      // Round officially begins when the countdown completes.
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
    if (this.paused || this.dead) return;
    if (!this.started) return;

    const body = this.bird.body as Phaser.Physics.Arcade.Body;

    if (this.controls === 'drag') {
      // Critically-damped follow toward pointer Y. No gravity, no ground
      // death — drag-mode kids only lose lives by pipe collision.
      const dy = this.dragTargetY - this.bird.y;
      body.setVelocityY(Phaser.Math.Clamp(dy * DRAG_FOLLOW, -DRAG_MAX_SPEED, DRAG_MAX_SPEED));
      // Light rotation based on current velocity for visual feedback.
      this.bird.setRotation(Phaser.Math.Clamp(body.velocity.y / 800, -0.4, 0.8));
      // Soft ceiling/floor clamp (no death in drag mode).
      if (this.bird.y < BIRD_SIZE / 2) {
        this.bird.y = BIRD_SIZE / 2;
        body.setVelocityY(0);
      }
      const maxY = VIEW_H - GROUND_H - BIRD_SIZE / 2;
      if (this.bird.y > maxY) {
        this.bird.y = maxY;
        body.setVelocityY(0);
      }
    } else {
      // Rotation reflects velocity for that flappy feel.
      const vy = body.velocity.y;
      this.bird.setRotation(Phaser.Math.Clamp(vy / 600, -0.5, 1.1));

      // Ground collision
      const birdBottom = this.bird.y + BIRD_SIZE / 2;
      if (birdBottom >= VIEW_H - GROUND_H) {
        if (time < this.immuneUntil) {
          this.bird.y = VIEW_H - GROUND_H - BIRD_SIZE / 2;
          body.setVelocityY(0);
        } else {
          this.loseLife();
          return;
        }
      }
      // Ceiling clamp (no death)
      if (this.bird.y < BIRD_SIZE / 2) {
        this.bird.y = BIRD_SIZE / 2;
        body.setVelocityY(0);
      }
    }

    // Pipe movement + collision + scoring
    const speed = this.pipeSpeed;
    const dtSec = delta / 1000;
    const gap = this.pipeGap;
    const isImmune = time < this.immuneUntil;

    for (const p of this.pipes) {
      p.x -= speed * dtSec;
      p.group.x = p.x;

      const inX =
        BIRD_X + BIRD_SIZE / 2 > p.x && BIRD_X - BIRD_SIZE / 2 < p.x + PIPE_W;

      if (inX) {
        if (p.isGate && !p.gateTriggered && !p.passed) {
          p.gateTriggered = true;
          this.awaitingGatePipe = p;
          this.openGateChallenge();
          return;
        }

        if (!isImmune && (!p.isGate || p.passed)) {
          const birdTop = this.bird.y - BIRD_SIZE / 2;
          const birdBot = this.bird.y + BIRD_SIZE / 2;
          const gapTop = p.gapY - gap / 2;
          const gapBot = p.gapY + gap / 2;
          if (birdTop < gapTop || birdBot > gapBot) {
            this.loseLife();
            return;
          }
        }
      }

      if (!p.passed && p.x + PIPE_W < BIRD_X) {
        p.passed = true;
        this.score++;
        this.scoreBadge.setValue(String(this.score));
        // Satisfying whoosh as each pipe drops off behind the bird.
        this.emitSfx('swoop');
      }
    }

    // Cull + spawn new pipes
    for (let i = this.pipes.length - 1; i >= 0; i--) {
      if (this.pipes[i].x < -PIPE_W - 10) {
        this.pipes[i].group.destroy();
        this.pipes.splice(i, 1);
      }
    }
    const last = this.pipes[this.pipes.length - 1];
    if (last && last.x < VIEW_W) {
      const nextIndex = this.score + this.pipes.filter((p) => !p.passed).length;
      const isGate = (nextIndex + 1) % PIPES_PER_PHASE === 0;
      this.addPipe(last.x + PIPE_SPACING, isGate);
    }

    // Round timer — only ticks during active play (paused/dead/!started
    // bail out at the top of update). pauseMs is subtracted so math
    // gates don't burn the round.
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

  private flap(): void {
    if (this.paused || this.dead) return;
    if (this.controls === 'drag') return; // Drag mode ignores flap input.
    if (!this.started) {
      this.beginSession();
      return;
    }
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setVelocityY(this.tuning.flapVel);
    this.emitSfx('tap');
  }

  /** Lose one life. In tap mode: respawn with immunity if any lives remain,
   *  else end. In drag mode: always open a math "lifesaver" challenge —
   *  correct refunds the life, wrong proceeds (or ends the game at 0). */
  private loseLife(): void {
    this.lives--;
    this.refreshHud();
    this.emitSfx('escape');
    this.showLifeLost();

    if (this.controls === 'drag') {
      // Freeze until the kid answers. If they're now at 0 lives, a
      // correct answer still saves them (lives back to 1).
      this.openLifesaverChallenge();
      return;
    }

    if (this.lives <= 0) {
      this.endSession(false);
      return;
    }

    // Respawn at starting height with 2-second immunity, pipes pushed
    // forward so the kid has clear air ahead of them.
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    this.bird.setPosition(BIRD_X, VIEW_H / 3);
    body.setVelocity(0, 0);
    this.immuneUntil = this.time.now + IMMUNITY_MS;
    for (const p of this.pipes) {
      p.x += PIPE_SPACING * 0.6;
    }
    // Quick flash on the bird to signal "you just lost a life".
    this.tweens.add({
      targets: this.bird,
      alpha: { from: 0.3, to: 1 },
      duration: 300,
      ease: 'Sine.easeOut',
    });
  }

  /** Drag-mode only: after a pipe collision, open a math challenge that
   *  can refund the life. The host modal re-uses the generic
   *  challenge:open/result bus, distinguished by `pendingChallengeKind`. */
  private openLifesaverChallenge(): void {
    this.paused = true;
    this.pauseStartedAt = Date.now();
    this.pendingChallengeKind = 'lifesaver';
    this.dragPointerActive = false; // force a re-touch after resume

    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);

    // Always math for the lifesaver, even in Word Flap — but Word Flap
    // doesn't enable drag mode, so subject defaulting to math is fine.
    this.hostBus.emit('challenge:open', {
      challenge: this.buildMathChallenge(),
      reason: '❤️ Save your life! Answer to keep flying.',
    });
  }

  /** Big, unmissable feedback when a life is lost: red screen flash, floating
   *  "−1 LIFE" banner, and a short camera shake. Runs independently of the
   *  respawn so the cue fires even on the final (game-over) hit. */
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

    this.cameras.main.shake(200, 0.008);
  }

  /** The non-word-gate challenge — honors sceneProps.challengeMode ('verbal'
   *  → synonyms vocabulary) and mathStyle ('make-ten' → the "a + ❓ = 10"
   *  variant). Shared by the gate and the drag-mode lifesaver so both modals
   *  stay in the same style. Every gate reaches here now: the separate
   *  subject:'reading' branch existed only for Word Flap, which is gone. */
  private buildMathChallenge(): Challenge {
    return generateChallengeForMode(this.sceneProps.challengeMode ?? 'math', {
      tier: this.sceneProps.tier,
      mathType: this.sceneProps.mathType,
      mathStyle: this.sceneProps.mathStyle,
    });
  }

  private openGateChallenge(): void {
    this.paused = true;
    this.pauseStartedAt = Date.now();
    this.pendingChallengeKind = 'gate';
    const challenge = this.buildMathChallenge();
    const reason = `🚧 Phase Gate — entering phase ${this.phase + 1}`;
    this.hostBus.emit('challenge:open', { challenge, reason });
    // Freeze bird physics while modal is up.
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    const kind = this.pendingChallengeKind;
    this.pendingChallengeKind = null;

    if (kind === 'lifesaver') {
      // Drag-mode life-loss recovery.
      if (payload.correct) {
        this.lives++;               // refund
        this.refreshHud();
        this.emitSfx('correct');
        // Move pipes forward to give clear air on resume.
        for (const p of this.pipes) p.x += PIPE_SPACING * 0.6;
        this.immuneUntil = this.time.now + IMMUNITY_MS;
        this.accumulatePauseAndResume();
        this.runCountdown(() => { /* drag mode: no gravity to restore */ });
        return;
      }
      // Wrong answer.
      this.wrongAnswers++;
      if (this.lives <= 0) {
        this.accumulatePauseAndResume();
        this.endSession(false);
        return;
      }
      // Proceed with one less life, same respawn/immunity affordance tap
      // mode gets for free.
      this.bird.setPosition(BIRD_X, VIEW_H / 3);
      body.setVelocity(0, 0);
      this.immuneUntil = this.time.now + IMMUNITY_MS;
      for (const p of this.pipes) p.x += PIPE_SPACING * 0.6;
      this.accumulatePauseAndResume();
      this.runCountdown(() => { /* drag mode: no gravity to restore */ });
      return;
    }

    // Default: phase-gate challenge.
    if (!payload.correct) {
      this.wrongAnswers++;
      this.awaitingGatePipe = null;
      this.accumulatePauseAndResume();
      body.setAllowGravity(this.controls === 'tap');
      this.endSession(false);
      return;
    }

    // Correct gate → advance phase, mark pipe passable, countdown, resume.
    this.phase++;
    this.emitSfx('win');
    // Celebrate the phase advance with a sparkle burst around the bird +
    // a brief camera flash. Same theme effects every other game uses for
    // "you did the math right" moments.
    sparkleAt(this, this.bird.x, this.bird.y, { count: 8, spread: 36, fontSize: 16, rise: 28 });
    bigHitFx(this, { flashMs: 100, shakeMs: 0, shakeIntensity: 0 });
    if (this.awaitingGatePipe) {
      this.breakGateLock(this.awaitingGatePipe);
      this.awaitingGatePipe.passed = true;
      this.awaitingGatePipe = null;
    }
    this.refreshHud();
    this.accumulatePauseAndResume();
    // Keep paused through countdown; gravity stays off until GO so the
    // bird doesn't plummet mid-fanfare (tap mode only).
    this.runCountdown(() => {
      if (this.controls === 'tap') body.setAllowGravity(true);
    });
  }

  // -------------------------------------------------------------------------
  // 3-2-1-GO countdown overlay
  // -------------------------------------------------------------------------

  /**
   * Display a scale-fading 3 → 2 → 1 → GO! in the center of the canvas.
   * Sets `paused = true` for its duration so pipes freeze and the update()
   * loop short-circuits. Calls onComplete AFTER unpausing.
   */
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
      text.setScale(0.4);
      text.setAlpha(1);
      this.emitSfx(i === COUNTDOWN_STEPS.length - 1 ? 'start' : 'tick');
      this.tweens.add({
        targets: text,
        scale: 1.25,
        alpha: 0,
        duration: COUNTDOWN_STEP_MS,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          i++;
          if (i < COUNTDOWN_STEPS.length) {
            tick();
          } else {
            text.destroy();
            this.paused = false;
            onComplete();
          }
        },
      });
    };
    tick();
  }

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

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  private resetScene(): void {
    // Destroy pipes, reset state, respawn. Kids tap Play Again, no reload.
    for (const p of this.pipes) p.group.destroy();
    this.pipes = [];
    this.score = 0;
    this.wrongAnswers = 0;
    this.phase = this.sceneProps.startPhase ?? 1;
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
    this.awaitingGatePipe = null;
    this.pendingChallengeKind = null;
    this.dragPointerActive = false;
    this.dragTargetY = VIEW_H / 3;

    this.bird.setPosition(BIRD_X, VIEW_H / 3);
    this.bird.setRotation(0);
    this.bird.setAlpha(1);
    const body = this.bird.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);

    this.spawnInitialPipes();
    this.refreshHud();
    // Start hint reappears; first tap then runs the countdown.
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

// FlappySceneFactory moved to FlappyScene.factory.ts — that sibling file
// has no top-level Phaser import, so it's safe to import from server-rendered
// routes. The factory's `create()` dynamically imports this module on the
// client.
