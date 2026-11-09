'use client';

// What school sent home — word lists and class standards.
//
// The card above this one picks a KIND of practice from a fixed list. This one
// is for the specific thing in the backpack: twelve words for Friday, or the
// standards sheet for the unit. A word list added here replaces the built-in
// vocabulary for the modes it was added for, so it becomes the actual practice
// rather than something adjacent to it. Spelling is spoken now, so the list
// gets read aloud.
//
// WHAT THE LIST IS FOR IS PART OF THE LIST
//
// The same twelve words are a spelling test in second grade and a vocabulary
// unit in fifth. Before modes existed this card guessed the first case every
// time. Now a grown-up says, and the picker is right there under the words
// rather than buried in a settings screen, because the answer is different per
// list and they are already thinking about it while they type.
//
// A standard is matched against the CCSS codes already on every skill row. A
// match means Cakey can aim at it; no match is still worth recording, and the
// card says which happened rather than letting a parent assume.

import { useCallback, useEffect, useState } from 'react';
import {
  type ClassWordMode,
  DEFAULT_MODES,
  MODE_ORDER,
  canServeMode,
} from '@/lib/games/shared/class-modes';

export interface MaterialEntry {
  id: string;
  kind: 'words' | 'standard';
  label: string;
  words: string[];
  note: string | null;
  skill_id: string | null;
  active: boolean;
  created_at: string;
  /** Which reading types this list drives. Absent on rows written before 0048. */
  modes?: ClassWordMode[] | null;
  /** Lowercased word -> definition, for the modes that need one. */
  glosses?: Record<string, string> | null;
  skills?: { display_name: string } | null;
}

/** Rows predate the modes column; treat a missing value as the old promise
 *  rather than as "no modes", which would read as a list that does nothing. */
function modesOf(entry: MaterialEntry): ClassWordMode[] {
  const m = entry.modes;
  return m && m.length > 0 ? m : [...DEFAULT_MODES];
}

