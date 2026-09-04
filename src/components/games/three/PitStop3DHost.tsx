'use client';

// PitStop3DHost — React wrapper for the three.js Cakey Pit Stop.
//
// The kid TAPS a damaged part on the car (a raycast, in the engine), answers one
// question, then watches the crew work it. This host owns the overlay: the
// damage chips (which are also the keyboard / screen-reader path to the very
// same requestJob call the 3D taps use), the GO button, the queue strip and the
// shift progress.
//
// The question card is DOCKED, never a full-screen scrim. A question is up for
// well under half the round now, and the pit lane must stay readable while
// answering because the queue is information, not decoration.

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
  playCatch, playCorrect, playWrong, playBounce, playLevelUp,
  playStart, playSwoop, playTick, playTimeUp, playWin, startMusic, stopMusic,
} from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { hapticTap, hapticThump, hapticWrong, hapticSuccess } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import {
  resolvePitStopTuning,
  type PitStopSceneProps,
  type PitStopEngine,
  type QueueEntry,
} from '@/lib/games/three/pitstop/types';
import {
  JOBS, JOB_ORDER, NO_DAMAGE, starsForRun, canLeave, countState,
  type Damage, type JobKind,
} from '@/lib/games/three/pitstop/damage';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';

export interface PitStop3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: PitStopSceneProps;
  attemptMeta: { subject: 'math' | 'reading'; skillSlug: string; tier: number; gameId: string | null };
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

type Phase = 'playing' | 'gameover';

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

