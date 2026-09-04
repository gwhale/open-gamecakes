'use client';

// CakeyStacksHost — React shell around the Cakey Stacks round.
//
//   preheat question → stack cake slices in the pan → fill a layer and it bakes
//   out → every few layers an "Order up!" question stocks the Cherry Bomb tin →
//   when the pan overflows, an oven rescue question buys the stack back.
//
// The host owns chrome, HUD, the question modal and the /api/attempts POST; the
// engine owns the board. Two things here are deliberate and worth keeping:
//
//   1. CONTROLS ARE TRIPLE-REDUNDANT. Gestures on the pan, a permanent button
//      pad, and the keyboard are all live at once. A kid never has to discover
//      the "right" one, and the pad means a five-year-old who cannot yet aim a
//      drag is playing the same game as a keyboard-fluent grown-up.
//   2. HOLD-TO-REPEAT IS THE ENGINE'S JOB. The pad and the keyboard only report
//      press/release, so the repeat rate is identical across every input.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { CandyButton } from '@/components/ui/CandyButton';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import GamecakesLogo from '@/components/GamecakesLogo';
import {
  playBoom,
  playBounce,
  playCorrect,
  playLevelUp,
  playPadPress,
  playTap,
  playTick,
  playTimeUp,
  playWin,
  playWrong,
  startMusic,
  stopMusic,
} from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticTap, hapticThump, hapticWrong } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { getSessionDuration } from '@/lib/games/session-duration';
import { ROTATIONS, boxSize, type PieceType } from '@/lib/games/stacks/logic';
import {
  FLAVOURS,
  resolveStacksTuning,
  starsForRun,
  type GateContext,
  type HeldDir,
  type StacksEngine,
  type StacksSceneProps,
} from '@/lib/games/stacks/types';

export interface CakeyStacksHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: StacksSceneProps;
  attemptMeta: {
    subject: 'math' | 'reading';
    skillSlug: string;
    tier: number;
    gameSlug: string;
  };
  onPlayAgain?: () => void;
}

interface AttemptResponse {
  correct: boolean;
  currentTier: number;
  masteryPct: number;
  tieredUp: boolean;
  tieredDown: boolean;
  tokensEarned?: number;
  tokensBalance?: number | null;
  tokenReasons?: Array<'drip' | 'tier_up'>;
  guest?: boolean;
}

type Phase = 'playing' | 'challenge' | 'gameover';

/** Kid-facing framing for each question gate. The oven metaphor is doing real
 *  work here: a question is never "a test", it is the thing that opens the
 *  oven, and the reward (a Cherry Bomb) is visible in the HUD afterwards. */
const GATE_COPY: Record<GateContext, { reason: string; hint: string }> = {
  preheat: { reason: '🔥 Preheat the oven!', hint: 'Get it right and you start with a Cherry Bomb.' },
  order:   { reason: '🧁 Order up!',         hint: 'A right answer bakes you another Cherry Bomb.' },
  bomb:    { reason: '🍒 Bake a Cherry Bomb', hint: 'Solve it and the bomb clears the bottom of the pan.' },
  rescue:  { reason: '🚨 The pan is full!',   hint: 'Solve it to scoop out the bottom layers and keep going.' },
};

