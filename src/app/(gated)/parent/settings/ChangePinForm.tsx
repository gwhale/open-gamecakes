'use client';

// Change the grown-up PIN. Asks for the current one, because grown-up mode stays
// open for 30 minutes on a tablet a child can pick up.

import { useState } from 'react';

const INPUT =
  'rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900';

function PinField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}): React.ReactElement {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]{4,8}"
        title="4 to 8 digits"
        minLength={4}
        maxLength={8}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT}
        style={{ minHeight: 'var(--min-tap-target)' }}
      />
    </label>
  );
}

export default function ChangePinForm(): React.ReactElement {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (next !== again) {
      setMsg({ kind: 'err', text: "The two new PINs don't match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/parent/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current, next }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setMsg({ kind: 'err', text: data?.error ?? 'Could not change the PIN. Try again.' });
        return;
      }
      setCurrent('');
      setNext('');
      setAgain('');
      setMsg({ kind: 'ok', text: 'PIN changed. Use the new one next time.' });
    } catch {
      setMsg({ kind: 'err', text: 'Could not reach the server. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-lg font-semibold">Grown-up PIN</h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          The PIN that opens this section. Use 4 to 8 digits your kids don&rsquo;t know.
        </p>
      </div>
      <PinField label="Current PIN" value={current} onChange={setCurrent} autoComplete="off" />
      <PinField label="New PIN" value={next} onChange={setNext} autoComplete="new-password" />
      <PinField label="New PIN again" value={again} onChange={setAgain} autoComplete="new-password" />
      {msg ? (
        <p
          role={msg.kind === 'err' ? 'alert' : 'status'}
          className={
            msg.kind === 'err'
              ? 'text-sm text-red-700 dark:text-red-300'
              : 'text-sm text-emerald-800 dark:text-emerald-300'
          }
        >
          {msg.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-zinc-900 px-6 py-2 font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        {busy ? 'Saving…' : 'Change PIN'}
      </button>
    </form>
  );
}
