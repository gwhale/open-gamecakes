'use client';

// SandcastleGameHost — React wrapper for the Three.js + cannon-es game.
//
// This is the 3D analogue of PhaserGameHost. Because the game isn't a Phaser
// scene, it can't use that host, so (like WordMemory) it runs its own state
// machine and re-POSTs to /api/attempts. It reuses every shared primitive:
// the challenge contract, buildSessionSummary, the sounds/haptics, and the
// exact same modal + game-over markup so the experience is identical across
// the catalog.
//
// Responsibilities:
//   1. Mount the Three engine inside a ref'd div via dynamic import so SSR
//      never touches WebGL. Strict-mode safe (createdRef + destroyed flag);
//      disposes the engine (and its WebGL context) on unmount.
//   2. Own the round state machine: pose a math challenge → on correct arm a
//      balloon → kid drags to launch → on resolve re-pose → repeat until the
//      3-minute clock expires.
//   3. Render the shared challenge modal + game-over overlay, and POST the
//      session summary.

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
  playBubble,
  playCorrect,
  playLevelUp,
  playTimeUp,
  playWin,
  playWrong,
  startMusic,
  stopMusic,
} from '@/lib/games/shared/sounds';
import { hapticThump, hapticWrong } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { resolveTuning, resolveTheme, type SandcastleSceneProps } from '@/lib/games/three/types';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';
import type { Engine } from '@/lib/games/three/engine';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface SandcastleGameHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: SandcastleSceneProps;
  attemptMeta: {
    subject: 'math' | 'reading';
    skillSlug: string;
    tier: number;
    gameSlug: string;
  };
  /** Play-again handler. The shell bumps a remount key so the engine (and its
   *  WebGL context) is fully torn down and rebuilt — cleaner than an in-place
   *  reset for a physics scene. */
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
  /** True for the guest sandbox — coins are ephemeral (banked client-side). */
  guest?: boolean;
}

// 'ready' = balloon spent, the kid watches the cakes settle and taps Launch
// when they want the next one (which poses the math question).
type Phase = 'ready' | 'playing' | 'challenge' | 'gameover';

