'use client';

// Every family's tickets in one list. Filter by open/closed; change a status
// in place (api/admin/ticket records it in "Your changes" first).

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TICKET_STATUSES, TICKET_STATUS_LABEL, isOpenTicket, type TicketStatus } from '@/lib/admin/tickets';

export interface TicketView {
  id: string;
  family: string;
  kid: string;
  game: string | null;
  type: string;
  title: string;
  summary: string;
  transcript: string;
  shipNote: string | null;
  status: string;
  /** Pre-formatted on the server ("3 days ago"), so server and client agree. */
  age: string;
}

type Filter = 'open' | 'closed' | 'all';

const statusTone: Record<string, string> = {
  new: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
  reviewed: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  wontfix: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
};

export default function TicketsPanel({ tickets, capped }: { tickets: TicketView[]; capped: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = {
    open: tickets.filter((t) => isOpenTicket(t.status)).length,
    closed: tickets.filter((t) => !isOpenTicket(t.status)).length,
    all: tickets.length,
  };
  const shown = tickets.filter((t) =>
    filter === 'all' ? true : filter === 'open' ? isOpenTicket(t.status) : !isOpenTicket(t.status),
  );

  const setStatus = async (id: string, status: TicketStatus) => {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (res.status === 401) throw new Error('Your 15 minutes ran out. Reload and enter your password.');
      if (!res.ok) throw new Error('That did not save. Try again.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3">
      <div role="group" aria-label="Show tickets" className="flex flex-wrap gap-2">
        {(['open', 'closed', 'all'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full px-4 text-sm font-medium ${
              filter === f
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900'
            }`}
          >
            {f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'} ({counts[f]})
          </button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {shown.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
          {filter === 'open' ? 'No open tickets. Nothing waiting on you.' : 'No tickets here.'}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {shown.map((t) => (
            <li
              key={t.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {t.family} · {t.kid} · {t.type}
                    {t.game ? ` · ${t.game}` : ''} · {t.age}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs">
                  <span className="sr-only">Status of {t.title}</span>
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${statusTone[t.status] ?? statusTone.wontfix}`}>
                    {TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status}
                  </span>
                  <select
                    value={t.status}
                    disabled={busy === t.id}
                    onChange={(e) => void setStatus(t.id, e.target.value as TicketStatus)}
                    className="min-h-11 rounded-xl border-2 border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {TICKET_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {TICKET_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="mt-2 text-sm">{t.summary}</p>
              {t.shipNote ? (
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">Shipped: {t.shipNote}</p>
              ) : null}
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">What they said</summary>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{t.transcript}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      {capped ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Showing the newest {tickets.length}.</p>
      ) : null}
    </div>
  );
}
