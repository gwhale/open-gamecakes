'use client';

// KidDashboard — single-kid view of the parent portal.
//
// Previously this component juggled a sidebar of kids AND per-kid tabs.
// The rework split those: family-level kid selection now lives on
// /parent/page.tsx (big-tile grid), and this component just renders one
// kid's detailed view full-width — Skills / Activity / Tickets / Add Note.
//
// Data flows:
//   - Initial data is server-fetched on /parent/kid/[kidId]/page.tsx
//     and passed as single-kid props (no maps keyed by kid id anymore)
//   - Client-side mutations POST/PUT to API routes and optimistically
//     update local state
//   - Active section is local state (not URL-synced yet)

import { useCallback, useId, useRef, useState } from 'react';
import { ChromeNavLink } from '@/components/ui/ChromeNavLink';
import Link from 'next/link';
import { gradeLabel } from '@/lib/kids/defaults';
import type { Kid, Skill, KidSkill, Attempt, Observation, ObservationKind, Feedback, FeedbackStatus } from '@/lib/types';
import { CupcakeAvatar } from '@/components/cupcake/CupcakeAvatar';
import { coerceCupcakeConfig } from '@/lib/cupcake/config';
import GiveCookiesPanel from '@/components/parent/GiveCookiesPanel';
import LearningMix from '@/components/parent/LearningMix';
import ActivityChart from '@/components/parent/ActivityChart';
import MonthActivityChart from '@/components/parent/MonthActivityChart';
import PeriodNav from '@/components/parent/PeriodNav';
import type { Period, MonthRef } from '@/lib/parent/periods';
import type { MonthCount } from '@/lib/parent/subjects';
import type { SubjectCount, DayCount } from '@/lib/parent/subjects';
import { currentGradeOf, isAtOrBelowGrade } from '@/lib/kids/grade';
import FocusCard, { type FocusValue } from '@/components/parent/FocusCard';
import ClassMaterialCard from '@/components/parent/ClassMaterialCard';

/** Month usage + performance summary, computed server-side (see the kid page).
 *  Drives the Overview tab so the dashboard opens on charts, not standards. */
export interface KidOverview {
  /** The selected period's label — a month name or "All time". */
  monthLabel: string;
  /** True for the all-time view, which buckets activity by MONTH not by day. */
  isAll: boolean;
  /** Per-month bars; only populated when `isAll`. */
  months: MonthCount[];
  rounds: number;
  trackedRounds: number;
  minutes: number;
  activeDays: number;
  days: DayCount[];
  subjectMix: SubjectCount[];
  tapPct: number | null;
  tierMin: number | null;
  tierMax: number | null;
  finishedPct: number | null;
  onTrack: number;
  started: number;
  totalStandards: number;
  /** URL form of the selected period, so the 'per-game detail' link keeps it. */
  periodParam: string;
  /** Route the month bars link back to (this kid's own page). */
  basePath: string;
  /** Selected period + the months that have data, for the stepper.
   *  `availableMonths`, NOT `months` — `months` above is the CHART's per-month
   *  bar data (MonthCount[]). Two different lists, one obvious name. */
  period: Period;
  availableMonths: MonthRef[];
  /** Epoch ms rather than a Date — this crosses into a client component, so a
   *  plain number is the least surprising thing to serialize. */
  nowMs: number;
}

type Section = 'overview' | 'skills' | 'cookies' | 'activity' | 'tickets' | 'addNote';

interface SectionTab {
  id: Section;
  emoji: string;
  label: string;
  shortLabel: string;
}

