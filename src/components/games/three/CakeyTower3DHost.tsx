'use client';

// CakeyTower3DHost — React wrapper for the Cakey Tower three.js + cannon-es game.
//
//   pose a math/word challenge → on correct earn a BITE → tap a good candy to eat
//   it → the tower settles → repeat. Don't let a bad treat tumble off the plate
//   and splat (−1 life). WIN when every good candy is eaten; LOSE when lives run
//   out. Reuses the shared challenge contract, buildSessionSummary, sounds, and
//   the same modal + game-over markup as Castle Crumble.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import GamecakesLogo from '@/components/GamecakesLogo';
import {
  playBubble,
  playCorrect,
  playLevelUp,
  playTimeUp,
  playWin,
  playWrong,
  startMusic,
  stopMusic,
} from '@/lib/games/shared/sounds';
import { hapticTap, hapticThump, hapticWrong } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { resolveTowerTuning, resolveTheme, starsForRun, type TowerSceneProps } from '@/lib/games/three/tower/types';
import { getSessionDuration } from '@/lib/games/session-duration';
import type { CakeyTowerEngine } from '@/lib/games/three/tower/engine';

export interface CakeyTowerHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: TowerSceneProps;
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

// 'ready'     = between bites — the kid watches the tower settle, taps "Take a bite".
// 'challenge' = solving a problem to earn the bite.
// 'playing'   = a bite is loaded; tap a candy to eat it.
type Phase = 'ready' | 'challenge' | 'playing' | 'gameover';

const REASON_FIRST = '🍴 Solve to take a bite!';
const REASON_RETRY = 'Oops — try again!';

