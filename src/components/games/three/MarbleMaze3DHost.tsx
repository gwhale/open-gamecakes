'use client';

// MarbleMaze3DHost — React wrapper for the Three.js + cannon-es marble game.
//
// 3D analogue of PhaserGameHost, same shape as SandcastleGameHost: it owns the
// round state machine and re-POSTs to /api/attempts, reusing every shared
// primitive (challenge contract, buildSessionSummary, sounds/haptics, the
// exact modal + game-over markup).
//
// Round flow (preserves the original Marble Math mechanics): tilt to roll the
// marble; rolling into a locked gate pauses and poses a math gate — correct
// drops it (+1), wrong leaves it shut. Dodge cake-holes (each costs a life);
// reach the mint goal to win, or lose on 0 lives / the 3-minute clock.
//
// Tilt permission + calibration + rotation lock are handled upstream in the
// shell; this host just receives tiltEnabled + the calibrated baselines and
// forwards them to the engine.

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
import { hapticTap, hapticThump, hapticWrong } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';
import {
  MARBLE_MAX_LIVES,
  type MarbleSceneProps,
} from '@/lib/games/three/marble/types';
import type { MarbleEngine } from '@/lib/games/three/marble/types';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface MarbleMaze3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: MarbleSceneProps;
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

const REASON_FIRST = '🔢 Solve to open the gate!';
const REASON_RETRY = 'Oops — the gate stays shut!';

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function MarbleMaze3DHost(props: MarbleMaze3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MarbleEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();

  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{ challenge: Challenge; reason: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [timeLeftMs, setTimeLeftMs] = useState(() => getSessionDurationMs());
  const [lives, setLives] = useState(MARBLE_MAX_LIVES);
  const [gates, setGates] = useState<{ solved: number; total: number }>({ solved: 0, total: 0 });
  const [mazesCleared, setMazesCleared] = useState(0);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);
  const wonRef = useRef(false);

  // ---- Round flow (refs so the engine's stable callbacks hit the latest fn) ----
  // A round now spans multiple mazes; it ends only when the clock hits zero or
  // lives run out (never on a single goal). "Winning" = clearing ≥1 maze.
  const endRound = useCallback(() => {
    engineRef.current?.setPaused(true);
    const stats = engineRef.current?.getStats();
    const solved = stats?.gatesSolved ?? 0;
    const total = stats?.gatesTotal ?? 0;
    const mazes = stats?.mazesCleared ?? 0;
    const livesLeft = stats?.lives ?? 0;
    const didWin = mazes > 0;
    wonRef.current = didWin;
    const meta = [
      `🧩 ${mazes} ${mazes === 1 ? 'maze' : 'mazes'} cleared`,
      `🚪 ${solved} ${solved === 1 ? 'gate' : 'gates'} opened`,
      `❤️ ${livesLeft} ${livesLeft === 1 ? 'life' : 'lives'} left`,
    ];
    const summary = buildSessionSummary({
      score: solved,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: didWin,
      optimalTaps: Math.max(1, total),
      metaLines: meta,
    });
    setSessionSummary(summary);
    setPhase('gameover');
    if (didWin) playWin();
    else playTimeUp();
  }, []);

  const onGateReached = useCallback(
    (gateId: string) => {
      void gateId; // gate identity isn't needed — only one gate blocks at a time
      const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      });
      setChallenge({ challenge, reason: REASON_FIRST });
      setPhase('challenge');
      // The engine paused itself when it reached the gate.
    },
    [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode],
  );

  const gateRef = useRef(onGateReached);
  const endRef = useRef(endRound);
  gateRef.current = onGateReached;
  endRef.current = endRound;

  // ---- iPad touch-lock ----
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

  // ---- Mount the Three + cannon engine (client only, dynamic import) ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;

    (async () => {
      const [THREE, CANNON, mod] = await Promise.all([
        import('three'),
        import('cannon-es'),
        import('@/lib/games/three/marble/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      sessionStartRef.current = Date.now();
      const engine = mod.createMarbleEngine(THREE, CANNON, containerRef.current, props.sceneProps, {
        onTimeLeft: (ms) => setTimeLeftMs(ms),
        onGateReached: (id) => gateRef.current(id),
        onGatesProgress: (solved, total) => setGates({ solved, total }),
        onLifeLost: (left) => {
          setLives(left);
          if (left <= 0) endRef.current();
        },
        onMazeCleared: (count) => {
          setMazesCleared(count);
          playLevelUp();
          hapticThump();
        },
        onTimeUp: () => endRef.current(),
        onSfx: (name) => {
          if (name === 'gate') {
            hapticTap();
          } else if (name === 'fall') {
            playWrong();
            hapticWrong();
          } else if (name === 'roll') {
            playBubble();
          }
        },
      });

      if (destroyed) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
      setGates({ solved: 0, total: engine.getStats().gatesTotal });
      engine.setPaused(false);
      startMusic();
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

  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // ---- Challenge resolution ----
  // ChallengeInput owns the keypad/choice UI and the correctness check; we just
  // route the outcome to the engine's gate resolver.
  const finishChallenge = useCallback((correct: boolean) => {
    setChallenge(null);
    setPhase('playing');
    engineRef.current?.resolveGate(correct); // resumes the engine

    if (correct) {
      playCorrect();
      hapticThump();
    } else {
      wrongRef.current += 1;
      setFlashWrong(true);
      setTimeout(() => setFlashWrong(false), 350);
      playWrong();
      hapticWrong();
    }
  }, []);

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
      .catch((err) => console.warn('[marble-maze-3d] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-rose-100 select-none dark:bg-zinc-950'
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

      {/* Board canvas with overlaid HUD. */}
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-rose-100'
            : 'relative mt-3 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl bg-rose-100 shadow-xl'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            ⏱ {formatClock(timeLeftMs)}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            {'❤️'.repeat(Math.max(0, lives))}
            {lives <= 0 ? '💔' : ''}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🚪 {gates.solved}/{gates.total}
          </span>
          <span className="rounded-full bg-emerald-500/70 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🧩 {mazesCleared}
          </span>
        </div>

        {phase === 'playing' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
            <span className="rounded-full bg-black/35 px-4 py-1.5 text-sm font-medium text-white shadow">
              {props.sceneProps.tiltEnabled ? 'Tilt to roll to the 🏁' : 'Drag to roll to the 🏁'}
            </span>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
        </div>
      )}

      {/* ---- Challenge modal (numeric only) ---- */}
      {phase === 'challenge' && challenge ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Challenge: ${challenge.challenge.prompt}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">
              {flashWrong ? REASON_RETRY : challenge.reason}
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
            style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fbcfe8 50%, #bbf7d0 100%)' }}
          >
            <div
              className="text-8xl drop-shadow-lg"
              aria-hidden
              style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              {wonRef.current ? '🏆' : sessionSummary.efficiency >= 0.5 ? '🎱' : '💔'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {wonRef.current ? 'You made it!' : sessionSummary.efficiency >= 0.5 ? 'So close!' : 'Try again!'}
            </div>
            <div className="text-base font-medium text-zinc-700">
              <span className="font-mono font-bold">{sessionSummary.optimal_taps}</span> gates
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
