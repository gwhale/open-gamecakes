// Reads what the operator page needs, across every family. Uses the secret key
// because crossing families is the point; only call this after
// requireSuperAdminPage.
//
// Reads only. Nothing here writes.

import { GRADE_LABELS, currentGradeOf } from '@/lib/kids/grade';
import { emailToLogin } from '@/lib/auth/login-name';
import { GUEST_KID_ID } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { buildOverview, type Overview } from './overview';
import { buildUsage, type Usage } from './usage';
import { sortDecisions, type DecisionRow } from './decisions';

const PAGE = 1000;
/** A runaway table should make the page incomplete, not take the function down. */
const MAX_PAGES = 50;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Sb = ReturnType<typeof supabaseServer>;

/** PostgREST caps one select at 1,000 rows, so a plain select quietly undercounts. */
async function pageAll<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await fetchPage(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
  return rows;
}

async function loadUsers(sb: Sb) {
  const users: { id: string; login: string | null; last_sign_in_at: string | null; real_email: string | null }[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`users: ${error.message}`);
    for (const u of data.users) {
      const login = u.email ? emailToLogin(u.email) : null;
      users.push({
        id: u.id,
        login,
        last_sign_in_at: u.last_sign_in_at ?? null,
        // An address that is not one made from a login name is a real inbox.
        real_email: u.email && login === null ? u.email : null,
      });
    }
    if (data.users.length < PAGE) break;
  }
  return users;
}

/** All-time round count and latest round, one kid at a time so no row limit
 *  applies. Two small indexed queries per kid is fine at this size; replace it
 *  with an aggregate view if the deployment reaches hundreds of kids. */
async function loadKidStats(sb: Sb, kidIds: string[]) {
  return Promise.all(
    kidIds.map(async (kid_id) => {
      const [count, last] = await Promise.all([
        sb.from('attempts').select('id', { count: 'exact', head: true }).eq('kid_id', kid_id),
        sb
          .from('attempts')
          .select('created_at')
          .eq('kid_id', kid_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (count.error) throw new Error(`attempt count: ${count.error.message}`);
      if (last.error) throw new Error(`last attempt: ${last.error.message}`);
      return {
        kid_id,
        rounds: count.count ?? 0,
        last_round_at: (last.data?.created_at as string | undefined) ?? null,
      };
    }),
  );
}

export interface AdminActionRow {
  id: string;
  action: string;
  created_at: string;
  family_id: string | null;
  detail: string | null;
}

/** Every community and which families are in it, oldest first. */
export async function loadCommunities(): Promise<{ id: string; name: string; familyIds: string[] }[]> {
  const { data, error } = await supabaseServer()
    .from('communities')
    .select('id, name, community_families(family_id)')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`communities: ${error.message}`);
  return ((data ?? []) as unknown as { id: string; name: string; community_families: { family_id: string }[] }[]).map(
    (row) => ({ id: row.id, name: row.name, familyIds: row.community_families.map((member) => member.family_id) }),
  );
}

export interface AdminTicketRow {
  id: string;
  kid_id: string;
  family_id: string | null;
  game_slug: string | null;
  ticket_type: string;
  title: string;
  summary: string;
  raw_transcript: string;
  status: string;
  ship_note: string | null;
  created_at: string;
}

/** Every family's tickets, newest first. Capped: the list is for working the
 *  queue, and 300 is months of tickets at today's pace. */
export const ADMIN_TICKET_LIMIT = 300;
export async function loadTickets(): Promise<AdminTicketRow[]> {
  const { data, error } = await supabaseServer()
    .from('feedback')
    .select('id, kid_id, family_id, game_slug, ticket_type, title, summary, raw_transcript, status, ship_note, created_at')
    .order('created_at', { ascending: false })
    .limit(ADMIN_TICKET_LIMIT);
  if (error) throw new Error(`tickets: ${error.message}`);
  return (data ?? []) as AdminTicketRow[];
}

/** Every decision, open ones first (see decisions.ts). */
export async function loadDecisions(): Promise<DecisionRow[]> {
  const { data, error } = await supabaseServer()
    .from('admin_decisions')
    .select('id, title, why, steps, options, recommended, tags, link, status, answer, note, answered_at, created_at')
    .neq('status', 'dropped')
    .limit(200);
  if (error) throw new Error(`decisions: ${error.message}`);
  return sortDecisions((data ?? []) as DecisionRow[]);
}

/** The last things the operator changed, newest first. */
export async function loadAdminActions(): Promise<AdminActionRow[]> {
  const { data, error } = await supabaseServer()
    .from('admin_actions')
    .select('id, action, created_at, family_id, detail')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(`admin_actions: ${error.message}`);
  return (data ?? []) as AdminActionRow[];
}

export async function loadOverview(now: Date = new Date()): Promise<Overview & { usage: Usage }> {
  const sb = supabaseServer();
  const since = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();

  const [families, users, kidRows, recentRounds, positions, balances, tickets] = await Promise.all([
    pageAll<{
      id: string;
      name: string;
      owner_user_id: string | null;
      created_at: string;
      tier: string;
      contact_email: string | null;
      digest_emails: string[] | null;
    }>('families', (a, b) =>
      sb.from('families').select('id, name, owner_user_id, created_at, tier, contact_email, digest_emails').order('id').range(a, b),
    ),
    loadUsers(sb),
    pageAll<{ id: string; family_id: string; name: string; grade: number | null; grade_year: number | null }>(
      'kids',
      (a, b) =>
        sb
          .from('kids')
          .select('id, family_id, name, grade, grade_year')
          .neq('id', GUEST_KID_ID)
          .order('created_at')
          .order('id')
          .range(a, b),
    ),
    pageAll<{
      kid_id: string;
      game_slug: string | null;
      created_at: string;
      correct: boolean | null;
      response_time_ms: number | null;
    }>('attempts', (a, b) =>
      sb
        .from('attempts')
        .select('kid_id, game_slug, created_at, correct, response_time_ms')
        .gte('created_at', since)
        .order('id')
        .range(a, b),
    ),
    pageAll<{ kid_id: string; updated_at: string }>('positions', (a, b) =>
      sb.from('kid_avatar_position').select('kid_id, updated_at').order('kid_id').range(a, b),
    ),
    pageAll<{ kid_id: string; balance: number }>('balances', (a, b) =>
      sb.from('kid_tokens').select('kid_id, balance').order('kid_id').range(a, b),
    ),
    pageAll<{ family_id: string | null; status: string }>('tickets', (a, b) =>
      sb.from('feedback').select('family_id, status').order('id').range(a, b),
    ),
  ]);

  const kids = kidRows.map((k) => {
    const grade = currentGradeOf(k, now);
    return {
      id: k.id,
      family_id: k.family_id,
      name: k.name,
      grade: grade == null ? 'not set' : (GRADE_LABELS.at(grade) ?? String(grade)),
    };
  });
  const kidStats = await loadKidStats(sb, kids.map((k) => k.id));

  return {
    ...buildOverview({ families, users, kids, kidStats, recentRounds, positions, balances, tickets, now }),
    usage: buildUsage({ answers: recentRounds, kids, families, now }),
  };
}
