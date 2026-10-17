// Shared HUD chrome — score badge, timer, lives row.
//
// Each function returns a small controller object so the scene can
// update the value without remembering the underlying GameObject:
//
//   const score = drawScoreBadge(this, { anchor: 'tl' });
//   score.setValue(42);
//
// The visual style is intentionally consistent: translucent dark panel
// + white-bordered + bold white text. This way every Gamecakes game's
// HUD reads the same regardless of background, and changing the brand
// HUD style is one edit, not nine.

import * as Phaser from 'phaser';
import { CSS } from './palette';

type Anchor = 'tl' | 'tr' | 'bl' | 'br';

interface BadgeOpts {
  anchor?: Anchor;       // corner to attach to (default 'tl')
  margin?: number;       // px from the corner (default 20)
  width?: number;        // panel width (default 160)
  height?: number;       // panel height (default 38)
  initialValue?: string; // starting text (default empty)
  monospace?: boolean;   // mono font for tabular timer-style numbers
  depth?: number;
  viewW?: number;        // required for 'tr' / 'br'
  viewH?: number;        // required for 'bl' / 'br'
}

export interface BadgeHandle {
  text: Phaser.GameObjects.Text;
  panel: Phaser.GameObjects.Rectangle;
  setValue(v: string): void;
  setColor(cssColor: string): void;
}

function resolveAnchor(opts: BadgeOpts): { x: number; y: number; originX: 0 | 1; originY: 0 | 1; textOffsetX: number; textOffsetY: number } {
  const { anchor = 'tl', margin = 20, width = 160, viewW = 0, viewH = 0 } = opts;
  switch (anchor) {
    case 'tr':
      return { x: viewW - margin, y: margin, originX: 1, originY: 0, textOffsetX: -14, textOffsetY: 6 };
    case 'bl':
      return { x: margin, y: viewH - margin, originX: 0, originY: 1, textOffsetX: 14, textOffsetY: -6 };
    case 'br':
      return { x: viewW - margin, y: viewH - margin, originX: 1, originY: 1, textOffsetX: -14, textOffsetY: -6 };
    case 'tl':
    default:
      return { x: margin, y: margin, originX: 0, originY: 0, textOffsetX: 14, textOffsetY: 6 };
  }
  // (textOffsetX/Y position the inner text relative to the panel
  // depending on which origin is set so text doesn't clip the border)
  void width;
}

/** Generic translucent HUD badge — used as the building block for score
 *  and timer. Most callers will use drawScoreBadge / drawTimerBadge
 *  instead, which preset the styling. */
function drawBadge(scene: Phaser.Scene, opts: BadgeOpts): BadgeHandle {
  const { width = 160, height = 38, depth = 49, monospace = false, initialValue = '' } = opts;
  const a = resolveAnchor(opts);
  const panel = scene.add.rectangle(a.x, a.y, width, height, 0x000000, 0.35)
    .setOrigin(a.originX, a.originY).setDepth(depth)
    .setStrokeStyle(2, 0xffffff, 0.4);
  const text = scene.add.text(
    a.x + a.textOffsetX,
    a.y + a.textOffsetY,
    initialValue,
    {
      fontSize: '24px',
      fontStyle: 'bold',
      color: CSS.TEXT_LIGHT,
      ...(monospace ? { fontFamily: 'monospace' } : {}),
    },
  ).setOrigin(a.originX, a.originY).setDepth(depth + 1);
  return {
    panel, text,
    setValue(v: string) { text.setText(v); },
    setColor(c: string) { text.setColor(c); },
  };
}

/** Score badge — same styling as the timer, anchored top-left by
 *  default. Pass `initialValue: '💦 0'` or whatever your score format. */
export function drawScoreBadge(scene: Phaser.Scene, opts: BadgeOpts = {}): BadgeHandle {
  return drawBadge(scene, { anchor: 'tl', ...opts });
}

/** Timer badge — monospace by default for stable column-width digits.
 *  Anchor top-right by default (timer is typically on the right). */
export interface TimerHandle extends BadgeHandle {
  /** Set value from elapsed milliseconds, formatted MM:SS. */
  setMs(ms: number): void;
  /** Flip to red warning color (last-30s pattern). */
  setWarning(on: boolean): void;
}

export function drawTimerBadge(scene: Phaser.Scene, opts: BadgeOpts & { viewW: number }): TimerHandle {
  const handle = drawBadge(scene, {
    anchor: 'tr',
    monospace: true,
    width: 130,
    ...opts,
  });
  let warning = false;
  return {
    ...handle,
    setMs(ms: number) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const mm = Math.floor(total / 60);
      const ss = (total % 60).toString().padStart(2, '0');
      handle.setValue(`${mm}:${ss}`);
    },
    setWarning(on: boolean) {
      if (on === warning) return;
      warning = on;
      handle.setColor(on ? CSS.TIMER_WARN : CSS.TEXT_LIGHT);
    },
  };
}

/** Lives row — heart emojis, filled vs empty. Useful for any game
 *  that tracks lives (Marble Maze, Flappy, future). Returns an object
 *  with setLives() to update without re-rendering. */
export interface LivesHandle {
  text: Phaser.GameObjects.Text;
  setLives(n: number): void;
}

export function drawLivesRow(scene: Phaser.Scene, opts: {
  x: number; y: number;
  max: number;
  initialLives?: number;
  fontSize?: number;
  depth?: number;
}): LivesHandle {
  const { x, y, max, initialLives = max, fontSize = 18, depth = 50 } = opts;
  const render = (n: number): string => {
    let s = '';
    for (let i = 0; i < max; i++) s += i < n ? '❤️' : '🖤';
    return s;
  };
  const text = scene.add.text(x, y, render(initialLives), {
    fontSize: `${fontSize}px`,
  }).setDepth(depth);
  return {
    text,
    setLives(n: number) { text.setText(render(n)); },
  };
}
