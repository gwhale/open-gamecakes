// Shared token-ledger presentation — the single source of truth for how a
// `token_transactions.reason` renders. Used by BOTH the parent wallet admin
// (/parent/tokens) and the kid-facing Cakey Store profile so the two ledgers
// never drift apart.
//
// Keep the `milestone` entry in sync with the reason CHECK enum in
// supabase/migrations/0026_token_milestones.sql.

export const REASON_EMOJI: Record<string, string> = {
  session_drip: '🎮',
  tier_up: '⭐',
  milestone: '🏅',
  region_unlock: '🗺️',
  parent_grant: '🎁',
  cupcake_unlock: '🧁',
  land_upgrade: '🏰',
  // Transport fares. Without these the parent ledger renders the raw enum
  // ("ferry_ride"), which is how it read before Race Island added a second one.
  ferry_ride: '⛴️',
  bus_ride: '🚌',
  vehicle_rental: '🛹',
};

export const REASON_LABEL: Record<string, string> = {
  session_drip: 'win',
  tier_up: 'level up',
  milestone: 'grade level',
  region_unlock: 'unlock',
  parent_grant: 'gift',
  cupcake_unlock: 'store',
  land_upgrade: 'land',
  ferry_ride: 'ferry',
  bus_ride: 'bus',
  vehicle_rental: 'ride rental',
};

/** Emoji for a ledger row. A negative `parent_grant` is a parent REMOVAL,
 *  not a gift, so it gets its own glyph. */
export function reasonEmoji(reason: string, delta: number): string {
  if (reason === 'parent_grant' && delta < 0) return '↩️';
  return REASON_EMOJI[reason] ?? '·';
}

/** Kid/parent-facing label for a ledger row (mirrors reasonEmoji). */
export function reasonLabel(reason: string, delta: number): string {
  if (reason === 'parent_grant' && delta < 0) return 'removed';
  return REASON_LABEL[reason] ?? reason;
}

/** Short, absolute date+time for a ledger row. */
export function formatLedgerDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
