'use client';

// StormModal — shown when the kid walks up to a land a weather storm has
// re-locked (pink fog rolled back on). They can pay a few Sugar Tokens to blow
// the fog away now, or cancel and wait it out free (it auto-clears on its own).
//
// Purely presentational, mirroring UnlockRegionModal: the host owns the POST to
// /api/town/clear-storm and passes `pending`/`errorMessage`. Emoji-forward for
// non-readers.

import { useEffect } from 'react';
import { playStart } from '@/lib/games/shared/sounds';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export interface StormModalProps {
  /** The re-locked land's display name. */
  landName: string;
  /** Sugar Token cost to clear the storm early. */
  cost: number;
  /** Current spendable balance — display + can-afford check. */
  balance: number;
  /** True while the host's POST /api/town/clear-storm is in flight. */
  pending: boolean;
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function StormModal(props: StormModalProps): React.ReactElement {
  const canAfford = props.balance >= props.cost;

  useEffect(() => {
    playStart();
  }, []);

  // Keyboard dismiss to match "Wait it out" (suspended mid-request).
  useEscapeKey(props.onCancel, !props.pending);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`A storm covered ${props.landName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl p-7 text-center shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #cfd8f0 130%)' }}
      >
        <div className="text-6xl" aria-hidden>
          🍬🌀
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            A storm rolled in
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">{props.landName}</h2>
          <p className="mt-1 max-w-xs text-sm text-zinc-700">
            Pink fog covered it! Blow it away now, or wait — it&rsquo;ll clear on its own.
          </p>
        </div>

        {/* Cost / balance — emoji-first so a non-reader can compare the coins. */}
        <div className="flex items-center justify-center gap-6 rounded-2xl bg-white/70 px-5 py-3 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-2xl font-bold text-amber-900">
              <SugarTokenIcon />
              <span className="font-mono tabular-nums">{props.cost}</span>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              cost
            </div>
          </div>
          <div className="text-2xl text-zinc-300" aria-hidden>
            /
          </div>
          <div className="flex flex-col items-center">
            <div
              className={`flex items-center gap-1 text-2xl font-bold ${
                canAfford ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              <SugarTokenIcon />
              <span className="font-mono tabular-nums">{props.balance}</span>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              you have
            </div>
          </div>
        </div>

        {!canAfford ? (
          <div className="flex items-center gap-2 rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900">
            <span aria-hidden>⏳</span>
            <span>No worries — it clears on its own soon!</span>
          </div>
        ) : null}

        {props.errorMessage ? (
          <div
            role="alert"
            className="rounded-full bg-rose-100 px-4 py-2 text-sm font-semibold text-rose-900"
          >
            {props.errorMessage}
          </div>
        ) : null}

        <div className="mt-2 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.pending}
            className="rounded-full border border-zinc-300 bg-white px-6 py-3 text-base font-semibold text-zinc-700 shadow-sm transition active:scale-95 disabled:opacity-50"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Wait it out
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={!canAfford || props.pending}
            className="flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-bold text-white shadow-md transition active:scale-95 disabled:opacity-50"
            style={{
              background:
                'linear-gradient(to right, var(--brand-strawberry, #fb7185), var(--brand-strawberry-deep, #e11d48))',
              minHeight: 'var(--min-tap-target)',
            }}
            aria-label={`Blow away the storm for ${props.cost} Sugar Tokens`}
          >
            {props.pending ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden
                />
                <span>Clearing…</span>
              </>
            ) : (
              <>
                <span>Blow it away</span>
                <span aria-hidden>💨</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
