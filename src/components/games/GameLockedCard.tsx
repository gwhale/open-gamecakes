'use client';

// The "buy this game" screen, shown in place of a priced game the kid does not
// own yet. Rendered by the game's own page (server-gated), so this is what a kid
// sees whether they arrived from the All Games menu, from a town booth, or by
// typing the URL.
//
// Deliberately warm rather than a wall: it names the game, shows the price
// against what they have, and says plainly that buying it is permanent. A kid
// who cannot afford it yet is told how close they are, not just "no".

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';

export default function GameLockedCard({
  gameSlug,
  label,
  glyph,
  cost,
  balance,
}: {
  gameSlug: string;
  label: string;
  glyph: string;
  cost: number;
  balance: number;
}): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAfford = balance >= cost;

  const unlock = async (): Promise<void> => {
    if (busy || !canAfford) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/games/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSlug }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.ok && (data.status === 'unlocked' || data.status === 'already_unlocked')) {
        // Re-render the server component so the gate re-evaluates and the game
        // itself takes over — no client-side "pretend it's unlocked" state that
        // could disagree with the server.
        router.refresh();
        return;
      }
      setError(
        data.status === 'insufficient_balance'
          ? 'Not enough Sugar Tokens yet — keep playing!'
          : 'Could not unlock — try again.',
      );
    } catch {
      setError('Network hiccup — try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center">
      <div className="text-6xl" aria-hidden>{glyph}</div>
      <div>
        <h1 className="text-2xl font-extrabold">{label}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          A brand-new game. Unlock it once and it&rsquo;s yours forever.
        </p>
      </div>

      <button
        type="button"
        onClick={unlock}
        disabled={busy || !canAfford}
        className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-400 to-rose-600 px-8 py-3 text-base font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-50"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        {busy ? 'Unlocking…' : <>Unlock for <SugarTokenIcon />{cost}</>}
      </button>

      <p className="text-xs text-zinc-500">
        {canAfford ? (
          <>You have <SugarTokenIcon />{balance}.</>
        ) : (
          <>
            You have <SugarTokenIcon />{balance} — <SugarTokenIcon />{cost - balance} to go. Keep
            playing to earn more!
          </>
        )}
      </p>

      {error ? (
        <p className="text-xs font-semibold text-rose-600" role="alert">{error}</p>
      ) : null}
    </main>
  );
}
