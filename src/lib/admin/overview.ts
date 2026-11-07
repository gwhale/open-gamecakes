// Turns raw rows into what the operator page shows. Pure, so the arithmetic and
// the alert rules can be tested without a database.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A position saved this recently counts as "in the town now". */
export const SEEN_NOW_MS = 10 * MINUTE;
/** Rounds stopping for this long, while kids are still around, raises an alert. */
export const ROUND_GAP_ALERT_MS = 7 * DAY;

export interface FamilyInput {
  id: string;
  name: string;
  owner_user_id: string | null;
  created_at: string;
  tier: string;
}
export interface UserInput {
  id: string;
  login: string | null;
  last_sign_in_at: string | null;
}
export interface KidInput {
  id: string;
  family_id: string;
  name: string;
  grade: string;
}
export interface KidStatsInput {
  kid_id: string;
  /** All-time count of rounds. */
  rounds: number;
  last_round_at: string | null;
}
export interface RecentRoundInput {
  kid_id: string;
  game_slug: string | null;
  created_at: string;
}
export interface PositionInput {
  kid_id: string;
  updated_at: string;
}
export interface BalanceInput {
  kid_id: string;
  balance: number;
}
export interface TicketInput {
  family_id: string | null;
  status: string;
}

export interface OverviewInput {
  families: FamilyInput[];
  users: UserInput[];
  kids: KidInput[];
  kidStats: KidStatsInput[];
  /** Rounds from the last 30 days. */
  recentRounds: RecentRoundInput[];
  positions: PositionInput[];
  balances: BalanceInput[];
  tickets: TicketInput[];
  now: Date;
}

export interface KidRow {
  id: string;
  name: string;
  grade: string;
  rounds: number;
  rounds7d: number;
  lastRoundAt: string | null;
  lastSeenAt: string | null;
  seenNow: boolean;
  balance: number;
}
export interface FamilyRow {
  id: string;
  name: string;
  login: string | null;
  tier: string;
  createdAt: string;
  lastSignInAt: string | null;
  lastActiveAt: string | null;
  rounds: number;
  rounds7d: number;
  openTickets: number;
  kids: KidRow[];
}
export interface Totals {
  families: number;
  kids: number;
  familiesWithoutKids: number;
  newFamilies7d: number;
  signIns7d: number;
  seenNow: number;
  seen7d: number;
  rounds7d: number;
  rounds30d: number;
  openTickets: number;
}
export interface GameCount {
  slug: string;
  rounds: number;
}
export interface Overview {
  totals: Totals;
  /** Newest signups first. */
  families: FamilyRow[];
  topGames30d: GameCount[];
  lastRoundAt: string | null;
  /** True when kids are around but no round has landed for a while. */
  roundsLooksStuck: boolean;
}

function within(iso: string | null | undefined, ms: number, now: Date): boolean {
  return !!iso && now.getTime() - Date.parse(iso) <= ms;
}

/** Later of two timestamps. Compares as dates because Postgres and auth format
 *  the same instant differently. */
function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

