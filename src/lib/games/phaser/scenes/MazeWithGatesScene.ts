// Maze With Gates (Crayon Maze) — Phaser 3 port.
//
// The most complex port of the five games. The kid controls a character
// token (🦊 by default) through a hand-drawn maze with orange walls.
// Certain cells are "gates" — walking into one opens the shared React
// challenge modal with a pre-defined math problem (configured per gate,
// not procedurally generated). Correct answers permanently open the
// gate (color changes from hachure-orange to solid-green); wrong
// answers keep the modal open with a red flash. Reaching the end cell
// wins the session.
//
// Hand-drawn aesthetic preserved via rough.js → offscreen canvas →
// Phaser texture pipeline (same pattern as the other critter scenes but
// for every wall cell + outer frame in one texture).

import * as Phaser from 'phaser';
import rough from 'roughjs';
import {
  type MazeGatesConfig,
  type MazeGatesPosition,
  type GateDef,
  cellAt,
  challengeAnswer,
  challengePrompt,
  gateAt,
  positionsEqual,
  summarizeMazeSession,
} from '@/lib/games/maze-gates';
import type { SoundName } from '@/lib/games/phaser/session';
import {
  CSS,
  sparkleAt,
  bigHitFx,
} from '@/lib/games/theme';
// Geometry constants + props + factory live in the sibling .factory.ts.
// See FlappyScene.factory.ts for the Turbopack-dev-mode rationale.
import {
  MAZE_GATES_SCENE_KEY,
  MAZE_GATES_CELL as CELL,
  MAZE_GATES_FRAME_PAD as FRAME_PAD,
  MAZE_GATES_DPAD_BTN as DPAD_BTN,
  MAZE_GATES_DPAD_GAP as DPAD_GAP,
  MAZE_GATES_DPAD_AREA_H as DPAD_AREA_H,
  type MazeWithGatesSceneProps,
} from './MazeWithGatesScene.factory';

// ---------------------------------------------------------------------------
// Constants (Phaser-only; geometry lives in .factory.ts)
// ---------------------------------------------------------------------------

const ROUGHNESS = 1.8;
const WALL_STROKE = 3;
const HACHURE_GAP = 5;
const HACHURE_ANGLE = 41;
const MOVE_TWEEN_MS = 180;

type Direction = 'up' | 'down' | 'left' | 'right';

// ---------------------------------------------------------------------------
// Rough wall rendering → offscreen canvas → Phaser texture
// ---------------------------------------------------------------------------

function wallsTextureKey(config: MazeGatesConfig): string {
  // One texture per config (same reference = same texture).
  return `maze-walls-${config.title}`;
}

