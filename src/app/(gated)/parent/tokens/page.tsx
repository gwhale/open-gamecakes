// /parent/tokens — token wallet admin per kid.
//
// Per-kid panel: avatar + name, big current balance, lifetime
// earned / spent counters, last 10 ledger entries, and a grant form
// for crediting tokens manually. Useful for: gifting on a birthday,
// recovering from a lost session where the kid earned tokens but
// the POST failed, or seeding a new kid before they've played
// enough to earn organically.
//
// Auth: piggybacks on the (gated) layout (requires logged-in
// parent + family). The grant form posts to
// /api/parent/tokens/grant which re-checks family ownership of
// the target kid.

import { supabaseServer } from '@/lib/supabase/server';
import { requireCurrentFamily } from '@/lib/auth/family';
import { isGuest } from '@/lib/auth/guest';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { coerceCupcakeConfig } from '@/lib/cupcake/config';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import { reasonEmoji, reasonLabel, formatLedgerDate } from '@/lib/tokens/reason-labels';

interface KidRow {
  id: string;
  name: string;
  avatar: string;
  cupcake_config: unknown;
}

interface WalletRow {
  kid_id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
}

interface TransactionRow {
  id: string;
  kid_id: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function takeTransactionNote(metadata: Record<string, unknown> | null): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const note = metadata.note;
  return typeof note === 'string' && note.length > 0 ? note : null;
}

