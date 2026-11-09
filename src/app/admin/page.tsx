// `/admin`: the deployment owner's view of who is here and whether it is healthy.
//
// Lives outside `(gated)` because that layout loads kid chrome this page does
// not want. requireSuperAdminPage must stay the first line, and no data may load
// until it returns true: everything after it reads across families with the
// secret key. The only things that change data are the resets in FamilyActions,
// CommunitiesPanel and the password form, each behind its own operator check and
// recorded in admin_actions.

import type { Metadata } from 'next';
import { requireSuperAdminPage } from '@/lib/auth/super-admin';
import {
  ADMIN_TICKET_LIMIT,
  loadAdminActions,
  loadCommunities,
  loadDecisions,
  loadOverview,
  loadTickets,
} from '@/lib/admin/load';
import DecisionsPanel from './DecisionsPanel';
import { isOpenTicket } from '@/lib/admin/tickets';
import TicketsPanel, { type TicketView } from './TicketsPanel';
import { missingSettings } from '@/lib/admin/decisions';
import { adminRecipients } from '@/lib/admin/notify';
import { timeAgo, type FamilyRow } from '@/lib/admin/overview';
import { signupMode, signupModeIsHeldBack } from '@/lib/auth/signup-mode';
import { signupTier } from '@/lib/auth/tier';
import { emailConfigured } from '@/lib/email/send';
import CommunitiesPanel from './CommunitiesPanel';
import FamilyActions from './FamilyActions';
import UsageSection from './UsageSection';
import AdminNav, { type AdminNavItem } from './AdminNav';

/** Every nav target: spaced, and offset so the phone tab bar or the top of the
 *  window does not cover its heading when the nav jumps to it. */