const SECTION_TABS: readonly SectionTab[] = [
  { id: 'overview', emoji: '📈', label: 'Overview',   shortLabel: 'Overview' },
  { id: 'skills',   emoji: '📊', label: 'Standards',  shortLabel: 'Standards' },
  { id: 'cookies',  emoji: '🪙', label: 'Sugar Tokens', shortLabel: 'Tokens' },
  { id: 'activity', emoji: '📜', label: 'Activity',   shortLabel: 'Activity' },
  { id: 'tickets',  emoji: '🎫', label: 'Tickets',    shortLabel: 'Tickets' },
  { id: 'addNote',  emoji: '📝', label: 'Add Note',   shortLabel: 'Add' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface KidDashboardProps {
  kid: Kid;
  /** Family display name (e.g. "The Shacks") shown in the breadcrumb
   *  back-link. Multi-family Phase 2: passed in as a prop instead of
   *  imported from a hardcoded constant, so each parent's dashboard
   *  shows their family's name. */
  familyName: string;
  skills: Skill[];
  kidSkills: (KidSkill & { skill_name?: string })[];
  attempts: Attempt[];
  observations: Observation[];
  feedback: Feedback[];
  skillsById: Record<string, Skill>;
  /** Current Sugar Token balance for the 🪙 Sugar Tokens tab. */
  tokenBalance: number;
  /** Month usage + performance summary for the Overview tab. */
  overview: KidOverview;
  /** True for the sandbox/guest kid — the Sugar Token wallet is disabled for them. */
  isGuestKid: boolean;
}

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

function kindLabel(k: ObservationKind): string {
  return k === 'teacher_report' ? 'Teacher report' : k.charAt(0).toUpperCase() + k.slice(1);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function KidDashboard({
  kid,
  familyName,
  skills,
  kidSkills: initialKs,
  attempts,
  observations: initialObs,
  feedback: initialFeedback,
  skillsById,
  tokenBalance,
  overview,
  isGuestKid,
}: KidDashboardProps) {
  const [activeSection, setActiveSection] = useState<Section>('overview');

  // Local copies of mutable data — optimistic updates live here, initial
  // values come from the server-fetched props.
  const [localObs, setLocalObs] = useState(initialObs);
  const [localKs, setLocalKs] = useState(initialKs);
  const [localFeedback, setLocalFeedback] = useState(initialFeedback);

  // Staged tier edits by skill id → new tier. Parents click tier numbers
  // to stage a change; nothing is persisted until they hit "Save changes"
  // at the top of the skills view. Manual save keeps one accidental tap
  // from moving mastery around.
  const [pendingEdits, setPendingEdits] = useState<Record<string, number>>({});
  const [savingEdits, setSavingEdits] = useState(false);

  const stageTierEdit = useCallback(
    (skillId: string, tier: number) => {
      setPendingEdits((prev) => {
        const next = { ...prev };
        // Clicking the number that's already current clears the pending
        // edit — an easy undo for a stray tap.
        const currentRow = localKs.find((ks) => ks.skill_id === skillId);
        const currentTier = currentRow?.current_tier ?? 1;
        if (tier === currentTier) {
          delete next[skillId];
        } else {
          next[skillId] = tier;
        }
        return next;
      });
    },
    [localKs],
  );

  const discardTierEdits = useCallback(() => setPendingEdits({}), []);

  const saveTierEdits = useCallback(async () => {
    const entries = Object.entries(pendingEdits);
    if (entries.length === 0) return;
    setSavingEdits(true);
    try {
      // POST each pending change in parallel. The calibrate endpoint
      // handles the upsert-with-tier-reset semantics the adaptive engine
      // needs.
      await Promise.all(
        entries.map(([skillId, tier]) =>
          fetch('/api/kid-skills/calibrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kidId: kid.id, skillId, tier }),
          }),
        ),
      );
      // Mirror the API's behavior locally: tier set, mastery_pct reset,
      // recent_window cleared, total_attempts preserved.
      setLocalKs((prev) => {
        const arr = [...prev];
        for (const [skillId, tier] of entries) {
          const idx = arr.findIndex((ks) => ks.skill_id === skillId);
          if (idx >= 0) {
            arr[idx] = { ...arr[idx], current_tier: tier, mastery_pct: 0, recent_window: [] };
          } else {
            arr.push({
              id: crypto.randomUUID(),
              kid_id: kid.id,
              skill_id: skillId,
              current_tier: tier,
              mastery_pct: 0,
              total_attempts: 0,
              recent_window: [],
            });
          }
        }
        return arr;
      });
      setPendingEdits({});
    } catch (err) {
      console.warn('[kid-skills save] failed:', err);
    } finally {
      setSavingEdits(false);
    }
  }, [pendingEdits, kid.id]);

  // Open ticket count — drives the rose badge on the Tickets tab.
  const openTicketCount = localFeedback.filter(
    (t) => t.status !== 'done' && t.status !== 'wontfix',
  ).length;

  return (
    <main className="flex min-h-screen flex-col bg-white dark:bg-zinc-950">
      {/* Header — back link + kid avatar/name. Full width, no sidebar. */}
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Link
            href="/parent"
            className="flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 active:scale-95 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900"
            style={{ minHeight: 'var(--min-tap-target)' }}
          >
            ← {familyName}
          </Link>
          <h1 className="flex-1 flex items-center justify-center gap-2 truncate text-xl font-bold sm:text-2xl">
            <CupcakeAvatar
              config={coerceCupcakeConfig(kid.cupcake_config)}
              size={36}
            />
            {kid.name}
          </h1>
          <ChromeNavLink href="/town" variant="dark" size="sm">
            Map
          </ChromeNavLink>
        </div>
      </header>

      {/* Sticky tab bar — now full-width with no sidebar competing for space. */}
      <nav
        className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-2 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90 sm:px-8 sm:py-3"
        aria-label={`Sections for ${kid.name}`}
      >
        <div className="mx-auto flex max-w-3xl gap-1 sm:gap-2">
          {SECTION_TABS.map((tab) => {
            const isActive = activeSection === tab.id;
            const badge =
              tab.id === 'tickets' && openTicketCount > 0 ? openTicketCount : null;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                aria-pressed={isActive}
                aria-label={tab.label}
                title={tab.label}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition-colors sm:gap-2 sm:px-4 ${
                  isActive
                    ? 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                }`}
                style={{ minHeight: 'var(--min-tap-target)' }}
              >
                <span className="text-lg sm:text-base" aria-hidden>{tab.emoji}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {badge !== null ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:px-2 sm:text-xs ${
                      isActive
                        ? 'bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Section content — page-level scroll, full width up to max-w-3xl. */}
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
        {activeSection === 'overview' ? (
          <OverviewSection kidName={kid.name} overview={overview} />
        ) : null}

        {activeSection === 'skills' ? (
          <div className="flex flex-col gap-6">
          <FocusCard
            kidId={kid.id}
            kidName={kid.name}
            initial={kid as FocusValue}
            disabled={isGuestKid}
          />
          <ClassMaterialCard kidId={kid.id} kidName={kid.name} disabled={isGuestKid} />
          <SkillsOverview
            kid={kid}
            skills={skills}
            kidSkills={localKs}
            skillsById={skillsById}
            pendingEdits={pendingEdits}
            saving={savingEdits}
            onEditTier={stageTierEdit}
            onSaveEdits={saveTierEdits}
            onDiscardEdits={discardTierEdits}
          />
          </div>
        ) : null}

        {activeSection === 'cookies' ? (
          <GiveCookiesPanel
            kidId={kid.id}
            kidName={kid.name}
            initialBalance={tokenBalance}
            disabled={isGuestKid}
          />
        ) : null}

        {activeSection === 'activity' ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Activity Log</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Game sessions and observations, newest first.
                </p>
              </div>
              <span className="text-xs text-zinc-400">
                {attempts.length + localObs.length} entries
              </span>
            </div>
            <ActivityLog
              attempts={attempts}
              observations={localObs}
              skillsById={skillsById}
              onEditObservation={(id, updates) => {
                setLocalObs((prev) =>
                  prev.map((o) => (o.id === id ? { ...o, ...updates } : o)),
                );
              }}
            />
          </section>
        ) : null}

        {activeSection === 'tickets' ? (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">Kid Feedback Tickets</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Voice/text tickets {kid.name} sent from games. Mark
                  Done to add a release note the kid will see.
                </p>
              </div>
              <span className="text-xs text-zinc-400">
                {openTicketCount} open · {localFeedback.length} total
              </span>
            </div>
            {localFeedback.length > 0 ? (
              <FeedbackList
                tickets={localFeedback}
                onStatusChange={(id, newStatus) => {
                  setLocalFeedback((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f)),
                  );
                }}
                onShipNoteChange={(id, shipNote) => {
                  setLocalFeedback((prev) =>
                    prev.map((f) => (f.id === id ? { ...f, ship_note: shipNote } : f)),
                  );
                }}
              />
            ) : (
              <p className="mt-4 rounded-xl border-2 border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-800">
                No tickets yet. {kid.name} can tap 🧁 Story Oven in any game to
                pop one in.
              </p>
            )}
          </section>
        ) : null}

        {activeSection === 'addNote' ? (
          <section>
            <h2 className="text-lg font-semibold">Add an observation</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Capture homework, a writing sample, or a note. Upload a photo
              to let the AI extract context automatically.
            </p>
            <QuickAddObservation
              kidId={kid.id}
              kidName={kid.name}
              skills={skills}
              onAdded={(obs) => setLocalObs((prev) => [obs, ...prev])}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Overview — usage + performance, the dashboard's landing view
// ---------------------------------------------------------------------------

/** One stat tile: a big number + an uppercase label, optional tint. */
function Stat({ value, label, tint }: { value: string; label: string; tint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`text-2xl font-bold tabular-nums ${tint ?? 'text-zinc-900 dark:text-zinc-100'}`}>{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

/** The Overview tab: how much a kid played (usage) and how it went
 *  (performance) this month — charts first, so the dashboard never opens on a
 *  wall of not-started standards. */
function OverviewSection({ kidName, overview: o }: { kidName: string; overview: KidOverview }) {
  const level =
    o.tierMin == null ? null : o.tierMin === o.tierMax ? `${o.tierMin}` : `${o.tierMin}–${o.tierMax}`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {o.isAll
              ? `Everything ${kidName} has played.`
              : `${kidName}’s ${o.monthLabel}.`}
          </p>
        </div>
        <Link
          href={`/parent/gameplay?period=${o.periodParam}`}
          className="text-xs font-medium text-rose-600 underline dark:text-rose-400"
        >
          Per-game detail →
        </Link>
      </div>

      <div className="mb-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <PeriodNav
          period={o.period}
          months={o.availableMonths}
          now={new Date(o.nowMs)}
          basePath={o.basePath}
        />
      </div>

      {o.rounds === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500 dark:bg-zinc-900">
          {o.isAll
            ? `No play recorded for ${kidName} yet — usage and performance charts appear here once they play.`
            : `Nothing played in ${o.monthLabel}. Try another month with the arrows above.`}
        </p>
      ) : (
        <>
          {/* Usage — engagement at a glance. */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={String(o.rounds)} label="Rounds" />
            <Stat value={`${o.minutes}m`} label="Time played" />
            <Stat value={String(o.activeDays)} label="Active days" />
            <Stat
              value={`${o.onTrack}/${o.totalStandards}`}
              label="On grade level"
              tint="text-emerald-600 dark:text-emerald-400"
            />
          </div>

          {/* Performance — what kind, how hard, how clean. */}
          <div className="mb-4 grid gap-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-2">
            <LearningMix mix={o.subjectMix} />
            {o.isAll ? (
              <MonthActivityChart months={o.months} basePath={o.basePath} />
            ) : (
              <ActivityChart days={o.days} monthLabel={o.monthLabel} />
            )}
          </div>

          {o.trackedRounds > 0 && (
            <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {level && <Stat value={`Lv ${level}`} label="Level played" />}
              {o.tapPct != null && <Stat value={`${o.tapPct}%`} label="Taps correct" />}
              {o.finishedPct != null && <Stat value={`${o.finishedPct}%`} label="Rounds finished" />}
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-zinc-400">
            <b className="text-zinc-500">Usage</b> counts every round; the <b className="text-zinc-500">mix</b>,
            level, and taps count only rounds with a recorded game (since 26 July).
            {' '}<b className="text-zinc-500">On grade level</b> counts standards {kidName} has practiced
            and reached the grade-level tier on — see the <b className="text-zinc-500">Standards</b> tab for
            the full list. Taps correct is not per-question accuracy, which is not recorded.
          </p>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skills Overview
// ---------------------------------------------------------------------------

// Kid grade DERIVED from the DB row: kids.grade is the grade asserted in
// kids.grade_year, advanced to today (migration 0044, lib/kids/grade.ts).
// The name-based heuristic this replaced is gone for good.
function kidGrade(kid: Kid): string {
  return gradeLabel(currentGradeOf(kid));
}

function SkillsOverview({
  kid,
  skills,
  kidSkills,
  pendingEdits,
  saving,
  onEditTier,
  onSaveEdits,
  onDiscardEdits,
}: {
  kid: Kid;
  skills: Skill[];
  kidSkills: KidSkill[];
  skillsById: Record<string, Skill>;
  pendingEdits: Record<string, number>;
  saving: boolean;
  onEditTier: (skillId: string, tier: number) => void;
  onSaveEdits: () => void;
  onDiscardEdits: () => void;
}) {
  const ksMap = new Map(kidSkills.map((ks) => [ks.skill_id, ks]));
  const grade = kidGrade(kid);

  // Default to the standards the kid has actually TOUCHED — a dashboard that
  // opens on a hundred grey "Not started" rows buries the few that matter.
  // "Show all" reveals the full CCSS list for parents planning what's next.
  const [showAll, setShowAll] = useState(false);
  const isStarted = (s: Skill) => (ksMap.get(s.id)?.total_attempts ?? 0) > 0;
  const visible = (arr: Skill[]) => (showAll ? arr : arr.filter(isStarted));
  const mathSkills = visible(skills.filter((s) => s.subject === 'math'));
  const readingSkills = visible(skills.filter((s) => s.subject === 'reading'));
  const hiddenCount = skills.filter((s) => s.on_track_tier != null && !isStarted(s)).length;

  // Summary stats — only count skills the kid has actually practiced.
  // A fresh kid_skills row with default tier 1 was previously inflating
  // "on track" counts for skills at on_track_tier=1, making it look like
  // the kid had mastered things they'd never seen.
  // Denominator is the kid's OWN grade band, not the whole K-6 catalog —
  // see isAtOrBelowGrade(). Keep this filter and the server's gradedSkills in
  // step; they render the same fraction in two places.
  const gradeNow = currentGradeOf(kid);
  const inGradeBand = (s: Skill) =>
    s.on_track_tier != null && isAtOrBelowGrade(s.grade_level, gradeNow);
  const totalSkills = skills.filter(inGradeBand).length;
  const onTrackCount = skills.filter((s) => {
    if (!inGradeBand(s)) return false;
    const ks = ksMap.get(s.id);
    return ks && ks.total_attempts > 0 && ks.current_tier >= s.on_track_tier!;
  }).length;
  const startedCount = skills.filter((s) => {
    const ks = ksMap.get(s.id);
    return ks && ks.total_attempts > 0;
  }).length;

  const pendingCount = Object.keys(pendingEdits).length;
  const mathDomains = groupByDomain(mathSkills);
  const readingDomains = groupByDomain(readingSkills);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">California Learning Standards</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            CCSS K-6 · Grade {grade} · {skills.length} skills
          </p>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <div>
            <span className="font-mono font-bold text-emerald-600">{onTrackCount}</span>
            <span> / {totalSkills} on track</span>
          </div>
          <div>{startedCount} skills practiced</div>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-zinc-400">
        Tap a tier number to stage a change, then Save. Green outline =
        on-track target for grade {grade}. 📝 = observation-only (no game yet).
      </p>

      {/* Sticky save bar — appears only when edits are pending */}
      {pendingCount > 0 ? (
        <div className="sticky top-[60px] z-[5] mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm shadow-sm dark:border-amber-900 dark:bg-amber-950 sm:top-0">
          <span className="font-semibold text-amber-900 dark:text-amber-200">
            {pendingCount} unsaved tier change{pendingCount !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDiscardEdits}
              disabled={saving}
              className="rounded-full px-3 py-1 text-xs font-medium text-amber-800 underline hover:text-amber-900 disabled:opacity-50 dark:text-amber-300"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSaveEdits}
              disabled={saving}
              className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-700 active:scale-95 disabled:opacity-50"
              style={{ minHeight: 'var(--min-tap-target)' }}
            >
              {saving ? 'Saving…' : `Save ${pendingCount}`}
            </button>
          </div>
        </div>
      ) : null}

      {/* Filter toggle — practiced-only by default, full CCSS list on demand. */}
      {hiddenCount > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-2 text-xs dark:bg-zinc-900">
          <span className="text-zinc-500">
            {showAll
              ? 'Showing all standards, including not-yet-started.'
              : `Showing ${startedCount} practiced. ${hiddenCount} not started yet, hidden.`}
          </span>
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 font-medium text-zinc-700 hover:bg-zinc-100 active:scale-95 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {showAll ? 'Show practiced only' : 'Show all standards'}
          </button>
        </div>
      )}

      {mathSkills.length === 0 && readingSkills.length === 0 ? (
        <p className="mt-4 rounded-xl bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500 dark:bg-zinc-900">
          No standards practiced yet.{' '}
          <button type="button" onClick={() => setShowAll(true)} className="font-medium text-rose-600 underline dark:text-rose-400">
            Show the full grade-{grade} list
          </button>{' '}
          to see what&rsquo;s ahead.
        </p>
      ) : (
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Math</h3>
          {mathDomains.map(([domain, domainSkills]) => (
            <SkillGroup
              key={domain}
              title={DOMAIN_LABELS[domain] ?? domain}
              skills={domainSkills}
              ksMap={ksMap}
              kidGrade={grade}
              pendingEdits={pendingEdits}
              onEditTier={onEditTier}
            />
          ))}
        </div>
        <div className="flex flex-col gap-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Reading &amp; ELA</h3>
          {readingDomains.map(([domain, domainSkills]) => (
            <SkillGroup
              key={domain}
              title={DOMAIN_LABELS[domain] ?? domain}
              skills={domainSkills}
              ksMap={ksMap}
              kidGrade={grade}
              pendingEdits={pendingEdits}
              onEditTier={onEditTier}
            />
          ))}
        </div>
      </div>
      )}
    </section>
  );
}

const DOMAIN_LABELS: Record<string, string> = {
  counting: 'Counting & Cardinality',
  operations: 'Operations',
  'place-value': 'Place Value',
  fractions: 'Fractions & Decimals',
  measurement: 'Measurement & Data',
  geometry: 'Geometry',
  ratios: 'Ratios & Proportions',
  phonics: 'Phonics & Fluency',
  vocabulary: 'Vocabulary',
  comprehension: 'Reading Comprehension',
  grammar: 'Grammar & Writing',
};

function groupByDomain(skills: Skill[]): [string, Skill[]][] {
  const map = new Map<string, Skill[]>();
  for (const s of skills) {
    const d = s.domain ?? 'other';
    const arr = map.get(d) ?? [];
    arr.push(s);
    map.set(d, arr);
  }
  return Array.from(map.entries());
}

/** Compute status label relative to grade expectations.
 *  The `kidGrade` param is the kid's actual grade label ('K', '1', '2', …).
 *  The skill's `grade_level` tells us which grade this standard targets.
 *  `on_track_tier` tells us what tier is considered "on track."
 *
 *  Important: a skill with ZERO attempts is always "Not started" in grey —
 *  regardless of the default current_tier on the row. This prevents a
 *  freshly-initialized kid_skills row (tier 1 by default) from reading
 *  as green "On track" on K-level skills where on_track_tier = 1, which
 *  made it look like the kid could already do things they hadn't tried. */
function gradeStatus(
  ks: KidSkill | undefined,
  skill: Skill,
  kidGrade: string,
): { label: string; color: string } | null {
  if (!skill.on_track_tier || !skill.grade_level) return null;

  const attempts = ks?.total_attempts ?? 0;
  if (attempts === 0) {
    return { label: 'Not started', color: 'text-zinc-400' };
  }

  const currentTier = ks?.current_tier ?? 1;

  // Is this standard relevant to the kid's grade?
  const grades = skill.grade_level.split('-');
  const gradeOrder = ['K', '1', '2', '3', '4', '5'];
  const kidIdx = gradeOrder.indexOf(kidGrade);
  const skillMinIdx = gradeOrder.indexOf(grades[0]);

  // If the skill is for a higher grade and the kid has practiced it, that's
  // enrichment (above-grade work).
  if (kidIdx < skillMinIdx) {
    return { label: 'Enrichment ✨', color: 'text-violet-600 dark:text-violet-400' };
  }

  // Compare current tier to on_track_tier for at-or-below-grade skills.
  //
  // The MAGNITUDE matters and used to be thrown away: a kid seven tiers above
  // grade level showed the same flat "On track ✓" as one sitting exactly on it,
  // which is the single most interesting thing about them made invisible. Same
  // in the other direction — "Needs practice" said nothing about whether that
  // was one tier or four.
  const delta = currentTier - skill.on_track_tier;
  if (delta > 0) {
    return {
      label: `${delta} above grade level`,
      color: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (delta === 0) {
    return { label: 'On track ✓', color: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (delta === -1) {
    return { label: '1 tier to go', color: 'text-amber-600 dark:text-amber-400' };
  }
  return {
    label: `${-delta} tiers below grade`,
    color: 'text-rose-600 dark:text-rose-400',
  };
}

function SkillGroup({
  title,
  skills,
  ksMap,
  kidGrade,
  pendingEdits,
  onEditTier,
}: {
  title: string;
  skills: Skill[];
  ksMap: Map<string, KidSkill>;
  kidGrade: string;
  pendingEdits: Record<string, number>;
  onEditTier: (skillId: string, tier: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
      <div className="flex flex-col gap-4">
        {skills.map((skill) => {
          const ks = ksMap.get(skill.id);
          // Saved tier from the DB; defaults to 1 so the UI never shows
          // "tier 0" when no kid_skills row exists yet.
          const savedTier = ks?.current_tier ?? 1;
          // Pending tier (if parent has staged a change but not saved).
          const pendingTier = pendingEdits[skill.id];
          const hasPending = pendingTier !== undefined;
          const displayTier = hasPending ? pendingTier : savedTier;

          const mastery = ks?.mastery_pct ?? 0;
          const attempts = ks?.total_attempts ?? 0;
          const started = attempts > 0;
          const status = gradeStatus(ks, skill, kidGrade);

          return (
            <div key={skill.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <span className="text-sm font-medium">{skill.display_name}</span>
                  {!skill.gamifiable ? (
                    <span className="ml-1 text-[10px]" title="Tracked via parent observations — no game template yet">📝</span>
                  ) : null}
                  {skill.standard_code ? (
                    <span className="ml-1 text-[10px] font-mono text-zinc-400" title={skill.standard_desc ?? ''}>
                      {skill.standard_code.split(',')[0]}
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {status ? (
                    <span className={`text-[10px] font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  ) : null}
                  <span className="text-[10px] text-zinc-400">
                    {started ? `${attempts} ses.` : ''}
                  </span>
                </div>
              </div>
              {/* Grade expectation label */}
              {skill.grade_level ? (
                <div className="text-[10px] text-zinc-400">
                  Grade {skill.grade_level} standard
                  {skill.on_track_tier ? ` · on-track at tier ${skill.on_track_tier}` : ''}
                </div>
              ) : null}
              {/* Mastery bar — blank/grey when the kid hasn't practiced yet. */}
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  {started ? (
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(mastery * 100)}%`,
                        background: mastery >= 0.8
                          ? 'var(--brand-mint, #6ee7b7)'
                          : mastery >= 0.5
                            ? 'var(--brand-vanilla, #fde68a)'
                            : 'var(--brand-strawberry, #fb7185)',
                      }}
                    />
                  ) : null}
                </div>
                <span className="w-8 text-right text-xs font-mono text-zinc-500">
                  {started ? `${Math.round(mastery * 100)}%` : '—'}
                </span>
              </div>
              {/* Tier selector — tap a number to STAGE a change; the parent
                  must hit Save at the top of the section to commit. Staged
                  tier shows in amber so the edit state is obvious. */}
              <div className="flex items-center gap-0.5">
                <span className="mr-1 text-[10px] text-zinc-400">Tier</span>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((t) => {
                  const isOnTrack = skill.on_track_tier === t;
                  const isDisplayed = t === displayTier;
                  const isFilled = t <= displayTier;
                  let cls: string;
                  if (isDisplayed && hasPending) {
                    cls = 'bg-amber-500 text-white ring-2 ring-amber-300 dark:bg-amber-400 dark:text-amber-950 dark:ring-amber-700';
                  } else if (isDisplayed) {
                    cls = 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900';
                  } else if (isFilled) {
                    cls = 'bg-zinc-300 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300';
                  } else {
                    cls = 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-600 dark:hover:bg-zinc-800';
                  }
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onEditTier(skill.id, t)}
                      className={`h-5 w-5 rounded text-[10px] font-bold transition-colors ${cls}`}
                      title={`Set ${skill.display_name} to tier ${t}${isOnTrack ? ' (on-track target)' : ''}`}
                      style={isOnTrack ? { outline: '2px solid var(--brand-mint, #6ee7b7)', outlineOffset: '1px' } : undefined}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

type LogEntry =
  | { type: 'attempt'; ts: string; data: Attempt }
  | { type: 'observation'; ts: string; data: Observation };

function ActivityLog({
  attempts,
  observations,
  skillsById,
  onEditObservation,
}: {
  attempts: Attempt[];
  observations: Observation[];
  skillsById: Record<string, Skill>;
  onEditObservation: (id: string, updates: Partial<Observation>) => void;
}) {
  // Merge and sort chronologically (newest first)
  const entries: LogEntry[] = [
    ...attempts.map((a): LogEntry => ({ type: 'attempt', ts: a.created_at, data: a })),
    ...observations.map((o): LogEntry => ({ type: 'observation', ts: o.created_at, data: o })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  if (entries.length === 0) {
    return <p className="mt-3 text-sm text-zinc-500">No activity yet. Play some games!</p>;
  }

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {entries.slice(0, 30).map((entry) => {
        if (entry.type === 'attempt') {
          const a = entry.data;
          const skill = a.skill_id ? skillsById[a.skill_id] : undefined;
          const raw = a.raw_response as Record<string, unknown> | null;
          const eff = typeof raw?.efficiency === 'number' ? raw.efficiency : null;
          return (
            <li
              key={`a-${a.id}`}
              className="flex items-start gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900"
            >
              <span className="mt-0.5 text-lg">🎮</span>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    Game session
                    {skill ? ` · ${skill.display_name}` : ''}
                  </span>
                  <span className="text-xs text-zinc-400">{formatWhen(a.created_at)}</span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {a.correct ? '✅ Passed' : '❌ Struggled'}
                  {eff !== null ? ` · ${Math.round(eff * 100)}% efficiency` : ''}
                  {` · Tier ${a.tier}`}
                </div>
              </div>
            </li>
          );
        }

        // Observation
        const o = entry.data as Observation;
        return (
          <ObservationCard
            key={`o-${o.id}`}
            observation={o}
            skillsById={skillsById}
            onEdit={(updates) => onEditObservation(o.id, updates)}
          />
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Observation card with inline edit
// ---------------------------------------------------------------------------

function ObservationCard({
  observation: o,
  skillsById,
  onEdit,
}: {
  observation: Observation;
  skillsById: Record<string, Skill>;
  onEdit: (updates: Partial<Observation>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(o.body);
  const [saving, setSaving] = useState(false);
  const skill = o.skill_id ? skillsById[o.skill_id] : undefined;

  const handleSave = useCallback(async () => {
    if (!editBody.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/observations/${o.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim() }),
      });
      if (res.ok) {
        onEdit({ body: editBody.trim() });
        setEditing(false);
      }
    } catch (err) {
      console.warn('[edit observation] failed:', err);
    } finally {
      setSaving(false);
    }
  }, [o.id, editBody, onEdit]);

  return (
    <li className="flex items-start gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
      <span className="mt-0.5 text-lg">
        {o.kind === 'homework' ? '📝' : o.kind === 'writing' ? '✏️' : o.kind === 'teacher_report' ? '📋' : '💬'}
      </span>
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            {kindLabel(o.kind as ObservationKind)}
            {skill ? ` · ${skill.display_name}` : ''}
            {o.calibrated_tier !== null ? (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
                → Tier {o.calibrated_tier}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-zinc-400">{formatWhen(o.created_at)}</span>
        </div>
        {o.title ? <div className="mt-0.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">{o.title}</div> : null}

        {editing ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={3}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editBody.trim()}
                className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setEditing(false); setEditBody(o.body); }}
                className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{o.body}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Quick Add Observation — simplified: just textarea + optional photo
// ---------------------------------------------------------------------------

function QuickAddObservation({
  kidId,
  kidName,
  skills,
  onAdded,
}: {
  kidId: string;
  kidName: string;
  skills: Skill[];
  onAdded: (obs: Observation) => void;
}) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  // When the upload endpoint runs the evidence engine, it returns the
  // eventId. We pass this through on the final save so the server can
  // link evidence_events.observation_id to the newly-inserted row.
  const [evidenceEventId, setEvidenceEventId] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<{
    kind?: string;
    title?: string;
    body?: string;
    skillSlug?: string;
    subject?: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const handlePhoto = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kidId', kidId);
      if (body.trim()) fd.append('prompt', body.trim());
      const res = await fetch('/api/observations/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.photoPath) setPhotoPath(data.photoPath);
      if (data.evidenceEventId) setEvidenceEventId(data.evidenceEventId);
      if (data.ok && data.extracted) {
        setAiSuggestion(data.extracted);
        if (data.extracted.body && !body.trim()) setBody(data.extracted.body);
      }
    } catch (err) {
      console.warn('[upload] failed:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [kidId, body]);

  const handleSave = useCallback(async () => {
    if (!body.trim()) return;
    setSaving(true);

    // Build form data for the existing /api/observations POST
    const fd = new URLSearchParams();
    fd.set('kidId', kidId);
    fd.set('kind', aiSuggestion?.kind ?? 'note');
    fd.set('body', body.trim());
    if (aiSuggestion?.title) fd.set('title', aiSuggestion.title);
    if (photoPath) fd.set('photoPath', photoPath);
    if (evidenceEventId) fd.set('evidenceEventId', evidenceEventId);

    // Try to find the skill ID from the AI suggestion
    if (aiSuggestion?.skillSlug) {
      const matched = skills.find(
        (s) => s.name === aiSuggestion.skillSlug &&
          (aiSuggestion.subject === null || aiSuggestion.subject === undefined || s.subject === aiSuggestion.subject),
      );
      if (matched) fd.set('skillId', matched.id);
    }

    try {
      const res = await fetch('/api/observations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fd.toString(),
        redirect: 'manual', // don't follow the 303
      });
      // The server returns 303, which fetch with redirect:manual gives as an opaque redirect.
      // We treat any non-error as success.
      if (res.status < 400 || res.type === 'opaqueredirect') {
        // Optimistic local insert
        const newObs: Observation = {
          id: crypto.randomUUID(),
          kid_id: kidId,
          created_at: new Date().toISOString(),
          kind: (aiSuggestion?.kind as ObservationKind) ?? 'note',
          title: aiSuggestion?.title ?? null,
          body: body.trim(),
          skill_id: null,
          calibrated_tier: null,
          metadata: photoPath ? { photo_path: photoPath } : {},
        };
        onAdded(newObs);
        setBody('');
        setPhotoPath(null);
        setAiSuggestion(null);
        setEvidenceEventId(null);
      }
    } catch (err) {
      console.warn('[add observation] failed:', err);
    } finally {
      setSaving(false);
    }
  }, [kidId, body, photoPath, aiSuggestion, skills, onAdded]);

  return (
    <div className="mt-3 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder={`What's going on with ${kidName}'s learning?`}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
      />

      {aiSuggestion ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-800 dark:bg-violet-950 dark:text-violet-200">
            ✨ AI suggests
          </span>
          {aiSuggestion.kind ? <span className="text-zinc-500">{aiSuggestion.kind}</span> : null}
          {aiSuggestion.skillSlug ? <span className="text-zinc-500">· {aiSuggestion.skillSlug}</span> : null}
          <button
            type="button"
            onClick={() => setAiSuggestion(null)}
            className="text-zinc-400 hover:text-zinc-600"
          >
            ✕ dismiss
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-3">
        <label
          htmlFor={fileInputId}
          className={`cursor-pointer rounded-full border border-violet-300 px-4 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950 ${uploading ? 'opacity-50' : ''}`}
        >
          {uploading ? 'Uploading…' : '📷 Photo'}
        </label>
        <input
          ref={fileRef}
          id={fileInputId}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handlePhoto}
          disabled={uploading}
        />

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !body.trim()}
          className="rounded-full bg-zinc-900 px-5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 active:scale-95 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          style={{ minHeight: 'var(--min-tap-target)' }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback list — kid-submitted tickets with status management
// ---------------------------------------------------------------------------

const FEEDBACK_EMOJI: Record<string, string> = { bug: '🐛', feature: '✨', feedback: '💬' };
const FEEDBACK_LABELS: Record<string, string> = { bug: 'Bug', feature: 'Feature', feedback: 'Feedback' };
const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'done', label: 'Done' },
  { value: 'wontfix', label: "Won't fix" },
];

function FeedbackList({
  tickets,
  onStatusChange,
  onShipNoteChange,
}: {
  tickets: Feedback[];
  onStatusChange: (id: string, status: FeedbackStatus) => void;
  onShipNoteChange: (id: string, shipNote: string | null) => void;
}) {
  const handleStatus = useCallback(
    async (id: string, newStatus: FeedbackStatus) => {
      onStatusChange(id, newStatus);
      try {
        await fetch(`/api/feedback/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch (err) {
        console.warn('[feedback status] failed:', err);
      }
    },
    [onStatusChange],
  );

  return (
    <ul className="mt-3 flex flex-col gap-2">
      {tickets.map((t) => (
        <FeedbackItem
          key={t.id}
          ticket={t}
          onStatusChange={handleStatus}
          onShipNoteChange={onShipNoteChange}
        />
      ))}
    </ul>
  );
}

function FeedbackItem({
  ticket: t,
  onStatusChange,
  onShipNoteChange,
}: {
  ticket: Feedback;
  onStatusChange: (id: string, status: FeedbackStatus) => void;
  onShipNoteChange: (id: string, shipNote: string | null) => void;
}) {
  const [shipNoteDraft, setShipNoteDraft] = useState(t.ship_note ?? '');
  const [savingNote, setSavingNote] = useState(false);

  const handleSaveShipNote = useCallback(async () => {
    const next = shipNoteDraft.trim() || null;
    setSavingNote(true);
    onShipNoteChange(t.id, next);
    try {
      await fetch(`/api/feedback/${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ship_note: next }),
      });
    } catch (err) {
      console.warn('[ship_note] failed:', err);
    } finally {
      setSavingNote(false);
    }
  }, [t.id, shipNoteDraft, onShipNoteChange]);

  const noteChanged = (shipNoteDraft.trim() || null) !== (t.ship_note ?? null);

  return (
    <li className="flex items-start gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-900">
      <span className="mt-0.5 text-lg">{FEEDBACK_EMOJI[t.ticket_type] ?? '💬'}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">
            {FEEDBACK_LABELS[t.ticket_type] ?? 'Feedback'}
            {t.game_slug ? ` · ${t.game_slug}` : ''}
          </span>
          <span className="text-xs text-zinc-400">{formatWhen(t.created_at)}</span>
        </div>
        <div className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{t.title}</div>
        <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{t.summary}</p>
        {t.raw_transcript !== t.title ? (
          <p className="mt-1 text-xs italic text-zinc-400">
            &ldquo;{t.raw_transcript}&rdquo;
          </p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          <select
            value={t.status}
            onChange={(e) => onStatusChange(t.id, e.target.value as FeedbackStatus)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-800"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ship note — the release note the kid will see in /tickets */}
        {t.status === 'done' ? (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-900 dark:bg-emerald-950">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              🚀 Release note (shown to kid)
            </label>
            <textarea
              value={shipNoteDraft}
              onChange={(e) => setShipNoteDraft(e.target.value)}
              placeholder="What shipped? E.g., 'We slowed the fish down by 50%.'"
              rows={2}
              className="mt-1 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-xs dark:border-emerald-800 dark:bg-zinc-900"
            />
            {noteChanged ? (
              <button
                type="button"
                onClick={handleSaveShipNote}
                disabled={savingNote}
                className="mt-1 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingNote ? 'Saving…' : 'Save note'}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
