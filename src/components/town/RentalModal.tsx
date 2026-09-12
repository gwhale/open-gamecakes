'use client';

// RentalModal — the Cakey Garage menu. Opened from the in-town garage kiosk (or
// reused by the Cakey Store "Garage" tab). Lists the four cake rides; each is
// either RENT (costs Sugar Tokens for the day) or, if the kid already holds a
// valid rental today, RIDE (free — hop straight on).
//
// Purely presentational, mirroring StormModal: the host owns the POST to
// /api/town/rent-vehicle and the engine.mountVehicle call, and passes down the
// live `rentals` set + which row is `pending`. Emoji-forward for non-readers.

import { useEffect } from 'react';
import { playStart } from '@/lib/games/shared/sounds';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import { VEHICLE_CATALOG, type VehicleKind } from '@/lib/town/vehicles';

export interface RentalModalProps {
  /** Current spendable balance — display + per-ride can-afford check. */
  balance: number;
  /** Kinds the kid holds a valid (non-expired) rental for today → show "Ride". */
  rentals: ReadonlySet<VehicleKind>;
  /** The ride whose rent POST is currently in flight, or null. */
  pending: VehicleKind | null;
  errorMessage?: string;
  /** Rent an unowned ride (charges tokens, then mounts). */
  onRent: (kind: VehicleKind) => void;
  /** Hop onto an already-rented ride (free). */
  onRide: (kind: VehicleKind) => void;
  onClose: () => void;
}

export default function RentalModal(props: RentalModalProps): React.ReactElement {
  useEffect(() => {
    playStart();
  }, []);

  // Keyboard dismiss to match "Maybe later" (suspended while a rent is in flight).
  useEscapeKey(props.onClose, props.pending === null);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cakey Garage — rent a ride"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-3xl p-6 shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #ffffff 0%, #ffe3ef 130%)' }}
      >
        <div className="text-center">
          <div className="text-5xl" aria-hidden>
            🚙🎈
          </div>
          <div className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">
            Cakey Garage
          </div>
          <h2 className="text-2xl font-bold text-zinc-900">Rent a ride for the day!</h2>
          <div className="mt-1 flex items-center justify-center gap-1 text-sm font-bold text-amber-900">
            <SugarTokenIcon />
            <span className="font-mono tabular-nums">{props.balance}</span>
            <span className="font-semibold text-zinc-500">in your wallet</span>
          </div>
        </div>

        {props.errorMessage ? (
          <div
            role="alert"
            className="rounded-full bg-rose-100 px-4 py-2 text-center text-sm font-semibold text-rose-900"
          >
            {props.errorMessage}
          </div>
        ) : null}

        {/* One card per ride. */}
        <div className="flex flex-col gap-2.5">
          {VEHICLE_CATALOG.map((v) => {
            const owned = props.rentals.has(v.kind);
            const canAfford = props.balance >= v.cost;
            const isPending = props.pending === v.kind;
            const disabled = props.pending !== null || (!owned && !canAfford);
            return (
              <div
                key={v.kind}
                className="flex items-center gap-3 rounded-2xl bg-white/80 p-3 shadow-sm"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-100 text-2xl" aria-hidden>
                  {v.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-bold text-zinc-900">{v.label}</span>
                    {owned ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Rented
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-zinc-500">{v.blurb}</p>
                </div>
                <button
                  type="button"
                  onClick={() => (owned ? props.onRide(v.kind) : props.onRent(v.kind))}
                  disabled={disabled}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-40 ${
                    owned ? 'bg-emerald-500' : 'bg-[linear-gradient(to_bottom_right,var(--act-from),var(--act-to))]'
                  }`}
                  style={{ minHeight: 'var(--min-tap-target)' }}
                  aria-label={
                    owned
                      ? `Ride the ${v.label}`
                      : `Rent the ${v.label} for ${v.cost} Sugar Tokens`
                  }
                >
                  {isPending ? (
                    <span
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
                      aria-hidden
                    />
                  ) : owned ? (
                    <span>Ride ▶</span>
                  ) : (
                    <>
                      <span>Rent</span>
                      <SugarTokenIcon />
                      <span className="font-mono tabular-nums">{v.cost}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={props.onClose}
          disabled={props.pending !== null}
          className="mx-auto mt-1 rounded-full border border-zinc-300 bg-white px-6 py-2.5 text-base font-semibold text-zinc-700 shadow-sm transition active:scale-95 disabled:opacity-50"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
