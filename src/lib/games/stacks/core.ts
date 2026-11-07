// Cakey Stacks — the round.
//
// Core owns the clock, gravity, input, lock delay, the question gates and the
// scoreboard. It does not own a single pixel: it hands a read-only frame to
// whichever renderer the kid picked (3D cake pan or 2D classic) and asks for
// bursts and punches by name. Swap the renderer and the game plays identically.
//
// CONTROLS — the part that gets the most care, because a stacking game is its
// input scheme. Every scheme is live at once; nobody has to choose one:
//
//   Touch    drag left/right and the slice tracks your finger COLUMN BY COLUMN
//            (not one step per swipe, which is the thing that makes phone
//            stackers miserable). Drag down to soft drop, flick down hard to
//            slam, flick up to stash, tap to spin.
//   Buttons  a permanent on-screen pad — big targets, hold-to-repeat.
//   Keyboard arrows to move, ↑/X spin, Z spin back, space to slam, C to stash,
//            with proper DAS/ARR so a held arrow glides instead of stuttering.
//
// Auto-repeat lives HERE rather than in a React timer so the rate is tied to
// the frame loop and stays honest under load.

import { getSessionDurationMs } from '@/lib/games/session-duration';
import {
  cellsOf,
  COLS,
  clearBottomRows,
  clearRows,
  createBag,
  createBoard,
  dropDistance,
  fits,
  fullRows,
  ghostOf,
  gravityMs,
  levelFor,
  lock,
  ROWS,
  scoreForClear,
  scoreForHardDrop,
  spawn,
  stackTop,
  tryMove,
  tryRotate,
  type ActivePiece,
  type Cell,
  type PieceType,
} from './logic';
import type {
  GateContext,
  HeldDir,
  StacksCallbacks,
  StacksEngine,
  StacksFrame,
  StacksRenderer,
  StacksSceneProps,
  StacksStats,
  StacksTuning,
} from './types';

/** Held-arrow feel, in the language every stacking game uses:
 *  DAS = how long you hold before it repeats, ARR = the repeat interval.
 *  These are slower than a competitive board on purpose — a seven-year-old's
 *  finger stays down longer than an adult's, and an over-eager repeat sends the
 *  slice into the far wall. */
const DAS_MS = 170;
const ARR_MS = 55;
/** Soft-drop repeat, floored so it can never outrun the eye. */
const SOFT_DROP_MIN_MS = 30;
/** How long the pop-and-collapse animation holds the board still. */
const CLEAR_MS = 230;
const CLEAR_MS_REDUCED = 110;
/** Rows from the rim at which the pan starts flashing its warning tint. */
const DANGER_ROWS = 3;
/** Next-up previews shown in the HUD. */
const QUEUE_LEN = 3;

interface Gesture {
  id: number;
  startX: number;
  startY: number;
  startPieceX: number;
  startT: number;
  columnsMoved: boolean;
  softDropping: boolean;
}

