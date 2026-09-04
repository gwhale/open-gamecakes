'use client';

// Word Memory shell — GameLauncher → WordMemoryGame → game-over overlay.
//
// Unlike the Phaser-based games, this one renders the whole game in plain
// React/DOM. So we don't reuse PhaserGameHost; we run a small state machine
// here (launcher → playing → gameover) that mirrors the host's look and
// feel, and POST the session summary to /api/attempts on completion.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChromeNavButton, ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { resolveGameBackTarget } from '@/lib/games/back-nav';
import GameLauncher, {
  type LaunchSettings,
} from '@/components/games/shared/GameLauncher';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import SoundToggle from '@/components/SoundToggle';
import FeedbackButton from '@/components/games/shared/FeedbackButton';
import { useIsFullscreen } from '@/hooks/useIsFullscreen';
import { playLevelUp } from '@/lib/games/shared/sounds';
import { addGuestCoins } from '@/lib/tokens/guest-wallet';
import { DEFAULT_DURATION_MIN } from '@/lib/games/session-duration';
import type { SessionSummary } from '@/lib/games/phaser/session';
import WordMemoryGame from '@/components/games/word-memory/WordMemoryGame';
import WordListPreview from '@/components/games/word-memory/WordListPreview';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

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

export default function WordMemoryShell({
  kidName,
  currentTier,
  skillSubject,
  skillSlug,
}: {
  kidName?: string;
  currentTier: number;
  skillSubject: 'math' | 'reading';
  skillSlug: string;
}) {
  const [settings, setSettings] = useState<LaunchSettings | null>(null);
  const [phase, setPhase] = useState<Phase>('playing');
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [attemptResponse, setAttemptResponse] = useState<AttemptResponse | null>(null);
  const [attemptError, setAttemptError] = useState(false);
  // Round counter bumps each time we reset — used as part of the game's
  // key to force a full remount on "Play Again" without reading a ref at
  // render time (which would trip React 19's purity rule).
  const [roundId, setRoundId] = useState(0);
  const postedRef = useRef(false);

  // Derived: "Saving…" is visible whenever we've finished the round but
  // haven't yet received a response (or an error) from /api/attempts.
  const attemptPosting =
    phase === 'gameover' && summary !== null && !attemptResponse && !attemptError;

  const isFullscreen = useIsFullscreen();

  // Honor the All Games menu's `?from=games` so back returns there, not /town.
  // GameLauncher reads this itself; the in-play + game-over links below need
  // it wired explicitly since Word Memory doesn't use PhaserGameHost.
  const backOverride = resolveGameBackTarget(useSearchParams().get('from'));
  const backHref = backOverride?.href ?? '/town';

  const handleComplete = useCallback((s: SessionSummary) => {
    setSummary(s);
    setPhase('gameover');
  }, []);

  // POST summary on game-over. All setState calls live inside async
  // callbacks (not in the effect body itself), which satisfies React's
  // "don't cascade renders in effects" rule — this is the same pattern
  // PhaserGameHost uses.
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
        gameSlug: 'word-memory',
        summary,
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
        if (data.tieredUp) {
          window.setTimeout(() => playLevelUp(), 350);
        }
      })
      .catch((err) => {
        console.warn('[word-memory] POST /api/attempts failed:', err);
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

  // ---- Launcher ----
  if (!settings) {
    return (
      <GameLauncher
        gameTitle="Word Memory"
        gameGlyph="🎴"
        gameDescription="Flip the cards, find the matching sight words"
        currentTier={currentTier}
        onStart={setSettings}
        accentBg="bg-blue-100 dark:bg-blue-950"
        kidName={kidName}
        subject="reading"
        backHref="/town"
        levelPreview={(level) => <WordListPreview listId={level} />}
        hideTypePicker
        unlockAllLevels
      />
    );
  }

  // ---- Playing / game-over — shared chrome ----
  return (
    <main
      className={
        isFullscreen
          ? 'flex h-screen flex-col items-stretch overscroll-none bg-blue-950 select-none'
          : 'flex flex-1 flex-col items-center overscroll-none bg-blue-950 p-4 select-none sm:p-6'
      }
    >
      {isFullscreen ? (
        <div className="absolute right-3 top-3 z-40 flex items-center gap-2">
          <SoundToggle size="sm" />
          <FullscreenToggle size="sm" />
        </div>
      ) : (
        <header className="flex w-full max-w-2xl items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <GamecakesLogo size={40} />
            <div>
              <div className="text-xs uppercase tracking-wider text-amber-300">
                Word Memory
              </div>
              <h1 className="text-2xl font-bold text-amber-100">
                {kidName ? `${kidName}'s Match` : 'Memory Match'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeedbackButton gameSlug="word-memory" kidName={kidName} />
            <SoundToggle size="sm" />
            <FullscreenToggle size="sm" />
          </div>
        </header>
      )}

      <div className="mt-4 w-full flex justify-center">
        <WordMemoryGame
          // Remount on level change or on "Play Again" (roundId bump).
          key={`${settings.level}-${roundId}`}
          listId={settings.level}
          capSeconds={(settings.duration ?? DEFAULT_DURATION_MIN) * 60}
          onComplete={handleComplete}
        />
      </div>

      {!isFullscreen ? (
        <div className="mt-6 flex gap-3">
          <Link
            href={backHref}
            className="rounded-full border border-amber-400/60 bg-blue-900/60 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-blue-900 active:scale-95"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {backOverride?.label ?? 'Back to Vocab Land'}
          </Link>
        </div>
      ) : null}

      {/* ---- Game-over overlay ---- */}
      {phase === 'gameover' && summary ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div
            className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl p-8 text-center shadow-2xl"
            style={{ background: 'linear-gradient(135deg, #fecdd3, #fef3c7, #bbf7d0)' }}
          >
            <div className="text-7xl animate-bounce" aria-hidden>
              {summary.efficiency >= 0.9 ? '🏆' : summary.efficiency >= 0.7 ? '⭐' : '🎴'}
            </div>
            <div className="text-3xl font-bold text-zinc-900">
              {summary.efficiency >= 0.9
                ? 'Amazing!'
                : summary.efficiency >= 0.7
                  ? 'Nice match!'
                  : 'All pairs found!'}
            </div>
            <div className="text-base text-zinc-700">
              <span className="font-mono font-bold">{summary.taps_total}</span>{' '}
              moves ·{' '}
              <span className="font-mono">{Math.round(summary.efficiency * 100)}%</span>{' '}
              efficient
              {' · '}
              <span className="font-mono">
                {Math.floor(summary.session_ms / 60000)}:
                {Math.floor((summary.session_ms % 60000) / 1000)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </div>

            {attemptPosting ? (
              <div className="text-sm text-zinc-600">Saving progress…</div>
            ) : attemptResponse ? (
              attemptResponse.tieredUp ? (
                <div className="rounded-full bg-amber-400 px-5 py-3 text-base font-bold text-amber-950">
                  ⭐ Level up! Now on list {attemptResponse.currentTier}
                </div>
              ) : (
                <div className="text-sm text-zinc-600">
                  List {attemptResponse.currentTier} · mastery{' '}
                  {Math.round(attemptResponse.masteryPct * 100)}%
                </div>
              )
            ) : null}

            {/* Token reward — scales with the chosen play length. */}
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
                style={{
                  background:
                    'linear-gradient(to right, var(--brand-strawberry, #fb7185), var(--brand-strawberry-deep, #e11d48))',
                  minHeight: 'var(--min-tap-target)',
                }}
              >
                Play Again
              </button>
              <ChromeNavButton onClick={() => setSettings(null)} variant="dark" size="lg">
                Change list
              </ChromeNavButton>
              <ChromeNavLink href={backHref} variant="dark" size="lg">{backOverride?.label ?? '← Back to Map'}</ChromeNavLink>
            </div>
          </div>
          <style>{`
            @keyframes coin-land {
              0%   { transform: translateY(-30px) scale(0.6); opacity: 0; }
              60%  { transform: translateY(4px)   scale(1.08); opacity: 1; }
              100% { transform: translateY(0)     scale(1);    opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </main>
  );
}