export function buildOverview(input: OverviewInput): Overview {
  const { now } = input;
  const usersById = new Map(input.users.map((u) => [u.id, u]));
  const statsByKid = new Map(input.kidStats.map((s) => [s.kid_id, s]));
  const seenByKid = new Map(input.positions.map((p) => [p.kid_id, p.updated_at]));
  const balanceByKid = new Map(input.balances.map((b) => [b.kid_id, b.balance]));
  const kidIds = new Set(input.kids.map((k) => k.id));

  const rounds7dByKid = new Map<string, number>();
  const gameCounts = new Map<string, number>();
  let rounds7d = 0;
  let rounds30d = 0;
  for (const r of input.recentRounds) {
    // Rounds by a kid not listed (the shared Guest fixture) are not a family's.
    if (!kidIds.has(r.kid_id)) continue;
    rounds30d += 1;
    if (r.game_slug) gameCounts.set(r.game_slug, (gameCounts.get(r.game_slug) ?? 0) + 1);
    if (within(r.created_at, 7 * DAY, now)) {
      rounds7d += 1;
      rounds7dByKid.set(r.kid_id, (rounds7dByKid.get(r.kid_id) ?? 0) + 1);
    }
  }

  const openByFamily = new Map<string, number>();
  let openTickets = 0;
  for (const t of input.tickets) {
    if (t.status === 'done' || t.status === 'wontfix') continue;
    openTickets += 1;
    if (t.family_id) openByFamily.set(t.family_id, (openByFamily.get(t.family_id) ?? 0) + 1);
  }

  const kidsByFamily = new Map<string, KidRow[]>();
  for (const k of input.kids) {
    const stats = statsByKid.get(k.id);
    const seen = seenByKid.get(k.id) ?? null;
    const row: KidRow = {
      id: k.id,
      name: k.name,
      grade: k.grade,
      rounds: stats?.rounds ?? 0,
      rounds7d: rounds7dByKid.get(k.id) ?? 0,
      lastRoundAt: stats?.last_round_at ?? null,
      lastSeenAt: seen,
      seenNow: within(seen, SEEN_NOW_MS, now),
      balance: balanceByKid.get(k.id) ?? 0,
    };
    kidsByFamily.set(k.family_id, [...(kidsByFamily.get(k.family_id) ?? []), row]);
  }

  const families: FamilyRow[] = input.families
    .map((f) => {
      const kids = kidsByFamily.get(f.id) ?? [];
      const user = f.owner_user_id ? usersById.get(f.owner_user_id) : undefined;
      const lastSignInAt = user?.last_sign_in_at ?? null;
      return {
        id: f.id,
        name: f.name,
        login: user?.login ?? null,
        tier: f.tier,
        createdAt: f.created_at,
        lastSignInAt,
        lastActiveAt: kids.reduce<string | null>(
          (acc, k) => latest(latest(acc, k.lastSeenAt), k.lastRoundAt),
          lastSignInAt,
        ),
        rounds: kids.reduce((n, k) => n + k.rounds, 0),
        rounds7d: kids.reduce((n, k) => n + k.rounds7d, 0),
        openTickets: openByFamily.get(f.id) ?? 0,
        kids,
      };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const allKids = families.flatMap((f) => f.kids);
  const seen7d = allKids.filter((k) => within(k.lastSeenAt, 7 * DAY, now)).length;
  const lastRoundAt = allKids.reduce<string | null>((acc, k) => latest(acc, k.lastRoundAt), null);

  return {
    totals: {
      families: families.length,
      kids: allKids.length,
      familiesWithoutKids: families.filter((f) => f.kids.length === 0).length,
      newFamilies7d: families.filter((f) => within(f.createdAt, 7 * DAY, now)).length,
      signIns7d: families.filter((f) => within(f.lastSignInAt, 7 * DAY, now)).length,
      seenNow: allKids.filter((k) => k.seenNow).length,
      seen7d,
      rounds7d,
      rounds30d,
      openTickets,
    },
    families,
    topGames30d: [...gameCounts.entries()]
      .map(([slug, rounds]) => ({ slug, rounds }))
      .sort((a, b) => b.rounds - a.rounds || a.slug.localeCompare(b.slug))
      .slice(0, 5),
    lastRoundAt,
    roundsLooksStuck:
      seen7d > 0 && (!lastRoundAt || now.getTime() - Date.parse(lastRoundAt) > ROUND_GAP_ALERT_MS),
  };
}

/** "just now", "12 min ago", "3 hr ago", "5 days ago", or "never". */
export function timeAgo(iso: string | null, now: Date): string {
  if (!iso) return 'never';
  const ms = now.getTime() - Date.parse(iso);
  if (ms < MINUTE) return 'just now';
  if (ms < 60 * MINUTE) return `${Math.floor(ms / MINUTE)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / (60 * MINUTE))} hr ago`;
  const days = Math.floor(ms / DAY);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}
