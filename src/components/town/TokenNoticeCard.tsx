'use client';

// TokenNoticeCard — a story-style card that tells the kid a grown-up ADDED or
// REMOVED Sugar Tokens from their wallet (token_transactions.reason =
// 'parent_grant'; + delta = add, − delta = remove). Same visual family as
// StoryCard (full-screen backdrop, Cakey + speech bubble, one button) so it
// reads like the rest of Cakey's talk UI. The town balance pill already shows
// the new total — this card just explains WHY it changed.

import GamecakesMascot, { type CakeyMood } from '@/components/GamecakesMascot';
import { useEscapeKey } from '@/hooks/useEscapeKey';

/** One external wallet change to announce. `delta` is signed: + added, − removed.
 *  `id` is the token_transactions.id (used to mark it seen). */
export interface TokenNotice {
  id: string;
  delta: number;
  /** Optional note the grown-up attached to the change. */
  note?: string;
}

interface TokenNoticeCardProps {
  notice: TokenNotice;
  /** Dismiss this card (advances the queue / marks it seen). */
  onDone: () => void;
}

export default function TokenNoticeCard({ notice, onDone }: TokenNoticeCardProps): React.ReactElement {
  // Keyboard dismiss to match the backdrop tap / button.
  useEscapeKey(onDone);

  const added = notice.delta > 0;
  const amount = Math.abs(notice.delta);
  const mood: CakeyMood = added ? 'celebrate' : 'idle';
  const icon = added ? '🎁' : '↩️';
  const title = added ? 'You got Sugar Tokens!' : 'Wallet update';
  const message = added
    ? `A grown-up added 🪙${amount} to your wallet!`
    : `A grown-up took 🪙${amount} out of your wallet.`;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 pb-8 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onDone}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-zinc-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title strip. */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            {icon}
          </span>
          <span
            className={
              'text-[11px] font-bold uppercase tracking-wider ' +
              (added ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400')
            }
          >
            Sugar Tokens
          </span>
        </div>

        {/* Header: Cakey + the message as his speech bubble. */}
        <div className="mb-4 flex items-end gap-3">
          <GamecakesMascot mood={mood} size={72} />
          <div className="animate-cakey-pop relative flex-1 rounded-3xl rounded-bl-md bg-amber-50 px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-zinc-100">
            <div className="font-display text-base font-extrabold">{title}</div>
            <div className="mt-0.5">{message}</div>
            {notice.note ? (
              <div className="mt-1 text-xs italic text-zinc-500 dark:text-zinc-400">
                “{notice.note}”
              </div>
            ) : null}
            <span
              className="absolute -bottom-2 left-4 h-0 w-0 border-l-8 border-t-8 border-transparent border-t-amber-50 dark:border-t-zinc-700"
              aria-hidden
            />
          </div>
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDone}
            className={
              'rounded-full px-6 py-3 text-sm font-bold text-white shadow-sm transition active:scale-95 ' +
              (added
                ? 'bg-amber-400 hover:bg-amber-500'
                : 'bg-zinc-400 hover:bg-zinc-500')
            }
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            {added ? '🪙 Yay!' : 'Okay'}
          </button>
        </div>
      </div>
    </div>
  );
}
