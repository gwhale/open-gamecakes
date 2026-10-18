// Cakey Chase — Phaser 3 scene. Pac-Man-style chase game.
//
// Kid taps a direction (swipe / arrow / virtual D-pad) and Cakey
// glides through the maze eating Sugar Tokens. Three "cake holes" patrol —
// dark indigo vortices that mirror the trap visual from Marble Maze
// so the same antagonist family reads consistent across games. Eat a
// cupcake power-up and they turn blue and run scared. Three lives.
// Eat every Sugar Token to win.
//
// Math gates: high-stakes moments pose a kid-tier-scaled math problem
// using the standard bus → host modal → challenge:result flow that
// every other math game in the catalog uses (Minnow Catch, Flappy
// Math, Water Balloons, Asteroids):
//   - Eating a cupcake power-up → answer to activate frightened mode
//     (+5 bonus on correct; wrong just skips frightened)
//   - Getting caught by a cake hole → answer to escape (no life lost
//     and cake holes pushed back to spawn; wrong → normal death cycle)
//
// The questions come from generateMathChallenge(tier, mathType) —
// same generator the other math games use, so the kid's launcher tier
// and Problem Type pick directly drive what shows up here. We never
// hard-code questions; everything reflects the kid's adaptive profile
// and the launcher pickers. The shared Challenge type + numeric keypad
// modal in PhaserGameHost render the gate.
//
// Why grid-snapped tween movement instead of velocity-based physics:
// kids tap a direction and want it to happen *now*. Physics-based
// arcade movement requires precise tile alignment to turn corners,
// which is the classic Pac-Man "I missed the corner" frustration.
// Tween-to-next-cell makes every input round-trip predictable: you
// tap, you queue, the next cell-edge you reach you turn — never
// "I held right and ran past it."
//
// Ghost AI is intentionally simpler than canonical Pac-Man (no
// scatter/chase cycle, no ghost-house exit timing). Two ghosts
// chase, one wanders randomly. Rises in difficulty by tier:
//   tier 1–2: 1 chaser + 2 wanderers, slow ghosts
//   tier 3–5: 2 chasers + 1 wanderer, medium ghosts
//   tier 6+ : 3 chasers, faster ghosts
// Calibrated by playtesting with the 4-year-old benchmark, not by
// math: the goal is "a K kid can finish a level in tier 1 within
// 90 seconds" not "Pac-Man with academic precision."

import * as Phaser from 'phaser';
import {
  CELL_PX,
  HEADER_PX,
  MAZE,
  MAZE_COLS,
  MAZE_ROWS,
  TUNNEL_ROWS,
  type MazeCell,
} from '@/lib/games/pacman-cakey/maze';
import { buildSessionSummary } from '@/lib/games/phaser/session';
import type { SoundName } from '@/lib/games/phaser/session';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import {
  drawScoreBadge,
  drawTimerBadge,
  drawLivesRow,
  type BadgeHandle,
  type TimerHandle,
  type LivesHandle,
  sparkleAt,
  bigHitFx,
} from '@/lib/games/theme';
import {
  PACMAN_CAKEY_SCENE_KEY,
  type PacmanCakeySceneProps,
} from './PacmanCakeyScene.factory';

// 3-minute round timer — every Gamecakes math game uses the same
// duration so the kid's "what does a session feel like" mental model
// is consistent. The kid earns the standard 1-token completion drip
// when the timer expires (or the maze is cleared).
const GAME_DURATION_MS = 3 * 60 * 1000;
// Last 30 seconds: tick sound + warning color on the timer badge.
const TICK_LAST_MS = 30_000;

type Direction = 'up' | 'down' | 'left' | 'right';
type GhostMode = 'chase' | 'wander' | 'frightened' | 'eaten';
/** Scene-wide phase. 'challenge' fires while the host's math modal is
 *  up; neither Cakey nor the cake holes tick during a gate. */
type Phase = 'playing' | 'death-pause' | 'win-pause' | 'over' | 'challenge';

/** Which event triggered the currently-open math gate. Routes the
 *  result handler to the right reward/penalty branch. */
type ChallengeContext = 'power-up' | 'caught';

const DIR_VECTORS: Record<Direction, { dc: number; dr: number }> = {
  up: { dc: 0, dr: -1 },
  down: { dc: 0, dr: 1 },
  left: { dc: -1, dr: 0 },
  right: { dc: 1, dr: 0 },
};

const REVERSE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

interface CakeyState {
  col: number;
  row: number;
  x: number;
  y: number;
  dir: Direction | null;
  queuedDir: Direction | null;
  sprite: Phaser.GameObjects.Text;
  moving: boolean;
}

interface GhostState {
  col: number;
  row: number;
  x: number;
  y: number;
  dir: Direction | null;
  mode: GhostMode;
  /** Filled-circle inner color (deep indigo by default; flips to a
   *  bright blue for frightened mode). */
  baseColor: number;
  /** Pulsing-ring stroke color (violet by default; flips to soft blue
   *  for frightened so the kid reads "now safe to chomp"). */
  ringColor: number;
  /** Container holding the cake-hole's three layers: filled body,
   *  pulsing ring, and 🌀 swirl emoji. The container is what tweens
   *  move; the layers ride along. */
  body: Phaser.GameObjects.Container;
  bodyCircle: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  swirl: Phaser.GameObjects.Text;
  ai: 'chase' | 'wander';
  spawnCol: number;
  spawnRow: number;
  moving: boolean;
}

