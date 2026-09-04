// `/grownups` — the grown-up mode gate.
//
// The door between kid-safe play and the parent admin section. On a shared
// tablet the default state is kid mode; reaching /parent routes through here
// to enter a short-lived, server-verified grown-up mode (see
// src/lib/auth/parent-mode.ts). Zero client JS — a plain PIN form.
//
// Three states:
//   - already elevated       → straight to /parent
//   - family has NO PIN yet   → "Create a grown-up PIN" (first-run onboarding)
//   - family has a PIN        → "Enter grown-up PIN"

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireCurrentFamily } from '@/lib/auth/family';
import { isParentMode, familyHasParentPin } from '@/lib/auth/parent-mode';

export default async function GrownupsPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise.
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const family = await requireCurrentFamily();

  // Already a grown-up this session → skip the wall.
  if (await isParentMode(family.id)) redirect('/parent');

  const hasPin = await familyHasParentPin(family.id);
  const sp = await searchParams;
  const badPin = sp.error === 'bad_pin';
  const dest =
    typeof sp.redirect === 'string' && sp.redirect.startsWith('/') && !sp.redirect.startsWith('//')
      ? sp.redirect
      : '/parent';

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="max-w-sm text-center">
        <div className="text-7xl" aria-hidden>🔒</div>
        <h1 className="mt-4 text-3xl font-semibold">Grown-ups only</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">
          {hasPin
            ? 'Enter the grown-up PIN to manage the family.'
            : 'Set a grown-up PIN. Kids won’t know it, so it keeps the parent section just for you.'}
        </p>
      </div>

      <form action="/api/parent/unlock" method="post" className="flex w-full max-w-xs flex-col gap-4">
        <input type="hidden" name="redirect" value={dest} />
        <label className="flex flex-col gap-2">
          <span className="sr-only">Grown-up PIN</span>
          <input
            type="password"
            name="pin"
            required
            autoFocus
            inputMode="numeric"
            pattern="[0-9]{4,8}"
            minLength={4}
            maxLength={8}
            placeholder="••••"
            autoComplete="off"
            className="rounded-2xl border-2 border-zinc-300 bg-white px-6 py-4 text-center text-4xl font-mono tracking-[0.5em] focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        {badPin ? (
          <p className="text-center text-sm text-red-600 dark:text-red-400" role="alert">
            That PIN is not right. Try again.
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 text-lg font-medium text-white hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          {hasPin ? 'Enter' : 'Set PIN & enter'}
        </button>

        <Link
          href="/town"
          className="text-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Back to playing
        </Link>
      </form>
    </main>
  );
}
