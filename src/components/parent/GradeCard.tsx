'use client';

// Correct a kid's grade after they were added. The add-a-kid form promises "you
// can change it any time", and Cakey's suggestions and the on-grade-level count
// both read this value.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GRADE_LABELS } from '@/lib/kids/grade';

export default function GradeCard({
  kidId,
  kidName,
  grade,
  disabled = false,
}: {
  kidId: string;
  kidName: string;
  /** Today's derived grade (K = 0), or null when none is set. */
  grade: number | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  // A kid can age past the labels (K-6), since the grade advances every August.
  // That grade stays visible rather than reading as "Not sure yet".
  const pastLabels = grade != null && grade >= GRADE_LABELS.length;
  const [value, setValue] = useState(
    grade == null ? '' : pastLabels ? String(grade) : GRADE_LABELS[grade],
  );
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async (next: string) => {
    const previous = value;
    setValue(next);
    setState('saving');
    try {
      const res = await fetch('/api/kids', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kidId, grade: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState('saved');
      router.refresh();
    } catch {
      setValue(previous);
      setState('error');
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="block">
        <span className="text-lg font-semibold">Grade</span>
        <span className="mt-1 block text-xs text-zinc-500">
          Cakey&rsquo;s suggestions for {kidName} follow this. It moves up on its own every August.
        </span>
        <select
          value={value}
          disabled={disabled || state === 'saving'}
          onChange={(e) => void save(e.target.value)}
          className="mt-3 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          <option value="">Not sure yet</option>
          {GRADE_LABELS.map((g) => (
            <option key={g} value={g}>
              {g === 'K' ? 'Kindergarten' : `Grade ${g}`}
            </option>
          ))}
          {pastLabels ? (
            <option value={String(grade)} disabled>
              Grade {grade}
            </option>
          ) : null}
        </select>
      </label>
      <p
        className={`mt-3 text-xs ${
          state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-zinc-500'
        }`}
        aria-live="polite"
      >
        {state === 'saving'
          ? 'Saving…'
          : state === 'saved'
            ? 'Saved.'
            : state === 'error'
              ? 'That did not save. Try again?'
              : ' '}
      </p>
    </section>
  );
}
