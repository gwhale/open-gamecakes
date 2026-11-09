// `/login` — family-name + password login.
//
// The kid-facing UI says "Family login" instead of "Email" — under the
// hood the slug is mapped to a synthetic Supabase email
// (see src/lib/auth/login-name.ts). Magic-link mail is no longer used.

import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';
import AttractTown from '@/components/login/AttractTown';
import SupportLine from '@/components/SupportLine';
import { guestPlayableGames } from '@/lib/games/guest-mounts';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; login?: string }>;
}) {
  const { error, login: prefillLogin } = await searchParams;

  // Counted, not written down. /open carries a comment about having shipped a
  // hardcoded game count that had drifted from the build; there is no reason to
  // repeat that here when the list is one call away. The mount table is all
  // lazy `() => import()` thunks, so this costs a filter, not a bundle.
  const guestCount = guestPlayableGames().length;

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden p-4 sm:p-8">
      {/* Gamecakes City itself, in attract mode: the real town engine with the
          drone camera circling while the cupcake strolls and Cakey wanders.
          The CSS shore shows first and stays as the fallback. Every piece of
          text below sits on its own card, so the scene cannot hurt contrast.
          See components/login/AttractTown. */}
      <AttractTown />

      <div className="flex w-full max-w-sm flex-col items-center rounded-3xl bg-white/90 p-5 text-center shadow-xl backdrop-blur-sm dark:bg-zinc-900/90">
        <GamecakesLogo size={84} showTagline wordmarkGradient />
        <h1 className="mt-4 font-display text-3xl font-bold tracking-tight">Log in to your family</h1>
      </div>

      <form
        action="/api/auth/login"
        method="post"
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:bg-zinc-900/90"
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Family login
          </span>
          <input
            type="text"
            name="login"
            placeholder="the-smiths"
            defaultValue={prefillLogin ?? ''}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 lowercase focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            The login you chose at signup, not your family&rsquo;s name.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Password
          </span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        {error ? (
          <p
            className="rounded-lg bg-red-50 p-3 text-center text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-3 text-lg font-semibold text-white shadow-md hover:from-rose-500 hover:to-rose-600 active:scale-[0.98]"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Log in
        </button>

        {/* The same words whichever way signup is configured. /signup asks for
            an invite code itself on a deployment that requires one. */}
        <Link
          href="/signup"
          className="flex items-center justify-center rounded-full border-2 border-rose-600 bg-white px-6 py-3 text-lg font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-rose-700 active:scale-[0.98] dark:border-rose-400 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-zinc-800"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Start a new family
        </Link>

        <SupportLine lostThing="password" />
      </form>

      {/* The way out for someone who has no account and no reason to want one
          yet. This page is the whole of gamecakes.org to a visitor — `/` is
          inside the (gated) group and redirects here — so without this it is a
          door that only opens for a family that already exists.

          The arcade needs nothing from them: no account, no password, nothing
          saved. /play closes the loop on its own ("Make an account" → /signup,
          "What is this?" → /about), so one link out is the whole flow.

          /play stays noindex (see its metadata). Reachable from the front door
          is not the same as found by search — it still spreads by being shared,
          which is what keeps the asset bandwidth proportional. */}
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl bg-white/90 p-5 shadow-xl backdrop-blur-sm dark:bg-zinc-900/90">
        <div className="flex w-full items-center gap-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
          or
          <span className="h-px flex-1 bg-zinc-300 dark:bg-zinc-700" />
        </div>

        <Link
          href="/play"
          className="flex w-full items-center justify-center rounded-full bg-white/90 px-6 py-3 text-lg font-semibold text-rose-600 shadow-md backdrop-blur-sm hover:bg-white active:scale-[0.98] dark:bg-zinc-900/90 dark:text-rose-400 dark:hover:bg-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Play {guestCount} games — no account
        </Link>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Nothing to sign up for, nothing saved. Just have a go.
        </p>
      </div>
    </main>
  );
}
