'use client';

// The family's contact address. Every plan has this; it is how they get help.

import { useState } from 'react';

export default function ContactEmailForm({ initial }: { initial: string | null }) {
  const [email, setEmail] = useState(initial ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

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
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'That did not save. Try again?');
    }
  };

  return (
    <form
      onSubmit={save}
      className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <label className="block">
        <span className="text-lg font-semibold">Your email</span>
        <span className="mt-1 block text-xs text-zinc-500">
          So we can reach you if you need help getting back in. It is not your login.
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          style={{ minHeight: 'var(--min-tap-target)' }}
        />
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={state === 'saving'}
          className="rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Save
        </button>
        <p className={`text-xs ${error ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'}`} aria-live="polite">
          {error ?? (state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved.' : ' ')}
        </p>
      </div>
    </form>
  );
}
