'use client';

// Marble Math Maze shell — three-phase state machine:
//
//   idle → calibrating → playing
//
// idle:        GameLauncher is showing. Kid hasn't tapped Play yet.
// calibrating: Permission requested, calibration UI is up. Kid sees a
//              live mini-marble responding to their tilt; when they hit
//              "Start", the current raw gamma/beta are snapshotted as the
//              baseline and we transition to playing. If permission is
//              denied (or platform doesn't support orientation events),
//              we skip calibrating entirely.
// playing:     MarbleMaze3DHost (Three.js + cannon-es) is mounted with the
//              captured baselines (or null + tiltEnabled=false for drag mode).
//
// Rotation lock: handled here at the shell level, not in calibration or
// the scene. We try `screen.orientation.lock('landscape')` once when
// entering calibrating/playing, and again on every `fullscreenchange`
// (since the lock only succeeds in fullscreen on most browsers, and
// GameLauncher's Play handler is what triggers fullscreen). iOS Safari
// (non-PWA) has no `lock` method at all — we detect that case and
// surface "rotate your iPad" UI in the calibration screen instead of
// failing silently. Lock is released on unmount so leaving the marble
// game doesn't strand the rest of the app in landscape.

import { useCallback, useEffect, useState } from 'react';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import MarbleMaze3DHost from '@/components/games/three/MarbleMaze3DHost';
import MarbleMazeCalibration, {
  type CalibrationResult,
  type RotationLockStatus,
} from './MarbleMazeCalibration';
import { verbalSkillFor, mathSkillFor } from '@/lib/games/shared/challenge-mode';
import type { KidFocus } from '@/lib/games/shared/recommend';
import type { ClassWordList } from '@/lib/games/shared/focus-words';

type Phase = 'idle' | 'requesting' | 'calibrating' | 'playing';

type TiltPermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait' | 'any') => Promise<void>;
};

async function requestTiltPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  // iOS / iPadOS ≥13: gated behind a user gesture. The Play tap is that
  // gesture, so this must run in the synchronous handler chain — no
  // intermediate awaits before this call.
  const anyDoe = DeviceOrientationEvent as unknown as {
    requestPermission?: TiltPermissionFn;
  };
  if (typeof anyDoe.requestPermission === 'function') {
    try {
      const result = await anyDoe.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }
  // Android / desktop with orientation support: events fire without prompt.
  return true;
}

function readIsLandscape(): boolean {
  if (typeof window === 'undefined') return true;
  // matchMedia is the most reliable cross-browser orientation read —
  // screen.orientation.type is missing/lying on a couple iOS versions.
  return window.matchMedia('(orientation: landscape)').matches;
}