/** Difficulty knobs derived from tier (1–10). All durations in ms. */
function difficultyFromTier(tier: number): {
  cakeyStepMs: number;
  ghostStepMs: number;
  frightenedStepMs: number;
  frightenedDurationMs: number;
  chaserCount: number;
} {
  const t = Math.max(1, Math.min(10, tier));
  return {
    // Cakey speed scales gently — too fast and kids overshoot turns.
    cakeyStepMs: 220 - t * 10,
    // Ghost speed always a little slower than Cakey at low tier so the
    // kid has room to learn. Inverts at tier 8+ for genuine challenge.
    // Eased ~20% slower per kid feedback ("the things chasing you are too fast")
    // — same tier curve, just a gentler chase.
    ghostStepMs: Math.round(Math.max(140, 280 - t * 16) * 1.2),
    frightenedStepMs: Math.max(220, 360 - t * 10),
    frightenedDurationMs: Math.max(3500, 7500 - t * 400),
    chaserCount: t <= 2 ? 1 : t <= 5 ? 2 : 3,
  };
}

export class PacmanCakeyScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: PacmanCakeySceneProps;

  private cells: MazeCell[][] = [];
  private gridOffsetY = HEADER_PX;
  private cakey!: CakeyState;
  private ghosts: GhostState[] = [];
  private pelletObjs: Map<string, Phaser.GameObjects.Arc> = new Map();
  /** Power pellets render as 🧁 cupcake emoji, not filled circles, so
   *  the "cupcake = power-up" visual rule is unambiguous. Type widened
   *  to GameObject so we don't lock the Map to a single visual class
   *  if a future variant uses a Container. */
  private powerObjs: Map<string, Phaser.GameObjects.GameObject> = new Map();
  private pelletsRemaining = 0;
  private pelletsTotal = 0;
  private score = 0;
  private lives = 3;
  private phase: Phase = 'playing';
  private pelletsEaten = 0;
  private ghostsEaten = 0;
  private deathsTotal = 0;
  /** Wrong math-gate answers — the only signal we use for the
   *  efficiency calculation. Game-mechanic deaths (a cake hole bumps
   *  Cakey while she's playing fairly) DON'T count as wrong because
   *  they aren't a learning failure — they're just gameplay. Tracking
   *  these separately lets a kid earn the 1-coin completion drip even
   *  if they died a few times, as long as their math was reasonable. */
  private wrongMathAnswers = 0;
  private movesTotal = 0;
  private sessionStart = 0;
  private frightenedUntil = 0;

  /** Standard HUD chrome — same translucent badges every Gamecakes
   *  math game uses. Score top-left, timer top-right, lives row in the
   *  vacated header strip. */
  private scoreBadge!: BadgeHandle;
  private timerBadge!: TimerHandle;
  private livesBadge!: LivesHandle;
  private centerBanner!: Phaser.GameObjects.Text;

  /** Timestamp (this.time.now) until which ghosts hold position. Buys
   *  the kid a beat to orient on game start and after each death.
   *  Cleared early by the kid's first directional input so the active
   *  player isn't waiting on a useless countdown. */
  private ghostsFrozenUntil = 0;

  /** True between 'challenge:open' and 'challenge:result'. Pauses the
   *  game-tick block in update() and accumulates pauseMs so the round
   *  timer doesn't drain while the kid is solving. Same pause-aware
   *  pattern as Asteroids. */
  private pausedForChallenge = false;
  /** Date.now() snapshot when the current pause began. */
  private pauseStartedAt = 0;
  /** Total ms spent in pauses across the round. Subtracted from the
   *  raw elapsed time when computing the timer remaining. */
  private pauseMs = 0;

  /** Wall-clock ms when the round expires. Set in create(); the timer
   *  tick computes remaining as (endTime - Date.now() + pauseMs). */
  private endTime = 0;
  /** Last whole second seen during the warning band, so we only fire
   *  the tick SFX once per second. */
  private lastTickSec = -1;

  /** True if the last pellet eaten was a power pellet AND clearing the
   *  maze (a "grand finale" win). The win check is deferred until the
   *  power-up challenge resolves so the kid sees the result of their
   *  answer before the round ends. */
  private deferredWinAfterChallenge = false;

  /** Which gate currently has the math modal open. The result handler
   *  branches on this to award the right bonus + transition. Cleared
   *  when the result fires. */
  private challengeContext: ChallengeContext | null = null;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wKey!: Phaser.Input.Keyboard.Key;
  private aKey!: Phaser.Input.Keyboard.Key;
  private sKey!: Phaser.Input.Keyboard.Key;
  private dKey!: Phaser.Input.Keyboard.Key;
  private swipeStart: { x: number; y: number; t: number } | null = null;

  private diff = difficultyFromTier(1);

  constructor() {
    super(PACMAN_CAKEY_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as PacmanCakeySceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.diff = difficultyFromTier(this.sceneProps.tier);
    this.sessionStart = Date.now();
    this.endTime = this.sessionStart + GAME_DURATION_MS;

    this.cloneMazeIntoState();
    this.drawHeader();
    this.drawMaze();
    this.spawnCakey();
    this.spawnGhosts();
    this.drawCenterBanner();
    this.attachInput();
    // Initial freeze — the kid needs a beat to read the maze before
    // a chaser starts moving toward Cakey's spawn.
    this.ghostsFrozenUntil = this.time.now + 2500;
    this.updateGhostFreezeBanner();

    this.hostBus.on('scene:reset', this.resetScene, this);
    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  private cloneMazeIntoState(): void {
    // Deep clone so eating pellets only affects this play session.
    this.cells = MAZE.cells.map((row) => row.map((c) => ({ ...c })));
    this.pelletsTotal = MAZE.pelletCount + MAZE.powerPelletCount;
    this.pelletsRemaining = this.pelletsTotal;
  }

  /** Standard Gamecakes HUD — translucent badges with white text, same
   *  visual language as Minnow Catch, Water Balloons, Asteroids,
   *  Flappy Math. Score top-left, lives row centered in the header
   *  band, timer top-right. The header strip behind them is kept
   *  (HEADER_PX above the maze) so badges have a contrasted base on
   *  the candy-bright maze background. */
  private drawHeader(): void {
    const w = this.scale.width;
    // Backing strip — dark indigo so the badges read on top of it
    // without re-tinting the maze background below.
    this.add.rectangle(w / 2, 0, w, HEADER_PX, 0x1e1b4b).setOrigin(0.5, 0);

    this.scoreBadge = drawScoreBadge(this, {
      anchor: 'tl',
      margin: 10,
      width: 130,
      height: 38,
      initialValue: '🪙 0',
    });
    this.timerBadge = drawTimerBadge(this, {
      anchor: 'tr',
      viewW: w,
      margin: 10,
      width: 100,
      height: 38,
      initialValue: '3:00',
    });
    this.livesBadge = drawLivesRow(this, {
      x: w / 2 - 36,
      y: 12,
      max: 3,
      initialLives: this.lives,
      fontSize: 18,
      depth: 50,
    });
  }

  private drawMaze(): void {
    const w = this.scale.width;
    const h = MAZE_ROWS * CELL_PX;
    // Maze background.
    this.add
      .rectangle(w / 2, this.gridOffsetY + h / 2, w, h, 0x0f0a36)
      .setOrigin(0.5);

    // Walls.
    for (let r = 0; r < MAZE_ROWS; r += 1) {
      for (let c = 0; c < MAZE_COLS; c += 1) {
        const cell = this.cells[r][c];
        if (cell.tile === '#') {
          const x = c * CELL_PX + CELL_PX / 2;
          const y = this.gridOffsetY + r * CELL_PX + CELL_PX / 2;
          this.add
            .rectangle(x, y, CELL_PX - 4, CELL_PX - 4, 0x4338ca)
            .setStrokeStyle(2, 0x6366f1)
            .setOrigin(0.5);
        }
      }
    }

    // Pellets.
    for (let r = 0; r < MAZE_ROWS; r += 1) {
      for (let c = 0; c < MAZE_COLS; c += 1) {
        const cell = this.cells[r][c];
        const x = c * CELL_PX + CELL_PX / 2;
        const y = this.gridOffsetY + r * CELL_PX + CELL_PX / 2;
        if (cell.hadPellet) {
          const dot = this.add.circle(x, y, 3, 0xfde68a);
          this.pelletObjs.set(this.cellKey(c, r), dot);
        } else if (cell.hadPower) {
          // 🧁 cupcake = power-up. Subtle pulse-tween (1.0→1.18 yoyo)
          // so it stands out against the smaller token pellets but
          // doesn't compete with Cakey for attention.
          const power = this.add
            .text(x, y, '🧁', { fontSize: '22px' })
            .setOrigin(0.5);
          this.tweens.add({
            targets: power,
            scale: 1.18,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          this.powerObjs.set(this.cellKey(c, r), power);
        }
      }
    }
  }

  private spawnCakey(): void {
    const { col, row } = MAZE.cakeySpawn;
    const { x, y } = this.cellCenter(col, row);
    // 🎂 Cakey — the brand mascot, an anthropomorphized cake. The
    // cupcake emoji moved to the power-up role so the visual hierarchy
    // reads "cake hero, cupcake reward, dark vortex villain" without
    // any extra explanation.
    const sprite = this.add
      .text(x, y, '🎂', {
        fontSize: '30px',
        fontFamily:
          '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
      })
      .setOrigin(0.5);
    this.cakey = {
      col,
      row,
      x,
      y,
      dir: null,
      queuedDir: null,
      sprite,
      moving: false,
    };
  }

  private spawnGhosts(): void {
    // Cake-hole-eater visual mirrors the Marble Maze trap silhouette:
    // dark indigo filled body, pulsing violet ring, 🌀 swirl emoji.
    // Same antagonist family across games — kids learn "this is a
    // cake hole" once and recognize the danger anywhere in the catalog.
    // Three indigo→violet shades distinguish individual cake holes
    // without breaking the family palette.
    const baseColors = [0x1e1b4b, 0x4338ca, 0x7c3aed]; // indigo deep → violet
    const ringColors = [0x7c3aed, 0xa78bfa, 0xc084fc]; // violet shades
    for (let i = 0; i < MAZE.ghostSpawns.length; i += 1) {
      const spawn = MAZE.ghostSpawns[i];
      const baseColor = baseColors[i % baseColors.length];
      const ringColor = ringColors[i % ringColors.length];
      const ai: 'chase' | 'wander' = i < this.diff.chaserCount ? 'chase' : 'wander';
      const { x, y } = this.cellCenter(spawn.col, spawn.row);

      const body = this.add.container(x, y);

      // Inner filled body — dark indigo by default, swaps color in
      // beginFrightened / respawnGhost / eatGhost.
      const bodyCircle = this.add.circle(0, 0, 14, baseColor, 1);

      // Pulsing ring — same scale 0.8→1.15 yoyo + alpha curve as
      // Marble Maze's trap ring. Radius is one tile-eighth larger than
      // the body so the ring breathes around the body silhouette.
      const ring = this.add
        .circle(0, 0, 19, ringColor, 0)
        .setStrokeStyle(3, ringColor);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.8, to: 1.15 },
        alpha: { from: 0.6, to: 1 },
        duration: 750 + Math.random() * 250,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      // The swirl emoji is the Marble-Maze tell — instant visual
      // hand-shake that this is the same antagonist class.
      const swirl = this.add
        .text(0, 0, '🌀', { fontSize: '18px' })
        .setOrigin(0.5);

      body.add([bodyCircle, ring, swirl]);

      this.ghosts.push({
        col: spawn.col,
        row: spawn.row,
        x,
        y,
        dir: null,
        mode: ai,
        baseColor,
        ringColor,
        body,
        bodyCircle,
        ring,
        swirl,
        ai,
        spawnCol: spawn.col,
        spawnRow: spawn.row,
        moving: false,
      });
    }
  }

  /** Recolor a cake hole based on its current mode. The body circle
   *  carries the dominant tint; the ring and swirl follow.
   *    - normal (chase / wander): indigo body, violet ring, swirl shown
   *    - frightened: cyan body, pale-blue ring, swirl shown
   *    - eaten: hide body + ring + swirl, only the container position
   *      remains (ghosts return-to-spawn invisibly, classic Pac-Man eyes)
   */
  private updateCakeHoleAppearance(ghost: GhostState): void {
    if (ghost.mode === 'frightened') {
      // Yellow body + ring — unambiguous "edible now" signal. The
      // dangerous default is indigo+violet, so yellow reads as the
      // opposite end of the threat spectrum at a glance.
      ghost.bodyCircle.setFillStyle(0xfacc15, 1);
      ghost.ring.setStrokeStyle(3, 0xfde047);
      ghost.bodyCircle.setVisible(true);
      ghost.ring.setVisible(true);
      ghost.swirl.setVisible(true);
    } else if (ghost.mode === 'eaten') {
      ghost.bodyCircle.setVisible(false);
      ghost.ring.setVisible(false);
      ghost.swirl.setVisible(false);
    } else {
      // chase / wander
      ghost.bodyCircle.setFillStyle(ghost.baseColor, 1);
      ghost.ring.setStrokeStyle(3, ghost.ringColor);
      ghost.bodyCircle.setVisible(true);
      ghost.ring.setVisible(true);
      ghost.swirl.setVisible(true);
    }
  }

  private drawCenterBanner(): void {
    const w = this.scale.width;
    const h = MAZE_ROWS * CELL_PX;
    this.centerBanner = this.add
      .text(w / 2, this.gridOffsetY + h / 2, 'Tap a direction to start!', {
        fontSize: '20px',
        color: '#fde68a',
        fontStyle: '900',
        backgroundColor: '#1e1b4b',
        padding: { left: 14, right: 14, top: 8, bottom: 8 },
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(10);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private attachInput(): void {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wKey = this.input.keyboard.addKey('W');
      this.aKey = this.input.keyboard.addKey('A');
      this.sKey = this.input.keyboard.addKey('S');
      this.dKey = this.input.keyboard.addKey('D');
    }

    // Touch / mouse swipe — listen on the scene input so we get
    // canvas-relative events even after fullscreen toggles.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.swipeStart = { x: p.x, y: p.y, t: p.downTime };
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return;
      const dx = p.x - this.swipeStart.x;
      const dy = p.y - this.swipeStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 20) {
        // Swipe — pick dominant axis.
        if (Math.abs(dx) > Math.abs(dy)) {
          this.queueDir(dx > 0 ? 'right' : 'left');
        } else {
          this.queueDir(dy > 0 ? 'down' : 'up');
        }
      }
      this.swipeStart = null;
    });
  }

  private sampleKeys(): Direction | null {
    if (!this.input.keyboard) return null;
    if (this.cursors.left?.isDown || this.aKey?.isDown) return 'left';
    if (this.cursors.right?.isDown || this.dKey?.isDown) return 'right';
    if (this.cursors.up?.isDown || this.wKey?.isDown) return 'up';
    if (this.cursors.down?.isDown || this.sKey?.isDown) return 'down';
    return null;
  }

  private queueDir(dir: Direction): void {
    if (this.phase !== 'playing' && this.phase !== 'death-pause') return;
    this.cakey.queuedDir = dir;
    // First input also unfreezes ghosts — kid is ready to play, drop
    // the rest of the countdown.
    if (this.ghostsFrozenUntil > this.time.now) {
      this.ghostsFrozenUntil = this.time.now;
      this.updateGhostFreezeBanner();
    }
    if (this.centerBanner.visible) {
      this.centerBanner.setVisible(false);
    }
  }

  /** Refresh the center banner text to reflect the freeze countdown.
   *  Hidden once countdown lapses and Cakey has started moving. */
  private updateGhostFreezeBanner(): void {
    if (this.ghostsFrozenUntil > this.time.now) {
      this.centerBanner.setText('Get ready…').setVisible(true);
    } else {
      this.centerBanner.setVisible(false);
    }
  }

  // -------------------------------------------------------------------------
  // Update loop
  // -------------------------------------------------------------------------

  update(time: number): void {
    if (this.phase === 'over') return;

    const k = this.sampleKeys();
    if (k) this.queueDir(k);

    // Timer ticks every frame even outside 'playing' so the HUD reflects
    // truth across the death-pause + win-pause windows. We DO subtract
    // pauseMs so the kid isn't punished while the math modal is up.
    const remaining = this.computeRemainingMs();
    this.updateTimerDisplay(remaining);
    if (remaining <= 0) {
      this.handleTimeout();
      return;
    }
    if (remaining <= TICK_LAST_MS && this.phase === 'playing') {
      const sec = Math.floor(remaining / 1000);
      if (sec !== this.lastTickSec) {
        this.lastTickSec = sec;
        this.emitSfx('tick');
      }
    }

    if (this.phase === 'playing') {
      this.tickCakey();
      this.tickGhosts();
      this.tickFrightenedTimer(time);
    }
  }

  /** Return the timer remaining in ms, accounting for time spent
   *  paused on a math gate. Never returns negative. */
  private computeRemainingMs(): number {
    const livePauseMs = this.pauseStartedAt > 0
      ? Date.now() - this.pauseStartedAt
      : 0;
    const elapsed = Date.now() - this.sessionStart - this.pauseMs - livePauseMs;
    return Math.max(0, GAME_DURATION_MS - elapsed);
  }

  /** Two-tier color: amber when <60s remain, red <30s. Mirrors the
   *  Minnow Catch pattern. */
  private updateTimerDisplay(ms: number): void {
    this.timerBadge.setMs(ms);
    if (ms < 30_000) {
      this.timerBadge.setWarning(true);
    } else if (ms < 60_000) {
      this.timerBadge.setWarning(false);
      this.timerBadge.setColor('#fbbf24');
    } else {
      this.timerBadge.setWarning(false);
      this.timerBadge.setColor('#ffffff');
    }
  }

  private tickCakey(): void {
    if (this.cakey.moving) return;
    const candidate =
      this.cakey.queuedDir && this.canStep(this.cakey.col, this.cakey.row, this.cakey.queuedDir)
        ? this.cakey.queuedDir
        : this.cakey.dir && this.canStep(this.cakey.col, this.cakey.row, this.cakey.dir)
          ? this.cakey.dir
          : null;
    if (!candidate) return;

    this.cakey.dir = candidate;
    if (candidate === this.cakey.queuedDir) this.movesTotal += 1;
    this.cakey.queuedDir = null;
    const target = this.stepCell(this.cakey.col, this.cakey.row, candidate);
    this.startCakeyTween(target.col, target.row);
  }

  private startCakeyTween(toCol: number, toRow: number): void {
    const { x, y } = this.cellCenter(toCol, toRow);
    this.cakey.moving = true;
    this.tweens.add({
      targets: this.cakey.sprite,
      x,
      y,
      duration: this.diff.cakeyStepMs,
      ease: 'Linear',
      onUpdate: () => {
        this.cakey.x = this.cakey.sprite.x;
        this.cakey.y = this.cakey.sprite.y;
      },
      onComplete: () => {
        this.cakey.col = toCol;
        this.cakey.row = toRow;
        this.cakey.x = x;
        this.cakey.y = y;
        this.cakey.moving = false;
        this.maybeEatCellContent();
        this.maybeCollideGhost();
      },
    });
  }

  private tickGhosts(): void {
    // Honor the freeze grace period — ghosts hold position until the
    // countdown lapses or the kid taps a direction (which clears the
    // freeze). Eaten ghosts (eyes-only, returning to spawn) still
    // move during the freeze so they don't pile up at Cakey's position.
    if (this.ghostsFrozenUntil > this.time.now) {
      // Banner refresh — let the player see the countdown ticking
      // down, even though we're not animating a number per second.
      // Cheap: setVisible idempotent if already true.
      if (!this.centerBanner.visible) this.updateGhostFreezeBanner();
    }
    for (const ghost of this.ghosts) {
      if (ghost.moving) continue;
      if (this.ghostsFrozenUntil > this.time.now && ghost.mode !== 'eaten') continue;
      const dir = this.pickGhostDir(ghost);
      if (!dir) continue;
      ghost.dir = dir;
      const target = this.stepCell(ghost.col, ghost.row, dir);
      this.startGhostTween(ghost, target.col, target.row);
    }
    // Hide the banner once the freeze lapses, even if the kid hasn't
    // tapped yet — the freeze is up, time to play.
    if (
      this.ghostsFrozenUntil > 0 &&
      this.time.now >= this.ghostsFrozenUntil &&
      this.centerBanner.visible
    ) {
      this.ghostsFrozenUntil = 0;
      this.centerBanner.setVisible(false);
    }
  }

  private startGhostTween(ghost: GhostState, toCol: number, toRow: number): void {
    const { x, y } = this.cellCenter(toCol, toRow);
    const stepMs =
      ghost.mode === 'frightened'
        ? this.diff.frightenedStepMs
        : ghost.mode === 'eaten'
          ? Math.max(80, this.diff.ghostStepMs - 60)
          : this.diff.ghostStepMs;
    ghost.moving = true;
    this.tweens.add({
      targets: ghost.body,
      x,
      y,
      duration: stepMs,
      ease: 'Linear',
      onComplete: () => {
        ghost.col = toCol;
        ghost.row = toRow;
        ghost.x = x;
        ghost.y = y;
        ghost.moving = false;
        if (ghost.mode === 'eaten' && ghost.col === ghost.spawnCol && ghost.row === ghost.spawnRow) {
          this.respawnGhost(ghost);
        }
        this.maybeCollideGhost();
      },
    });
  }

  private pickGhostDir(ghost: GhostState): Direction | null {
    const candidates: Direction[] = [];
    for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
      if (ghost.dir && dir === REVERSE[ghost.dir]) continue;
      if (this.canStep(ghost.col, ghost.row, dir)) candidates.push(dir);
    }
    if (candidates.length === 0) {
      // Dead end — allow reverse.
      if (ghost.dir && this.canStep(ghost.col, ghost.row, REVERSE[ghost.dir])) {
        return REVERSE[ghost.dir];
      }
      return null;
    }

    if (ghost.mode === 'eaten') {
      // Head back to spawn.
      return this.greedyToward(ghost, candidates, ghost.spawnCol, ghost.spawnRow);
    }
    if (ghost.mode === 'frightened' || ghost.ai === 'wander') {
      return Phaser.Utils.Array.GetRandom(candidates) as Direction;
    }
    // Chase Cakey.
    return this.greedyToward(ghost, candidates, this.cakey.col, this.cakey.row);
  }

  private greedyToward(
    ghost: GhostState,
    candidates: Direction[],
    targetCol: number,
    targetRow: number,
  ): Direction {
    let best = candidates[0];
    let bestDist = Infinity;
    for (const dir of candidates) {
      const next = this.stepCell(ghost.col, ghost.row, dir);
      const dist = Math.hypot(next.col - targetCol, next.row - targetRow);
      if (dist < bestDist) {
        bestDist = dist;
        best = dir;
      }
    }
    return best;
  }

  // -------------------------------------------------------------------------
  // Collisions / consumption
  // -------------------------------------------------------------------------

  private maybeEatCellContent(): void {
    const key = this.cellKey(this.cakey.col, this.cakey.row);
    const dot = this.pelletObjs.get(key);
    if (dot) {
      dot.destroy();
      this.pelletObjs.delete(key);
      this.cells[this.cakey.row][this.cakey.col].hadPellet = false;
      this.score += 1;
      this.pelletsEaten += 1;
      this.pelletsRemaining -= 1;
      this.refreshHud();
      this.emitSfx('tap');
    }
    const power = this.powerObjs.get(key);
    if (power) {
      power.destroy();
      this.powerObjs.delete(key);
      this.cells[this.cakey.row][this.cakey.col].hadPower = false;
      this.score += 5;
      this.pelletsEaten += 1;
      this.pelletsRemaining -= 1;
      this.refreshHud();
      this.emitSfx('levelUp');
      // Math gate — solving correctly turns the cake holes blue and
      // edible. Solving wrong still counts as "ate the cupcake" (kid
      // keeps the +5 score) but the frightened mode never activates.
      // The win check is deferred into onChallengeResult via the
      // deferredWinAfterChallenge flag so an edge-case "last pellet
      // was a power-up" still lands cleanly after the kid answers.
      this.deferredWinAfterChallenge = this.pelletsRemaining <= 0;
      this.openChallenge('power-up', 'Solve to power up!');
      return;
    }
    if (this.pelletsRemaining <= 0) {
      this.handleWin();
    }
  }

  private beginFrightened(): void {
    this.frightenedUntil = this.time.now + this.diff.frightenedDurationMs;
    for (const ghost of this.ghosts) {
      if (ghost.mode !== 'eaten') {
        ghost.mode = 'frightened';
        this.updateCakeHoleAppearance(ghost);
      }
    }
  }

  private tickFrightenedTimer(now: number): void {
    if (this.frightenedUntil > 0 && now >= this.frightenedUntil) {
      this.frightenedUntil = 0;
      for (const ghost of this.ghosts) {
        if (ghost.mode === 'frightened') {
          ghost.mode = ghost.ai;
          this.updateCakeHoleAppearance(ghost);
        }
      }
    }
  }

  private maybeCollideGhost(): void {
    for (const ghost of this.ghosts) {
      const dx = ghost.x - this.cakey.x;
      const dy = ghost.y - this.cakey.y;
      if (Math.hypot(dx, dy) > CELL_PX * 0.62) continue;
      if (ghost.mode === 'frightened') {
        this.eatGhost(ghost);
        return;
      }
      if (ghost.mode === 'eaten') continue;
      // Caught by an active cake hole — costs a life immediately.
      // No math escape here; the math gates live on the power-up
      // path so they reward the kid for chasing the cupcake, not
      // for getting cornered. The 900 ms death-pause + 1500 ms
      // post-respawn freeze in handleDeath gives the kid a beat to
      // recover.
      this.handleDeath();
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Math gates — bus to the host's standard challenge modal
  // -------------------------------------------------------------------------

  /** Pose a math gate to the host. Generates a tier+mathType problem
   *  via the shared catalog generator and emits 'challenge:open' for
   *  the host's numeric keypad modal to render. Phase = 'challenge'
   *  pauses Cakey + cake-hole movement; pauseStartedAt records the
   *  wall clock so the round timer doesn't tick down while the kid
   *  solves.
   *
   *  Two contexts trigger this:
   *    - 'power-up' — Cakey ate a cupcake; correct answer flips cake
   *      holes to edible (yellow) for ~7s + bonus
   *    - 'caught'   — Cakey lost a life and respawned; correct answer
   *      awards a consolation bonus. Life is gone either way.
   */
  private openChallenge(context: ChallengeContext, reason: string): void {
    const challenge: Challenge = generateChallengeForMode(
      this.sceneProps.challengeMode ?? 'math',
      { tier: this.sceneProps.tier, mathType: this.sceneProps.mathType },
    );
    
    this.phase = 'challenge';
    this.challengeContext = context;
    this.pausedForChallenge = true;
    this.pauseStartedAt = Date.now();
    this.hostBus.emit('challenge:open', { challenge, reason });
  }

  /** Host fires this once the kid answers the keypad. Branches on the
   *  context that opened the gate to award the right outcome. Both
   *  branches end by clearing the pause so the round timer resumes. */
  private onChallengeResult(payload: { correct: boolean }): void {
    if (!this.pausedForChallenge) return;
    this.pausedForChallenge = false;
    if (this.pauseStartedAt > 0) {
      this.pauseMs += Date.now() - this.pauseStartedAt;
      this.pauseStartedAt = 0;
    }
    if (!payload.correct) this.wrongMathAnswers += 1;

    const context = this.challengeContext;
    this.challengeContext = null;

    if (context === 'power-up') {
      if (payload.correct) {
        this.emitSfx('correct');
        this.score += 5;
        this.refreshHud();
        this.beginFrightened();
      } else {
        this.emitSfx('wrong');
      }
      this.phase = 'playing';
      if (this.deferredWinAfterChallenge) {
        this.deferredWinAfterChallenge = false;
        this.handleWin();
      }
      return;
    }

    if (context === 'caught') {
      // Life is already lost from handleDeath. Math is a consolation
      // beat: correct = +5 score, wrong = nothing extra. Either way,
      // grant the post-respawn freeze so the kid has breathing room.
      if (payload.correct) {
        this.emitSfx('correct');
        this.score += 5;
        this.refreshHud();
      }
      this.phase = 'playing';
      this.ghostsFrozenUntil = this.time.now + 1500;
      return;
    }
  }

  private eatGhost(ghost: GhostState): void {
    ghost.mode = 'eaten';
    this.ghostsEaten += 1;
    this.score += 20;
    // Hide body + ring + swirl. The container keeps moving; the kid
    // sees a quick "vanish" and trusts the score+sfx instead of
    // tracking an eyes-only ghost.
    this.updateCakeHoleAppearance(ghost);
    this.refreshHud();
    this.emitSfx('catch');
  }

  private respawnGhost(ghost: GhostState): void {
    ghost.mode = ghost.ai;
    this.updateCakeHoleAppearance(ghost);
  }

  private handleDeath(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'death-pause';
    this.lives -= 1;
    this.deathsTotal += 1;
    this.refreshHud();
    this.emitSfx('wrong');
    this.cameras.main.flash(220, 220, 0, 0);
    this.time.delayedCall(900, () => {
      if (this.lives <= 0) {
        this.handleGameOver();
        return;
      }
      // Reset positions then fire a math gate as a learning beat.
      // The life is already gone — this isn't a save, it's a chance
      // to earn a +5 consolation bonus while the kid catches their
      // breath. The 1.5s post-respawn freeze starts when the kid
      // answers (in onChallengeResult, 'caught' branch).
      this.resetPositions();
      this.openChallenge('caught', 'Solve to keep going!');
    });
  }

  private resetPositions(): void {
    // Cakey to spawn.
    this.tweens.killTweensOf(this.cakey.sprite);
    const cs = this.cellCenter(MAZE.cakeySpawn.col, MAZE.cakeySpawn.row);
    this.cakey.col = MAZE.cakeySpawn.col;
    this.cakey.row = MAZE.cakeySpawn.row;
    this.cakey.x = cs.x;
    this.cakey.y = cs.y;
    this.cakey.dir = null;
    this.cakey.queuedDir = null;
    this.cakey.moving = false;
    this.cakey.sprite.setPosition(cs.x, cs.y);

    // Ghosts to spawns + chase reset.
    for (const ghost of this.ghosts) {
      this.tweens.killTweensOf(ghost.body);
      const gc = this.cellCenter(ghost.spawnCol, ghost.spawnRow);
      ghost.col = ghost.spawnCol;
      ghost.row = ghost.spawnRow;
      ghost.x = gc.x;
      ghost.y = gc.y;
      ghost.dir = null;
      ghost.moving = false;
      ghost.body.setPosition(gc.x, gc.y);
      ghost.mode = ghost.ai;
      this.updateCakeHoleAppearance(ghost);
    }
    this.frightenedUntil = 0;
  }

  // -------------------------------------------------------------------------
  // Win / lose
  // -------------------------------------------------------------------------

  private handleWin(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'win-pause';
    this.emitSfx('win');
    // Standard celebration vocabulary — sparkle burst on Cakey + a
    // brief camera flash, same as Math Maze / Marble Maze on goal.
    sparkleAt(this, this.cakey.x, this.cakey.y, {
      count: 14,
      spread: 60,
      fontSize: 22,
      rise: 38,
    });
    bigHitFx(this, { flashMs: 200, shakeMs: 0, shakeIntensity: 0 });
    this.centerBanner.setText('All Sugar Tokens eaten — yay!').setVisible(true);
    this.time.delayedCall(1100, () => {
      this.phase = 'over';
      this.endSession('win');
    });
  }

  private handleGameOver(): void {
    this.phase = 'over';
    this.centerBanner.setText('Caught! Good run.').setVisible(true);
    this.endSession('gameover');
  }

  /** Round timer expired. Kid finished — they keep whatever tokens
   *  they ate plus the standard 1-coin completion drip. */
  private handleTimeout(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.emitSfx('timeUp');
    this.centerBanner.setText("Time's up — nice run!").setVisible(true);
    this.endSession('timeout');
  }

  private endSession(reason: 'win' | 'gameover' | 'timeout'): void {
    const won = reason === 'win';
    // Map game stats to the shared summary shape. wrongAnswers tracks
    // wrong MATH-gate answers, NOT gameplay deaths — getting caught
    // by a cake hole isn't a learning failure, just gameplay. This
    // lets a kid who plays through to game-over still earn the 1-coin
    // completion drip via the standard mint path (efficiency >= 0.7),
    // as long as their math wasn't catastrophic.
    //
    //   score = pelletsEaten        (progress signal)
    //   wrongAnswers = wrongMathAnswers  (true correctness signal)
    //   optimalTaps = pelletsTotal  (goal denominator)
    // efficiency = pelletsEaten / (pelletsEaten + wrongMathAnswers).
    // Most kids who play through and answer math reasonably will land
    // ≥ 0.7 and earn the coin; the metaLines surface deaths separately
    // so the kid still sees their gameplay outcome.
    const summary = buildSessionSummary({
      score: this.pelletsEaten,
      wrongAnswers: this.wrongMathAnswers,
      sessionStart: this.sessionStart,
      optimalTaps: this.pelletsTotal,
      completed: true,
      metaLines: [
        reason === 'win'
          ? '🎉 Cleared the maze!'
          : reason === 'timeout'
            ? "⏱️ Time's up!"
            : '💔 Game over',
        `🪙 ${this.pelletsEaten}/${this.pelletsTotal} tokens`,
        `🕳️ ${this.ghostsEaten} cake holes whomped`,
        `💔 ${this.deathsTotal} caught`,
        `🪙 Score ${this.score}`,
      ],
    });
    this.hostBus.emit('session:end', { summary });
  }

  // -------------------------------------------------------------------------
  // Reset (for Play Again from the host shell)
  // -------------------------------------------------------------------------

  private resetScene(): void {
    // Clean up everything and re-create — easier than reconciling
    // mid-flight tweens, ghosts, and pellet objects. Any open
    // challenge state is dropped here too; the host modal closes when
    // the next session starts via 'session:end' / Play Again.
    this.deferredWinAfterChallenge = false;
    for (const dot of this.pelletObjs.values()) dot.destroy();
    for (const power of this.powerObjs.values()) power.destroy();
    this.pelletObjs.clear();
    this.powerObjs.clear();
    for (const g of this.ghosts) g.body.destroy();
    this.ghosts = [];
    this.tweens.killAll();
    if (this.cakey?.sprite) this.cakey.sprite.destroy();

    this.score = 0;
    this.lives = 3;
    this.pelletsEaten = 0;
    this.ghostsEaten = 0;
    this.deathsTotal = 0;
    this.wrongMathAnswers = 0;
    this.movesTotal = 0;
    this.frightenedUntil = 0;
    this.phase = 'playing';
    this.sessionStart = Date.now();
    this.endTime = this.sessionStart + GAME_DURATION_MS;
    this.pauseMs = 0;
    this.pauseStartedAt = 0;
    this.pausedForChallenge = false;
    this.lastTickSec = -1;
    this.ghostsFrozenUntil = this.time.now + 2500;

    this.cloneMazeIntoState();
    // Re-draw all the dynamic content. Walls + bg from drawMaze
    // were drawn once in create() and don't need redraw — but the
    // pellets do, and we cleared them above.
    for (let r = 0; r < MAZE_ROWS; r += 1) {
      for (let c = 0; c < MAZE_COLS; c += 1) {
        const cell = this.cells[r][c];
        const x = c * CELL_PX + CELL_PX / 2;
        const y = this.gridOffsetY + r * CELL_PX + CELL_PX / 2;
        if (cell.hadPellet) {
          this.pelletObjs.set(this.cellKey(c, r), this.add.circle(x, y, 3, 0xfde68a));
        } else if (cell.hadPower) {
          // 🧁 cupcake = power-up. Subtle pulse-tween (1.0→1.18 yoyo)
          // so it stands out against the smaller token pellets but
          // doesn't compete with Cakey for attention.
          const power = this.add
            .text(x, y, '🧁', { fontSize: '22px' })
            .setOrigin(0.5);
          this.tweens.add({
            targets: power,
            scale: 1.18,
            duration: 520,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
          });
          this.powerObjs.set(this.cellKey(c, r), power);
        }
      }
    }
    this.spawnCakey();
    this.spawnGhosts();
    this.refreshHud();
    this.updateGhostFreezeBanner();
  }

  private cleanup(): void {
    this.hostBus?.off('scene:reset', this.resetScene, this);
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private cellKey(col: number, row: number): string {
    return `${col},${row}`;
  }

  private cellCenter(col: number, row: number): { x: number; y: number } {
    return {
      x: col * CELL_PX + CELL_PX / 2,
      y: this.gridOffsetY + row * CELL_PX + CELL_PX / 2,
    };
  }

  private canStep(col: number, row: number, dir: Direction): boolean {
    const target = this.stepCell(col, row, dir);
    if (target.row < 0 || target.row >= MAZE_ROWS) return false;
    return this.cells[target.row][target.col].walkable;
  }

  /** Move one cell in dir, applying tunnel wraparound on left/right
   *  edges of TUNNEL_ROWS. Returns target col/row possibly wrapped. */
  private stepCell(
    col: number,
    row: number,
    dir: Direction,
  ): { col: number; row: number } {
    const v = DIR_VECTORS[dir];
    let nc = col + v.dc;
    const nr = row + v.dr;
    if (TUNNEL_ROWS.includes(row)) {
      if (nc < 0) nc = MAZE_COLS - 1;
      else if (nc >= MAZE_COLS) nc = 0;
    }
    return { col: nc, row: nr };
  }

  private refreshHud(): void {
    this.scoreBadge.setValue(`🪙 ${this.score}`);
    this.livesBadge.setLives(Math.max(0, this.lives));
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}
