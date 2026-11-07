// Reads what the operator page needs, across every family. Uses the secret key
// because crossing families is the point; only call this after
// requireSuperAdminPage.
//
// Reads only. Nothing here writes, and the page has no forms.

import { GRADE_LABELS, currentGradeOf } from '@/lib/kids/grade';
import { emailToLogin } from '@/lib/auth/login-name';
import { GUEST_KID_ID } from '@/lib/auth/guest';
import { supabaseServer } from '@/lib/supabase/server';
import { buildOverview, type Overview } from './overview';

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
  const users: { id: string; login: string | null; last_sign_in_at: string | null }[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(`users: ${error.message}`);
    for (const u of data.users) {
      users.push({
        id: u.id,
        login: u.email ? emailToLogin(u.email) : null,
        last_sign_in_at: u.last_sign_in_at ?? null,
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

export async function loadOverview(now: Date = new Date()): Promise<Overview> {
  const sb = supabaseServer();
  const since = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();

  const [families, users, kidRows, recentRounds, positions, balances, tickets] = await Promise.all([
    pageAll<{ id: string; name: string; owner_user_id: string | null; created_at: string; tier: string }>(
      'families',
      (a, b) => sb.from('families').select('id, name, owner_user_id, created_at, tier').order('id').range(a, b),
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
    pageAll<{ kid_id: string; game_slug: string | null; created_at: string }>('attempts', (a, b) =>
      sb
        .from('attempts')
        .select('kid_id, game_slug, created_at')
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

  return buildOverview({ families, users, kids, kidStats, recentRounds, positions, balances, tickets, now });
}