function buildWallsTexture(
  scene: Phaser.Scene,
  config: MazeGatesConfig,
): string {
  const key = wallsTextureKey(config);
  if (scene.textures.exists(key)) return key;

  const { rows, cols, cells } = config.grid;
  const width = cols * CELL + FRAME_PAD * 2;
  const height = rows * CELL + FRAME_PAD * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const rc = rough.canvas(canvas);

  const wallOpts = {
    stroke: config.theme.wallColor,
    strokeWidth: WALL_STROKE,
    roughness: ROUGHNESS,
    fill: config.theme.wallColor,
    fillStyle: 'hachure' as const,
    hachureGap: HACHURE_GAP,
    hachureAngle: HACHURE_ANGLE,
    seed: 17,
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (cells[r][c] !== 'wall') continue;
      rc.rectangle(
        FRAME_PAD + c * CELL,
        FRAME_PAD + r * CELL,
        CELL,
        CELL,
        wallOpts,
      );
    }
  }

  // Outer frame — accent color, no fill.
  rc.rectangle(
    FRAME_PAD - CELL * 0.2,
    FRAME_PAD - CELL * 0.2,
    cols * CELL + CELL * 0.4,
    rows * CELL + CELL * 0.4,
    {
      stroke: config.theme.accentColor,
      strokeWidth: 4,
      roughness: 2.2,
      seed: 31,
    },
  );

  scene.textures.addCanvas(key, canvas);
  return key;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface GateVisual {
  gate: GateDef;
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class MazeWithGatesScene extends Phaser.Scene {
  private hostBus!: Phaser.Events.EventEmitter;
  private sceneProps!: MazeWithGatesSceneProps;
  private config!: MazeGatesConfig;

  private player!: Phaser.GameObjects.Text;
  private gateVisuals = new Map<string, GateVisual>();

  private current!: MazeGatesPosition;
  private solved = new Set<string>();
  private wrongAnswers = 0;
  private sessionStart = 0;
  private won = false;
  private paused = false;                  // while challenge modal is up
  private activeGate: GateDef | null = null;

  private hudText!: Phaser.GameObjects.Text;

  constructor() {
    super(MAZE_GATES_SCENE_KEY);
  }

  create(): void {
    this.sceneProps = this.game.registry.get('sceneProps') as MazeWithGatesSceneProps;
    this.hostBus = this.game.registry.get('hostBus') as Phaser.Events.EventEmitter;
    this.config = this.sceneProps.config;
    this.current = { ...this.config.start };
    this.sessionStart = Date.now();

    this.drawBackground();
    this.drawWalls();
    this.drawGates();
    this.drawStartEndMarkers();
    this.createPlayer();
    this.drawHud();
    this.drawDPad();
    this.installKeyboard();

    this.hostBus.on('challenge:result', this.onChallengeResult, this);
    this.hostBus.on('scene:reset', this.resetScene, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private drawBackground(): void {
    const { width, height } = this.scale;
    const bgColor = Phaser.Display.Color.HexStringToColor(
      this.config.theme.backgroundColor,
    ).color;
    // Explicit -10 depth keeps the paper background below everything else
    // so walls, gates, player and HUD all render on top in insertion order.
    this.add.rectangle(width / 2, height / 2, width, height, bgColor).setDepth(-10);
  }

  private drawWalls(): void {
    const key = buildWallsTexture(this, this.config);
    // No explicit depth — default 0 puts the walls above the -10 background
    // but below the gates/player (which also default to 0 but insert later).
    this.add.image(0, 0, key).setOrigin(0, 0);
  }

  private drawGates(): void {
    for (const gate of this.config.gates) {
      const { cx, cy } = this.cellCenter(gate.position);
      const pad = 6;
      const size = CELL - pad * 2;
      const color = Phaser.Display.Color.HexStringToColor(this.config.theme.gateColor).color;

      const rect = this.add.rectangle(cx, cy, size, size, color, 0.8);
      rect.setStrokeStyle(3, color);

      const label = this.add.text(cx, cy, challengePrompt(gate.challenge), {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#ffffff',
      });
      label.setOrigin(0.5);
      label.setShadow(0, 1, '#000000', 3, true, true);

      this.gateVisuals.set(gate.id, { gate, rect, label });
    }
  }

  private markGateSolved(gate: GateDef): void {
    const v = this.gateVisuals.get(gate.id);
    if (!v) return;
    const solvedColor = Phaser.Display.Color.HexStringToColor(
      this.config.theme.gateSolvedColor,
    ).color;
    v.rect.setFillStyle(solvedColor, 0.85);
    v.rect.setStrokeStyle(3, solvedColor);
    v.label.setText('✓');
  }

  private drawStartEndMarkers(): void {
    const accent = this.config.theme.accentColor;
    const startCenter = this.cellCenter(this.config.start);
    this.add.text(startCenter.cx, startCenter.cy - CELL * 0.35, 'START', {
      fontSize: '10px',
      color: accent,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const endCenter = this.cellCenter(this.config.end);
    this.add.text(endCenter.cx, endCenter.cy - CELL * 0.35, 'END', {
      fontSize: '10px',
      color: accent,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.add.text(endCenter.cx, endCenter.cy + 2, '🏁', { fontSize: '28px' })
      .setOrigin(0.5);
  }

  private createPlayer(): void {
    const { cx, cy } = this.cellCenter(this.current);
    this.player = this.add.text(cx, cy + 2, this.config.theme.playerGlyph, {
      fontSize: '32px',
    });
    this.player.setOrigin(0.5);
    this.player.setDepth(10);
  }

  private drawHud(): void {
    this.hudText = this.add.text(
      FRAME_PAD,
      8,
      this.hudString(),
      { fontSize: '13px', color: CSS.TEXT_DARK, fontStyle: 'bold' },
    );
  }

  private hudString(): string {
    return `Gates: ${this.solved.size}/${this.config.gates.length}  ·  Wrong: ${this.wrongAnswers}`;
  }

  private drawDPad(): void {
    const { rows } = this.config.grid;
    const padTop = FRAME_PAD + rows * CELL + 16;
    const centerX = this.scale.width / 2;
    const positions: Array<[Direction, number, number, string]> = [
      ['up',    centerX,               padTop + DPAD_GAP,                         '↑'],
      ['left',  centerX - DPAD_BTN - DPAD_GAP, padTop + DPAD_BTN + DPAD_GAP * 2,  '←'],
      ['right', centerX + DPAD_BTN + DPAD_GAP, padTop + DPAD_BTN + DPAD_GAP * 2,  '→'],
      ['down',  centerX,               padTop + DPAD_BTN * 2 + DPAD_GAP * 3,      '↓'],
    ];
    for (const [dir, x, y, glyph] of positions) {
      const rect = this.add.rectangle(x, y, DPAD_BTN, DPAD_BTN, 0xffffff, 0.9);
      rect.setStrokeStyle(2, 0xa1a1aa);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.attemptMove(dir));
      const txt = this.add.text(x, y, glyph, {
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#3f3f46',
      });
      txt.setOrigin(0.5);
      // Keep the label from eating pointer events.
      txt.disableInteractive();
    }
  }

  private installKeyboard(): void {
    this.input.keyboard?.on('keydown-UP',    () => this.attemptMove('up'));
    this.input.keyboard?.on('keydown-DOWN',  () => this.attemptMove('down'));
    this.input.keyboard?.on('keydown-LEFT',  () => this.attemptMove('left'));
    this.input.keyboard?.on('keydown-RIGHT', () => this.attemptMove('right'));
  }

  // -------------------------------------------------------------------------
  // Movement + gate logic
  // -------------------------------------------------------------------------

  private attemptMove(dir: Direction): void {
    if (this.won || this.paused) return;
    const next = this.applyDir(this.current, dir);
    const cell = cellAt(this.config, next);
    if (cell === undefined || cell === 'wall') return;

    if (cell === 'gate') {
      const gate = gateAt(this.config, next);
      if (!gate) return;
      if (this.solved.has(gate.id)) {
        this.moveTo(next);
        return;
      }
      this.openChallenge(gate);
      return;
    }

    this.moveTo(next);
  }

  private applyDir(p: MazeGatesPosition, dir: Direction): MazeGatesPosition {
    switch (dir) {
      case 'up':    return { row: p.row - 1, col: p.col };
      case 'down':  return { row: p.row + 1, col: p.col };
      case 'left':  return { row: p.row,     col: p.col - 1 };
      case 'right': return { row: p.row,     col: p.col + 1 };
    }
  }

  private moveTo(pos: MazeGatesPosition): void {
    this.current = pos;
    const { cx, cy } = this.cellCenter(pos);
    this.tweens.add({
      targets: this.player,
      x: cx,
      y: cy + 2,
      duration: MOVE_TWEEN_MS,
      ease: 'Sine.easeOut',
    });
    this.emitSfx('hop');
    if (positionsEqual(pos, this.config.end)) this.endSession();
  }

  private openChallenge(gate: GateDef): void {
    this.paused = true;
    this.activeGate = gate;
    const gc = gate.challenge; // { type: 'addition'; a, b }
    this.hostBus.emit('challenge:open', {
      challenge: {
        kind: 'numeric',
        prompt: challengePrompt(gc),
        answer: challengeAnswer(gc),
      },
      reason: 'Locked Gate',
    });
  }

  private onChallengeResult(payload: { correct: boolean }): void {
    const gate = this.activeGate;
    this.activeGate = null;
    this.paused = false;
    if (!gate) return;

    if (payload.correct) {
      this.solved.add(gate.id);
      this.markGateSolved(gate);
      this.emitSfx('catch');
      // Sparkle on the unlocked gate so the kid sees a celebration
      // moment for solving the math (matches the catalog's vocabulary).
      const cellX = FRAME_PAD + gate.position.col * CELL + CELL / 2;
      const cellY = FRAME_PAD + gate.position.row * CELL + CELL / 2;
      sparkleAt(this, cellX, cellY, { count: 6, spread: 26, fontSize: 14, rise: 22 });
      this.moveTo(gate.position);
    } else {
      this.wrongAnswers++;
      this.emitSfx('escape');
    }
    this.hudText.setText(this.hudString());
  }

  private endSession(): void {
    if (this.won) return;
    this.won = true;
    this.emitSfx('win');
    bigHitFx(this, { flashMs: 140, shakeMs: 0, shakeIntensity: 0 });
    const summary = summarizeMazeSession({
      gatesTotal: this.config.gates.length,
      gatesSolved: this.solved.size,
      wrongAnswers: this.wrongAnswers,
      completed: true,
      sessionMs: Date.now() - this.sessionStart,
    });
    this.hostBus.emit('session:end', { summary });
  }

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------

  private resetScene(): void {
    this.current = { ...this.config.start };
    this.solved = new Set();
    this.wrongAnswers = 0;
    this.sessionStart = Date.now();
    this.won = false;
    this.paused = false;
    this.activeGate = null;

    // Reset gate visuals to locked state.
    for (const [gateId, v] of this.gateVisuals) {
      const color = Phaser.Display.Color.HexStringToColor(this.config.theme.gateColor).color;
      v.rect.setFillStyle(color, 0.8);
      v.rect.setStrokeStyle(3, color);
      const def = this.config.gates.find((g) => g.id === gateId)!;
      v.label.setText(challengePrompt(def.challenge));
    }

    const { cx, cy } = this.cellCenter(this.current);
    this.player.setPosition(cx, cy + 2);
    this.hudText.setText(this.hudString());
  }

  private cleanup(): void {
    this.hostBus?.off('challenge:result', this.onChallengeResult, this);
    this.hostBus?.off('scene:reset', this.resetScene, this);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private cellCenter(pos: MazeGatesPosition): { cx: number; cy: number } {
    return {
      cx: FRAME_PAD + pos.col * CELL + CELL / 2,
      cy: FRAME_PAD + pos.row * CELL + CELL / 2,
    };
  }

  private emitSfx(name: SoundName): void {
    this.hostBus.emit('scene:sfx', { name });
  }
}

// MazeWithGatesSceneFactory moved to MazeWithGatesScene.factory.ts.
