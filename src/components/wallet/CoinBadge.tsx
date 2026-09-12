'use client';

// CoinBadge — the wallet display rendered in the map header. Reads
// /api/tokens on mount and refetches on window focus so the kid's
// balance updates whenever they switch back from a game tab. Briefly
// pulses when the balance grows so the kid notices the win even if
// they weren't watching the badge during the increase.
//
// The badge is a shortcut into the Cakey Store — tapping your Sugar Tokens
// takes you to /kids/customize to spend them.

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import AnimatedCoinCount from '@/components/wallet/AnimatedCoinCount';

interface TokensResponse {
  balance: number;
}

export default function CoinBadge() {
  const [balance, setBalance] = useState<number | null>(null);
  const [pulse, setPulse] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const res = await fetch('/api/tokens', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as TokensResponse;
        if (cancelled) return;
        setBalance(data.balance);
      } catch {
        // Network blip — keep showing the previous value rather than
        // flashing an error. Next focus event will retry.
      }
    };

    load();
    const onFocus = (): void => {
      load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Trigger a pulse animation when balance increases. Skip the very
  // first load (prev is null) so we don't pulse on initial mount.
  // The lint rule prefers no setState-in-effect; this case is bounded
  // (effect only fires on balance change, timer self-clears) so the
  // disable is intentional rather than a missed pattern.
  useEffect(() => {
    if (balance === null) return;
    const prev = prevBalanceRef.current;
    prevBalanceRef.current = balance;
    if (prev !== null && balance > prev) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPulse(true);
      const t = window.setTimeout(() => setPulse(false), 700);
      return () => window.clearTimeout(t);
    }
  }, [balance]);

  // Loading state: render a placeholder pill so the header layout
  // doesn't reflow when the balance arrives.
  if (balance === null) {
    return (
      <div
        className="flex items-center gap-1.5 rounded-full border border-white/50 bg-white/30 px-3 py-2 text-sm font-semibold backdrop-blur-sm"
        style={{ minHeight: 'var(--min-tap-target)' }}
        aria-label="Wallet loading"
      >
        <SugarTokenIcon />
        <span className="font-mono tabular-nums opacity-50">···</span>
      </div>
    );
  }

  return (
    <Link
      href="/kids/customize"
      className={`flex items-center gap-1.5 rounded-full border border-amber-200/70 bg-amber-100/70 px-3 py-2 text-sm font-semibold text-amber-900 backdrop-blur-sm transition-transform hover:brightness-105 active:scale-95 ${
        pulse ? 'scale-110' : 'scale-100'
      } dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-100`}
      style={{ minHeight: 'var(--min-tap-target)' }}
      aria-label={`Wallet: ${balance} Sugar Tokens — tap to open the Cakey Store`}
      aria-live="polite"
    >
      <SugarTokenIcon />
      <AnimatedCoinCount value={balance} className="font-mono tabular-nums" />
    </Link>
  );
}
