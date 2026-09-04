'use client';

// Cakey Checkers shell — GameLauncher → StyleSidePicker → board → game-over.
//
// One screen more than Chess Challenge, because picking your pieces is the thing
// George asked for and it does not belong buried in a settings menu. Everything
// else follows the chess-challenge shape: the game is pure React + a canvas, so
// this shell owns the phase machine and POSTs the SessionSummary itself.
//
// showDuration={false} — no clock, for exactly the reason Chess Challenge has
// none. A board game is not a three-minute rush, and a clock that hands a kid a
// loss on time is punishing and off-brand.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import GameLauncher, { type LaunchSettings } from '@/components/games/shared/GameLauncher';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { playLevelUp } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { SprinkleDecor } from '@/components/ui/SprinkleDecor';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import type { SessionSummary } from '@/lib/games/phaser/session';
import CakeyCheckersGame from '@/components/games/checkers/CakeyCheckersGame';
import StyleSidePicker from '@/components/games/checkers/StyleSidePicker';
import { OpponentFace } from '@/components/games/opponents/OpponentBadge';
import { opponentForLevel } from '@/lib/games/checkers/opponents';
import { getCheckersPrefs, setCheckersPrefs, type CheckersPrefs } from '@/lib/games/checkers/prefs';

type Phase = 'playing' | 'gameover';

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

