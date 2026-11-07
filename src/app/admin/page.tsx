// `/admin`: the deployment owner's view of who is here and whether it is healthy.
//
// Lives outside `(gated)` because that layout loads kid chrome this page does
// not want. requireSuperAdminPage must stay the first line, and no data may load
// until it returns true: everything after it reads across families with the
// secret key. Read-only on purpose.

import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSuperAdminPage } from '@/lib/auth/super-admin';
import { loadOverview } from '@/lib/admin/load';
import { timeAgo, type FamilyRow } from '@/lib/admin/overview';
import { signupMode, signupModeIsHeldBack } from '@/lib/auth/signup-mode';
import { signupTier } from '@/lib/auth/tier';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

function Tile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value.toLocaleString('en-US')}</p>
      {note ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{note}</p> : null}
    </div>
  );
}

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        aria-hidden
        className={ok ? 'font-bold text-emerald-700 dark:text-emerald-400' : 'font-bold text-amber-700 dark:text-amber-400'}
      >
        {ok ? '✓' : '!'}
      </span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="sr-only">{ok ? ' (OK)' : ' (needs attention)'}</span>
        <span className="block text-sm text-zinc-500 dark:text-zinc-400">{detail}</span>
      </span>
    </li>
  );
}

function FamilyRows({ family, now }: { family: FamilyRow; now: Date }) {
  return (
    <>
      <tr className="border-t border-zinc-200 align-top dark:border-zinc-800">
        <td className="py-3 pr-4">
          <span className="font-semibold">{family.name}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">{family.login ?? 'No login found'}</span>
        </td>
        <td className="py-3 pr-4">{family.tier}</td>
        <td className="whitespace-nowrap py-3 pr-4">{timeAgo(family.createdAt, now)}</td>
        <td className="whitespace-nowrap py-3 pr-4">{timeAgo(family.lastSignInAt, now)}</td>
        <td className="whitespace-nowrap py-3 pr-4">{timeAgo(family.lastActiveAt, now)}</td>
        <td className="py-3 pr-4 text-right tabular-nums">{family.kids.length}</td>
        <td className="py-3 pr-4 text-right tabular-nums">{family.rounds7d}</td>
        <td className="py-3 pr-4 text-right tabular-nums">{family.rounds}</td>
        <td className="py-3 text-right tabular-nums">{family.openTickets}</td>
      </tr>
      {family.kids.map((kid) => (
        <tr key={kid.id} className="text-zinc-600 dark:text-zinc-400">
          <td className="py-1 pl-4 pr-4" colSpan={2}>
            {kid.name}
            {kid.seenNow ? (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                In town now
              </span>
            ) : null}
            <span className="ml-2 text-xs">Grade {kid.grade}</span>
          </td>
          <td className="whitespace-nowrap py-1 pr-4 text-xs" colSpan={2}>
            Last round {timeAgo(kid.lastRoundAt, now)}
          </td>
          <td className="whitespace-nowrap py-1 pr-4 text-xs">Seen {timeAgo(kid.lastSeenAt, now)}</td>
          <td className="py-1 pr-4 text-right text-xs tabular-nums">{kid.balance} tokens</td>
          <td className="py-1 pr-4 text-right tabular-nums">{kid.rounds7d}</td>
          <td className="py-1 pr-4 text-right tabular-nums">{kid.rounds}</td>
          <td />
        </tr>
      ))}
    </>
  );
}

