'use client';

// "What we're working on" — the grown-up half of Cakey recommends.
//
// The kid-facing chip on every game launcher suggests a kind and a level. Left
// alone it derives both from the kid's grade and the CCSS critical area for
// that grade, which is always roughly right and never exactly right. This card
// is where someone who knows says otherwise: a times-tables quiz on Friday, a
// month on money, a week revisiting something that did not stick.
//
// Deliberately small. Two dropdowns and a level, per subject, and a clear
// button — not a curriculum planner. The default is "Cakey decides", and a
// grown-up who never opens this loses nothing.

import { useState } from 'react';

const MATH_KINDS: { value: string; label: string }[] = [
  { value: '', label: 'Cakey decides' },
  { value: 'mixed', label: 'A bit of everything' },
  { value: 'addition', label: 'Adding' },
  { value: 'subtraction', label: 'Taking away' },
  { value: 'multiplication', label: 'Times tables' },
  { value: 'division', label: 'Sharing out' },
  { value: 'compare', label: 'Bigger or smaller' },
  { value: 'place-value', label: 'Tens and ones' },
  { value: 'skip-count', label: 'Counting patterns' },
  { value: 'shapes', label: 'Shapes' },
  { value: 'time-money', label: 'Time & money' },
  { value: 'fractions', label: 'Fair shares (fractions)' },
  { value: 'area', label: 'Covering (area)' },
];

const READING_KINDS: { value: string; label: string }[] = [
  { value: '', label: 'Cakey decides' },
  { value: 'mixed', label: 'A bit of everything' },
  { value: 'letter-sounds', label: 'Letter sounds' },
  { value: 'syllables', label: 'Word beats' },
  { value: 'rhyming', label: 'Rhyming words' },
  { value: 'sight-words', label: 'Sight words' },
  { value: 'word-building', label: 'Building words' },
  { value: 'spelling', label: 'Spelling (spoken)' },
  { value: 'word-meaning', label: 'What words mean' },
  { value: 'synonyms', label: 'Words that mean the same' },
  { value: 'antonyms', label: 'Opposites' },
  { value: 'context-clues', label: 'Figuring words out' },
  { value: 'word-roots', label: 'Word parts' },
  { value: 'parts-of-speech', label: 'Word jobs' },
  { value: 'punctuation', label: 'Punctuation' },
  { value: 'comprehension', label: 'Reading closely' },
  { value: 'figurative', label: 'Picture language' },
];

export interface FocusValue {
  focus_math?: string | null;
  focus_math_level?: number | null;
  focus_reading?: string | null;
  focus_reading_level?: number | null;
}

export default function FocusCard({
  kidId,
  kidName,
  initial,
  disabled = false,
}: {
  kidId: string;
  kidName: string;
  initial: FocusValue | null;
  disabled?: boolean;
}) {
  const [math, setMath] = useState(initial?.focus_math ?? '');
  const [mathLevel, setMathLevel] = useState(String(initial?.focus_math_level ?? ''));
  const [reading, setReading] = useState(initial?.focus_reading ?? '');
  const [readingLevel, setReadingLevel] = useState(String(initial?.focus_reading_level ?? ''));
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async (next?: Partial<Record<string, string>>) => {
    const m = next?.math ?? math;
    const ml = next?.mathLevel ?? mathLevel;
    const r = next?.reading ?? reading;
    const rl = next?.readingLevel ?? readingLevel;
    setState('saving');
    try {
      const res = await fetch('/api/kids/focus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kidId,
          // '' means "Cakey decides" — sent as null so the column clears
          // rather than storing an empty string nothing recognises.
          focusMath: m || null,
          focusMathLevel: ml ? Number(ml) : null,
          focusReading: r || null,
          focusReadingLevel: rl ? Number(rl) : null,
        }),
      });
      setState(res.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  };

  const clear = () => {
    setMath('');
    setMathLevel('');
    setReading('');
    setReadingLevel('');
    void save({ math: '', mathLevel: '', reading: '', readingLevel: '' });
  };

  const pinned = Boolean(math || reading);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">What we&rsquo;re working on</h2>
        {pinned ? (
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-800 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            Back to Cakey&rsquo;s pick
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Sets what Cakey suggests on {kidName}&rsquo;s game screens. Leave it on
        &ldquo;Cakey decides&rdquo; and he follows {kidName}&rsquo;s grade.
        {' '}
        {kidName} can still pick anything else.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FocusRow
          label="Math"
          kinds={MATH_KINDS}
          kind={math}
          level={mathLevel}
          disabled={disabled}
          onKind={(v) => {
            setMath(v);
            void save({ math: v });
          }}
          onLevel={(v) => {
            setMathLevel(v);
            void save({ mathLevel: v });
          }}
        />
        <FocusRow
          label="Words"
          kinds={READING_KINDS}
          kind={reading}
          level={readingLevel}
          disabled={disabled}
          onKind={(v) => {
            setReading(v);
            void save({ reading: v });
          }}
          onLevel={(v) => {
            setReadingLevel(v);
            void save({ readingLevel: v });
          }}
        />
      </div>

      <p
        className={`mt-3 text-xs ${
          state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'
        }`}
        aria-live="polite"
      >
        {state === 'saving'
          ? 'Saving…'
          : state === 'saved'
            ? 'Saved. It shows up the next time a game opens.'
            : state === 'error'
              ? 'That did not save. Try again?'
              : ' '}
      </p>
    </section>
  );
}

function FocusRow({
  label,
  kinds,
  kind,
  level,
  disabled,
  onKind,
  onLevel,
}: {
  label: string;
  kinds: { value: string; label: string }[];
  kind: string;
  level: string;
  disabled: boolean;
  onKind: (v: string) => void;
  onLevel: (v: string) => void;
}) {
  const selectCls =
    'w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        <select
          value={kind}
          disabled={disabled}
          onChange={(e) => onKind(e.target.value)}
          className={`mt-1 ${selectCls}`}
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block text-xs text-zinc-500">
        Level
        <select
          value={level}
          disabled={disabled || !kind}
          onChange={(e) => onLevel(e.target.value)}
          className={`mt-1 ${selectCls}`}
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <option value="">Match their grade</option>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              Level {n}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