export default function CakeyCheckersShell({
  kidName,
  currentTier,
  skillSubject,
  skillSlug,
}: {
  kidName?: string;
  currentTier: number;
  skillSubject: 'math' | 'reading' | 'logic';
  skillSlug: string;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [prefs, setPrefs] = useState<CheckersPrefs | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptError, setAttemptError] = useState(false);
  const [roundId, setRoundId] = useState(0);
  const postedRef = useRef(false);
  // Lazy initialiser, not an effect. getCheckersPrefs already returns
  // DEFAULT_PREFS when there is no window, and `saved` is only ever read by the
  // picker — which cannot appear until the kid has chosen an opponent, so it
  // never renders on the server and there is no hydration mismatch to cause.
  const [saved, setSaved] = useState<CheckersPrefs>(getCheckersPrefs);

  const attemptPosting = phase === 'gameover' && summary !== null && !attemptResponse && !attemptError;

  const isFullscreen = useIsFullscreen();
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const handleComplete = useCallback((s: SessionSummary) => {
    setSummary(s);
    setPhase('gameover');
  }, []);

  useEffect(() => {
    if (phase !== 'gameover' || !summary || !settings || postedRef.current) return;
    postedRef.current = true;
    fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: skillSubject,
        skillSlug,
        tier: settings.level,
        gameSlug: 'cakey-checkers',
        summary,
        // Undefined — the game is untimed. computeSessionDrip has a default.
        durationMin: settings.duration,
      }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return (await r.json()) as AttemptResponse;
      })
      .then((data) => {
        setAttemptResponse(data);
        if (data.guest && data.tokensEarned) addGuestCoins(data.tokensEarned);
        if (data.tieredUp) window.setTimeout(() => playLevelUp(), 350);
      })
      .catch((err) => {
        console.warn('[cakey-checkers] POST /api/attempts failed:', err);
        setAttemptError(true);
      });
  }, [phase, summary, settings, skillSubject, skillSlug]);

  const resetForNewRound = useCallback(() => {
    setSummary(null);
    setAttemptResponse(null);
    setAttemptError(false);
    postedRef.current = false;
    setPhase('playing');
    setRoundId((r) => r + 1);
  }, []);

  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Cakey Checkers"
        gameGlyph="🔴"
        gameDescription="Play a whole game of checkers against a Cakey. Pick who you take on!"
        currentTier={currentTier}
        onStart={setSettings}
        accentBg="bg-amber-50 dark:bg-stone-900"
        kidName={kidName}
        subject="logic"
        difficultyNoun="opponents"
        backHref="/town"
        hideTypePicker
        showDuration={false}
        levelPreview={(level) => {
          const o = opponentForLevel(level);
          return (
            <div className="flex flex-col items-center gap-1 text-center">
              <OpponentFace avatar={o.avatar} size={64} />
              <div className="text-sm font-bold text-stone-700 dark:text-stone-200">
                {o.name} · {o.belt}
              </div>
              <div className="text-xs text-stone-600 dark:text-stone-300">{o.blurb}</div>
            </div>
          );
        }}
      />
    );
  }

  if (!prefs) {
    return (
      <main
        className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-4"
        style={{ background: 'linear-gradient(160deg, #fff7ed 0%, #fef3c7 48%, #fde8bd 100%)' }}
      >
        <SprinkleDecor density="scatter" style={{ zIndex: 0 }} />
        <div className="relative z-10 w-full max-w-lg rounded-[2rem] border-4 border-white/80 bg-white/85 shadow-[0_12px_45px_rgba(180,140,80,0.25)] backdrop-blur-sm">
          <StyleSidePicker
            initial={saved}
            onBack={() => setSettings(null)}
            onStart={(p) => {
              setCheckersPrefs(p);
              setSaved(p);
              setPrefs(p);
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main
      className={
        isFullscreen
          ? 'relative flex h-screen flex-col items-stretch overflow-hidden overscroll-none select-none'
          : 'relative flex flex-1 flex-col items-center overflow-hidden overscroll-none p-4 select-none sm:p-6'
      }
      style={{ background: 'linear-gradient(160deg, #fff7ed 0%, #fef3c7 48%, #dcfce7 100%)' }}
    >
      <SprinkleDecor density="scatter" style={{ zIndex: 0 }} />

      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 select-none overflow-hidden">
        <span className="absolute left-[4%] top-[12%] text-6xl opacity-[0.08] sm:text-7xl">🍪</span>
        <span className="absolute right-[5%] top-[18%] text-5xl opacity-[0.08] sm:text-6xl">🧁</span>
        <span className="absolute bottom-[10%] left-[8%] text-5xl opacity-[0.08] sm:text-6xl">👑</span>
        <span className="absolute bottom-[14%] right-[6%] text-6xl opacity-[0.08] sm:text-7xl">🎂</span>
      </div>

      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
          <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
        </div>
      ) : (
        <header className="relative z-10 flex w-full max-w-lg items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-600">Cakey Checkers</div>
              <h1 className="text-2xl font-bold text-stone-800">
                {kidName ? `${kidName}'s Chess Island` : 'Chess Island'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug="cakey-checkers" kidName={kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
            <ChromeNavLink href={backHref} variant="dark" size="sm">✕ Exit</ChromeNavLink>
          </div>
        </header>
      )}

      <div className="relative z-10 mt-4 flex w-full flex-1 items-center justify-center">
        {/* The board is SQUARE, so in fullscreen the limiting dimension is height,
            not width — capping at 560px there left it the same size as windowed,
            marooned in the middle of a big empty screen, which is the whole
            reason fullscreen felt broken.
            Windowed keeps the 560px cap so the card still sits in a page.
            Fullscreen sizes to whichever runs out first: 96% of the width, or the
            height left after the badge, camera row, padding and card border
            (~200px). dvh rather than vh so a tablet's collapsing browser chrome
            doesn't push the bottom controls off-screen. */}
        <div
          className={`w-full rounded-[2rem] border-4 border-white/80 bg-white/80 p-3 shadow-[0_12px_45px_rgba(180,140,80,0.28)] backdrop-blur-sm sm:p-4 ${
            isFullscreen ? '' : 'max-w-[560px]'
          }`}
          style={isFullscreen ? { maxWidth: 'min(96vw, calc(100dvh - 200px))' } : undefined}
        >
          <CakeyCheckersGame
            key={`${settings.level}-${prefs.styleId}-${prefs.side}-${roundId}`}
            level={settings.level}
            styleId={prefs.styleId}
            kidSide={prefs.side}
            onComplete={handleComplete}
          />
        </div>
      </div>

      {!isFullscreen ? (
        <div className="relative z-10 mt-6 flex gap-3">
          <Link
            href={backHref}
            className="rounded-full border border-amber-300 bg-white/80 px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-white active:scale-95"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {backOverride?.label ?? '← Back to Map'}
          </Link>
        </div>
      ) : null}

      {phase === 'gameover' && summary ? (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fde68a, #fef3c7, #bbf7d0)' }}
          >
            {/* The RESULT leads, not the efficiency score — beating a Cakey is
                what the kid came for. meta_lines[0] carries it. */}
            <div className="text-7xl animate-bounce" aria-hidden>
              {summary.meta_lines?.[0]?.includes('You beat') ? '🏆' : '🍪'}
            </div>
            <div className="text-2xl font-bold text-zinc-900">{summary.meta_lines?.[0] ?? 'Good game!'}</div>
            {summary.meta_lines?.[1] ? (
              <div className="text-sm font-semibold text-amber-800">
                {summary.meta_lines[1]}
                {' · '}
                <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>
              </div>
            ) : null}
            {summary.meta_lines?.[2] ? (
              <div className="text-sm font-semibold text-amber-700">{summary.meta_lines[2]}</div>
            ) : null}

            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving progress…</div>
            ) : attemptResponse ? (
              attemptResponse.tieredUp ? (
                <div className="rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950">
                  ⭐ Level up! Now on level {attemptResponse.currentTier}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">
                  Level {attemptResponse.currentTier} · mastery {Math.round(attemptResponse.masteryPct * 100)}%
                </div>
              )
            ) : null}

            {attemptResponse?.tokensEarned && attemptResponse.tokensEarned > 0 ? (
              <div
                className={`flex items-center gap-2 rounded-full border-2 px-5 py-2.5 font-bold shadow-md ${
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

            <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={resetForNewRound}
                className="rounded-full px-6 py-4 text-lg font-semibold text-white shadow-md active:scale-95"
                style={{ background: 'linear-gradient(to right, #fbbf24, #b45309)', minHeight: 'var(--min-tap-target)' }}
              >
                Play Again
              </button>
              <ChromeNavButton onClick={() => setPrefs(null)} variant="dark" size="md">
                Change pieces
              </ChromeNavButton>
              <ChromeNavButton onClick={() => setSettings(null)} variant="dark" size="md">
                Change opponent
              </ChromeNavButton>
              <ChromeNavLink href={backHref} variant="dark" size="lg">
                {backOverride?.label ?? '← Back to Map'}
              </ChromeNavLink>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
