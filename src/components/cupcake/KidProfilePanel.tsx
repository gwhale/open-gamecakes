'use client';

// KidProfilePanel — the kid-facing "player card" shown inside the Cakey Store.
//
// Two jobs, both a simplified mirror of what parents see in the dashboard:
//   1. Progress — one Math bar + one Words bar, each = "how many skills are
//      at grade level" (see subjectProgress). This is the FIRST time a kid
//      sees their own learning progress anywhere in the app.
//   2. Wallet — balance + all-time earned, and a short scrollable ledger so a
//      kid can see WHERE their Sugar Tokens came from (wins, level-ups, grade-level
//      milestones) and where they went (store).
//
// Purely presentational: all data is passed in. The parent (CustomizeShop)
// owns the live balance + ledger state so a purchase updates both instantly.

import type { SubjectProgress } from '@/lib/mastery/subject-progress';
import { reasonEmoji, reasonLabel, formatLedgerDate } from '@/lib/tokens/reason-labels';
import SugarTokenIcon from '@/components/wallet/SugarTokenIcon';
import AnimatedCoinCount from '@/components/wallet/AnimatedCoinCount';

export interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface KidProfilePanelProps {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  recent: LedgerRow[];
  math: SubjectProgress;
  reading: SubjectProgress;
}

/** Brand bar color by fill — mirrors the parent dashboard mastery bar so the
 *  two surfaces read as the same system. */
function barColor(pct: number): string {
  if (pct >= 0.8) return 'var(--brand-mint, #6ee7b7)';
  if (pct >= 0.5) return 'var(--brand-vanilla, #fde68a)';
  return 'var(--brand-strawberry, #fb7185)';
}

function ProgressRow({
  emoji,
  label,
  progress,
}: {
  emoji: string;
  label: string;
  progress: SubjectProgress;
}): React.ReactElement {
  const pctText = Math.round(progress.pct * 100);
  const caption =
    progress.total === 0
      ? 'No games played yet'
      : `${progress.onTrack} of ${progress.total} at grade level`;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm font-bold text-zinc-800">
        <span className="flex items-center gap-1.5">
          <span aria-hidden>{emoji}</span> {label}
        </span>
        <span className="font-mono tabular-nums text-xs text-zinc-500">{pctText}%</span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pctText}%`, background: barColor(progress.pct) }}
        />
      </div>
      <span className="text-[11px] font-medium text-zinc-500">{caption}</span>
    </div>
  );
}

export default function KidProfilePanel({
  balance,
  totalEarned,
  totalSpent,
  recent,
  math,
  reading,
}: KidProfilePanelProps): React.ReactElement {
  return (
    <div className="w-full max-w-2xl rounded-3xl border-2 border-amber-200 bg-white/85 p-4 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/85 sm:p-5">
      {/* Progress */}
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
        My Progress
      </h2>
      <div className="flex flex-col gap-3">
        <ProgressRow emoji="🔢" label="Math" progress={math} />
        <ProgressRow emoji="📖" label="Words" progress={reading} />
      </div>

      {/* Wallet */}
      <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <div className="flex items-end justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            My Sugar Tokens
          </h2>
          <span className="text-xs text-zinc-500">
            earned <span className="font-mono font-semibold text-amber-700 dark:text-amber-300">{totalEarned}</span>
            {' · '}
            spent <span className="font-mono font-semibold text-zinc-600 dark:text-zinc-400">{totalSpent}</span>
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-3xl font-extrabold text-amber-700 dark:text-amber-300">
          <SugarTokenIcon /> <AnimatedCoinCount value={balance} className="font-mono tabular-nums" />
        </div>

        {/* Ledger — most recent first, scrollable so a long history doesn't
            push the shop off screen. */}
        {recent.length > 0 ? (
          <ul className="mt-3 max-h-48 divide-y divide-zinc-100 overflow-y-auto text-sm dark:divide-zinc-800">
            {recent.map((tx) => {
              const positive = tx.delta > 0;
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2">
                  <span className="text-lg" aria-hidden>
                    {reasonEmoji(tx.reason, tx.delta)}
                  </span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      positive ? 'text-emerald-600' : 'text-rose-500'
                    }`}
                  >
                    {positive ? '+' : ''}
                    {tx.delta}
                  </span>
                  <span className="text-xs font-medium capitalize text-zinc-600 dark:text-zinc-400">
                    {reasonLabel(tx.reason, tx.delta)}
                  </span>
                  <span className="ml-auto text-[11px] text-zinc-400">
                    {formatLedgerDate(tx.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-3 text-center text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Play games to earn Sugar Tokens! 🪙
          </p>
        )}
      </div>
    </div>
  );
}