export default async function ParentTokensPage(props: PageProps): Promise<React.ReactElement> {
  const family = await requireCurrentFamily();
  const sb = supabaseServer();
  const params = await props.searchParams;

  const grantedAmount = typeof params.granted === 'string' ? params.granted : null;
  const removedAmount = typeof params.removed === 'string' ? params.removed : null;
  const errorCode = typeof params.error === 'string' ? params.error : null;

  const [kidsRes, walletsRes, txRes] = await Promise.all([
    sb.from('kids')
      .select('id, name, avatar, cupcake_config')
      .eq('family_id', family.id)
      .order('created_at', { ascending: true }),
    sb.from('kid_tokens')
      .select('kid_id, balance, total_earned, total_spent')
      .eq('family_id', family.id),
    sb.from('token_transactions')
      .select('id, kid_id, delta, reason, metadata, created_at')
      .eq('family_id', family.id)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);

  const kids = ((kidsRes.data ?? []) as KidRow[])
    .slice()
    .sort((a, b) => Number(isGuest(a.id)) - Number(isGuest(b.id)));

  const walletByKid = new Map<string, WalletRow>();
  for (const w of (walletsRes.data ?? []) as WalletRow[]) {
    walletByKid.set(w.kid_id, w);
  }

  const txByKid = new Map<string, TransactionRow[]>();
  for (const t of (txRes.data ?? []) as TransactionRow[]) {
    const list = txByKid.get(t.kid_id) ?? [];
    if (list.length < 10) list.push(t);
    txByKid.set(t.kid_id, list);
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-8 p-6 sm:gap-10 sm:p-10">
      <header className="flex w-full max-w-3xl items-center justify-between gap-3">
        <ChromeNavLink href="/parent" variant="dark" size="sm">← Family</ChromeNavLink>
        <h1 className="flex-1 text-center text-2xl font-bold tracking-tight sm:text-3xl">
          🪙 Sugar Tokens
        </h1>
        <span aria-hidden className="invisible rounded-full px-3 py-1.5 text-xs">
          ← Family
        </span>
      </header>

      {/* Form-redirect feedback. Both states clear on next navigation. */}
      {grantedAmount ? (
        <div
          role="status"
          className="rounded-full bg-emerald-100 px-5 py-2 text-sm font-semibold text-emerald-900"
        >
          Added {grantedAmount} 🪙 — saved to the ledger.
        </div>
      ) : null}
      {removedAmount ? (
        <div
          role="status"
          className="rounded-full bg-amber-100 px-5 py-2 text-sm font-semibold text-amber-900"
        >
          Removed {removedAmount} 🪙 — saved to the ledger.
        </div>
      ) : null}
      {errorCode ? (
        <div
          role="alert"
          className="rounded-full bg-rose-100 px-5 py-2 text-sm font-semibold text-rose-900"
        >
          Couldn&rsquo;t grant tokens: {errorCode.replace(/_/g, ' ')}
        </div>
      ) : null}

      <ul className="flex w-full max-w-3xl flex-col gap-6">
        {kids.map((kid) => {
          const wallet = walletByKid.get(kid.id);
          const balance = wallet?.balance ?? 0;
          const totalEarned = wallet?.total_earned ?? 0;
          const totalSpent = wallet?.total_spent ?? 0;
          const transactions = txByKid.get(kid.id) ?? [];
          const guest = isGuest(kid.id);

          return (
            <li
              key={kid.id}
              className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center gap-4">
                <CupcakeAvatar
                  config={coerceCupcakeConfig(kid.cupcake_config)}
                  size={56}
                />
                <div className="flex-1">
                  <h2 className="text-xl font-bold">
                    {kid.name}
                    {guest ? (
                      <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        sandbox
                      </span>
                    ) : null}
                  </h2>
                  <div className="mt-1 flex items-baseline gap-3">
                    <span className="text-3xl font-bold text-amber-700 dark:text-amber-300">
                      🪙 <span className="font-mono tabular-nums">{balance}</span>
                    </span>
                    <span className="text-xs text-zinc-500">
                      earned <span className="font-mono">{totalEarned}</span>
                      {' · '}
                      spent <span className="font-mono">{totalSpent}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Grant form. Disabled for the guest sandbox since guest
                  doesn't have a real wallet — the route would 404 the
                  kid scope check. */}
              {guest ? (
                <p className="mt-4 text-xs text-zinc-500">
                  Sandbox profile — wallet operations are disabled.
                </p>
              ) : (
                <form
                  action="/api/parent/tokens/grant"
                  method="post"
                  className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/50"
                >
                  <input type="hidden" name="kidId" value={kid.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Amount
                    </span>
                    <input
                      type="number"
                      name="delta"
                      min={1}
                      max={100}
                      defaultValue={5}
                      required
                      className="w-24 rounded-lg border border-zinc-300 px-3 py-2 font-mono tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      Note (optional)
                    </span>
                    <input
                      type="text"
                      name="note"
                      maxLength={200}
                      placeholder="birthday, lost session, etc."
                      className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                    />
                  </label>
                  {/* Two submit buttons post the same form with action=add|remove
                      (the clicked button's name/value is what's submitted). */}
                  <button
                    type="submit"
                    name="action"
                    value="add"
                    className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-95 hover:bg-emerald-700"
                    style={{ minHeight: 'var(--min-tap-target)' }}
                  >
                    + Add 🪙
                  </button>
                  <button
                    type="submit"
                    name="action"
                    value="remove"
                    disabled={balance <= 0}
                    className="rounded-full border border-rose-300 bg-white px-5 py-2.5 text-sm font-bold text-rose-700 shadow-sm transition active:scale-95 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    style={{ minHeight: 'var(--min-tap-target)' }}
                  >
                    − Remove 🪙
                  </button>
                </form>
              )}

              {/* Recent ledger — last 10 entries for this kid. Reads
                  bottom-up; newest at top. */}
              {transactions.length > 0 ? (
                <div className="mt-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Recent
                  </h3>
                  <ul className="mt-2 divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                    {transactions.map((tx) => {
                      const note = takeTransactionNote(tx.metadata);
                      const positive = tx.delta > 0;
                      const emoji = reasonEmoji(tx.reason, tx.delta);
                      const label = reasonLabel(tx.reason, tx.delta);
                      return (
                        <li
                          key={tx.id}
                          className="flex items-center gap-3 py-2"
                        >
                          <span className="text-lg" aria-hidden>
                            {emoji}
                          </span>
                          <span
                            className={`font-mono tabular-nums ${
                              positive ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {positive ? '+' : ''}
                            {tx.delta}
                          </span>
                          <span className="text-xs text-zinc-500">
                            {label}
                          </span>
                          {note ? (
                            <span className="text-xs italic text-zinc-600">
                              &ldquo;{note}&rdquo;
                            </span>
                          ) : null}
                          <span className="ml-auto text-xs text-zinc-400">
                            {formatLedgerDate(tx.created_at)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="mt-5 text-xs italic text-zinc-500">
                  No ledger entries yet — kid hasn&rsquo;t earned or spent.
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