const RETRY_HINT = 'Not quite — here comes another one.';

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CakeyStacksHost(props: CakeyStacksHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<StacksEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';
  const view = props.sceneProps.view ?? '3d';

  const [phase, setPhase] = useState<Phase>('playing');
  const [gate, setGate] = useState<{ context: GateContext; challenge: Challenge; hint: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [timeLeftMs, setTimeLeftMs] = useState(durationMin * 60_000);
  const [bombs, setBombs] = useState(0);
  const [rescues, setRescues] = useState(0);
  const [queue, setQueue] = useState<PieceType[]>([]);
  const [heldPiece, setHeldPiece] = useState<PieceType | null>(null);
  const [stars, setStars] = useState(0);
  const [endReason, setEndReason] = useState<'timeup' | 'lose'>('timeup');

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);
  const difficultyRef = useRef(props.sceneProps.difficulty ?? 'medium');

  // ---- question gates ----
  const poseGate = useCallback(
    (context: GateContext, hint?: string) => {
      const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      });
      setGate({ context, challenge, hint: hint ?? GATE_COPY[context].hint });
      setPhase('challenge');
    },
    [props.sceneProps.challengeMode, props.sceneProps.tier, props.sceneProps.mathType],
  );

  const endRound = useCallback((reason: 'timeup' | 'lose') => {
    const stats = engineRef.current?.getStats();
    const clearedLines = stats?.lines ?? 0;
    const runStars = starsForRun(clearedLines, difficultyRef.current);
    const summary = buildSessionSummary({
      score: correctRef.current,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: reason === 'timeup',
      optimalTaps: correctRef.current,
      metaLines: [
        reason === 'timeup' ? '⏰ Time!' : '🧁 The pan overflowed!',
        `🍰 ${clearedLines} layers baked`,
        `🏆 ${stats?.score ?? 0} points`,
        `🍒 ${stats?.bombsUsed ?? 0} cherry bombs used`,
        `⭐ ${runStars}/3 stars`,
      ],
    });
    setEndReason(reason);
    setStars(runStars);
    setSessionSummary(summary);
    setPhase('gameover');
    if (runStars >= 2) { playWin(); if (runStars === 3) window.setTimeout(() => playLevelUp(), 500); }
    else playTimeUp();
  }, []);

  const poseRef = useRef(poseGate);
  const endRef = useRef(endRound);
  poseRef.current = poseGate;
  endRef.current = endRound;

  // ---- iPad touch-lock (same treatment as the other 3D games) ----
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow, htmlTouch: html.style.touchAction, htmlOver: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow, bodyTouch: body.style.touchAction, bodyOver: body.style.overscrollBehavior,
      bodyPos: body.style.position, bodyW: body.style.width, bodyH: body.style.height,
    };
    html.style.overflow = 'hidden'; html.style.touchAction = 'none'; html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden'; body.style.touchAction = 'none'; body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed'; body.style.width = '100%'; body.style.height = '100%';
    const block = (e: TouchEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('button, input, [role="dialog"]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      html.style.overflow = prev.htmlOverflow; html.style.touchAction = prev.htmlTouch; html.style.overscrollBehavior = prev.htmlOver;
      body.style.overflow = prev.bodyOverflow; body.style.touchAction = prev.bodyTouch; body.style.overscrollBehavior = prev.bodyOver;
      body.style.position = prev.bodyPos; body.style.width = prev.bodyW; body.style.height = prev.bodyH;
    };
  }, []);

  // ---- mount the engine (client only; three loads ONLY for the 3D view) ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    (async () => {
      const reducedMotion =
        props.sceneProps.reducedMotion ??
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

      const core = await import('@/lib/games/stacks/core');
      const renderer = await (async () => {
        if (!containerRef.current) return null;
        if (view === '2d') {
          const mod = await import('@/lib/games/stacks/render2d');
          return mod.createStacks2DRenderer(containerRef.current, { reducedMotion });
        }
        const [THREE, mod] = await Promise.all([
          import('three'),
          import('@/lib/games/three/stacks/render3d'),
        ]);
        return mod.createStacks3DRenderer(THREE, containerRef.current, { reducedMotion });
      })();
      if (!renderer) return;
      if (destroyed || !containerRef.current) { renderer.dispose(); return; }

      sessionStartRef.current = Date.now();
      const difficulty = props.sceneProps.difficulty ?? 'medium';
      difficultyRef.current = difficulty;
      const tuning = resolveStacksTuning(difficulty, props.sceneProps.tier);

      const engine = core.createCakeyStacksEngine(
        containerRef.current,
        renderer,
        { ...props.sceneProps, reducedMotion },
        tuning,
        {
          onScore: setScore,
          onLines: setLines,
          onLevel: setLevel,
          onTimeLeft: setTimeLeftMs,
          onBombs: setBombs,
          onRescues: setRescues,
          onQueue: (next, hold) => { setQueue(next); setHeldPiece(hold); },
          onGate: (context) => poseRef.current(context),
          onRoundEnd: (reason) => endRef.current(reason),
          onSfx: (name) => {
            if (name === 'move') hapticTap();
            else if (name === 'rotate') { playTap(); hapticTap(); }
            else if (name === 'lock') { playPadPress(); hapticTap(); }
            else if (name === 'drop') { playBounce(); hapticThump(); }
            else if (name === 'clear') { playWin(); hapticSuccess(); }
            else if (name === 'tetris') { playLevelUp(); hapticSuccess(); }
            else if (name === 'hold') playTap();
            else if (name === 'bomb') { playBoom(); hapticThump(); }
            else if (name === 'levelUp') playLevelUp();
            else if (name === 'danger') { playTick(); hapticWrong(); }
            else if (name === 'lose') playTimeUp();
            else if (name === 'tick') playTick();
          },
        },
      );

      if (destroyed) { engine.dispose(); return; }
      engineRef.current = engine;
      startMusic();
    })();

    return () => {
      destroyed = true;
      stopMusic();
      if (engineRef.current) { engineRef.current.dispose(); engineRef.current = null; }
      createdRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // The pan resizes with the window, not just with fullscreen toggles.
  useEffect(() => {
    const onResize = (): void => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // ---- keyboard ----
  // Press/release only: the engine owns DAS/ARR so a held arrow feels the same
  // as a held button. Repeat keydowns (the OS's own repeat) are ignored.
  useEffect(() => {
    if (phase !== 'playing') return;
    const dirFor = (k: string): HeldDir | null => {
      if (k === 'arrowleft' || k === 'a') return 'left';
      if (k === 'arrowright' || k === 'd') return 'right';
      if (k === 'arrowdown' || k === 's') return 'down';
      return null;
    };

    const down = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      const engine = engineRef.current;
      if (!engine) return;
      const dir = dirFor(k);
      if (dir) {
        e.preventDefault();
        if (!e.repeat) engine.press(dir);
        return;
      }
      if (k === 'arrowup' || k === 'w' || k === 'x') { e.preventDefault(); if (!e.repeat) engine.rotate(1); return; }
      if (k === 'z') { e.preventDefault(); if (!e.repeat) engine.rotate(-1); return; }
      if (k === ' ' || k === 'spacebar') { e.preventDefault(); if (!e.repeat) engine.hardDrop(); return; }
      if (k === 'c' || k === 'shift') { e.preventDefault(); if (!e.repeat) engine.hold(); return; }
      if (k === 'b') { e.preventDefault(); if (!e.repeat) onBomb(); }
    };
    const up = (e: KeyboardEvent): void => {
      const dir = dirFor(e.key.toLowerCase());
      if (dir) engineRef.current?.release(dir);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---- pad ----
  const holdDir = useCallback((dir: HeldDir) => {
    playPadPress();
    hapticTap();
    engineRef.current?.press(dir);
  }, []);
  const releaseDir = useCallback((dir: HeldDir) => engineRef.current?.release(dir), []);

  /** Cherry Bomb: spend one if the tin has any, otherwise the engine opens a
   *  question gate to bake one (which arrives back here through onGate). Either
   *  way the button always does something. */
  const onBomb = useCallback(() => {
    if (phase !== 'playing') return;
    hapticTap();
    engineRef.current?.useBomb();
  }, [phase]);

  // ---- answer ----
  const onAnswer = useCallback((correct: boolean) => {
    if (correct) {
      correctRef.current += 1;
      playCorrect();
      hapticSuccess();
      setGate(null);
      setPhase('playing');
      engineRef.current?.resolveGate(true);
      return;
    }
    wrongRef.current += 1;
    setFlashWrong(true);
    window.setTimeout(() => setFlashWrong(false), 350);
    playWrong();
    hapticWrong();
    const context = gate?.context;
    // A wrong answer at a RESCUE spends one of the oven rescues — the engine
    // decides whether that ends the round, and re-opens the gate if not. Every
    // other gate is a free retry: nothing is lost, the question just changes.
    if (context === 'rescue') {
      setGate(null);
      setPhase('playing');
      engineRef.current?.resolveGate(false);
      return;
    }
    if (context) poseRef.current(context, RETRY_HINT);
  }, [gate]);

  // ---- POST the session ----
  useEffect(() => {
    if (phase !== 'gameover' || !sessionSummary || postedRef.current) return;
    postedRef.current = true;
    setAttemptPosting(true);
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: props.attemptMeta.subject,
        skillSlug: props.attemptMeta.skillSlug,
        tier: props.attemptMeta.tier,
        gameSlug: props.attemptMeta.gameSlug,
        summary: sessionSummary,
        durationMin,
      }),
    })
      .then(async (res) => { if (!res.ok) throw new Error(`${res.status}`); return (await res.json()) as AttemptResponse; })
      .then((data) => {
        setAttemptResponse(data);
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350);
      })
      .catch((err) => console.warn('[cakey-stacks] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  const lowTime = timeLeftMs <= 15_000;

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-[#241a2e] select-none'
          : 'flex flex-1 flex-col items-center overscroll-none p-3 select-none sm:p-5'
      }
    >
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Back to map">
            {backOverride?.label ?? '← Map'}
          </ChromeNavLink>
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-4xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-rose-500">{props.title}</div>
              {props.subtitle ? <h1 className="font-display text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50">{props.subtitle}</h1> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug={props.gameSlug} kidName={props.kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-[#241a2e]'
            : 'relative mt-3 aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-[1.35rem] border-[6px] border-white bg-[#241a2e] shadow-[0_20px_55px_rgba(40,15,60,0.35)]'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD — score/layers on the left, clock + kit on the right. Both
            clusters hug the top corners so the pan itself stays clear. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="flex flex-col items-start gap-1.5">
            <span className="font-mono text-3xl font-black tabular-nums text-white drop-shadow-[0_3px_0_rgba(20,10,30,0.6)] sm:text-5xl">{score}</span>
            <div className="flex gap-1.5">
              <span className="rounded-lg bg-zinc-950/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
                🍰 {lines} layers
              </span>
              <span className="rounded-lg bg-zinc-950/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
                Lv {level}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="flex flex-col items-end gap-1.5">
              <span
                className={`rounded-lg border-2 border-white/80 px-3 py-2 font-mono text-sm font-black tabular-nums text-white shadow-lg backdrop-blur-sm ${lowTime ? 'bg-rose-500/90' : 'bg-zinc-950/65'}`}
                aria-label={`${formatClock(timeLeftMs)} left`}
              >
                {formatClock(timeLeftMs)}
              </span>
              <span className="rounded-lg border-2 border-white/70 bg-zinc-950/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm" aria-label={`${rescues} oven rescues left`}>
                🚨 {rescues}
              </span>
            </div>
            {/* Hold + next-up previews. */}
            <div className="flex gap-1.5">
              <PiecePreview label="Stash" piece={heldPiece} />
              <div className="flex flex-col gap-1">
                {queue.slice(0, 3).map((p, i) => (
                  <PiecePreview key={`${p}-${i}`} label={i === 0 ? 'Next' : undefined} piece={p} small={i > 0} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Control pad. Always on — a kid should never have to find a gesture. */}
        {phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
            <div className="pointer-events-auto flex items-end gap-2">
              <PadButton label="◀" aria="Move left" onPress={() => holdDir('left')} onRelease={() => releaseDir('left')} />
              <PadButton label="▼" aria="Drop faster" onPress={() => holdDir('down')} onRelease={() => releaseDir('down')} />
              <PadButton label="▶" aria="Move right" onPress={() => holdDir('right')} onRelease={() => releaseDir('right')} />
            </div>
            <div className="pointer-events-auto flex items-end gap-2">
              <PadButton
                label="🍒"
                aria={bombs > 0 ? `Use a cherry bomb (${bombs} left)` : 'Solve a problem to bake a cherry bomb'}
                badge={bombs > 0 ? String(bombs) : undefined}
                tone={bombs > 0 ? 'cherry' : 'muted'}
                onPress={onBomb}
              />
              <PadButton label="🧊" aria="Stash this slice" onPress={() => { playPadPress(); hapticTap(); engineRef.current?.hold(); }} />
              <PadButton label="↻" aria="Spin" tone="mint" onPress={() => { playTap(); hapticTap(); engineRef.current?.rotate(1); }} />
              <PadButton label="⤓" aria="Slam it down" tone="act" wide onPress={() => { hapticThump(); engineRef.current?.hardDrop(); }} />
            </div>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
          <p className="max-w-md text-center text-xs text-zinc-500">
            Drag the slice sideways · tap to spin · flick down to slam · flick up to stash.
            Keyboard: arrows, <kbd>Z</kbd>/<kbd>X</kbd> spin, <kbd>space</kbd> slam, <kbd>C</kbd> stash.
          </p>
        </div>
      )}

      {/* ---- question modal ---- */}
      {phase === 'challenge' && gate ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Challenge: ${gate.challenge.prompt}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm font-bold uppercase tracking-wider text-zinc-500">
              {GATE_COPY[gate.context].reason}
            </div>
            <div className="mt-1 text-center text-xs text-zinc-400">{gate.hint}</div>
            <ChallengeInput challenge={gate.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {/* ---- end of round ---- */}
      {phase === 'gameover' && sessionSummary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div
            className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}
          >
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {stars === 3 ? '🎂' : endReason === 'lose' ? '🧁' : '🍰'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {stars === 3 ? 'Master baker!' : endReason === 'lose' ? 'Pan overflowed!' : 'Time!'}
            </div>
            <div className="flex gap-1 text-4xl leading-none" aria-label={`${stars} of 3 stars`}>
              {[0, 1, 2].map((i) => (<span key={i} className={i < stars ? '' : 'opacity-30 grayscale'} aria-hidden>⭐</span>))}
            </div>
            <div className="text-base font-medium text-zinc-700">
              <span className="font-mono font-bold">{sessionSummary.optimal_taps}</span> right
              {' · '}
              <span className="font-mono">{Math.round(sessionSummary.efficiency * 100)}%</span>
            </div>
            {sessionSummary.meta_lines && sessionSummary.meta_lines.length > 0 ? (
              <div className="flex flex-col items-center gap-1 text-sm text-zinc-700">
                {sessionSummary.meta_lines.map((line, i) => (<div key={i} className="font-medium">{line}</div>))}
              </div>
            ) : null}
            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving your run…</div>
            ) : attemptResponse ? (
              <div className="flex flex-col items-center gap-2">
                {attemptResponse.tieredUp ? (
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">
                    ⭐ Level up! Tier {attemptResponse.currentTier}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600">Tier {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%</div>
                )}
                {attemptResponse.tokensEarned && attemptResponse.tokensEarned > 0 ? (
                  <div
                    className={`font-display flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${
                      attemptResponse.tokenReasons?.includes('tier_up')
                        ? 'border-amber-500 bg-amber-200 text-amber-900 text-lg'
                        : 'border-amber-400 bg-amber-100 text-amber-800 text-base'
                    }`}
                    style={{ animation: 'coin-land 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
                  >
                    <span aria-hidden className="text-xl">🪙</span>
                    <span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                    {attemptResponse.tokenReasons?.includes('tier_up') ? (
                      <span className="text-xs font-semibold uppercase tracking-wider">Bonus!</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              {props.onPlayAgain ? (
                <CandyButton role="act" size="lg" block className="sm:w-auto" onClick={props.onPlayAgain}>
                  Play again!
                </CandyButton>
              ) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
          <style>{`@keyframes win-pop {0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes coin-land{0%{transform:translateY(-30px) scale(0.6);opacity:0;}70%{transform:translateY(4px) scale(1.08);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}`}</style>
        </div>
      ) : null}
    </main>
  );
}

/** One pad button. Pointer-based (not click) so it fires on touch-down with no
 *  300 ms wait, and releases on leave/cancel so a slid-off thumb can't leave a
 *  direction stuck down. */
function PadButton({
  label,
  aria,
  onPress,
  onRelease,
  tone = 'dark',
  badge,
  wide = false,
}: {
  label: string;
  aria: string;
  onPress: () => void;
  onRelease?: () => void;
  tone?: 'dark' | 'act' | 'mint' | 'cherry' | 'muted';
  badge?: string;
  wide?: boolean;
}) {
  const TONES: Record<string, string> = {
    dark: 'bg-zinc-950/65 text-white',
    act: 'bg-rose-500/90 text-white',
    mint: 'bg-emerald-500/90 text-white',
    cherry: 'bg-red-500/90 text-white',
    muted: 'bg-zinc-950/45 text-white/70',
  };
  return (
    <button
      type="button"
      aria-label={aria}
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); onPress(); }}
      onPointerUp={() => onRelease?.()}
      onPointerCancel={() => onRelease?.()}
      onPointerLeave={() => onRelease?.()}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative grid ${wide ? 'w-20 sm:w-24' : 'w-14 sm:w-16'} h-14 place-items-center rounded-2xl border-2 border-white/80 text-2xl font-black shadow-[0_4px_0_rgba(20,10,30,0.5)] backdrop-blur-sm transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 active:translate-y-1 active:scale-95 active:shadow-none sm:h-16 ${TONES[tone]}`}
      style={{ touchAction: 'none', minHeight: 'var(--min-tap-target)' }}
    >
      {label}
      {badge ? (
        <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-amber-400 font-mono text-xs font-black text-amber-950">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/** Tiny flat rendering of a piece for the Next / Stash slots. Drawn from the
 *  same ROTATIONS table the board uses, so a preview can never disagree with
 *  the slice that actually arrives. */
function PiecePreview({ piece, label, small = false }: { piece: PieceType | null; label?: string; small?: boolean }) {
  const size = small ? 9 : 12;
  const cells = piece ? ROTATIONS[piece][0] : [];
  const box = piece ? boxSize(piece) : 3;
  const flavour = piece ? FLAVOURS[piece] : null;
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-zinc-950/55 p-1.5 backdrop-blur-sm">
      {label ? (
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-white/70">{label}</span>
      ) : null}
      <div
        className="relative"
        style={{ width: size * 4, height: size * 2.6 }}
        role="img"
        aria-label={piece ? `${flavour!.name} slice` : label === 'Stash' ? 'Stash empty' : 'Next slice'}
      >
        {cells.map((c, i) => (
          <span
            key={i}
            className="absolute rounded-[2px]"
            style={{
              width: size - 1,
              height: size - 1,
              left: (c.x + (4 - box) / 2) * size,
              top: c.y * size,
              background: flavour ? `#${flavour.body.toString(16).padStart(6, '0')}` : 'transparent',
              boxShadow: flavour ? `inset 0 ${Math.round(size / 4)}px 0 rgba(255,255,255,0.45)` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
