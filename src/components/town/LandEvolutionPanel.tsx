'use client';

// LandEvolutionPanel — the "My Land" section of the Cakey Store.
//
// Shows the owner kid the current stage of THEIR land (Plot → Cottage → Tower
// → Castle) and a single "upgrade to the next stage" button. Owner-only: this
// panel is rendered by CustomizeShop only when the active kid owns a land
// (kids.land_slug names their region). Buying calls POST
// /api/land/upgrade, which authorizes the owner + spends atomically; on success
// we bump the local stage and report the new balance up so the shared wallet
// pill stays in sync.

import { useState } from 'react';
import {
  LAND_EVOLUTIONS,
  evolutionForLevel,
  nextEvolution,
} from '@/lib/town/land-evolution';
import { playLevelUp, playWrong } from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticWrong } from '@/lib/haptics';

export interface LandEvolutionPanelProps {
  /** The land this kid owns. */
  ownedLand: { slug: string; name: string; level: number };
  /** Current wallet balance (owned by CustomizeShop). */
  balance: number;
  /** Report a successful upgrade so the parent updates the shared wallet. */
  onUpgraded: (newBalance: number, cost: number) => void;
}

export default function LandEvolutionPanel({
  ownedLand,
  balance,
  onUpgraded,
}: LandEvolutionPanelProps): React.ReactElement {
  const [level, setLevel] = useState(ownedLand.level);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = evolutionForLevel(level);
  const next = nextEvolution(level);
  const canAfford = next ? balance >= next.cost : false;

  const upgrade = async (): Promise<void> => {
    if (!next || busy || !canAfford) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/land/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regionSlug: ownedLand.slug }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        level?: number;
        balance?: number;
        error?: string;
      };
      if (res.ok && typeof data.level === 'number' && typeof data.balance === 'number') {
        setLevel(data.level);
        onUpgraded(data.balance, next.cost);
        playLevelUp();
        hapticSuccess();
      } else {
        setError(
          data.error === 'insufficient_balance'
            ? 'Not enough Sugar Tokens yet — keep playing!'
            : 'Could not upgrade — try again.',
        );
        playWrong();
        hapticWrong();
      }
    } catch {
      setError('Network hiccup — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="relative z-10 mt-4 w-full max-w-2xl rounded-3xl border-2 border-amber-200 bg-white/85 p-4 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/85 sm:p-5">
      <div className="flex items-end justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          My Land — {ownedLand.name}
        </h2>
        <span className="text-xs text-zinc-500">
          {current.glyph} {current.name}
        </span>
      </div>

      {/* Stage ladder — current stage highlighted, past stages filled. */}
      <ol className="mt-3 flex items-center gap-1.5">
        {LAND_EVOLUTIONS.map((stage) => {
          const reached = stage.level <= level;
          const isCurrent = stage.level === level;
          return (
            <li
              key={stage.key}
              className={`flex flex-1 flex-col items-center rounded-xl py-2 text-center ${
                isCurrent
                  ? 'bg-amber-100 ring-2 ring-amber-300 dark:bg-amber-950/50'
                  : reached
                    ? 'bg-emerald-50 dark:bg-emerald-950/30'
                    : 'bg-zinc-50 opacity-60 dark:bg-zinc-800/50'
              }`}
            >
              <span className="text-xl" aria-hidden>{stage.glyph}</span>
              <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                {stage.name}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Upgrade action or maxed state. */}
      {next ? (
        <div className="mt-4 flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={upgrade}
            disabled={busy || !canAfford}
            className="w-full rounded-full bg-gradient-to-r from-rose-400 to-rose-600 px-5 py-3 text-base font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-50 sm:w-auto sm:px-8"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {busy
              ? 'Building…'
              : `Grow into ${next.glyph} ${next.name} — 🪙 ${next.cost}`}
          </button>
          {!canAfford ? (
            <span className="text-[11px] text-zinc-500">
              Need 🪙 {next.cost} — you have 🪙 {balance}. Keep playing to earn more!
            </span>
          ) : (
            <span className="text-[11px] text-zinc-500">
              Each stage makes your land bigger and grander.
            </span>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-3 text-center text-sm font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          🏰 Your land is a full Castle — the top of the ladder. Amazing!
        </p>
      )}

      {error ? (
        <p className="mt-2 text-center text-xs font-semibold text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
