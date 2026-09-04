// `/signup` — closed-beta signup gated by an invite code.
//
// Flow:
//   1. Parent enters invite code + family login + password + family
//      display name + parent consent
//   2. POST /api/auth/signup validates the code, creates the auth user
//      (synthetic email + password), claims/creates the family, marks
//      the code redeemed, signs the user in via signInWithPassword to
//      set the session cookies, and redirects to /parent
//
// COPPA: explicit parent consent is required at signup. Kids are added
// via the parent dashboard after first login.

import GamecakesLogo from '@/components/GamecakesLogo';

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}) {
  const { code: prefillCode, error } = await searchParams;

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
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Join the beta!</h1>
        <p className="mt-1 text-sm italic text-zinc-500 dark:text-zinc-400">
          closed beta — invite required
        </p>
      </div>

      <form
        action="/api/auth/signup"
        method="post"
        className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white/90 p-6 shadow-xl backdrop-blur-sm dark:bg-zinc-900/90"
      >
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Invite code
          </span>
          <input
            type="text"
            name="code"
            defaultValue={prefillCode ?? ''}
            placeholder="CAKE-XXXXXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 text-center font-mono text-lg tracking-widest focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

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
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 lowercase focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            3–20 lowercase letters, numbers, or hyphens. This is what you&rsquo;ll type to log in.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Password
          </span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={6}
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Family name
          </span>
          <input
            type="text"
            name="family_name"
            placeholder="The Smiths"
            autoComplete="off"
            maxLength={60}
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>

        {/* COPPA-compliant parent consent. Required by spec for any kid app. */}
        <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
          <input
            type="checkbox"
            name="parent_consent"
            required
            className="mt-1 h-5 w-5 rounded border-zinc-400"
          />
          <span className="text-zinc-700 dark:text-zinc-300">
            I am the parent or legal guardian. I consent to my child using
            Gamecakes and understand their progress will be saved under my
            account.
          </span>
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
          Create my family
        </button>

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          Already have an account? <a href="/login" className="font-semibold underline">Log in</a>
        </p>
      </form>
    </main>
  );
}