export default function PitStop3DHost(props: PitStop3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<PitStopEngine | null>(null);
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
  const [damage, setDamage] = useState<Damage>(NO_DAMAGE);
  const [activeJob, setActiveJob] = useState<JobKind | null>(null);
  const [working, setWorking] = useState(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [banked, setBanked] = useState(0);
  const [budget, setBudget] = useState(0);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  /** Token of the question on screen. A ref, not state: the answer handler must
   *  read what was live when the kid submitted, without waiting for a render. */
  const questionIdRef = useRef(0);
  const postedRef = useRef(false);
  const sessionStartRef = useRef(0);
  const toastKeyRef = useRef(0);

  const showToast = useCallback((text: string) => {
    toastKeyRef.current += 1;
    setToast({ text, key: toastKeyRef.current });
  }, []);

  const poseChallenge = useCallback(() => {
    setChallenge({
      challenge: generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
        tier: props.sceneProps.tier,
        mathType: props.sceneProps.mathType,
      }),
    });
  }, [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode]);

  const endRound = useCallback(() => {
    const st = engineRef.current?.getSummaryStats();
    if (!st) return;
    const stars = starsForRun(st.carsBanked, st.carBudget);
    setSessionSummary(buildSessionSummary({
      // `score` is maths answered RIGHT, not cars. efficiency gates mastery at
      // 0.7 across the whole catalogue, so it has to stay comparable — the
      // strategic score lives in meta_lines instead.
      score: st.correctAnswers,
      wrongAnswers: st.wrongAnswers,
      sessionStart: sessionStartRef.current,
      completed: true,
      optimalTaps: st.correctAnswers + st.wrongAnswers,
      metaLines: [
        `🏆 ${st.carsBanked}/${st.carBudget} cars home happy`,
        ...(st.carsReturned > 0 ? [`🔄 ${st.carsReturned} came back for more`] : []),
        `🔧 ${st.jobsFixed} jobs done`,
        `⭐ ${stars}/3 stars`,
      ],
    }));
    setChallenge(null);
    setPhase('gameover');
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  const toastRef = useRef(showToast);
  poseRef.current = poseChallenge;
  endRef.current = endRound;
  toastRef.current = showToast;

  // ---- iPad touch-lock ----
  // NOTE the `canvas` exemption: the pit box is TAPPED now, so blocking every
  // touch outside buttons and inputs would kill the game's only verb on the one
  // device that matters.
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
      if (t?.closest('button, input, [role="dialog"], canvas')) return;
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
      const [THREE, mod] = await Promise.all([
        import('three'),
        import('@/lib/games/three/pitstop/engine'),
      ]);
      if (destroyed || !containerRef.current) return;
      sessionStartRef.current = Date.now();
      const difficulty = props.sceneProps.difficulty ?? 'medium';
      const tuning = resolvePitStopTuning(difficulty);
      const engine = mod.createPitStopEngine(THREE, containerRef.current, props.sceneProps, tuning, difficulty, {
        onCarIn: (_id, _body, d, visits) => {
          setDamage(d);
          setWorking(false);
          setActiveJob(null);
          if (visits > 1) toastRef.current('🔄 It’s back!');
        },
        onDamage: (d) => setDamage(d),
        onJob: (kind, qid) => { questionIdRef.current = qid; setActiveJob(kind); poseRef.current(); },
        onWork: () => setWorking(true),
        onWorkDone: () => { setWorking(false); setActiveJob(null); },
        onCarOut: (_id, bankedNow) => {
          setWorking(false);
          setActiveJob(null);
          if (bankedNow) toastRef.current('🏆 Home happy!');
        },
        onCarReturned: () => {},
        onQueue: (entries) => setQueue(entries),
        onBudget: (b, cap) => { setBanked(b); setBudget(cap); },
        onTimeLeft: (ms) => setTimeLeftMs(ms),
        onRoundEnd: () => endRef.current(),
        onSfx: (name) => {
          if (name === 'arrive') playSwoop();
          else if (name === 'correct') { playCorrect(); hapticSuccess(); }
          else if (name === 'wrong') { playWrong(); hapticWrong(); }
          else if (name === 'wrench') { playStart(); hapticTap(); }
          else if (name === 'fixed') { playCatch(); hapticSuccess(); }
          else if (name === 'bank') { playWin(); hapticSuccess(); }
          else if (name === 'limp') { playBounce(); hapticThump(); }
          else if (name === 'tick') playTick();
          else if (name === 'timeUp') playTimeUp();
          else if (name === 'win') { playWin(); hapticSuccess(); }
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

  const onAnswer = useCallback((correct: boolean) => {
    if (!correct) { setFlashWrong(true); setTimeout(() => setFlashWrong(false), 350); }
    setChallenge(null);
    engineRef.current?.resolveChallenge(correct, questionIdRef.current);
  }, []);

  const onChip = useCallback((kind: JobKind) => {
    hapticTap();
    engineRef.current?.requestJob(kind);
  }, []);

  const onGo = useCallback(() => {
    hapticTap();
    engineRef.current?.sendCar();
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
        gameId: props.attemptMeta.gameId,
        gameSlug: props.gameSlug,
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
      .catch((err) => console.warn('[pit-stop] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, props.gameSlug, durationMin]);

  const ready = canLeave(damage);
  const amberLeft = countState(damage, 'worn');
  const stars = budget > 0 ? starsForRun(banked, budget) : 0;

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

      <div
        className={isFullscreen ? 'relative w-full flex-1 overflow-hidden bg-amber-50' : 'relative mt-3 aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-3xl bg-amber-50 shadow-xl'}
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" />

        {/* Top HUD */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">⏱ {formatClock(timeLeftMs)}</span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">🏆 {banked}/{budget}</span>
          {/* Queue strip. Collapses to a count on a narrow screen — this is the
              contract for when the 3D queue crops out of frame. */}
          <span className="flex items-center gap-1 rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold text-white shadow">
            <span className="hidden items-center gap-1 sm:flex" aria-label={`${queue.length} cars waiting`}>
              {queue.length === 0 ? <span className="opacity-60">lane clear</span> : queue.map((q) => (
                <span
                  key={q.id}
                  className="inline-block h-3.5 w-5 rounded-sm ring-1 ring-white/50"
                  style={{ background: hex(q.body) }}
                  title={q.returning ? 'Back for more' : 'Waiting'}
                />
              ))}
            </span>
            <span className="sm:hidden">🚗 ×{queue.length}</span>
          </span>
        </div>

        {/* Toast */}
        {toast && phase === 'playing' ? (
          <div
            key={toast.key}
            className="pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 rounded-full bg-white/95 px-5 py-2.5 text-base font-bold text-zinc-900 shadow-lg"
            style={{ animation: 'pit-toast 1.8s ease-out forwards' }}
          >
            {toast.text}
          </div>
        ) : null}

        {/* Damage chips + GO. The chips call the SAME requestJob as a tap on the
            car, so the accessible route and the delight route cannot diverge. */}
        {phase === 'playing' && !challenge ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
            <div className="flex items-center gap-1.5">
              {JOB_ORDER.map((kind) => {
                const st = damage[kind];
                if (st === 'ok') return null;
                const live = activeJob === kind;
                return (
                  <button
                    key={kind}
                    type="button"
                    disabled={working}
                    onClick={() => onChip(kind)}
                    aria-label={`${JOBS[kind].label} — ${st === 'broken' ? 'you must do this one' : 'optional'}`}
                    className={`pointer-events-auto flex items-center gap-1 rounded-full px-3 py-2 text-sm font-bold shadow transition active:scale-95 disabled:opacity-50 ${
                      st === 'broken' ? 'bg-rose-500 text-white' : 'bg-amber-300 text-amber-950'
                    } ${live ? 'ring-2 ring-white' : ''}`}
                    style={{ minHeight: 'var(--min-tap-target)' }}
                  >
                    <span aria-hidden>{JOBS[kind].glyph}</span>
                    <span className="hidden sm:inline">{JOBS[kind].label}</span>
                    {st === 'broken' ? <span aria-hidden>❗</span> : null}
                  </button>
                );
              })}
            </div>
            {/* GO carries the cost preview non-verbally: green = gone forever,
                amber = it will be back. Two colours, one loop to learn. */}
            {ready && !working ? (
              <button
                type="button"
                onClick={onGo}
                aria-label={amberLeft > 0 ? 'Send it away — it will come back' : 'Send it away for good'}
                className={`font-display pointer-events-auto rounded-2xl px-6 py-3 text-lg font-bold shadow-lg transition active:scale-95 ${
                  amberLeft > 0 ? 'bg-amber-400 text-amber-950' : 'bg-emerald-500 text-white'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                {amberLeft > 0 ? '🔄 Send it' : '🏁 Send it!'}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Docked question card */}
        {phase === 'playing' && challenge ? (
          <div
            role="dialog"
            aria-modal="false"
            aria-label={`${activeJob ? JOBS[activeJob].label : 'Job'}: ${challenge.challenge.prompt}`}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 md:inset-y-0 md:left-auto md:right-0 md:w-[27rem] md:items-center"
          >
            <div className="pointer-events-auto w-full max-w-sm rounded-3xl bg-white/95 p-4 shadow-2xl backdrop-blur-sm dark:bg-zinc-900/95">
              <div className="font-display text-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {activeJob ? `${JOBS[activeJob].glyph} ${JOBS[activeJob].label}` : ''}
              </div>
              <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
            </div>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
        </div>
      )}

      {/* Game over */}
      {phase === 'gameover' && sessionSummary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl" style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}>
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {stars === 3 ? '🏆' : stars === 2 ? '🔧' : '🧁'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {banked >= budget && budget > 0 ? 'Shift complete!' : stars >= 2 ? 'Great crew!' : 'Nice work!'}
            </div>
            {sessionSummary.meta_lines?.length ? (
              <div className="flex flex-col items-center gap-1 text-sm text-zinc-700">
                {sessionSummary.meta_lines.map((line, i) => (<div key={i} className="font-medium">{line}</div>))}
              </div>
            ) : null}
            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving your shift…</div>
            ) : attemptResponse ? (
              <div className="flex flex-col items-center gap-2">
                {attemptResponse.tieredUp ? (
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">⭐ Level up! Tier {attemptResponse.currentTier}</div>
                ) : (
                  <div className="text-xs text-zinc-600">Tier {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%</div>
                )}
                {attemptResponse.tokensEarned && attemptResponse.tokensEarned > 0 ? (
                  <div className="font-display flex items-center gap-2 rounded-full border-2 border-amber-400 bg-amber-100 px-5 py-2.5 text-base font-bold text-amber-800 shadow-md">
                    <span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              {props.onPlayAgain ? (
                <CandyButton role="act" size="lg" block className="sm:w-auto" onClick={props.onPlayAgain}>
                  Next shift!
                </CandyButton>
              ) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
        </div>
      ) : null}

      <style>{`@keyframes win-pop {0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes pit-toast{0%{transform:translate(-50%,10px) scale(0.7);opacity:0;}20%{transform:translate(-50%,0) scale(1.08);opacity:1;}80%{opacity:1;}100%{transform:translate(-50%,-14px) scale(1);opacity:0;}}`}</style>
    </main>
  );
}
