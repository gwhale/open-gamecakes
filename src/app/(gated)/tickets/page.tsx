// `/tickets` — 🧁 What's Baking: the kid's STORY OVEN, in two tabs.
//
// This is the "PM" side of Gamecakes for the kids, and it answers both halves
// of "what's happening to my idea?":
//
//   🧁 My Ideas       — the ideas THEY popped in via the Story Oven button in
//                       each game, which baking stage each is in (mixing bowl →
//                       oven → fresh out), and — once a parent bakes it — the
//                       note describing what came out.
//   ✨ What We Baked  — the FULL kid-friendly dev log (WHATS_NEW), so they can
//                       see everything that shipped, not just their own
//                       tickets. Same data AND same card as the ✨ What's New
//                       page, which stays where it is; this is a second door
//                       into it, not a fork of it.
//
// The dev log lives on this page because a ticket's journey doesn't end at
// "done" — it ends at a kid seeing the thing they asked for show up in the list
// of what got built, with a "🧁 You baked this!" badge on it.
//
// Scope-limited by active-kid cookie: a kid only sees their own tickets.
// No status editing from this page (that's parent-admin only). Read-only
// teaches them that filing a ticket = waiting for triage, not commanding.
// (Route/table stay `feedback`; copy only.)

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveKid } from '@/lib/auth/active-kid';
import { supabaseServer } from '@/lib/supabase/server';
import {
  KID_STATUS_LABELS,
  STATUS_JOURNEY,
  KID_TYPE_LABELS,
} from '@/lib/feedback/status-labels';
import type { Feedback, FeedbackStatus } from '@/lib/types';
import GamecakesLogo from '@/components/GamecakesLogo';
import FullscreenToggle from '@/components/FullscreenToggle';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import StoryOvenTabs from '@/components/tickets/StoryOvenTabs';
import UpdateCard from '@/components/whats-new/UpdateCard';
import { WHATS_NEW } from '@/lib/whats-new';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const delta = Math.floor((now - d.getTime()) / 1000);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function journeyIndex(status: FeedbackStatus): number {
  const idx = STATUS_JOURNEY.indexOf(status);
  return idx === -1 ? -1 : idx;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TicketsPage() {
  const activeKid = await getActiveKid();
  if (!activeKid) redirect('/kids');

  const sb = supabaseServer();
  const [kidRes, ticketsRes] = await Promise.all([
    sb.from('kids').select('id, name, avatar').eq('id', activeKid).maybeSingle(),
    sb
      .from('feedback')
      .select('*')
      .eq('kid_id', activeKid)
      .order('created_at', { ascending: false }),
  ]);

  if (kidRes.error) throw new Error(`kid load failed: ${kidRes.error.message}`);
  if (ticketsRes.error) throw new Error(`tickets load failed: ${ticketsRes.error.message}`);

  const kid = kidRes.data as { id: string; name: string; avatar: string } | null;
  if (!kid) redirect('/kids');

  const tickets = (ticketsRes.data ?? []) as Feedback[];

  const counts = {
    new: tickets.filter((t) => t.status === 'new').length,
    reviewed: tickets.filter((t) => t.status === 'reviewed').length,
    done: tickets.filter((t) => t.status === 'done').length,
    wontfix: tickets.filter((t) => t.status === 'wontfix').length,
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-emerald-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      {/* ---- Header ---- */}
      <header className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-6">
        <div className="flex items-center gap-3">
          <GamecakesLogo size={44} />
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">
              <span className="mr-2 text-3xl sm:text-4xl" aria-hidden>🔥</span>
              {kid.name}&rsquo;s Story Oven
            </h1>
            <p className="text-xs text-zinc-500 sm:text-sm">
              Every idea, bug, and wish you&rsquo;ve popped in the oven to bake.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <FullscreenToggle size="sm" />
          <ChromeNavLink href="/town" variant="dark" size="md">← Map</ChromeNavLink>
        </div>
      </header>

      {/* ---- Tabs: the kid's own ideas, and the full dev log ----
           Both panels are built HERE (server-side) and handed to the client tab
           shell as slots, so the dev log's copy never ships to the browser. */}
      <StoryOvenTabs
        ideasCount={tickets.length}
        bakedCount={WHATS_NEW.length}
        ideas={
          <>
            {/* Summary chips */}
            <section className="px-6 pt-6 sm:px-8">
              <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
                {(['new', 'reviewed', 'done', 'wontfix'] as FeedbackStatus[]).map((s) => {
                  const lbl = KID_STATUS_LABELS[s];
                  const count = counts[s];
                  return (
                    <div
                      key={s}
                      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${lbl.color.bg} ${lbl.color.text}`}
                    >
                      <span className="text-base">{lbl.emoji}</span>
                      <span>{lbl.label}</span>
                      <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-bold tabular-nums dark:bg-black/30">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Ticket list */}
            <section className="px-6 py-6 sm:px-8">
              <div className="mx-auto max-w-3xl">
                {tickets.length === 0 ? (
                  <EmptyState kidName={kid.name} />
                ) : (
                  <ul className="flex flex-col gap-4">
                    {tickets.map((t) => (
                      <TicketCard key={t.id} ticket={t} />
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </>
        }
        baked={
          <section className="px-6 py-6 sm:px-8">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              <p className="text-center text-sm text-zinc-500">
                Everything we&rsquo;ve baked into Gamecakes, newest first. Ideas with a
                <span className="mx-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  🧁 You baked this!
                </span>
                badge started life as a kid&rsquo;s Story Oven idea.
              </p>
              {WHATS_NEW.map((entry) => (
                <UpdateCard key={entry.id} entry={entry} />
              ))}
            </div>
          </section>
        }
      />

      {/* ---- Footer ---- */}
      <footer className="px-6 pb-8 text-center">
        <p className="text-xs text-zinc-500">
          Tap 🧁 Story Oven in any game to pop in a new idea.
        </p>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Ticket card
// ---------------------------------------------------------------------------

function TicketCard({ ticket }: { ticket: Feedback }) {
  const status = KID_STATUS_LABELS[ticket.status];
  const type = KID_TYPE_LABELS[ticket.ticket_type];
  const journey = journeyIndex(ticket.status);
  const shipped = ticket.status === 'done';

  return (
    <li
      className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-zinc-900 ${
        shipped
          ? 'border-emerald-300 ring-2 ring-emerald-200 dark:border-emerald-800 dark:ring-emerald-950'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      {/* Top row — type and when */}
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="text-base">{type.emoji}</span>
          <span className="font-semibold uppercase tracking-wider">{type.label}</span>
          {ticket.game_slug ? (
            <>
              <span className="text-zinc-300">·</span>
              <span className="font-mono">{ticket.game_slug}</span>
            </>
          ) : null}
        </span>
        <span>{formatWhen(ticket.created_at)}</span>
      </div>

      {/* Title */}
      <h3 className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
        {ticket.title}
      </h3>

      {/* What the AI heard (kid's own words) */}
      <p className="mt-1 text-sm italic text-zinc-500">
        &ldquo;{ticket.raw_transcript}&rdquo;
      </p>

      {/* Summary */}
      <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">{ticket.summary}</p>

      {/* Status journey (new → reviewed → shipped) */}
      {ticket.status !== 'wontfix' ? (
        <div className="mt-4 flex items-center gap-2">
          {STATUS_JOURNEY.map((s, i) => {
            const reached = journey >= i;
            const current = ticket.status === s;
            const lbl = KID_STATUS_LABELS[s];
            return (
              <div key={s} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg transition-all ${
                    reached
                      ? `${lbl.color.bg} ${lbl.color.text} ring-2 ${lbl.color.ring}`
                      : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600'
                  } ${current ? 'scale-110 shadow-md' : ''}`}
                  title={lbl.tooltip}
                  aria-label={`${lbl.label}: ${lbl.tooltip}`}
                >
                  {lbl.emoji}
                </div>
                <div className="flex flex-col">
                  <span className={`text-xs font-semibold ${reached ? lbl.color.text : 'text-zinc-400'}`}>
                    {lbl.label}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                    {lbl.realWord}
                  </span>
                </div>
                {i < STATUS_JOURNEY.length - 1 ? (
                  <div
                    className={`h-0.5 flex-1 rounded-full ${
                      journey > i ? 'bg-emerald-400' : 'bg-zinc-200 dark:bg-zinc-800'
                    }`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`mt-4 flex items-center gap-2 rounded-full px-4 py-2 ${status.color.bg} ${status.color.text}`}
        >
          <span className="text-lg">{status.emoji}</span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{status.label}</span>
            <span className="text-xs opacity-80">{status.tooltip}</span>
          </div>
        </div>
      )}

      {/* Ship note (only when done) */}
      {shipped && ticket.ship_note ? (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 dark:bg-emerald-950">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            <span>🧁</span>
            <span>Fresh from the oven</span>
          </div>
          <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">
            {ticket.ship_note}
          </p>
          {ticket.game_slug ? (
            <Link
              href={`/games/${ticket.game_slug}`}
              className="mt-2 inline-block text-xs font-semibold text-emerald-700 underline hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-emerald-100"
            >
              Try it in the game →
            </Link>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ kidName }: { kidName: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-zinc-300 bg-white/50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900/50">
      <div className="text-5xl">🧁</div>
      <h2 className="mt-3 text-lg font-bold">The oven&rsquo;s empty — nothing baking yet!</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Hey {kidName} — when you play a game, tap the 🧁 Story Oven button at the
        top to pop in a bug or a new idea to bake.
      </p>
      <Link
        href="/town"
        className="mt-4 inline-block rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
      >
        Go play a game
      </Link>
    </div>
  );
}
