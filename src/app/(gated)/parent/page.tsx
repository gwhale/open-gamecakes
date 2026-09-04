// `/parent` — family-scoped kid picker.
//
// Previously this rendered the whole dashboard (sidebar + tabs for all
// kids at once), which was cramped on mobile. Now it mirrors `/kids`:
// a family headline + a big-tile grid of kids. Tapping a tile drills
// into `/parent/kid/[kidId]` for that kid's detailed view.
//
// Only fetches what the grid needs: kid rows + per-kid open-ticket
// counts. The detailed data (skills, attempts, observations, feedback)
// is fetched per-kid on the drill-down route.
//
// Double-gated: site cookie (outer layout) + parent-admin cookie (inner
// layout). Nothing extra here.

import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { requireCurrentFamily } from '@/lib/auth/family';
import { isGuest } from '@/lib/auth/guest';
import type { Kid, Feedback } from '@/lib/types';
import Glossary from '@/components/parent/Glossary';
import BuildVersion from '@/components/BuildVersion';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { coerceCupcakeConfig } from '@/lib/cupcake/config';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';

export default async function ParentFamilyPage() {
  const family = await requireCurrentFamily();
  const sb = supabaseServer();

  // Family-scoped queries — kids by family_id, feedback only for those kids.
  const [kidsRes, feedbackRes, tokensRes] = await Promise.all([
    sb.from('kids')
      .select('*')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true }),
    // We only need status + kid_id to compute "open ticket count per kid."
    // Subquery on kid_id-in-family keeps the count limited to current family.
    sb.from('feedback')
      .select('kid_id, status, kids!inner(family_id)')
      .eq('kids.family_id', family.id),
    // Per-kid Sugar Token balance for the at-a-glance 🪙 chip on each tile.
    sb.from('kid_tokens').select('kid_id, balance').eq('family_id', family.id),
  ]);

  if (kidsRes.error) throw new Error(`kids: ${kidsRes.error.message}`);

  const kids = ((kidsRes.data ?? []) as Kid[])
    .slice()
    // Real kids first, sandbox (Guest) last — matches /kids ordering.
    .sort((a, b) => Number(isGuest(a.id)) - Number(isGuest(b.id)));

  // "Open" = anything not already shipped or declined.
  const allFeedback = (feedbackRes.data ?? []) as Pick<Feedback, 'kid_id' | 'status'>[];
  const openByKid: Record<string, number> = {};
  for (const t of allFeedback) {
    if (t.status === 'done' || t.status === 'wontfix') continue;
    openByKid[t.kid_id] = (openByKid[t.kid_id] ?? 0) + 1;
  }

  const balanceByKid: Record<string, number> = {};
  for (const row of (tokensRes.data ?? []) as { kid_id: string; balance: number }[]) {
    balanceByKid[row.kid_id] = row.balance;
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-10 p-6 sm:gap-12 sm:p-10">
      <header className="flex w-full max-w-3xl items-center justify-between gap-3">
        <ChromeNavLink href="/town" variant="dark" size="sm">← Map</ChromeNavLink>
        <h1 className="flex-1 text-center text-3xl font-bold tracking-tight sm:text-4xl">
          {family.name}
        </h1>
        {/* Leave grown-up mode without signing the whole family out — hands the
            tablet back to the kids and re-locks /parent. */}
        <form action="/api/parent/lock" method="post">
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            🔒 Done
          </button>
        </form>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            Log out
          </button>
        </form>
        {/* Spacer kept for layout balance — empty string. */}
        <span aria-hidden className="invisible rounded-full px-3 py-1.5 text-xs">
          ← Map
        </span>
      </header>

      <p className="max-w-md text-center text-sm text-zinc-500">
        Pick a kid to see their learning progress, activity, and tickets.
      </p>

      {/* Family-level quick actions. Token Wallets is where a parent gifts
          coins to any kid — surfaced here so it's discoverable (previously it
          was only reachable by typing the URL). */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/parent/tokens"
          className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-5 py-2.5 text-sm font-bold text-amber-900 shadow-sm transition hover:bg-amber-200 active:scale-95 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <span aria-hidden>🪙</span>
          Give Sugar Tokens
        </Link>
        <Link
          href="/parent/gameplay"
          className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-5 py-2.5 text-sm font-bold text-rose-900 shadow-sm transition hover:bg-rose-200 active:scale-95 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <span aria-hidden>🎮</span>
          Gameplay
        </Link>
        <Link
          href="/parent/settings"
          className="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-5 py-2.5 text-sm font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-200 active:scale-95 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <span aria-hidden>✉️</span>
          Weekly email
        </Link>
      </div>

      {/* Build-version chip — quick sanity check on whether the iPad is
          showing the latest deploy or a stale PWA cache. Match this
          against the most recent GitHub commit SHA on master. */}
      <p className="text-[10px] text-zinc-400">
        gamecakes <BuildVersion showBranch />
      </p>

      <div className="w-full max-w-3xl"><Glossary /></div>

      <ul className="grid w-full max-w-3xl grid-cols-2 gap-6 sm:gap-10">
        {kids.map((kid) => {
          const openCount = openByKid[kid.id] ?? 0;
          const guest = isGuest(kid.id);
          return (
            <li key={kid.id}>
              <Link
                href={`/parent/kid/${kid.id}`}
                aria-label={`Open dashboard for ${kid.name}${
                  openCount > 0 ? ` (${openCount} open tickets)` : ''
                }`}
                className={`relative flex flex-col items-center gap-4 rounded-3xl border-2 border-transparent px-6 py-8 text-center transition-colors active:scale-95 sm:px-8 sm:py-10 ${
                  guest
                    ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900'
                    : 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800'
                }`}
                style={{ minWidth: 'var(--min-tap-target)', minHeight: 'var(--min-tap-target)' }}
              >
                {/* Open-ticket badge — preserved from the old sidebar UX. */}
                {openCount > 0 ? (
                  <span
                    className="absolute right-3 top-3 flex h-8 min-w-8 items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-bold text-white shadow-sm"
                    title={`${openCount} open ticket${openCount > 1 ? 's' : ''}`}
                  >
                    🎫 {openCount}
                  </span>
                ) : null}

                <CupcakeAvatar
                  config={coerceCupcakeConfig(kid.cupcake_config)}
                  size={96}
                />
                <span className="text-2xl font-medium">{kid.name}</span>
                {guest ? (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
                    Sandbox
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold tabular-nums text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                    🪙 {balanceByKid[kid.id] ?? 0}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
