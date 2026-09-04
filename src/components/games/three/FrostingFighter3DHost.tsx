'use client';

// FrostingFighter3DHost — React wrapper for Cakey's Frosting Fighter, the
// Star Fox-inspired 3D candy-space rail shooter.
//
// Same shape as SandcastleGameHost: it owns the round
// state machine and POSTs to /api/attempts, reusing every shared primitive (the
// challenge contract, buildSessionSummary, sounds/haptics, and the exact modal +
// game-over markup) so the experience matches the catalog.
//
// Round flow (ammo-reload + score-attack):
//   tap a gummy fighter → fire a laser (−1 ammo). When the clip empties, a math
//   gate poses "Solve to reload!" — correct refills the clip, wrong tops it up
//   partway. Dodge jawbreaker asteroids with the D-pad (a bonk costs a point).
//   Rack up the most treats blasted before the 3-minute clock runs out.
//
// The "fun score" (treats blasted) drives the HUD/celebration; the MATH evidence
// sent to /api/attempts is the reload-gate correct/wrong counts, so mastery
// reflects arithmetic, not trigger-finger.

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
import GamecakesMascot from '@/components/GamecakesMascot';
import {
  playBoom,
  playCorrect,
  playLaser,
  playLevelUp,
  playReload,
  playSwoop,
  playTimeUp,
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
import { AMMO_CLIP, BLASTER_LEVELS, type FlightSceneProps, type FlightEngine, type PowerupKind } from '@/lib/games/three/flight/types';
import { getSessionDuration, getSessionDurationMs } from '@/lib/games/session-duration';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface FrostingFighter3DHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: FlightSceneProps;
  attemptMeta: {
    subject: 'math' | 'reading';
    skillSlug: string;
    tier: number;
    gameSlug: string;
  };
  /** Play-again handler. The shell bumps a remount key so the engine (and its
   *  WebGL context) is fully torn down and rebuilt. */
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

const REASON_FIRST = '🔫 Solve to reload!';
const REASON_RETRY = 'Almost — try again to reload!';

function formatClock(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Toast copy + color per power-up kind (matches the in-world drop colors). */
const PICKUP_META: Record<PowerupKind, { label: string; bg: string }> = {
  blaster: { label: '🔆 Blaster Up!', bg: 'linear-gradient(to right, #f59e0b, #ec4899)' },
  speed: { label: '⚡ Speed Dash!', bg: 'linear-gradient(to right, #22d3ee, #3b82f6)' },
  bomb: { label: '💣 Frosting Bomb!', bg: 'linear-gradient(to right, #fb7185, #e11d48)' },
};

export default function FrostingFighter3DHost(props: FrostingFighter3DHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<FlightEngine | null>(null);
  const createdRef = useRef(false);

  const isFullscreen = useIsFullscreen();

  // Honor the All Games menu's `?from=games` so back returns there, not /town.
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const [phase, setPhase] = useState<Phase>('playing');
  const [challenge, setChallenge] = useState<{ challenge: Challenge; reason: string } | null>(null);
  const [flashWrong, setFlashWrong] = useState(false);

  // HUD
  const [durationMin] = useState(() => getSessionDuration());
  const [timeLeftMs, setTimeLeftMs] = useState(() => getSessionDurationMs());
  const [score, setScore] = useState(0);
  const [ammo, setAmmo] = useState(AMMO_CLIP);
  const [blasterLevel, setBlasterLevel] = useState(0);
  // Transient power-up toast — flashes the pickup then auto-clears. `key` remounts
  // the toast so the pop animation replays on back-to-back grabs.
  const [pickup, setPickup] = useState<{ kind: PowerupKind; key: number } | null>(null);
  const pickupTimerRef = useRef<number | null>(null);
  // Canyon zone (opens ~1 min in): a one-shot "fly low!" banner + a persistent badge.
  const [canyon, setCanyon] = useState(false);
  const [canyonBanner, setCanyonBanner] = useState(false);
  const canyonTimerRef = useRef<number | null>(null);
  // False until the WebGL engine finishes its dynamic import + first build, so
  // we can show a branded loading state instead of a blank dark canvas.
  const [ready, setReady] = useState(false);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  // Math evidence (drives /api/attempts), separate from the fun score.
  const correctReloadsRef = useRef(0);
  const wrongReloadsRef = useRef(0);
  const sessionStartRef = useRef(0);

  // ---- Round flow (refs so engine callbacks always hit the latest fn) ----
  const endRound = useCallback(() => {
    engineRef.current?.setPaused(true);
    const stats = engineRef.current?.getStats() ?? { blasted: 0, reloads: 0 };
    const summary = buildSessionSummary({
      score: correctReloadsRef.current,
      wrongAnswers: wrongReloadsRef.current,
      sessionStart: sessionStartRef.current,
      completed: true, // score-attack always completes
      optimalTaps: correctReloadsRef.current + wrongReloadsRef.current,
      metaLines: [`🧁 ${stats.blasted} treats blasted`, `🔁 ${stats.reloads} reloads`],
    });
    setSessionSummary(summary);
    setPhase('gameover');
    playTimeUp();
  }, []);

  const onNeedReload = useCallback(() => {
    const challenge = generateChallengeForMode(props.sceneProps.challengeMode ?? 'math', {
      tier: props.sceneProps.tier,
      mathType: props.sceneProps.mathType,
    });
    setChallenge({ challenge, reason: REASON_FIRST });
    setPhase('challenge');
    engineRef.current?.setPaused(true);
  }, [props.sceneProps.tier, props.sceneProps.mathType, props.sceneProps.challengeMode]);

  const reloadRef = useRef(onNeedReload);
  const endRef = useRef(endRound);
  reloadRef.current = onNeedReload;
  endRef.current = endRound;

  // ---- iPad touch-lock (shared verbatim with the other 3D hosts) ----
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
      const [THREE, mod] = await Promise.all([
        import('three'),
        import('@/lib/games/three/flight/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      sessionStartRef.current = Date.now();

      const engine = mod.createFlightEngine(
        THREE,
        containerRef.current,
        { tier: props.sceneProps.tier, difficulty: props.sceneProps.difficulty },
        {
          onTimeLeft: (ms) => setTimeLeftMs(ms),
          onAmmo: (n) => setAmmo(n),
          onScore: (n) => setScore(n),
          onBlaster: (n) => setBlasterLevel(n),
          onPickup: (kind) => {
            if (pickupTimerRef.current) window.clearTimeout(pickupTimerRef.current);
            setPickup({ kind, key: performance.now() });
            pickupTimerRef.current = window.setTimeout(() => setPickup(null), 1500);
          },
          onCanyon: () => {
            setCanyon(true);
            setCanyonBanner(true);
            if (canyonTimerRef.current) window.clearTimeout(canyonTimerRef.current);
            canyonTimerRef.current = window.setTimeout(() => setCanyonBanner(false), 3200);
          },
          onNeedReload: () => reloadRef.current(),
          onRoundEnd: () => endRef.current(),
          onSfx: (name) => {
            if (name === 'laser') playLaser();
            else if (name === 'boom') playBoom();
            else if (name === 'swoop') playSwoop();
            else if (name === 'power') { playLevelUp(); hapticThump(); }
            else if (name === 'hit') {
              playWrong();
              hapticWrong();
            }
          },
        },
      );

      if (destroyed) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
      engine.setPaused(false); // fly immediately
      startMusic();
      setReady(true);
    })();

    return () => {
      destroyed = true;
      stopMusic();
      if (pickupTimerRef.current) window.clearTimeout(pickupTimerRef.current);
      if (canyonTimerRef.current) window.clearTimeout(canyonTimerRef.current);
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      createdRef.current = false;
    };
    // Mount once; sceneProps captured at mount (parent remounts via key to reset).
  }, []);

  // Keep the WebGL canvas sized correctly across fullscreen toggles.
  useEffect(() => {
    const t = window.setTimeout(() => engineRef.current?.resize(), 120);
    return () => window.clearTimeout(t);
  }, [isFullscreen]);

  // ---- Steering: floating thumbstick (touch) + WASD/arrows (keyboard) ----
  const steer = useCallback((v: { x: number; y: number } | null) => {
    engineRef.current?.setMove(v);
  }, []);
  const heldKeysRef = useRef<Set<Dir>>(new Set());
  const steerFromKeys = useCallback(() => {
    const k = heldKeysRef.current;
    const x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    const y = (k.has('up') ? 1 : 0) - (k.has('down') ? 1 : 0);
    steer(x === 0 && y === 0 ? null : { x, y });
  }, [steer]);

  // ---- Blaster: hold to fire forward (FIRE button + Space). ----
  const setFiring = useCallback((on: boolean) => {
    if (on) hapticTap();
    engineRef.current?.setFiring(on);
  }, []);

  // ---- Challenge resolution ----
  // ChallengeInput owns the keypad/choice UI and the correctness check; we just
  // route the outcome to the engine's reload.
  const finishReload = useCallback(
    (correct: boolean) => {
      setChallenge(null);
      setPhase('playing');
      engineRef.current?.reload(correct);
      engineRef.current?.setPaused(false);

      if (correct) {
        correctReloadsRef.current += 1;
        playReload();
        playCorrect();
        hapticThump();
      } else {
        wrongReloadsRef.current += 1;
        setFlashWrong(true);
        setTimeout(() => setFlashWrong(false), 350);
        playWrong();
        hapticWrong();
      }
    },
    [],
  );

  const onAnswer = useCallback(
    (correct: boolean) => finishReload(correct),
    [finishReload],
  );

  // ---- Keyboard: WASD/arrows while flying (the reload gate's keypad is owned
  //      by ChallengeInput). ----
  useEffect(() => {
    if (phase === 'playing') {
      const dirOf = (k: string): Dir | null => {
        switch (k) {
          case 'ArrowUp': case 'w': case 'W': return 'up';
          case 'ArrowDown': case 's': case 'S': return 'down';
          case 'ArrowLeft': case 'a': case 'A': return 'left';
          case 'ArrowRight': case 'd': case 'D': return 'right';
          default: return null;
        }
      };
      const down = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) setFiring(true); return; }
        const dir = dirOf(e.key);
        if (dir) { e.preventDefault(); if (!heldKeysRef.current.has(dir)) { heldKeysRef.current.add(dir); steerFromKeys(); } }
      };
      const up = (e: KeyboardEvent) => {
        if (e.key === ' ' || e.code === 'Space') { setFiring(false); return; }
        const dir = dirOf(e.key);
        if (dir) { heldKeysRef.current.delete(dir); steerFromKeys(); }
      };
      window.addEventListener('keydown', down);
      window.addEventListener('keyup', up);
      return () => {
        window.removeEventListener('keydown', down);
        window.removeEventListener('keyup', up);
      };
    }
    return undefined;
  }, [phase, steerFromKeys, setFiring]);

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
      .catch((err) => console.warn('[frosting-fighter-3d] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-[#241433] select-none'
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

      {/* Flight canvas with overlaid HUD + D-pad. */}
      <div
        className={
          isFullscreen
            ? 'relative w-full flex-1 overflow-hidden bg-[#241433]'
            : 'relative mt-3 aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl bg-[#241433] shadow-xl'
        }
        aria-label={`${props.title} game area`}
      >
        <div ref={containerRef} className="absolute inset-0" style={{ touchAction: 'none' }} />

        {/* Branded loading state — Cakey while the WebGL engine spins up. */}
        {!ready ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#241433]/85">
            <GamecakesMascot mood="happy" size={104} className="drop-shadow-lg" />
            <p className="font-display text-base font-semibold text-white/90">
              Fueling the Frosting Fighter…
            </p>
          </div>
        ) : null}

        {/* HUD badges */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            ⏱ {formatClock(timeLeftMs)}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🧁 {score}
          </span>
          <span className="rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow" aria-label={`${ammo} lasers left`}>
            <span aria-hidden>🔫 </span>
            <span style={{ color: blasterLevel > 0 ? BLASTER_LEVELS[blasterLevel].css : undefined }}>
              {'●'.repeat(ammo)}{'○'.repeat(Math.max(0, AMMO_CLIP - ammo))}
            </span>
          </span>
        </div>

        {/* Blaster upgrade badge — colored to match the bolt. */}
        {blasterLevel > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center">
            <span
              className="rounded-full px-3 py-1 text-xs font-bold text-white shadow"
              style={{ background: BLASTER_LEVELS[blasterLevel].css }}
            >
              🔆 Blaster Lv {blasterLevel + 1}
            </span>
          </div>
        ) : null}

        {/* Power-up pickup toast — flashes what you grabbed. */}
        {pickup ? (
          <div
            key={pickup.key}
            className="pointer-events-none absolute inset-x-0 top-24 flex justify-center"
            style={{ animation: 'pickup-pop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            <span
              className="rounded-full px-4 py-1.5 text-sm font-extrabold text-white shadow-lg"
              style={{ background: PICKUP_META[pickup.kind].bg }}
            >
              {PICKUP_META[pickup.kind].label}
            </span>
          </div>
        ) : null}
        <style>{`@keyframes pickup-pop{0%{transform:translateY(-8px) scale(0.6);opacity:0;}60%{transform:translateY(0) scale(1.12);opacity:1;}100%{transform:translateY(0) scale(1);opacity:1;}}`}</style>

        {/* Persistent canyon badge while the low zone is active. */}
        {canyon ? (
          <div className="pointer-events-none absolute left-3 top-14">
            <span className="rounded-full bg-fuchsia-900/70 px-3 py-1 text-xs font-bold text-white shadow">
              🏔️ Canyon — fly low
            </span>
          </div>
        ) : null}

        {/* One-shot canyon warning banner when the zone opens. */}
        {canyonBanner ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center"
            style={{ animation: 'pickup-pop 0.45s cubic-bezier(0.34,1.56,0.64,1)' }}
          >
            <span
              className="rounded-2xl px-6 py-3 text-xl font-extrabold text-white shadow-xl"
              style={{ background: 'linear-gradient(to right, #a21caf, #db2777)' }}
            >
              🏔️ CANYON! Fly LOW! 🏔️
            </span>
          </div>
        ) : null}

        {phase === 'playing' ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 bottom-32 flex justify-center">
              <span className="rounded-full bg-black/35 px-4 py-1.5 text-sm font-medium text-white shadow">
                Drag to fly · FIRE to blast · grab 💎 speed / 💣 bombs / 🔆 blasters · watch for red chasers!
              </span>
            </div>
            {/* Floating thumbstick (bottom-left), plus keyboard WASD/arrows. */}
            <Thumbstick onSteer={steer} />
            {/* Blaster (bottom-right) — hold to fire forward; also Space. */}
            <button
              type="button"
              aria-label="Fire blaster"
              onPointerDown={(e) => { e.preventDefault(); setFiring(true); }}
              onPointerUp={() => setFiring(false)}
              onPointerLeave={() => setFiring(false)}
              onPointerCancel={() => setFiring(false)}
              // The fire control is an `act` surface like any other — it just
              // happens to be a big thumb-sized circle. Reads the role tokens so
              // there is exactly one rose in the app, not two.
              className="candy-shell absolute bottom-6 right-5 z-30 flex h-28 w-28 items-center justify-center rounded-full text-5xl transition-transform duration-100 ease-out active:scale-95"
              style={{
                touchAction: 'none',
                '--c-from': 'var(--act-from)',
                '--c-to': 'var(--act-to)',
                '--c-ink': 'var(--act-ink)',
                '--c-glow': 'var(--act-glow)',
              } as React.CSSProperties}
            >
              💥
            </button>
          </>
        ) : null}
      </div>

      {isFullscreen ? null : (
        <div className="mt-4 flex gap-3">
          <ChromeNavLink href={backHref} variant="dark" size="md">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
        </div>
      )}

      {/* ---- Reload modal (numeric keypad) ---- */}
      {phase === 'challenge' && challenge ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Reload: ${challenge.challenge.prompt}`}
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
            style={{ background: 'linear-gradient(135deg, #3a2456 0%, #7c3aed 45%, #fb7185 100%)' }}
          >
            <div
              className="text-8xl drop-shadow-lg"
              aria-hidden
              style={{ animation: 'win-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
            >
              {sessionSummary.efficiency >= 0.8 ? '🚀' : sessionSummary.efficiency >= 0.5 ? '🧁' : '✨'}
            </div>
            <div className="font-display text-4xl font-bold text-white">
              {sessionSummary.efficiency >= 0.8
                ? 'Ace pilot!'
                : sessionSummary.efficiency >= 0.5
                  ? 'Sweet flying!'
                  : 'Nice run!'}
            </div>
            <div className="text-base font-medium text-white/90">
              <span className="font-mono font-bold">{sessionSummary.taps_total}</span> reloads solved
              {' · '}
              <span className="font-mono">{Math.round(sessionSummary.efficiency * 100)}%</span>
            </div>

            {sessionSummary.meta_lines && sessionSummary.meta_lines.length > 0 ? (
              <div className="flex flex-col items-center gap-1 text-sm text-white/90">
                {sessionSummary.meta_lines.map((line, i) => (
                  <div key={i} className="font-medium">{line}</div>
                ))}
              </div>
            ) : null}

            {attemptPosting ? (
              <div className="text-sm text-white/80">Saving your run…</div>
            ) : attemptResponse ? (
              <div className="flex flex-col items-center gap-2">
                {attemptResponse.tieredUp ? (
                  <div className="font-display rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950 shadow-md">
                    ⭐ Level up! Tier {attemptResponse.currentTier}
                  </div>
                ) : (
                  <div className="text-xs text-white/80">
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
                Fly again!
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

// ---- Floating thumbstick. Touch the pad and drag your thumb to steer
// (analog). The knob follows under capture, then recenters + stops on release
// so the ship never "sticks" — this is the "circle joypad" kids asked for. ----
function Thumbstick({ onSteer }: { onSteer: (v: { x: number; y: number } | null) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(false);
  const [knob, setKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const RADIUS = 62; // px the knob (and thumb) can travel from center

  const update = (clientX: number, clientY: number): void => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > RADIUS) { dx = (dx / dist) * RADIUS; dy = (dy / dist) * RADIUS; }
    setKnob({ x: dx, y: dy });
    // Screen y grows downward; ship "up" is +y, so invert dy.
    onSteer({ x: dx / RADIUS, y: -dy / RADIUS });
  };
  const end = (): void => {
    activeRef.current = false;
    setKnob({ x: 0, y: 0 });
    onSteer(null);
  };

  return (
    <div
      ref={baseRef}
      aria-label="Steering joystick"
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        activeRef.current = true;
        hapticTap();
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => { if (activeRef.current) update(e.clientX, e.clientY); }}
      onPointerUp={end}
      onPointerCancel={end}
      className="absolute bottom-5 left-5 z-30 flex h-44 w-44 items-center justify-center rounded-full border-2 border-white/25 bg-black/30"
      style={{ touchAction: 'none' }}
    >
      <div
        className="h-20 w-20 rounded-full border border-white/50 bg-rose-400/90 shadow-lg transition-transform duration-75"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}

