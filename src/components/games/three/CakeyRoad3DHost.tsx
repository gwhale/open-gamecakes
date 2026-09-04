'use client';

// CakeyRoad3DHost — React wrapper for the three.js Cakey Road (crossy-hopper).
//
// Forked from CakeyChase3DHost: same dynamic-import-of-three pattern, numeric
// keypad modal, game-over overlay, iPad touch-lock, and POST /api/attempts. The
// engine runs the endless lane loop and fires onChallenge when the hopper lands
// on a checkpoint gate; the host poses the math problem and feeds the result
// back. HUD shows timer / lives / distance / coins; an on-screen D-pad + swipe
// + keyboard all drive single-cell hops.

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
  playHop,
  playCatch,
  playCorrect,
  playWrong,
  playBounce,
  playBoom,
  playLevelUp,
  playPadPress,
  playTick,
  playTimeUp,
  playWin,
  playTrainWhistle,
  startMusic,
  stopMusic,
} from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { hapticTap, hapticThump, hapticWrong, hapticSuccess } from '@/lib/haptics';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import { buildSessionSummary, type SessionSummary } from '@/lib/games/phaser/session';
import { resolveCakeyRoadTuning, type CakeyRoadSceneProps, type CakeyRoadEngine } from '@/lib/games/three/cakeyroad/types';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface CakeyRoad3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: CakeyRoadSceneProps;
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
type Dir = 'up' | 'down' | 'left' | 'right';

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function CakeyRoad3DHost(props: CakeyRoad3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CakeyRoadEngine | null>(null);
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
  const [distance, setDistance] = useState(0);
  const [coins, setCoins] = useState(0);
  const [lives, setLives] = useState(3);

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
      completed: true,
      optimalTaps: s.gatesCleared + s.wrongAnswers,
      metaLines: [
        `🏁 ${s.furthestRow} lanes crossed`,
        `🪙 ${s.coins} coins`,
        `🎯 ${s.gatesCleared} gates solved`,
        `💦 ${s.deaths} splats`,
      ],
    });
    setSessionSummary(summary);
    setPhase('gameover');
    playTimeUp();
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  poseRef.current = poseChallenge;
  endRef.current = endRound;

  // ---- iPad touch-lock (verbatim) ----
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
      const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/cakeyroad/engine')]);
      if (destroyed || !containerRef.current) return;
      sessionStartRef.current = Date.now();
      const tuning = resolveCakeyRoadTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      const engine = mod.createCakeyRoadEngine(THREE, containerRef.current, props.sceneProps, tuning, {
        onDistance: (d) => setDistance(d),
        onCoins: (c) => setCoins(c),
        onLives: (l) => setLives(l),
        onTimeLeft: (ms) => setTimeLeftMs(ms),
        onChallenge: () => poseRef.current(),
        onRoundEnd: () => endRef.current(),
        onSfx: (name) => {
          if (name === 'hop') { playHop(); hapticTap(); }
          else if (name === 'coin') { playCatch(); hapticTap(); }
          else if (name === 'correct') { playCorrect(); hapticSuccess(); }
          else if (name === 'wrong') { playWrong(); hapticWrong(); }
          else if (name === 'splash') { playBounce(); hapticWrong(); }
          else if (name === 'thud') { playBoom(); hapticThump(); }
          else if (name === 'swoop') { playTrainWhistle(); }
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

  // ---- Direction input (keyboard) ----
  useEffect(() => {
    if (phase !== 'playing') return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') engineRef.current?.setDir('up');
      else if (k === 'arrowdown' || k === 's') engineRef.current?.setDir('down');
      else if (k === 'arrowleft' || k === 'a') engineRef.current?.setDir('left');
      else if (k === 'arrowright' || k === 'd') engineRef.current?.setDir('right');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase]);

  const dpad = useCallback((dir: Dir) => {
    playPadPress(); hapticTap();
    engineRef.current?.setDir(dir);
  }, []);

  // ---- Challenge resolution ----
  // ChallengeInput owns the keypad/choice UI and the correctness check; we just
  // route the outcome to the engine's gate resolver.
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
      .catch((err) => console.warn('[cakey-road] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  return (
    <main className={isFullscreen ? 'flex h-screen flex-col items-stretch overscroll-none bg-[#dff4ff] select-none' : 'flex flex-1 flex-col items-center overscroll-none bg-[#f4fbff] p-3 select-none sm:p-5'}>
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Back to map">{backOverride?.label ?? '← Map'}</ChromeNavLink>
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-5xl items-start justify-between gap-4 px-1 pb-1">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">{props.title}</div>
              {props.subtitle ? <h1 className="font-display text-2xl font-black tracking-tight text-zinc-900">{props.subtitle}</h1> : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug={props.gameSlug} kidName={props.kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div className={isFullscreen ? 'relative w-full flex-1 overflow-hidden bg-[#dff4ff]' : 'relative mt-2 aspect-[16/10] w-full max-w-5xl overflow-hidden rounded-[1.35rem] border-[6px] border-white bg-[#dff4ff] shadow-[0_20px_55px_rgba(15,63,88,0.22)]'} aria-label={`${props.title} game area`}>
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* HUD badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-5">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-4xl font-black tabular-nums text-white drop-shadow-[0_3px_0_rgba(15,23,42,0.45)] sm:text-6xl">{distance}</span>
            <span className="w-fit rounded-lg bg-zinc-950/60 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm">Bricks crossed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border-2 border-white/80 bg-zinc-950/65 px-3 py-2 font-mono text-sm font-black tabular-nums text-white shadow-lg backdrop-blur-sm">{formatClock(timeLeftMs)}</span>
            <span aria-label={`${lives} lives`} className="rounded-lg border-2 border-white/80 bg-rose-500/90 px-3 py-2 text-sm font-black text-white shadow-lg">{'♥'.repeat(Math.max(0, lives))}</span>
            <span className="inline-flex items-center gap-1 rounded-lg border-2 border-white/80 bg-amber-400/95 px-3 py-2 font-mono text-sm font-black tabular-nums text-amber-950 shadow-lg"><SugarTokenIcon size="1em" />{coins}</span>
          </div>
        </div>

        {/* On-screen D-pad (touch controls) */}
        {phase === 'playing' ? (
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 select-none sm:bottom-5">
            <div className="grid grid-cols-3 grid-rows-2 gap-1.5">
              <span />
              <DPadBtn label="▲" onPress={() => dpad('up')} />
              <span />
              <DPadBtn label="◀" onPress={() => dpad('left')} />
              <DPadBtn label="▼" onPress={() => dpad('down')} />
              <DPadBtn label="▶" onPress={() => dpad('right')} />
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
        <div role="dialog" aria-modal="true" aria-label={`Challenge: ${challenge.challenge.prompt}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">🍬 Solve to open the gate!</div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {/* ---- Game-over overlay ---- */}
      {phase === 'gameover' && sessionSummary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl" style={{ background: 'linear-gradient(135deg, #fecdd3 0%, #fef3c7 50%, #bbf7d0 100%)' }}>
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
              {sessionSummary.efficiency >= 0.8 ? '🎂' : sessionSummary.efficiency >= 0.5 ? '⭐' : '🧁'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {sessionSummary.efficiency >= 0.8 ? 'Amazing!' : sessionSummary.efficiency >= 0.5 ? 'Good run!' : 'Nice try!'}
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
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">⭐ Level up! Tier {attemptResponse.currentTier}</div>
                ) : (
                  <div className="text-xs text-zinc-600">Tier {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%</div>
                )}
                {attemptResponse.tokensEarned && attemptResponse.tokensEarned > 0 ? (
                  <div className={`font-display flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${attemptResponse.tokenReasons?.includes('tier_up') ? 'border-amber-500 bg-amber-200 text-amber-900 text-lg' : 'border-amber-400 bg-amber-100 text-amber-800 text-base'}`} style={{ animation: 'coin-land 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)' }}>
                    <SugarTokenIcon size="1.3em" className="shrink-0" />
                    <span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                    {attemptResponse.tokenReasons?.includes('tier_up') ? (<span className="text-xs font-semibold uppercase tracking-wider">Bonus!</span>) : null}
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
          <style>{`@keyframes win-pop {0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes coin-land{0%{transform:translateY(-30px) scale(0.6);opacity:0;}70%{transform:translateY(4px) scale(1.08);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}`}</style>
        </div>
      ) : null}
    </main>
  );
}

function DPadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); onPress(); }}
      aria-label={label}
      className="grid h-12 w-12 place-items-center rounded-lg border-2 border-white/80 bg-zinc-950/55 text-xl font-black text-white shadow-[0_4px_0_rgba(15,23,42,0.45)] backdrop-blur-sm transition-transform hover:-translate-y-0.5 hover:bg-zinc-950/70 active:translate-y-1 active:scale-95 active:shadow-none sm:h-14 sm:w-14 sm:text-2xl"
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );
}

