'use client';

// GiveCookiesPanel — parent-facing "reward Sugar Tokens for real-life stuff" control.
//
// Lives on the kid detail page (/parent/kid/[kidId], as the 🪙 Sugar Tokens tab).
// It's a friendly wrapper over the existing grant path: pick a reason (Chores,
// Reading, …) + an amount, and it POSTs JSON to /api/parent/tokens/grant, which
// mints through the canonical mint_tokens RPC (reason 'parent_grant'). The grant
// shows in the kid's wallet immediately.
//
// "Sugar Tokens" is the player-facing name (🪙) for what the DB calls tokens/coins.
// (Component + file kept as GiveCookiesPanel to avoid churn; only copy changed.)

import { useState } from 'react';

const REASONS: { key: string; label: string; emoji: string }[] = [
  { key: 'chores', label: 'Chores', emoji: '🧹' },
  { key: 'reading', label: 'Reading', emoji: '📚' },
  { key: 'kindness', label: 'Kindness', emoji: '💛' },
  { key: 'helped', label: 'Helped out', emoji: '🙌' },
  { key: 'practice', label: 'Practice', emoji: '✏️' },
];

const PRESETS = [5, 10, 25];

export default function GiveCookiesPanel({
  kidId,
  kidName,
  initialBalance,
  disabled = false,
}: {
  kidId: string;
  kidName: string;
  initialBalance: number;
  disabled?: boolean;
}) {
  const [balance, setBalance] = useState(initialBalance);
  const [amount, setAmount] = useState(10);
  const [reasonKey, setReasonKey] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const pickReason = (r: { key: string; label: string }): void => {
    setReasonKey(r.key);
    setNote(r.label);
    setFlash(null);
  };
  const onNoteChange = (v: string): void => {
    setNote(v);
    setReasonKey(null); // typing a custom note deselects the preset chip
  };

  const valid = Number.isFinite(amount) && amount >= 1 && amount <= 100;

  const give = async (): Promise<void> => {
    if (!valid || submitting || disabled) return;
    setSubmitting(true);
    setFlash(null);
    try {
      const res = await fetch('/api/parent/tokens/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId, delta: amount, note: note.trim() || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; balance?: number; error?: string };
      if (res.ok && data.ok && typeof data.balance === 'number') {
        setBalance(data.balance);
        setFlash({
          kind: 'ok',
          text: `+${amount} 🪙${note.trim() ? ` for ${note.trim()}` : ''}! ${kidName} now has ${data.balance}.`,
        });
        setReasonKey(null);
        setNote('');
      } else {
        setFlash({
          kind: 'err',
          text: data.error === 'bad_amount' ? 'Pick between 1 and 100 Sugar Tokens.' : 'Could not give Sugar Tokens — try again.',
        });
      }
    } catch {
      setFlash({ kind: 'err', text: 'Network hiccup — try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  if (disabled) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">🪙 Give Sugar Tokens</h2>
        <p className="mt-2 rounded-xl border-2 border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
          Sandbox kids don&apos;t have a Sugar Token wallet. Pick a real kid to reward.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">🪙 Give Sugar Tokens</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Reward {kidName} for real-life wins. Sugar Tokens land in their wallet right away.
          </p>
        </div>
        <div
          className="rounded-full bg-amber-100 px-4 py-2 text-lg font-bold tabular-nums text-amber-900 shadow-inner dark:bg-amber-950 dark:text-amber-100"
          aria-label={`${kidName} has ${balance} Sugar Tokens`}
        >
          🪙 {balance}
        </div>
      </div>

      {/* Reason chips */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Reward for</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {REASONS.map((r) => {
            const active = reasonKey === r.key;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => pickReason(r)}
                aria-pressed={active}
                className={`rounded-full px-3 py-2 text-sm font-semibold transition active:scale-95 ${
                  active
                    ? 'bg-rose-500 text-white shadow-sm ring-2 ring-rose-300'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                {r.emoji} {r.label}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          maxLength={200}
          placeholder="…or type your own reason (optional)"
          className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {/* Amount */}
      <div className="mt-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">How many</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => {
            const active = amount === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setAmount(p)}
                aria-pressed={active}
                className={`rounded-full px-4 py-2 text-sm font-bold tabular-nums transition active:scale-95 ${
                  active
                    ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                +{p}
              </button>
            );
          })}
          <label className="flex items-center gap-1 text-sm text-zinc-500">
            <span className="text-xs">custom</span>
            <input
              type="number"
              min={1}
              max={100}
              value={amount}
              onChange={(e) => setAmount(Number.parseInt(e.target.value, 10) || 0)}
              className="w-20 rounded-lg border border-zinc-300 px-3 py-2 font-mono tabular-nums focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={give}
        disabled={!valid || submitting}
        className="mt-6 w-full rounded-full bg-emerald-600 px-5 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50 sm:w-auto"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        {submitting ? 'Giving…' : `Give ${valid ? amount : '…'} 🪙`}
      </button>

      {flash ? (
        <div
          role={flash.kind === 'ok' ? 'status' : 'alert'}
          aria-live="polite"
          className={`mt-4 rounded-full px-5 py-2 text-sm font-semibold ${
            flash.kind === 'ok'
              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'
              : 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100'
          }`}
        >
          {flash.text}
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-zinc-400">
        Tip: use Sugar Tokens to reward chores, reading, or kindness IRL — {kidName} spends them in the Cakey Store.
      </p>
    </section>
  );
}
