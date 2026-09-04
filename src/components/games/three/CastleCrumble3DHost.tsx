'use client';

// CastleCrumble3DHost — React wrapper for the Castle Crumble three.js + cannon-es
// game. A candy-CANNON demolition puzzle:
//
//   pose a math challenge → on correct load a cannonball → tap to set the barrel
//   angle → tap to lock the power → the cannon fires → on resolve, if ammo
//   remains re-pose; WIN the instant the castle crumbles, LOSE once the ammo runs
//   out with it still standing.
//
// It reuses the catalog's shared primitives — the challenge contract,
// buildSessionSummary, the sounds/haptics, and the same modal + game-over markup.
// What makes it its OWN game (not Sandcastle Siege): the input is a tap-timed
// cannon (no pointer-drag), the HUD carries an ammo counter + a live power meter,
// and the end overlay is win/lose aware.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  resolveCastleTuning,
  weaponsForTier,
  starsForRun,
  type CastleSceneProps,
  type WeaponId,
} from '@/lib/games/three/castle/types';
import { resolveCastleTheme } from '@/lib/games/three/castle/theme';
import { getSessionDuration } from '@/lib/games/session-duration';
import type { CastleEngine } from '@/lib/games/three/castle/engine';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface CastleCrumbleHostProps {
  title: string;
  subtitle?: string;
  kidName?: string;
  gameSlug: string;
  sceneProps: CastleSceneProps;
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

// 'ready'   = cannon empty, the kid watches the cakes settle and taps Load when
//             they want the next ball (which poses the math question).
// 'playing' = a ball is loaded — the kid is timing the two-tap aim, or the shot
//             is in flight. `aimStage` tracks which tap is next.
type Phase = 'ready' | 'playing' | 'challenge' | 'gameover';
type AimStage = 'power' | null;

const REASON_FIRST = '🟣 Solve to load the cannon!';
const REASON_RETRY = 'Oops — try again!';

// Thumb joystick for aiming the cannon: drag to set left/right (azimuth) +
// up/down (elevation). Sticky — the aim holds where you release it.
const JOY_TRAVEL = 46; // px the thumb travels from centre
function AimJoystick({ onAim }: { onAim: (dx: number, dy: number) => void }) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [thumb, setThumb] = useState({ x: 0, y: 0 }); // -1..1

  const update = (clientX: number, clientY: number): void => {
    const el = baseRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = (clientX - (r.left + r.width / 2)) / JOY_TRAVEL;
    let dy = (clientY - (r.top + r.height / 2)) / JOY_TRAVEL;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    setThumb({ x: dx, y: dy });
    onAim(dx, -dy); // invert Y: drag up = +dy = higher lob
  };

  return (
    <div className="pointer-events-none absolute bottom-8 left-5 flex flex-col items-center gap-1">
      <span className="rounded-full bg-zinc-900/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/90">Aim</span>
      <div
        ref={baseRef}
        onPointerDown={(e) => {
          draggingRef.current = true;
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) update(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        className="pointer-events-auto relative h-28 w-28 touch-none rounded-full bg-zinc-900/50 ring-2 ring-white/40 backdrop-blur-sm"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full bg-white/90 shadow-lg"
          style={{ transform: `translate(calc(-50% + ${thumb.x * JOY_TRAVEL}px), calc(-50% + ${thumb.y * JOY_TRAVEL}px))` }}
        />
      </div>
    </div>
  );
}

export default function CastleCrumble3DHost(props: CastleCrumbleHostProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CastleEngine | null>(null);
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
  const [ammoLeft, setAmmoLeft] = useState<number | null>(null);
  const [flattenedCount, setFlattenedCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [won, setWon] = useState(false);
  const [stars, setStars] = useState(0);

  // Weapon arsenal unlocked at this tier + the kid's current pick. The pick is
  // mirrored to a ref so the (stable) finishChallenge callback arms the latest.
  const weapons = useMemo(() => weaponsForTier(props.sceneProps.tier), [props.sceneProps.tier]);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponId>('cannonball');
  const weaponRef = useRef<WeaponId>('cannonball');
  weaponRef.current = selectedWeapon;

  // Two-tap cannon aim. `aimStage` drives the on-screen button + hint; the power
  // meter fill is written imperatively (via powerBarRef) each frame to avoid a
  // per-frame React re-render. aimStageRef lets the (per-frame) engine callback
  // detect a stage change without reading state.
  const [aimStage, setAimStage] = useState<AimStage>(null);
  const aimStageRef = useRef<AimStage>(null);
  const powerBarRef = useRef<HTMLDivElement | null>(null);

  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptPosting, setAttemptPosting] = useState(false);
  const postedRef = useRef(false);

  // Counters live in refs so the engine's stable callbacks read fresh values.
  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const sessionStartRef = useRef(0);
  // Latest ammo, mirrored to a ref so the Launch handler can guard without
  // re-subscribing the engine callbacks.
  const ammoRef = useRef(0);

  // ---- Round flow (refs so engine callbacks always hit the latest fn) ----
  const poseChallenge = useCallback(
    (reason: string) => {
      if (ammoRef.current <= 0) return; // out of ammo — nothing to load
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

  const endRound = useCallback((didWin: boolean) => {
    const stats = engineRef.current?.getStats();
    const flattened = stats?.flattened ?? 0;
    const tot = stats?.total ?? 0;
    const usedShots = stats?.shots ?? 0;
    const parShots = stats?.par ?? 0;
    const pct = tot > 0 ? Math.round((flattened / tot) * 100) : 0;
    // 3-star efficiency: fewer shots than par = more stars (see starsForRun).
    const runStars = starsForRun(didWin, usedShots, parShots);
    const summary = buildSessionSummary({
      score: correctRef.current,
      wrongAnswers: wrongRef.current,
      sessionStart: sessionStartRef.current,
      completed: didWin,
      optimalTaps: correctRef.current,
      metaLines: [
        didWin ? '🏰 Castle crumbled!' : '🟣 Out of cannonballs!',
        `🧱 ${pct}% crumbled`,
        `🟣 ${usedShots} cannonballs fired`,
        ...(didWin ? [`⭐ ${runStars}/3 stars`] : []),
      ],
    });
    setWon(didWin);
    setStars(runStars);
    setSessionSummary(summary);
    setPhase('gameover');
    if (didWin) {
      playWin();
      // A flawless, efficient crumble earns an extra fanfare.
      if (runStars === 3) window.setTimeout(() => playLevelUp(), 500);
    } else {
      playTimeUp();
    }
  }, []);

  const poseRef = useRef(poseChallenge);
  const endRef = useRef(endRound);
  poseRef.current = poseChallenge;
  endRef.current = endRound;

  // ---- iPad touch-lock (verbatim from SandcastleGameHost) ----
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
        import('@/lib/games/three/castle/engine'),
      ]);
      if (destroyed || !containerRef.current) return;

      sessionStartRef.current = Date.now();
      const tuning = resolveCastleTuning(props.sceneProps.difficulty ?? 'medium', props.sceneProps.tier);
      const theme = resolveCastleTheme(props.sceneProps.tier);

      const engine = mod.createCastleEngine(THREE, CANNON, containerRef.current, tuning, theme, {
        onAmmoLeft: (left) => {
          ammoRef.current = left;
          setAmmoLeft(left);
        },
        onStructureFlattened: (flattened, tot) => {
          setFlattenedCount(flattened);
          setTotal(tot);
          playBubble();
          hapticThump();
        },
        // Shot done (after the watch-the-cakes-fall linger) → back to 'ready'.
        // If that was the last ball the engine also fires onRoundEnd in the same
        // tick, so React batches straight to 'gameover' (no button flash).
        onBalloonResolved: () => setPhase('ready'),
        onRoundEnd: (didWin) => endRef.current(didWin),
        // Aim feedback: swap the button/hint on a stage change, and stream the
        // power-meter fill straight to the DOM node (no per-frame setState).
        onAim: (stage, powerFrac) => {
          if (stage !== aimStageRef.current) {
            aimStageRef.current = stage;
            setAimStage(stage);
          }
          if (powerBarRef.current) {
            powerBarRef.current.style.transform = `scaleX(${powerFrac})`;
          }
        },
        onSfx: (name) => {
          if (name === 'win') {
            playWin();
          } else {
            playBubble();
            // A tactile punch for the bomb blast + crumble until a dedicated
            // boom/crumble cue lands (the audio is the known gap here).
            if (name === 'boom' || name === 'crumble') hapticThump();
          }
        },
      });

      if (destroyed) {
        engine.dispose();
        return;
      }
      engineRef.current = engine;
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
  // route the outcome: correct loads the cannon, wrong re-poses a fresh problem.
  const finishChallenge = useCallback((correct: boolean) => {
    if (correct) {
      correctRef.current += 1;
      setChallenge(null);
      setPhase('playing');
      playCorrect();
      hapticThump();
      engineRef.current?.setPaused(false);
      engineRef.current?.armProjectile(weaponRef.current);
    } else {
      wrongRef.current += 1;
      setFlashWrong(true);
      setTimeout(() => setFlashWrong(false), 350);
      playWrong();
      hapticWrong();
      // Re-pose a fresh problem; stay in the (paused) challenge phase.
      poseRef.current(REASON_RETRY);
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
      .catch((err) => console.warn('[castle-crumble-host] POST failed:', err))
      .finally(() => setAttemptPosting(false));
  }, [phase, sessionSummary, props.attemptMeta, durationMin]);

  const lowAmmo = ammoLeft !== null && ammoLeft <= 1;

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

        {/* HUD badges: cannonballs left · castle crumble progress */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3">
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow ${
              lowAmmo ? 'bg-red-500/80' : 'bg-zinc-900/80 backdrop-blur-sm'
            }`}
          >
            🟣 {ammoLeft ?? '—'}
          </span>
          <span className="rounded-full bg-zinc-900/80 backdrop-blur-sm px-3 py-1.5 text-sm font-bold tabular-nums text-white shadow">
            🏰 {flattenedCount}/{total || '—'}
          </span>
        </div>

        {/* Orbit-to-scout controls (↺/↻) + weapon picker. Hidden behind the
            challenge modal / end overlay (which are separate fixed layers). */}
        {phase === 'ready' || phase === 'playing' ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between px-2">
              <button
                type="button"
                aria-label="Rotate view left to scout the castle"
                onClick={() => {
                  engineRef.current?.orbit(-1);
                  hapticTap();
                }}
                className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-zinc-900/80 backdrop-blur-sm text-xl font-bold text-white shadow active:scale-90"
              >
                ↺
              </button>
              <button
                type="button"
                aria-label="Rotate view right to scout the castle"
                onClick={() => {
                  engineRef.current?.orbit(1);
                  hapticTap();
                }}
                className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full bg-zinc-900/80 backdrop-blur-sm text-xl font-bold text-white shadow active:scale-90"
              >
                ↻
              </button>
            </div>
            {/* Left/right + up/down aim is the thumb joystick (rendered in the
                aim gate below); the ↺/↻ above still orbit to scout. */}
            {weapons.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-0 top-14 flex justify-center gap-2">
                {weapons.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    aria-label={`Choose ${w.label}`}
                    aria-pressed={selectedWeapon === w.id}
                    onClick={() => {
                      setSelectedWeapon(w.id);
                      hapticTap();
                    }}
                    className={`pointer-events-auto rounded-full px-3 py-1.5 text-sm font-bold shadow transition active:scale-95 ${
                      selectedWeapon === w.id
                        ? 'bg-white text-zinc-900 ring-2 ring-rose-400'
                        : 'bg-zinc-900/80 backdrop-blur-sm text-white'
                    }`}
                  >
                    {w.glyph} {w.label}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        {/* Load gate — in 'ready' the scene keeps animating with an EMPTY cannon,
            so the kid can study the castle. Tapping Load poses the math question;
            solving it loads the next ball and starts the aim. */}
        {phase === 'ready' ? (
          <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-8">
            <button
              type="button"
              onClick={() => poseChallenge(REASON_FIRST)}
              className="pointer-events-auto animate-bounce rounded-full bg-pink-500 px-7 py-3.5 text-lg font-extrabold text-white shadow-xl ring-4 ring-white/60 transition active:scale-95"
            >
              🟣 Load the cannon!
            </button>
          </div>
        ) : null}

        {/* Aim gate — a ball is loaded. Drag the thumb JOYSTICK (bottom-left) to
            aim left/right + up/down; the power meter oscillates; tap FIRE (or the
            scene) to shoot at the current power. */}
        {phase === 'playing' && aimStage ? (
          <>
            <AimJoystick onAim={(dx, dy) => engineRef.current?.setAim(dx, dy)} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-8">
              <div className="w-56 max-w-[70%]">
                <div className="mb-1 text-center text-xs font-bold uppercase tracking-wider text-white drop-shadow">
                  Power — tap to fire!
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-zinc-900/50 ring-2 ring-white/60 backdrop-blur-sm">
                  <div
                    ref={powerBarRef}
                    className="h-full w-full origin-left rounded-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-red-500"
                    style={{ transform: 'scaleX(0)' }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  engineRef.current?.advanceAim();
                  hapticTap();
                }}
                className="pointer-events-auto animate-pulse rounded-full bg-pink-500 px-7 py-3.5 text-lg font-extrabold text-white shadow-xl ring-4 ring-white/60 transition active:scale-95"
              >
                🔥 FIRE!
              </button>
            </div>
          </>
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
              {won ? '🎂' : '🏰'}
            </div>
            <div className="font-display text-4xl font-bold text-zinc-900">
              {won ? 'Castle crumbled!' : 'Out of cannonballs!'}
            </div>
            {won ? (
              <div className="flex gap-1 text-4xl leading-none" aria-label={`${stars} of 3 stars`}>
                {[0, 1, 2].map((i) => (
                  <span key={i} className={i < stars ? '' : 'opacity-30 grayscale'} aria-hidden>
                    ⭐
                  </span>
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
