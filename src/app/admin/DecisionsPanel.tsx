'use client';

// The operator's open asks, one card each: why it matters, how to do it, and
// the options, with the recommended one starred. Tapping an option saves it
// (api/admin/decision), with the note if one was typed. Answered asks fold
// below, newest answer first, and can be reopened.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DECISION_NOTE_MAX, type DecisionRow } from '@/lib/admin/decisions';

export type DecisionView = DecisionRow & { answeredAgo: string | null };

function Card({ d, n, onSend, busy }: { d: DecisionView; n: number; onSend: (body: object) => Promise<boolean>; busy: boolean }) {
  const [note, setNote] = useState(d.note ?? '');
  const answered = d.status === 'answered';
  return (
    <li
      className={`rounded-2xl border bg-white p-4 sm:p-5 dark:bg-zinc-900 ${
        answered ? 'border-emerald-300 dark:border-emerald-800' : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
            answered
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
              : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
          }`}
        >
          {answered ? '✓' : n}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold sm:text-lg">{d.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {d.recommended && !answered ? (
              <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-900 dark:bg-rose-950 dark:text-rose-200">
                ★ Recommended: {d.recommended}
              </span>
            ) : null}
            {answered ? (
              <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                {d.answer}
                {d.answeredAgo ? `, ${d.answeredAgo}` : ''}
              </span>
            ) : null}
            {d.tags.map((t) => (
              <span key={t} className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {answered ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">Details</summary>
          <Body d={d} />
          {d.note ? <p className="mt-2">Note: {d.note}</p> : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSend({ action: 'reopen', id: d.id })}
            className="mt-3 min-h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Reopen
          </button>
        </details>
      ) : (
        <>
          <Body d={d} />
          <label className="mt-3 flex flex-col gap-1 text-sm">
            <span className="text-zinc-500 dark:text-zinc-400">Note (optional, saved with your answer)</span>
            <textarea
              value={note}
              maxLength={DECISION_NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-xl border-2 border-zinc-200 bg-white px-3 py-2 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <div role="group" aria-label={`Answer: ${d.title}`} className="mt-3 flex flex-wrap gap-2">
            {d.options.map((o) => (
              <button
                key={o}
                type="button"
                disabled={busy}
                onClick={() => void onSend({ action: 'answer', id: d.id, answer: o, note })}
                className={`min-h-11 rounded-xl border-2 px-4 text-sm font-semibold disabled:opacity-40 ${
                  o === d.recommended
                    ? 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-700 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                    : 'border-zinc-300 hover:border-zinc-500 dark:border-zinc-700'
                }`}
              >
                {o === d.recommended ? '★ ' : ''}
                {o}
              </button>
            ))}
          </div>
        </>
      )}
    </li>
  );
}

function Body({ d }: { d: DecisionView }) {
  return (
    <div className="mt-3 text-sm">
      {d.why ? <p className="text-zinc-700 dark:text-zinc-300">{d.why}</p> : null}
      {d.steps.length > 0 ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {d.steps.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      ) : null}
      {d.link ? (
        <a href={d.link} target="_blank" rel="noreferrer" className="mt-2 inline-block break-all underline">
          {d.link.replace(/^https?:\/\//, '')}
        </a>
      ) : null}
    </div>
  );
}

export default function DecisionsPanel({ decisions }: { decisions: DecisionView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = decisions.filter((d) => d.status === 'open');
  const answered = decisions.filter((d) => d.status !== 'open');

  const send = async (body: object): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 401) throw new Error('Your 15 minutes ran out. Reload and enter your password.');
      if (!res.ok) throw new Error('That did not save. Try again.');
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not save. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3">
      {error ? (
        <p role="alert" className="mb-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
      {open.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Nothing waiting on you.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {open.map((d, i) => (
            <Card key={d.id} d={d} n={i + 1} onSend={send} busy={busy} />
          ))}
        </ol>
      )}
      {answered.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Answered ({answered.length})</summary>
          <ol className="mt-3 flex flex-col gap-3">
            {answered.map((d, i) => (
              <Card key={d.id} d={d} n={i + 1} onSend={send} busy={busy} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}