const SECTION = 'mt-10 scroll-mt-32 lg:scroll-mt-6';
const H2 = 'text-xl font-semibold';

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
          <FamilyActions familyId={family.id} familyName={family.name} />
        </td>
        <td className="py-3 pr-4">
          {family.mainEmail ? (
            <>
              <a href={`mailto:${family.mainEmail}`} className="break-all font-medium underline">
                {family.mainEmail}
              </a>
              {family.mainEmailSource === 'account' ? (
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">From their account</span>
              ) : family.mainEmailSource === 'digest' ? (
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">From the weekly digest list</span>
              ) : null}
            </>
          ) : (
            <span className="text-xs text-amber-800 dark:text-amber-300">None on file</span>
          )}
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
          <td className="py-1 pl-4 pr-4" colSpan={3}>
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
  searchParams: Promise<{ error?: string; password?: string }>;
}) {
  const unlocked = await requireSuperAdminPage();
  const { error, password: passwordState } = await searchParams;
  if (!unlocked) return <PasswordGate failed={error === '1'} />;

  const now = new Date();
  const [
    { totals, families, activity, topGames30d, lastRoundAt, roundsLooksStuck, usage },
    adminActions,
    communities,
    ticketRows,
    decisionRows,
  ] = await Promise.all([loadOverview(now), loadAdminActions(), loadCommunities(), loadTickets(), loadDecisions()]);
  const decisions = decisionRows.map((d) => ({ ...d, answeredAgo: d.answered_at ? timeAgo(d.answered_at, now) : null }));
  const openDecisions = decisions.filter((d) => d.status === 'open').length;
  const settingsMissing = missingSettings();
  const kidHome = new Map(families.flatMap((f) => f.kids.map((k) => [k.id, { kid: k.name, family: f.name, familyId: f.id }])));
  const tickets: TicketView[] = ticketRows.map((t) => {
    const home = kidHome.get(t.kid_id);
    return {
      id: t.id,
      family: (t.family_id && families.find((f) => f.id === t.family_id)?.name) || home?.family || 'Unknown family',
      kid: home?.kid ?? 'a removed kid',
      game: t.game_slug,
      type: t.ticket_type,
      title: t.title,
      summary: t.summary,
      transcript: t.raw_transcript,
      shipNote: t.ship_note,
      status: t.status,
      age: timeAgo(t.created_at, now),
    };
  });
  const familyName = (id: string) => families.find((family) => family.id === id)?.name ?? 'a deleted family';
  const describeAction = ({ family_id, detail }: { family_id: string | null; detail: string | null }) => {
    if (family_id && detail) return `${familyName(family_id)} (${detail})`;
    if (family_id) return familyName(family_id);
    return detail ?? 'your own login';
  };
  const alertsOn = emailConfigured() && adminRecipients().length > 0;
  const dailyOn = alertsOn && !!process.env.CRON_SECRET;

  const mode = signupMode();
  const heldBack = signupModeIsHeldBack();
  const tier = signupTier();
  const aiOff = process.env.AI_ENABLED === 'false';
  const aiKeySet = !!process.env.OPENROUTER_API_KEY;
  const realtimeSet = !!process.env.REALTIME_TOPIC_SECRET;
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7);

  const familyEmails = [...new Set(families.map((f) => f.mainEmail).filter((e): e is string => !!e))];
  const settingsNeedingAttention = [
    !heldBack,
    mode !== 'open' || tier === 'restricted',
    aiOff || aiKeySet,
    realtimeSet,
    alertsOn,
    dailyOn,
  ].filter((ok) => !ok).length;
  const navItems: AdminNavItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'decisions', label: 'Decisions', badge: openDecisions + settingsMissing.length },
    { id: 'tickets', label: 'Tickets', badge: tickets.filter((t) => isOpenTicket(t.status)).length },
    { id: 'usage', label: 'Usage' },
    { id: 'families', label: 'Families', badge: totals.families },
    { id: 'communities', label: 'Communities', badge: communities.length },
    { id: 'activity', label: 'Activity' },
    { id: 'system', label: 'System', badge: settingsNeedingAttention },
    { id: 'changes', label: 'Your changes' },
    { id: 'account', label: 'Account' },
  ];

  return (
    <div className="flex flex-1 flex-col select-text bg-zinc-50 lg:flex-row dark:bg-black">
      <AdminNav items={navItems} build={commit ?? 'local'} />
    <main className="min-w-0 flex-1 px-4 pb-16 sm:px-8">
     <div className="mx-auto max-w-6xl">
      <section id="overview" aria-labelledby="overview-title" className="scroll-mt-32 pt-6 lg:scroll-mt-6 lg:pt-8">
        <h1 id="overview-title" className="text-2xl font-bold sm:text-3xl">
          Overview
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Every family, and the tools to help them. Updated when you load the page.
        </p>
        {openDecisions + settingsMissing.length > 0 ? (
          <a
            href="#decisions"
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-rose-50 p-4 text-sm text-rose-950 dark:bg-rose-950/40 dark:text-rose-100"
          >
            <span>
              <strong>{openDecisions + settingsMissing.length} waiting on you:</strong>{' '}
              {openDecisions} {openDecisions === 1 ? 'decision' : 'decisions'}, {settingsMissing.length} Vercel{' '}
              {settingsMissing.length === 1 ? 'setting' : 'settings'}.
            </span>
            <span className="font-semibold underline">Go to Decisions</span>
          </a>
        ) : null}

      {roundsLooksStuck ? (
        <p role="alert" className="mt-6 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
          <strong>Check recorded rounds.</strong> Kids were seen in the last 7 days, but the last round was{' '}
          {timeAgo(lastRoundAt, now)}. Either nobody is finishing a game or rounds have stopped saving.
        </p>
      ) : null}

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
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

      <section id="decisions" aria-labelledby="decisions-title" className={SECTION}>
        <h2 id="decisions-title" className={H2}>
          Decisions
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Calls only you can make. Tap an answer to save it; Claude sessions read it from here.
        </p>
        <DecisionsPanel decisions={decisions} />
        {settingsMissing.length > 0 ? (
          <details className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <summary className="cursor-pointer font-semibold">
              Vercel settings to add ({settingsMissing.length})
            </summary>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Production environment, then redeploy. Each one drops off this list once it is set.
            </p>
            <ol className="mt-2 divide-y divide-amber-200 dark:divide-amber-900">
              {settingsMissing.map((setting) => (
                <li key={setting.name} className="py-2 text-sm">
                  <code className="font-semibold">{setting.name}</code>
                  <p>{setting.why}</p>
                  <p className="text-zinc-600 dark:text-zinc-400">Value: {setting.value}</p>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </section>

      <section id="tickets" aria-labelledby="tickets-title" className={SECTION}>
        <h2 id="tickets-title" className={H2}>
          Tickets
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Every family&rsquo;s bug reports and ideas, newest first. Changing a status here is recorded under Your
          changes.
        </p>
        <TicketsPanel tickets={tickets} capped={ticketRows.length >= ADMIN_TICKET_LIMIT} />
      </section>

      <UsageSection usage={usage} />

      <section id="families" aria-labelledby="families-title" className={SECTION}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="families-title" className={H2}>
            Families and kids
          </h2>
          {familyEmails.length > 0 ? (
            <a
              href={`mailto:?bcc=${familyEmails.map(encodeURIComponent).join(',')}`}
              className="text-sm font-medium underline"
            >
              Email every family ({familyEmails.length}, as BCC)
            </a>
          ) : null}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-xs text-zinc-500 dark:text-zinc-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Family</th>
                <th scope="col" className="py-2 pr-4 font-medium">Email</th>
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

      <section id="communities" aria-labelledby="communities-title" className={SECTION}>
        <h2 id="communities-title" className={H2}>
          Communities
        </h2>
        <CommunitiesPanel
          communities={communities}
          families={families.map((family) => ({ id: family.id, name: family.name }))}
        />
      </section>

      <section id="activity" aria-labelledby="activity-title" className={SECTION}>
        <h2 id="activity-title" className={H2}>
          Recent activity
        </h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nothing in the last 30 days.</p>
        ) : (
          <ol className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {activity.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex flex-wrap justify-between gap-x-4 py-2">
                <span>
                  <span className="font-medium">{event.family}</span>: {event.text}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">{timeAgo(event.at, now)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div id="system" className={`${SECTION} grid gap-8 md:grid-cols-2`}>
        <section aria-labelledby="health">
          <h2 id="health" className={H2}>
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
            <Check
              ok={alertsOn}
              label={alertsOn ? 'New-family emails: on' : 'New-family emails: off'}
              detail="Needs ADMIN_NOTIFY_EMAIL, RESEND_API_KEY and DIGEST_FROM."
            />
            <Check
              ok={dailyOn}
              label={dailyOn ? 'Daily summary: on' : 'Daily summary: off'}
              detail="The same three, plus CRON_SECRET. A quiet day sends nothing."
            />
          </ul>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Build {commit ?? 'local'}. Check the Supabase plan and usage in its dashboard; this page cannot read them.
          </p>
        </section>

        <section aria-labelledby="games">
          <h2 id="games" className={H2}>
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

      <div className={`${SECTION} grid gap-8 md:grid-cols-2`}>
        <section id="changes" aria-labelledby="actions" className="scroll-mt-32 lg:scroll-mt-6">
          <h2 id="actions" className={H2}>
            What you changed
          </h2>
          {adminActions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Nothing yet.</p>
          ) : (
            <ol className="mt-2 divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              {adminActions.map((action) => (
                <li key={action.id} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span>
                    {action.action}: {describeAction(action)}
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-400">{timeAgo(action.created_at, now)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id="account" aria-labelledby="own-password" className="scroll-mt-32 lg:scroll-mt-6">
          <h2 id="own-password" className={H2}>
            Your admin password
          </h2>
          <form action="/api/admin/password" method="post" className="mt-2 flex flex-col gap-3">
            <label className="flex flex-col gap-2">
              <span className="text-sm">New password, at least 12 characters</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                minLength={12}
                required
                className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                style={{ minHeight: 'var(--min-tap-target)' }}
              />
            </label>
            {passwordState === 'changed' ? <p role="status" className="text-sm">Password changed.</p> : null}
            {passwordState === 'short' ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">Use at least 12 characters.</p>
            ) : null}
            {passwordState === 'failed' ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">That did not save. Try again.</p>
            ) : null}
            <button
              type="submit"
              className="self-start rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              Change password
            </button>
          </form>
        </section>
      </div>
     </div>
    </main>
    </div>
  );
}