export default function ClassMaterialCard({
  kidId,
  kidName,
  disabled = false,
}: {
  kidId: string;
  kidName: string;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<MaterialEntry[] | null>(null);
  const [adding, setAdding] = useState<'words' | 'standard' | null>(null);
  const [label, setLabel] = useState('');
  const [words, setWords] = useState('');
  const [note, setNote] = useState('');
  const [modes, setModes] = useState<ClassWordMode[]>([...DEFAULT_MODES]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which modes were asked for but cannot run yet, straight from the server so
  // the card never disagrees with what was actually stored.
  const [shortfall, setShortfall] = useState<{ label: string; needs: number }[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kids/class-material?kidId=${encodeURIComponent(kidId)}`);
      const json = (await res.json()) as { material?: MaterialEntry[] };
      setItems(json.material ?? []);
    } catch {
      setItems([]);
    }
  }, [kidId]);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setAdding(null);
    setLabel('');
    setWords('');
    setNote('');
    setModes([...DEFAULT_MODES]);
    setError(null);
  };

  const add = async () => {
    if (!adding || !label.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/kids/class-material', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId, kind: adding, label, words, note, modes }),
      });
      const json = (await res.json()) as {
        error?: string;
        shortfall?: { label: string; needs: number }[];
      };
      if (!res.ok) {
        setError(json.error ?? 'That did not save.');
        return;
      }
      // Reported, not blocked: the list is saved either way, and this says
      // which parts of it are asleep until more definitions arrive.
      setShortfall(json.shortfall ?? []);
      reset();
      await load();
    } catch {
      setError('That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (entry: MaterialEntry) => {
    setItems((prev) =>
      (prev ?? []).map((e) => (e.id === entry.id ? { ...e, active: !e.active } : e)),
    );
    await fetch('/api/kids/class-material', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kidId, id: entry.id, active: !entry.active }),
    });
  };

  /** Re-point an existing list without retyping it. A list that turns out to
   *  be vocabulary rather than spelling is one tap away from being right. */
  const setEntryModes = async (entry: MaterialEntry, next: ClassWordMode[]) => {
    if (next.length === 0) return; // a list with no modes can never be practised
    setItems((prev) =>
      (prev ?? []).map((e) => (e.id === entry.id ? { ...e, modes: next } : e)),
    );
    await fetch('/api/kids/class-material', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kidId, id: entry.id, modes: next }),
    });
  };

  const remove = async (entry: MaterialEntry) => {
    setItems((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
    await fetch(
      `/api/kids/class-material?kidId=${encodeURIComponent(kidId)}&id=${encodeURIComponent(entry.id)}`,
      { method: 'DELETE' },
    );
  };

  const wordLists = (items ?? []).filter((e) => e.kind === 'words');
  const standards = (items ?? []).filter((e) => e.kind === 'standard');
  const activeWordCount = wordLists
    .filter((e) => e.active)
    .reduce((n, e) => n + e.words.length, 0);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">From school</h2>
      <p className="mt-1 text-xs text-zinc-500">
        {activeWordCount > 0
          ? `${activeWordCount} word${activeWordCount === 1 ? '' : 's'} in play — Cakey uses these instead of the built-in list, in the ways each list is set to.`
          : `Add ${kidName}'s word list and Cakey practises those words instead of the built-in ones.`}
      </p>

      {/* Saved, but not all of it is running yet. Said once, right after the
          save that caused it, rather than left for a parent to notice. */}
      {shortfall.length > 0 ? (
        <p
          className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
          aria-live="polite"
        >
          {`Saved. ${shortfall
            .map((s) => `“${s.label}” needs ${s.needs} words with meanings`)
            .join('; ')}. Add them and it switches on by itself.`}
        </p>
      ) : null}

      {items === null ? (
        <p className="mt-4 text-sm text-zinc-400">Loading…</p>
      ) : (
        <>
          <Group
            title="Word lists"
            empty="No lists yet."
            entries={wordLists}
            disabled={disabled}
            onToggle={toggle}
            onRemove={remove}
            render={(e) => {
              const active = modesOf(e);
              const glosses = e.glosses ?? {};
              const defined = e.words.filter(
                (w) => (glosses[w.toLocaleLowerCase()] ?? '').trim().length > 0,
              ).length;
              return (
                <>
                  <p className="mt-1 text-xs text-zinc-500">
                    {e.words.length} word{e.words.length === 1 ? '' : 's'}
                    {defined > 0 ? `, ${defined} with meanings` : ''} — {e.words.join(', ')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MODE_ORDER.map((spec) => {
                      const on = active.includes(spec.mode);
                      const ok = canServeMode(spec.mode, e.words, glosses);
                      return (
                        <button
                          key={spec.mode}
                          type="button"
                          disabled={disabled}
                          aria-pressed={on}
                          title={
                            on && !ok
                              ? `Needs ${spec.minEntries} words with meanings. ${defined} so far.`
                              : spec.hint
                          }
                          onClick={() =>
                            setEntryModes(
                              e,
                              on
                                ? active.filter((m) => m !== spec.mode)
                                : [...active, spec.mode],
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${
                            on
                              ? ok
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                                : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                              : 'border-zinc-200 text-zinc-400 dark:border-zinc-700'
                          }`}
                        >
                          {spec.label}
                          {on && !ok ? ' (waiting)' : ''}
                        </button>
                      );
                    })}
                  </div>
                  {/* Named rather than implied: a mode that is on but cannot
                      run is the one thing a parent would otherwise assume is
                      working. */}
                  {active.some((m) => !canServeMode(m, e.words, glosses)) ? (
                    <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                      Add meanings (<span className="font-mono">word = what it means</span>) to
                      switch the waiting ones on.
                    </p>
                  ) : null}
                </>
              );
            }}
          />

          <Group
            title="Class standards"
            empty="No standards yet."
            entries={standards}
            disabled={disabled}
            onToggle={toggle}
            onRemove={remove}
            render={(e) => (
              <>
                {e.note ? (
                  <p className="mt-1 text-xs text-zinc-500">{e.note}</p>
                ) : null}
                <p className="mt-1 text-xs">
                  {e.skills?.display_name ? (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      Cakey can practise this — {e.skills.display_name}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      Noted. Nothing generates for this one yet.
                    </span>
                  )}
                </p>
              </>
            )}
          />
        </>
      )}

      {adding ? (
        <div className="mt-4 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
            {adding === 'words' ? 'What to call it' : 'Standard code'}
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={adding === 'words' ? 'Week of Sep 8' : '2.NBT.B.5'}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              style={{ minHeight: 'var(--min-tap-target)' }}
            />
          </label>

          {adding === 'words' ? (
            <>
              <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                The words
                <textarea
                  value={words}
                  onChange={(e) => setWords(e.target.value)}
                  rows={5}
                  placeholder={'because\nfriend\nbrave = not afraid'}
                  className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
                <span className="mt-1 block font-normal normal-case tracking-normal text-zinc-400">
                  One per line, or separated by commas. Paste straight off the sheet.
                  For meanings write{' '}
                  <span className="font-mono">brave = not afraid</span>; you only need
                  those if you tick &ldquo;What it means&rdquo;.
                </span>
              </label>

              <fieldset className="mt-3">
                <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  What should Cakey do with them?
                </legend>
                <div className="mt-2 flex flex-col gap-2">
                  {MODE_ORDER.map((spec) => {
                    const on = modes.includes(spec.mode);
                    return (
                      <label
                        key={spec.mode}
                        className="flex cursor-pointer items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setModes((prev) =>
                              on ? prev.filter((m) => m !== spec.mode) : [...prev, spec.mode],
                            )
                          }
                          className="mt-0.5 h-4 w-4 accent-emerald-600"
                        />
                        <span>
                          <span className="font-medium">{spec.label}</span>
                          <span className="block text-xs text-zinc-400">{spec.hint}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {modes.length === 0 ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    Pick at least one, or the list has nothing to do.
                  </p>
                ) : null}
              </fieldset>
            </>
          ) : (
            <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              What it says
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Fluently add and subtract within 100"
                className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                style={{ minHeight: 'var(--min-tap-target)' }}
              />
            </label>
          )}

          {error ? (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400" aria-live="polite">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={busy || !label.trim() || (adding === 'words' && modes.length === 0)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              {busy ? 'Saving…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAdding('words')}
            disabled={disabled}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            + Word list
          </button>
          <button
            type="button"
            onClick={() => setAdding('standard')}
            disabled={disabled}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            + Class standard
          </button>
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  empty,
  entries,
  disabled,
  onToggle,
  onRemove,
  render,
}: {
  title: string;
  empty: string;
  entries: MaterialEntry[];
  disabled: boolean;
  onToggle: (e: MaterialEntry) => void;
  onRemove: (e: MaterialEntry) => void;
  render: (e: MaterialEntry) => React.ReactNode;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-zinc-400">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className={`rounded-xl border p-3 ${
                e.active
                  ? 'border-zinc-200 dark:border-zinc-800'
                  : 'border-dashed border-zinc-200 opacity-60 dark:border-zinc-800'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{e.label}</span>
                <span className="flex gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => onToggle(e)}
                    disabled={disabled}
                    className="font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 disabled:opacity-40 dark:hover:text-zinc-200"
                  >
                    {/* Off, not deleted: a spelling list comes back around, and
                        last month's is still evidence of what they have seen. */}
                    {e.active ? 'Turn off' : 'Turn on'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(e)}
                    disabled={disabled}
                    className="font-medium text-zinc-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </span>
              </div>
              {render(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
