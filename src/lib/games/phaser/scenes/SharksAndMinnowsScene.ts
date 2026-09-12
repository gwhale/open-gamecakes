// Sharks & Minnows — Phaser 3 port.
//
// Real-time chase mechanic:
//   - 8 minnows spawn off-screen left and drift rightward at varied speeds
//   - The shark starts at the right; kid taps/drags to move the shark's
//     target; the shark seeks that target
//   - When the shark reaches a minnow (distance < COLLISION_RADIUS), the
//     scene pauses and the React host shows the shared challenge modal
//   - Correct answer = minnow eaten, score++
//   - Wrong answer (or "let it go" from host modal) = minnow gets a 2s
//     immunity bubble and keeps drifting
//   - Minnow crosses off the right edge = "escaped"
//   - Session ends when all 8 minnows are either eaten or escaped
//
// Under the hood the shark seek uses the same exponential-decay easing
// the rAF version used: move `step = SHARK_SPEED * dt` toward target,
// clamped by remaining distance. No Phaser physics body needed — this
// is simpler and more predictable for a follow-finger UX.

import * as Phaser from 'phaser';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import {
  buildSessionSummary,
  type SoundName,
} from '@/lib/games/phaser/session';
import {
  drawScoreBadge,
  type BadgeHandle,
  splashAt,
  sparkleAt,
  riseBubbles,
} from '@/lib/games/theme';
import {
  SHARKS_MINNOWS_SCENE_KEY,
  type SharksAndMinnowsSceneProps,
} from './SharksAndMinnowsScene.factory';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VIEW_W = 800;
const VIEW_H = 500;
const MINNOW_COUNT = 8;

// Speeds are px/s (Phaser uses seconds via update delta).
// Original rAF used px/ms; multiplied by 1000.
const MINNOW_SPEED_MIN = 50;   // ~16s to cross 800px
const MINNOW_SPEED_MAX = 100;  // ~8s to cross 800px
const SHARK_SPEED = 200;       // px/s — fast enough to catch

const COLLISION_RADIUS = 45;
const MINNOW_SIZE = 32;
const SHARK_SIZE = 48;
const IMMUNITY_MS = 2000;

// Non-Phaser exports moved to SharksAndMinnowsScene.factory.ts;
// see FlappyScene.factory.ts for the rationale.