export function createCakeyStacksEngine(
  container: HTMLElement,
  renderer: StacksRenderer,
  props: StacksSceneProps,
  tuning: StacksTuning,
  cb: StacksCallbacks,
): StacksEngine {
  const reduced = props.reducedMotion === true;
  const clearMs = reduced ? CLEAR_MS_REDUCED : CLEAR_MS;

  // ---- state ----
  const board = createBoard();
  const nextPiece = createBag();
  const queue: PieceType[] = Array.from({ length: QUEUE_LEN }, () => nextPiece());
  let active: ActivePiece | null = null;
  let held: PieceType | null = null;
  let holdUsedThisPiece = false;

  let score = 0;
  let lines = 0;
  let level = tuning.startLevel;
  let pieces = 0;
  let bestClear = 0;
  let bombs = 0;
  let bombsUsed = 0;
  let rescues = tuning.rescues;
  let rescuesUsed = 0;
  let linesSinceGate = 0;

  let paused = true;              // starts paused behind the "preheat" gate
  let gate: GateContext | null = 'preheat';
  let over = false;

  let timeLeftMs = getSessionDurationMs();
  let timeReportAcc = 0;
  let lastTickSecond = Math.ceil(timeLeftMs / 1000);

  // gravity / lock
  let stepAcc = 0;
  let lockAcc = 0;
  let lockResetsLeft = tuning.lockResets;
  let resting = false;
  let clearing: { rows: number[]; t: number } | null = null;
  /** Slow-motion window granted by a Cherry Bomb — pure kindness, it buys a
   *  breath after the pan has just been rearranged under the kid. */
  let slowMoMs = 0;

  // held-direction auto-repeat
  const heldSince: Record<HeldDir, number | null> = { left: null, right: null, down: null };
  const repeatAcc: Record<HeldDir, number> = { left: 0, right: 0, down: 0 };

  const sfx = (name: Parameters<NonNullable<StacksCallbacks['onSfx']>>[0]): void => cb.onSfx?.(name);

  const stepMs = (): number => {
    const g = gravityMs(level, tuning.gravityBaseMs, tuning.gravityFloorMs);
    return slowMoMs > 0 ? g * 1.6 : g;
  };

  const emitQueue = (): void => cb.onQueue(queue.slice(0, QUEUE_LEN), held);

  // ---- spawning ----------------------------------------------------------

  /** Pull the next slice. Returns false on a top-out (the caller opens the
   *  rescue gate or ends the round). */
  function spawnNext(type?: PieceType): boolean {
    const t = type ?? queue.shift()!;
    if (!type) queue.push(nextPiece());
    const piece = spawn(t);
    emitQueue();
    if (!fits(board, piece)) {
      active = null;
      return false;
    }
    active = piece;
    pieces += 1;
    holdUsedThisPiece = false;
    stepAcc = 0;
    lockAcc = 0;
    resting = false;
    lockResetsLeft = tuning.lockResets;
    return true;
  }

  function topOut(): void {
    if (rescues > 0) {
      openGate('rescue');
    } else {
      endRound('lose');
    }
  }

  // ---- gates -------------------------------------------------------------

  function openGate(context: GateContext): void {
    gate = context;
    paused = true;
    cb.onGate(context);
  }

  function grantBomb(): void {
    bombs = Math.min(tuning.bombCap, bombs + 1);
    cb.onBombs(bombs);
  }

  function detonate(rows: number, kind: 'bomb' | 'rescue'): void {
    const cleared = clearBottomRows(board, rows);
    const cells: Cell[] = [];
    for (const y of cleared) for (let x = 0; x < COLS; x++) cells.push({ x, y });
    renderer.burst(cells, 'bomb');
    if (!reduced) renderer.punch(kind === 'rescue' ? 1 : 0.7);
    sfx('bomb');
    // A rearranged pan under a falling slice is disorienting — hand back a few
    // seconds of slower gravity so the kid can re-read it.
    slowMoMs = 3000;
    // The active piece may now hang in mid-air over nothing; that is fine, it
    // simply keeps falling.
  }

  function resolveGate(correct: boolean): void {
    const context = gate;
    if (context === null) return;
    gate = null;

    if (context === 'preheat') {
      if (correct) { grantBomb(); score += 25; cb.onScore(score); }
      if (!spawnNext()) { topOut(); return; }
      paused = false;
      return;
    }

    if (context === 'order') {
      if (correct) {
        grantBomb();
        score += 50 * level;
        cb.onScore(score);
      }
      paused = false;
      return;
    }

    if (context === 'bomb') {
      // Earned and fired in one go — it never sits in the tin, but it still
      // counts as a bomb used on the end card.
      if (correct) { bombsUsed += 1; detonate(tuning.bombRows, 'bomb'); }
      paused = false;
      return;
    }

    // rescue — the pan is full and this is the way out.
    if (correct) {
      detonate(tuning.rescueRows, 'rescue');
      if (spawnNext()) { paused = false; return; }
      // Still blocked (a stack that reaches the rim across every column):
      // spend a rescue and ask again rather than ending on a technicality.
    }
    rescues -= 1;
    rescuesUsed += 1;
    cb.onRescues(rescues);
    if (rescues > 0) { openGate('rescue'); return; }
    endRound('lose');
  }

  // ---- locking + clearing -------------------------------------------------

  function commitLock(): void {
    if (!active) return;
    const landed = lock(board, active);
    const wasAbove = cellsOf(active).some((c) => c.y < 0);
    active = null;
    renderer.burst(landed, 'lock');
    sfx('lock');

    const rows = fullRows(board);
    if (rows.length > 0) {
      const cells: Cell[] = [];
      for (const y of rows) for (let x = 0; x < COLS; x++) cells.push({ x, y });
      renderer.burst(cells, 'clear');
      if (!reduced) renderer.punch(rows.length >= 4 ? 1 : 0.35 * rows.length);
      sfx(rows.length >= 4 ? 'tetris' : 'clear');
      clearing = { rows, t: 0 };
      return;
    }

    // A piece that locked with cells above the rim means the pan overflowed.
    if (wasAbove) { topOut(); return; }
    if (!spawnNext()) topOut();
  }

  function finishClear(): void {
    if (!clearing) return;
    const n = clearing.rows.length;
    clearRows(board, clearing.rows);
    clearing = null;

    lines += n;
    linesSinceGate += n;
    bestClear = Math.max(bestClear, n);
    score += scoreForClear(n, level);
    cb.onScore(score);
    cb.onLines(lines);

    const nextLevel = levelFor(lines, tuning.startLevel, tuning.linesPerLevel);
    if (nextLevel > level) {
      level = nextLevel;
      cb.onLevel(level);
      sfx('levelUp');
    }

    if (!spawnNext()) { topOut(); return; }

    // "Order up!" — a question beat right after a clear, when the pan is at its
    // emptiest and an interruption costs nothing. Correct answers stock the
    // Cherry Bomb tin, so the maths is what keeps the rescue kit full.
    if (linesSinceGate >= tuning.linesPerGate) {
      linesSinceGate = 0;
      openGate('order');
    }
  }

  function endRound(reason: 'timeup' | 'lose'): void {
    if (over) return;
    over = true;
    paused = true;
    gate = null;
    active = null;
    sfx(reason === 'lose' ? 'lose' : 'tick');
    cb.onRoundEnd(reason);
  }

  // ---- movement ----------------------------------------------------------

  /** A successful nudge while the piece is resting rewinds the lock timer —
   *  this is the whole "slide it into the gap you just spotted" affordance. */
  function bumpLockReset(): void {
    if (resting && lockResetsLeft > 0) {
      lockResetsLeft -= 1;
      lockAcc = 0;
    }
  }

  function move(dx: number): boolean {
    if (!active || paused || clearing) return false;
    const next = tryMove(board, active, dx, 0);
    if (!next) return false;
    active = next;
    bumpLockReset();
    sfx('move');
    return true;
  }

  function rotate(dir: 1 | -1): void {
    if (!active || paused || clearing) return;
    const next = tryRotate(board, active, dir);
    if (!next) return;
    active = next;
    bumpLockReset();
    sfx('rotate');
  }

  function stepDown(fromInput: boolean): void {
    if (!active || paused || clearing) return;
    const next = tryMove(board, active, 0, 1);
    if (next) {
      active = next;
      stepAcc = 0;
      if (fromInput) { score += 1; cb.onScore(score); }
      return;
    }
    // Landed. The lock timer in tick() takes it from here.
    resting = true;
  }

  function hardDrop(): void {
    if (!active || paused || clearing) return;
    const d = dropDistance(board, active);
    if (d > 0) {
      active = { ...active, y: active.y + d };
      score += scoreForHardDrop(d);
      cb.onScore(score);
    }
    sfx('drop');
    if (!reduced) renderer.punch(0.25);
    commitLock();
  }

  function hold(): void {
    if (!active || paused || clearing || holdUsedThisPiece) return;
    const current = active.type;
    sfx('hold');
    if (held === null) {
      held = current;
      if (!spawnNext()) { topOut(); return; }
    } else {
      const swap = held;
      held = current;
      if (!spawnNext(swap)) { topOut(); return; }
    }
    holdUsedThisPiece = true;
    emitQueue();
  }

  /** The Cherry Bomb button always does something: spend one from the tin, or —
   *  when the tin is empty — open a question gate to bake one. Core opens that
   *  gate itself (rather than the host posing a modal core has never heard of)
   *  so there is exactly one owner of "is a question currently open", and
   *  resolveGate always has a context to resolve. Returns true if a bomb went
   *  off right now. */
  function useBomb(): boolean {
    if (paused || clearing || over) return false;
    if (bombs <= 0) { openGate('bomb'); return false; }
    bombs -= 1;
    bombsUsed += 1;
    cb.onBombs(bombs);
    detonate(tuning.bombRows, 'bomb');
    return true;
  }

  // ---- pointer gestures ---------------------------------------------------

  let gesture: Gesture | null = null;

  const onPointerDown = (e: PointerEvent): void => {
    if (gesture || paused || over || !active) return;
    gesture = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startPieceX: active.x,
      startT: performance.now(),
      columnsMoved: false,
      softDropping: false,
    };
    container.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id || !active) return;
    const px = Math.max(12, renderer.pxPerCell());
    const dx = e.clientX - gesture.startX;
    const dy = e.clientY - gesture.startY;

    // Column tracking: the slice sits under the finger, not one nudge per
    // swipe. Re-anchoring on every step means a long drag never drifts.
    const wanted = Math.round(dx / px);
    const delta = wanted - (active.x - gesture.startPieceX);
    if (delta !== 0 && !gesture.softDropping) {
      const dir = Math.sign(delta);
      for (let i = 0; i < Math.abs(delta); i++) {
        if (!move(dir)) break;
        gesture.columnsMoved = true;
      }
    }

    // A committed downward drag becomes a soft drop and stays one until the
    // finger comes back up, so "steer down into the gap" works.
    const wantsSoft = dy > px * 0.85 && Math.abs(dx) < px * 0.9;
    if (wantsSoft && !gesture.softDropping) {
      gesture.softDropping = true;
      press('down');
    } else if (gesture.softDropping && dy < px * 0.4) {
      gesture.softDropping = false;
      release('down');
    }
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    container.releasePointerCapture?.(e.pointerId);
    if (g.softDropping) release('down');

    const px = Math.max(12, renderer.pxPerCell());
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    const dt = Math.max(1, performance.now() - g.startT);
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const vy = ady / dt;

    if (dy > px * 1.2 && vy > 0.55 && adx < ady) { hardDrop(); return; }   // flick down = slam
    if (dy < -px * 1.0 && vy > 0.45 && adx < ady) { hold(); return; }      // flick up = stash
    if (!g.columnsMoved && !g.softDropping && adx < 12 && ady < 12 && dt < 320) rotate(1); // tap = spin
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (!gesture || e.pointerId !== gesture.id) return;
    if (gesture.softDropping) release('down');
    gesture = null;
  };

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointermove', onPointerMove);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);

  // ---- held-direction repeat ---------------------------------------------

  function press(dir: HeldDir): void {
    if (heldSince[dir] !== null) return;
    heldSince[dir] = 0;
    repeatAcc[dir] = 0;
    if (dir === 'down') stepDown(true);
    else move(dir === 'left' ? -1 : 1);
  }

  function release(dir: HeldDir): void {
    heldSince[dir] = null;
    repeatAcc[dir] = 0;
  }

  function pumpHeld(dt: number): void {
    for (const dir of ['left', 'right', 'down'] as HeldDir[]) {
      const since = heldSince[dir];
      if (since === null) continue;
      const heldMs = since + dt;
      heldSince[dir] = heldMs;
      if (dir === 'down') {
        repeatAcc.down += dt;
        const interval = Math.max(SOFT_DROP_MIN_MS, stepMs() / 10);
        while (repeatAcc.down >= interval) { repeatAcc.down -= interval; stepDown(true); }
        continue;
      }
      if (heldMs < DAS_MS) continue;
      repeatAcc[dir] += dt;
      while (repeatAcc[dir] >= ARR_MS) {
        repeatAcc[dir] -= ARR_MS;
        if (!move(dir === 'left' ? -1 : 1)) break;
      }
    }
  }

  // ---- frame loop ---------------------------------------------------------

  let raf = 0;
  let last = performance.now();
  let disposed = false;
  let dangerOn = false;

  function tick(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(64, now - last);   // clamp so a background tab can't
    last = now;                            // teleport the stack on return

    if (!paused && !over) {
      // Round clock.
      timeLeftMs = Math.max(0, timeLeftMs - dt);
      timeReportAcc += dt;
      if (timeReportAcc >= 100) { timeReportAcc = 0; cb.onTimeLeft(timeLeftMs); }
      const second = Math.ceil(timeLeftMs / 1000);
      if (second !== lastTickSecond) {
        lastTickSecond = second;
        if (second <= 5 && second > 0) sfx('tick');
      }
      if (timeLeftMs <= 0) { cb.onTimeLeft(0); endRound('timeup'); }
    }

    if (!paused && !over) {
      if (slowMoMs > 0) slowMoMs = Math.max(0, slowMoMs - dt);

      if (clearing) {
        clearing.t += dt / clearMs;
        if (clearing.t >= 1) finishClear();
      } else if (active) {
        pumpHeld(dt);
        const interval = stepMs();
        resting = dropDistance(board, active) === 0;
        if (resting) {
          lockAcc += dt;
          stepAcc = 0;
          if (lockAcc >= tuning.lockDelayMs) commitLock();
        } else {
          lockAcc = 0;
          stepAcc += dt;
          while (stepAcc >= interval && active && !clearing) {
            stepAcc -= interval;
            stepDown(false);
          }
        }
      }
    }

    // Rising edge only — one warning chirp when the stack reaches the rim, not
    // a siren every frame it stays there.
    const danger = stackTop(board) <= DANGER_ROWS;
    if (danger && !dangerOn && !paused && !over) sfx('danger');
    dangerOn = danger;

    const frame: StacksFrame = {
      board,
      active,
      ghost: active ? ghostOf(board, active) : null,
      clearing,
      level,
      danger,
      paused: paused || over,
      stepT: active && !resting ? Math.min(1, stepAcc / stepMs()) : 0,
    };
    renderer.draw(frame, dt);
  }

  // Kick everything off: the round opens on the "preheat" question, so the
  // first thing that happens in every session is a problem — and the kid walks
  // into the pan already holding a Cherry Bomb.
  cb.onTimeLeft(timeLeftMs);
  cb.onBombs(bombs);
  cb.onRescues(rescues);
  cb.onLevel(level);
  emitQueue();
  raf = requestAnimationFrame(tick);
  cb.onGate('preheat');

  return {
    press,
    release,
    rotate,
    hardDrop,
    hold,
    useBomb,
    resolveGate,
    setPaused(next: boolean) {
      // A gate or a finished round outranks the host: never un-pause into a
      // board the kid is not allowed to touch yet.
      if (!next && (gate !== null || over)) return;
      paused = next;
      if (next) { release('left'); release('right'); release('down'); }
    },
    resize() { renderer.resize(); },
    getStats(): StacksStats {
      return { score, lines, level, pieces, bestClear, bombsUsed, rescuesUsed, rescuesLeft: rescues };
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      renderer.dispose();
    },
  };
}

/** Rows on the board — re-exported so hosts can size HUD previews without
 *  importing the whole logic module. */
export { ROWS };
