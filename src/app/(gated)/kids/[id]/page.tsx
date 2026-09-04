// `/kids/[id]` — PIN entry for a specific kid.
//
// Reached by tapping a kid's avatar on /kids IF the kid has a non-null PIN.
// If the kid has no PIN, /kids' avatar form POSTs directly to
// /api/kids/select and this page is never reached.
//
// The page fetches the kid row (to render the name/avatar and confirm the
// kid exists), then renders a form-only PIN entry UI. Submitting POSTs to
// /api/kids/select with the kidId + pin; the route handler validates and
// either sets the active-kid cookie or bounces back with an error.
//
// Why server-component + HTML form and not a client component: zero JS,
// zero hydration, kids on a slow iPad get an instantly-interactive page.
// The only downside is no "shake" animation on wrong PIN, which we don't
// need — the error message at the top is enough feedback.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import type { Kid } from '@/lib/types';

export default async function KidPinPage({
  params,
  searchParams,
}: {
  // Next 16: params AND searchParams are both Promises.
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;

  const { data: kid, error: dbErr } = await supabaseServer()
    .from('kids')
    .select('id, name, avatar, pin')
    .eq('id', id)
    .maybeSingle();

  if (dbErr) throw new Error(`kid load failed: ${dbErr.message}`);
  if (!kid) notFound();

  // If this kid has no PIN, don't make them enter one — bounce to /kids
  // which will POST directly. This also protects against deep-linking to
  // the PIN page for a kid who doesn't need one.
  if (!kid.pin) {
    const { redirect } = await import('next/navigation');
    redirect('/kids');
  }

  const typed = kid as Pick<Kid, 'id' | 'name' | 'avatar' | 'pin'>;

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <div className="text-8xl" aria-hidden>{typed.avatar}</div>
        <h1 className="mt-4 text-3xl font-semibold">Hi, {typed.name}!</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Type your PIN to play.</p>
      </div>

      <form action="/api/kids/select" method="post" className="flex w-full max-w-xs flex-col gap-4">
        <input type="hidden" name="kidId" value={typed.id} />
        <label className="flex flex-col gap-2">
          <span className="sr-only">PIN</span>
          <input
            type="password"
            name="pin"
            required
            autoFocus
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            placeholder="••••"
            autoComplete="off"
            className="rounded-2xl border-2 border-zinc-300 bg-white px-6 py-4 text-center text-4xl font-mono tracking-[0.5em] focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        {error ? (
          <p className="text-center text-sm text-red-600 dark:text-red-400" role="alert">
            {error === 'bad_pin' ? 'That PIN is not right. Try again.' : 'Something went wrong.'}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 text-lg font-medium text-white hover:bg-zinc-800 active:scale-[0.98] dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Play
        </button>

        <Link href="/kids" className="text-center text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          ← Pick someone else
        </Link>
      </form>
    </main>
  );
}
