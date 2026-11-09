// `/admin/login`: where the operator signs in. Family logins use /login.
//
// Nothing links here. A deployment with no operator answers 404.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { parseSuperAdminIds } from '@/lib/auth/super-admin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin sign-in',
  robots: { index: false, follow: false },
};

const inputClass =
  'rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900';

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; entries?: string; ids?: string }>;
}) {
  if (parseSuperAdminIds(process.env.SUPER_ADMIN_USER_IDS).size === 0) notFound();
  const { error, entries, ids } = await searchParams;
  const failed = error === '1';
  // Anyone can type these into the URL, so they stay two small numbers. This must
  // never print a value to paste: a crafted link could name an attacker's id.
  const unlisted = error === 'unlisted';
  const count = (value?: string) => (value && /^\d{1,3}$/.test(value) ? value : '?');

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Gamecakes admin</h1>
      <form action="/api/admin/login" method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Admin login</span>
          <input
            type="text"
            name="login"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            autoFocus
            className={`${inputClass} lowercase`}
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className={inputClass}
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>
        {failed ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            That login or password didn&rsquo;t work.
          </p>
        ) : null}
        {unlisted ? (
          <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
            Your password is right, but <code>SUPER_ADMIN_USER_IDS</code> does not list this login. It
            holds {count(entries)} {count(entries) === '1' ? 'entry' : 'entries'}, and {count(ids)} of
            them look like a user id. It takes this login&rsquo;s user id, not a password. Fix the
            value, then redeploy.
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
