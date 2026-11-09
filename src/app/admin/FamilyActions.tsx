'use client';

// Reset a family's password or PIN from /admin. Two taps, because the first one
// would otherwise lock a family out by accident. The new value shows once.

import { useState } from 'react';

type Action = 'reset-password' | 'reset-pin';

const LABEL: Record<Action, string> = { 'reset-password': 'password', 'reset-pin': 'PIN' };

const buttonClass =
  'min-h-11 rounded-full border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800';

export default function FamilyActions({ familyId, familyName }: { familyId: string; familyName: string }) {
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ action: Action; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: Action) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/family-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyId, action }),
      });
      const body = (await res.json().catch(() => ({}))) as { value?: string; error?: string };
      if (res.status === 401) throw new Error('Your 15 minutes ran out. Reload and enter your password.');
      if (!res.ok || !body.value) throw new Error('That did not work. Nothing was shown, so try again.');
      setResult({ action, value: body.value });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <div className="mt-2 flex max-w-64 flex-col gap-1.5">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs">
            Replace the {LABEL[confirming]} for {familyName}?
            {confirming === 'reset-password' ? ' This signs them out on every device.' : ''}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(confirming)}
            className={`${buttonClass} border-red-400 text-red-700 dark:text-red-300`}
          >
            Yes, replace it
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(null)} className={`${buttonClass}`}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LABEL) as Action[]).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => {
                setResult(null);
                setConfirming(action);
              }}
              className={`${buttonClass}`}
            >
              Reset {LABEL[action]}
            </button>
          ))}
        </div>
      )}
      {result ? (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" role="status">
          New {LABEL[result.action]}: <code className="select-all font-mono font-bold">{result.value}</code>
          <span className="block">Shown once. Give it to them now.</span>
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-700 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
