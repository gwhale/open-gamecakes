// `/login` — family-name + password login.
//
// The kid-facing UI says "Family login" instead of "Email" — under the
// hood the slug is mapped to a synthetic Supabase email
// (see src/lib/auth/login-name.ts). Magic-link mail is no longer used.

import Link from 'next/link';
import GamecakesLogo from '@/components/GamecakesLogo';
import { guestPlayableGames } from '@/lib/games/guest-mounts';
import { signupMode } from '@/lib/auth/signup-mode';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  // Counted, not written down. /open carries a comment about having shipped a
  // hardcoded game count that had drifted from the build; there is no reason to
  // repeat that here when the list is one call away. The mount table is all
  // lazy `() => import()` thunks, so this costs a filter, not a bundle.
  const guestCount = guestPlayableGames().length;

  // Asked, not assumed. This page promised an invite code for months after
  // open signup went live, because the sentence was written once and signup
  // moved underneath it. signupMode() is the same call /signup branches on —
  // including its interlock, so a deployment configured the dangerous way is
  // described here exactly as it behaves, and the open-source cut (which
  // defaults to invite) reads correctly with no change.
  const mode = signupMode();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60 dark:opacity-30"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 20% 20%, #fecdd3 0%, transparent 60%), ' +
            'radial-gradient(ellipse 60% 40% at 80% 30%, #fde68a 0%, transparent 60%), ' +
            'radial-gradient(ellipse 70% 50% at 50% 90%, #bbf7d0 0%, transparent 60%)',
        }}
      />

      <div className="flex flex-col items-center text-center">
        <GamecakesLogo size={84} showTagline wordmarkGradient />
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Welcome back!</h1>
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
            placeholder="shackleton"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 lowercase focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
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
            {decodeURIComponent(error)}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-full bg-gradient-to-r from-rose-400 to-rose-500 px-6 py-3 text-lg font-semibold text-white shadow-md hover:from-rose-500 hover:to-rose-600 active:scale-[0.98]"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Log in
        </button>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          New family?{' '}
          <a href="/signup" className="font-semibold underline">
            {/* "Make an account" is what /play already calls this, so a visitor
                who arrives by that route meets the same words twice. */}
            {mode === 'open' ? 'Make an account' : 'Sign up with an invite code'}
          </a>
        </p>
      </form>

      {/* The way out for someone who has no account and no reason to want one
          yet. This page is the whole of gamecakes.org to a visitor — `/` is
          inside the (gated) group and redirects here — so without this it is a
          door that only opens for a family that already exists.

          The arcade needs nothing from them: no account, no password, nothing
          saved. /play closes the loop on its own ("Make an account" → /signup,
          "What is this?" → /open), so one link out is the whole flow.

          /play stays noindex (see its metadata). Reachable from the front door
          is not the same as found by search — it still spreads by being shared,
          which is what keeps the asset bandwidth proportional. */}
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
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
