// /parent/kids/new — add a kid.
//
// Lives under /parent, so parent/layout.tsx already requires grown-up mode; no
// gating code here.
//
// Zero client JS, like /signup and /grownups: a plain form POSTing to
// /api/kids, errors carried back in ?error=. The copy is the important part of
// this file — it is where a parent decides what to type, and the whole no-PII
// design rests on them typing a nickname.

import { redirect } from 'next/navigation';
import { requireCurrentFamily } from '@/lib/auth/family';
import { maxKidsFor } from '@/lib/auth/tier';
import { GUEST_KID_ID } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { GRADE_LABELS } from '@/lib/kids/grade';
import { HANDLE_MESSAGES, HANDLE_MAX, type HandleError } from '@/lib/kids/create';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';

export const dynamic = 'force-dynamic';

/** Route-level failures the API can hand back that are not handle problems. */
const OTHER_MESSAGES: Record<string, string> = {
  kid_limit: 'This plan is full. Remove a player first, or ask about more room.',
  duplicate: 'Someone in your family already uses that name.',
  insert_failed: 'That did not save. Try again?',
};

function messageFor(code: string | undefined): string | null {
  if (!code) return null;
  return (
    HANDLE_MESSAGES[code as HandleError] ??
    OTHER_MESSAGES[code] ??
    'That did not save. Try again?'
  );
}

export default async function NewKidPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const family = await requireCurrentFamily();
  const { error } = await searchParams;

  const { data } = await supabaseServer()
    .from('kids')
    .select('id')
    .eq('family_id', family.id)
    .neq('id', GUEST_KID_ID);

  const used = (data ?? []).length;
  const cap = maxKidsFor(family.tier);
  // Nothing to fill in if there is no room — say so on /parent rather than
  // rendering a form that can only fail.
  if (used >= cap) redirect('/parent?error=kid_limit');

  const message = messageFor(error);

  return (
    <main className="mx-auto w-full max-w-lg p-4 sm:p-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Add a player</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {used} of {cap} used.
          </p>
        </div>
        <ChromeNavLink href="/parent" size="sm">
          ← Parents
        </ChromeNavLink>
      </header>

      <form method="POST" action="/api/kids" className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            What should we call them?
          </span>
          <input
            type="text"
            name="handle"
            placeholder="Zoomer"
            autoComplete="off"
            maxLength={HANDLE_MAX}
            required
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          />
          {/* The one piece of copy the whole no-PII design leans on. It has to
              read as a friendly suggestion, because a warning about data
              policy would be ignored by exactly the person it is aimed at. */}
          <span className="text-xs text-zinc-500">
            One word, no spaces. A nickname is perfect — this is what shows on
            their cupcake, and your child will enjoy picking it. We do not need
            their real name.
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            What grade are they in?
          </span>
          <select
            name="grade"
            defaultValue=""
            className="rounded-xl border-2 border-zinc-200 bg-white px-4 py-3 focus:border-rose-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            <option value="">Not sure yet</option>
            {GRADE_LABELS.map((g) => (
              <option key={g} value={g}>
                {g === 'K' ? 'Kindergarten' : `Grade ${g}`}
              </option>
            ))}
          </select>
          <span className="text-xs text-zinc-500">
            Sets where the questions start. You can change it any time, and the
            game adjusts on its own as they play.
          </span>
        </label>

        {message ? (
          <p
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
            aria-live="polite"
          >
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          Add them
        </button>
      </form>

      <p className="mt-6 text-xs text-zinc-400">
        They start with 5 Sugar Tokens and their own corner of the town. Nothing
        else about them is stored — no birthday, no photo, no last name.
      </p>
    </main>
  );
}