export default function CakeyTower3DHost(props: CakeyTowerHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CakeyTowerEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('ready');
  const [challenge, setChallenge] = useState<{ challenge: Challenge; reason: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [bites, setBites] = useState(0);
  const [lives, setLives] = useState<number | null>(null);
  const [goodLeft, setGoodLeft] = useState(0);
  const [won, setWon] = useState(false);
  const [stars, setStars] = useState(0);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);

  const poseChallenge = useCallback(
    (reason: string) => {
      const c = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      });
      setChallenge({ challenge: c, reason });
      setPhase('challenge');
      engineRef.current?.setPaused(true);
    },
    [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode],
  );

  const endRound = useCallback((didWin: boolean) => {
    const stats = engineRef.current?.getStats();
    const livesLeft = stats?.lives ?? 0;
    const startLives = stats?.startLives ?? 3;
    const goodTotal = stats?.goodTotal ?? 0;
    const runStars = starsForRun(didWin, livesLeft, startLives);
    const summary = buildSessionSummary({
      score: correctRef.current,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: didWin,
      optimalTaps: correctRef.current,
      metaLines: [
        didWin ? '🍬 Tower cleared!' : '💔 Out of lives!',
        `🍬 ${goodTotal} candies eaten`,
        `❤️ ${livesLeft} lives left`,
        ...(didWin ? [`⭐ ${runStars}/3 stars`] : []),
      ],
    });
    setWon(didWin);
    setStars(runStars);
    setSessionSummary(summary);
    setPhase('gameover');
    if (didWin) {
      playWin();
      if (runStars === 3) window.setTimeout(() => playLevelUp(), 500);
    } else {
      playTimeUp();
    }
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  poseRef.current = poseChallenge;
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

  // ---- Mount the three engine (client only) ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    (async () => {
      const [THREE, CANNON, mod] = await Promise.all([
        import('three'),
        import('cannon-es'),
        import('@/lib/games/three/tower/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      sessionStartRef.current = Date.now();
      const tuning = resolveTowerTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      const theme = resolveTheme(props.sceneProps.tier);

      const engine = mod.createCakeyTowerEngine(THREE, CANNON, containerRef.current, tuning, theme, {
        onBitesLeft: (n) => setBites(n),
        onLivesLeft: (n) => setLives(n),
        onCandiesLeft: (good) => setGoodLeft(good),
        // A bite was spent and the tower settled → pose the next problem.
        onBiteResolved: () => setPhase('ready'),
        onRoundEnd: (didWin) => endRef.current(didWin),
        onSfx: (name) => {
          if (name === 'win') playWin();
          else if (name === 'eat') { playBubble(); hapticTap(); }
          else if (name === 'splat') { playWrong(); hapticThump(); }
          else if (name === 'nope') hapticTap();
        },
      });

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

  // ---- Challenge resolution ----
  const finishChallenge = useCallback((correct: boolean) => {
    if (correct) {
      correctRef.current += 1;
      setChallenge(null);
      setPhase('playing');
      playCorrect();
      hapticThump();
      engineRef.current?.setPaused(false);
      engineRef.current?.armBite();
    } else {
      wrongRef.current += 1;
      setFlashWrong(true);
      setTimeout(() => setFlashWrong(false), 350);
      playWrong();
      hapticWrong();
      poseRef.current(REASON_RETRY);
    }
  }, []);

  const onAnswer = useCallback((correct: boolean) => finishChallenge(correct), [finishChallenge]);

  // ---- POST session summary on game over ----
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
      .catch((err) => console.warn('[cakey-tower-host] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  const lowLives = lives !== null && lives <= 1;

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-sky-100 select-none dark:bg-zinc-950'
          : 'flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'
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
        <header className="flex w-full max-w-lg items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">{props.title}</div>
              {props.subtitle ? <h1 className="text-2xl font-bold">{props.subtitle}</h1> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug={props.gameSlug} kidName={props.kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      {/* Canvas card with overlaid HUD. */}
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-sky-100'
            : 'relative mt-3 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl bg-sky-100 shadow-xl'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD badges: bites · lives · candies-left. Left-clustered so they never
            sit under the fullscreen chrome (Map / sound / fullscreen, top-right). */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-start gap-2 p-3">
          <span className="rounded-full bg-zinc-900/80 backdrop-blur-sm px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🍴 {bites}
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow ${lowLives ? 'bg-red-500/80' : 'bg-zinc-900/80 backdrop-blur-sm'}`}>
            ❤️ {lives ?? '—'}
          </span>
          <span className="rounded-full bg-zinc-900/80 backdrop-blur-sm px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🍬 {goodLeft}
          </span>
        </div>

        {/* Orbit-to-scout controls (↺/↻). */}
        {phase === 'ready' || phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
            <button
              type="button"
              aria-label="Rotate view left"
              onClick={() => { engineRef.current?.orbit(-1); hapticTap(); }}
              className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-zinc-900/80 backdrop-blur-sm text-xl font-bold text-white shadow active:scale-90"
            >
              ↺
            </button>
            <button
              type="button"
              aria-label="Rotate view right"
              onClick={() => { engineRef.current?.orbit(1); hapticTap(); }}
              className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-zinc-900/80 backdrop-blur-sm text-xl font-bold text-white shadow active:scale-90"
            >
              ↻
            </button>
          </div>
        ) : null}

        {/* Take-a-bite gate — between bites, the tower settles; tap to pose the next problem. */}
        {phase === 'ready' ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
            <button
              type="button"
              onClick={() => poseChallenge(REASON_FIRST)}
              className="pointer-events-auto animate-bounce rounded-full bg-pink-500 px-7 py-3.5 text-lg font-extrabold text-white shadow-xl ring-4 ring-white/60 transition active:scale-95"
            >
              🍴 Take a bite!
            </button>
          </div>
        ) : null}

        {/* Playing hint — a bite is loaded; tap a good candy. */}
        {phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-8">
            <div className="rounded-full bg-zinc-900/70 px-4 py-2 text-sm font-bold text-white shadow backdrop-blur-sm">
              🍬 Tap a cherry-top candy to eat it!
            </div>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
        </div>
      )}

      {/* ---- Challenge modal ---- */}
      {phase === 'challenge' && challenge ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Challenge: ${challenge.challenge.prompt}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">{challenge.reason}</div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {/* ---- End-of-round overlay ---- */}
      {phase === 'gameover' && sessionSummary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div
            className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}
          >
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {won ? '🍬' : '💔'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {won ? 'Tower cleared!' : 'Out of lives!'}
            </div>
            {won ? (
              <div className="flex gap-1 text-4xl leading-none" aria-label={`${stars} of 3 stars`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < stars ? '' : 'opacity-30 grayscale'} aria-hidden>⭐</span>
                ))}
              </div>
            ) : null}
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
                    aria-live="polite"
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
                <button
                  type="button"
                  onClick={props.onPlayAgain}
                  className="font-display group relative inline-flex w-full items-center justify-center rounded-2xl border border-white/40 bg-gradient-to-br from-rose-400 to-rose-600 px-6 py-4 text-lg font-bold text-white shadow-lg shadow-rose-300/50 transition-[transform,box-shadow,filter] duration-100 hover:brightness-110 active:scale-95 active:shadow-md sm:w-auto"
                  style={{ minHeight: 'var(--min-tap-target)' }}
                >
                  <span aria-hidden className="pointer-events-none absolute inset-x-1 top-1 h-[40%] rounded-t-[14px] bg-gradient-to-b from-white/45 to-white/0" />
                  <span className="relative z-10">Play again!</span>
                </button>
              ) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
          <style>{`
            @keyframes win-pop { 0% { transform: scale(0.4) rotate(-20deg); opacity: 0; } 60% { transform: scale(1.18) rotate(8deg); opacity: 1; } 100% { transform: scale(1.0) rotate(0deg); opacity: 1; } }
            @keyframes coin-land { 0% { transform: translateY(-30px) scale(0.6); opacity: 0; } 70% { transform: translateY(4px) scale(1.08); opacity: 1; } 100% { transform: translateY(0) scale(1.0); opacity: 1; } }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}
