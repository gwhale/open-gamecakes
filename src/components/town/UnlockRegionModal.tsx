'use client';

// UnlockRegionModal — the discover prompt rendered when the avatar
// approaches a fogged region the kid is eligible to unlock.
//
// Designed for non-readers (a K kid). Most of the information is
// emoji-forward: the region's themed glyph, a sparkle for the unlock
// action, the coin emoji plus a number for cost. The text is there
// for older kids and the parent looking over the shoulder.
//
// The modal is purely presentational. It doesn't fetch anything —
// the host (PhaserTownHost) owns the POST to /api/town/discover and
// passes us a `pending` flag so we can disable buttons while the
// request is in flight. On success the host emits
// town:request-discover back to the scene which handles the fog
// removal animation; the modal just closes.
//
// Sound: playStart fires once on mount via useEffect (a small chime
// so the kid notices the modal even if they were tapping elsewhere
// when it opened). The host plays playLevelUp on a successful
// discover, so we don't replay anything here on confirm.

import { useEffect } from 'react';
import { playStart } from '@/lib/games/shared/sounds';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import type { Region } from '@/lib/town/regions';

export interface UnlockRegionModalProps {
  region: Region;
  /** Current spendable balance — used for both the "you have X"
   *  display and the can-afford check. */
  balance: number;
  /** True while the host's POST /api/town/discover is in flight.
   *  Disables both buttons and shows a spinner on Reveal. */
  pending: boolean;
  /** Set when the last attempt errored — typically a network failure
   *  or an unexpected server response. Cleared by closing the modal. */
  errorMessage?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function UnlockRegionModal(
  props: UnlockRegionModalProps,
): React.ReactElement {
  const canAfford = props.balance >= props.region.unlock_cost;

  // Subtle attention sound when the modal first appears so a kid
  // bouncing between regions doesn't miss it. One-shot per mount.
  useEffect(() => {
    playStart();
  }, []);

  // Keyboard dismiss to match the Cancel button (suspended mid-request).
  useEscapeKey(props.onCancel, !props.pending);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Reveal ${props.region.name}?`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl p-7 text-center shadow-2xl"
        style={{
          // Tint the modal background with the target region's theme
          // color so kids recognize "this is THE place I'm unlocking"
          // even if they can't read the name yet.
          background: `linear-gradient(160deg, #ffffff 0%, ${props.region.themeColor} 130%)`,
        }}
      >
        <div className="text-6xl" aria-hidden>
          ✨
        </div>

        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Reveal
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">
            {props.region.name}
          </h2>
          <p className="mt-1 max-w-xs text-sm text-zinc-700">
            {props.region.theme}
          </p>
        </div>

        {/* Cost / balance — emoji-first so a non-reader can compare
            the two coin numbers and understand affordability without
            parsing the words. The X / Y framing reads naturally
            as "you need this many out of this many". */}
        <div className="flex items-center justify-center gap-6 rounded-2xl bg-white/70 px-5 py-3 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 text-2xl font-bold text-amber-900">
              <SugarTokenIcon />
              <span className="font-mono tabular-nums">
                {props.region.unlock_cost}
              </span>
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
            <span aria-hidden>🎮</span>
            <span className="flex items-center gap-1">
              Play more games to earn <SugarTokenIcon />!
            </span>
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
            Cancel
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
            aria-label={`Reveal ${props.region.name} for ${props.region.unlock_cost} Sugar Tokens`}
          >
            {props.pending ? (
              <>
                <span
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden
                />
                <span>Revealing…</span>
              </>
            ) : (
              <>
                <span>Reveal</span>
                <span aria-hidden>✨</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
