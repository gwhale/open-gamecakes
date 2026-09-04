'use client';

// CakeyRacer3DHost — React wrapper for the three.js Cakey Racer (lap racer).
//
// Forked from CakeyRoad3DHost: same dynamic-import-of-three pattern, challenge
// modal, game-over overlay, iPad touch-lock, and POST /api/attempts. The engine
// runs the race and fires onChallenge when the car reaches a boost gate; the
// host poses the problem and feeds the result back. HUD shows lap / position /
// timer / speed; hold-to-steer works from the on-screen paddles, the keyboard,
// or either half of the canvas itself.

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
  playCatch,
  playCorrect,
  playWrong,
  playBounce,
  playBoom,
  playLevelUp,
  playStart,
  playSwoop,
  playTick,
  playTimeUp,
  playWin,
  startMusic,
  stopMusic,
} from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { hapticTap, hapticThump, hapticWrong, hapticSuccess } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import {
  resolveCakeyRacerTuning,
  type CakeyRacerSceneProps,
  type CakeyRacerEngine,
  type Steer,
} from '@/lib/games/three/racer/types';
import { LAPS } from '@/lib/games/three/racer/track';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';

export interface CakeyRacer3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: CakeyRacerSceneProps;
  attemptMeta: { subject: 'math' | 'reading'; skillSlug: string; tier: number; gameSlug: string };
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

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Lap times want tenths — "0:18.4" reads as a lap, "0:18" reads as a guess. */
function formatLap(ms: number): string {
  const s = ms / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

const ORDINAL = ['', '1st', '2nd', '3rd', '4th'];

export default function CakeyRacer3DHost(props: CakeyRacer3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CakeyRacerEngine | null>(null);
  const createdRef = useRef(false);
  const isFullscreen = useIsFullscreen();

  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{ challenge: Challenge } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [timeLeftMs, setTimeLeftMs] = useState(() => getSessionDurationMs());
  const [lap, setLap] = useState(0);
  const [place, setPlace] = useState(1);
  const [speedPct, setSpeedPct] = useState(0);
  const [boosting, setBoosting] = useState(false);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);
  const sessionStartRef = useRef(0);

  const poseChallenge = useCallback(() => {
    const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
      tier: props.sceneProps.tier,
      mathType: props.sceneProps.mathType,
    });
    setChallenge({ challenge });
    setPhase('challenge');
  }, [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode]);

  const endRound = useCallback(() => {
    const s = engineRef.current?.getSummaryStats();
    if (!s) return;
    const summary = buildSessionSummary({
      score: s.gatesCleared,
      wrongAnswers: s.wrongAnswers,
      sessionStart: sessionStartRef.current,
      completed: s.finished,
      optimalTaps: s.gatesCleared + s.wrongAnswers,
      metaLines: [
        s.finished
          ? `🏁 Finished ${ORDINAL[s.place] ?? `${s.place}th`} of 4`
          : `⏱ Time up on lap ${Math.min(s.laps + 1, LAPS)} of ${LAPS}`,
        s.bestLapMs !== null ? `⚡ Best lap ${formatLap(s.bestLapMs)}` : '⚡ No lap completed',
        `🍬 ${s.gatesCleared} boost gates solved`,
        `💥 ${s.bumps} bumps`,
      ],
    });
    setSessionSummary(summary);
    setPhase('gameover');
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  poseRef.current = poseChallenge;
  endRef.current = endRound;

  // ---- iPad touch-lock (verbatim from the other 3D hosts) ----
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow, htmlTouchAction: html.style.touchAction, htmlOverscroll: html.style.overscrollBehavior,
      bodyOverflow: body.style.overflow, bodyTouchAction: body.style.touchAction, bodyOverscroll: body.style.overscrollBehavior,
      bodyPosition: body.style.position, bodyWidth: body.style.width, bodyHeight: body.style.height,
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
      html.style.overflow = prev.htmlOverflow; html.style.touchAction = prev.htmlTouchAction; html.style.overscrollBehavior = prev.htmlOverscroll;
      body.style.overflow = prev.bodyOverflow; body.style.touchAction = prev.bodyTouchAction; body.style.overscrollBehavior = prev.bodyOverscroll;
      body.style.position = prev.bodyPosition; body.style.width = prev.bodyWidth; body.style.height = prev.bodyHeight;
    };
  }, []);

  // ---- Mount the engine ----
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;
    (async () => {
      const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/racer/engine')]);
      if (destroyed || !containerRef.current) return;
      sessionStartRef.current = Date.now();
      const tuning = resolveCakeyRacerTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      const engine = mod.createCakeyRacerEngine(THREE, containerRef.current, props.sceneProps, tuning, {
        onLap: (l) => setLap(l),
        onPlace: (p) => setPlace(p),
        onSpeed: (pct) => setSpeedPct(pct),
        onTimeLeft: (ms) => setTimeLeftMs(ms),
        onBoost: (active) => setBoosting(active),
        onChallenge: () => poseRef.current(),
        onRoundEnd: () => endRef.current(),
        onSfx: (name) => {
          if (name === 'gate') { playSwoop(); }
          else if (name === 'correct') { playCorrect(); hapticSuccess(); }
          else if (name === 'wrong') { playWrong(); hapticWrong(); }
          else if (name === 'boost') { playStart(); hapticSuccess(); }
          else if (name === 'bump') { playBoom(); hapticThump(); }
          else if (name === 'rough') { playBounce(); hapticTap(); }
          else if (name === 'lap') { playCatch(); hapticTap(); }
          else if (name === 'win') { playWin(); hapticSuccess(); }
          else if (name === 'timeUp') { playTimeUp(); }
          else if (name === 'tick') { playTick(); }
        },
      });
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

  // ---- Steering (keyboard) ----
  // Tracks BOTH keys rather than the last one pressed: holding left, then
  // tapping and releasing right, must leave the car still turning left.
  useEffect(() => {
    if (phase !== 'playing') return;
    const held = { left: false, right: false };
    const apply = (): void => {
      const s: Steer = held.left === held.right ? 0 : held.left ? -1 : 1;
      engineRef.current?.setSteer(s);
    };
    const keyOf = (e: KeyboardEvent): 'left' | 'right' | null => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') return 'left';
      if (k === 'arrowright' || k === 'd') return 'right';
      return null;
    };
    const down = (e: KeyboardEvent): void => { const s = keyOf(e); if (s) { held[s] = true; apply(); } };
    const up = (e: KeyboardEvent): void => { const s = keyOf(e); if (s) { held[s] = false; apply(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      engineRef.current?.setSteer(0);
    };
  }, [phase]);

  // The engine must not keep steering while a modal is up.
  useEffect(() => {
    if (phase !== 'playing') engineRef.current?.setSteer(0);
  }, [phase]);

  const steerPress = useCallback((s: Steer) => {
    hapticTap();
    engineRef.current?.setSteer(s);
  }, []);
  const steerRelease = useCallback(() => { engineRef.current?.setSteer(0); }, []);

  // ---- Challenge resolution ----
  const onAnswer = useCallback((correct: boolean) => {
    if (!correct) { setFlashWrong(true); setTimeout(() => setFlashWrong(false), 350); }
    engineRef.current?.resolveChallenge(correct);
    setChallenge(null);
    setPhase('playing');
  }, []);

  // ---- POST on game over ----
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
      .then((data) => { setAttemptResponse(data); if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned); if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350); })
      .catch((err) => console.warn('[cakey-racer] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  return (
    <main className={isFullscreen ? 'flex h-screen flex-col items-stretch overscroll-none bg-amber-50 select-none' : 'flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'}>
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Back to map">{backOverride?.label ?? '← Map'}</ChromeNavLink>
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-3xl items-start justify-between gap-4">
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

      {/* Landscape frame — a racer needs to see the corner coming, so this is
          the one 3D game in the catalog that is wider than it is tall. */}
      <div
        className={isFullscreen ? 'relative w-full flex-1 overflow-hidden bg-amber-50' : 'relative mt-3 aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-3xl bg-amber-50 shadow-xl'}
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">⏱ {formatClock(timeLeftMs)}</span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">🏁 Lap {Math.min(lap + 1, LAPS)}/{LAPS}</span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">🏆 {ORDINAL[place] ?? `${place}th`}</span>
        </div>

        {/* Speedo + boost flash. Bottom-CENTRE, not bottom-left: the steering
            paddles own both bottom corners, and at bottom-left the speedo bar
            and the "Sugar Boost!" badge rendered underneath the left paddle —
            so the one piece of feedback that says the math gate paid off was
            hidden behind the thing the kid rests their thumb on. */}
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5">
          <div className="h-2.5 w-32 overflow-hidden rounded-full bg-black/40 shadow">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${boosting ? 'bg-amber-300' : 'bg-emerald-300'}`}
              style={{ width: `${Math.min(100, speedPct * 100)}%` }}
            />
          </div>
          {boosting ? (
            <span className="w-fit rounded-full bg-amber-400/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-950 shadow" style={{ animation: 'boost-pulse 0.5s ease-in-out infinite' }}>
              🍬 Sugar Boost!
            </span>
          ) : null}
        </div>

        {/* Hold-to-steer paddles. Big, bottom corners, thumbs-on-the-edges — the
            same grip a kid already holds the iPad in. */}
        {phase === 'playing' ? (
          <>
            <SteerPad label="◀" side="left" onPress={() => steerPress(-1)} onRelease={steerRelease} />
            <SteerPad label="▶" side="right" onPress={() => steerPress(1)} onRelease={steerRelease} />
          </>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
        </div>
      )}

      {/* ---- Challenge modal ---- */}
      {phase === 'challenge' && challenge ? (
        <div role="dialog" aria-modal="true" aria-label={`Challenge: ${challenge.challenge.prompt}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">🏁 Solve it for a Sugar Boost!</div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {/* ---- Game-over overlay ---- */}
      {phase === 'gameover' && sessionSummary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl" style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}>
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {place === 1 ? '🏆' : place === 2 ? '🥈' : place === 3 ? '🥉' : '🏁'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {place === 1 ? 'You won!' : place === 2 ? 'So close!' : 'Good race!'}
            </div>
            {sessionSummary.meta_lines && sessionSummary.meta_lines.length > 0 ? (
              <div className="flex flex-col items-center gap-1 text-sm text-zinc-700">
                {sessionSummary.meta_lines.map((line, i) => (<div key={i} className="font-medium">{line}</div>))}
              </div>
            ) : null}
            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving your race…</div>
            ) : attemptResponse ? (
              <div className="flex flex-col items-center gap-2">
                {attemptResponse.tieredUp ? (
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">⭐ Level up! Tier {attemptResponse.currentTier}</div>
                ) : (
                  <div className="text-xs text-zinc-600">Tier {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%</div>
                )}
                {attemptResponse.tokensEarned && attemptResponse.tokensEarned > 0 ? (
                  <div className={`font-display flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${attemptResponse.tokenReasons?.includes('tier_up') ? 'border-amber-500 bg-amber-200 text-amber-900 text-lg' : 'border-amber-400 bg-amber-100 text-amber-800 text-base'}`} style={{ animation: 'coin-land 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    <span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                    {attemptResponse.tokenReasons?.includes('tier_up') ? (<span className="text-xs font-semibold uppercase tracking-wider">Bonus!</span>) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              {props.onPlayAgain ? (
                <CandyButton role="act" size="lg" block className="sm:w-auto" onClick={props.onPlayAgain}>
                  Race again!
                </CandyButton>
              ) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`@keyframes win-pop {0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes coin-land{0%{transform:translateY(-30px) scale(0.6);opacity:0;}70%{transform:translateY(4px) scale(1.08);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}@keyframes boost-pulse{0%,100%{opacity:1;}50%{opacity:0.55;}}`}</style>
    </main>
  );
}

function SteerPad({
  label, side, onPress, onRelease,
}: { label: string; side: 'left' | 'right'; onPress: () => void; onRelease: () => void }) {
  return (
    <button
      type="button"
      // Release on leave AND cancel, not just up: a thumb that slides off the
      // paddle mid-corner otherwise leaves the car locked into the turn.
      onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); onPress(); }}
      onPointerUp={onRelease}
      onPointerCancel={onRelease}
      onPointerLeave={onRelease}
      aria-label={side === 'left' ? 'Steer left' : 'Steer right'}
      className={`absolute bottom-4 z-20 grid h-20 w-20 place-items-center rounded-3xl border border-white/25 bg-zinc-900/60 text-3xl font-bold text-white shadow-lg backdrop-blur-sm active:scale-95 active:bg-zinc-900 ${side === 'left' ? 'left-4' : 'right-4'}`}
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );
}
