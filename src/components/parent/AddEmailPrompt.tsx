'use client';

// Asks a grown-up for a contact email when the family has none. Shown on
// /parent until one is saved. Saves through the same route as the settings
// page (api/parent/contact-email). "Not now" hides it for this visit only, so it
// comes back next time; once saved it is gone for good.
//
// Families from before signup asked for an email (2026-11-07) have none, so the
// operator has no way to reach them if they get locked out.

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AddEmailPrompt({ suggested }: { suggested: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState(suggested ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'hidden'>('idle');
  const [error, setError] = useState<string | null>(null);

  if (state === 'hidden') return null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/parent/contact-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? 'That did not save. Try again?');
      setState('saved');
      router.refresh();
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'That did not save. Try again?');
    }
  };

  if (state === 'saved') {
    return (
      <p
        role="status"
        className="w-full max-w-3xl rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
      >
        Thanks. If you ever get locked out, we can reach you there. You can change it in Settings.
      </p>
    );
  }

  return (
    <form
      onSubmit={save}
      aria-labelledby="add-email-title"
      className="w-full max-w-3xl rounded-2xl border-2 border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30"
    >
      <h2 id="add-email-title" className="text-lg font-semibold">
        Add your email
      </h2>
      <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
        So we can help if you forget your password or PIN. We only use it for that. It is not your login.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="min-w-0 flex-1 basis-60">
          <span className="sr-only">Your email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            required
            className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>
        <button
          type="submit"
          disabled={state === 'saving'}
          className="rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => setState('hidden')}
          className="rounded-full px-4 text-sm font-medium text-zinc-600 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Not now
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </form>
  );
}