interface Minnow {
  id: number;
  text: Phaser.GameObjects.Text;
  speed: number;         // px/s
  eaten: boolean;
  escaped: boolean;
  immuneUntil: number;   // scene time.now in ms
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randFloat(min: number, max: number): number {
  return Phaser.Math.FloatBetween(min, max);
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

export class SharksAndMinnowsScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: SharksAndMinnowsSceneProps;

  private minnows: Minnow[] = [];
  private shark!: Phaser.GameObjects.Text;
  private sharkTargetX = VIEW_W - 100;
  private sharkTargetY = VIEW_H / 2;

  private scoreBadge!: BadgeHandle;
  private hintText?: Phaser.GameObjects.Text;

  private score = 0;
  private wrongAnswers = 0;
  private escaped = 0;
  private sessionStart = 0;
  private paused = false;
  private ended = false;
  private activeChallengeMinnow: Minnow | null = null;

  constructor() {
    super(SHARKS_MINNOWS_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as SharksAndMinnowsSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.sessionStart = Date.now();

    this.drawOcean();
    this.drawDecorations();
    this.spawnMinnows();
    this.createShark();
    this.drawHud();
    this.drawHint();
    this.installInput();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    // Host session clock hit zero → end the run (guarded by `this.ended`).
    this.hostBus.on('scene:timeUp', () => this.endSession(this.score > 0), this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private drawOcean(): void {
    this.add.rectangle(VIEW_W / 2, VIEW_H / 4, VIEW_W, VIEW_H / 2, 0x0ea5e9);
    this.add.rectangle(VIEW_W / 2, VIEW_H * 0.75, VIEW_W, VIEW_H / 2, 0x1e3a5f);
  }

  private drawDecorations(): void {
    // Seaweed
    const g = this.add.graphics();
    g.lineStyle(6, 0x6ee7b7, 0.5);
    for (const x of [80, 200, 350, 520, 680]) {
      g.beginPath();
      g.moveTo(x, VIEW_H);
      g.lineTo(x - 8, VIEW_H - 40);
      g.lineTo(x + 5, VIEW_H - 70);
      g.lineTo(x + 15, VIEW_H - 90);
      g.lineTo(x + 3, VIEW_H - 110);
      g.strokePath();
    }
    // Rising air bubbles — a continuous ambient stream so the water reads as
    // real water (replaces the old 5 static circles). Called before the fish
    // spawn so bubbles render behind them.
    riseBubbles(this, { xMin: 20, xMax: VIEW_W - 20, yBottom: VIEW_H - 6, yTop: 30 });
  }

  private spawnMinnows(): void {
    for (let i = 0; i < MINNOW_COUNT; i++) {
      const startX = -randFloat(20, 80) - i * 60;
      const y = randFloat(80, VIEW_H - 80);
      const text = this.add.text(startX, y, '🐟', { fontSize: `${MINNOW_SIZE}px` });
      text.setOrigin(0.5);
      text.disableInteractive();
      this.minnows.push({
        id: i,
        text,
        speed: randFloat(MINNOW_SPEED_MIN, MINNOW_SPEED_MAX),
        eaten: false,
        escaped: false,
        immuneUntil: 0,
      });
    }
  }

  private createShark(): void {
    this.shark = this.add.text(VIEW_W - 100, VIEW_H / 2, '🦈', { fontSize: `${SHARK_SIZE}px` });
    this.shark.setOrigin(0.5);
  }

  private drawHud(): void {
    // Theme HUD chrome — translucent dark panel with white text, same
    // style as every other game in the catalog.
    this.scoreBadge = drawScoreBadge(this, {
      anchor: 'tl',
      width: 220,
      initialValue: '🦈 0  ·  💨 0  ·  ❌ 0',
    });
  }

  private drawHint(): void {
    this.hintText = this.add.text(
      VIEW_W / 2,
      VIEW_H - 20,
      'Tap the ocean to move the shark toward a fish!',
      { fontSize: '16px', color: '#ffffff' },
    );
    this.hintText.setOrigin(0.5, 1);
    this.hintText.setAlpha(0.7);
  }

  private installInput(): void {
    // Pointer down AND pointer move (while down) both update the shark
    // target, so the kid can drag or tap-to-teleport-target.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.setTargetFromPointer(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown) this.setTargetFromPointer(p);
    });
  }

  private setTargetFromPointer(p: Phaser.Input.Pointer): void {
    if (this.paused || this.ended) return;
    this.sharkTargetX = Phaser.Math.Clamp(p.worldX, 0, VIEW_W);
    this.sharkTargetY = Phaser.Math.Clamp(p.worldY, 0, VIEW_H);
  }

  // -------------------------------------------------------------------------
  // Game loop
  // -------------------------------------------------------------------------

  update(time: number, delta: number): void {
    if (this.paused || this.ended) return;
    const dt = delta / 1000;

    // Shark seek
    const dx = this.sharkTargetX - this.shark.x;
    const dy = this.sharkTargetY - this.shark.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = SHARK_SPEED * dt;
      const ratio = Math.min(step / dist, 1);
      this.shark.x += dx * ratio;
      this.shark.y += dy * ratio;
      // Flip shark based on horizontal movement direction.
      if (dx < -0.1) this.shark.setFlipX(true);
      else if (dx > 0.1) this.shark.setFlipX(false);
    }

    // Minnow drift + collision + escape
    let newEscaped = 0;
    for (const m of this.minnows) {
      if (m.eaten || m.escaped) continue;

      m.text.x += m.speed * dt;

      // Immunity visual
      m.text.setAlpha(time < m.immuneUntil ? 0.4 : 1);

      if (m.text.x > VIEW_W + 40) {
        m.escaped = true;
        newEscaped++;
        m.text.setVisible(false);
        continue;
      }

      if (time >= m.immuneUntil && !this.activeChallengeMinnow) {
        const d = Phaser.Math.Distance.Between(
          this.shark.x, this.shark.y,
          m.text.x, m.text.y,
        );
        if (d < COLLISION_RADIUS) {
          this.openChallenge(m);
          return; // paused now; defer rest until resume
        }
      }
    }

    if (newEscaped > 0) {
      this.escaped += newEscaped;
      this.updateScoreDisplay();
    }

    // End condition
    const alive = this.minnows.filter((m) => !m.eaten && !m.escaped);
    if (alive.length === 0) {
      this.endSession(this.score > 0);
    }
  }

  // -------------------------------------------------------------------------
  // Challenge handling
  // -------------------------------------------------------------------------

  private openChallenge(m: Minnow): void {
    this.paused = true;
    this.activeChallengeMinnow = m;
    this.emitSfx('tap');
    const challenge = generateChallengeForMode(this.sceneProps.challengeMode ?? 'math', {
      tier: this.sceneProps.tier,
      mathType: this.sceneProps.mathType,
    });
    this.hostBus.emit('challenge:open', {
      challenge,
      reason: 'Catch the fish!',
    });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const m = this.activeChallengeMinnow;
    this.activeChallengeMinnow = null;
    this.paused = false;
    if (!m) return;

    if (payload.correct) {
      this.emitSfx('catch');
      this.score++;
      m.eaten = true;
      // Theme effects on catch — splash + sparkle, matching the catalog
      // vocabulary for "you got the math right" celebrations.
      splashAt(this, m.text.x, m.text.y, { scale: 0.85 });
      sparkleAt(this, m.text.x, m.text.y, { count: 5, spread: 28, fontSize: 14, rise: 22 });
      // Pop animation before fading out.
      this.tweens.add({
        targets: m.text,
        scale: { from: 1, to: 1.4 },
        alpha: { from: 1, to: 0 },
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => m.text.destroy(),
      });
    } else {
      this.emitSfx('escape');
      this.wrongAnswers++;
      m.immuneUntil = this.time.now + IMMUNITY_MS;
    }
    this.updateScoreDisplay();
  }

  // -------------------------------------------------------------------------
  // HUD + end
  // -------------------------------------------------------------------------

  private updateScoreDisplay(): void {
    this.scoreBadge.setValue(`🦈 ${this.score}  ·  💨 ${this.escaped}  ·  ❌ ${this.wrongAnswers}`);
    if (this.hintText && (this.score > 0 || this.escaped > 0 || this.wrongAnswers > 0)) {
      this.hintText.destroy();
      this.hintText = undefined;
    }
  }

  private endSession(won: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.emitSfx(won ? 'win' : 'timeUp');
    const summary = buildSessionSummary({
      score: this.score,
      wrongAnswers: this.wrongAnswers,
      sessionStart: this.sessionStart,
      completed: won,
      optimalTaps: MINNOW_COUNT,
    });
    this.hostBus.emit('session:end', { summary });
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  private resetScene(): void {
    for (const m of this.minnows) m.text.destroy();
    this.minnows = [];
    this.shark.setPosition(VIEW_W - 100, VIEW_H / 2);
    this.sharkTargetX = VIEW_W - 100;
    this.sharkTargetY = VIEW_H / 2;
    this.score = 0;
    this.wrongAnswers = 0;
    this.escaped = 0;
    this.sessionStart = Date.now();
    this.paused = false;
    this.ended = false;
    this.activeChallengeMinnow = null;
    this.spawnMinnows();
    this.updateScoreDisplay();
    if (!this.hintText) this.drawHint();
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}

// SharksAndMinnowsSceneFactory moved to SharksAndMinnowsScene.factory.ts.
