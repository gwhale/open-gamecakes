// /parent/builds — every road and building the family's kids have placed in
// the town, newest first, with a Remove button on each.
//
// A grown-up removal refunds the builder exactly as their own removal would
// (half, or all of it inside the undo window), so tidying up never costs a kid
// more than taking it down themselves. Removal posts a plain form to
// /api/parent/builds/remove, which re-checks grown-up mode and the family.
//
// Auth: the parent layout already requires grown-up mode.

import { supabaseServer } from '@/lib/supabase/server';
import { requireCurrentFamily } from '@/lib/auth/family';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { formatLedgerDate } from '@/lib/tokens/reason-labels';
import { findBuild, isBuildKind } from '@/lib/town/builds';

interface BuildRow {
  id: string;
  kid_id: string;
  kind: string;
  cost_paid: number;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ParentBuildsPage(props: PageProps): Promise<React.ReactElement> {
  const family = await requireCurrentFamily();
  const sb = supabaseServer();
  const params = await props.searchParams;
  const removed = typeof params.removed === 'string';
  const failed = typeof params.error === 'string';

  const [kidsRes, buildsRes] = await Promise.all([
    sb.from('kids').select('id, name').eq('family_id', family.id),
    sb.from('town_builds')
      .select('id, kid_id, kind, cost_paid, created_at')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false }),
  ]);
  const nameOf = new Map(((kidsRes.data ?? []) as { id: string; name: string }[]).map((k) => [k.id, k.name]));
  const builds = (buildsRes.data ?? []) as BuildRow[];

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6 sm:gap-10 sm:p-10">
      <header className="flex w-full max-w-3xl items-center justify-between gap-3">
        <ChromeNavLink href="/parent" variant="dark" size="sm">← Grown-ups</ChromeNavLink>
        <h1 className="flex-1 text-center text-2xl font-bold tracking-tight sm:text-3xl">🔨 Town builds</h1>
        <span aria-hidden className="invisible rounded-full px-3 py-1.5 text-xs">
          ← Grown-ups
        </span>
      </header>

      {removed ? (
        <div role="status" className="rounded-full bg-emerald-100 px-5 py-2 text-sm font-semibold text-emerald-900">
          Removed. The builder got their refund.
        </div>
      ) : null}
      {failed ? (
        <div role="alert" className="rounded-full bg-rose-100 px-5 py-2 text-sm font-semibold text-rose-900">
          That did not save. Try again in a moment.
        </div>
      ) : null}

      {builds.length === 0 ? (
        <p className="max-w-xl text-center text-zinc-600 dark:text-zinc-400">
          Nothing built yet. Kids build roads and small buildings in the town with the 🔨 button.
        </p>
      ) : (
        <ul className="flex w-full max-w-3xl flex-col gap-2">
          {builds.map((b) => {
            const info = isBuildKind(b.kind) ? findBuild(b.kind) : null;
            return (
              <li
                key={b.id}
                className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="text-2xl" aria-hidden>
                  {info?.glyph ?? '·'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-bold">{info?.label ?? b.kind}</div>
                  <div className="text-xs text-zinc-500">
                    {nameOf.get(b.kid_id) ?? 'A player'} · {formatLedgerDate(b.created_at)} · {b.cost_paid} 🪙
                  </div>
                </div>
                <form action="/api/parent/builds/remove" method="post">
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-rose-100 px-4 py-2 text-sm font-bold text-rose-900 transition hover:bg-rose-200 active:scale-95 dark:bg-rose-950 dark:text-rose-200"
                    style={{ minHeight: 'var(--min-tap-target)' }}
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
