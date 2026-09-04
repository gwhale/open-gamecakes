'use client';

// CakeyCrane3DHost — React wrapper for the Cakey Crane three.js + cannon-es game.
//
//   a cake layer swings past on the crane → tap DROP → the overhang is sliced
//   off and tumbles away under physics → land it dead centre for a PERFECT and
//   the layer even grows back → every 5 drops the bakery calls an order check.
//
// One button and one gesture is the whole control surface, which is the point:
// the timing is the difficulty, so the input must never be. Tapping anywhere on
// the cake counter drops (the engine binds that itself), plus a big DROP button
// and the spacebar for anyone who wants a target to hit.

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
  playBounce,
  playCatch,
  playCorrect,
  playLevelUp,
  playPadPress,
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
import { starsForHeight, TIN_SIZES, type TinSize } from '@/lib/games/three/crane/slab';
import { resolveCraneTuning, type CraneEngine, type CraneSceneProps } from '@/lib/games/three/crane/types';

export interface CakeyCraneHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: CraneSceneProps;
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

const GATE_REASON = '📋 Order check!';
const GATE_HINT = 'Get it right and the baker patches your next layer wider.';
const RETRY_HINT = 'Not quite — here comes another one.';

function formatClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CakeyCrane3DHost(props: CakeyCraneHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CraneEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{ challenge: Challenge; hint: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [height, setHeight] = useState(0);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [combo, setCombo] = useState(0);
  const [tin, setTin] = useState<TinSize>(TIN_SIZES[0]);
  const [timeLeftMs, setTimeLeftMs] = useState(durationMin * 60_000);
  const [stars, setStars] = useState(0);
  const [endReason, setEndReason] = useState<'timeup' | 'lose'>('timeup');

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);
  const starTargetRef = useRef(12);

  const poseGate = useCallback(
    (hint: string) => {
      const c = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      });
      setChallenge({ challenge: c, hint });
      setPhase('challenge');
    },
    [props.sceneProps.challengeMode, props.sceneProps.tier, props.sceneProps.mathType],
  );

  const endRound = useCallback((reason: 'timeup' | 'lose') => {
    const stats = engineRef.current?.getStats();
    const layers = stats?.height ?? 0;
    const runStars = starsForHeight(layers, starTargetRef.current);
    const summary = buildSessionSummary({
      score: correctRef.current,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: reason === 'timeup',
      optimalTaps: correctRef.current,
      metaLines: [
        reason === 'timeup' ? '⏰ Time!' : '💔 Out of layers!',
        `🎂 ${layers} layers tall`,
        `🎯 ${stats?.perfects ?? 0} perfect drops`,
        `🍽️ ${stats?.cleanDrops ?? 0} clean landings`,
        `🔥 best streak ${stats?.bestCombo ?? 0}`,
        `🏆 ${stats?.score ?? 0} points`,
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

  // ---- iPad touch-lock ----
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

  // ---- mount the engine ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    (async () => {
      const [THREE, CANNON, mod] = await Promise.all([
        import('three'),
        import('cannon-es'),
        import('@/lib/games/three/crane/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      const reducedMotion =
        props.sceneProps.reducedMotion ??
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

      sessionStartRef.current = Date.now();
      const tuning = resolveCraneTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      starTargetRef.current = tuning.starTarget;

      const engine = mod.createCakeyCraneEngine(
        THREE,
        CANNON,
        containerRef.current,
        { ...props.sceneProps, reducedMotion },
        tuning,
        {
          onHeight: setHeight,
          onScore: setScore,
          onLives: setLives,
          onCombo: setCombo,
          onTin: setTin,
          onTimeLeft: setTimeLeftMs,
          onGate: () => poseRef.current(GATE_HINT),
          onRoundEnd: (reason) => endRef.current(reason),
          onSfx: (name) => {
            if (name === 'drop') { playPadPress(); hapticTap(); }
            else if (name === 'perfect') { playCatch(); hapticSuccess(); }
            else if (name === 'combo') { playLevelUp(); hapticSuccess(); }
            else if (name === 'fit') { playPadPress(); hapticTap(); }
            else if (name === 'trim') { playBounce(); hapticThump(); }
            else if (name === 'miss') { playWrong(); hapticWrong(); }
            else if (name === 'gate') playTick();
            else if (name === 'win') playWin();
            else if (name === 'lose') playTimeUp();
            else if (name === 'tick') playTick();
          },
        },
      );

      if (destroyed) { engine.dispose(); return; }
      engineRef.current = engine;
      engine.setPaused(false);
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

  useEffect(() => {
    const onResize = (): void => engineRef.current?.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  // ---- keyboard: space / enter drops ----
  useEffect(() => {
    if (phase !== 'playing') return;
    const down = (e: KeyboardEvent): void => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'spacebar' || k === 'enter' || k === 'arrowdown') {
        e.preventDefault();
        if (!e.repeat) engineRef.current?.drop();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [phase]);

  const onDropButton = useCallback(() => {
    engineRef.current?.drop();
  }, []);

  // ---- answer ----
  const onAnswer = useCallback((correct: boolean) => {
    if (correct) {
      correctRef.current += 1;
      playCorrect();
      hapticSuccess();
      setChallenge(null);
      setPhase('playing');
      engineRef.current?.resolveGate(true);
      return;
    }
    // A wrong answer costs nothing but the reward — the order check is a bonus
    // beat, not a punishment, so the next question just comes around again.
    wrongRef.current += 1;
    setFlashWrong(true);
    window.setTimeout(() => setFlashWrong(false), 350);
    playWrong();
    hapticWrong();
    poseRef.current(RETRY_HINT);
  }, []);

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
      .catch((err) => console.warn('[cakey-crane] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  const lowTime = timeLeftMs <= 15_000;

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-[#dff1ff] select-none'
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
            ? 'relative w-full flex-1 overflow-hidden bg-[#dff1ff]'
            : 'relative mt-3 aspect-[4/3] w-full max-w-4xl overflow-hidden rounded-[1.35rem] border-[6px] border-white bg-[#dff1ff] shadow-[0_20px_55px_rgba(15,63,88,0.22)]'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD — height + score left, clock + lives right. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <div className="flex flex-col items-start gap-1.5">
            <span className="font-mono text-3xl font-black tabular-nums text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.5)] sm:text-5xl">
              {height}
            </span>
            <span className="rounded-lg bg-zinc-950/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
              🎂 layers · {score} pts
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-lg border-2 border-white/80 px-3 py-2 font-mono text-sm font-black tabular-nums text-white shadow-lg backdrop-blur-sm ${lowTime ? 'bg-rose-500/90' : 'bg-zinc-950/65'}`}
              aria-label={`${formatClock(timeLeftMs)} left`}
            >
              {formatClock(timeLeftMs)}
            </span>
            <span aria-label={`${lives} lives`} className="rounded-lg border-2 border-white/80 bg-rose-500/90 px-3 py-2 text-sm font-black text-white shadow-lg">
              {'♥'.repeat(Math.max(0, lives))}
            </span>
          </div>
        </div>

        {/* Perfect-streak badge — the one piece of feedback that makes aiming
            feel better than mashing. */}
        {combo >= 2 && phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center">
            <span
              className="rounded-full border-2 border-white bg-amber-400 px-4 py-1.5 font-display text-lg font-black text-amber-950 shadow-lg"
              style={{ animation: 'combo-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
              aria-live="polite"
            >
              🔥 {combo} perfect in a row!
            </span>
          </div>
        ) : null}

        {/* Which tin is on the crane. Kids need this BEFORE they commit to a
            drop, so it sits directly above the DROP button rather than up in
            the corner with the score. */}
        {phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-4">
            <span
              className="rounded-full border-2 border-white bg-zinc-950/70 px-4 py-1.5 font-display text-sm font-black text-white shadow-lg backdrop-blur-sm"
              aria-live="polite"
            >
              <span aria-hidden className="mr-1.5 text-base">{tin.emoji}</span>
              {tin.label}
              {tin.scoreMult > 1 ? (
                <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 font-mono text-[11px] text-amber-950">
                  ×{tin.scoreMult}
                </span>
              ) : null}
            </span>
            <button
              type="button"
              aria-label={`Drop the ${tin.label}`}
              onPointerDown={(e) => { e.preventDefault(); onDropButton(); }}
              className="pointer-events-auto grid h-20 w-40 place-items-center rounded-full border-4 border-white bg-rose-500 font-display text-2xl font-black text-white shadow-[0_6px_0_rgba(136,19,55,0.6)] transition-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-300 active:translate-y-1 active:shadow-none"
              style={{ touchAction: 'none', minHeight: 'var(--min-tap-target)' }}
            >
              DROP!
            </button>
            <span className="rounded-full bg-zinc-950/55 px-3 py-1 text-[11px] font-bold text-white/90 backdrop-blur-sm">
              Tap anywhere, or press space
            </span>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
          <p className="max-w-md text-center text-xs text-zinc-500">
            The crane brings four tin sizes. A big tin is forgiving; a petit four pays triple but has to be
            threaded dead centre. Land one <strong>perfect</strong> and the cake even grows back a little.
            Every 5 drops the bakery calls an order check.
          </p>
        </div>
      )}

      {/* ---- order-check modal ---- */}
      {phase === 'challenge' && challenge ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Challenge: ${challenge.challenge.prompt}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm font-bold uppercase tracking-wider text-zinc-500">{GATE_REASON}</div>
            <div className="mt-1 text-center text-xs text-zinc-400">{challenge.hint}</div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
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
              {stars === 3 ? 'Showstopper!' : endReason === 'lose' ? 'It toppled!' : 'Time!'}
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

      <style>{`@keyframes combo-pop {0%{transform:scale(0.6);opacity:0;}70%{transform:scale(1.12);opacity:1;}100%{transform:scale(1);opacity:1;}}`}</style>
    </main>
  );
}
