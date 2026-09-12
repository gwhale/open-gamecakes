'use client';

// Who gets the weekly email. Deliberately plain: a list, an add box, a remove
// button, and a save. No toggles — an empty list IS "off", so there is no way
// for a switch and a list to disagree about whether mail is going out.

import { useState } from 'react';

export default function DigestEmailsForm({
  initial,
  configured,
}: {
  initial: string[];
  /** Whether the server has a mail provider configured. When false the digest
   *  cannot actually send, and saying so beats a parent wondering for a week
   *  why nothing arrived. */
  configured: boolean;
}): React.ReactElement {
  const [emails, setEmails] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const add = (): void => {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      setMsg({ kind: 'err', text: "That doesn't look like an email address." });
      return;
    }
    if (emails.includes(e)) {
      setMsg({ kind: 'err', text: 'That address is already on the list.' });
      return;
    }
    if (emails.length >= 5) {
      setMsg({ kind: 'err', text: 'Five addresses is the limit.' });
      return;
    }
    setEmails([...emails, e]);
    setDraft('');
    setMsg(null);
  };

  const save = async (): Promise<void> => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/parent/digest-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(
        res.ok
          ? {
              kind: 'ok',
              text: emails.length
                ? `Saved. ${emails.length} address${emails.length === 1 ? '' : 'es'} will get the Monday email.`
                : 'Saved. The weekly email is now off.',
            }
          : { kind: 'err', text: data.error ?? 'Could not save.' },
      );
    } catch {
      setMsg({ kind: 'err', text: 'Network hiccup — try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-base font-bold">Weekly email</h2>
      <p className="mt-1 text-sm text-zinc-500">
        A short Monday summary of what each kid played and where they&rsquo;re ahead or behind.
        Leave the list empty to switch it off.
      </p>

      {!configured && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          Sending isn&rsquo;t switched on for this deployment yet, so addresses saved here won&rsquo;t
          receive anything until it is. You can still set them up now.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {emails.map((e) => (
          <li
            key={e}
            className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800"
          >
            <span className="truncate">{e}</span>
            <button
              type="button"
              onClick={() => setEmails(emails.filter((x) => x !== e))}
              className="shrink-0 rounded-full px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
            >
              Remove
            </button>
          </li>
        ))}
        {emails.length === 0 && (
          <li className="rounded-lg bg-zinc-50 px-3 py-3 text-center text-sm text-zinc-400 dark:bg-zinc-800">
            No addresses — the weekly email is off.
          </li>
        )}
      </ul>

      <div className="mt-3 flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              add();
            }
          }}
          placeholder="name@example.com"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          style={{ minHeight: 'var(--min-tap-target)' }}
        />
        <button
          type="button"
          onClick={add}
          className="shrink-0 rounded-lg bg-zinc-200 px-4 text-sm font-bold dark:bg-zinc-700"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Add
        </button>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-4 w-full rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
        style={{ minHeight: 'var(--min-tap-target)' }}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>

      {msg && (
        <p
          className={`mt-2 text-xs font-semibold ${msg.kind === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}
          role="status"
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
