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
function otherMessages(cap: number): Record<string, string> {
  return {
    // No "remove a player first": there is no removal UI, and telling a parent
    // to do a thing they cannot do is worse than saying nothing.
    kid_limit: `A free family can have up to ${cap} players.`,
    duplicate: 'Someone in your family already uses that name.',
    insert_failed: 'That did not save. Try again?',
  };
}

function messageFor(code: string | undefined, cap: number): string | null {
  if (!code) return null;
  return (
    HANDLE_MESSAGES[code as HandleError] ??
    otherMessages(cap)[code] ??
    'That did not save. Try again?'
  );
}

export default async function NewKidPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    welcome?: string;
    handle?: string;
    grade?: string;
  }>;
}) {
  const family = await requireCurrentFamily();
  const { error, welcome, handle: prefillHandle, grade: prefillGrade } = await searchParams;

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

  const message = messageFor(error, cap);

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
          ← Grown-ups
        </ChromeNavLink>
      </header>

      {/* Signup lands here. One line so the parent knows the account part is
          done and this is the next thing, not another form for its own sake. */}
      {welcome === '1' ? (
        <p
          role="status"
          className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
        >
          Your family is set up. Add the first player and they can start playing
          straight away.
        </p>
      ) : null}

      <form method="POST" action="/api/kids" className="mt-6 flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            What should we call them?
          </span>
          <input
            type="text"
            name="handle"
            placeholder="Zoomer"
            defaultValue={prefillHandle ?? ''}
            autoComplete="off"
            maxLength={HANDLE_MAX}
            // Same rule as validateHandle, so "Anna Smith" is refused by the
            // browser with the field still filled, not by the server with it
            // emptied. The server still checks; this is the first line.
            pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
            title="One word: letters, numbers, - or _"
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
            defaultValue={prefillGrade ?? ''}
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
