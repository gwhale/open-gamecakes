// `/login` — family-name + password login.
//
// The kid-facing UI says "Family login" instead of "Email" — under the
// hood the slug is mapped to a synthetic Supabase email
// (see src/lib/auth/login-name.ts). Magic-link mail is no longer used.

import GamecakesLogo from '@/components/GamecakesLogo';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
          New family? <a href="/signup" className="font-semibold underline">Sign up with an invite code</a>
        </p>
      </form>
    </main>
  );
}
