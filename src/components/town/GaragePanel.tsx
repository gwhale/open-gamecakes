'use client';

// GaragePanel — the "Cakey Garage" section of the Cakey Store: the SECOND front
// door for renting cake rides (the first is the in-town garage kiosk + its
// RentalModal). Both POST to the same /api/town/rent-vehicle backend, so a ride
// rented here is immediately hoppable in /town and vice-versa.
//
// Mirrors LandEvolutionPanel: a self-contained panel CustomizeShop renders for
// real (non-guest) kids. Renting is charge-and-persist; a still-valid rental
// shows as "Rented ✓" (ride it over in Town). On a fresh rent we report the new
// balance up so the shared wallet pill stays in sync.

import { useState } from 'react';
import { VEHICLE_CATALOG, type VehicleKind } from '@/lib/town/vehicles';
import { playLevelUp, playWrong } from '@/lib/games/shared/sounds';
import { hapticSuccess, hapticWrong } from '@/lib/haptics';

export interface GaragePanelProps {
  /** Current wallet balance (owned by CustomizeShop). */
  balance: number;
  /** Kinds the kid already holds a valid rental for today. */
  initialRentals: VehicleKind[];
  /** Report a successful (fresh) rental so the parent updates the shared wallet. */
  onRented: (newBalance: number, cost: number) => void;
}

export default function GaragePanel({
  balance,
  initialRentals,
  onRented,
}: GaragePanelProps): React.ReactElement {
  const [rentals, setRentals] = useState<Set<VehicleKind>>(() => new Set(initialRentals));
  const [busy, setBusy] = useState<VehicleKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rent = async (kind: VehicleKind, cost: number): Promise<void> => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/town/rent-vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_kind: kind }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        balance?: number;
        error?: string;
        already?: boolean;
      };
      if (res.ok && typeof data.balance === 'number') {
        setRentals((prev) => new Set(prev).add(kind));
        // Only a fresh rent moved the wallet; an already-held rental is free.
        if (!data.already) onRented(data.balance, cost);
        playLevelUp();
        hapticSuccess();
      } else {
        setError(
          data.error === 'insufficient_balance'
            ? 'Not enough Sugar Tokens yet — keep playing!'
            : 'Could not rent — try again.',
        );
        playWrong();
        hapticWrong();
      }
    } catch {
      setError('Network hiccup — try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="relative z-10 mt-4 w-full max-w-2xl rounded-3xl border-2 border-sky-200 bg-white/85 p-4 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/85 sm:p-5">
      <div className="flex items-end justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Cakey Garage — rent a ride
        </h2>
        <span className="text-xs text-zinc-500">Hop on in Town 🚙</span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {VEHICLE_CATALOG.map((v) => {
          const owned = rentals.has(v.kind);
          const canAfford = balance >= v.cost;
          const isBusy = busy === v.kind;
          return (
            <div key={v.kind} className="flex items-center gap-3 rounded-2xl bg-white/70 p-2.5 dark:bg-zinc-800/60">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-2xl dark:bg-sky-950/50" aria-hidden>
                {v.glyph}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {v.label}
                </div>
                <p className="truncate text-xs text-zinc-500">{v.blurb}</p>
              </div>
              {owned ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  <span aria-hidden>✓</span> Rented
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => rent(v.kind, v.cost)}
                  disabled={busy !== null || !canAfford}
                  className="candy-shell font-display flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold transition-[transform,box-shadow,filter] duration-100 ease-out active:scale-95"
                  style={{
                    minHeight: 'var(--min-tap-target)',
                    '--c-from': 'var(--earn-from)',
                    '--c-to': 'var(--earn-to)',
                    '--c-ink': 'var(--earn-ink)',
                    '--c-glow': 'var(--earn-glow)',
                  } as React.CSSProperties}
                  aria-label={`Rent the ${v.label} for ${v.cost} coins`}
                >
                  {isBusy ? (
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                  ) : (
                    <>
                      <span>Rent</span>
                      <span aria-hidden>🪙</span>
                      <span className="font-mono tabular-nums">{v.cost}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="mt-2 text-center text-xs font-semibold text-rose-600" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">
          Rentals last all day — ride anything you&rsquo;ve rented from the 🚙 Cakey Garage in Town.
        </p>
      )}
    </section>
  );
}