const REASON_FIRST = '🎈 Solve to load your balloon!';
const REASON_RETRY = 'Oops — try again!';

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SandcastleGameHost(props: SandcastleGameHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();

  // Honor the All Games menu's `?from=games` so back returns there, not /town.
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('ready');
  const [challenge, setChallenge] = useState<{ challenge: Challenge; reason: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [timeLeftMs, setTimeLeftMs] = useState(() => getSessionDurationMs());
  const [score, setScore] = useState(0);
  const [flattenedCount, setFlattenedCount] = useState(0);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  // Counters live in refs so the engine's stable callbacks read fresh values.
  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);

  // ---- Round flow (refs so engine callbacks always hit the latest fn) ----
  const poseChallenge = useCallback(
    (reason: string) => {
      const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      });
      setChallenge({ challenge, reason });
      setPhase('challenge');
      engineRef.current?.setPaused(true);
    },
    [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode],
  );

  const endRound = useCallback(() => {
    const flattened = engineRef.current?.getStats().flattened ?? 0;
    const summary = buildSessionSummary({
      score: correctRef.current,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: true,
      optimalTaps: correctRef.current,
      metaLines: [`🏖️ ${flattened} buildings flattened`],
    });
    setSessionSummary(summary);
    setPhase('gameover');
    playTimeUp();
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  poseRef.current = poseChallenge;
  endRef.current = endRound;

  // ---- iPad touch-lock (verbatim from PhaserGameHost) ----
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      htmlTouchAction: html.style.touchAction,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyTouchAction: body.style.touchAction,
      bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyWidth: body.style.width,
      bodyHeight: body.style.height,
    };
    html.style.overflow = 'hidden';
    html.style.touchAction = 'none';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.width = '100%';
    body.style.height = '100%';

    const blockTouchMove = (e: TouchEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('button, input, [role="dialog"]')) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', blockTouchMove);
      html.style.overflow = prev.htmlOverflow;
      html.style.touchAction = prev.htmlTouchAction;
      html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow;
      body.style.touchAction = prev.bodyTouchAction;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition;
      body.style.width = prev.bodyWidth;
      body.style.height = prev.bodyHeight;
    };
  }, []);

  // ---- Mount the Three engine (client only, dynamic import) ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;

    let destroyed = false;

    (async () => {
      const [THREE, CANNON, mod] = await Promise.all([
        import('three'),
        import('cannon-es'),
        import('@/lib/games/three/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      sessionStartRef.current = Date.now();
      const tuning = resolveTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      const theme = resolveTheme(props.sceneProps.tier);

      const engine = mod.createEngine(THREE, CANNON, containerRef.current, tuning, theme, {
        onTimeLeft: (ms) => setTimeLeftMs(ms),
        onBuildingFlattened: (total) => {
          setFlattenedCount(total);
          playBubble();
          hapticThump();
        },
        // Shot done (after the watch-the-cakes-fall linger) → back to 'ready'.
        // The kid watches as long as they like, then taps Launch for the next.
        onBalloonResolved: () => setPhase('ready'),
        onRoundEnd: () => endRef.current(),
        onSfx: (name) => {
          if (name === 'bubble') {
            playBubble();
          } else if (name === 'win') {
            playWin();
          }
        },
      });

      if (destroyed) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
      // Start in 'ready' — the scene runs (train rolls, clock ticks) and the
      // kid taps "Launch" when they want the next balloon (and its math gate).
      engine.setPaused(false);
      startMusic(); // looping background track (gated on the mute toggle)
    })();

    return () => {
      destroyed = true;
      stopMusic();
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      createdRef.current = false;
    };
    // Mount once; sceneProps captured at mount (parent remounts via key to reset).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the WebGL canvas sized correctly across fullscreen toggles.
  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // ---- Challenge resolution ----
  // ChallengeInput owns the keypad/choice UI and the correctness check; we just
  // route the outcome: correct arms a balloon, wrong re-poses a fresh problem.
  const finishChallenge = useCallback(
    (correct: boolean) => {
      if (correct) {
        correctRef.current += 1;
        setScore(correctRef.current);
        setChallenge(null);
        setPhase('playing');
        playCorrect();
        hapticThump();
        engineRef.current?.setPaused(false);
        engineRef.current?.armBalloon();
      } else {
        wrongRef.current += 1;
        setFlashWrong(true);
        setTimeout(() => setFlashWrong(false), 350);
        playWrong();
        hapticWrong();
        // Re-pose a fresh problem; stay in the (paused) challenge phase.
        poseRef.current(REASON_RETRY);
      }
    },
    [],
  );

  const onAnswer = useCallback(
    (correct: boolean) => finishChallenge(correct),
    [finishChallenge],
  );

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
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return (await res.json()) as AttemptResponse;
      })
      .then((data) => {
        setAttemptResponse(data);
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350);
      })
      .catch((err) => console.warn('[sandcastle-host] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

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

      {/* Canvas card with overlaid HUD. The ref'd div fills the card so the
          renderer reads a real size from clientWidth/clientHeight at mount. */}
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-sky-100'
            : 'relative mt-3 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl bg-sky-100 shadow-xl'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            ⏱ {formatClock(timeLeftMs)}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            ✅ {score}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🏰 {flattenedCount}
          </span>
        </div>

        {/* Launch gate — in 'ready' the scene keeps animating (train rolls,
            cakes settle) with NO balloon armed, so the kid can just watch.
            Tapping Launch poses the math question; solving it arms the next
            balloon. This hands the pacing to the player. */}
        {phase === 'ready' ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
            <button
              type="button"
              onClick={() => poseChallenge(REASON_FIRST)}
              className="pointer-events-auto animate-bounce rounded-full bg-pink-500 px-7 py-3.5 text-lg font-extrabold text-white shadow-xl ring-4 ring-white/60 transition active:scale-95"
            >
              🎈 Launch a balloon!
            </button>
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
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">
              {challenge.reason}
            </div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {/* ---- End-of-round overlay ---- */}
      {phase === 'gameover' && sessionSummary ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div
            className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}
          >
            <div
              className="text-8xl drop-shadow-lg"
              aria-hidden
              style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              {sessionSummary.efficiency >= 0.8 ? '🎂' : sessionSummary.efficiency >= 0.5 ? '⭐' : '🏖️'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {sessionSummary.efficiency >= 0.8
                ? 'Amazing!'
                : sessionSummary.efficiency >= 0.5
                  ? 'Good run!'
                  : 'Nice try!'}
            </div>
            <div className="text-base font-medium text-zinc-700">
              <span className="font-mono font-bold">{sessionSummary.optimal_taps}</span> right
              {' · '}
              <span className="font-mono">{Math.round(sessionSummary.efficiency * 100)}%</span>
            </div>

            {sessionSummary.meta_lines && sessionSummary.meta_lines.length > 0 ? (
              <div className="flex flex-col items-center gap-1 text-sm text-zinc-700">
                {sessionSummary.meta_lines.map((line, i) => (
                  <div key={i} className="font-medium">{line}</div>
                ))}
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
                  <div className="text-xs text-zinc-600">
                    Tier {attemptResponse.currentTier} · mastery{' '}
                    {Math.round(attemptResponse.masteryPct * 100)}%
                  </div>
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
                    <SugarTokenIcon size="1.3em" className="shrink-0" />
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
                <CandyButton
                role="act"
                size="lg"
                block
                className="sm:w-auto"
                onClick={props.onPlayAgain}
              >
                Play again!
              </CandyButton>
              ) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
          <style>{`
            @keyframes win-pop {
              0%   { transform: scale(0.4) rotate(-20deg); opacity: 0; }
              60%  { transform: scale(1.18) rotate(8deg);  opacity: 1; }
              100% { transform: scale(1.0)  rotate(0deg);  opacity: 1; }
            }
            @keyframes coin-land {
              0%   { transform: translateY(-30px) scale(0.6); opacity: 0; }
              70%  { transform: translateY(4px)   scale(1.08); opacity: 1; }
              100% { transform: translateY(0)     scale(1.0);  opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}
