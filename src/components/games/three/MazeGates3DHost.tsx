'use client';

// MazeGates3DHost — React wrapper for Crayon Maze 3D.
//
// Builds a tier-scaled maze config (generateMazeForTier) and mounts the three.js
// engine. The fox walks the candy maze; hitting a locked gate fires onGateOpen
// → the host poses the numeric modal → resolveGate. Reaching the end wins →
// summarizeMazeSession → POST /api/attempts. Keyboard + on-screen D-pad.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import GamecakesLogo from '@/components/GamecakesLogo';
import { playHop, playCatch, playEscape, playWin, playPadPress, playLevelUp, startMusic, stopMusic } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';
import { hapticTap, hapticThump, hapticWrong, hapticSuccess } from '@/lib/haptics';
import {
  generateMazeForTier,
  summarizeMazeSession,
  type MazeGatesConfig,
  type MazeGatesSessionSummary,
} from '@/lib/games/maze-gates';
import type { MazeSceneProps, MazeEngine } from '@/lib/games/three/maze/types';
import { generateChallengeForMode } from '@/lib/games/shared/challenge-mode';
import type { Challenge } from '@/lib/games/shared/challenge';
import ChallengeInput from '@/components/games/shared/ChallengeInput';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface MazeGates3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: MazeSceneProps;
  attemptMeta: { subject: 'math' | 'reading'; skillSlug: string; tier: number; gameSlug: string };
  onPlayAgain?: () => void;
}

interface AttemptResponse {
  correct: boolean; currentTier: number; masteryPct: number; tieredUp: boolean; tieredDown: boolean;
  tokensEarned?: number; tokensBalance?: number | null; tokenReasons?: Array<'drip' | 'tier_up'>;
  guest?: boolean;
}

type Phase = 'playing' | 'challenge' | 'gameover';
type Dir = 'up' | 'down' | 'left' | 'right';