function PasswordGate({ failed }: { failed: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Gamecakes admin</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        This page shows every family. Enter your account password to open it for 15 minutes.
      </p>
      <form action="/api/admin/unlock" method="post" className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold">Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            aria-describedby={failed ? 'admin-password-error' : undefined}
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
        </label>
        {failed ? (
          <p id="admin-password-error" role="alert" className="text-sm text-red-700 dark:text-red-300">
            That password didn&rsquo;t match. Try again.
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-6 py-3 font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Open admin
        </button>
      </form>
    </main>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const unlocked = await requireSuperAdminPage();
  if (!unlocked) return <PasswordGate failed={(await searchParams).error === '1'} />;

  const now = new Date();
  const { totals, families, topGames30d, lastRoundAt, roundsLooksStuck } = await loadOverview(now);

  const mode = signupMode();
  const heldBack = signupModeIsHeldBack();
  const tier = signupTier();
  const aiOff = process.env.AI_ENABLED === 'false';
  const aiKeySet = !!process.env.OPENROUTER_API_KEY;
  const realtimeSet = !!process.env.REALTIME_TOPIC_SECRET;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  return (
    <main className="mx-auto w-full max-w-6xl p-4 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Gamecakes admin</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Read-only view across every family. Updated when you load the page.
          </p>
        </div>
        <Link
          href="/parent"
          className="inline-flex items-center rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Your family
        </Link>
      </header>

      {roundsLooksStuck ? (
        <p role="alert" className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Check recorded rounds.</strong> Kids were seen in the last 7 days, but the last round was{' '}
          {timeAgo(lastRoundAt, now)}. Either nobody is finishing a game or rounds have stopped saving.
        </p>
      ) : null}

      <section aria-labelledby="totals" className="mt-6">
        <h2 id="totals" className="sr-only">
          Totals
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Tile
            label="Families"
            value={totals.families}
            note={`${totals.newFamilies7d} new in 7 days, ${totals.familiesWithoutKids} with no kids`}
          />
          <Tile label="Kids" value={totals.kids} note={`${totals.seen7d} seen in 7 days`} />
          <Tile label="In town now" value={totals.seenNow} note="Position saved in the last 10 minutes" />
          <Tile label="Rounds, 7 days" value={totals.rounds7d} note={`${totals.rounds30d} in 30 days`} />
          <Tile label="Open tickets" value={totals.openTickets} note={`${totals.signIns7d} families signed in, 7 days`} />
        </div>
      </section>

      <section aria-labelledby="families" className="mt-8">
        <h2 id="families" className="text-lg font-semibold">
          Families and kids
        </h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Family</th>
                <th scope="col" className="py-2 pr-4 font-medium">Tier</th>
                <th scope="col" className="py-2 pr-4 font-medium">Joined</th>
                <th scope="col" className="py-2 pr-4 font-medium">Signed in</th>
                <th scope="col" className="py-2 pr-4 font-medium">Last active</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Kids</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Rounds, 7 days</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Rounds, all</th>
                <th scope="col" className="py-2 text-right font-medium">Open tickets</th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => (
                <FamilyRows key={family.id} family={family} now={now} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section aria-labelledby="health">
          <h2 id="health" className="text-lg font-semibold">
            Deployment settings
          </h2>
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            <Check
              ok={!heldBack}
              label={`Signup: ${mode}`}
              detail={heldBack ? 'Open signup is requested but held back by the default tier.' : `New families start on ${tier}.`}
            />
            <Check
              ok={mode !== 'open' || tier === 'restricted'}
              label={`Default tier: ${tier}`}
              detail="Strangers must land on restricted, so they cannot spend AI credit."
            />
            <Check
              ok={aiOff || aiKeySet}
              label={aiOff ? 'AI: switched off' : aiKeySet ? 'AI: on' : 'AI: no key set'}
              detail="Paid model calls. AI_ENABLED=false stops them all."
            />
            <Check
              ok={realtimeSet}
              label={realtimeSet ? 'Live updates: configured' : 'Live updates: not configured'}
              detail="REALTIME_TOPIC_SECRET, needed for live builds and family play."
            />
          </ul>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Build {commit ?? 'local'}. Check the Supabase plan and usage in its dashboard; this page cannot read them.
          </p>
        </section>

        <section aria-labelledby="games">
          <h2 id="games" className="text-lg font-semibold">
            Most played, 30 days
          </h2>
          {topGames30d.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">No rounds in the last 30 days.</p>
          ) : (
            <ol className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {topGames30d.map((game) => (
                <li key={game.slug} className="flex justify-between gap-4 py-2">
                  <span>{game.slug}</span>
                  <span className="tabular-nums">{game.rounds}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