export default function MarbleMazeShell({
  kidName,
  kidGrade,
  kidFocus,
  kidClassLists,
  currentTier,
  highestTier,
  skillSubject,
  skillSlug,
  verbalCurrentTier,
  verbalHighestTier,
}: {
  kidName?: string;
  kidGrade?: number | null;
  kidFocus?: KidFocus | null;
  kidClassLists?: ClassWordList[];
  currentTier: number;
  highestTier?: number;
  skillSubject: 'math' | 'reading';
  skillSlug: string;
  verbalCurrentTier: number;
  verbalHighestTier: number;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [runId, setRunId] = useState(0);
  const [tiltPermitted, setTiltPermitted] = useState(false);
  const [baselineGamma, setBaselineGamma] = useState<number | null>(null);
  const [baselineBeta, setBaselineBeta] = useState<number | null>(null);
  // Lazy initial: detect lock-API support synchronously at mount so the
  // effect below doesn't have to setState('unsupported') on first run
  // (lint rule react-hooks/set-state-in-effect). iOS Safari exposes
  // `screen.orientation` but not `.lock` — that's the case we want to
  // catch here without waiting for the effect to fire.
  const [rotationLockStatus, setRotationLockStatus] =
    useState<RotationLockStatus>(() => {
      if (typeof window === 'undefined' || !screen.orientation) return 'unknown';
      const lockFn = (screen.orientation as LockableOrientation).lock;
      return typeof lockFn === 'function' ? 'unknown' : 'unsupported';
    });
  const [isLandscape, setIsLandscape] = useState(readIsLandscape);

  const handleStart = useCallback(async (s: LaunchSettings) => {
    setPhase('requesting');
    const granted = await requestTiltPermission();
    setSettings(s);
    setTiltPermitted(granted);
    // No tilt → no point in calibration, jump straight to drag-mode play.
    setPhase(granted ? 'calibrating' : 'playing');
  }, []);

  const handleCalibrationComplete = useCallback((result: CalibrationResult) => {
    if (result.mode === 'tilt') {
      setBaselineGamma(result.baselineGamma);
      setBaselineBeta(result.baselineBeta);
    } else {
      // Kid chose drag fallback — turn tilt off in the scene even if
      // permission was technically granted.
      setTiltPermitted(false);
      setBaselineGamma(null);
      setBaselineBeta(null);
    }
    setPhase('playing');
  }, []);

  // Rotation lock — runs while calibrating or playing. Fires the lock
  // immediately and again on every fullscreenchange (lock generally only
  // succeeds while fullscreen; GameLauncher's Play handler drives the
  // fullscreen transition, which may resolve after we've mounted here).
  useEffect(() => {
    if (phase !== 'calibrating' && phase !== 'playing') return;
    if (typeof window === 'undefined' || !screen.orientation) return;

    const orientation = screen.orientation as LockableOrientation;
    const lockFn = orientation.lock?.bind(orientation);

    // 'unsupported' was already detected at mount via lazy initial state;
    // bail without touching state to avoid the cascading-render lint.
    if (!lockFn) return;

    let cancelled = false;
    let locked = false;
    const tryLock = (): void => {
      if (cancelled || locked) return;
      lockFn('landscape')
        .then(() => {
          if (cancelled) return;
          locked = true;
          setRotationLockStatus('locked');
        })
        .catch(() => {
          // Most common failure: not in fullscreen yet. We'll retry on
          // the next fullscreenchange. Only mark 'failed' once we've
          // seen at least one fullscreen activation and still couldn't
          // lock — otherwise the UI would flash a false-negative.
          if (cancelled) return;
          if (document.fullscreenElement) {
            setRotationLockStatus('failed');
          }
        });
    };

    tryLock();
    document.addEventListener('fullscreenchange', tryLock);

    return () => {
      cancelled = true;
      document.removeEventListener('fullscreenchange', tryLock);
      try {
        orientation.unlock?.();
      } catch {
        /* fine */
      }
    };
  }, [phase]);

  // Track current orientation so calibration can show a "rotate your iPad"
  // nudge when the device is portrait. matchMedia is the reliable signal;
  // orientationchange fires too early on iOS (before the layout settles).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(orientation: landscape)');
    const onChange = (): void => setIsLandscape(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (phase === 'idle' || phase === 'requesting') {
    return (
      <>
        <GameLauncher
          gameTitle="Marble Math"
          gameGlyph="🎱"
          gameDescription="Tilt your iPad to roll the marble through math gates"
          currentTier={currentTier}
          highestTier={highestTier}
          onStart={handleStart}
          kidGrade={kidGrade}
        kidFocus={kidFocus}
        kidClassLists={kidClassLists}
          accentBg="bg-amber-50 dark:bg-amber-950"
          kidName={kidName}
          showVerbalMode
          verbalCurrentTier={verbalCurrentTier}
          verbalHighestTier={verbalHighestTier}
        />
        {phase === 'requesting' ? (
          <div className="fixed inset-x-0 bottom-6 flex justify-center">
            <div className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
              Setting up tilt…
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (phase === 'calibrating') {
    return (
      <MarbleMazeCalibration
        rotationLockStatus={rotationLockStatus}
        isLandscape={isLandscape}
        onComplete={handleCalibrationComplete}
      />
    );
  }

  // phase === 'playing'
  if (!settings) return null;

  const verbal = settings.mode === 'verbal';
  const verbalType = settings.readingType ?? 'synonyms';
  const verbalSkill = verbal ? verbalSkillFor(verbalType, kidGrade ?? null, verbalCurrentTier) : null;
  // The math skill is derived per-round from what the kid actually chose,
  // not from the page's static SKILL_SLUG. That constant is still the
  // launcher's tier lookup (the ★ marker); it is no longer what gets
  // credited. See mathSkillFor() for why.
  const mathSkill = mathSkillFor(settings.mathType ?? 'mixed', settings.level);

  return (
    <MarbleMaze3DHost
      key={runId}
      title="Marble Math"
      subtitle={kidName ? `${kidName}'s Roll` : 'Tilt to Roll'}
      kidName={kidName}
      gameSlug="marble-maze"
      sceneProps={{
        tier: settings.level,
        challengeMode: verbal ? verbalType : 'math',
        mathType: settings.mathType,
        tiltEnabled: tiltPermitted,
        tiltBaselineGamma: baselineGamma,
        tiltBaselineBeta: baselineBeta,
      }}
      attemptMeta={{
        subject: verbalSkill ? verbalSkill.subject : skillSubject,
        skillSlug: verbalSkill ? verbalSkill.slug : mathSkill.slug,
        tier: settings.level,
        gameSlug: 'marble-maze',
      }}
      // Play-again rebuilds the engine (fresh maze + marble) without
      // re-running calibration — the tilt baselines are kept.
      onPlayAgain={() => setRunId((r) => r + 1)}
    />
  );
}