export default function MazeGates3DHost(props: MazeGates3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MazeEngine | null>(null);
  const configRef = useRef<MazeGatesConfig | null>(null);
  const createdRef = useRef(false);
  const isFullscreen = useIsFullscreen();

  // Honor the All Games menu's `?from=games` so back returns there, not /town.
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{ challenge: Challenge } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);
  const [gates, setGates] = useState({ solved: 0, total: 0 });

  const [summary, setSummary] = useState<MazeGatesSessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);
  const sessionStartRef = useRef(0);

  // Session clock (time cap). The maze is goal-based (no engine clock), so the
  // host owns the countdown: reaching the end OR running the clock out ends the
  // round — whichever comes first. Chosen 1/2/3-min pick also scales tokens.
  const [durationMin] = useState(() => getSessionDuration());
  const [secondsLeft, setSecondsLeft] = useState(() => Math.round(getSessionDurationMs() / 1000));
  const timeUpFiredRef = useRef(false);

  const openGate = useCallback((gateId: string) => {
    const gate = configRef.current?.gates.find((g) => g.id === gateId);
    if (!gate) return;
    const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
      tier: props.sceneProps.tier,
      mathType: props.sceneProps.mathType,
    });
    setChallenge({ challenge });
    setPhase('challenge');
  }, [props.sceneProps.challengeMode, props.sceneProps.tier, props.sceneProps.mathType]);

  const win = useCallback(() => {
    const stats = engineRef.current?.getStats();
    if (!stats) return;
    const s = summarizeMazeSession({
      gatesTotal: stats.gatesTotal,
      gatesSolved: stats.gatesSolved,
      wrongAnswers: stats.wrongAnswers,
      completed: true,
      sessionMs: Date.now() - sessionStartRef.current,
    });
    setSummary(s);
    setPhase('gameover');
    playWin();
  }, []);

  // Time cap hit — end the round with whatever gates the kid has opened.
  // Counts as a completed session (they played the full time), so the
  // token drip still pays; efficiency comes from gates solved.
  const endByTime = useCallback(() => {
    const stats = engineRef.current?.getStats();
    const s = summarizeMazeSession({
      gatesTotal: stats?.gatesTotal ?? gates.total,
      gatesSolved: stats?.gatesSolved ?? gates.solved,
      wrongAnswers: stats?.wrongAnswers ?? 0,
      completed: true,
      sessionMs: Date.now() - sessionStartRef.current,
    });
    setSummary(s);
    setPhase('gameover');
  }, [gates.total, gates.solved]);

  const openRef = useRef(openGate);
  const winRef = useRef(win);
  openRef.current = openGate;
  winRef.current = win;

  // Countdown ticks only during active play (pauses under the gate modal).
  useEffect(() => {
    if (phase !== 'playing' || secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [phase, secondsLeft]);

  useEffect(() => {
    if (secondsLeft === 0 && !timeUpFiredRef.current && phase !== 'gameover') {
      timeUpFiredRef.current = true;
      endByTime();
    }
  }, [secondsLeft, phase, endByTime]);

  // iPad touch-lock
  useEffect(() => {
    const html = document.documentElement; const body = document.body;
    const prev = { ho: html.style.overflow, ht: html.style.touchAction, hb: html.style.overscrollBehavior, bo: body.style.overflow, bt: body.style.touchAction, bb: body.style.overscrollBehavior, bp: body.style.position, bw: body.style.width, bh: body.style.height };
    html.style.overflow = 'hidden'; html.style.touchAction = 'none'; html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden'; body.style.touchAction = 'none'; body.style.overscrollBehavior = 'none'; body.style.position = 'fixed'; body.style.width = '100%'; body.style.height = '100%';
    const block = (e: TouchEvent) => { const t = e.target as HTMLElement | null; if (t?.closest('button, input, [role="dialog"]')) return; e.preventDefault(); };
    document.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('touchmove', block);
      html.style.overflow = prev.ho; html.style.touchAction = prev.ht; html.style.overscrollBehavior = prev.hb;
      body.style.overflow = prev.bo; body.style.touchAction = prev.bt; body.style.overscrollBehavior = prev.bb; body.style.position = prev.bp; body.style.width = prev.bw; body.style.height = prev.bh;
    };
  }, []);

  // Mount engine
  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    let destroyed = false;
    (async () => {
      const [THREE, mod] = await Promise.all([import('three'), import('@/lib/games/three/maze/engine')]);
      if (destroyed || !containerRef.current) return;
      sessionStartRef.current = Date.now();
      const config = generateMazeForTier(props.sceneProps.tier, props.sceneProps.mathType ?? 'mixed');
      configRef.current = config;
      const engine = mod.createMazeEngine(THREE, containerRef.current, config, {
        onGateOpen: (id) => openRef.current(id),
        onGatesProgress: (solved, total) => setGates({ solved, total }),
        onWin: () => winRef.current(),
        onSfx: (name) => {
          if (name === 'hop') playHop();
          else if (name === 'catch') { playCatch(); hapticThump(); }
          else if (name === 'escape') { playEscape(); hapticWrong(); }
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

  // Keyboard movement
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

  const dpad = useCallback((dir: Dir) => { playPadPress(); hapticTap(); engineRef.current?.setDir(dir); }, []);

  // ChallengeInput owns the keypad/choice UI and the correctness check; we just
  // route the outcome to the engine's gate resolver.
  const onAnswer = useCallback((correct: boolean) => {
    if (!correct) { setFlashWrong(true); setTimeout(() => setFlashWrong(false), 350); }
    engineRef.current?.resolveGate(correct);
    setChallenge(null); setPhase('playing');
  }, []);

  useEffect(() => {
    if (phase !== 'gameover' || !summary || postedRef.current) return;
    postedRef.current = true;
    setAttemptPosting(true);
    fetch('/api/attempts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: props.attemptMeta.subject, skillSlug: props.attemptMeta.skillSlug, tier: props.attemptMeta.tier, gameSlug: props.attemptMeta.gameSlug, summary, durationMin }),
    })
      .then(async (res) => { if (!res.ok) throw new Error(`${res.status}`); return (await res.json()) as AttemptResponse; })
      .then((data) => { setAttemptResponse(data); if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned); if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350); })
      .catch((err) => console.warn('[maze-3d] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, summary, props.attemptMeta, durationMin]);

  const eff = summary?.efficiency ?? 0;

  return (
    <main className={isFullscreen ? 'flex h-screen flex-col items-stretch overscroll-none bg-orange-100 select-none' : 'flex flex-1 flex-col items-center overscroll-none p-4 select-none sm:p-6'}>
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <ChromeNavLink href={backHref} variant="dark" size="sm" ariaLabel="Back to map">{backOverride?.label ?? '← Map'}</ChromeNavLink>
          <SoundToggle size="sm" /><FullscreenToggle size="sm" />
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
            <SoundToggle size="sm" /><FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div className={isFullscreen ? 'relative w-full flex-1 overflow-hidden bg-orange-100' : 'relative mt-3 aspect-[3/4] w-full max-w-lg overflow-hidden rounded-3xl bg-orange-100 shadow-xl'} aria-label={`${props.title} game area`}>
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            ⏱ {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">🚪 {gates.solved}/{gates.total} gates</span>
        </div>

        {phase === 'playing' ? (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 select-none">
            <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
              <span /><DPadBtn label="▲" onPress={() => dpad('up')} /><span />
              <DPadBtn label="◀" onPress={() => dpad('left')} /><span /><DPadBtn label="▶" onPress={() => dpad('right')} />
              <span /><DPadBtn label="▼" onPress={() => dpad('down')} /><span />
            </div>
          </div>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3"><ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink></div>
      )}

      {phase === 'challenge' && challenge ? (
        <div role="dialog" aria-modal="true" aria-label={`Gate: ${challenge.challenge.prompt}`} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-zinc-900">
            <div className="text-center text-sm uppercase tracking-wider text-zinc-500">🚪 Solve to open the gate!</div>
            <ChallengeInput challenge={challenge.challenge} flashWrong={flashWrong} onAnswer={onAnswer} />
          </div>
        </div>
      ) : null}

      {phase === 'gameover' && summary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm">
          <div className="relative flex w-full max-w-md flex-col items-center gap-5 rounded-[2rem] border-4 border-white/70 p-8 text-center shadow-2xl" style={{ background: 'linear-gradient(135deg, #fed7aa 0%, #fef3c7 50%, #bbf7d0 100%)' }}>
            <div className="text-8xl drop-shadow-lg" aria-hidden style={{ animation: 'win-pop 0.6s cubic-bezier(0.34,1.56,0.64,1)' }}>{eff >= 0.8 ? '🎂' : eff >= 0.5 ? '⭐' : '🦊'}</div>
            <div className="font-display text-4xl font-bold text-zinc-900">{eff >= 0.8 ? 'Amazing!' : eff >= 0.5 ? 'Good run!' : 'You made it!'}</div>
            <div className="text-base font-medium text-zinc-700">🚪 {gates.solved}/{gates.total} gates · <span className="font-mono">{Math.round(eff * 100)}%</span></div>
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
                  <div className={`font-display flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${attemptResponse.tokenReasons?.includes('tier_up') ? 'border-amber-500 bg-amber-200 text-amber-900 text-lg' : 'border-amber-400 bg-amber-100 text-amber-800 text-base'}`} style={{ animation: 'coin-land 0.55s cubic-bezier(0.34,1.56,0.64,1)' }}>
                    <SugarTokenIcon size="1.3em" className="shrink-0" /><span className="font-mono tabular-nums">+{attemptResponse.tokensEarned}</span>
                    {attemptResponse.tokenReasons?.includes('tier_up') ? (<span className="text-xs font-semibold uppercase tracking-wider">Bonus!</span>) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              {props.onPlayAgain ? (<button type="button" onClick={props.onPlayAgain} className="font-display inline-flex w-full items-center justify-center rounded-2xl border border-white/40 bg-gradient-to-br from-orange-400 to-orange-600 px-6 py-4 text-lg font-bold text-white shadow-lg transition active:scale-95 sm:w-auto" style={{ minHeight: 'var(--min-tap-target)' }}>Play again!</button>) : null}
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back home'}</ChromeNavLink>
            </div>
          </div>
          <style>{`@keyframes win-pop{0%{transform:scale(0.4) rotate(-20deg);opacity:0;}60%{transform:scale(1.18) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);opacity:1;}}@keyframes coin-land{0%{transform:translateY(-30px) scale(0.6);opacity:0;}70%{transform:translateY(4px) scale(1.08);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}`}</style>
        </div>
      ) : null}
    </main>
  );
}

function DPadBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button type="button" onPointerDown={(e) => { e.preventDefault(); onPress(); }} aria-label={label}
      className="grid h-14 w-14 place-items-center rounded-2xl border border-white/25 bg-zinc-900/70 text-2xl font-bold text-white shadow-lg backdrop-blur-sm active:scale-90 active:bg-zinc-900" style={{ touchAction: 'none' }}>{label}</button>
  );
}

